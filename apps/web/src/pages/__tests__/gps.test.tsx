import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  CATALOGUE_TODOS, OFFERS, PRICE_BANDS_ARE_PLACEHOLDERS, getOffer,
} from '@lcx/shared';
import { Gps } from '../Gps';
import * as gpsApi from '@/lib/api/gps';

/**
 * GLOBAL SERVICES — the guards on the quote desk.
 *
 * These are not smoke tests. Each one asserts a boundary that a future edit could
 * quietly cross, and three of them assert an ABSENCE, which is the only kind of
 * claim that survives someone adding a feature in good faith:
 *
 *  1. NO CLIENT-ARTIFACT INTAKE ANYWHERE ON THIS SURFACE. Phase 3 is gated on
 *     decision D2 — whether LCX legal/DPO accepts third-party confidential
 *     material on LCX infrastructure (`GPS_IMPLEMENTATION_PLAN.md` §3 D2, §4
 *     S0.4). The gate is enforced by a ratchet, not by discipline, because the
 *     natural next commit on a page listing `requiredClientInputs` is a place to
 *     put them.
 *  2. NO PRICE IS PRESENTED AS AGREED while the bands are placeholders (D4).
 *  3. NO PROPOSAL CAN BE ISSUED without a recorded conflict check.
 *
 * WHAT THESE TESTS CANNOT SEE, stated plainly: jsdom has no layout and no paint.
 * "Exclusions are given equal weight to inclusions" is asserted here only as
 * "every exclusion string is in the DOM, not truncated and not behind a
 * disclosure control" — that is a real regression guard and it is not a claim
 * about what a human perceives on the screen.
 */

vi.mock('@/lib/api/gps', () => ({
  fetchGpsSummary: vi.fn(),
  fetchGpsClients: vi.fn(),
  fetchGpsEngagements: vi.fn(),
  createGpsClient: vi.fn(),
  createGpsEngagement: vi.fn().mockResolvedValue(undefined),
  issueGpsProposal: vi.fn().mockResolvedValue(undefined),
  recordGpsConflictCheck: vi.fn().mockResolvedValue(undefined),
}));

const summary = (over: Partial<gpsApi.GpsSummary> = {}): gpsApi.GpsSummary => ({
  migrated: true,
  counts: { draft: 1 },
  clientCount: 1,
  openValueCents: 1_750_000,
  openMarginCents: 1_150_000,
  missingConflictChecks: 0,
  ...over,
});

const client = {
  id: 'c-1', name: 'Probe Chain', legalEntity: null, jurisdiction: 'Liechtenstein',
  primaryContact: null, status: 'prospect' as const,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

const engagement = (over: Partial<gpsApi.GpsEngagementRow> = {}): gpsApi.GpsEngagementRow => ({
  id: 'e-1',
  clientId: 'c-1',
  clientName: 'Probe Chain',
  projectId: null,
  offerKey: 'mica_whitepaper',
  contractingEntity: 'lcx',
  scopeSnapshot: {},
  priceCents: 1_750_000,
  vendorCostCents: 600_000,
  currency: 'USD',
  status: 'draft',
  owner: 'nik',
  depositRequiredCents: 0,
  depositPaidAt: null,
  acceptedAt: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  conflict: null,
  ...over,
});

const mount = async (opts: {
  s?: Partial<gpsApi.GpsSummary>;
  clients?: unknown[];
  rows?: gpsApi.GpsEngagementRow[];
} = {}) => {
  vi.mocked(gpsApi.fetchGpsSummary).mockResolvedValue(summary(opts.s));
  vi.mocked(gpsApi.fetchGpsClients).mockResolvedValue((opts.clients ?? [client]) as never);
  vi.mocked(gpsApi.fetchGpsEngagements).mockResolvedValue(opts.rows ?? []);
  render(<MemoryRouter><Gps /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Global Services')).toBeTruthy());
  await waitFor(() => expect(gpsApi.fetchGpsEngagements).toHaveBeenCalled());
};

beforeEach(() => { vi.clearAllMocks(); });

// ── 1. The D2 gate: no artifact intake, anywhere ──────────────────────────────

describe('GPS — client artifact intake is absent by construction (D2)', () => {
  /*
   * THE RATCHET. Two halves, because either alone fails open.
   *
   * The DOM half would go green if someone added an upload endpoint to the API
   * client without a control for it yet; the source half would go green if
   * someone rendered a drop zone that posts through a differently-named helper.
   * Together they cover both the capability and its surface.
   *
   * Read as SOURCE TEXT rather than by rendering, because the offending commit
   * might guard the control behind a flag that is off in this fixture — and a
   * feature that exists but is switched off is exactly what this gate forbids.
   */
  const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

  it('the GPS api client exports no upload-shaped function', async () => {
    /*
     * `importActual`, NOT the `gpsApi` binding this file already has.
     *
     * Measured fail-open: written first as `Object.keys(gpsApi)`, it enumerated
     * the vi.mock factory's own keys — so a real `uploadGpsArtifact` export could
     * be added to `lib/api/gps.ts` and the test would stay green forever, because
     * the mock does not know about it. The ratchet has to read the real module.
     */
    const real = await vi.importActual<typeof gpsApi>('@/lib/api/gps');
    const names = Object.keys(real);
    expect(names.length, 'the real module exported nothing, so this proves nothing').toBeGreaterThan(3);
    const offenders = names.filter((n) => /upload|attach|artifact|document|file/i.test(n));
    expect(offenders, 'an artifact-intake function appeared on the GPS api client — D2 is unanswered').toEqual([]);
  });

  it('neither GPS source file contains a file input, FormData or multipart body', () => {
    for (const rel of ['../Gps.tsx', '../../lib/api/gps.ts']) {
      const text = src(rel);
      // Strip block and line comments first: the files DISCUSS the absent
      // capability at length, and a naive grep would match the prose explaining
      // why it is absent. The claim is about code, so comments are removed.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${rel} gained a file input`).not.toMatch(/type\s*=\s*["']file["']/);
      expect(code, `${rel} gained FormData`).not.toMatch(/FormData/);
      expect(code, `${rel} gained a multipart request`).not.toMatch(/multipart/i);
      expect(code, `${rel} gained a drop zone`).not.toMatch(/onDrop|dataTransfer/);
    }
  });

  it('renders no file input and no upload control', async () => {
    await mount({ rows: [engagement()] });
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
    const controls = [...document.querySelectorAll('button, a[href], label')]
      .map((el) => (el.textContent ?? '').toLowerCase())
      .filter((t) => /\bupload\b|\battach\b|drop a file|choose file/.test(t));
    expect(controls, 'an upload affordance appeared on the GPS desk').toEqual([]);
  });
});

// ── 2. The D4 gate: placeholder prices are never presented as agreed ──────────

describe('GPS — placeholder prices are labelled as placeholders (D4)', () => {
  it('shows the do-not-quote banner while PRICE_BANDS_ARE_PLACEHOLDERS is true', async () => {
    // If the flag is ever flipped without real bands landing, this test is the
    // thing that has to be edited — which is the point of reading the flag rather
    // than hardcoding the expectation.
    expect(PRICE_BANDS_ARE_PLACEHOLDERS, 'flag flipped: real bands must land in the same commit').toBe(true);
    await mount();
    const banner = screen.getByTestId('gps-placeholder-prices');
    expect(banner.textContent).toMatch(/PLACEHOLDER/);
    expect(banner.textContent).toMatch(/do not quote/i);
  });

  it('the price field opens EMPTY — no band midpoint is pre-filled as though chosen', async () => {
    await mount();
    const price = screen.getByLabelText('Price (USD)') as HTMLInputElement;
    expect(price.value, 'a placeholder price was pre-filled, which is the exact failure D4 guards').toBe('');
  });

  it('every catalogue gap is shown, and the quote-blocking ones are marked', async () => {
    await mount();
    const panel = screen.getByTestId('gps-catalogue-todos');
    for (const t of CATALOGUE_TODOS) {
      expect(within(panel).getByText(t.what), `catalogue gap not shown: ${t.what}`).toBeTruthy();
    }
    const blocking = CATALOGUE_TODOS.filter((t) => t.blocksQuoting).length;
    expect(blocking, 'the fixture expects at least one quote-blocking gap').toBeGreaterThan(0);
    expect(within(panel).getAllByText('blocks quoting')).toHaveLength(blocking);
  });
});

// ── 3. Exclusions are rendered in full, not summarised ────────────────────────

describe('GPS — exclusions reach the screen in full', () => {
  it('renders every exclusion of the selected offer, verbatim', async () => {
    await mount();
    const offer = getOffer(OFFERS[0].key);
    expect(offer.exclusions.length, 'an offer with no exclusions would make this vacuous').toBeGreaterThan(4);
    for (const line of offer.exclusions) {
      expect(screen.getByText(line), `exclusion missing from the DOM: ${line.slice(0, 40)}…`).toBeTruthy();
    }
  });

  it('exclusions are not hidden behind a disclosure control', async () => {
    await mount();
    const offer = getOffer(OFFERS[0].key);
    const first = screen.getByText(offer.exclusions[0]);
    expect(first.closest('details'), 'exclusions were collapsed into a <details>').toBeNull();
    expect(first.closest('[hidden]'), 'exclusions were hidden').toBeNull();
  });

  it('the universal perimeter lines survive on every offer in the catalogue', async () => {
    // Not a UI claim so much as the reason the UI can be trusted: the four
    // perimeter exclusions are composed in, so no offer can ship without them by
    // omission (`gps/catalogue.ts:424`). Asserted here because no
    // catalogue.test.ts exists — the shared-package author did not own one.
    for (const offer of OFFERS) {
      const all = offer.exclusions.join(' ').toLowerCase();
      expect(all, `${offer.key} does not disclaim listing`).toMatch(/listing/);
      expect(all, `${offer.key} does not disclaim regulatory outcome`).toMatch(/regulator|authorit/);
      // Not a literal "legal advice": the universal line reads "No legal, tax,
      // accounting or investment advice is provided", and the one allow-listed
      // substitute reads "we do not give legal advice". Both must pass, so the
      // pattern spans the intervening words rather than demanding one phrasing —
      // measured: an exact-phrase match failed on `diagnostic`.
      expect(all, `${offer.key} does not disclaim legal advice`).toMatch(/legal[^.]{0,80}advice/);
      expect(all, `${offer.key} does not disclaim market outcome`).toMatch(/market-making|market outcome|volume/);
    }
  });
});

// ── 4. Margin is visible before anything is issued, and is never flattered ────

describe('GPS — margin at quote time', () => {
  it('reports margin as UNKNOWN rather than zero before a price is set', async () => {
    await mount();
    expect(screen.queryByTestId('gps-margin'), 'a margin was rendered with no price').toBeNull();
    expect(screen.getByText(/not zero yet — it is unknown/i)).toBeTruthy();
  });

  it('shows a NEGATIVE margin negative — never clamped to zero', async () => {
    await mount();
    const user = userEvent.setup();
    // The white paper offer's placeholder vendor cost is $6,000; quote below it.
    await user.selectOptions(screen.getByLabelText('Offer'), 'mica_whitepaper');
    await user.type(screen.getByLabelText('Price (USD)'), '4000');

    const readout = screen.getByTestId('gps-margin');
    // −$2,000 with the platform's minus sign (`lib/format.ts:32` uses U+2212).
    expect(readout.textContent, 'a quote below vendor cost did not read as a loss').toMatch(/−\$2,000/);
    expect(readout.textContent).toMatch(/does not pay for the work it buys/);
  });

  it('states margin as a percentage OF PRICE, not markup on cost', async () => {
    await mount();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Offer'), 'mica_whitepaper');
    await user.type(screen.getByLabelText('Price (USD)'), '20000');
    // $20,000 − $6,000 = $14,000 → 70% of price. Markup on cost would be 233%.
    const readout = screen.getByTestId('gps-margin');
    expect(readout.textContent).toMatch(/\$14,000/);
    expect(readout.textContent, 'margin percent is not percent-of-price').toMatch(/70% of price/);
  });

  it('an empty vendor cost falls back to the catalogue placeholder, never to $0', async () => {
    await mount();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Offer'), 'mica_whitepaper');
    await user.type(screen.getByLabelText('Price (USD)'), '20000');
    // A blank cost reading as $0 would show 100% margin on partner-delivered
    // work — the most flattering possible lie about this business.
    expect(screen.getByTestId('gps-margin').textContent).not.toMatch(/100% of price/);
    expect(screen.getByTestId('gps-margin').textContent).toMatch(/\$6,000 vendor cost/);
  });

  it('shows margin on every engagement row, derived and not read from a field', async () => {
    await mount({ rows: [engagement({ priceCents: 1_750_000, vendorCostCents: 600_000 })] });
    const card = screen.getByTestId('gps-engagements');
    expect(within(card).getByText('$11,500'), 'row margin missing').toBeTruthy();
    expect(within(card).getByText(/Margin \(66%\)/)).toBeTruthy();
  });
});

// ── 5. The conflict-check gate ────────────────────────────────────────────────

describe('GPS — a proposal cannot be issued without a recorded conflict check', () => {
  it('offers no issue control at all while the check is missing, and says why', async () => {
    await mount({ rows: [engagement({ conflict: null })] });
    expect(screen.queryByRole('button', { name: /Issue proposal/ }),
      'the issue control exists while no conflict check is recorded').toBeNull();
    expect(screen.getByText(/Cannot be issued until the conflict check above is recorded/)).toBeTruthy();
  });

  it('the record button stays disabled until BOTH the check and the disclosure text exist', async () => {
    await mount({ rows: [engagement({ conflict: null })] });
    const user = userEvent.setup();
    const record = screen.getByRole('button', { name: /Record conflict check/ }) as HTMLButtonElement;
    expect(record.disabled, 'an empty conflict check could be recorded').toBe(true);

    await user.type(screen.getByLabelText('What was checked'), 'No LCX listing application open.');
    // Default decision is cleared_with_disclosure, so the verbatim text is still
    // required: the value of the record IS the words the client was given.
    expect(record.disabled, 'a disclosure decision was recordable with no disclosure text').toBe(true);

    await user.type(screen.getByLabelText('Disclosure text used, verbatim'), 'Disclosed employment at LCX.');
    expect(record.disabled).toBe(false);
  });

  it('records the check without sending attribution in the body', async () => {
    await mount({ rows: [engagement({ conflict: null })] });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What was checked'), 'Sanctions screen run.');
    await user.selectOptions(screen.getByLabelText('Decision'), 'cleared');
    await user.click(screen.getByRole('button', { name: /Record conflict check/ }));

    await waitFor(() => expect(gpsApi.recordGpsConflictCheck).toHaveBeenCalled());
    const [, body] = vi.mocked(gpsApi.recordGpsConflictCheck).mock.calls[0];
    // A client that can name its own decider can forge one; attribution comes
    // from the session, the rule `approveDraft` already follows.
    expect(Object.keys(body), 'the UI sent its own attribution').not.toContain('decidedBy');
    expect(body.decision).toBe('cleared');
    expect(body.disclosureTextUsed, 'a disclosure was invented for a no-disclosure decision').toBeUndefined();
  });

  it('issues only once a check exists, and never claims per-person attribution', async () => {
    await mount({
      rows: [engagement({
        conflict: { decision: 'cleared_with_disclosure', decidedBy: 'nik', decidedAt: '2026-07-21T00:00:00.000Z' },
      })],
    });
    const user = userEvent.setup();
    const issue = screen.getByRole('button', { name: /Issue proposal/ }) as HTMLButtonElement;
    expect(issue.disabled).toBe(false);
    await user.click(issue);
    await waitFor(() => expect(gpsApi.issueGpsProposal).toHaveBeenCalledWith('e-1'));

    // The record is real, dated and verbatim; the desk passcode is shared, so it
    // is NOT proof of who. The UI must not imply otherwise (plan §1.5).
    expect(screen.getByText(/Attribution is desk-level/)).toBeTruthy();
  });
});

// ── 6. The deploy-before-migration window ─────────────────────────────────────

describe('GPS — migrated:false is a banner, not a crash', () => {
  it('names migration 0047 and withdraws the quote builder rather than letting writes fail', async () => {
    await mount({ s: { migrated: false }, rows: [] });
    expect(screen.getByText(/Awaiting migration 0047/)).toBeTruthy();
    expect(screen.queryByTestId('gps-quote-builder'),
      'the quote builder was left usable while every write is declined').toBeNull();
    // The catalogue gaps are policy in compiled code, not rows, so they still
    // render with no database at all — which is the argument for compiling them.
    expect(screen.getByTestId('gps-catalogue-todos')).toBeTruthy();
  });
});
