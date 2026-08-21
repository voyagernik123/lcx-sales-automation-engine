import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// By package name, not a deep relative path: `gps/index.ts` re-exports the contract, so a
// test can no longer reach a shape the page itself could not import.
import {
  deskContractDefects,
  type GpsInputsDesk,
} from '@lcx/shared';
import { ApiError } from '@/lib/apiClient';
import { GpsInputs } from '../GpsInputs';
import * as apiClient from '@/lib/apiClient';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE GPS INPUT DESK — the guards on the screen that types the three inputs.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── THE FIXTURE IS MEASURED, NOT DESCRIBED ───────────────────────────────────
 * The payload below is hand-built, and the FIRST test runs `deskContractDefects`
 * over it — the same predicate `apps/api/src/routes/__tests__/gpsInputs.test.ts`
 * runs over a real serialised HTTP response from the route. That is the only
 * arrangement that catches the failure this compartment already shipped once
 * (`lib/api/gps.ts:60`): a page and its test agreeing on a field the server has never
 * sent. A mocked boundary can prove internal consistency and nothing else, so the
 * fixture is held to the same declaration the route is.
 *
 * ── WHAT EACH TEST DEFENDS ───────────────────────────────────────────────────
 *  1. The fixture is the contract, not a description of it.
 *  2. A COMPILED PLACEHOLDER band and an ENTERED band do not render alike — the
 *     badge, the notice and the struck-through numbers all differ. The absence half
 *     matters as much as the presence half: an always-on banner is decoration.
 *  3. A PRIOR effort triple is disclosed as a prior; a measured one carries no notice.
 *  4. A derived mid is marked as derived, so nobody reads arithmetic as a decision.
 *  5. A rate card whose cost cannot be derived says so — it never renders $0.00.
 *  6. Every refusal on the payload is rendered with its CODE and its RULE, and the
 *     absent price-band register shows the DDL a human pastes.
 *  7. THE SERVER DECIDES. A refusal produced by the API on submit is rendered
 *     verbatim, with the rule the server cited — and the page does not pre-empt it:
 *     the request is sent even when the input is obviously bad and even when the
 *     partner list is empty.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * jsdom has no layout and no paint. "The placeholder is impossible to miss" is
 * asserted only as "the badge and the sentence are in the DOM, not truncated and not
 * behind a disclosure control". That is a real regression guard; it is not a claim
 * about what a human perceives.
 */

vi.mock('@/lib/apiClient', async () => {
  // `ApiError` is the module's real class: the page branches on `instanceof`, and a
  // stub would let a wrong refusal shape pass.
  const real = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return { ...real, request: vi.fn() };
});

const mockedRequest = apiClient.request as unknown as ReturnType<typeof vi.fn>;

const DDL = 'CREATE TABLE IF NOT EXISTS gps_price_band (\n  offer_key text PRIMARY KEY\n);\n';

/**
 * A desk with one offer on each side of every distinction: one ENTERED band and one
 * PLACEHOLDER, one MEASURED triple and one PRIOR, one costable card and one that
 * cannot be costed. A fixture where every row is the same state cannot show that the
 * screen distinguishes them.
 */
function desk(over: Partial<GpsInputsDesk> = {}): GpsInputsDesk {
  return {
    contract: 'gps.inputs.v1',
    asOf: '2026-08-03T09:00:00.000Z',
    registers: { priceBands: false, effortTriples: true, rateCards: true },
    priceBands: [
      {
        offerKey: 'diagnostic',
        offerName: 'MiCA Readiness Diagnostic',
        source: 'compiled_placeholder',
        lowCents: 150_000,
        midCents: 225_000,
        highCents: 300_000,
        currency: 'USD',
        midIsDerived: true,
        statedBy: null,
        statedAt: null,
        placeholderNotice: 'PLACEHOLDER, NOT A PRICE. This band is TODO_PRICE_BANDS in catalogue.ts:61.',
      },
      {
        offerKey: 'mica_whitepaper',
        offerName: 'MiCA White Paper',
        source: 'entered',
        lowCents: 1_200_000,
        midCents: 1_800_000,
        highCents: 2_500_000,
        currency: 'USD',
        midIsDerived: false,
        statedBy: 'nikhil.sharma@lcx.com',
        statedAt: '2026-08-03T08:00:00.000Z',
        placeholderNotice: null,
      },
    ],
    effortTriples: [
      {
        offerKey: 'diagnostic',
        offerName: 'MiCA Readiness Diagnostic',
        basis: 'prior',
        optimisticDays: 1,
        likelyDays: 2,
        pessimisticDays: 4,
        statedBy: null,
        statedAt: null,
        priorNotice: 'PRIOR, NOT MEASURED. No effort triple is on record for this offer.',
      },
      {
        offerKey: 'mica_whitepaper',
        offerName: 'MiCA White Paper',
        basis: 'measured',
        optimisticDays: 4,
        likelyDays: 6,
        pessimisticDays: 10,
        statedBy: 'nikhil.sharma@lcx.com',
        statedAt: '2026-08-03T08:30:00.000Z',
        priorNotice: null,
      },
    ],
    rateCards: [
      {
        offerKey: 'mica_whitepaper',
        offerName: 'MiCA White Paper',
        partnerId: 'counsel-one',
        partnerLabel: 'Counsel One',
        unit: 'day_rate',
        amountCents: 200_000,
        expectedUnits: 6,
        hoursPerDay: null,
        fixedCostCents: 0,
        currency: 'USD',
        validUntil: '2027-01-01T00:00:00.000Z',
        status: 'usable',
        engagementCostCents: 1_200_000,
        statedBy: 'nikhil.sharma@lcx.com',
        statedAt: '2026-08-03T08:40:00.000Z',
      },
      {
        offerKey: 'gtm_sprint',
        offerName: 'GTM Sprint',
        partnerId: 'counsel-one',
        partnerLabel: 'Counsel One',
        unit: 'day_rate',
        // Legal in the schema (0052:75 permits >= 0) and uncostable by design.
        amountCents: 0,
        expectedUnits: 5,
        hoursPerDay: null,
        fixedCostCents: 0,
        currency: 'USD',
        validUntil: null,
        status: 'no_validity_stated',
        engagementCostCents: null,
        statedBy: 'nikhil.sharma@lcx.com',
        statedAt: '2026-08-03T08:45:00.000Z',
      },
    ],
    partnerOptions: [],
    refusals: [
      {
        code: 'PRICE_BAND_REGISTER_ABSENT',
        reason: 'There is nowhere to record a price band on this environment: no gps_price_band relation exists.',
        rule: 'no gps_price_band relation; 0052_gps_underwriting.sql created the cost side only (0052:28-35)',
        field: null,
      },
      {
        code: 'PARTNER_BENCH_EMPTY',
        reason: 'No partner can be named on any offer, because this system knows no partner names.',
        rule: 'PARTNER_BENCH is an empty array (packages/shared/src/gps/partners.ts:332)',
        field: 'partnerId',
      },
    ],
    awaitingHuman: [
      'PRICE BANDS: 1 of 5 offers are still priced from the compiled placeholder.',
      'EFFORT TRIPLES: 1 of 5 offers have no measured triple.',
      'PARTNER NAMES: the delivery bench is empty (decision D5).',
    ],
    counts: { offersOnPlaceholderBand: 1, offersOnPriorEffort: 1, offersWithNoPartner: 3 },
    priceBandRegisterDdl: DDL,
    ...over,
  };
}

const envelope = (d: GpsInputsDesk = desk()) => ({ data: d, meta: { priceBandRegisterDdl: DDL } });

beforeEach(() => {
  mockedRequest.mockReset();
});

/* ═══════════════════════ the contract ════════════════════════════════════ */

describe('the fixture is the shared contract, not a description of it', () => {
  it('has no contract defects', () => {
    expect(deskContractDefects(desk())).toEqual([]);
  });

  it('would notice a field this page invented', () => {
    // The positive control. Without it, "no defects" could mean the predicate is inert.
    const broken = { ...desk() } as unknown as Record<string, unknown>;
    delete broken.counts;
    expect(deskContractDefects(broken).join(' ')).toContain('counts');
  });
});

/* ══════ the distinction that is the entire point of the screen ═════════════ */

describe('a placeholder price and an entered price do not render alike', () => {
  beforeEach(() => {
    mockedRequest.mockResolvedValue(envelope());
  });

  it('badges the compiled band as a PLACEHOLDER and carries the reason', async () => {
    render(<GpsInputs />);
    const row = await screen.findByTestId('band-diagnostic');
    expect(within(row).getByText('PLACEHOLDER')).toBeInTheDocument();
    expect(screen.getByTestId('band-notice-diagnostic')).toHaveTextContent('PLACEHOLDER, NOT A PRICE');
    // The mid nobody stated is marked as arithmetic.
    expect(screen.getByTestId('mid-derived-diagnostic')).toHaveTextContent('derived');
  });

  it('badges the entered band as ENTERED, with no notice and no derived mid', async () => {
    render(<GpsInputs />);
    const row = await screen.findByTestId('band-mica_whitepaper');
    expect(within(row).getByText('ENTERED')).toBeInTheDocument();
    expect(within(row).getByText(/nikhil\.sharma@lcx\.com/)).toBeInTheDocument();
    // The ABSENCE half. A notice on every row would be decoration.
    expect(screen.queryByTestId('band-notice-mica_whitepaper')).toBeNull();
    expect(screen.queryByTestId('mid-derived-mica_whitepaper')).toBeNull();
  });

  it('discloses a prior effort triple and leaves a measured one unmarked', async () => {
    render(<GpsInputs />);
    const prior = await screen.findByTestId('effort-diagnostic');
    expect(within(prior).getByText('PRIOR')).toBeInTheDocument();
    expect(screen.getByTestId('effort-notice-diagnostic')).toHaveTextContent('PRIOR, NOT MEASURED');

    const measured = screen.getByTestId('effort-mica_whitepaper');
    expect(within(measured).getByText('MEASURED')).toBeInTheDocument();
    expect(screen.queryByTestId('effort-notice-mica_whitepaper')).toBeNull();
  });

  it('reports a cost that cannot be derived as such, and never as zero', async () => {
    render(<GpsInputs />);
    const cell = await screen.findByTestId('cost-counsel-one-gtm_sprint');
    expect(cell).toHaveTextContent('cannot be derived');
    expect(cell).not.toHaveTextContent('$0.00');

    // …while the costable card still shows its number, so the state above is a
    // distinction and not a blanket refusal to print money.
    expect(screen.getByTestId('cost-counsel-one-mica_whitepaper')).toHaveTextContent('$12,000.00');
  });

  it('shows how many offers are still on a placeholder, from the server', async () => {
    render(<GpsInputs />);
    expect(await screen.findByTestId('count-placeholder-bands')).toHaveTextContent('1');
    expect(screen.getByTestId('count-prior-effort')).toHaveTextContent('1');
    expect(screen.getByTestId('count-no-partner')).toHaveTextContent('3');
  });
});

/* ═══════════════════════ refusals, rendered as refusals ═══════════════════ */

describe('every refusal reaches the screen with its code and its rule', () => {
  it('renders the desk-level refusals, and the DDL for the absent register', async () => {
    mockedRequest.mockResolvedValue(envelope());
    render(<GpsInputs />);

    const absent = await screen.findByTestId('refusal-PRICE_BAND_REGISTER_ABSENT');
    expect(absent).toHaveTextContent('no gps_price_band relation');
    expect(absent).toHaveTextContent('CREATE TABLE IF NOT EXISTS gps_price_band');

    const bench = screen.getByTestId('refusal-PARTNER_BENCH_EMPTY');
    expect(bench).toHaveTextContent('knows no partner names');
    expect(bench).toHaveTextContent('partners.ts:332');
  });

  it('says what a human must still type, in the server’s own sentences', async () => {
    mockedRequest.mockResolvedValue(envelope());
    render(<GpsInputs />);
    expect(await screen.findByText(/PRICE BANDS: 1 of 5/)).toBeInTheDocument();
    expect(screen.getByText(/EFFORT TRIPLES: 1 of 5/)).toBeInTheDocument();
    expect(screen.getByText(/PARTNER NAMES: the delivery bench is empty/)).toBeInTheDocument();
  });

  it('renders a refusal instead of a desk when the read itself is refused', async () => {
    mockedRequest.mockRejectedValue(
      new ApiError('Forbidden: Global Services requires \'view\' access', 403, 'WORKSPACE_FORBIDDEN'),
    );
    render(<GpsInputs />);
    const panel = await screen.findByTestId('refusal-WORKSPACE_FORBIDDEN');
    expect(panel).toHaveTextContent('requires');
    // No band table appears beside a refused read.
    expect(screen.queryByTestId('band-diagnostic')).toBeNull();
    // And the missing citation is stated rather than fabricated.
    expect(panel).toHaveTextContent('did not carry a rule citation');
  });
});

/* ═══════════════ the server decides, and the page does not pre-empt ═══════ */

describe('the server owns every judgement about a value', () => {
  it('sends an obviously bad band and renders the SERVER’s refusal with its rule', async () => {
    /* URL-routed, not one-shot: since G0 the page also fetches /v1/gps/packets on mount
       (the founder-packet inbox), and child effects fire before the parent's — a bare
       mockResolvedValueOnce armed for the desk GET gets eaten by the packets GET. The
       empty packets envelope keeps that section inert for this file; its own behaviour
       lives in gpsInputsPackets.test.tsx. */
    mockedRequest.mockImplementation(async (url: unknown) =>
      String(url).includes('/v1/gps/packets')
        ? { data: { packets: [], decisions: [], registerPresent: true, registerNotice: null } }
        : envelope());
    render(<GpsInputs />);
    await screen.findByTestId('band-diagnostic');

    mockedRequest.mockRejectedValueOnce(new ApiError(
      'A band must ascend: low 2600000 ≤ mid 1800000 ≤ high 2500000 does not hold.',
      400,
      'BAND_NOT_ASCENDING',
      { data: { rule: 'low <= mid <= high. Nothing clamps a price band.', field: 'midCents' } },
    ));

    await userEvent.click(screen.getByRole('button', { name: /record this band/i }));

    const panel = await screen.findByTestId('refusal-BAND_NOT_ASCENDING');
    expect(panel).toHaveTextContent('A band must ascend');
    expect(panel).toHaveTextContent('Nothing clamps a price band');
    expect(panel).toHaveTextContent('midCents');

    // THE REQUEST WAS SENT. A page that had judged the input itself would never have
    // called the API, and the rule on screen would be a browser-side copy.
    const posted = mockedRequest.mock.calls.find((c) => String(c[0]).includes('/price-bands'));
    expect(posted, 'the page did not POST — it pre-empted the server').toBeTruthy();
    expect((posted![1] as { method?: string }).method).toBe('POST');
  });

  it('still submits a rate card with an empty partner list, and shows the 409 refusal', async () => {
    /* URL-routed, not one-shot: since G0 the page also fetches /v1/gps/packets on mount
       (the founder-packet inbox), and child effects fire before the parent's — a bare
       mockResolvedValueOnce armed for the desk GET gets eaten by the packets GET. The
       empty packets envelope keeps that section inert for this file; its own behaviour
       lives in gpsInputsPackets.test.tsx. */
    mockedRequest.mockImplementation(async (url: unknown) =>
      String(url).includes('/v1/gps/packets')
        ? { data: { packets: [], decisions: [], registerPresent: true, registerNotice: null } }
        : envelope());
    render(<GpsInputs />);
    await screen.findByTestId('partner-picker-empty');

    mockedRequest.mockRejectedValueOnce(new ApiError(
      'This system knows no partner names, so no rate card can name one.',
      409,
      'PARTNER_BENCH_EMPTY',
      { data: { rule: 'PARTNER_BENCH is an empty array (partners.ts:332)', field: 'partnerId' } },
    ));

    const button = screen.getByRole('button', { name: /record this rate card/i });
    // Not disabled: a greyed-out control is a judgement this page may not make.
    expect(button).not.toBeDisabled();
    await userEvent.click(button);

    const panels = await screen.findAllByTestId('refusal-PARTNER_BENCH_EMPTY');
    expect(panels.length).toBeGreaterThanOrEqual(2);
    expect(panels[panels.length - 1]).toHaveTextContent('knows no partner names');
  });

  it('replaces the desk with the server’s new one on a successful write', async () => {
    /* URL-routed, not one-shot: since G0 the page also fetches /v1/gps/packets on mount
       (the founder-packet inbox), and child effects fire before the parent's — a bare
       mockResolvedValueOnce armed for the desk GET gets eaten by the packets GET. The
       empty packets envelope keeps that section inert for this file; its own behaviour
       lives in gpsInputsPackets.test.tsx. */
    mockedRequest.mockImplementation(async (url: unknown) =>
      String(url).includes('/v1/gps/packets')
        ? { data: { packets: [], decisions: [], registerPresent: true, registerNotice: null } }
        : envelope());
    render(<GpsInputs />);
    await screen.findByTestId('band-diagnostic');
    expect(within(screen.getByTestId('band-diagnostic')).getByText('PLACEHOLDER')).toBeInTheDocument();

    const after = desk({
      priceBands: [
        {
          ...desk().priceBands[0]!,
          source: 'entered',
          lowCents: 200_000,
          midCents: 250_000,
          highCents: 300_000,
          midIsDerived: false,
          statedBy: 'nikhil.sharma@lcx.com',
          statedAt: '2026-08-03T09:10:00.000Z',
          placeholderNotice: null,
        },
        desk().priceBands[1]!,
      ],
      counts: { offersOnPlaceholderBand: 0, offersOnPriorEffort: 1, offersWithNoPartner: 3 },
    });
    mockedRequest.mockResolvedValueOnce({ data: after, meta: {} });

    await userEvent.click(screen.getByRole('button', { name: /record this band/i }));

    await waitFor(() => {
      expect(within(screen.getByTestId('band-diagnostic')).getByText('ENTERED')).toBeInTheDocument();
    });
    // The screen is the server's row, not a locally patched one.
    expect(screen.queryByTestId('band-notice-diagnostic')).toBeNull();
    expect(screen.getByTestId('count-placeholder-bands')).toHaveTextContent('0');
  });
});
