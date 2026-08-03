/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GPS PHASE 11 — the instrument, mounted
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Four pieces of apparatus were built and none of them was reachable: the inspector, the
 * split, the print sheet and the feel layer each shipped with "nothing imports this yet" in
 * its own header. That is the defect this file exists to prevent recurring — a generator or
 * a component nobody calls is the same defect one layer along, and it passes its own tests.
 *
 * So every assertion here goes through a RENDERED PAGE, not through the component. The
 * component tests next door (`components/gps/__tests__/`) already prove the drawer focuses,
 * the pane registers nothing and the notices print; what they cannot prove is that an
 * operator on `/gps` can get to any of it.
 *
 * WHAT jsdom CANNOT SEE, stated: no layout, so the DOCKED half of the split is unreachable
 * here — `useEvidenceDock` reads a media query jsdom answers false to, so `available` is
 * false and the inspector always renders as the drawer. The docked path is asserted in
 * `components/gps/__tests__/gpsSplit.test.tsx`, which sets the width itself. And no paint,
 * so "the write feels different" is asserted as the live-region announcement and the
 * `feedback` channel chosen, never as a perceived animation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { getOffer } from '@lcx/shared';
import { Gps } from '../Gps';
import * as gpsApi from '@/lib/api/gps';

vi.mock('@/lib/api/gps', () => ({
  fetchGpsSummary: vi.fn(),
  fetchGpsClients: vi.fn(),
  fetchGpsEngagements: vi.fn(),
  createGpsClient: vi.fn(),
  createGpsEngagement: vi.fn().mockResolvedValue(undefined),
  issueGpsProposal: vi.fn().mockResolvedValue(undefined),
  recordGpsConflictCheck: vi.fn().mockResolvedValue(undefined),
}));

/**
 * The feel stack is SPIED, not stubbed out: `signalGps` is real (it is the thing under
 * test — which channel it picks) and only the four DOM-touching primitives underneath it
 * are recorded. Mocking `gpsFeel` itself would assert that the page calls a function,
 * which is not the property that matters.
 */
const announced: { text: string; politeness: string }[] = [];
const channels: string[] = [];
vi.mock('@/lib/juice', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  announce: (text: string, politeness = 'polite') => { announced.push({ text, politeness }); },
}));
vi.mock('@/lib/feedback', () => ({
  feedback: {
    commit: () => { channels.push('commit'); },
    refuse: () => { channels.push('refuse'); },
    refuseQuiet: () => { channels.push('refuseQuiet'); },
    became: (_el: unknown, tint: string) => { channels.push(`became:${tint}`); },
  },
}));

const OFFER = getOffer('mica_whitepaper');

const summary = (): gpsApi.GpsSummary => ({
  migrated: true,
  clients: { total: 1, byStatus: { prospect: 1 } },
  engagements: { total: 1, byStatus: { draft: 1 }, byOffer: { mica_whitepaper: 1 } },
  openByCurrency: [],
  collectedByCurrency: [],
  awaitingDeposit: { count: 0, byCurrency: [], oldestAcceptedDays: null },
  gaps: {
    missingConflictCheck: 0, conflictDeclined: 0, unpriced: 0,
    depositWithoutAcceptance: 0, unstaffable: 0,
  },
  catalogue: {
    priceBandsArePlaceholders: true, depositPolicyIsPlaceholder: true, blockingTodoCount: 2,
  },
} as never);

const client = {
  id: 'c-1', name: 'Probe Chain', legalEntity: null, jurisdiction: 'Liechtenstein',
  primaryContact: null, status: 'prospect' as const,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

const engagement = (over: Partial<gpsApi.GpsEngagementRow> = {}): gpsApi.GpsEngagementRow => ({
  id: 'e-1', clientId: 'c-1', clientName: 'Probe Chain', projectId: null,
  offerKey: 'mica_whitepaper', contractingEntity: 'lcx', scopeSnapshot: {},
  priceCents: 1_750_000, vendorCostCents: OFFER.expectedVendorCostCents + 1,
  currency: 'USD', status: 'draft', owner: 'nik',
  depositRequiredCents: 0, depositPaidAt: null, acceptedAt: null,
  createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
  conflict: null,
  ...over,
});

const mount = async (rows: gpsApi.GpsEngagementRow[]) => {
  vi.mocked(gpsApi.fetchGpsSummary).mockResolvedValue(summary());
  vi.mocked(gpsApi.fetchGpsClients).mockResolvedValue([client] as never);
  vi.mocked(gpsApi.fetchGpsEngagements).mockResolvedValue(rows);
  render(<MemoryRouter><Gps /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('gps-engagements')).toBeTruthy());
};

beforeEach(() => {
  vi.clearAllMocks();
  announced.length = 0;
  channels.length = 0;
});

describe('the inspector is reachable from the quote desk', () => {
  it('is closed until asked for, so a list of twelve is still a list', async () => {
    await mount([engagement()]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /provenance of the/i })).toHaveAttribute(
      'aria-pressed', 'false',
    );
  });

  it('opens on the row and shows the provenance grade first', async () => {
    // THE MUTATION THAT PROVES THIS: remove `<GpsSplit>` from EngagementList and this goes
    // red with no dialog — which is the state every one of the four owners shipped in.
    await mount([engagement()]);
    await userEvent.click(screen.getByRole('button', { name: /provenance of the/i }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText(/^Provenance ·/)).toBeTruthy();
  });

  it('says the vendor cost may be the catalogue constant rather than a typed figure', async () => {
    // The single most consequential sentence on the sheet: it is the difference between a
    // margin that is evidence and a margin that is a compiled guess.
    await mount([engagement({ vendorCostCents: OFFER.expectedVendorCostCents })]);
    await userEvent.click(screen.getByRole('button', { name: /provenance of the/i }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText(/indistinguishable from the catalogue/i)).toBeTruthy();
    /*
     * THE GRADE IS 'PART UNBACKED', NOT 'PART COMPILED', and the difference is worth
     * pinning rather than papering over. `gpsProvenanceGrade` ranks `absent` above
     * `placeholder` deliberately — a missing column cannot be fixed by a decision, only by a
     * migration — and every engagement has one: `gps_engagement` has no partner column. So
     * the headline grade is dominated by that for now, and the placeholder cost has to be
     * legible in its OWN row rather than in the grade. If the partner column ever lands, this
     * expectation flips to PART COMPILED while the bands are still placeholders, and that is
     * the correct failure.
     */
    expect(within(drawer).getByText(/PART UNBACKED/)).toBeTruthy();
  });

  it('carries the missing conflict check as a refusal with the gate cited', async () => {
    await mount([engagement()]);
    await userEvent.click(screen.getByRole('button', { name: /provenance of the/i }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText(/no conflict check is recorded/i)).toBeTruthy();
    expect(within(drawer).getByText(/gps_proposal_issue/)).toBeTruthy();
  });

  it('closes back to one row, and the toggle says so', async () => {
    await mount([engagement()]);
    const toggle = screen.getByRole('button', { name: /provenance of the/i });
    await userEvent.click(toggle);
    await screen.findByRole('dialog');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('inspects the row that was asked for, not the first one', async () => {
    // `subject` is looked up by id rather than held as an index, so a refresh that reorders
    // the list cannot move the inspector onto a different engagement.
    await mount([
      engagement(),
      engagement({ id: 'e-2', clientName: 'Second Chain' }),
    ]);
    const toggles = screen.getAllByRole('button', { name: /provenance of the/i });
    await userEvent.click(toggles[1]!);
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByTitle('Second Chain')).toBeTruthy();
  });
});

describe('a governed write feels like what it was', () => {
  it('announces a commit, which the juice alone never did', async () => {
    // WHY THIS MATTERS AND IS NOT DECORATION: under `prefers-reduced-motion` every juice
    // animation is 0.01ms, so before this a landed write was undetectable for that operator.
    // THE MUTATION THAT PROVES IT: delete the `signalGps(..., 'committed', ...)` call and
    // this goes red with nothing announced.
    await mount([engagement({
      conflict: { decision: 'cleared', decidedBy: 'desk', decidedAt: '2026-07-21T00:00:00.000Z' } as never,
    })]);
    await userEvent.click(screen.getByRole('button', { name: /issue proposal/i }));
    await waitFor(() => expect(gpsApi.issueGpsProposal).toHaveBeenCalledWith('e-1'));
    expect(channels).toContain('commit');
    expect(announced.map((a) => a.text).join(' ')).toContain('Proposal issued and recorded');
  });

  it('a refused write shakes and is announced assertively', async () => {
    const { ApiError } = await import('@/lib/apiClient');
    vi.mocked(gpsApi.issueGpsProposal).mockRejectedValue(
      new ApiError('A conflict check is required before a proposal may be issued.', 409),
    );
    await mount([engagement({
      conflict: { decision: 'cleared', decidedBy: 'desk', decidedAt: '2026-07-21T00:00:00.000Z' } as never,
    })]);
    await userEvent.click(screen.getByRole('button', { name: /issue proposal/i }));
    await waitFor(() => expect(channels).toContain('refuse'));
    expect(channels).not.toContain('became:warn');
  });

  it('a 5xx is UNDETERMINED and must not claim a rule stopped anyone', async () => {
    // The distinction the feel layer exists for. An unmigrated environment answers 503; a
    // red shake there would tell the operator a rule refused them, which is a claim about
    // the server nothing on the client can make.
    // THE MUTATION THAT PROVES THIS: replace `requestFeel(e)` with the literal 'refused'
    // and this goes red on `became:warn`.
    const { ApiError } = await import('@/lib/apiClient');
    vi.mocked(gpsApi.issueGpsProposal).mockRejectedValue(new ApiError('upstream unavailable', 503));
    await mount([engagement({
      conflict: { decision: 'cleared', decidedBy: 'desk', decidedAt: '2026-07-21T00:00:00.000Z' } as never,
    })]);
    await userEvent.click(screen.getByRole('button', { name: /issue proposal/i }));
    await waitFor(() => expect(channels).toContain('became:warn'));
    expect(channels).not.toContain('refuse');
  });
});
