import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GpsOrigination } from '../GpsOrigination';
import * as api from '@/lib/api/gpsOrigination';

/**
 * THE ORIGINATION QUEUE — the four guards, and one deliberate methodology choice.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE FIXTURE IS BUILT BY THE REAL ENGINE, NOT WRITTEN BY HAND.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `lib/api/gps.ts:60` records what happens otherwise: a hand-written payload for
 * `GpsSummary` described fields the API had never returned, the page was written
 * against the same invention, and the mocked test agreed with both. Two wrongs
 * agreeing is not a passing test — it shipped a page guaranteed to crash the moment
 * `0047_gps.sql` was applied.
 *
 * So the payloads below come out of `buildOriginationQueue()`, `originationResponse()`
 * and `sealBrief()` — the same functions the API route calls. The API module is still
 * mocked (this is a component test; there is no server), but what it RESOLVES is
 * engine output, so a change to `QueueRow` or `RefusalEntry` breaks this test rather
 * than sliding past it. That is the difference between mocking the transport and
 * inventing the contract.
 *
 * The direct import from `packages/shared/src/gps/origination.js` is the same path
 * `lib/api/gpsOrigination.ts` documents: `gps/index.ts` does not re-export
 * origination yet and the barrels belong to the wiring pass.
 *
 * WHAT THESE TESTS CANNOT SEE, stated plainly: jsdom has no layout and no paint. The
 * doctrine's "visually distinct" and "first-class panel" claims are asserted here as
 * structure — a wall entry and a task entry carry different marker classes and
 * different text, every gate reason is in the DOM untruncated and not behind a
 * disclosure control — which is a real regression guard and is not a claim about what
 * a human perceives.
 */
import {
  buildOriginationQueue,
  factProvenance,
  originationResponse,
  resolveTrigger,
  sealBrief,
  type BriefAssertion,
  type OriginationInput,
  type TriggerInput,
} from '../../../../../packages/shared/src/gps/origination.js';
import type { GpsTarget } from '../../../../../packages/shared/src/gps/targeting.js';
import type { TargetRecord } from '../../../../../packages/shared/src/gps/targetRecord.js';

vi.mock('@/lib/api/gpsOrigination', async () => {
  // The real module is passed through for everything except the fetchers and the
  // cure save, so `provenanceLabel` and the section constants under test are the
  // shipped ones.
  const actual = await vi.importActual<typeof api>('@/lib/api/gpsOrigination');
  return {
    ...actual,
    fetchOriginationQueue: vi.fn(),
    fetchTargetBrief: vi.fn(),
    fetchTargetRecords: vi.fn(),
    saveTargetRecord: vi.fn(),
  };
});

const ASOF = '2026-07-31T00:00:00.000Z';
const asOfMs = Date.parse(ASOF);
const daysAgo = (d: number): string => new Date(asOfMs - d * 86_400_000).toISOString();

/** Passes every gate on the weakest possible evidence — mirrors the shared fixture. */
const BARE: GpsTarget = {
  id: 't-bare',
  name: 'Bare Passing Target',
  screening: 'clear',
  perimeter: 'in_perimeter',
  conflict: 'cleared',
  decisionMaker: { name: 'A. Sponsor', role: 'CFO', isBudgetHolder: true },
  demandsGuaranteedOutcome: false,
  materiallyMisleading: false,
  capitalProxyCents: 10_000_000,
};
const input = (over: Partial<GpsTarget>, rest: Omit<OriginationInput, 'target'> = {}): OriginationInput => ({
  target: { ...BARE, ...over },
  ...rest,
});

const TRIGGER: TriggerInput = {
  kind: 'regulatory_deadline',
  statement: 'Published a MiCA white-paper deadline of 30 September in their own investor update.',
  occurredIso: daysAgo(10),
  source: { sourceId: 'news', credibility: 2, observedIso: daysAgo(10) },
};

/**
 * Two eligible targets and two refused ones — a WALL (sanctions concern, not
 * curable) and a TASK (conflict not yet checked, curable). Built by the engine.
 */
function payload() {
  const queue = buildOriginationQueue(
    [
      input(
        {
          id: 't-eligible',
          name: 'Eligible Co',
          identifiedNeeds: ['mica_whitepaper'],
          statedBudgetCents: 2_500_000,
          evidence: { reliability: 'B', credibility: 2, ageDays: 12 },
        },
        {
          trigger: TRIGGER,
          facts: [
            { field: 'statedBudgetCents', label: 'Stated budget', sourceId: 'news', reliability: 'B', credibility: 2, observedIso: daysAgo(12) },
          ],
        },
      ),
      input({ id: 't-quiet', name: 'Quiet Co' }),
      input({ id: 't-wall', name: 'Sanctioned Co', screening: 'concern' }),
      input({ id: 't-task', name: 'Unchecked Co', conflict: 'unresolved' }),
    ],
    { asOf: ASOF },
  );
  return originationResponse(queue, '2026-08-01T09:00:00.000Z');
}

/** A brief carrying one SOURCED claim, one UNVERIFIED claim, and derived unknowns. */
function brief() {
  const sourced: BriefAssertion = {
    id: 'a1',
    section: 'ability_to_pay',
    text: 'They closed a $4m round in June 2026.',
    status: 'SOURCED',
    provenance: factProvenance(
      { field: 'capitalProxyCents', sourceId: 'news', reliability: 'B', credibility: 2, observedIso: daysAgo(20) },
      asOfMs,
    ),
  };
  const unverified: BriefAssertion = {
    id: 'a2',
    section: 'need',
    text: 'We believe their counsel has told them the white paper is late.',
    status: 'UNVERIFIED',
    provenance: null,
  };
  return {
    generatedIso: '2026-08-01T09:00:00.000Z',
    brief: sealBrief(
      {
        targetId: 't-eligible',
        name: 'Eligible Co',
        asOf: ASOF,
        score: 62,
        confidence: 58,
        band: 'medium' as const,
        gates: [],
        assertions: [sourced, unverified],
        unknowns: ['Access — not established.', 'No why-now trigger recorded.'],
        trigger: resolveTrigger(TRIGGER, asOfMs),
        proposedOpening: null,
      },
      '2026-08-01T09:00:00.000Z',
    ),
    refusal: null,
  };
}

const mocked = api as unknown as {
  fetchOriginationQueue: ReturnType<typeof vi.fn>;
  fetchTargetBrief: ReturnType<typeof vi.fn>;
  fetchTargetRecords: ReturnType<typeof vi.fn>;
  saveTargetRecord: ReturnType<typeof vi.fn>;
};

/**
 * The stored row behind the TASK entry, as GET /origination/targets returns it —
 * same target the engine refused above, wrapped in the record the cure form must
 * ROUND-TRIP. `evidenceObservedIso` is the field whose loss would undate the
 * evidence on every cure; the tests below assert it survives the save verbatim.
 */
const TASK_RECORD: TargetRecord = {
  target: { ...BARE, id: 't-task', name: 'Unchecked Co', conflict: 'unresolved' },
  status: 'watchlist',
  clientId: null,
  createdBy: 'nik',
  createdIso: daysAgo(3),
  updatedIso: daysAgo(1),
  evidenceObservedIso: daysAgo(9),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.fetchOriginationQueue.mockResolvedValue(payload());
  mocked.fetchTargetBrief.mockResolvedValue(brief());
  mocked.fetchTargetRecords.mockResolvedValue([TASK_RECORD]);
  mocked.saveTargetRecord.mockResolvedValue({ data: {} });
});

/* ── 1 (D2). A gated target is ABSENT from the queue and PRESENT in the ledger ── */

describe('the refusal ledger, not a silent exclusion', () => {
  it('a gated target does not render in the queue but does render in the ledger with its reason', async () => {
    render(<GpsOrigination />);
    await waitFor(() => expect(screen.getByTestId('queue-row-t-eligible')).toBeInTheDocument());

    // ABSENT from the rows. Asserted on the row testid rather than on the name,
    // because the name is legitimately present elsewhere on the page — in the
    // ledger — and a test that only checked "the string is gone" would pass on a
    // page that had dropped the refusal entirely, which is the exact defect.
    expect(screen.queryByTestId('queue-row-t-wall')).not.toBeInTheDocument();
    expect(screen.queryByTestId('queue-row-t-task')).not.toBeInTheDocument();

    // PRESENT in the ledger, WITH the gate and the reason the engine wrote.
    const wall = screen.getByTestId('refusal-t-wall');
    expect(within(wall).getByText('Sanctioned Co')).toBeInTheDocument();
    // The gate key AND its sentence, so both matches are expected here.
    expect(within(wall).getAllByText(/sanctions/i).length).toBeGreaterThan(1);
    const reason = payload().queue.refusals.entries.find((e) => e.targetId === 't-wall')!.primary.reason;
    expect(wall.textContent).toContain(reason);
  });

  it('a WALL and a TASK are distinguished by text and by marker, not by colour alone', async () => {
    render(<GpsOrigination />);
    const wall = await screen.findByTestId('refusal-t-wall');
    const task = await screen.findByTestId('refusal-t-task');

    expect(wall.textContent).toMatch(/wall — walk away/i);
    expect(task.textContent).toMatch(/task — recoverable/i);
    // The border marker differs too, so the distinction survives a greyscale print.
    expect(wall.className).toContain('border-l-red-500');
    expect(task.className).toContain('border-l-amber-500');
    // A curable gate prints its remedy; an uncurable one says there is none rather
    // than leaving a blank that invites someone to go looking for one.
    expect(task.textContent).toMatch(/→ /);
    expect(wall.textContent).toMatch(/no remedy/i);
  });

  it('every gate key is tallied, including the ones that never fired', async () => {
    render(<GpsOrigination />);
    // An absent key reads as "not checked"; a visible zero reads as "checked,
    // nothing found". They are different claims.
    for (const key of Object.keys(payload().queue.refusals.byGate)) {
      expect(await screen.findByTestId(`gate-tally-${key}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('gate-tally-materially_misleading').textContent).toMatch(/0$/);
  });
});

/* ── 2 (D3). Confidence is rendered BESIDE the score, never inside it ────────── */

describe('confidence is a separate reading', () => {
  it('score and confidence render in different cells, and the score cell holds only the score', async () => {
    render(<GpsOrigination />);
    const row = payload().queue.rows.find((r) => r.targetId === 't-eligible')!;

    const score = await screen.findByTestId('score-t-eligible');
    const conf = screen.getByTestId('conf-t-eligible');

    // The score cell's entire text is the score. If a future edit blends confidence
    // in — `score * confidence / 100` or a "quality-adjusted" figure — this fails.
    expect(score.textContent).toBe(String(row.score));
    expect(conf.textContent).toContain(String(row.confidence));
    expect(conf.textContent).toContain(row.band);

    // Two cells, not one: neither contains the other.
    expect(score.contains(conf)).toBe(false);
    expect(conf.contains(score)).toBe(false);
    expect(score.closest('td')).not.toBe(conf.closest('td'));
  });

  it('the score opens its full driver trail — all six factors, signed (D1)', async () => {
    render(<GpsOrigination />);
    const score = await screen.findByTestId('score-t-eligible');
    await userEvent.click(score);

    const row = payload().queue.rows.find((r) => r.targetId === 't-eligible')!;
    expect(row.drivers.length).toBeGreaterThan(0);
    // Scoped to the trail row: the top three also appear inline in the queue row, and
    // an unscoped query would pass on a trail that only repeated those three.
    const trail = await screen.findByTestId('trail-t-eligible');
    // Every driver label, including any contributing exactly zero — a zero factor is
    // a finding ("we know nothing about their access"), not noise to drop.
    for (const d of row.drivers) {
      expect(within(trail).getByText(d.label)).toBeInTheDocument();
    }
    expect(within(trail).getByText('raw sum')).toBeInTheDocument();
    // The confidence trail is here too, and it is labelled as a separate computation.
    expect(trail.textContent).toMatch(/never multiplied into the score/i);
  });
});

/* ── 3 + 4 (D8). The brief marks UNVERIFIED, and lists what we do not know ──── */

describe('the research brief', () => {
  it('marks an UNVERIFIED claim as unverified and gives a SOURCED claim its grade and age', async () => {
    render(<GpsOrigination />);
    const row = await screen.findByTestId('queue-row-t-eligible');
    await userEvent.click(within(row).getByRole('button', { name: 'Eligible Co' }));

    const panel = await screen.findByTestId('brief');

    // The unverified claim carries the label, not merely an absent grade chip.
    const unverified = within(panel).getByTestId('assertion-a2');
    expect(within(unverified).getByTestId('unverified-a2').textContent).toMatch(/unverified/i);
    expect(unverified.textContent).toContain('We believe their counsel has told them the white paper is late.');

    // The sourced one carries grade + age + source, from `provenanceLabel` — which
    // always prints the age, so a stale B2 cannot render like a fresh A1.
    const sourced = within(panel).getByTestId('assertion-a1');
    expect(within(sourced).queryByTestId('unverified-a1')).not.toBeInTheDocument();
    expect(sourced.textContent).toMatch(/B2 · 20d/);

    // And the integrity verdict is printed, with the composition it counted.
    const integrity = within(panel).getByTestId('brief-integrity');
    expect(integrity.textContent).toMatch(/integrity ok/i);
    expect(integrity.textContent).toMatch(/unverified/i);
  });

  it('renders unknowns as a first-class section', async () => {
    render(<GpsOrigination />);
    const row = await screen.findByTestId('queue-row-t-eligible');
    await userEvent.click(within(row).getByRole('button', { name: 'Eligible Co' }));

    const unknowns = await screen.findByTestId('brief-unknowns');
    expect(within(unknowns).getByText(/what we do not know/i)).toBeInTheDocument();
    expect(unknowns.textContent).toContain('Access — not established.');
    expect(unknowns.textContent).toContain('No why-now trigger recorded.');
  });

  it('opens on ⏎ from the keyboard cursor (D6)', async () => {
    render(<GpsOrigination />);
    await screen.findByTestId('queue-row-t-eligible');
    const body = document.querySelector('tbody')!;
    // The list is ONE tab stop with a roving tabindex: exactly one row is focusable,
    // so Tab enters and leaves the table in one press instead of visiting every row.
    const stops = body.querySelectorAll<HTMLElement>('[data-list-row][tabindex="0"]');
    expect(stops.length).toBe(1);

    // Focused directly rather than by pressing Tab from the top of the page: what is
    // under test is the row's Enter binding, not how many controls precede the table.
    stops[0].focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(mocked.fetchTargetBrief).toHaveBeenCalled());
  });
});

/* ── The honest empty state ─────────────────────────────────────────────────── */

describe('empty and absent states', () => {
  it('zero targets says "no watchlist yet" and does not render a table', async () => {
    mocked.fetchOriginationQueue.mockResolvedValue(
      originationResponse(buildOriginationQueue([], { asOf: ASOF }), '2026-08-01T09:00:00.000Z'),
    );
    render(<GpsOrigination />);
    expect(await screen.findByText(/no watchlist yet/i)).toBeInTheDocument();
    expect(document.querySelector('tbody')).toBeNull();
  });

  it('a row with no why-now says so rather than leaving the cell blank', async () => {
    render(<GpsOrigination />);
    const quiet = await screen.findByTestId('queue-row-t-quiet');
    expect(quiet.textContent).toMatch(/not a reason to call today/i);
  });

  it('there is no send, approve or outreach control anywhere on this surface', async () => {
    // Slice 8.5 produces a DRAFT opening; approval is a human act on the existing
    // send gate. `approvedForSend` is the literal `false` in the shared type, and
    // this asserts the screen has not grown a shortcut around it.
    render(<GpsOrigination />);
    await screen.findByTestId('queue-row-t-eligible');
    for (const label of [/^send/i, /^approve/i, /^email/i, /^outreach/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });
});

/* ── The cure form — the remedy finally has somewhere to be performed ─────────── */

describe('the cure form', () => {
  it('a TASK offers the cure; a WALL does not — same asymmetry as the remedy line', async () => {
    render(<GpsOrigination />);
    await screen.findByTestId('refusal-t-task');
    expect(screen.getByTestId('cure-open-t-task')).toBeInTheDocument();
    expect(screen.queryByTestId('cure-open-t-wall')).not.toBeInTheDocument();
  });

  it('round-trips the WHOLE record: untouched fields survive, the edit lands, the evidence stays dated', async () => {
    const user = userEvent.setup();
    render(<GpsOrigination />);
    await user.click(await screen.findByTestId('cure-open-t-task'));
    const form = await screen.findByTestId('cure-form-t-task');

    // Prefilled from the stored row, not blank: the form edits a record, it does
    // not draft one.
    expect(screen.getByLabelText('Decision maker — name')).toHaveValue('A. Sponsor');
    expect(screen.getByLabelText('Capital proxy (USD)')).toHaveValue('100000');

    await user.selectOptions(screen.getByLabelText('Conflict decision'), 'cleared');
    await user.click(within(form).getByTestId('cure-save-t-task'));

    await waitFor(() => expect(mocked.saveTargetRecord).toHaveBeenCalledTimes(1));
    const body = mocked.saveTargetRecord.mock.calls[0][0] as Record<string, unknown>;
    // The edit.
    expect(body.conflict).toBe('cleared');
    // The round-trip: nothing shown or unshown was reset by the replace-save.
    expect(body.id).toBe('t-task');
    expect(body.name).toBe('Unchecked Co');
    expect(body.screening).toBe('clear');
    expect(body.perimeter).toBe('in_perimeter');
    expect(body.decisionMakerName).toBe('A. Sponsor');
    expect(body.decisionMakerRole).toBe('CFO');
    expect(body.decisionMakerIsBudgetHolder).toBe(true);
    expect(body.capitalProxyCents).toBe(10_000_000);
    expect(body.statedBudgetCents).toBeNull();
    // The instant the derived view used to drop: it survives the save verbatim,
    // so curing a target does not silently undate its evidence.
    expect(body.evidence).toEqual({ reliability: null, credibility: null, observedIso: TASK_RECORD.evidenceObservedIso });
    // The ledger re-evaluates: the queue is re-fetched after the save.
    await waitFor(() => expect(mocked.fetchOriginationQueue).toHaveBeenCalledTimes(2));
  });

  it('refuses a non-numeric money field with a sentence, and nothing is saved', async () => {
    const user = userEvent.setup();
    render(<GpsOrigination />);
    await user.click(await screen.findByTestId('cure-open-t-task'));
    await screen.findByTestId('cure-form-t-task');
    await user.clear(screen.getByLabelText('Stated budget (USD)'));
    await user.type(screen.getByLabelText('Stated budget (USD)'), 'about twenty grand');
    await user.click(screen.getByTestId('cure-save-t-task'));
    expect(await screen.findByTestId('cure-save-error')).toHaveTextContent(/non-negative dollar amounts/i);
    expect(mocked.saveTargetRecord).not.toHaveBeenCalled();
  });
});
