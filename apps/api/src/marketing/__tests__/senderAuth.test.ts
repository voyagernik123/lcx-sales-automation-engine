import { describe, expect, it } from 'vitest';
import {
  authResults,
  headerPairs,
  readSenderEvidence,
} from '../xMail.js';
import { verifySender } from '../provenanceLadder.js';

/**
 * M0 DEFECT 1 — THE INGEST WAS FORGEABLE, AND IT WAS THE WORST DEFECT IN THE MODULE.
 *
 * What shipped: `fetchNotificationEmails` searched `{seen: false}` with no sender
 * condition, fetched `envelope` and read only `subject` and `date` out of it, and
 * `RawEmail` had no `from` field at all. So anyone who learned the polled mailbox
 * address could send it an email containing one `x.com/<handle>/status/<digits>`
 * permalink and one line of prose, and get a queue row with an attacker-chosen
 * handle, comment id, display name and 4,000-character body — graded `C3` "fairly
 * reliable", rendered identically to a real reply, and fed to the drafter.
 *
 * WHY A `From:` TEST WOULD NOT HAVE FIXED IT. The arrangement is a forwarding rule,
 * so SPF fails by construction (the forwarder is the sender) and `From:` is free
 * text. Acceptance has to rest on evidence that survives a hop: a DKIM pass whose
 * `d=` is X-owned, or an ARC chain reporting one, as reported by the mail provider
 * LCX owns — RFC 8601 §5's rule that a consumer trusts only the
 * `Authentication-Results` field its own ADMD added is what makes that safe.
 *
 * These fixtures are hand-built to the shape RFC 8601 specifies, not captured from
 * live mail. Two facts remain unverified and are the deployment's to check, exactly
 * as mkt-r5 §1.1 says: which `d=` domain X's notification mail signs with today, and
 * whether the destination provider seals ARC. The design is such that not knowing
 * either produces quarantine, never acceptance.
 */

const ANCHOR = 'mx.lcxmail.example';

function message(headers: readonly string[], body = 'a reply body'): string {
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

const X_DKIM_PASS = [
  'Received: by mx.lcxmail.example with SMTP id abc123; Thu, 30 Jul 2026 09:15:02 +0000',
  `Authentication-Results: ${ANCHOR};`,
  '\tdkim=pass header.d=x.com header.b=Ab1Cd2Ef;',
  '\tspf=fail (domain of bounce.x.com does not designate the forwarder) smtp.mailfrom=bounce.x.com;',
  '\tdmarc=fail (p=NONE sp=NONE dis=NONE) header.from=x.com',
  'From: X <info@x.com>',
  'Subject: Crypto Curious (@cryptocurious) replied to your post',
];

describe('the header block is read in order, and stops at the body', () => {
  it('unfolds continuation lines into the field above them', () => {
    const pairs = headerPairs(message(X_DKIM_PASS));
    const ar = pairs.filter(([n]) => n === 'authentication-results');
    expect(ar).toHaveLength(1);
    expect(ar[0]![1]).toContain('dkim=pass header.d=x.com');
    expect(ar[0]![1]).toContain('dmarc=fail');
  });

  it('ignores a header block forged INSIDE the body', () => {
    // The obvious evasion: write the trusted field again, after the blank line.
    const src = message(
      ['Received: by mx.lcxmail.example with SMTP id abc123', 'From: X <info@x.com>'],
      `Authentication-Results: ${ANCHOR}; dkim=pass header.d=x.com\r\n\r\nnice try`,
    );
    const reading = readSenderEvidence(src, ANCHOR);
    expect(reading.evidence.dkimPass).toBe(false);
    expect(reading.evidence.rawAuthenticationResults).toBeNull();
    expect(verifySender(reading.evidence).authenticated).toBe(false);
  });
});

describe('one Authentication-Results field can carry several DKIM results', () => {
  it('pairs each result with its own d=, rather than searching for the substring', () => {
    const parsed = authResults(
      'dkim=fail header.d=x.com header.b=zz; dkim=pass header.d=forwarder.example; arc=none',
    );
    expect(parsed).toEqual([
      { method: 'dkim', result: 'fail', domain: 'x.com' },
      { method: 'dkim', result: 'pass', domain: 'forwarder.example' },
      { method: 'arc', result: 'none', domain: null },
    ]);
  });

  it('does not accept a pass that belongs to the FORWARDER', () => {
    // The realistic near-miss, and the one a `.includes('dkim=pass')` check accepts:
    // X's signature broke on the hop and the forwarder signed the rewritten body.
    const reading = readSenderEvidence(
      message([
        'Received: by mx.lcxmail.example with SMTP id abc123',
        `Authentication-Results: ${ANCHOR}; dkim=fail header.d=x.com; dkim=pass header.d=forwarder.example`,
        'From: X <info@x.com>',
      ]),
      ANCHOR,
    );
    expect(reading.evidence.dkimPass).toBe(false);
    expect(verifySender(reading.evidence)).toEqual({
      authenticated: false,
      code: 'MKT_PROV_SENDER_UNVERIFIED',
    });
  });
});

describe('acceptance rests on an X DKIM pass reported by the provider LCX owns', () => {
  it('accepts a surviving X signature', () => {
    const reading = readSenderEvidence(message(X_DKIM_PASS), ANCHOR);
    expect(reading.evidence.dkimPass).toBe(true);
    expect(reading.evidence.dkimDomain).toBe('x.com');
    expect(verifySender(reading.evidence)).toEqual({ authenticated: true, via: 'dkim' });
    // The evidence is kept verbatim, not summarised away.
    expect(reading.evidence.rawAuthenticationResults).toContain('dkim=pass header.d=x.com');
  });

  it('accepts a subdomain of an X signing domain', () => {
    const reading = readSenderEvidence(
      message([
        'Received: by mx.lcxmail.example with SMTP id abc123',
        `Authentication-Results: ${ANCHOR}; dkim=pass header.d=e.twitter.com`,
      ]),
      ANCHOR,
    );
    expect(verifySender(reading.evidence)).toEqual({ authenticated: true, via: 'dkim' });
  });

  it('rejects a pass from a look-alike domain', () => {
    const reading = readSenderEvidence(
      message([
        'Received: by mx.lcxmail.example with SMTP id abc123',
        `Authentication-Results: ${ANCHOR}; dkim=pass header.d=x.com.evil.example`,
      ]),
      ANCHOR,
    );
    expect(reading.evidence.dkimPass).toBe(false);
  });

  it('carries the From: header as evidence and never as authority', () => {
    const reading = readSenderEvidence(
      message([
        'Received: by mx.lcxmail.example with SMTP id abc123',
        'From: X <info@x.com>',
        'Subject: fabricated',
      ]),
      ANCHOR,
    );
    // A perfect From: and nothing else authenticates nothing at all.
    expect(reading.from).toBe('X <info@x.com>');
    expect(reading.evidence.dkimPass).toBe(false);
    expect(reading.evidence.arcPass).toBe(false);
  });
});

describe('the trust anchor is the whole scheme, so its absence is not a pass', () => {
  it('authenticates nothing when no authserv-id is configured', () => {
    const reading = readSenderEvidence(message(X_DKIM_PASS), '');
    expect(reading.noTrustAnchor).toBe(true);
    expect(reading.evidence.dkimPass).toBe(false);
    expect(reading.evidence.rawAuthenticationResults).toBeNull();
    expect(verifySender(reading.evidence).authenticated).toBe(false);
  });

  it('ignores a field added by an ADMD we did not name (RFC 8601 §5)', () => {
    const reading = readSenderEvidence(
      message([
        'Received: by mx.lcxmail.example with SMTP id abc123',
        'Authentication-Results: some.other.relay.example; dkim=pass header.d=x.com',
      ]),
      ANCHOR,
    );
    expect(reading.evidence.dkimPass).toBe(false);
  });

  it('counts a field impersonating our own authserv-id, so the attempt is on the record', () => {
    // The forger's copy sits BELOW the one our provider prepended, so the topmost
    // field still governs — and the duplicate is itself the hostile signal, because a
    // legitimate hop has no reason to write our provider's identifier.
    const reading = readSenderEvidence(
      message([
        'Received: by mx.lcxmail.example with SMTP id abc123',
        `Authentication-Results: ${ANCHOR}; dkim=fail header.d=x.com; spf=fail`,
        'Received: from evil.example by mx.lcxmail.example',
        `Authentication-Results: ${ANCHOR}; dkim=pass header.d=x.com`,
        'From: X <info@x.com>',
      ]),
      ANCHOR,
    );
    expect(reading.impersonatedAuthservFields).toBe(1);
    expect(reading.evidence.dkimPass).toBe(false);
  });
});

describe('ARC is read at the hop that saw the message before it was forwarded', () => {
  const ARC_CHAIN = [
    'Received: by mx.lcxmail.example with SMTP id abc123',
    `Authentication-Results: ${ANCHOR}; dkim=fail header.d=x.com; arc=pass (i=2 spf=pass dkim=pass)`,
    'ARC-Seal: i=2; a=rsa-sha256; d=mx.lcxmail.example; s=arc; b=seal2',
    'ARC-Message-Signature: i=2; a=rsa-sha256; d=mx.lcxmail.example; s=arc; b=msg2',
    'ARC-Authentication-Results: i=2; mx.lcxmail.example; dkim=fail header.d=x.com',
    'ARC-Seal: i=1; a=rsa-sha256; d=first.hop.example; s=arc; b=seal1',
    'ARC-Authentication-Results: i=1; first.hop.example;',
    '\tdkim=pass header.d=x.com header.b=Ab1Cd2Ef;',
    '\tspf=pass smtp.mailfrom=bounce.x.com',
    'From: X <info@x.com>',
  ];

  it('reads instance 1, not the latest instance', () => {
    // Instance 2 records what a forwarder saw AFTER the body was rewritten — reading
    // it would read the wrong hop and conclude X's signature failed.
    const reading = readSenderEvidence(message(ARC_CHAIN), ANCHOR);
    expect(reading.evidence.arcPass).toBe(true);
    expect(reading.evidence.dkimDomain).toBe('x.com');
  });

  it('names the LAST sealer, because that is the hop LCX can vouch for', () => {
    const reading = readSenderEvidence(message(ARC_CHAIN), ANCHOR);
    expect(reading.evidence.arcSealerDomain).toBe('mx.lcxmail.example');
  });

  it('does not authenticate an ARC chain whose sealer this deployment has not named', () => {
    const reading = readSenderEvidence(message(ARC_CHAIN), ANCHOR);
    expect(verifySender(reading.evidence, [])).toEqual({
      authenticated: false,
      code: 'MKT_PROV_ARC_SEALER_UNTRUSTED',
    });
    expect(verifySender(reading.evidence, ['mx.lcxmail.example'])).toEqual({
      authenticated: true,
      via: 'arc',
    });
  });

  it('refuses an ARC chain our provider did not say was intact', () => {
    const broken = ARC_CHAIN.map((h) =>
      h.startsWith('Authentication-Results')
        ? `Authentication-Results: ${ANCHOR}; dkim=fail header.d=x.com; arc=fail (chain broken)`
        : h,
    );
    const reading = readSenderEvidence(message(broken), ANCHOR);
    expect(reading.evidence.arcPass).toBe(false);
    expect(verifySender(reading.evidence, ['mx.lcxmail.example']).authenticated).toBe(false);
  });

  it('refuses an intact chain whose originating hop reports no X pass', () => {
    // arc=pass says the chain was not tampered with. It says nothing about what the
    // first hop saw — which is the whole point of reading instance 1 separately.
    const noXPass = ARC_CHAIN.map((h) =>
      h.includes('dkim=pass header.d=x.com header.b=Ab1Cd2Ef')
        ? '\tdkim=pass header.d=newsletter.example;'
        : h,
    );
    const reading = readSenderEvidence(message(noXPass), ANCHOR);
    expect(reading.evidence.arcPass).toBe(false);
  });
});
