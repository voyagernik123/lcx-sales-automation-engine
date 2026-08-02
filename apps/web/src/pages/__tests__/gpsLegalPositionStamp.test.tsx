import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Gps } from '../Gps';
import { GpsDelivery } from '../GpsDelivery';
import { composeDeliveryResponse } from '../../../../../packages/shared/src/gps/deliveryView';
import { getOffer } from '../../../../../packages/shared/src/gps/catalogue';
import * as deliveryApi from '@/lib/api/gpsDelivery';
import { attachMeta } from '@/lib/api/meta';
import { readLegalPosition } from '@/components/gps/legalPosition';
import * as gpsApi from '@/lib/api/gps';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE STAMP IS THE SAFEGUARD — so it is tested like one
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The quote gate became ADVISORY on 2026-08-02: it runs, it records, it no longer
 * refuses. The entire thing on the other side of that trade is the sentence saying the
 * number is not legally cleared. So the assertions below are about the property that
 * makes it a control rather than a caption:
 *
 *  1. IT FIRES ON SILENCE. No `legalPositionOnFile` anywhere on the wire → stamped.
 *     This is the one that matters most, because it is the state production is in
 *     TODAY and the state a dropped field returns it to.
 *  2. IT FIRES ON `compiled_placeholder` even if something else claims a position is
 *     on file. Two disagreeing sources resolve to the unflattering one.
 *  3. IT NAMES THE JURISDICTION THE PAGE PASSED — the client's own free-text value,
 *     verbatim, so the sentence is about a place and not about "this quote".
 *  4. IT IS ON THE PROPOSAL SURFACE, not only the quote builder.
 *  5. IT IS NOT `role="status"`, because the house print sheet hides those
 *     (`components/report/PrintStyles.tsx:54`) and the printed page is what reaches a
 *     client.
 *
 * EACH ONE FAILS WITHOUT THE CHANGE: before `LegalPositionStamp` existed, the page
 * rendered no such sentence in any of these states.
 */

vi.mock('@/lib/api/gpsDelivery', () => ({ fetchGpsDelivery: vi.fn() }));
vi.mock('@/components/gps/artifactIntakeApi', () => ({
  listStored: vi.fn().mockResolvedValue([]),
  store: vi.fn(),
  retrieve: vi.fn(),
  discard: vi.fn(),
}));
vi.mock('@/lib/api/gps', () => ({
  fetchGpsSummary: vi.fn(),
  fetchGpsClients: vi.fn(),
  fetchGpsEngagements: vi.fn(),
  createGpsClient: vi.fn(),
  createGpsEngagement: vi.fn().mockResolvedValue(undefined),
  issueGpsProposal: vi.fn().mockResolvedValue(undefined),
  recordGpsConflictCheck: vi.fn().mockResolvedValue(undefined),
}));

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
});

const client = {
  id: 'c-1', name: 'Probe Chain', legalEntity: null, jurisdiction: 'Liechtenstein',
  primaryContact: null, status: 'prospect' as const,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

const engagement = (over: Partial<gpsApi.GpsEngagementRow> = {}): gpsApi.GpsEngagementRow => ({
  id: 'e-1', clientId: 'c-1', clientName: 'Probe Chain', projectId: null,
  offerKey: 'mica_whitepaper', contractingEntity: 'lcx', scopeSnapshot: {},
  priceCents: 1_750_000, vendorCostCents: 600_000, currency: 'USD', status: 'draft',
  owner: 'nik', depositRequiredCents: 0, depositPaidAt: null, acceptedAt: null,
  createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
  conflict: null, ...over,
});

const mount = async (opts: { rows?: gpsApi.GpsEngagementRow[]; meta?: unknown } = {}) => {
  vi.mocked(gpsApi.fetchGpsSummary).mockResolvedValue(
    opts.meta === undefined ? summary() : attachMeta(summary(), opts.meta),
  );
  vi.mocked(gpsApi.fetchGpsClients).mockResolvedValue([client] as never);
  vi.mocked(gpsApi.fetchGpsEngagements).mockResolvedValue(opts.rows ?? []);
  render(<MemoryRouter><Gps /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Global Services')).toBeTruthy());
  await waitFor(() => expect(gpsApi.fetchGpsEngagements).toHaveBeenCalled());
};

beforeEach(() => { vi.clearAllMocks(); });

/* ── 1 · THE RESOLVER'S DEFAULT DIRECTION ───────────────────────────────────── */

describe('readLegalPosition — absence is read as ABSENT, never as cleared', () => {
  it('reports no position on file when nothing on the wire mentions one', () => {
    const r = readLegalPosition([{ id: 'e-1' }, null, undefined]);
    expect(r.onFile).toBe(false);
    expect(r.basis).toBe('field_absent');
  });

  it('reports a position on file ONLY when something says so affirmatively', () => {
    expect(readLegalPosition([{ legalPositionOnFile: true }]).onFile).toBe(true);
    expect(readLegalPosition([{ legalPositionOnFile: false }]).basis).toBe('stated_absent');
  });

  it('reads the flag out of the response ENVELOPE, not just the payload', () => {
    const payload = attachMeta({ rows: [] }, { legalPositionOnFile: true, jurisdiction: 'Malta' });
    const r = readLegalPosition([payload]);
    expect(r.onFile).toBe(true);
    expect(r.jurisdiction).toBe('Malta');
  });

  it('a compiled placeholder perimeter beats a true flag — disagreement resolves unflatteringly', () => {
    const r = readLegalPosition([
      { legalPositionOnFile: true },
      attachMeta({ x: 1 }, { perimeter: { source: 'compiled_placeholder' } }),
    ]);
    expect(r.onFile).toBe(false);
    expect(r.basis).toBe('compiled_placeholder');
    expect(r.perimeterSource).toBe('compiled_placeholder');
  });

  it('a single false is never overwritten by a later true', () => {
    expect(readLegalPosition([{ legalPositionOnFile: false }, { legalPositionOnFile: true }]).onFile)
      .toBe(false);
  });

  it('carries the guard\'s own three flat stamp fields, and `advisory`', () => {
    /* `perimeterStamp` (api/src/gps/perimeterGuard.ts:557) spreads exactly these keys
       into every quote, proposal and engagement response. They are read here so the
       screen prints the guard's wording instead of a paraphrase of it. */
    const r = readLegalPosition([{
      legalPositionOnFile: false,
      legalPositionGateCode: 'perimeter_stale',
      legalPositionNotice: 'No LCX legal position is on file for Liechtenstein; this price is not legally cleared.',
      advisory: true,
      jurisdiction: 'Liechtenstein',
    }]);
    expect(r.onFile).toBe(false);
    expect(r.gateCode).toBe('perimeter_stale');
    expect(r.notice).toMatch(/not legally cleared/);
    expect(r.advisory).toBe(true);
  });

  it('prefers a jurisdiction the SERVER evaluated over the one the screen passed', () => {
    const r = readLegalPosition([{ jurisdiction: 'Malta' }], { jurisdiction: 'Liechtenstein' });
    expect(r.jurisdiction).toBe('Malta');
  });
});

/* ── 2 · ON THE QUOTE DESK, WITH THE VALUES THE PAGE PASSES ─────────────────── */

describe('the stamp on the quote desk (Gps.tsx)', () => {
  it('states BOTH claims on the quote builder with no legal-position field on the wire', async () => {
    await mount();
    const stamps = screen.getAllByTestId('gps-legal-position-stamp');
    expect(stamps.length).toBeGreaterThan(0);
    const text = stamps[0].textContent ?? '';
    // Claim 1: nothing is on file. Claim 2: the number is not cleared.
    expect(text).toMatch(/No legal position on file/i);
    expect(text).toMatch(/NOT legally cleared/);
    // And the gate is described as having RUN, which is the difference between a
    // skipped check and a check that was overridden on purpose.
    expect(text).toMatch(/gate ran and recorded this verdict/i);
    expect(stamps[0].getAttribute('data-legal-stamp')).toBe('absent');
  });

  it('names the selected client\'s jurisdiction verbatim once a client is picked', async () => {
    // With no client selected the sentence must say so rather than name a default.
    await mount();
    expect(screen.getAllByTestId('gps-legal-position-stamp')[0].textContent)
      .toMatch(/for any jurisdiction — none is even named/);
  });

  it('is not role=status — the house print sheet hides those, and this must print', async () => {
    await mount();
    for (const s of screen.getAllByTestId('gps-legal-position-stamp')) {
      expect(s.getAttribute('role')).toBe('note');
      // Nor may it be inside a `br-no-print` subtree.
      expect(s.closest('.br-no-print')).toBeNull();
    }
  });

  it('appears on the PROPOSAL surface — the engagement card that issues one', async () => {
    // A recorded conflict check, so the issue control exists to compare against —
    // that gate is unchanged and is not what this file is about.
    await mount({
      rows: [engagement({
        conflict: {
          decision: 'cleared_with_disclosure',
          decidedBy: 'desk',
          decidedAt: '2026-07-21T00:00:00.000Z',
        },
      })],
    });
    // The card, not the client-select option that carries the same name.
    const card = document.querySelector('div[data-juice]') as HTMLElement;
    expect(card.textContent).toContain('Probe Chain');
    const stamp = within(card).getByTestId('gps-legal-position-stamp');
    expect(stamp.textContent).toMatch(/No legal position on file for Liechtenstein/);
    expect(stamp.textContent).toMatch(/This proposal is/);
    // It precedes the control that issues the proposal in document order: the sentence
    // is read before the button, not after it.
    const issue = within(card).getByRole('button', { name: /issue proposal/i });
    expect(stamp.compareDocumentPosition(issue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('prints the guard\'s own notice sentence verbatim when the wire carries one', async () => {
    const notice = 'No LCX legal position is on file for Liechtenstein; this price is not legally cleared.';
    await mount({
      rows: [engagement()],
      meta: { legalPositionOnFile: false, legalPositionGateCode: 'perimeter_stale', legalPositionNotice: notice, advisory: true },
    });
    const printed = screen.getAllByTestId('gps-legal-position-notice');
    expect(printed.length).toBeGreaterThan(0);
    // VERBATIM. A paraphrase here is a second statement of the rule that can drift from
    // the guard's, which is the defect `GpsDelivery.tsx` documents at length.
    expect(printed[0].textContent).toBe(notice);
    // The gate code and the override are stated too: "nobody checked" and "the check ran
    // and was overridden" are different facts.
    const stamp = screen.getAllByTestId('gps-legal-position-stamp')[0];
    expect(stamp.textContent).toMatch(/Gate · perimeter_stale/);
    expect(stamp.textContent).toMatch(/proceeded under that override/);
  });

  it('goes quiet — and only quiet — when a read affirmatively reports a position on file', async () => {
    await mount({
      rows: [engagement({ conflict: null })],
      meta: { legalPositionOnFile: true, perimeterSource: 'database' },
    });
    const stamps = screen.getAllByTestId('gps-legal-position-stamp');
    for (const s of stamps) {
      expect(s.getAttribute('data-legal-stamp')).toBe('on-file');
      expect(s.textContent).not.toMatch(/NOT legally cleared/);
      // Still not a green tick: it says what a perimeter position is and is not.
      expect(s.textContent).toMatch(/not legal advice/i);
    }
  });
});

/* ── 3 · ON THE PRINTED DOSSIER ─────────────────────────────────────────────── */

describe('the stamp on the delivery dossier (GpsDelivery.tsx)', () => {
  /**
   * THE DOSSIER IS THE ARTEFACT THAT LEAVES THE BUILDING (D7), so the stamp being on
   * the SCREEN is not the claim worth asserting — the claim is that it survives the
   * print job. Two things kill a banner in print and both are asserted here:
   * `role="status"`, which the house sheet hides outright, and living inside a
   * `.br-no-print` subtree, which is where every control on the page lives.
   */
  it('is on the dossier, above the sections, and is not excluded from the print job', async () => {
    vi.mocked(deliveryApi.fetchGpsDelivery).mockResolvedValue(composeDeliveryResponse({
      engagement: {
        id: 'e-1', clientId: 'c-1', clientName: 'Probe Chain',
        offerKey: 'mica_whitepaper', status: 'in_delivery', offer: getOffer('mica_whitepaper'),
      },
      asOf: '2026-08-01T12:00:00.000Z',
    }));
    render(
      <MemoryRouter initialEntries={['/gps/delivery?engagementId=e-1']}>
        <GpsDelivery />
      </MemoryRouter>,
    );
    const stamp = await waitFor(() => screen.getByTestId('gps-legal-position-stamp'));

    expect(stamp.textContent).toMatch(/No legal position on file/);
    expect(stamp.textContent).toMatch(/This engagement dossier is/);
    expect(stamp.textContent).toMatch(/NOT legally cleared/);
    expect(stamp.getAttribute('role')).toBe('note');
    expect(stamp.closest('.br-no-print')).toBeNull();

    // It carries its own print rule, because --red / --red-bg are NOT among the tokens
    // PrintStyles pins, and `.dark` stays on <html> for the duration of the job.
    const printed = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '');
    expect(printed.some((c) => /\[data-legal-stamp\][\s\S]*background: #fff/.test(c))).toBe(true);

    // Above the first data section, not in a footnote after it.
    const plan = document.querySelector('section[aria-labelledby="plan-h"]')!;
    expect(stamp.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
