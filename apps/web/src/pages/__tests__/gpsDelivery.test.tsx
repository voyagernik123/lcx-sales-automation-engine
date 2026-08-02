import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
/**
 * THE FIXTURE IS BUILT BY THE REAL ENGINE, NOT BY HAND.
 *
 * `composeDeliveryResponse` is imported and CALLED here — the same function the API
 * route will call — so every payload below is a shape the engine actually produces.
 * That is the whole point, and it is a direct response to what went wrong on
 * `Gps.tsx` two commits ago: that page's test mocked the API module and asserted the
 * page against the SAME invented contract the page was written against, so a payload
 * the server had never returned typechecked, passed, and shipped broken. Two
 * artefacts agreeing with each other is not a contract.
 *
 * A hand-written `DeliveryResponse` literal here would reproduce that exactly. So the
 * only thing mocked below is the network call; the payload it resolves with is
 * composed from rows by `deliveryView.ts`.
 *
 * IMPORTED BY RELATIVE PATH, deliberately, and this is temporary. `deliveryView.ts`
 * is not yet re-exported by `packages/shared/src/gps/index.ts` or by
 * `packages/shared/src/index.ts` — both are barrels the human wiring pass owns, and
 * neither is mine to edit. `GpsDelivery.tsx` itself imports TYPES ONLY from
 * `@lcx/shared` (erased at runtime, so the page runs today and starts typechecking
 * the moment the two barrel lines land). A test needs the VALUE, so it reaches the
 * source directly rather than mocking the composer — mocking it would delete the
 * only thing this file is really guarding.
 */
import { composeDeliveryResponse } from '../../../../../packages/shared/src/gps/deliveryView';
import type { DeliveryResponseInput, LiveMilestoneState } from '../../../../../packages/shared/src/gps/deliveryView';
import type { Deliverable, DeliveryLoadInput, EvidenceRequest } from '../../../../../packages/shared/src/gps/delivery';
import { deriveMilestonesForOffer } from '../../../../../packages/shared/src/gps/delivery';
import { getOffer } from '../../../../../packages/shared/src/gps/catalogue';
import { GpsDelivery } from '../GpsDelivery';
import * as api from '@/lib/api/gpsDelivery';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DELIVERY DESK — the guards, not a smoke test
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Four of these assert an ABSENCE, which is the only kind of claim that survives
 * someone adding a feature in good faith:
 *
 *  1. NO PERCENTAGE IN THE PROGRESS SECTION WHILE ANYTHING IS BLOCKED. "56% done" on
 *     a stopped engagement is the lie the whole engine was written to prevent.
 *  2. NO ANCHOR AND NO `href` ANYWHERE NEAR AN EXTERNAL REFERENCE. Making that text
 *     clickable is how the artifact lockout gets defeated by one helpful commit.
 *  3. NO UPLOAD-SHAPED EXPORT in `lib/api/gpsDelivery.ts`.
 *  4. NO FLATTERING EMPTY STATE. "Nothing recorded" must never render as "all clear".
 *
 * WHAT THESE TESTS CANNOT SEE, stated plainly: jsdom has no layout and no paint.
 * "A blocked milestone is VISUALLY distinct" is asserted here as "the row carries the
 * blocked border class and the state cell carries an aria-label saying blocked" —
 * that is a real regression guard on the markup and it is NOT a claim about what a
 * human perceives. The verbal and structural distinctions (the caps label, the reason
 * on its own line) are the ones actually proven below, which is why the page makes
 * the distinction three ways rather than one.
 */

const ASOF = '2026-08-01T12:00:00.000Z';
const OFFER_KEY = 'mica_whitepaper' as const;
const OFFER = getOffer(OFFER_KEY);
/** The real plan's keys, read from the engine. Nine milestones, five sold criteria. */
const KEYS = deriveMilestonesForOffer(OFFER_KEY).map((m) => m.key);

const CLIENT = { id: 'c-1', name: 'Probe Chain' };

const evidence = (over: Partial<EvidenceRequest> = {}): EvidenceRequest => ({
  id: 'ev-1',
  engagementId: 'e-1',
  clientId: CLIENT.id,
  milestoneKey: KEYS[2] ?? null,
  description: 'Signed tokenomics schedule as at the allocation date',
  requestedFrom: 'client',
  requestedFromName: 'Ana Ruiz',
  requestedAt: '2026-07-01T00:00:00.000Z',
  dueBy: '2026-07-10T00:00:00.000Z',
  status: 'requested',
  externalLocation: null,
  blocking: true,
  receivedAt: null,
  resolutionNote: null,
  requestedBy: 'nik',
  ...over,
});

const deliverable = (over: Partial<Deliverable> = {}): Deliverable => ({
  id: 'd-1',
  engagementId: 'e-1',
  clientId: CLIENT.id,
  milestoneKey: KEYS[7] ?? null,
  title: 'Article 6 notification pack',
  description: 'The pack as filed, with the regime confirmation attached by counsel.',
  owner: 'partner',
  state: 'delivered',
  reviewRequired: true,
  reviewBasis: 'Regulatory filing — LCX is named in it.',
  reviewedBy: null,
  reviewedAt: null,
  acceptedAt: null,
  acceptedBy: null,
  handoverChannel: 'Emailed to the client and their counsel 2026-07-28.',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
  ...over,
});

const loadRow = (id: string, over: Partial<DeliveryLoadInput> = {}): DeliveryLoadInput => ({
  engagementId: id,
  clientId: `c-${id}`,
  offerKey: OFFER_KEY,
  status: 'in_delivery',
  milestones: deriveMilestonesForOffer(OFFER_KEY),
  ...over,
});

/**
 * Build a real payload.
 *
 * `blockedAt` marks one milestone blocked and five complete, which is the only
 * fixture shape that can prove the percentage guard: the engine still computes
 * `completePct` (5 of 9 countable) and the display union still refuses to carry it.
 */
function payload(over: Partial<DeliveryResponseInput> = {}) {
  return composeDeliveryResponse({
    engagement: {
      id: 'e-1',
      clientId: CLIENT.id,
      clientName: CLIENT.name,
      offerKey: OFFER_KEY,
      status: 'in_delivery',
      offer: OFFER,
    },
    asOf: ASOF,
    ...over,
  });
}

/** Five complete, one blocked with a reason, one blocked with none. */
const liveBlocked: LiveMilestoneState[] = [
  ...KEYS.slice(0, 5).map((key) => ({
    key, state: 'complete' as const, blockedReason: null, updatedAt: '2026-07-25T00:00:00.000Z',
  })),
  {
    key: KEYS[5]!,
    state: 'blocked',
    blockedReason: 'Counsel will not sign the consistency pass until the tokenomics schedule arrives.',
    updatedAt: '2026-07-29T00:00:00.000Z',
  },
  { key: KEYS[6]!, state: 'blocked', blockedReason: null, updatedAt: '2026-07-30T00:00:00.000Z' },
];

vi.mock('@/lib/api/gpsDelivery', () => ({ fetchGpsDelivery: vi.fn() }));

async function mount(p: ReturnType<typeof payload>, query = '?engagementId=e-1') {
  vi.mocked(api.fetchGpsDelivery).mockResolvedValue(p);
  const view = render(
    <MemoryRouter initialEntries={[`/gps/delivery${query}`]}>
      <GpsDelivery />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText(/GPS delivery dossier/i)).toBeTruthy());
  return view;
}

/** A section, by the heading it is labelled with. Scopes an absence claim honestly. */
const section = (id: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`section[aria-labelledby="${id}-h"]`);
  if (!el) throw new Error(`section ${id} is not rendered`);
  return el;
};

beforeEach(() => vi.clearAllMocks());

/* ── 1 · THE PLAN, AS A POSITIVE ASSERTION WITH A MECHANISM ─────────────────── */

describe('the plan, measured against what was sold', () => {
  it('prints the drift verdict as the engine worded it, with the mechanism beside it', async () => {
    const p = payload({ liveMilestones: liveBlocked });
    await mount(p);
    const plan = section('plan');

    // The engine's own sentence, not a paraphrase, and not a green tick.
    expect(p.plan.drift.assertion).toMatch(/matches what was sold/i);
    expect(plan.textContent).toContain(p.plan.drift.assertion);

    // D8 — the claim carries what was executed to produce it.
    expect(plan.textContent).toContain('deriveMilestones()');
    expect(plan.textContent).toMatch(/checked both directions/i);
    expect(plan.textContent).toContain('sold not delivered');
    expect(plan.textContent).toContain('planned not sold');
  });

  it('opens the criteria count to the sold sentences and the milestones answering for them (D1)', async () => {
    const p = payload({ liveMilestones: liveBlocked });
    await mount(p);

    await userEvent.click(screen.getByRole('button', { name: /5 criteria sold — open the rows/i }));

    const drawer = await screen.findByRole('dialog');
    // Verbatim criterion text, and the milestone keys that deliver it.
    for (const c of p.plan.drift.coverage) {
      expect(drawer.textContent).toContain(c.text);
      expect(c.milestoneKeys.length).toBeGreaterThan(0);
      expect(drawer.textContent).toContain(c.milestoneKeys[0]!);
    }
  });

  it('renders a refused plan AS A REFUSAL, never as an engagement with no milestones', async () => {
    // A real throw from the real engine: an acceptance criterion the catalogue plan
    // does not deliver. This is the sold_not_delivered direction — the failure that
    // loses the client — and it must not read as "not started yet".
    const drifted = {
      ...OFFER,
      acceptanceCriteria: [...OFFER.acceptanceCriteria, 'A sixth thing nobody planned a milestone for.'],
    };
    const p = payload({
      engagement: {
        id: 'e-1', clientId: CLIENT.id, clientName: CLIENT.name,
        offerKey: OFFER_KEY, status: 'in_delivery', offer: drifted,
      },
    });
    expect(p.plan.usable).toBe(false);
    expect(p.plan.drift.failure?.direction).toBe('sold_not_delivered');

    await mount(p);
    const plan = section('plan');
    expect(plan.textContent).toMatch(/REFUSED, not because none exists/i);
    expect(plan.textContent).toContain(p.plan.drift.failure!.engineMessage);
    expect(plan.textContent).toContain(p.plan.drift.failure!.operatorDetail);
    // And no progress is claimed on a plan that could not be built.
    expect(section('progress').textContent).toMatch(/NO PROGRESS CAN BE REPORTED/i);
    expect(section('progress').textContent).not.toMatch(/\d+%/);
  });

  it('shows recorded state as its own fact — "never recorded" is not "not started"', async () => {
    const p = payload({ liveMilestones: liveBlocked });
    await mount(p);
    const plan = section('plan');
    // Nine milestones, seven with recorded state.
    expect(p.plan.recordedCount).toBe(7);
    expect(plan.textContent).toContain('7 of 9 milestones have recorded state');
    expect(within(plan).getAllByText('never recorded').length).toBe(2);
  });
});

/* ── 2 · THE ANTI-LIE REQUIREMENT ───────────────────────────────────────────── */

describe('blocked is not a shade of not-started', () => {
  it('renders NO percentage in the progress section while a milestone is blocked', async () => {
    const p = payload({ liveMilestones: liveBlocked });

    // The engine still computes it — the guard is that the display union cannot
    // carry it, so this is a real number the screen is refusing, not an absent one.
    expect(p.progress.display.kind).toBe('blocked');
    expect('pct' in p.progress.display).toBe(false);
    expect(p.progress.progress!.completePct).toBe(56);

    await mount(p);

    const progress = section('progress');
    expect(progress.textContent).not.toMatch(/\d+\s*%/);
    expect(progress.textContent).not.toContain('56');
    // The counts DO survive: "5 of 9 complete, 2 blocked" is a fact about the plan.
    expect(progress.textContent).toMatch(/Blocked/);
    expect(progress.textContent).toMatch(/5\s*of\s*9 milestones complete/);
    expect(progress.textContent).toMatch(/Delivery has stopped/i);
  });

  it('keeps the arithmetic available in the drawer — refusing to lead with a number is not hiding it', async () => {
    await mount(payload({ liveMilestones: liveBlocked }));
    await userEvent.click(screen.getByRole('button', { name: /5 complete — open the rows/i }));
    const drawer = await screen.findByRole('dialog');
    expect(drawer.textContent).toMatch(/countable \(total − waived\)/);
    expect(drawer.textContent).toMatch(/never rendered as the headline while blocked/i);
    expect(drawer.textContent).toContain('56');
  });

  it('makes a blocked milestone verbally, structurally and semantically distinct from every other row', async () => {
    await mount(payload({ liveMilestones: liveBlocked }));
    const plan = section('plan');

    // SEMANTIC — the state cell says "blocked" to a screen reader, not just to an eye.
    // This is the distinction that does not depend on colour or on case.
    expect(within(plan).getAllByLabelText('State: blocked').length).toBe(2);
    expect(within(plan).getAllByLabelText('State: Complete').length).toBe(5);

    // VERBAL — literal capitals in the reason line's own text. The state cell's caps
    // are a CSS `uppercase`, which jsdom cannot see and which this test therefore does
    // not claim; the text node below is real content and is asserted as such.
    expect((plan.textContent!.match(/BLOCKED ·/g) ?? []).length).toBe(2);

    // STRUCTURAL — the reason is on the row, on its own line, and the second blocked
    // row says why there is no reason instead of rendering a blank.
    expect(plan.textContent).toContain('Counsel will not sign the consistency pass');
    expect(plan.textContent).toMatch(/no reason recorded/i);

    // MARKUP — the blocked rule class. jsdom has no paint, so this is a claim about
    // the markup and NOT about what a human perceives.
    expect(plan.querySelectorAll('tr.border-l-status-blocked').length).toBe(2);
    expect(plan.querySelectorAll('span.uppercase[aria-label="State: blocked"]').length).toBe(2);
  });

  it('names an unexplained block as its own defect rather than rendering an empty reason', async () => {
    const p = payload({ liveMilestones: liveBlocked });
    expect(p.progress.unexplainedBlockers).toBe(1);

    await mount(p);
    expect(section('plan').textContent).toMatch(/no reason recorded — an unexplained block is its own reporting defect/i);
    // And the rail raises it, in the composer's order, not the page's.
    expect(document.body.textContent).toMatch(/unexplained block/);
  });

  it('prints the engine headline verbatim so it can be pasted into a client update', async () => {
    const p = payload({ liveMilestones: liveBlocked });
    await mount(p);
    expect(section('progress').textContent).toContain(p.progress.headline);
    expect(p.progress.headline).toMatch(/blocked/i);
  });
});

/* ── 3 · THE EVIDENCE CHASE, AND THE ARTIFACT LOCKOUT ───────────────────────── */

/** A reference an operator TYPED. Not a URL, not resolvable, not ours. */
const TYPED_REFERENCE = 'Client Sharepoint > Legal > Tokenomics v4 (ask Ana for access)';

const chaseRows: EvidenceRequest[] = [
  evidence({ id: 'ev-late', externalLocation: TYPED_REFERENCE }),
  evidence({
    id: 'ev-unmanaged', milestoneKey: KEYS[3] ?? null, dueBy: null, blocking: false,
    description: 'Confirmation of the marketing entity that will sign off claims',
    requestedFrom: 'counsel', requestedFromName: null,
  }),
  evidence({
    id: 'ev-refused', milestoneKey: KEYS[3] ?? null, status: 'refused',
    description: 'The unredacted cap table',
    resolutionNote: 'Client declined: the cap table is not shared outside their counsel.',
  }),
  // Settled — `isEvidenceOutstanding` drops it in the composer, not on the screen.
  evidence({ id: 'ev-done', status: 'received', receivedAt: '2026-07-08T00:00:00.000Z' }),
];

describe('the evidence chase', () => {
  it('shows what he is waiting on, from whom, with overdue DERIVED against asOf', async () => {
    const p = payload({ liveMilestones: liveBlocked, evidence: chaseRows });
    expect(p.evidence.outstanding).toBe(3);
    expect(p.evidence.overdue).toBe(2);

    await mount(p);
    const ev = section('evidence');
    expect(ev.textContent).toContain(p.evidence.headline);
    expect(ev.textContent).toContain('Ana Ruiz');
    expect(ev.textContent).toMatch(/overdue derived against 2026-08-01T12:00:00\.000Z/);
    // 22 days late on 2026-08-01 against a 2026-07-10 due date, computed not stored.
    expect(ev.textContent).toMatch(/22d late/);
    expect(ev.textContent).toMatch(/blocks delivery/);
  });

  it('distinguishes UNMANAGED from overdue — no due date is worse than late, not better', async () => {
    await mount(payload({ evidence: chaseRows }));
    const ev = section('evidence');
    expect(within(ev).getByLabelText('No due date: unmanaged')).toBeTruthy();
    expect(ev.textContent).toMatch(/no due date, so nothing will ever flag them|never be flagged as late/i);
  });

  it('keeps a REFUSED request in the list and says the scope needs re-agreeing', async () => {
    const p = payload({ evidence: chaseRows });
    expect(p.evidence.refused).toBe(1);
    await mount(p);
    const ev = section('evidence');
    expect(ev.textContent).toContain('The unredacted cap table');
    expect(ev.textContent).toContain('Client declined');
    expect(document.body.textContent).toMatch(/scope needs re-agreeing, not chasing/i);
  });

  it('renders the external reference as INERT TEXT — no anchor, no href, nothing to click', async () => {
    await mount(payload({ evidence: chaseRows }));
    const ev = section('evidence');

    // The reference IS shown — the lockout is about not resolving it, not about hiding it.
    expect(ev.textContent).toContain(TYPED_REFERENCE);
    expect(ev.querySelector('[data-inert-reference="true"]')!.textContent).toBe(TYPED_REFERENCE);
    expect(ev.textContent).toMatch(/inert text/i);

    // THE ABSENCE. Any one of these appearing means the lockout has been defeated.
    expect(within(ev).queryAllByRole('link')).toHaveLength(0);
    expect(ev.querySelectorAll('a')).toHaveLength(0);
    expect(ev.querySelectorAll('[href]')).toHaveLength(0);
    expect(ev.querySelectorAll('[target]')).toHaveLength(0);
    expect(ev.querySelectorAll('img, iframe, embed, object')).toHaveLength(0);
    // Nothing is a button either: a click handler that "opens" it is the same breach
    // with a different tag.
    expect(ev.querySelector('[data-inert-reference="true"]')!.closest('a, button')).toBeNull();

    // And the reason travels with it, from the wire rather than from an import.
    expect(ev.textContent).toMatch(/GPS never resolves, retrieves, copies or previews it/);
  });

  it('states the lockout and where it is enforced, on the printed dossier', async () => {
    const p = payload({ evidence: chaseRows });
    await mount(p);
    const lock = section('lockout');
    expect(lock.textContent).toContain(p.lockout.noClientDocumentStore);
    expect(lock.textContent).toContain(p.lockout.externalReferenceIsInert);
    for (const e of p.lockout.enforcedBy) expect(lock.textContent).toContain(e);
    expect(lock.textContent).toMatch(/intakeLockout\.test\.ts/);
  });
});

/* ── 4 · ACCEPTANCE — THE GATE'S REFUSALS, NOT A SECOND GATE ────────────────── */

const deliverables: Deliverable[] = [
  deliverable({ id: 'd-review' }),
  deliverable({
    id: 'd-outside', milestoneKey: null, title: 'Ad hoc regulator Q&A note',
    state: 'accepted', reviewRequired: false, reviewBasis: 'Internal note, not filed.',
    acceptedAt: '2026-07-30T00:00:00.000Z', acceptedBy: 'nik',
  }),
  deliverable({
    id: 'd-ready', milestoneKey: KEYS[8] ?? null, title: 'Counsel written confirmation',
    state: 'ready', reviewedBy: 'nik', reviewedAt: '2026-07-29T00:00:00.000Z',
  }),
  deliverable({
    id: 'd-eviblocked', milestoneKey: KEYS[2] ?? null, title: 'Indexed source material register',
    state: 'delivered', reviewedBy: 'nik', reviewedAt: '2026-07-27T00:00:00.000Z',
  }),
];

describe('acceptance', () => {
  it('shows every refusal reason on the row that earned it, in the engine order', async () => {
    const p = payload({ evidence: chaseRows, deliverables });
    expect(p.acceptance.awaitingReview).toBe(1);
    expect(p.acceptance.awaitingEvidence).toBe(1);
    expect(p.acceptance.acceptable).toBe(1);

    await mount(p);
    const acc = section('acceptance');
    expect(acc.textContent).toContain(p.acceptance.headline);
    expect(acc.textContent).toMatch(/review outstanding/);
    expect(acc.textContent).toMatch(/A named reviewer and a review date are both needed/);
    expect(acc.textContent).toMatch(/evidence outstanding/);
    expect(acc.textContent).toMatch(/already accepted/);
    expect(acc.textContent).toMatch(/may be accepted/);
  });

  it('makes review-required visible, and names the DB constraint that refuses independently', async () => {
    const p = payload({ evidence: chaseRows, deliverables });
    await mount(p);
    const acc = section('acceptance');
    expect(acc.textContent).toMatch(/REQUIRED · not recorded/);
    expect(acc.textContent).toContain('Regulatory filing — LCX is named in it.');
    expect(acc.textContent).toContain('gps_deliverable_no_acceptance_before_review');
    expect(acc.textContent).toContain(p.acceptance.gateMechanism);
    expect(acc.textContent).toMatch(/reports refusals; it does not implement the rule/i);
  });

  it('flags a deliverable that answers to no milestone as possibly unpriced scope', async () => {
    const p = payload({ evidence: chaseRows, deliverables });
    expect(p.acceptance.outsideThePlan).toBe(1);
    await mount(p);
    expect(section('acceptance').textContent).toMatch(/outside the plan/);
    expect(document.body.textContent).toMatch(/scope delivered that may never have been priced/i);
  });
});

/* ── 5 · THE COORDINATION CEILING ───────────────────────────────────────────── */

/** One engagement whose plan has a blocked milestone — still counted, per the engine. */
const blockedPlan = deriveMilestonesForOffer(OFFER_KEY).map((m, i) =>
  i === 5 ? { ...m, state: 'blocked' as const, blockedReason: 'Waiting on counsel.' } : m,
);

/** Four live at 4h each against a 12h placeholder ceiling — over by 4h/week. */
const overCeiling: DeliveryLoadInput[] = [
  loadRow('e-1'),
  loadRow('e-2'),
  loadRow('e-3', { milestones: blockedPlan }),
  loadRow('e-4'),
  // Delivered and not collected: follow-up work, no coordination hours.
  loadRow('e-5', { status: 'invoiced' }),
];

describe('the coordination ceiling', () => {
  it('states OVER CEILING plainly, first, and does not clamp the negative headroom', async () => {
    const p = payload({ liveMilestones: liveBlocked, deskLoad: overCeiling });
    expect(p.wip.ceiling.overCeiling).toBe(true);
    expect(p.wip.ceiling.committedHoursPerWeek).toBe(16);
    expect(p.wip.ceiling.capacityHoursPerWeek).toBe(12);
    expect(p.wip.ceiling.headroomHours).toBe(-4);

    await mount(p);
    const wip = section('wip');
    expect(wip.textContent).toMatch(/OVER COORDINATION CEILING/);
    expect(wip.textContent).toMatch(/Another engagement\? · over ceiling/i);
    expect(wip.textContent).toMatch(/Another engagement is sold time he does not have/);
    // -4h, not 0h. A clamped headroom is a comfort, not a fact.
    expect(wip.textContent).toContain('-4h');
    expect(wip.textContent).toContain('over by');
    expect(wip.textContent).toContain('4h/wk');
  });

  it('counts blocked engagements against the ceiling, and says why', async () => {
    const p = payload({ deskLoad: overCeiling });
    expect(p.wip.load.blocked).toBe(1);
    await mount(p);
    expect(section('wip').textContent).toMatch(/chasing a client for an input IS the coordination work/i);
    expect(section('wip').textContent).toMatch(/blocked \(still counted/);
  });

  it('badges the hours as PLACEHOLDERS beside the figures, never folded into them (D3)', async () => {
    const p = payload({ deskLoad: overCeiling });
    expect(p.wip.basisIsMeasured).toBe(false);
    await mount(p);
    const wip = section('wip');
    expect(wip.textContent).toMatch(/Basis: PLACEHOLDER, not measured/);
    expect(wip.textContent).toMatch(/Read the shape and the ordering, not the magnitudes/);
    // The figures are still the engine's, unshaded — 16 and 12, not discounted.
    expect(wip.textContent).toContain('16h/wk');
    expect(wip.textContent).toContain('12h/wk');
  });

  it('opens the committed hours to a leave-one-out attribution that reconstructs the total (D1)', async () => {
    const p = payload({ deskLoad: overCeiling });
    await mount(p);
    await userEvent.click(screen.getByRole('button', { name: /4 live engagements — open the rows/i }));
    const drawer = await screen.findByRole('dialog');

    expect(drawer.textContent).toMatch(/Leave-one-out over wipLoad\(\)/);
    expect(drawer.textContent).toMatch(/drivers sum to 16h · engine total 16h/);
    // No UNATTRIBUTED driver: the attribution reconstructs the engine's own number.
    expect(drawer.textContent).not.toMatch(/UNATTRIBUTED/);
    expect(p.wip.hourDrivers.reduce((s, d) => s + d.points, 0)).toBe(16);
  });

  it('names the engagements with no partner as his to deliver', async () => {
    const p = payload({ deskLoad: overCeiling });
    expect(p.wip.load.unstaffable).toBeGreaterThan(0);
    await mount(p);
    expect(section('wip').textContent).toMatch(/no named partner — his to deliver/);
    expect(document.body.textContent).toMatch(/cannot honestly be staffed/i);
  });
});

/* ── 6 · HONEST EMPTINESS ───────────────────────────────────────────────────── */

describe('empty and failed states say what they actually mean', () => {
  it('does not read an absent evidence list as "all clear"', async () => {
    const p = payload({ liveMilestones: liveBlocked, deskLoad: overCeiling });
    expect(p.evidence.rows).toHaveLength(0);
    await mount(p);
    const ev = section('evidence');
    expect(ev.textContent).toMatch(/no OPEN request is recorded against this engagement/i);
    expect(ev.textContent).toMatch(/not a statement that nothing is needed/i);
    expect(ev.textContent).toMatch(/one that was never entered cannot appear here/i);
    // And nothing in the section congratulates anyone.
    expect(ev.textContent).not.toMatch(/all clear|nothing to worry|up to date/i);
  });

  it('does not read an absent deliverable list as work that does not exist', async () => {
    const p = payload({ deskLoad: overCeiling });
    expect(p.acceptance.rows).toHaveLength(0);
    await mount(p);
    expect(section('acceptance').textContent).toMatch(/a statement about what has been ENTERED, not about what a partner has produced/i);
  });

  it('reports a failed load as a failure, never as an empty desk', async () => {
    vi.mocked(api.fetchGpsDelivery).mockRejectedValue(new Error('502 from the API'));
    render(
      <MemoryRouter initialEntries={['/gps/delivery?engagementId=e-1']}>
        <GpsDelivery />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Delivery desk unavailable/i)).toBeTruthy());
    expect(document.body.textContent).toMatch(/502 from the API/);
    expect(document.body.textContent).toMatch(/no part of this should be read as "clear"/i);
    // Nothing was rendered that could be mistaken for data.
    expect(document.querySelector('section[aria-labelledby="plan-h"]')).toBeNull();
  });

  it('asks for an engagement rather than inventing one when the URL names none', async () => {
    render(
      <MemoryRouter initialEntries={['/gps/delivery']}>
        <GpsDelivery />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No engagement selected/i)).toBeTruthy();
    expect(api.fetchGpsDelivery).not.toHaveBeenCalled();
  });
});

/* ── 7 · D4 · D6 · D7 ───────────────────────────────────────────────────────── */

describe('the system argues back, on the keyboard, on paper', () => {
  it('renders the notices in the composer order, hardest first, mechanisms attached (D4)', async () => {
    const p = payload({ liveMilestones: liveBlocked, evidence: chaseRows, deliverables, deskLoad: overCeiling });
    // The order is the composer's (deliveryView NOTICE_ORDER), not the page's.
    const codes = p.notices.map((n) => n.code);
    expect(codes[0]).toBe('wip_over_ceiling');
    expect(codes).toContain('acceptance_review_outstanding');
    expect(codes[codes.length - 1]).toBe('coordination_hours_are_placeholders');

    await mount(p);
    const body = document.body.textContent ?? '';
    // Each notice's text appears, and the rendered order matches the payload order.
    const positions = p.notices.map((n) => body.indexOf(n.text));
    expect(positions.every((i) => i >= 0)).toBe(true);
    const railOrder = p.notices.map((n) => n.code.replace(/_/g, ' '));
    let cursor = 0;
    for (const label of railOrder) {
      const at = body.indexOf(label, cursor);
      expect(at).toBeGreaterThanOrEqual(0);
      cursor = at;
    }
    // A placeholder badge is NOT hidden behind a disclosure control.
    expect(body).toMatch(/Coordination hours per engagement and the weekly ceiling are PLACEHOLDERS/);
  });

  it('moves focus to a named section heading on a digit press, and stands down for typing (D6)', async () => {
    // jsdom implements no layout, so `scrollIntoView` is absent on Element. The page
    // reaches it through `scrollToId`; stubbing it here is this test owning the jsdom
    // gap rather than the page carrying a guard for a browser that does not exist.
    const stub = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: stub, writable: true, configurable: true });

    await mount(payload({ liveMilestones: liveBlocked, evidence: chaseRows, deskLoad: overCeiling }));

    await userEvent.keyboard('3');
    expect(document.activeElement).toBe(document.getElementById('evidence-h'));
    await userEvent.keyboard('5');
    expect(document.activeElement).toBe(document.getElementById('wip-h'));
    expect(stub).toHaveBeenCalled();

    // Every count is a real tab stop, so the D1 drawers are reachable without a mouse.
    expect(screen.getAllByRole('button', { name: /open the rows/i }).length).toBeGreaterThan(10);
  });

  it('prints as a dated dossier with the controls excluded (D7)', async () => {
    const p = payload({ liveMilestones: liveBlocked, evidence: chaseRows, deliverables, deskLoad: overCeiling });
    await mount(p);

    // The print stylesheet is mounted, and it is the shared one.
    expect(document.querySelector('style')!.textContent).toMatch(/@media print/);
    // Controls are excluded from the print job rather than styled around.
    expect(document.querySelectorAll('.br-no-print').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Print dossier/i }).closest('.br-no-print')).toBeTruthy();
    // Dated, and named. A printed page with no timestamp is a page that ages silently.
    expect(document.body.textContent).toContain(`composed ${ASOF}`);
    expect(document.body.textContent).toMatch(/GPS delivery dossier · engagement e-1/);
    /*
     * THE DOSSIER FOOTER, ASSERTED AS THE NARROWED CLAIM IT IS NOW.
     *
     * It used to read "read-only: this surface records nothing", full stop, and this
     * assertion matched that. On 2026-08-02 the page gained a Documents section that
     * uploads and deletes client files, so the unqualified sentence became false — on a
     * page whose whole purpose is to be printed and handed to somebody.
     *
     * Both halves are required, and requiring both is the point: the scope ("delivery
     * facts") without the exception is the old falsehood with a hedge in front of it, and
     * the exception without the scope loses the property that actually matters on a
     * printed dossier — that no milestone, acceptance or review state can be changed from
     * it.
     */
    expect(document.body.textContent, 'the dossier no longer scopes its read-only claim to delivery facts')
      .toMatch(/delivery\s+facts are read-only: this surface records nothing about whether work happened/);
    expect(document.body.textContent, 'the dossier claims to record nothing without naming the document writes it does perform')
      .toMatch(/only writes are storing and deleting the documents/i);
    expect(document.body.textContent, 'the dossier has gone back to the unqualified claim that it records nothing at all')
      .not.toMatch(/read-only: this surface records nothing\./);
  });
});

/* ── 8 · THE RATCHETS ───────────────────────────────────────────────────────── */

const SRC = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');

/**
 * Strip comments before scanning source.
 *
 * Both files below DISCUSS `href` and `upload` at length, in prose, precisely because
 * the prohibitions need explaining. A naive text scan would therefore fire on the
 * documentation of the rule it is enforcing — which is how a ratchet gets deleted for
 * being annoying instead of being obeyed.
 *
 * HONEST LIMIT: this strips `//` inside string literals too, so a URL literal would be
 * mangled. Neither file contains one, and if one is ever added the scan below gets
 * MORE permissive rather than less, so the failure mode is a missed offender and not a
 * false alarm — worth stating rather than discovering.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('the ratchets — these guard an absence, so they must go red on a good-faith edit', () => {
  it('the page has no link, no anchor, no window.open and no navigable reference, anywhere in its code', () => {
    const code = stripComments(read('pages/GpsDelivery.tsx'));
    expect(code).not.toMatch(/href\s*=/);
    expect(code).not.toMatch(/<a[\s>]/);
    expect(code).not.toMatch(/window\.open/);
    expect(code).not.toMatch(/target\s*=\s*["'{]/);
    // Nor a route out to the material by another name.
    expect(code).not.toMatch(/\b(?:downloadUrl|fileUrl|previewUrl|signedUrl|presigned)\b/i);
  });

  /**
   * ══ RE-POINTED 2026-08-02 ═════════════════════════════════════════════════
   * This assertion read `GpsDelivery.tsx` for a file input and found none — because the
   * intake that shipped that day lives in `components/gps/ArtifactIntake.tsx`, which this
   * page renders. It stayed green through the change it existed to catch.
   *
   * The claim now: this page BUILDS no intake of its own, it DELEGATES to the one
   * reviewed component. That is the property worth holding. A hand-rolled `<input
   * type="file">` beside the reviewed one would have its own idea of the size ceiling, the
   * accepted types and the two-step download, and all three being wrong is invisible until
   * a client asks what happened to their file.
   */
  it('the page builds no intake of its own — it delegates to the one reviewed component', () => {
    const code = stripComments(read('pages/GpsDelivery.tsx'));
    expect(code, 'GpsDelivery.tsx declares its own file input instead of rendering <ArtifactIntake>').not.toMatch(/type\s*=\s*["'{]?file/i);
    expect(code, 'GpsDelivery.tsx builds its own upload body shape').not.toMatch(/FormData|multipart|FileReader|DataTransfer|onDrop|dropzone/i);
    expect(code).not.toMatch(/navigator\.clipboard/);
    expect(code, 'GpsDelivery.tsx encodes bytes itself — a document must never become a data URL on this page').not.toMatch(/\bbase64\b|toDataURL|createObjectURL/i);
    // And the delegation is real: without this the three absences above are once again a
    // description of a page with no document handling at all.
    expect(code, 'GpsDelivery.tsx no longer renders the reviewed intake component').toMatch(/<ArtifactIntake\b/);
    expect(code, 'the intake is mounted without an engagement to scope the documents to').toMatch(/<ArtifactIntake\s+engagementId=/);
  });

  it('the reviewed intake component is the only thing that writes, and it speaks the route\'s contract', () => {
    /*
     * The controls the page delegated to, asserted where they actually live. The upload
     * route takes a RAW body with `X-Artifact-Filename` (apps/api/src/routes/gpsArtifact.ts),
     * so FormData here is a guaranteed 400 — and it is the shape a first draft reaches for,
     * which is exactly why it is pinned.
     */
    const intake = stripComments(read('components/gps/artifactIntakeApi.ts'));
    expect(intake.length, 'the intake client is missing — every absence asserted above proves nothing').toBeGreaterThan(500);
    expect(intake, 'the intake client posts FormData; the route takes a raw body and would 400').not.toMatch(/FormData/);
    expect(intake, 'the intake client no longer sends the filename header the route requires').toMatch(/[Xx]-[Aa]rtifact-[Ff]ilename/);
    // The download is a two-step grant, and the credential travels in a header — never in
    // a URL, which lands in browser history, referrers and server logs.
    expect(intake, 'the intake client no longer mints a download grant before fetching bytes').toMatch(/download-url/);
    expect(intake, 'a client-document credential appears in a query string').not.toMatch(/\?grant=|&grant=/);
  });

  it('the page WRITES no delivery fact — its only mutations are the documents', () => {
    /*
     * NARROWED, NOT DROPPED. The page still cannot move a milestone, record a review or
     * accept a deliverable: those are the writes a printed dossier must not be able to
     * perform, and `fetchGpsDelivery` being the module's only export is what holds it.
     * Document storage is the named exception and it goes through a different module.
     */
    const code = stripComments(read('pages/GpsDelivery.tsx'));
    expect(code, 'GpsDelivery.tsx issues its own mutating request').not.toMatch(/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
    // The delivery fetcher is a read module and has exactly one function.
    expect(Object.keys(api).sort()).toEqual(['fetchGpsDelivery']);
  });

  it('the delivery fetcher stays a read module, and declares no response type of its own', () => {
    // The EXPORT LIST, not the prose — the same shape of ratchet `gps.test.tsx` uses,
    // for the same reason: the docblock has to be allowed to name what is forbidden.
    // Document calls belong to `components/gps/artifactIntakeApi.ts`; their arrival HERE
    // would put a write on the module every read surface imports.
    for (const name of Object.keys(api)) {
      expect(name).not.toMatch(/upload|attach|file|document|artifact|multipart|blob/i);
    }
    const code = stripComments(read('lib/api/gpsDelivery.ts'));
    // The response shape lives in packages/shared/src/gps/deliveryView.ts and is
    // imported. A local `interface DeliveryResponse` here is the bug that took
    // production down this week.
    expect(code).not.toMatch(/interface\s+\w*(?:Delivery|Acceptance|Evidence|Plan|Wip)\w*\s*\{/);
    expect(code).toMatch(/import type \{ DeliveryResponse \} from '@lcx\/shared'/);
  });

  it('the page declares no response shape of its own either', () => {
    const code = stripComments(read('pages/GpsDelivery.tsx'));
    // Local presentational prop types are fine and expected; a redeclared wire shape
    // is not. These five names are the wire's, and they may only be imported.
    for (const name of ['DeliveryResponse', 'EngagementPlan', 'ProgressView', 'EvidenceChase', 'AcceptanceView', 'WipView']) {
      expect(code).not.toMatch(new RegExp(`(?:interface|type)\\s+${name}\\b`));
    }
    expect(code).toMatch(/from '@lcx\/shared'/);
  });
});
