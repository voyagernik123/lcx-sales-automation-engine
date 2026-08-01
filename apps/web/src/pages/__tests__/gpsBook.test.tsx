import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  bookConcentration, cashConversion, bindingConstraint, bookHealth,
  AGED_DEPOSIT_ALARM_DAYS,
  type BookPosition, type BookResponse, type BookPlaceholders, type BookUnresolved,
  type BenchHeadroom, type MarginRealisation,
} from '../../../../../packages/shared/src/gps/book.js';
import { GpsBook } from '../GpsBook';
import * as bookApi from '@/lib/api/gpsBook';

/**
 * GLOBAL SERVICES — THE BOOK: the guards on the portfolio screen.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THE FIXTURE IS COMPUTED BY THE REAL ENGINE AND NOT WRITTEN BY HAND.
 * ═════════════════════════════════════════════════════════════════════════════
 * This suite mocks `lib/api/gpsBook`, and a mocked boundary can only ever verify
 * internal consistency — it cannot tell you the boundary is real. That is not a
 * hypothetical: `pages/__tests__/gps.test.tsx:46` carries the post-mortem of the
 * exact failure. A hand-written `GpsSummary` fixture claimed `counts`,
 * `clientCount` and `openValueCents`; the page was written against the same
 * invention; the suite was green; the page was guaranteed to crash the moment
 * `0047_gps.sql` landed. Two wrongs agreeing is not a passing test.
 *
 * So no object below describes a response shape. `response()` builds real
 * `BookPosition` rows and runs `bookConcentration`, `cashConversion`,
 * `bindingConstraint` and `bookHealth` — THE PRODUCTION FUNCTIONS — over them. The
 * consequence is that this fixture cannot drift from the contract: rename a field
 * in `book.ts` and this file fails to compile rather than passing against a stale
 * copy. It also means the assertions below are assertions about what the ENGINE
 * says, rendered, rather than about strings a test author chose.
 *
 * ── What each test guards, and why a future edit could cross it ──────────────
 *
 *  1 THREE STATES, NEVER TWO. `migrated: false` must not render as an empty book
 *    and an empty book must not render as zeros. GPS has already shipped a screen
 *    that could not tell those apart; that is the false claim (D8) this programme
 *    is under orders not to repeat, and the natural next commit collapses them.
 *  2 THE BINDING CONSTRAINT SENTENCE REACHES THE SCREEN, including in the empty
 *    state, where it is the most useful sentence on the page ("nothing is limiting
 *    you, you are not selling"). Asserted as the engine's own `reason` string, so
 *    a paraphrase in the page fails the test.
 *  3 PLACEHOLDERS ARE BADGED AT THE POINT OF USE, not only in a footer. The
 *    founder's standing instruction is that a placeholder must never read as a
 *    real number, and a badge that lives only at the bottom of a long page fails
 *    that for anyone who does not scroll.
 *  4 CONCENTRATION RENDERS ITS ROWS. D1 is a claim about interactions: the axis
 *    figure must open onto the holders behind it. This asserts the holder LABELS
 *    and SHARES appear after one click — the actual rows, not a tooltip.
 *  5 REFUSALS ARE VISIBLE, NOT ZEROED. A suppressed conversion rate prints its
 *    reason; an unmeasurable margin panel says so in words.
 *  6 NO CLIENT-ARTIFACT INTAKE, asserted against the api module's own export list.
 *    Decision D2 is unanswered and "attach the signed SOW to the position" is the
 *    obvious next feature on a book screen, so the gate is a ratchet rather than a
 *    memory.
 *
 * WHAT THESE TESTS CANNOT SEE, stated plainly: jsdom has no layout and no paint.
 * "Dense" and "prominent" are not asserted here and cannot be — `text-micro`,
 * `tabular-nums` and type scale are visual properties. What IS asserted is that
 * the load-bearing sentences and rows are in the DOM, untruncated and not behind a
 * disclosure control that a reader would have to guess at.
 */

vi.mock('@/lib/api/gpsBook', async () => {
  // The REAL module is loaded and only `fetchGpsBook` is replaced, so the type
  // re-exports and the display constants under test are the production ones. A
  // factory that returned a bare object would let the page render against
  // constants this file made up — which is the failure mode described above.
  const actual = await vi.importActual<typeof bookApi>('@/lib/api/gpsBook');
  return { ...actual, fetchGpsBook: vi.fn() };
});

const ASOF = '2026-08-01T12:00:00.000Z';

/** One position. Every field is the shared type's, so a rename breaks the build. */
function position(over: Partial<BookPosition> = {}): BookPosition {
  return {
    engagementId: 'e-1',
    clientId: 'c-1',
    clientName: 'Probe Chain',
    offerKey: 'mica_whitepaper',
    status: 'in_delivery',
    currency: 'USD',
    priceCents: 1_750_000,
    vendorCostCents: 600_000,
    jurisdiction: 'Liechtenstein',
    partner: null,
    depositRequiredCents: 500_000,
    acceptedAt: '2026-06-01T00:00:00.000Z',
    depositPaidAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

const PLACEHOLDERS: BookPlaceholders = {
  priceBandsArePlaceholders: true,
  vendorCostsArePlaceholders: true,
  coordinationHoursArePlaceholders: true,
  blockingQuotingDecisions: 2,
  partnerRateCardsSupplied: false,
};

const UNRESOLVED: readonly BookUnresolved[] = [
  {
    field: 'offers[].priceBandCents',
    owner: 'founder',
    whyItMatters: 'Every quote, margin and concentration figure is denominated in a price.',
    consequence: 'No price on this screen may be quoted to a client.',
    blocking: true,
  },
  {
    field: 'partners[].rateCards',
    owner: 'partner',
    whyItMatters: 'Margin is price minus vendor cost, and vendor cost comes from a rate card.',
    consequence: 'Realised margin cannot be measured against anything.',
    blocking: false,
  },
];

/**
 * A whole `BookResponse`, composed the way the API composes it.
 *
 * `capacity`, `wip` and `marginRealisation` default to NULL because that is the
 * state today and it is the state the doctrine is hardest on: null must render as
 * "unknown", never as zero. Passing an object is how a test opts into the other
 * branch.
 */
function response(
  positions: readonly BookPosition[],
  over: Partial<BookResponse> = {},
): BookResponse {
  const concentration = bookConcentration(positions, ASOF);
  const cash = cashConversion(positions, ASOF);
  const constraint = bindingConstraint({
    // Nullable on purpose: the bench is genuinely unknown, and `0` here would
    // produce the false verdict "the bench has no headroom" (book.ts:1399).
    benchSpareSlots: null,
    offersWithNamedPartner: 0,
    unstaffableActive: positions.filter((p) => p.status === 'in_delivery').length,
    coordinationHoursPerWeek: null,
    capacityHoursPerWeek: null,
    coordinationHoursArePlaceholders: PLACEHOLDERS.coordinationHoursArePlaceholders,
    cash,
    liveOpportunities: positions.filter((p) => p.acceptedAt == null).length,
    blockingQuotingDecisions: PLACEHOLDERS.blockingQuotingDecisions,
    priceBandsArePlaceholders: PLACEHOLDERS.priceBandsArePlaceholders,
  });
  const health = bookHealth({ positions, concentration, cash, constraint });

  return {
    migrated: true,
    asOf: ASOF,
    positionCount: positions.length,
    openPositionCount: concentration.positionCount,
    currencies: concentration.currencies,
    concentration,
    cash,
    health,
    capacity: null,
    wip: null,
    marginRealisation: null,
    placeholders: PLACEHOLDERS,
    unresolved: UNRESOLVED,
    ...over,
  };
}

const renderPage = () => render(<MemoryRouter><GpsBook /></MemoryRouter>);

beforeEach(() => {
  vi.mocked(bookApi.fetchGpsBook).mockReset();
});

/* ── 1 · The three states, and the two that must never be confused ─────────── */

describe('GpsBook · the unmigrated and the empty book are different facts', () => {
  it('renders the unmigrated state without implying an empty book of zero positions', async () => {
    // The state on prod today: 0047/0049 are not applied. Every collection on the
    // response is empty and `migrated` is the only thing distinguishing this from a
    // book with nothing in it.
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(
      response([], { migrated: false }),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/the tables do not exist/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/migrations \(0047, 0049\) have not been applied/i)).toBeInTheDocument();

    // ABSENCE ASSERTION. The tape is the strip of counts, and rendering it here
    // would put "positions 0" on a screen that cannot know whether that is true.
    expect(screen.queryByText(/^positions$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the book is empty/i)).not.toBeInTheDocument();
    // No concentration, cash or capacity panel: there is nothing to be concentrated.
    expect(screen.queryByText(/^Cash conversion$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Concentration —/i)).not.toBeInTheDocument();

    // What IS real without tables: the catalogue's placeholders. They are properties
    // of the offer definitions, not of the positions, so hiding them here would
    // withhold the one true thing this state has to say.
    expect(screen.getByTestId('placeholder-flags')).toBeInTheDocument();
  });

  it('renders the empty book as absent figures, not zeroes, and still names the constraint', async () => {
    const res = response([]);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/the book is empty/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/every figure this page would show is absent rather than zero/i),
    ).toBeInTheDocument();

    // D2 — THE MOST USEFUL SENTENCE IN THIS STATE. With no positions the engine
    // reaches a verdict anyway, and an empty state that only said "no data" would
    // have swallowed it. Asserted as the engine's own string: a paraphrase in the
    // page fails here, which is the point.
    expect(screen.getByText(res.health.binding.reason)).toBeInTheDocument();

    // And the unmigrated wording must NOT appear — the tables exist in this state.
    expect(screen.queryByText(/the tables do not exist/i)).not.toBeInTheDocument();
  });
});

/* ── 2 · The verdict ──────────────────────────────────────────────────────── */

describe('GpsBook · the binding constraint is stated in words', () => {
  it('prints the verdict sentence, its remedy and its confidence, and lists every candidate tested', async () => {
    const positions = [
      position(),
      position({ engagementId: 'e-2', clientId: 'c-2', clientName: 'Second Chain', status: 'accepted' }),
    ];
    const res = response(positions);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    const c = res.health.binding;
    // Verbatim, because the engine wrote the sentence to be rendered verbatim.
    // `getAllByText` rather than `getByText` on purpose: the verdict's reason may
    // legitimately also appear inside the candidate audit for the check that bound,
    // and a test that forbade that would be forbidding the audit trail.
    await waitFor(() => {
      expect(screen.getAllByText(c.reason).length).toBeGreaterThan(0);
    });
    if (c.remedy) expect(screen.getByText(c.remedy)).toBeInTheDocument();

    // D3 — confidence in the VERDICT is beside it, labelled, in ICD-203 words, and
    // is not folded into it. The label text proves it is a separate cell.
    expect(screen.getByText(/confidence in this verdict/i)).toBeInTheDocument();
    expect(screen.getByText(c.confidenceBasis)).toBeInTheDocument();

    // D2 — every candidate, bound or not, with the ones that could not be tested
    // counted separately from the ones that did not bind.
    const toggle = screen.getByTestId('verdict-audit-toggle');
    expect(toggle).toHaveTextContent(String(c.considered.length));
    if (c.unevaluable.length > 0) {
      expect(toggle).toHaveTextContent(/could not be evaluated/i);
    }

    await userEvent.click(toggle);
    const audit = screen.getByTestId('verdict-audit');
    for (const chk of c.considered) {
      expect(within(audit).getByText(chk.reason)).toBeInTheDocument();
    }
    // A check whose input was null must read as "no input", never as "did not bind" —
    // that distinction is the whole reason `evaluable` exists on the type.
    if (c.unevaluable.length > 0) {
      expect(within(audit).getAllByText(/no input/i).length).toBe(
        c.considered.filter((x) => !x.evaluable).length,
      );
    }
  });
});

/* ── 3 · The score, its band, and the trail that sums to it ────────────────── */

describe('GpsBook · health is a score, a separate band, and an auditable trail', () => {
  it('keeps the band out of the score and lets the score open onto drivers that sum to it', async () => {
    const res = response([
      position(),
      position({ engagementId: 'e-2', clientId: 'c-2', clientName: 'Second Chain', priceCents: 900_000 }),
    ]);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    const scoreButton = await waitFor(() => screen.getByTestId('health-score'));
    // The reported score, exactly — not a rounded, weighted or adjusted version.
    expect(scoreButton).toHaveTextContent(String(res.health.score));

    // D3 — the band is a DIFFERENT element with a DIFFERENT label. If a future edit
    // folds it into the score, `health-band` stops carrying the range.
    const band = screen.getByTestId('health-band');
    if (res.health.scoreBand.isPoint) {
      expect(band).toHaveTextContent(/point/i);
    } else {
      expect(band).toHaveTextContent(String(res.health.scoreBand.low));
      expect(band).toHaveTextContent(String(res.health.scoreBand.high));
    }
    expect(screen.getByText(res.health.scoreBand.basis)).toBeInTheDocument();

    // D1 — one interaction, and the arithmetic is checkable on screen. The engine
    // guarantees the drivers sum to the score (book.ts:1790); the page prints the
    // running total so a reader does not have to take that on trust.
    await userEvent.click(scoreButton);
    const trail = screen.getByTestId('health-trail');
    for (const d of res.health.drivers) {
      expect(within(trail).getByText(d.label)).toBeInTheDocument();
    }
    const sum = res.health.drivers.reduce((a, d) => a + d.points, 0);
    expect(sum).toBe(res.health.score);
    // The footer prints the same total, so a divergence would be visible rather
    // than silent. (If the engine ever breaks the identity, the page says so.)
    expect(within(trail).getAllByText(String(sum)).length).toBeGreaterThan(0);

    // The argument (D4) is printed, not hidden. `getAllByText`: a health statement
    // is often the SAME sentence as the concentration axis headline it was derived
    // from — the engine composes one from the other — so requiring uniqueness would
    // be requiring the page to suppress one of the two places it legitimately
    // belongs.
    for (const s of res.health.statements) {
      expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    }

    // ICD-203 likelihood only with a measured base rate. There is none here, so the
    // REFUSAL renders and no likelihood word is asserted anywhere.
    expect(screen.getByTestId('collection-outlook-refusal')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-outlook')).not.toBeInTheDocument();
  });
});

/* ── 4 · Concentration: a table, and every figure opens onto its rows ──────── */

describe('GpsBook · concentration renders from a fixture and opens onto its holders', () => {
  /**
   * A deliberately lopsided book: one client carries most of the margin, one
   * position has no jurisdiction recorded, and no position names a partner (the
   * real state today — `gps_engagement` has no partner column). That last fact is
   * what makes the band non-degenerate on the partner axis, which is the case worth
   * asserting: an index computed over nothing must not render as a diversified book.
   */
  const LOPSIDED: BookPosition[] = [
    position({ engagementId: 'e-1', clientId: 'c-1', clientName: 'Probe Chain', priceCents: 2_500_000, vendorCostCents: 500_000 }),
    position({ engagementId: 'e-2', clientId: 'c-2', clientName: 'Second Chain', priceCents: 600_000, vendorCostCents: 400_000, offerKey: 'gtm_sprint' }),
    position({ engagementId: 'e-3', clientId: 'c-3', clientName: 'Third Chain', priceCents: 500_000, vendorCostCents: 350_000, jurisdiction: null, status: 'proposed', acceptedAt: null }),
  ];

  it('renders one row per axis with the dominant holder, the share, and the band as a separate column', async () => {
    const res = response(LOPSIDED);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('axis-row-USD-client')).toBeInTheDocument();
    });

    const usd = res.concentration.perCurrency.find((c) => c.currency === 'USD')!;
    const clientAxis = usd.byAxis.client;

    const row = screen.getByTestId('axis-row-USD-client');
    // The dominant holder is NAMED, not just indexed — "an index cannot say
    // anything" (book.ts:376).
    expect(row).toHaveTextContent(clientAxis.dominant!.label);
    expect(row).toHaveTextContent(`${clientAxis.dominant!.sharePct}%`);
    // `effectiveHolders` is the headline figure, not the raw HHI.
    expect(row).toHaveTextContent(String(clientAxis.effectiveHolders));

    // D4 — the consequence sentence is ALWAYS VISIBLE, not behind the toggle.
    expect(screen.getByTestId('axis-headline-USD-client')).toHaveTextContent(clientAxis.headline);

    // D3 — the band is a separate cell. On the partner axis nothing is attributed,
    // so the band must exist and must not read as a diversified book.
    const partnerRow = screen.getByTestId('axis-row-USD-partner');
    expect(partnerRow).toHaveTextContent(/nothing attributed/i);
    // ABSENCE, AND THE PRECISE ONE THAT MATTERS. `hhi` and `effectiveHolders` are
    // null on this axis, and a 0 in either cell would render as "perfectly
    // diversified" — the exact misreading `hhi: null` exists to prevent (book.ts:315).
    // So both cells must say n/a. The holder COUNT is legitimately 0 and is left
    // alone: zero holders is a true count, not a null.
    expect(usd.byAxis.partner.hhi).toBeNull();
    expect(usd.byAxis.partner.effectiveHolders).toBeNull();
    expect(within(partnerRow).getAllByText('n/a').length).toBeGreaterThanOrEqual(2);
    // And the band cell exists rather than being blank — the bracket is the honest
    // reading of an axis nothing can be attributed on.
    expect(screen.getByTestId('axis-band-USD-partner')).toBeInTheDocument();

    // All four axes are present, so no axis is silently dropped for having no data.
    for (const axis of ['client', 'offer', 'partner', 'jurisdiction'] as const) {
      expect(screen.getByTestId(`axis-row-USD-${axis}`)).toBeInTheDocument();
    }

    // The currency mix states its basis in words — it is a COUNT, not a value share,
    // because a share of value would need a cross-currency total that is permanently
    // null. Rendering it without that label is how a count becomes read as money.
    expect(screen.getByText(/basis: position count, not value/i)).toBeInTheDocument();
    expect(screen.getByTestId('currency-mix-headline')).toHaveTextContent(
      res.concentration.currencyMix.headline,
    );
  });

  it('opens an axis onto the actual holder rows behind the index (D1)', async () => {
    const res = response(LOPSIDED);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    const opener = await waitFor(() => screen.getByTestId('axis-open-USD-client'));
    await userEvent.click(opener);

    const usd = res.concentration.perCurrency.find((c) => c.currency === 'USD')!;
    const holders = usd.byAxis.client.holders;
    expect(holders.length).toBeGreaterThan(1);

    // THE ROWS. Not a tooltip, not a summary — the holder labels and their shares,
    // which is what "the number opens to its rows" has to mean to be worth claiming.
    for (const h of holders) {
      expect(screen.getAllByText(h.label).length).toBeGreaterThan(0);
      expect(screen.getAllByText(`${h.sharePct}%`).length).toBeGreaterThan(0);
    }
    // The denominator, so the fraction is checkable rather than asserted. A share is
    // only traceable if BOTH halves of it are on screen.
    expect(screen.getAllByText(/of positive total/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/index over/i).length).toBeGreaterThan(0);
  });

  it('names the jurisdiction that was never recorded instead of quietly excluding it', async () => {
    // `e-3` has `jurisdiction: null`, so the jurisdiction axis cannot attribute it.
    // D2 forbids a silent exclusion: it must appear as unattributed with a coverage
    // below 100%, and the axis note must say so.
    const res = response(LOPSIDED);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('axis-row-USD-jurisdiction')).toBeInTheDocument();
    });
    const usd = res.concentration.perCurrency.find((c) => c.currency === 'USD')!;
    const jur = usd.byAxis.jurisdiction;
    expect(jur.unattributedPositions).toBeGreaterThan(0);
    expect(jur.coveragePct).toBeLessThan(100);

    const row = screen.getByTestId('axis-row-USD-jurisdiction');
    expect(row).toHaveTextContent(`${jur.coveragePct}%`);
    // The "+N?" marker beside the holder count is how an unattributed position is
    // visible in the collapsed row rather than only after expanding.
    expect(row).toHaveTextContent(`+${jur.unattributedPositions}?`);
  });
});

/* ── 5 · Placeholders are badged, and badged where they are used ───────────── */

describe('GpsBook · a placeholder never reads as a real number', () => {
  it('badges every placeholder input in the ledger and names who alone can supply it', async () => {
    const res = response([position()]);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    const flags = await waitFor(() => screen.getByTestId('placeholder-flags'));
    // All four flags in force in the fixture read PLACEHOLDER, in words, not as a
    // colour — jsdom cannot see colour and neither can a colour-blind operator.
    expect(within(flags).getAllByText(/^placeholder$/i).length).toBe(4);
    expect(within(flags).queryByText(/^supplied$/i)).not.toBeInTheDocument();

    // D2 — the OWNER is on the row. "Unresolved" without an owner is a complaint;
    // with an owner it is a task.
    for (const u of UNRESOLVED) {
      const row = screen.getByTestId(`unresolved-${u.field}`);
      expect(row).toHaveTextContent(u.whyItMatters);
      expect(row).toHaveTextContent(u.consequence);
    }
    expect(screen.getByTestId(`unresolved-${UNRESOLVED[0].field}`)).toHaveTextContent(/founder/i);
    expect(screen.getByTestId(`unresolved-${UNRESOLVED[1].field}`)).toHaveTextContent(/partner/i);

    // The distinction the ledger exists to preserve, printed on the panel: a
    // placeholder is a stand-in number, an unresolved is a missing capability.
    expect(
      screen.getByText(/conflating them is how a guess becomes a measurement/i),
    ).toBeInTheDocument();
  });

  it('badges the placeholder AT THE POINT OF USE, not only in the footer ledger', async () => {
    // The WIP hours are the case that matters: utilisation is arithmetic over two
    // assumed numbers, and a reader who looks at the utilisation cell and never
    // scrolls to the ledger must still learn that.
    const res = response([position()], {
      wip: {
        active: 1,
        byOffer: {
          diagnostic: 0, mica_whitepaper: 1, legal_opinion_coordination: 0,
          gtm_sprint: 0, marketing_activation: 0,
        },
        clients: 1,
        blocked: 0,
        awaitingClientInput: 0,
        awaitingCollection: 0,
        unstaffable: 1,
        coordinationHoursPerWeek: 6,
        capacityHoursPerWeek: 8,
        utilisationPct: 75,
        overCapacity: false,
        usesPlaceholderHours: true,
        headline: 'One engagement in delivery, drawing 6 of 8 assumed weekly hours.',
      },
    });
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/coordination hours per week/i)).toBeInTheDocument();
    });
    // Badges beside the hours cells themselves — four of them (coordination hours,
    // capacity hours, and the two rate-card cells are elsewhere), so at least two.
    expect(screen.getAllByText(/^placeholder$/i).length).toBeGreaterThan(4);
    expect(screen.getByTestId('wip-placeholder-note')).toHaveTextContent(
      /must not be quoted, planned against, or shown to a client/i,
    );
    // The utilisation figure is present AND the sentence undermining it is adjacent.
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders an unknown bench as unknown and never as a full one', async () => {
    // `capacity: null` is the state today: no offer names a delivering partner.
    const res = response([position()]);
    expect(res.capacity).toBeNull();
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('capacity-unknown')).toBeInTheDocument();
    });
    expect(screen.getByTestId('capacity-unknown')).toHaveTextContent(
      /unknown, which is not the same as full/i,
    );
    // ABSENCE: no headroom figure is invented for the offers.
    expect(screen.queryByText(/simultaneous ceiling/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('wip-unknown')).toBeInTheDocument();
  });
});

/* ── 6 · Refusals are printed, not zeroed ─────────────────────────────────── */

describe('GpsBook · the screen refuses out loud', () => {
  it('prints the reason a conversion rate is withheld instead of showing 0%', async () => {
    // Two positions is below the sample size at which a rate means anything, so the
    // engine suppresses every rate and supplies a reason for each. A page that showed
    // the raw ratio anyway would be manufacturing a statistic from n = 2.
    const res = response([
      position(),
      position({ engagementId: 'e-2', clientId: 'c-2', clientName: 'Second Chain' }),
    ]);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/^Cash conversion$/i)).toBeInTheDocument();
    });

    const usd = res.cash.perCurrency.find((c) => c.currency === 'USD')!;
    const suppressed = usd.conversions.filter((c) => c.ratePct == null);
    expect(suppressed.length).toBeGreaterThan(0);
    for (const c of suppressed) {
      expect(screen.getAllByText(c.suppressedReason!).length).toBeGreaterThan(0);
    }
    // The withheld cell says "withheld", never "0%".
    expect(screen.getAllByText(/withheld/i).length).toBeGreaterThanOrEqual(suppressed.length);

    // Receivable aging has no anchor in the schema, so the engine refuses to age it
    // rather than substituting `updated_at`. The refusal is on the screen.
    if (!res.cash.receivableAnchorAvailable) {
      expect(screen.getByTestId('receivable-refusal')).toBeInTheDocument();
    }
  });

  it('surfaces the oldest unpaid deposit in days, with its own currency attached', async () => {
    // Accepted 2026-06-01, measured 2026-08-01: comfortably past the alarm.
    const res = response([position({ status: 'accepted', depositPaidAt: null })]);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    const panel = await waitFor(() => screen.getByTestId('oldest-unpaid-deposit'));
    const o = res.cash.oldestUnpaidDeposit!;
    expect(o.days).toBeGreaterThan(AGED_DEPOSIT_ALARM_DAYS);
    expect(panel).toHaveTextContent(`${o.days}d`);
    // The amount carries its currency, because it must be renderable without ever
    // being added to another currency's figure.
    expect(panel).toHaveTextContent(o.currency);
    expect(panel).toHaveTextContent(o.clientName!);
  });

  it('states the margin blind spot in words when nothing has been realised', async () => {
    const res = response([position()]);
    expect(res.marginRealisation).toBeNull();
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('margin-unavailable')).toBeInTheDocument();
    });
    expect(screen.getByTestId('margin-unavailable')).toHaveTextContent(
      /not measured, and not estimated/i,
    );
    // D8 — the panel does not claim a margin it cannot compute, and it says WHY the
    // gap matters rather than rendering an empty card.
    expect(screen.getByTestId('margin-unavailable')).toHaveTextContent(
      /nobody currently knows what is actually kept/i,
    );
  });

  it('says out loud that an aging bracket cannot be opened to its rows', async () => {
    // The one place D1 is not fully satisfied. `AgingBracket` carries a count and an
    // amount and no engagement ids, so the limitation is PRINTED rather than papered
    // over with a drill-down that would have to invent the rows.
    const res = response([position({ status: 'accepted' })]);
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(res);
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByText(/the engagements behind a bracket are not reachable from this cell/i).length,
      ).toBeGreaterThan(0);
    });
  });
});

/* ── 7 · The populated branches, so they cannot crash unseen ───────────────── */

describe('GpsBook · the bench and margin tables render when the data exists', () => {
  /**
   * WHY THIS TEST EXISTS AT ALL. `capacity` and `marginRealisation` are null today
   * and will be null for some time, so the two largest tables on this page would
   * otherwise ship having never been rendered once — and the day the partner roster
   * lands is the worst possible day to discover a crash in the offer column. This
   * exercises both, and it asserts the ONE arithmetic rule the bench panel must not
   * break: the per-offer headrooms overlap and must never be summed.
   */
  const BENCH: BenchHeadroom = {
    perOffer: [
      {
        offerKey: 'mica_whitepaper',
        headroom: 2,
        blocked: false,
        capablePartnerIds: ['p-1', 'p-2'],
        quotablePartnerIds: ['p-1'],
        activeNow: 1,
        reasons: [{ label: 'Partner One · 2 of 3 slots free', slots: 2 }],
        perPartner: [],
      },
      {
        offerKey: 'gtm_sprint',
        headroom: 0,
        blocked: true,
        capablePartnerIds: ['p-1'],
        quotablePartnerIds: [],
        activeNow: 3,
        reasons: [{ label: 'Partner One at capacity', slots: 0 }],
        perPartner: [],
      },
    ],
    // Deliberately NOT 2 + 0: one partner serves both offers, so the ceiling is the
    // bench's, not the column's (partners.ts:384).
    totalSpareSlots: 2,
    perOfferIndependent: false,
    availabilityEvaluated: true,
    unstaffedActiveCount: 1,
  };

  const MARGIN: MarginRealisation = {
    byOffer: [{
      kind: 'offer',
      key: 'gtm_sprint',
      n: 1,
      quotedMarginMeanCents: 1_200_000,
      realisedMarginMeanCents: 900_000,
      quotedMarginPctMean: 60,
      realisedMarginPctMean: 47.4,
      slippageMeanCents: -300_000,
      slippageVarianceCents2: null,
      slippageStdDevCents: null,
      worstSlippageCents: -300_000,
      bestSlippageCents: -300_000,
      priceSlippageMeanCents: -100_000,
      costSlippageMeanCents: 200_000,
      negativeRealisedMarginCount: 0,
    }],
    byPartner: [],
    overall: null,
    excludedIncompleteRealisation: 2,
    excludedLost: 1,
    offersWithNoRealisationData: ['mica_whitepaper', 'diagnostic'],
  };

  it('renders both tables, refuses to sum the headroom column, and withholds σ at n = 1', async () => {
    vi.mocked(bookApi.fetchGpsBook).mockResolvedValue(
      response([position()], { capacity: BENCH, marginRealisation: MARGIN }),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText(/simultaneous ceiling/i).length).toBeGreaterThan(0);
    });
    // The overlap warning is MANDATORY when partners serve more than one offer:
    // adding the column would triple the ceiling and license selling three
    // engagements into one slot.
    expect(screen.getByText(/the per-offer figures OVERLAP/i)).toBeInTheDocument();
    expect(screen.getByText(/do not add the column/i)).toBeInTheDocument();
    // A blocked offer says "blocked", not "0" — the reason is the deliverable here.
    expect(screen.getByText(/^blocked$/i)).toBeInTheDocument();
    expect(screen.getByText(/Partner One at capacity/)).toBeInTheDocument();

    // Margin: σ is withheld at n = 1, because one overrun is an anecdote.
    expect(screen.getAllByText(/withheld/i).length).toBeGreaterThan(0);
    // Both sides of the leak are separate columns — a discount and a partner overrun
    // are the same slippage and different problems.
    expect(screen.getByText(/price side/i)).toBeInTheDocument();
    expect(screen.getByText(/cost side/i)).toBeInTheDocument();
    // D2 — the offers with no data are named, not omitted from the list.
    expect(screen.getByTestId('margin-blind-spots')).toHaveTextContent(/the blind spot is the finding/i);
    // And the unlabelled-currency limitation is admitted rather than papered over.
    expect(screen.getByText(/a symbol here would be a claim the data cannot support/i)).toBeInTheDocument();
  });
});

/* ── 8 · The gate that must not be defeated ───────────────────────────────── */

describe('lib/api/gpsBook · the export list is a ratchet, not a habit', () => {
  it('exposes exactly one fetcher and no client-artifact intake of any kind', async () => {
    const mod = await vi.importActual<typeof bookApi>('@/lib/api/gpsBook');
    const names = Object.keys(mod);

    // Decision D2 — whether LCX may hold third-party confidential material — is
    // unanswered, and "attach the signed SOW to this position" is the obvious next
    // feature on a portfolio screen. Adding an intake function here would be the
    // first step in defeating that gate, so it has to go red in CI rather than
    // depend on a reviewer remembering a decision from a plan document.
    const forbidden = /upload|attach|document|file|multipart|blob|artifact/i;
    const offenders = names.filter((n) => forbidden.test(n));
    expect(offenders).toEqual([]);

    // Read-only. No mutation reaches the book: every write that could change it
    // already exists on the quote, delivery and conflict desks, and a second write
    // path onto the same rows is how two surfaces come to disagree.
    const mutating = names.filter((n) => /^(create|update|delete|record|issue|mark|set|save)/i.test(n));
    expect(mutating).toEqual([]);

    expect(names).toContain('fetchGpsBook');
    expect(names.filter((n) => n.startsWith('fetch'))).toEqual(['fetchGpsBook']);
  });

  it('neither book source file contains a file input, FormData, multipart body or drop zone', () => {
    // Read as SOURCE TEXT and not by rendering, because the offending commit might
    // guard the control behind a flag that is off in this fixture — and a capability
    // that exists but is switched off is exactly what the gate forbids.
    for (const rel of ['../GpsBook.tsx', '../../lib/api/gpsBook.ts']) {
      const text = readFileSync(resolve(__dirname, rel), 'utf8');
      // Comments are stripped first: both files DISCUSS the absent capability at
      // length, and a naive grep would match the prose explaining why it is absent.
      // The claim is about code.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${rel} gained a file input`).not.toMatch(/type\s*=\s*["']file["']/);
      expect(code, `${rel} gained FormData`).not.toMatch(/FormData/);
      expect(code, `${rel} gained a multipart request`).not.toMatch(/multipart/i);
      expect(code, `${rel} gained a drop zone`).not.toMatch(/onDrop|dataTransfer/);
    }
  });

  it('declares no response interface of its own — the contract lives in book.ts', () => {
    /*
     * THE OUTAGE GUARD. `lib/api/gps.ts:60` records what a hand-copied response
     * interface in this directory cost: `tsc` type-checks a copy as happily as an
     * original, and a mocked page test agrees with the copy, so nothing catches the
     * drift until the payload arrives. `interface` and `type X = {` are therefore
     * forbidden in the fetcher module — every shape it names must be a re-export.
     */
    const text = readFileSync(resolve(__dirname, '../../lib/api/gpsBook.ts'), 'utf8');
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, 'a response interface was declared in the web layer').not.toMatch(/\binterface\s+\w/);
    expect(code, 'a response shape was declared as a type alias in the web layer')
      .not.toMatch(/\btype\s+\w+\s*=\s*\{/);
    // And it does import the one true declaration. This asserted the deep relative
    // path into `packages/shared/src/gps/book.js` while the barrel was un-wired;
    // now that `@lcx/shared` re-exports the compartment it asserts the PACKAGE,
    // which is the stronger of the two: a deep path resolves whether or not the
    // barrel publishes the symbol, so it could go green on a module the rest of the
    // monorepo cannot see.
    expect(code).toMatch(/from '@lcx\/shared'/);
  });
});
