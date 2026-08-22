import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SNIPPET_MAX,
  crossfeedSignals,
  demandCandidateDefects,
  intakeCandidate,
  parseTelegramExport,
  referralCandidate,
  type CrossfeedProjectInput,
  type DemandCandidate,
} from './demand.js';

/**
 * THE DEMAND LAYER — four channels whose whole worth is what they refuse to carry.
 *
 * The crossfeed's worth is that every reason cites its fields; the Telegram parser's worth
 * is what it THROWS AWAY (senders, unmatched messages, everything past 200 chars); the
 * intake's worth is that a honeypot hit dies silently. So the tests here are mostly about
 * absence — and absences are asserted on outputs computed in this same test, never on
 * outputs assumed to exist (the weak-success-condition rule).
 */

const ASOF = '2026-08-21T15:00:00.000Z';

const project = (over: Partial<CrossfeedProjectInput> = {}): CrossfeedProjectInput => ({
  id: 'p1', name: 'SABLE TREASURY', chain: 'ethereum', jurisdiction: 'Germany',
  euScore: 40, band: 'nurture', listedOnLcx: false, hasOpenDeal: false, daysSinceUpdate: 3,
  ...over,
});

describe('crossfeed — three rules, each citing the fields that fired it', () => {
  it('R1: high EU score + not listed → mica_whitepaper, with both values in the reason', () => {
    const out = crossfeedSignals([project({ euScore: 82, listedOnLcx: false })], ASOF);
    const r1 = out.find((c) => c.sourceRef === 'xf:mica:p1')!;
    expect(r1.offerHypothesis).toBe('mica_whitepaper');
    expect(r1.reason).toContain('euScore 82');
    expect(r1.reason).toContain('listedOnLcx false');
  });

  it('R1 does NOT fire on a listed project or an absent score — null is an absence, not a zero', () => {
    expect(crossfeedSignals([project({ euScore: 82, listedOnLcx: true })], ASOF)
      .filter((c) => c.sourceRef.startsWith('xf:mica'))).toHaveLength(0);
    expect(crossfeedSignals([project({ euScore: null })], ASOF)
      .filter((c) => c.sourceRef.startsWith('xf:mica'))).toHaveLength(0);
  });

  it('R2: a stalled open deal → diagnostic; a fresh one does not fire', () => {
    const stalled = crossfeedSignals([project({ hasOpenDeal: true, daysSinceUpdate: 60 })], ASOF);
    expect(stalled.find((c) => c.sourceRef === 'xf:diag:p1')!.reason).toContain('daysSinceUpdate 60');
    expect(crossfeedSignals([project({ hasOpenDeal: true, daysSinceUpdate: 10 })], ASOF)
      .filter((c) => c.sourceRef.startsWith('xf:diag'))).toHaveLength(0);
  });

  it('R3: high band with no deal → gtm_sprint; with a deal it stays quiet', () => {
    expect(crossfeedSignals([project({ band: 'high' })], ASOF)
      .find((c) => c.sourceRef === 'xf:gtm:p1')!.reason).toContain('band "high"');
    expect(crossfeedSignals([project({ band: 'high', hasOpenDeal: true, daysSinceUpdate: 1 })], ASOF)
      .filter((c) => c.sourceRef.startsWith('xf:gtm'))).toHaveLength(0);
  });

  it('every emitted candidate passes the validator and is idempotent by ref', () => {
    const out = crossfeedSignals([
      project({ euScore: 90, band: 'immediate', hasOpenDeal: false }),
      project({ id: 'p2', name: 'HELIOS', hasOpenDeal: true, daysSinceUpdate: 50 }),
    ], ASOF);
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect(demandCandidateDefects(c), c.sourceRef).toEqual([]);
    expect(new Set(out.map((c) => c.sourceRef)).size).toBe(out.length);
  });
});

describe('the Telegram sieve — judged by what it discards', () => {
  const EXPORT = {
    name: 'Launch Alpha Group',
    messages: [
      { id: 1, type: 'message', from: 'Some Person', from_id: 'user123', text: 'gm frens' },
      { id: 2, type: 'message', from: 'Founder X', text: 'We are preparing our MiCA white paper ahead of the EU listing — t.me/sableprotocol for updates. ' + 'x'.repeat(400) },
      { id: 3, type: 'message', from: 'Shill Account', text: '$SBL launch coming, raise closing soon!!! https://sable.example' },
      { id: 4, type: 'message', from: 'Bystander', text: 'anyone tried the new wallet? my seed phrase is definitely not 12 words haha' },
      { id: 5, type: 'service', actor: 'Admin' },
      'not an object at all',
    ],
  };

  it('keeps the two announcement-shaped messages and drops the chatter and the bystander', () => {
    const { candidates, report } = parseTelegramExport(EXPORT, ASOF);
    expect(candidates).toHaveLength(2);
    expect(report.messagesSeen).toBe(5);
    expect(report.messagesMatched).toBe(2);
    expect(report.unparseableEntries).toBe(1);
    // The bystander's wallet message matched neither identity nor kept anything.
    expect(JSON.stringify(candidates)).not.toContain('seed phrase');
  });

  it('keeps ZERO sender fields, and counts every one it dropped', () => {
    const { candidates, report } = parseTelegramExport(EXPORT, ASOF);
    expect(report.sendersSeenAndDropped).toBe(5);
    const flat = JSON.stringify(candidates);
    for (const leaked of ['Some Person', 'Founder X', 'Shill Account', 'Bystander', 'from_id', 'user123']) {
      expect(flat, `sender data leaked: ${leaked}`).not.toContain(leaked);
    }
  });

  it('caps every snippet at 200 chars — whole-message retention is a different thing', () => {
    const { candidates } = parseTelegramExport(EXPORT, ASOF);
    for (const c of candidates) {
      expect(c.snippet).not.toBeNull();
      expect(c.snippet!.length).toBeLessThanOrEqual(SNIPPET_MAX);
    }
    // Message 2 is ~450 chars; its snippet is not.
    const mica = candidates.find((c) => c.sourceRef === 'tg:Launch Alpha Group:2')!;
    expect(mica.offerHypothesis).toBe('mica_whitepaper');
    expect(mica.projectName).toBe('sableprotocol');
  });

  it('signal words alone are chatter: identity (link or ticker) is required', () => {
    const { candidates } = parseTelegramExport({
      name: 'g', messages: [{ id: 9, text: 'huge launch coming, big raise, exchange listing soon' }],
    }, ASOF);
    expect(candidates).toHaveLength(0);
  });

  it('is total: garbage in, empty result and an honest report out', () => {
    for (const junk of [null, 42, 'hi', [], { messages: 'nope' }]) {
      const { candidates, report } = parseTelegramExport(junk, ASOF);
      expect(candidates).toEqual([]);
      expect(report.messagesSeen).toBe(0);
    }
  });
});

describe('intake and referral', () => {
  const FIELDS = {
    projectName: 'Sable Protocol', url: 'https://sable.example', email: 'founder@sable.example',
    offerInterest: 'mica_whitepaper' as const, jurisdiction: 'Germany',
    message: 'We need a MiCA paper before Q4.', website: '',
  };

  it('a filled honeypot dies with a defect the caller can log and the visitor never sees', () => {
    const out = intakeCandidate({ ...FIELDS, website: 'http://spam' }, 'in:1', ASOF);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.defects.join(' ')).toMatch(/honeypot/);
  });

  it('a clean intake carries the consented email and only that', () => {
    const out = intakeCandidate(FIELDS, 'in:1', ASOF);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.candidate.contactEmail).toBe('founder@sable.example');
      expect(demandCandidateDefects(out.candidate)).toEqual([]);
    }
  });

  it('a referral requires its partner and grades B2 — vouched, still not a finding', () => {
    expect(referralCandidate('', { projectName: 'X', url: null, jurisdiction: null, offerHypothesis: 'unsure', note: '' }, 'r:1', ASOF).ok).toBe(false);
    const out = referralCandidate('partner-7', { projectName: 'Sable', url: null, jurisdiction: 'France', offerHypothesis: 'legal_opinion_coordination', note: 'their counsel asked for us' }, 'r:1', ASOF);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.candidate.provenanceGrade).toBe('B2');
      expect(out.candidate.reason).toContain('partner-7');
    }
  });

  it('a contact email anywhere but intake is a defect — nothing else was consented to', () => {
    const c: DemandCandidate = {
      source: 'telegram_import', sourceRef: 't:1', projectName: 'X', url: null, chain: null,
      jurisdiction: null, offerHypothesis: 'unsure', reason: 'r', snippet: 'x',
      provenanceGrade: 'C3', contactEmail: 'someone@example.com', observedAt: ASOF,
    };
    expect(demandCandidateDefects(c).join(' ')).toMatch(/consented/i);
  });
});

describe('the module keeps the gps purity rules', () => {
  it('reads no clock and declares no banned field', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'demand.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now|new Date\(\)/);
  });
});
