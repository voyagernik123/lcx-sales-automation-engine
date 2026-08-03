/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE ENGAGEMENT LENS — what a surface may claim about where a figure came from
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GpsInspector` renders whatever standing a lens hands it, so the lens is where a false
 * provenance claim would be made and this file is the only place it can be caught. Three
 * properties, all of which are honesty properties rather than layout ones:
 *
 *  1. EVERY `awaitingTodo` NAMES A ROW IN THE REAL LEDGER. `catalogueTodoFor` returns
 *     undefined otherwise and the inspector renders `UNKNOWN_TODO_NOTICE` — a warning that
 *     the warning cannot be trusted. Asserted against `CATALOGUE_TODOS` itself, so a
 *     reworded ledger row fails here rather than degrading a live screen.
 *  2. AN INDISTINGUISHABLE VENDOR COST IS NOT `measured`. The row keeps no record of
 *     whether a human typed the cost or the quote builder fell back to the catalogue, and
 *     the lens must fall the unflattering way. This is the assertion that stops a margin
 *     built on a compiled constant from grading MEASURED.
 *  3. MARGIN IS `derived`. It inherits every assumption of the cost above it.
 */

import { describe, it, expect } from 'vitest';
import { CATALOGUE_TODOS, getOffer, marginCents } from '@lcx/shared';
import type { GpsEngagementRow } from '@/lib/api/gps';
import { engagementLens, LENS_TODOS } from '../gpsLenses';
import { gpsProvenanceGrade, catalogueTodoFor } from '../GpsInspector';

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

const OFFER = getOffer('mica_whitepaper');

const row = (over: Partial<GpsEngagementRow> = {}): GpsEngagementRow => ({
  id: 'e-1', clientId: 'c-1', clientName: 'Probe Chain', projectId: null,
  offerKey: 'mica_whitepaper', contractingEntity: 'lcx', scopeSnapshot: {},
  priceCents: 1_750_000,
  // Deliberately NOT the catalogue's expectation, so the default fixture is the
  // distinguishable case and the placeholder tests have to ask for the other one.
  vendorCostCents: OFFER.expectedVendorCostCents + 1,
  currency: 'USD', status: 'draft', owner: 'nik',
  depositRequiredCents: 0, depositPaidAt: null, acceptedAt: null,
  createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
  conflict: null,
  ...over,
});

const view = (over: Partial<GpsEngagementRow> = {}, jurisdiction: string | null = null) =>
  engagementLens({ money, jurisdiction })(row(over));

const field = (label: string, over: Partial<GpsEngagementRow> = {}, j: string | null = null) =>
  view(over, j).fields.find((f) => f.label.startsWith(label))!;

describe('every placeholder standing names a row the ledger still has', () => {
  it('the ledger contains every `what` this lens claims', () => {
    // THE MUTATION THAT PROVES THIS: change one character of TODO_PRICE_BANDS and this goes
    // red naming it — which is what a reworded ledger row would do in production, silently.
    for (const what of LENS_TODOS) {
      expect(catalogueTodoFor(what), `no CATALOGUE_TODOS row says: ${what}`).toBeDefined();
    }
  });

  it('and the reverse: the assertion above is not vacuous', () => {
    expect(LENS_TODOS.length).toBeGreaterThan(0);
    expect(CATALOGUE_TODOS.length).toBeGreaterThan(0);
    expect(catalogueTodoFor('a decision nobody ever wrote down')).toBeUndefined();
  });

  it('every placeholder and unreviewed standing the lens can emit resolves', () => {
    // Over both branches of every conditional standing, not just the default row.
    const all = [
      ...view().fields,
      ...view({ conflict: { decision: 'cleared', decidedBy: 'desk', decidedAt: '2026-07-21T00:00:00.000Z' } as never }).fields,
      ...view({ vendorCostCents: OFFER.expectedVendorCostCents }).fields,
      ...view({}, 'Liechtenstein').fields,
    ];
    for (const f of all) {
      if (f.standing.kind === 'placeholder' || f.standing.kind === 'unreviewed') {
        expect(catalogueTodoFor(f.standing.awaitingTodo), f.label).toBeDefined();
      }
    }
  });
});

describe('a vendor cost that cannot be distinguished from the catalogue is not measured', () => {
  it('falls to placeholder when it equals the offer expectation', () => {
    // THE MUTATION THAT PROVES THIS: make `costLooksCompiled` always false and this goes red.
    const f = field('Vendor cost', { vendorCostCents: OFFER.expectedVendorCostCents });
    expect(f.standing.kind).toBe('placeholder');
    // And it says so on the face of the value, not only in the standing chip: the number is
    // the thing an operator reads.
    expect(String(f.value)).toContain('indistinguishable');
  });

  it('is measured when the operator typed something else', () => {
    const f = field('Vendor cost');
    expect(f.standing.kind).toBe('measured');
    expect(String(f.value)).not.toContain('indistinguishable');
  });

  it('drags the whole object off MEASURED, which is the point of the standing', () => {
    // The grade is what the inspector shows first. An engagement whose cost may be a
    // compiled constant must not present as measured.
    expect(gpsProvenanceGrade(view({ vendorCostCents: OFFER.expectedVendorCostCents }).fields))
      .not.toBe('measured');
  });
});

describe('what the row cannot say, the lens says is absent', () => {
  it('margin is derived, never measured and never stored', () => {
    const f = view().fields.find((x) => x.label.startsWith('Margin'))!;
    expect(f.standing.kind).toBe('derived');
    expect(String(f.value)).toBe(money(marginCents(row().priceCents, row().vendorCostCents)));
  });

  it('the delivering partner is absent with a migration named, not blank', () => {
    const f = field('Delivering partner');
    expect(f.standing.kind).toBe('absent');
    expect(f.value).toBeNull();
    if (f.standing.kind === 'absent') expect(f.standing.whyNoColumn).toContain('no partner column');
  });

  it('a missing conflict check reads MISSING, in the wall and the palette vocabulary', () => {
    // Three surfaces say the same word about the same absence: the wall, the ⌘K engagement
    // row (`gpsGrammar.ts` — 'CONFLICT CHECK MISSING') and this. One vocabulary.
    const f = field('Conflict check');
    expect(f.value).toBe('MISSING');
    expect(f.standing.kind).toBe('absent');
  });

  it('the jurisdiction is absent because the ROW does not carry it, and says which', () => {
    const f = field('Jurisdiction');
    expect(f.standing.kind).toBe('absent');
    if (f.standing.kind === 'absent') expect(f.standing.whyNoColumn).toContain('joins the client NAME');
    // And measured when the desk supplies it from the client list.
    expect(field('Jurisdiction', {}, 'Liechtenstein').standing.kind).toBe('measured');
  });
});

describe('the refusals are only the ones the row proves', () => {
  it('names the missing conflict check with the gate cited', () => {
    const r = view().refusals.find((x) => x.id === 'conflict_missing')!;
    expect(r.sentence).toContain('no conflict check is recorded');
    expect(r.rule).toContain('gps_proposal_issue');
    // A sentence, never a code — `looksLikeBareCode` is what the inspector flags.
    expect(r.sentence).toContain(' ');
  });

  it('says a non-positive margin is arithmetic, not a rule saying no', () => {
    const r = view({ vendorCostCents: 2_000_000 }).refusals.find((x) => x.id === 'margin_not_positive')!;
    expect(r.sentence).toContain('Nothing blocks issuing it');
  });

  it('claims nothing about the perimeter, the disclosure gate or the band', () => {
    // The server checks all three on issue and none of them is on this row. A refusal
    // invented from a guess would be worse than the gap.
    const ids = view({
      conflict: { decision: 'cleared', decidedBy: 'desk', decidedAt: '2026-07-21T00:00:00.000Z' } as never,
    }).refusals.map((r) => r.id);
    expect(ids).toEqual([]);
  });
});
