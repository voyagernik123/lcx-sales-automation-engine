import { describe, it, expect } from 'vitest';
import { getOffer } from './catalogue.js';
import {
  CONTRACTING_ENTITY_DISCLOSURE_NAME,
  DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
  DISCLOSURES_UNREVIEWED_REASON,
  DISCLOSURE_LIBRARY_VERSION,
  DISCLOSURE_TEMPLATES,
  DisclosureError,
  PROHIBITED_PROMISES,
  PROHIBITED_PROMISE_LABEL,
  PROHIBITED_PROMISE_SENTENCE,
  disclosureRecord,
  getDisclosureLibrarySnapshot,
  getDisclosureTemplate,
  missingDisclosures,
  renderDisclosure,
  requiredDisclosures,
} from './disclosure.js';
import type { DisclosureContext, DisclosureField } from './disclosure.js';

/**
 * GPS DISCLOSURE — behavioural tests, plus the library's own integrity.
 *
 * The two assertions that matter most are both about ABSENCE: rendering never
 * produces an empty disclosure, and rendering never produces template syntax. An
 * empty string and a stray `{{clientName}}` are the two outputs that pass every
 * type check, satisfy every truthiness test, print without complaint, and
 * persist as a record that a disclosure was given when none was.
 */

const STANDING = 'gps-standing-employee-conflict';

function ctx(over: Partial<DisclosureContext> = {}): DisclosureContext {
  return {
    clientName: 'Fixture Token Ltd',
    offerKey: 'mica_whitepaper',
    contractingEntity: 'lcx',
    asOf: '2026-08-01T09:30:00.000Z',
    jurisdiction: 'Testland',
    conflictDecision: 'cleared',
    lcxAdjacent: false,
    perimeterUnreviewed: false,
    ...over,
  };
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{([a-zA-Z]+)\}\}/g)].map((m) => m[1]))];
}

/** Every code the render path can refuse with, captured without a stack. */
function refusal(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DisclosureError);
    const err = e as DisclosureError;
    return { code: err.code, message: err.message };
  }
  throw new Error('expected a DisclosureError, and nothing was thrown');
}

describe('the standing employee-conflict statement', () => {
  it('states all four prohibited promises, by construction', () => {
    expect(PROHIBITED_PROMISES).toHaveLength(4);
    const r = renderDisclosure(STANDING, ctx());
    for (const p of PROHIBITED_PROMISES) {
      expect(r.text, PROHIBITED_PROMISE_LABEL[p]).toContain(PROHIBITED_PROMISE_SENTENCE[p]);
    }
  });

  it('covers listing influence, regulator approval, venue admission and market-making by subject', () => {
    const t = renderDisclosure(STANDING, ctx()).text;
    expect(t).toMatch(/influence over any listing decision/i);
    expect(t).toMatch(/no regulatory approval/i);
    expect(t).toMatch(/admission to trading/i);
    expect(t).toMatch(/market-making/i);
  });

  it('discloses the employment rather than leaving it to be discovered', () => {
    const t = renderDisclosure(STANDING, ctx()).text;
    expect(t).toMatch(/employee of LCX/);
    expect(t).toMatch(/regulated exchange operator/);
  });

  it('applies to every context — there is no way to be exempt from it', () => {
    const variants: Partial<DisclosureContext>[] = [
      {}, { conflictDecision: 'declined' }, { conflictDecision: 'unresolved' },
      { lcxAdjacent: true }, { contractingEntity: 'external' },
      { offerKey: 'diagnostic' }, { perimeterUnreviewed: true },
    ];
    for (const v of variants) {
      expect(requiredDisclosures(ctx(v)).map((t) => t.id)).toContain(STANDING);
    }
  });

  it('names the contracting entity without inventing a legal entity name', () => {
    expect(renderDisclosure(STANDING, ctx({ contractingEntity: 'lcx' })).text)
      .toContain(CONTRACTING_ENTITY_DISCLOSURE_NAME.lcx);
    // Decision D1 is unanswered (types.ts:33), so the external name is described,
    // not fabricated. A made-up company name in a disclosure would be the worst
    // possible place to invent a fact.
    const ext = renderDisclosure(STANDING, ctx({ contractingEntity: 'external' })).text;
    expect(ext).toContain(CONTRACTING_ENTITY_DISCLOSURE_NAME.external);
    expect(ext).toContain('named in the engagement letter');
    for (const name of Object.values(CONTRACTING_ENTITY_DISCLOSURE_NAME)) {
      expect(name).not.toMatch(/\b(Ltd|GmbH|LLC|AG|Inc|S\.A\.|B\.V\.)\b/);
    }
  });
});

describe('renderDisclosure refuses rather than returning nothing', () => {
  it('refuses an unknown template id, and lists what it does know', () => {
    const r = refusal(() => renderDisclosure('gps-does-not-exist', ctx()));
    expect(r.code).toBe('unknown_template');
    expect(r.message).toContain('gps-does-not-exist');
    expect(r.message).toContain(STANDING);
  });

  it('refuses ids that are close but wrong, and non-string-shaped junk', () => {
    for (const id of ['', ' ', 'GPS-STANDING-EMPLOYEE-CONFLICT', 'gps-standing', 'standing']) {
      expect(refusal(() => renderDisclosure(id, ctx())).code).toBe('unknown_template');
    }
    expect(getDisclosureTemplate('nope')).toBeNull();
  });

  it('refuses a blank required field — blank counts as missing', () => {
    for (const name of ['', '   ']) {
      const r = refusal(() => renderDisclosure(STANDING, ctx({ clientName: name })));
      expect(r.code).toBe('missing_field');
      expect(r.message).toContain('clientName');
    }
  });

  it('refuses an unparseable asOf rather than dating the artifact wrongly', () => {
    const r = refusal(() => renderDisclosure(STANDING, ctx({ asOf: 'sometime' })));
    expect(r.code).toBe('missing_field');
    expect(r.message).toContain('asOf');
  });

  it('refuses an offer key that is not in the catalogue', () => {
    const bad = ctx({ offerKey: 'not_an_offer' as never });
    expect(refusal(() => renderDisclosure(STANDING, bad)).code).toBe('unknown_offer');
  });

  it('refuses the perimeter disclosure without a named jurisdiction', () => {
    const id = 'gps-perimeter-unestablished';
    expect(refusal(() => renderDisclosure(id, ctx({ jurisdiction: null }))).code).toBe('missing_field');
    expect(refusal(() => renderDisclosure(id, ctx({ jurisdiction: '  ' }))).code).toBe('missing_field');
    expect(renderDisclosure(id, ctx({ jurisdiction: 'Testland' })).text).toContain('Testland');
  });

  it('never returns an empty or whitespace-only text on the success path', () => {
    for (const t of DISCLOSURE_TEMPLATES) {
      const r = renderDisclosure(t.id, ctx({ perimeterUnreviewed: true }));
      expect(r.text.trim().length, t.id).toBeGreaterThan(200);
    }
  });

  it('never emits template syntax into client-facing text', () => {
    for (const t of DISCLOSURE_TEMPLATES) {
      const r = renderDisclosure(t.id, ctx({ perimeterUnreviewed: true }));
      expect(r.text, t.id).not.toContain('{{');
      expect(r.text, t.id).not.toContain('}}');
      expect(r.text, t.id).not.toContain('undefined');
    }
  });
});

describe('version pinning is exact', () => {
  it('renders when the pin matches the compiled version', () => {
    const t = getDisclosureTemplate(STANDING)!;
    const r = renderDisclosure(STANDING, ctx(), { version: t.version });
    expect(r.version).toBe(t.version);
  });

  it('refuses every version that is not the compiled one — including a newer pin', () => {
    const t = getDisclosureTemplate(STANDING)!;
    for (const v of [t.version - 1, t.version + 1, 0, 99]) {
      const r = refusal(() => renderDisclosure(STANDING, ctx(), { version: v }));
      expect(r.code, `pin ${v}`).toBe('version_mismatch');
      expect(r.message).toContain(`version ${v}`);
    }
  });

  it('omitting the pin renders the current version and reports which it was', () => {
    const r = renderDisclosure(STANDING, ctx());
    expect(r.version).toBe(getDisclosureTemplate(STANDING)!.version);
  });

  it('every template has a positive integer version and a unique id', () => {
    const ids = DISCLOSURE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of DISCLOSURE_TEMPLATES) {
      expect(Number.isInteger(t.version), t.id).toBe(true);
      expect(t.version, t.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('the library version is derived from the templates, so it cannot drift', () => {
    expect(DISCLOSURE_LIBRARY_VERSION)
      .toBe(DISCLOSURE_TEMPLATES.reduce((n, t) => n + t.version, 0));
    expect(getDisclosureLibrarySnapshot().libraryVersion).toBe(DISCLOSURE_LIBRARY_VERSION);
  });
});

describe('determinism', () => {
  it('same id + same context ⇒ byte-identical text', () => {
    const a = renderDisclosure(STANDING, ctx());
    const b = renderDisclosure(STANDING, ctx());
    expect(a.text).toBe(b.text);
    expect(a).toEqual(b);
  });

  it('the same instant on a different wall clock renders the same date', () => {
    // Two ISO spellings of the same instant must not produce two disclosures.
    const a = renderDisclosure(STANDING, ctx({ asOf: '2026-08-01T09:30:00.000Z' }));
    const b = renderDisclosure(STANDING, ctx({ asOf: '2026-08-01T11:30:00+02:00' }));
    expect(a.text).toBe(b.text);
    expect(a.text).toContain('2026-08-01');
  });

  it('dates to the day, not the instant — no false precision in client text', () => {
    const r = renderDisclosure(STANDING, ctx({ asOf: '2026-08-01T09:30:00.000Z' }));
    expect(r.text).not.toContain('09:30');
    // The full instant is still available on the record for the audit trail.
    expect(r.renderedFor.asOf).toBe('2026-08-01T09:30:00.000Z');
  });

  it('interpolates the catalogue offer name verbatim, not a caller-supplied string', () => {
    const r = renderDisclosure(STANDING, ctx({ offerKey: 'gtm_sprint' }));
    expect(r.text).toContain(getOffer('gtm_sprint').name);
  });
});

describe('library integrity — the guard against a future edit', () => {
  it('every placeholder a template uses is declared in `requires`', () => {
    for (const t of DISCLOSURE_TEMPLATES) {
      for (const p of placeholders(t.text)) {
        expect(t.requires as readonly string[], `${t.id} uses {{${p}}}`).toContain(p);
      }
    }
  });

  it('every declared field is actually used, so nothing is required for nothing', () => {
    for (const t of DISCLOSURE_TEMPLATES) {
      const used = placeholders(t.text);
      for (const f of t.requires) {
        expect(used, `${t.id} declares ${f}`).toContain(f as DisclosureField);
      }
    }
  });

  it('no template promises an outcome or quotes a price', () => {
    for (const t of DISCLOSURE_TEMPLATES) {
      // Prices are placeholders programme-wide (catalogue.ts:58); a number that
      // looks like money must never reach a disclosure.
      expect(t.text, t.id).not.toMatch(/[$€£]\s?\d/);
      expect(t.text, t.id).not.toMatch(/\bwe (guarantee|warrant|ensure)\b/i);
      expect(t.text, t.id).not.toMatch(/\bwill be (listed|approved|admitted)\b/i);
    }
  });

  it('every template carries a human-readable statement of when it applies', () => {
    for (const t of DISCLOSURE_TEMPLATES) {
      expect(t.title.trim().length, t.id).toBeGreaterThan(0);
      expect(t.appliesWhenLabel.trim().length, t.id).toBeGreaterThan(10);
    }
  });
});

describe('appliesWhen, and the completeness check the wall needs', () => {
  it('the conflict disclosure applies on cleared_with_disclosure OR LCX-adjacency', () => {
    const id = 'gps-conflict-cleared-with-disclosure';
    const ids = (c: DisclosureContext) => requiredDisclosures(c).map((t) => t.id);
    expect(ids(ctx({ conflictDecision: 'cleared_with_disclosure' }))).toContain(id);
    expect(ids(ctx({ lcxAdjacent: true }))).toContain(id);
    expect(ids(ctx({ conflictDecision: 'cleared', lcxAdjacent: false }))).not.toContain(id);
  });

  it('the role limit applies only to legal-opinion coordination', () => {
    const id = 'gps-legal-opinion-coordination';
    expect(requiredDisclosures(ctx({ offerKey: 'legal_opinion_coordination' })).map((t) => t.id))
      .toContain(id);
    expect(requiredDisclosures(ctx({ offerKey: 'gtm_sprint' })).map((t) => t.id)).not.toContain(id);
  });

  it('the perimeter disclosure applies exactly when the perimeter is unestablished', () => {
    const id = 'gps-perimeter-unestablished';
    expect(requiredDisclosures(ctx({ perimeterUnreviewed: true })).map((t) => t.id)).toContain(id);
    expect(requiredDisclosures(ctx({ perimeterUnreviewed: false })).map((t) => t.id)).not.toContain(id);
  });

  it('reports `applies: false` when a non-required disclosure is rendered anyway', () => {
    const r = renderDisclosure('gps-legal-opinion-coordination', ctx({ offerKey: 'gtm_sprint' }));
    expect(r.applies).toBe(false);
    expect(r.text.trim().length).toBeGreaterThan(0);
    expect(renderDisclosure(STANDING, ctx()).applies).toBe(true);
  });

  it('missingDisclosures shows the gap, and closes when the ids are recorded', () => {
    const c = ctx({ conflictDecision: 'cleared_with_disclosure', perimeterUnreviewed: true });
    const required = requiredDisclosures(c).map((t) => t.id);
    expect(required.length).toBeGreaterThanOrEqual(3);
    expect(missingDisclosures(c, []).map((t) => t.id)).toEqual(required);
    expect(missingDisclosures(c, [STANDING]).map((t) => t.id)).not.toContain(STANDING);
    expect(missingDisclosures(c, required)).toEqual([]);
    // An unrelated recorded id closes nothing.
    expect(missingDisclosures(c, ['gps-something-else']).map((t) => t.id)).toEqual(required);
  });
});

describe('what the caller persists', () => {
  it('carries the id, the version, the verbatim text and the library version', () => {
    const rec = disclosureRecord(renderDisclosure(STANDING, ctx()));
    expect(rec.templateId).toBe(STANDING);
    expect(rec.version).toBe(getDisclosureTemplate(STANDING)!.version);
    expect(rec.text).toBe(renderDisclosure(STANDING, ctx()).text);
    expect(rec.libraryVersion).toBe(DISCLOSURE_LIBRARY_VERSION);
    expect(rec.renderedAt).toBe('2026-08-01T09:30:00.000Z');
  });

  it('records the unreviewed status as a stored fact, not something inferred later', () => {
    const rec = disclosureRecord(renderDisclosure(STANDING, ctx()));
    expect(rec.unreviewed).toBe(DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED);
    expect(rec.unreviewed).toBe(true);
  });

  it('the library badges itself as not counsel-reviewed, with a printable reason', () => {
    const snap = getDisclosureLibrarySnapshot();
    expect(snap.unreviewed).toBe(true);
    expect(snap.unreviewedReason).toBe(DISCLOSURES_UNREVIEWED_REASON);
    expect(snap.unreviewedReason).toMatch(/not counsel-reviewed/i);
    expect(snap.templates.map((t) => t.id)).toEqual(DISCLOSURE_TEMPLATES.map((t) => t.id));
  });

  it('the snapshot omits the texts, so a wall listing cannot leak a stale copy', () => {
    for (const t of getDisclosureLibrarySnapshot().templates) {
      expect(Object.keys(t).sort()).toEqual(['appliesWhenLabel', 'id', 'title', 'version']);
    }
  });
});
