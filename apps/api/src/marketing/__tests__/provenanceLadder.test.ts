import { describe, it, expect } from 'vitest';
import { RELIABILITY_LABEL } from '@lcx/shared';
import type { OEmbedResult, SyndicationObservation } from '../oembed.js';
import {
  compareText,
  FORBIDDEN_DERIVATIONS,
  gradeInboundBatch,
  gradeInboundItem,
  isForbiddenDerivation,
  isXSigningDomain,
  LADDER,
  lowerBoundLabel,
  QUARANTINE,
  refuseForbiddenMetric,
  verifySender,
  type InboundItem,
  type SenderAuthEvidence,
} from '../provenanceLadder.js';

const POST_ID = '2083596900754997727';
const TEXT = 'ETH deposits are live and withdrawals resume today, details on our status page';

const dkimOk: SenderAuthEvidence = {
  dkimPass: true,
  dkimDomain: 'e.twitter.com',
  arcPass: false,
  arcSealerDomain: null,
  rawAuthenticationResults: 'dkim=pass header.d=e.twitter.com',
};

function confirmedOEmbed(over: Partial<NonNullable<OEmbedResult['post']>> = {}): OEmbedResult {
  return {
    status: 'confirmed',
    code: 'CONFIRMED',
    message: 'X returned this post and its text.',
    fetchedAt: '2026-08-02T10:00:00.000Z',
    httpStatus: 200,
    requestedUrl: `https://x.com/alice/status/${POST_ID}`,
    post: {
      postId: POST_ID,
      authorHandle: 'alice',
      authorName: 'Alice',
      text: TEXT,
      lang: 'en',
      postedOnDisplayed: '2026-08-01',
      postedOnRaw: 'August 1, 2026',
      canonicalUrl: `https://x.com/alice/status/${POST_ID}`,
      ...over,
    },
  };
}

const unknownOEmbed: OEmbedResult = {
  status: 'unknown',
  code: 'CHANNEL_TIMEOUT',
  message: 'The corroboration channel timed out. Nothing was learned about this post.',
  post: null,
  fetchedAt: '2026-08-02T10:00:00.000Z',
  httpStatus: null,
  requestedUrl: `https://x.com/alice/status/${POST_ID}`,
};

const notPublicOEmbed: OEmbedResult = { ...unknownOEmbed, status: 'not_public', code: 'POST_NOT_FOUND' };

function emailItem(over: Partial<InboundItem> = {}): InboundItem {
  return {
    itemId: 'row-1',
    channel: 'x_notification_email',
    claimedAuthorHandle: 'alice',
    claimedPostId: POST_ID,
    claimedText: TEXT,
    receivedAt: '2026-08-02T09:00:00.000Z',
    sender: dkimOk,
    oembed: null,
    syndication: null,
    operator: null,
    mirrorHost: null,
    ...over,
  };
}

describe('sender authentication is the floor of the ladder', () => {
  it('accepts a surviving X DKIM signature, including a subdomain', () => {
    expect(isXSigningDomain('e.twitter.com')).toBe(true);
    expect(isXSigningDomain('x.com')).toBe(true);
    expect(isXSigningDomain('twitter.com.evil.example')).toBe(false);
    expect(isXSigningDomain(null)).toBe(false);
    expect(verifySender(dkimOk)).toEqual({ authenticated: true, via: 'dkim' });
  });

  it('refuses ARC evidence when no trusted sealer is configured, and accepts it when one is', () => {
    const arc: SenderAuthEvidence = {
      dkimPass: false,
      dkimDomain: 'x.com',
      arcPass: true,
      arcSealerDomain: 'mail.lcx.com',
      rawAuthenticationResults: 'arc=pass',
    };
    expect(verifySender(arc)).toEqual({ authenticated: false, code: 'MKT_PROV_ARC_SEALER_UNTRUSTED' });
    expect(verifySender(arc, ['mail.lcx.com'])).toEqual({ authenticated: true, via: 'arc' });
    expect(verifySender(arc, ['someone.else'])).toEqual({ authenticated: false, code: 'MKT_PROV_ARC_SEALER_UNTRUSTED' });
  });

  it('quarantines an unauthenticated notification with NO grade at all', () => {
    const v = gradeInboundItem(emailItem({ sender: null }));
    expect(v.state).toBe('quarantined');
    expect(v.grade).toBeNull();
    if (v.state !== 'quarantined') throw new Error('unreachable');
    expect(v.code).toBe('MKT_PROV_SENDER_UNVERIFIED');
    expect(v.storableText).toBeNull();
    expect(v.rule).toMatch(/mkt-r5/);
    // quarantine must not borrow a rung's identity
    expect(Object.keys(LADDER)).not.toContain(v.code);
  });

  it('a DKIM pass signed by someone other than X is not authentication', () => {
    const v = gradeInboundItem(emailItem({ sender: { ...dkimOk, dkimDomain: 'mailer.attacker.example' } }));
    expect(v.state).toBe('quarantined');
  });
});

describe('the rungs', () => {
  it('email + independent oEmbed confirmation with consistent text is the top rung, B1', () => {
    const v = gradeInboundItem(emailItem({ oembed: confirmedOEmbed() }));
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.rung).toBe('email_oembed_confirmed');
    expect(v.grade.code).toBe('B1');
    expect(v.grade.label).toContain(RELIABILITY_LABEL.B);
    expect(v.confirmedAuthorHandle).toBe('alice');
    expect(v.textComparison?.verdict).toBe('consistent');
    expect(v.corroborations.some((c) => c.channel === 'oembed' && c.outcome === 'supported')).toBe(true);
    expect(v.senderEvidence?.rawAuthenticationResults).toBe('dkim=pass header.d=e.twitter.com');
  });

  it('an authenticated email whose text diverges is graded down and flagged, not quarantined', () => {
    const v = gradeInboundItem(emailItem({ claimedText: 'send your seed phrase to this telegram group right now friend' , oembed: confirmedOEmbed() }));
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.rung).toBe('email_text_diverged');
    expect(v.grade.code).toBe('C4');
    expect(v.needsHumanRead).toBe(true);
  });

  it('a text too short to compare does not claim confirmation', () => {
    const v = gradeInboundItem(emailItem({ claimedText: 'ok', oembed: confirmedOEmbed() }));
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.rung).toBe('email_oembed_text_not_comparable');
    expect(v.grade.credibility).toBe(2);
  });

  it('an author X disagrees with is quarantined — attribution, not phrasing', () => {
    const v = gradeInboundItem(emailItem({ oembed: confirmedOEmbed({ authorHandle: 'someone_else' }) }));
    if (v.state !== 'quarantined') throw new Error('expected quarantine');
    expect(v.code).toBe('MKT_PROV_AUTHOR_MISMATCH');
    expect(v.grade).toBeNull();
  });

  it('an unavailable channel lowers the rung and says why', () => {
    const v = gradeInboundItem(emailItem({ oembed: unknownOEmbed }));
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.rung).toBe('email_oembed_unavailable');
    expect(v.grade.code).toBe('C3');
    expect(v.corroborations.find((c) => c.channel === 'oembed')?.detail).toMatch(/CHANNEL_TIMEOUT/);
  });

  it('not attempted is a different rung from attempted-and-failed', () => {
    const v = gradeInboundItem(emailItem());
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.rung).toBe('email_authenticated_unchecked');
    expect(v.corroborations.find((c) => c.channel === 'oembed')?.outcome).toBe('not_attempted');
  });

  it('a deleted post keeps its evidenced existence and is marked no longer public', () => {
    const v = gradeInboundItem(emailItem({ oembed: notPublicOEmbed }));
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.rung).toBe('email_post_not_public');
    expect(v.noLongerPublic).toBe(true);
    expect(v.grade.code).toBe('B3');
  });

  it('never presents a received time as a post time', () => {
    const v = gradeInboundItem(emailItem());
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.postedOnDisplayed).toBeNull();
    expect(v.postedAtSource).toBe('unknown');
    const c = gradeInboundItem(emailItem({ oembed: confirmedOEmbed() }));
    if (c.state !== 'graded') throw new Error('expected graded');
    expect(c.postedOnDisplayed).toBe('2026-08-01');
    expect(c.postedAtSource).toBe('oembed_displayed_date');
  });
});

describe('a mirror is discovery only', () => {
  const mirror = (over: Partial<InboundItem> = {}): InboundItem =>
    emailItem({
      channel: 'mirror_discovery',
      sender: null,
      mirrorHost: 'nitter.net',
      claimedText: 'text the mirror operator chose',
      ...over,
    });

  it('quarantines an uncorroborated mirror id and stores no text', () => {
    const v = gradeInboundItem(mirror());
    if (v.state !== 'quarantined') throw new Error('expected quarantine');
    expect(v.code).toBe('MKT_PROV_MIRROR_UNCORROBORATED');
    expect(v.storableText).toBeNull();
    expect(QUARANTINE[v.code].rule).toMatch(/mkt-r3/);
  });

  it('once oEmbed confirms, the stored text is X’s and never the mirror’s', () => {
    const v = gradeInboundItem(mirror({ oembed: confirmedOEmbed() }));
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.storableText).toBe(TEXT);
    expect(v.storableText).not.toContain('mirror operator');
    expect(v.rung).toBe('oembed_confirmed_single_channel');
    expect(v.corroborations.some((c) => c.channel === 'mirror_discovery' && c.outcome === 'discovery_only')).toBe(true);
  });
});

describe('human paste', () => {
  const paste = (over: Partial<InboundItem> = {}): InboundItem =>
    emailItem({ channel: 'operator_paste', sender: null, operator: 'nikhil@lcx.com', ...over });

  it('refuses a paste with no named human', () => {
    const v = gradeInboundItem(paste({ operator: null }));
    if (v.state !== 'refused') throw new Error('expected refusal');
    expect(v.code).toBe('MKT_PROV_NO_OPERATOR');
  });

  it('grades an operator assertion as one channel, and says it cannot corroborate itself', () => {
    const v = gradeInboundItem(paste());
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.rung).toBe('operator_paste_asserted');
    expect(v.grade.code).toBe('C3');
    expect(v.corroborations.find((c) => c.channel === 'operator_paste')?.detail).toMatch(/cannot corroborate itself/);
  });

  it('quarantines contradicted text on an unauthenticated channel', () => {
    const v = gradeInboundItem(paste({ claimedText: 'completely different words about unrelated matters entirely', oembed: confirmedOEmbed() }));
    if (v.state !== 'quarantined') throw new Error('expected quarantine');
    expect(v.code).toBe('MKT_PROV_TEXT_CONTRADICTED');
  });

  it('quarantines a paste with no text rather than storing an empty row', () => {
    const v = gradeInboundItem(paste({ claimedText: '   ' }));
    if (v.state !== 'quarantined') throw new Error('expected quarantine');
    expect(v.code).toBe('MKT_PROV_NO_TEXT');
  });
});

describe('the undocumented source never buys credibility', () => {
  const obs: SyndicationObservation = {
    postId: POST_ID,
    favouritesObservedLowerBound: 10,
    repliesObservedLowerBound: 3,
    createdAtExact: '2026-08-01T16:53:07.000Z',
    isBlueVerified: true,
    verifiedType: 'Business',
    isEdited: false,
    pollCountsAreFinal: false,
    fetchedAt: '2026-08-02T10:00:00.000Z',
    sourceIsUndocumented: true,
  };

  it('does not raise the rung of an unconfirmed email, though it may supply the instant', () => {
    const v = gradeInboundItem(emailItem({ syndication: obs }));
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.rung).toBe('email_authenticated_unchecked');
    expect(v.grade.code).toBe('C3');
    expect(v.postedAtExact).toBe('2026-08-01T16:53:07.000Z');
    expect(v.postedAtSource).toBe('syndication_embed');
    expect(v.corroborations.find((c) => c.channel === 'syndication_embed')?.undocumented).toBe(true);
  });

  it('on its own it is graded low and is never a text source', () => {
    const v = gradeInboundItem(emailItem({ channel: 'syndication_embed', sender: null, syndication: obs }));
    if (v.state !== 'graded') throw new Error('expected graded');
    expect(v.grade.code).toBe('D4');
    expect(v.storableText).toBeNull();
  });

  it('refuses when the channel is declared but carries no observation', () => {
    const v = gradeInboundItem(emailItem({ channel: 'syndication_embed', sender: null, syndication: null }));
    if (v.state !== 'refused') throw new Error('expected refusal');
    expect(v.code).toBe('MKT_PROV_NO_SYNDICATION_DATA');
  });
});

describe('items that cannot be evaluated are refused, never defaulted', () => {
  const refusalCode = (over: Partial<InboundItem>): string => {
    const v = gradeInboundItem(emailItem(over));
    if (v.state !== 'refused') throw new Error(`expected refusal, got ${v.state}`);
    return v.code;
  };

  it('refuses a missing id, an unknown channel, a missing receipt time and a missing post id', () => {
    expect(refusalCode({ itemId: ' ' })).toBe('MKT_PROV_NO_ITEM_ID');
    expect(refusalCode({ channel: null })).toBe('MKT_PROV_UNKNOWN_CHANNEL');
    expect(refusalCode({ receivedAt: null })).toBe('MKT_PROV_NO_RECEIVED_AT');
    expect(refusalCode({ receivedAt: 'not a date' })).toBe('MKT_PROV_NO_RECEIVED_AT');
    expect(refusalCode({ claimedPostId: null })).toBe('MKT_PROV_NO_POST_ID');
  });
});

describe('the batch says out loud when the channel was down', () => {
  it('refuses an empty queue and says it is empty', () => {
    const r = gradeInboundBatch([]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('MKT_PROV_EMPTY_QUEUE');
    expect(r.message).toMatch(/EMPTY/);
    expect(r.message).toMatch(/not a clean bill of health/);
  });

  it('carries a non-null notice whenever an outage lowered any item', () => {
    const r = gradeInboundBatch([emailItem({ oembed: unknownOEmbed }), emailItem({ itemId: 'row-2', oembed: confirmedOEmbed() })]);
    if (!r.ok) throw new Error('expected ok');
    expect(r.counts.degraded).toBe(1);
    expect(r.notice).not.toBeNull();
    expect(r.notice?.message).toMatch(/1 of 2/);
    expect(r.notice?.message).toMatch(/instrument fault/);
  });

  it('reports cooling even when no item degraded, and stays silent when nothing did', () => {
    const cooling = gradeInboundBatch([emailItem({ oembed: confirmedOEmbed() })], { channelCooling: true });
    if (!cooling.ok) throw new Error('expected ok');
    expect(cooling.notice?.channelCooling).toBe(true);
    const clean = gradeInboundBatch([emailItem({ oembed: confirmedOEmbed() })]);
    if (!clean.ok) throw new Error('expected ok');
    expect(clean.notice).toBeNull();
  });

  it('counts our own queue and makes no audience claim', () => {
    const r = gradeInboundBatch([
      emailItem({ oembed: confirmedOEmbed() }),
      emailItem({ itemId: 'row-2', sender: null }),
      emailItem({ itemId: ' ' }),
    ]);
    if (!r.ok) throw new Error('expected ok');
    expect(r.counts).toMatchObject({ total: 3, graded: 1, quarantined: 1, refused: 1, corroborated: 1 });
    expect(r.coverageStatement).toMatch(/1 of 3/);
    expect(r.coverageStatement).toMatch(/nothing about how many people saw anything/);
  });
});

describe('text agreement has three verdicts, and the middle one is honest', () => {
  it('agrees, contradicts, or declines to say', () => {
    expect(compareText(TEXT, TEXT).verdict).toBe('consistent');
    expect(compareText(TEXT, 'entirely unrelated sentence concerning shipping logistics').verdict).toBe('contradicted');
    expect(compareText('too short', TEXT).verdict).toBe('not_comparable');
    expect(compareText(null, TEXT).verdict).toBe('not_comparable');
  });

  it('ignores link rewriting, because X rewrites every URL to t.co', () => {
    const a = `${TEXT} https://lcx.com/en/status`;
    const b = `${TEXT} https://t.co/abc`;
    expect(compareText(a, b).verdict).toBe('consistent');
  });
});

describe('the metrics that must never be computed', () => {
  it('refuses each forbidden derivation with a reason and a substitute', () => {
    for (const key of Object.keys(FORBIDDEN_DERIVATIONS)) {
      const r = refuseForbiddenMetric(key);
      expect(r.refused).toBe(true);
      if (!r.refused) throw new Error('unreachable');
      expect(r.code).toBe('MKT_METRIC_FORBIDDEN');
      expect(r.substitute.length).toBeGreaterThan(0);
      expect(r.rule).toMatch(/§4 rule 3/);
    }
  });

  it('catches the aliases a caller would actually type', () => {
    for (const alias of ['Views', 'engagement rate', 'ER', 'CTR', 'SoV', 'sentiment', 'follower_growth', 'reach']) {
      expect(isForbiddenDerivation(alias)).toBe(true);
      expect(refuseForbiddenMetric(alias).refused).toBe(true);
    }
  });

  it('permits the honest process metrics', () => {
    expect(isForbiddenDerivation('replies_observed')).toBe(false);
    expect(refuseForbiddenMetric('time_to_first_statement').refused).toBe(false);
  });

  it('names a lower bound as a lower bound, and an absent count as not observed', () => {
    expect(lowerBoundLabel(10, 'likes on this post', '2026-08-02T10:00:00.000Z')).toMatch(/^at least 10 likes/);
    expect(lowerBoundLabel(10, 'likes', 'now')).toMatch(/lower bound/);
    expect(lowerBoundLabel(null, 'likes', 'now')).toMatch(/not observed/);
    expect(lowerBoundLabel(null, 'likes', 'now')).not.toMatch(/\b0\b/);
  });
});
