import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFER_KEYS } from './types.js';
import type { OfferKey } from './types.js';
import {
  NO_LEGAL_POSITION_NOTICE,
  PERIMETER_ABSENCE_CODES,
  PERIMETER_IS_UNREVIEWED,
  PERIMETER_PROFILES,
  PERIMETER_REVIEW_WARNING_DAYS,
  PERIMETER_UNREVIEWED_REASON,
  SERVICE_CLASS_LABEL,
  SERVICE_GATE_ORDER,
  classify,
  gateService,
  getJurisdictionProfile,
  normaliseJurisdiction,
  perimeterEntryDefects,
} from './perimeter.js';
import type {
  JurisdictionProfile, PerimeterEntry, ServiceClass, ServiceGateInput,
} from './perimeter.js';

/**
 * GPS PERIMETER — behavioural tests, and the ratchet that keeps an override out.
 *
 * Every test here asserts a REFUSAL or the shape of one, because that is what
 * this module is for (D2). The single most important assertion in the file is
 * that no combination of caller arguments can turn a `prohibited` position into
 * permission — a perimeter with a back door is not a perimeter.
 *
 * FIXTURES ARE MARKED. Every fixture entry's `source` says FIXTURE in capitals,
 * so no line in this file can be mistaken for a regulatory citation if it is
 * ever read out of context. Nothing regulatory was verifiable when this was
 * written; nothing here pretends otherwise.
 */

const NOW = '2026-08-01T00:00:00.000Z';

function entry(over: Partial<PerimeterEntry> = {}): PerimeterEntry {
  return {
    serviceClass: 'permitted',
    source: 'FIXTURE — not a real instrument and not a real position.',
    enteredBy: 'test.counsel',
    enteredAt: '2026-01-01T00:00:00.000Z',
    reviewBy: '2027-01-01T00:00:00.000Z',
    note: 'FIXTURE note.',
    reviewed: true,
    ...over,
  };
}

/** A one-jurisdiction, one-offer test perimeter. `testland` is not a place. */
function profileWith(
  offers: Partial<Record<OfferKey, PerimeterEntry>>,
  jurisdiction = 'testland',
): readonly JurisdictionProfile[] {
  return [{ jurisdiction, label: 'Testland', offers }];
}

const ONE_OFFER = 'mica_whitepaper' as const;

describe('normaliseJurisdiction', () => {
  it('folds spelling, case and punctuation', () => {
    expect(normaliseJurisdiction('  Liechtenstein ')).toBe('liechtenstein');
    expect(normaliseJurisdiction('U.S.A.')).toBe('us');
    expect(normaliseJurisdiction('United States of America')).toBe('us');
    expect(normaliseJurisdiction('European   Union')).toBe('eu');
  });

  it('returns empty for input with no word characters', () => {
    expect(normaliseJurisdiction('')).toBe('');
    expect(normaliseJurisdiction('   ')).toBe('');
    expect(normaliseJurisdiction('---')).toBe('');
    expect(normaliseJurisdiction(null)).toBe('');
    expect(normaliseJurisdiction(undefined)).toBe('');
  });

  /**
   * THE ABSENCE THAT MATTERS. Mapping a member state onto the EU-level key would
   * be a legal conclusion smuggled into a lookup table — whether an EU position
   * covers a member state depends on the instrument, the passporting route and
   * the contracting entity. So it does not resolve, and therefore it refuses.
   */
  it('does NOT map a member state to the EU — no containment, only synonyms', () => {
    expect(normaliseJurisdiction('Germany')).toBe('germany');
    expect(getJurisdictionProfile('Germany')).toBeNull();
    const c = classify('Germany', ONE_OFFER, NOW);
    expect(c.status).toBe('unknown_jurisdiction');
    expect(c.permitted).toBe(false);
  });
});

describe('classify — unknown jurisdiction is not permitted', () => {
  it('classifies unknown, refuses permission, and says why', () => {
    const c = classify('Neverland', ONE_OFFER, NOW);
    expect(c.serviceClass).toBe('unknown');
    expect(c.status).toBe('unknown_jurisdiction');
    expect(c.permitted).toBe(false);
    expect(c.entry).toBeNull();
    expect(c.reason.trim().length).toBeGreaterThan(0);
    // Unknown is NOT prohibited: saying so would be inventing a conclusion in
    // the conservative direction, which is still inventing one.
    expect(c.serviceClass).not.toBe('prohibited');
    expect(c.reason).toContain('not a finding');
  });

  it('a blank jurisdiction is unknown, never permitted', () => {
    for (const j of ['', '   ', null, undefined]) {
      const c = classify(j, ONE_OFFER, NOW);
      expect(c.permitted).toBe(false);
      expect(c.serviceClass).toBe('unknown');
      expect(c.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('a jurisdiction with positions but not for this offer is unknown_offer, not permitted', () => {
    const profiles = profileWith({ [ONE_OFFER]: entry() });
    const other: OfferKey = 'gtm_sprint';
    const c = classify('testland', other, NOW, profiles);
    expect(c.status).toBe('unknown_offer');
    expect(c.serviceClass).toBe('unknown');
    expect(c.permitted).toBe(false);
    // ...while the classified offer in the same jurisdiction IS permitted, so the
    // refusal above is about the offer and not about the fixture being broken.
    expect(classify('testland', ONE_OFFER, NOW, profiles).permitted).toBe(true);
  });

  /** The type-level half of the same guarantee: `unknown` is not a ServiceClass. */
  it('no ServiceClass value is "unknown"', () => {
    const classes: ServiceClass[] = ['permitted', 'counsel_required', 'partner_required', 'prohibited'];
    expect(Object.keys(SERVICE_CLASS_LABEL).sort()).toEqual([...classes].sort());
    expect(Object.keys(SERVICE_CLASS_LABEL)).not.toContain('unknown');
  });
});

describe('classify — expiry', () => {
  it('an expired reviewBy flips to stale, reports the recorded class, and refuses permission', () => {
    const profiles = profileWith({
      [ONE_OFFER]: entry({ serviceClass: 'permitted', reviewBy: '2026-07-01T00:00:00.000Z' }),
    });
    const c = classify('testland', ONE_OFFER, NOW, profiles);
    expect(c.stale).toBe(true);
    expect(c.status).toBe('stale');
    // D3: the class is reported BESIDE the staleness, not blanked by it.
    expect(c.serviceClass).toBe('permitted');
    expect(c.permitted).toBe(false);
    expect(c.daysPastReview).toBe(31);
    expect(c.reason).toContain('expired');
  });

  it('the same entry one day before expiry is permitted, and one day after is not', () => {
    const profiles = profileWith({ [ONE_OFFER]: entry({ reviewBy: '2026-08-02T00:00:00.000Z' }) });
    expect(classify('testland', ONE_OFFER, '2026-08-01T00:00:00.000Z', profiles).permitted).toBe(true);
    expect(classify('testland', ONE_OFFER, '2026-08-03T00:00:00.000Z', profiles).permitted).toBe(false);
  });

  it('reviewBy exactly equal to asOf is stale — the expiry is inclusive', () => {
    const at = '2026-08-01T00:00:00.000Z';
    const profiles = profileWith({ [ONE_OFFER]: entry({ reviewBy: at }) });
    const c = classify('testland', ONE_OFFER, at, profiles);
    expect(c.stale).toBe(true);
    expect(c.daysPastReview).toBe(0);
  });

  it('warns inside the review window without authorising less', () => {
    const profiles = profileWith({ [ONE_OFFER]: entry({ reviewBy: '2026-08-20T00:00:00.000Z' }) });
    const c = classify('testland', ONE_OFFER, NOW, profiles);
    expect(c.expiringSoon).toBe(true);
    expect(c.stale).toBe(false);
    expect(c.permitted).toBe(true);
    expect(c.daysPastReview).toBe(-19);
    expect(-(c.daysPastReview ?? 0)).toBeLessThanOrEqual(PERIMETER_REVIEW_WARNING_DAYS);
  });

  it('does not warn well before the window', () => {
    const profiles = profileWith({ [ONE_OFFER]: entry({ reviewBy: '2027-01-01T00:00:00.000Z' }) });
    expect(classify('testland', ONE_OFFER, NOW, profiles).expiringSoon).toBe(false);
  });

  /** Fail closed: an unparseable instant must never read as "current". */
  it('an unparseable asOf refuses rather than falling back to the wall clock', () => {
    const profiles = profileWith({ [ONE_OFFER]: entry() });
    const c = classify('testland', ONE_OFFER, 'not-a-date', profiles);
    expect(c.status).toBe('unevaluable_asof');
    expect(c.stale).toBe(true);
    expect(c.permitted).toBe(false);
    expect(c.reason).toContain('not a valid ISO timestamp');
  });

  it('an unparseable reviewBy refuses', () => {
    const profiles = profileWith({ [ONE_OFFER]: entry({ reviewBy: 'whenever' }) });
    const c = classify('testland', ONE_OFFER, NOW, profiles);
    expect(c.permitted).toBe(false);
    expect(c.stale).toBe(true);
  });
});

describe('classify — reviewed and well-formed', () => {
  it('an unreviewed entry can never be permitted, however current it is', () => {
    const profiles = profileWith({
      [ONE_OFFER]: entry({ serviceClass: 'permitted', reviewed: false, reviewBy: '2030-01-01T00:00:00.000Z' }),
    });
    const c = classify('testland', ONE_OFFER, NOW, profiles);
    expect(c.status).toBe('unreviewed');
    expect(c.stale).toBe(false);
    expect(c.permitted).toBe(false);
    expect(c.reason).toContain('NOT REVIEWED');
  });

  it('a malformed entry is reported as malformed and authorises nothing', () => {
    const profiles = profileWith({ [ONE_OFFER]: entry({ source: '   ' }) });
    const c = classify('testland', ONE_OFFER, NOW, profiles);
    expect(c.status).toBe('malformed');
    expect(c.permitted).toBe(false);
    expect(c.defects.length).toBeGreaterThan(0);
  });

  it('perimeterEntryDefects names each structural defect and passes a good row', () => {
    expect(perimeterEntryDefects(entry())).toEqual([]);
    expect(perimeterEntryDefects(entry({ source: '' }))).toContain('No source cited.');
    expect(perimeterEntryDefects(entry({ enteredBy: 'UNASSIGNED' })))
      .toContain('No named human accountable for the position.');
    expect(perimeterEntryDefects(entry({ note: '' }))).toContain('No note explaining the position.');
    expect(perimeterEntryDefects(entry({ enteredAt: 'x' })).length).toBe(1);
  });

  it('shows the arithmetic behind daysPastReview so the number can be re-derived (D1)', () => {
    const profiles = profileWith({ [ONE_OFFER]: entry({ reviewBy: '2026-06-02T00:00:00.000Z' }) });
    const c = classify('testland', ONE_OFFER, NOW, profiles);
    expect(c.entry?.reviewBy).toBe('2026-06-02T00:00:00.000Z');
    expect(c.asOf).toBe(NOW);
    expect(c.daysPastReview).toBe(60);
  });
});

describe('the SHIPPED perimeter authorises nothing', () => {
  it('is flagged unreviewed, with a reason a surface can print', () => {
    expect(PERIMETER_IS_UNREVIEWED).toBe(true);
    expect(PERIMETER_UNREVIEWED_REASON).toMatch(/placeholder/i);
  });

  it('every shipped row is unreviewed, unattributed, and expired on arrival', () => {
    expect(PERIMETER_PROFILES.length).toBeGreaterThan(0);
    for (const p of PERIMETER_PROFILES) {
      for (const key of OFFER_KEYS) {
        const e = p.offers[key];
        expect(e, `${p.jurisdiction}/${key}`).toBeDefined();
        expect(e!.reviewed).toBe(false);
        expect(e!.enteredBy).toBe('UNASSIGNED');
        // Two independent locks: unreviewed AND expired the instant it existed.
        expect(Date.parse(e!.reviewBy)).toBeLessThanOrEqual(Date.parse(e!.enteredAt));
        expect(e!.serviceClass).toBe('counsel_required');
        expect(e!.source).toMatch(/PLACEHOLDER/);
      }
    }
  });

  it('no shipped jurisdiction × offer is permitted, and none is prohibited either', () => {
    for (const p of PERIMETER_PROFILES) {
      for (const key of OFFER_KEYS) {
        const c = classify(p.jurisdiction, key, NOW);
        expect(c.permitted).toBe(false);
        // Placeholders must not assert a prohibition any more than a permission.
        expect(c.serviceClass).not.toBe('prohibited');
        expect(gateService({ jurisdiction: p.jurisdiction, offer: key, asOf: NOW }).allowed).toBe(false);
      }
    }
  });

  it('the placeholder instant is fixed, so staleness assertions are deterministic', () => {
    const a = PERIMETER_PROFILES[0].offers[OFFER_KEYS[0]]!;
    const b = PERIMETER_PROFILES[1].offers[OFFER_KEYS[1]]!;
    expect(a.enteredAt).toBe(b.enteredAt);
    expect(a.reviewBy).toBe(a.enteredAt);
  });
});

describe('gateService — refuses by default, and every refusal is reasoned', () => {
  const gate = (over: Partial<ServiceGateInput> = {}) =>
    gateService({ jurisdiction: 'testland', offer: ONE_OFFER, asOf: NOW, ...over });

  it('allows only when a reviewed, current, permitted position exists', () => {
    const d = gate({ profiles: profileWith({ [ONE_OFFER]: entry() }) });
    expect(d.allowed).toBe(true);
    expect(d.code).toBeNull();
    expect(d.reason).toBeNull();
    expect(d.classification.permitted).toBe(true);
    expect(d.gates.every((g) => g.passed && !g.skipped)).toBe(true);
  });

  it('refuses an unknown jurisdiction, and the refusal is a task not a wall', () => {
    const d = gate({ jurisdiction: 'Neverland' });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('perimeter_unknown_jurisdiction');
    expect(d.reason).not.toBeNull();
    expect(d.recoverable).toBe(true);
    expect(d.remedy).not.toBeNull();
  });

  it('refuses an unclassified offer for a known jurisdiction', () => {
    const d = gate({ offer: 'gtm_sprint', profiles: profileWith({ [ONE_OFFER]: entry() }) });
    expect(d.code).toBe('perimeter_unknown_offer');
    expect(d.allowed).toBe(false);
  });

  it('refuses a stale position, and calls it stale rather than something vaguer', () => {
    const d = gate({
      profiles: profileWith({ [ONE_OFFER]: entry({ reviewBy: '2026-07-01T00:00:00.000Z' }) }),
    });
    expect(d.code).toBe('perimeter_stale');
    expect(d.allowed).toBe(false);
    expect(d.recoverable).toBe(true);
    expect(d.remedy).toMatch(/re-review|re-reviews/i);
  });

  it('refuses an unreviewed draft position', () => {
    const d = gate({ profiles: profileWith({ [ONE_OFFER]: entry({ reviewed: false }) }) });
    expect(d.code).toBe('perimeter_unreviewed');
    expect(d.allowed).toBe(false);
  });

  it('refuses a malformed reviewed position — the most dangerous row in the file', () => {
    const d = gate({ profiles: profileWith({ [ONE_OFFER]: entry({ source: '' }) }) });
    expect(d.code).toBe('perimeter_malformed');
    expect(d.allowed).toBe(false);
  });

  it('refuses when the evaluation instant cannot be parsed', () => {
    const d = gate({ asOf: 'yesterday', profiles: profileWith({ [ONE_OFFER]: entry() }) });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('perimeter_stale');
    expect(d.classification.status).toBe('unevaluable_asof');
  });

  it('records every gate exactly once, and never reports an unreached gate as passed', () => {
    const d = gate({ jurisdiction: 'Neverland' });
    expect(d.gates.map((g) => g.code)).toEqual([...SERVICE_GATE_ORDER]);
    const failing = d.gates.filter((g) => !g.passed && !g.skipped);
    expect(failing.map((g) => g.code)).toEqual(['perimeter_unknown_jurisdiction']);
    for (const g of d.gates.slice(1)) {
      expect(g.skipped).toBe(true);
      expect(g.passed).toBe(false);
    }
  });
});

describe('gateService — conditions are conditions, not permission', () => {
  const gate = (cls: ServiceClass, over: Partial<ServiceGateInput> = {}) =>
    gateService({
      jurisdiction: 'testland',
      offer: ONE_OFFER,
      asOf: NOW,
      profiles: profileWith({ [ONE_OFFER]: entry({ serviceClass: cls }) }),
      ...over,
    });

  it('counsel_required refuses until a named counsel is supplied', () => {
    const without = gate('counsel_required');
    expect(without.allowed).toBe(false);
    expect(without.code).toBe('counsel_not_engaged');
    expect(without.classification.permitted).toBe(false);

    const withCounsel = gate('counsel_required', { counselEngaged: 'Some Firm LLP' });
    expect(withCounsel.allowed).toBe(true);
    // allowed ≠ permitted. Both are correct and they answer different questions.
    expect(withCounsel.classification.permitted).toBe(false);
    expect(withCounsel.conditionsAsserted.counsel).toBe('Some Firm LLP');
  });

  it('a blank or whitespace-only counsel name does not clear the condition', () => {
    for (const v of ['', '   ', null, undefined]) {
      const d = gate('counsel_required', { counselEngaged: v });
      expect(d.allowed).toBe(false);
      expect(d.code).toBe('counsel_not_engaged');
    }
  });

  it('partner_required refuses until a named partner is supplied', () => {
    expect(gate('partner_required').code).toBe('local_partner_not_named');
    expect(gate('partner_required', { localPartnerId: 'p-42' }).allowed).toBe(true);
  });

  it('naming counsel does not satisfy a partner requirement, or vice versa', () => {
    expect(gate('partner_required', { counselEngaged: 'Some Firm LLP' }).code)
      .toBe('local_partner_not_named');
    expect(gate('counsel_required', { localPartnerId: 'p-42' }).code)
      .toBe('counsel_not_engaged');
  });
});

describe('PROHIBITED CANNOT BE OVERRIDDEN', () => {
  // The cast is the point of this suite: it lets the test hand `gateService`
  // fields that do not exist on `ServiceGateInput`, which is exactly what a
  // JSON request body from an API route can do at runtime.
  const prohibited = (over: Record<string, unknown> = {}) =>
    gateService({
      jurisdiction: 'testland',
      offer: ONE_OFFER,
      asOf: NOW,
      profiles: profileWith({ [ONE_OFFER]: entry({ serviceClass: 'prohibited' }) }),
      ...over,
    } as unknown as ServiceGateInput);

  it('refuses, and the refusal is a wall with no remedy', () => {
    const d = prohibited();
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('service_prohibited');
    expect(d.recoverable).toBe(false);
    expect(d.remedy).toBeNull();
  });

  it('no caller flag clears it — counsel, partner, or any invented escape hatch', () => {
    const attempts: Record<string, unknown>[] = [
      { counselEngaged: 'Some Firm LLP' },
      { localPartnerId: 'p-42' },
      { counselEngaged: 'Some Firm LLP', localPartnerId: 'p-42' },
      // Fields that do not exist on ServiceGateInput. If one of these ever starts
      // working, someone added an override and this test is the alarm.
      { force: true },
      { override: true },
      { acceptRisk: true },
      { founderApproved: true },
      { bypassPerimeter: true },
      { allowed: true },
      { permitted: true },
      { counselEngaged: 'Some Firm LLP', localPartnerId: 'p-42', force: true, override: true },
    ];
    for (const a of attempts) {
      const d = prohibited(a);
      expect(d.allowed, JSON.stringify(a)).toBe(false);
      expect(d.code, JSON.stringify(a)).toBe('service_prohibited');
    }
  });

  /**
   * A prohibition must not DEGRADE into a staleness complaint as it ages: the
   * client-facing sentence would go from "counsel recorded this as prohibited" to
   * "the entry expired", and a refusal that gets vaguer over time gets ignored.
   */
  it('an EXPIRED prohibition still refuses as prohibited, with staleness reported beside it', () => {
    const d = gateService({
      jurisdiction: 'testland',
      offer: ONE_OFFER,
      asOf: NOW,
      profiles: profileWith({
        [ONE_OFFER]: entry({ serviceClass: 'prohibited', reviewBy: '2026-01-01T00:00:00.000Z' }),
      }),
    });
    expect(d.code).toBe('service_prohibited');
    expect(d.recoverable).toBe(false);
    expect(d.classification.stale).toBe(true);
    expect(d.classification.daysPastReview).toBe(212);
  });

  it('an UNREVIEWED prohibition still refuses as prohibited', () => {
    const d = gateService({
      jurisdiction: 'testland',
      offer: ONE_OFFER,
      asOf: NOW,
      profiles: profileWith({ [ONE_OFFER]: entry({ serviceClass: 'prohibited', reviewed: false }) }),
    });
    expect(d.code).toBe('service_prohibited');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE DISPOSITION — ADVISORY IS DERIVED FROM AN EMPTY PERIMETER, NOT SET      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The owner's decision of 2026-08-02: with no human-entered positions anywhere,
 * the gate refused every quote in every jurisdiction, so it now stamps instead of
 * refusing — WITHOUT the verdict changing. Every test in this block therefore
 * asserts two things at once: the gate still reaches the same code (the tests
 * above pin those codes), and the disposition says what may be done about it.
 *
 * There is no flag to set anywhere in this suite. Advisory operation is read off
 * the record, which is why the last test in the block — one reviewed position
 * flipping one pair back to blocking while its neighbour stays advisory — is the
 * important one.
 */
describe('the disposition travels beside the verdict and never inside it', () => {
  const gate = (over: Partial<ServiceGateInput> = {}) =>
    gateService({ jurisdiction: 'testland', offer: ONE_OFFER, asOf: NOW, ...over });

  /** Every absence code, and the state that produces it. */
  const ABSENT: ReadonlyArray<[string, Partial<ServiceGateInput>, string]> = [
    ['an unlisted jurisdiction', { jurisdiction: 'Neverland' }, 'perimeter_unknown_jurisdiction'],
    ['a blank jurisdiction', { jurisdiction: '  ' }, 'perimeter_unknown_jurisdiction'],
    ['an offer nobody classified', { offer: 'gtm_sprint', profiles: profileWith({ [ONE_OFFER]: entry() }) }, 'perimeter_unknown_offer'],
    ['a row with no source', { profiles: profileWith({ [ONE_OFFER]: entry({ source: '  ' }) }) }, 'perimeter_malformed'],
    ['a row past its review date', { profiles: profileWith({ [ONE_OFFER]: entry({ reviewBy: '2026-07-01T00:00:00.000Z' }) }) }, 'perimeter_stale'],
    ['a row nobody reviewed', { profiles: profileWith({ [ONE_OFFER]: entry({ reviewed: false }) }) }, 'perimeter_unreviewed'],
  ];

  for (const [name, over, code] of ABSENT) {
    it(`is advisory on ${name}, with the code and the reason kept verbatim`, () => {
      const d = gate(over);
      // THE VERDICT IS UNCHANGED. This is the half that must not move.
      expect(d.allowed).toBe(false);
      expect(d.code).toBe(code);
      expect(d.gates.map((g) => g.code)).toEqual([...SERVICE_GATE_ORDER]);
      // And the disposition says the act may proceed, stamped.
      expect(d.disposition.blocked).toBe(false);
      expect(d.disposition.advisory).toBe(true);
      expect(d.disposition.legalPositionOnFile).toBe(false);
      expect(d.disposition.gateCode).toBe(code);
      expect(d.disposition.gateReason).toBe(d.reason);
      expect(d.disposition.notice).toBe(NO_LEGAL_POSITION_NOTICE);
      expect(PERIMETER_ABSENCE_CODES).toContain(code);
    });
  }

  it('every absence code is a real gate code, and no other code is on the list', () => {
    for (const c of PERIMETER_ABSENCE_CODES) expect(SERVICE_GATE_ORDER).toContain(c);
    // The three codes that report a DECISION a human took must never be advisory:
    // one is a prohibition, and the other two can only be reached through a
    // position that is already reviewed, current and well formed.
    for (const c of ['service_prohibited', 'counsel_not_engaged', 'local_partner_not_named'] as const) {
      expect(PERIMETER_ABSENCE_CODES).not.toContain(c);
    }
  });

  it('reports a position on file, and no notice, when one really exists', () => {
    const d = gate({ profiles: profileWith({ [ONE_OFFER]: entry() }) });
    expect(d.allowed).toBe(true);
    expect(d.disposition.legalPositionOnFile).toBe(true);
    expect(d.disposition.advisory).toBe(false);
    expect(d.disposition.blocked).toBe(false);
    expect(d.disposition.notice).toBeNull();
    expect(d.disposition.gateCode).toBeNull();
  });

  it('BLOCKS a prohibition, and blocks it while the rest of the perimeter is empty', () => {
    for (const over of [
      {},
      { reviewBy: '2026-01-01T00:00:00.000Z' },
      { reviewed: false },
      { source: '   ' },
    ] as Partial<PerimeterEntry>[]) {
      const d = gate({
        profiles: profileWith({ [ONE_OFFER]: entry({ serviceClass: 'prohibited', ...over }) }),
      });
      expect(d.code, JSON.stringify(over)).toBe('service_prohibited');
      expect(d.disposition.blocked, JSON.stringify(over)).toBe(true);
      expect(d.disposition.advisory, JSON.stringify(over)).toBe(false);
    }
  });

  it('BLOCKS when the evaluation instant could not be parsed — an unread check is not an empty one', () => {
    const d = gate({ asOf: 'yesterday', profiles: profileWith({ [ONE_OFFER]: entry() }) });
    expect(d.code).toBe('perimeter_stale');
    expect(d.classification.status).toBe('unevaluable_asof');
    // `perimeter_stale` IS an absence code, and this is the one state carrying it
    // that must still refuse: the position may be perfectly good and unreadable.
    expect(PERIMETER_ABSENCE_CODES).toContain('perimeter_stale');
    expect(d.disposition.blocked).toBe(true);
    expect(d.disposition.advisory).toBe(false);
  });

  it('BLOCKS an unmet condition, because a condition implies a position exists', () => {
    for (const [cls, code] of [
      ['counsel_required', 'counsel_not_engaged'],
      ['partner_required', 'local_partner_not_named'],
    ] as const) {
      const d = gate({ profiles: profileWith({ [ONE_OFFER]: entry({ serviceClass: cls }) }) });
      expect(d.code).toBe(code);
      expect(d.disposition.blocked).toBe(true);
      expect(d.disposition.advisory).toBe(false);
      // A condition is only reachable through a reviewed, current, well-formed row.
      expect(d.disposition.legalPositionOnFile).toBe(true);
      expect(d.disposition.notice).toBeNull();
    }
  });

  it('the whole SHIPPED perimeter is advisory — that is production today', () => {
    for (const p of PERIMETER_PROFILES) {
      for (const key of OFFER_KEYS) {
        const d = gateService({ jurisdiction: p.jurisdiction, offer: key, asOf: NOW });
        expect(d.allowed, `${p.jurisdiction}/${key}`).toBe(false);
        expect(d.disposition.advisory, `${p.jurisdiction}/${key}`).toBe(true);
        expect(d.disposition.legalPositionOnFile).toBe(false);
      }
    }
  });

  /**
   * THE SELF-HEAL. No code changes between the two halves of this test and no
   * argument differs — only the contents of the perimeter.
   */
  it('ONE reviewed position flips that pair to blocking while its neighbours stay advisory', () => {
    const neighbour: OfferKey = 'gtm_sprint';
    const empty = profileWith({});
    const filled = profileWith({ [ONE_OFFER]: entry({ serviceClass: 'counsel_required' }) });

    // Before: both pairs advisory, for want of any position at all.
    for (const offer of [ONE_OFFER, neighbour]) {
      expect(gate({ offer, profiles: empty }).disposition.advisory, offer).toBe(true);
    }

    // After: the pair a human wrote down BLOCKS on its own condition...
    const decided = gate({ offer: ONE_OFFER, profiles: filled });
    expect(decided.code).toBe('counsel_not_engaged');
    expect(decided.disposition.blocked).toBe(true);
    expect(decided.disposition.legalPositionOnFile).toBe(true);
    // ...and naming the counsel it asks for clears it outright.
    expect(gate({ offer: ONE_OFFER, profiles: filled, counselEngaged: 'Some Firm LLP' }).allowed).toBe(true);

    // ...while the offer beside it, still unwritten, is untouched and stays advisory.
    const untouched = gate({ offer: neighbour, profiles: filled });
    expect(untouched.code).toBe('perimeter_unknown_offer');
    expect(untouched.disposition.advisory).toBe(true);
    expect(untouched.disposition.legalPositionOnFile).toBe(false);

    // The same is true one jurisdiction over: a position in Testland says nothing
    // about anywhere else, so that pair is advisory too.
    expect(gate({ jurisdiction: 'Elsewhere', profiles: filled }).disposition.advisory).toBe(true);
  });

  it('a PROHIBITION entered for one pair does not become advisory as its neighbours are filled in', () => {
    const profiles = profileWith({
      [ONE_OFFER]: entry({ serviceClass: 'prohibited' }),
      gtm_sprint: entry({ serviceClass: 'permitted' }),
    });
    expect(gate({ offer: 'gtm_sprint', profiles }).allowed).toBe(true);
    const d = gate({ offer: ONE_OFFER, profiles });
    expect(d.code).toBe('service_prohibited');
    expect(d.disposition.blocked).toBe(true);
  });
});

/**
 * THE RATCHET. Source-text assertion, in the spirit of the artifact lockout
 * (`apps/api/src/gps/__tests__/intakeLockout.test.ts`): a behavioural test can
 * only prove that today's arguments do not open a back door, whereas this proves
 * the door was never built. Comments are stripped first, because the module's own
 * prose names the forbidden identifiers in order to explain why they are absent.
 */
describe('ratchet — no override exists in the perimeter module', () => {
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'perimeter.ts'),
    'utf8',
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('declares no escape-hatch identifier anywhere in code', () => {
    for (const word of [
      'force', 'override', 'bypass', 'acceptRisk', 'founderApproved',
      'skipPerimeter', 'ignoreStale', 'assumePermitted',
    ]) {
      expect(code, `"${word}" appears in perimeter.ts code`)
        .not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
    }
  });

  /**
   * ADVISORY OPERATION MUST STAY DERIVED. The owner's standing instruction is that
   * nothing lands on his list — so the moment this module reads an environment
   * variable or a flag to decide whether a refusal counts, advisory mode has become a
   * setting somebody has to remember to turn off, and the self-healing property is
   * gone. The only input to `perimeterDisposition` is the record.
   */
  it('decides advisory operation from the record alone — no env var, no flag', () => {
    expect(code, 'the perimeter engine reads an environment variable').not.toMatch(/process\s*\.\s*env/);
    for (const word of [
      'ADVISORY_MODE', 'advisoryMode', 'featureFlag', 'enableAdvisory', 'GPS_ADVISORY',
    ]) {
      expect(code, `"${word}" makes advisory operation a setting`)
        .not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
    }
    // And the derivation takes the decision, not options: one parameter, no second.
    expect(code).toMatch(/export function perimeterDisposition\(\s*\n?\s*d:/);
  });

  it('never defaults asOf to the wall clock', () => {
    expect(code).not.toMatch(/Date\.now\(\)/);
    expect(code).not.toMatch(/new Date\(\)/);
  });

  it('contains no jurisdiction-name-to-outcome inference beyond declared synonyms', () => {
    // The only place a jurisdiction string may influence anything is the synonym
    // table; a serviceClass literal must never appear next to a country test.
    expect(code).not.toMatch(/includes\(['"][A-Za-z]+['"]\)\s*\?\s*['"]permitted/);
  });
});

