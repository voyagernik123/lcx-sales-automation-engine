import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  buildUnderwriteResponse,
  type CostModel,
  type UnderwriteQuote,
  type UnderwriteResponse,
} from '../../../../../packages/shared/src/gps/underwrite.js';
import type { RateCard, RecordedOutcome } from '../../../../../packages/shared/src/gps/partners.js';
import { GpsUnderwriting } from '../GpsUnderwriting';
import * as api from '@/lib/api/gpsUnderwrite';

/**
 * THE UNDERWRITING SCREEN — the guards on the crown jewel's face.
 *
 * ── THE FIXTURES ARE PRODUCED BY THE REAL FUNCTION, NOT TYPED OUT ────────────
 * Every payload below comes from `buildUnderwriteResponse` — the same function the
 * API route will call — with a real `CostModel` and a real `RateCard`. Not one field
 * is hand-written.
 *
 * That is the whole methodology of this file, and it is a direct response to how GPS
 * shipped a broken page with a green suite (`lib/api/gps.ts:60`): the old test mocked
 * the API module and hand-wrote the payload, so it asserted the page against the SAME
 * invented contract the page was written against, and the two wrongs agreed. A mocked
 * boundary can only ever verify internal consistency; it cannot tell you the boundary
 * is real.
 *
 * Generating the fixture closes that hole from the other side. If `UnderwriteResponse`
 * gains, loses or renames a field, or if `underwrite()` starts returning a different
 * verdict for these inputs, these tests break — because the fixture is the module's
 * own output rather than a description of it. What is still NOT proven here is that
 * the HTTP route returns this shape; that needs a route (which does not exist yet) and
 * a contract test beside it, and it is named in the return value rather than implied.
 *
 * ── WHAT EACH TEST DEFENDS ───────────────────────────────────────────────────
 *  1. P(loss) is the headline, in words, on a loss-making price.
 *  2. The issue control is BLOCKED in that state — `disabled`, not merely styled.
 *  3. A `prior` basis is DISCLOSED as founder-entered rather than measured, and the
 *     disclosure disappears when the basis is not a prior (the absence half matters:
 *     a banner that is always on is decoration).
 *  4. NO BARE POINT-ESTIMATE MARGIN. Asserted structurally over the whole DOM.
 *  5. The overrun slider changes the numbers.
 *  6. A refusal replaces the answer — no band, no P(loss), no zeroed stand-in.
 *
 * ── WHAT THESE TESTS CANNOT SEE, stated plainly ──────────────────────────────
 * jsdom has no layout and no paint. "The prior warning is impossible to miss" is
 * asserted here only as "the sentence is in the DOM, not truncated and not behind a
 * disclosure control". That is a real regression guard. It is not a claim about what a
 * human perceives, and no test in this file should be read as one.
 */

vi.mock('@/lib/api/gpsUnderwrite', async () => {
  // The label map and `isRefusal` are the module's real ones: mocking them would let
  // a wrong verdict label pass, and they are pure data + a one-line predicate.
  const real = await vi.importActual<typeof import('@/lib/api/gpsUnderwrite')>('@/lib/api/gpsUnderwrite');
  return { ...real, underwriteQuote: vi.fn(), proposePrice: vi.fn() };
});

const mocked = api.underwriteQuote as unknown as ReturnType<typeof vi.fn>;
const mockedPropose = api.proposePrice as unknown as ReturnType<typeof vi.fn>;

const ASOF = '2026-08-01T00:00:00.000Z';

function card(over: Partial<RateCard> = {}): RateCard {
  return {
    offerKey: 'mica_whitepaper',
    unit: 'day_rate',
    // $2,000/day. With a likely effort of 6 days that is a $12,000 likely cost, which
    // is the loss case against a $10,000 price.
    amountCents: 200_000,
    expectedUnits: 6,
    currency: 'USD',
    validUntil: '2027-01-01T00:00:00.000Z',
    statedBy: 'nikhil.sharma@lcx.com',
    statedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function model(over: Partial<CostModel> = {}): CostModel {
  return {
    offerKey: 'mica_whitepaper',
    partnerId: 'partner-1',
    partnerLabel: 'Counsel A',
    card: card(),
    effort: {
      offerKey: 'mica_whitepaper',
      optimisticDays: 4,
      likelyDays: 6,
      pessimisticDays: 8,
      statedBy: 'nikhil.sharma@lcx.com',
      statedAt: '2026-07-20T00:00:00.000Z',
      // A REAL triple, not the placeholder, on the fixtures that are about P(loss) —
      // otherwise every assertion would be entangled with the placeholder banner.
      isPlaceholder: false,
    },
    hoursPerDay: null,
    fixedCostCents: 0,
    ...over,
  };
}

function build(priceCents: number, over: Partial<CostModel> = {}, outcomes: readonly RecordedOutcome[] = []): UnderwriteResponse {
  const quote: UnderwriteQuote = { offerKey: 'mica_whitepaper', priceCents, currency: 'USD' };
  return buildUnderwriteResponse(quote, model(over), { asOf: ASOF, outcomes });
}

/** $10,000 against a $12,000 likely cost. Loses money in most outcomes. */
const LOSS = build(1_000_000);
/** $25,000 against the same cost. Loses money in none of them. */
const PROFIT = build(2_500_000);

function outcome(i: number, ratio: number): RecordedOutcome {
  return {
    engagementId: `eng-${i}`,
    partnerId: 'partner-1',
    offerKey: 'mica_whitepaper',
    quotedPriceCents: 2_500_000,
    quotedVendorCostCents: 1_200_000,
    finalPriceCents: null,
    actualVendorCostCents: Math.round(1_200_000 * ratio),
    dueAt: null,
    deliveredAt: null,
    reworkRounds: null,
    acceptedFirstPass: null,
  };
}

/** Three recorded invoices — enough to move the numbers, not enough to stand alone. */
const BLENDED = build(2_500_000, {}, [outcome(1, 1.1), outcome(2, 1.25), outcome(3, 1.4)]);

/** A currency the card cannot honour. One of the seven refusal verdicts. */
const REFUSED = buildUnderwriteResponse(
  { offerKey: 'mica_whitepaper', priceCents: 1_000_000, currency: 'EUR' },
  model(),
  { asOf: ASOF },
);

/** Type a price and a partner id, then wait for the debounced request to land. */
async function fill(u: ReturnType<typeof userEvent.setup>, price = '10000') {
  await u.type(screen.getByTestId('price-input'), price);
  await u.type(screen.getByTestId('partner-input'), 'partner-1');
  await waitFor(() => expect(mocked).toHaveBeenCalled(), { timeout: 3000 });
}

beforeEach(() => {
  mocked.mockReset();
  mockedPropose.mockReset();
  vi.useRealTimers();
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE FIXTURES THEMSELVES — verify the premise before verifying the screen    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * A test that renders a screen and asserts "the loss warning appears" proves nothing
 * unless the fixture is actually loss-making. These four assertions are the premise of
 * every test below, and they are checked against the module rather than assumed.
 */
describe('the fixtures are what they claim to be', () => {
  it('the loss fixture loses money in most outcomes and is blocked by policy', () => {
    expect(LOSS.underwriting.verdict).toBe('underwritten');
    expect(LOSS.underwriting.pLoss).not.toBeNull();
    expect(LOSS.underwriting.pLoss!).toBeGreaterThan(LOSS.issue.policy.maxPLoss);
    expect(LOSS.issue.blocked).toBe(true);
    expect(LOSS.issue.code).toBe('p_loss_above_threshold');
    // The median margin is genuinely negative — not merely "risky".
    expect(LOSS.underwriting.distribution!.p50MarginCents).toBeLessThan(0);
  });

  it('the profitable fixture is not blocked and loses money in no outcome', () => {
    expect(PROFIT.underwriting.pLoss).toBe(0);
    expect(PROFIT.issue.blocked).toBe(false);
    expect(PROFIT.underwriting.distribution!.p50MarginCents).toBeGreaterThan(0);
  });

  it('both fixtures are on a PRIOR basis, and three recorded outcomes move it to blended', () => {
    expect(LOSS.underwriting.basis).toBe('prior');
    expect(PROFIT.underwriting.basis).toBe('prior');
    expect(BLENDED.underwriting.basis).toBe('blended');
    expect(BLENDED.underwriting.blend.sampleSize).toBe(3);
  });

  it('the refusal fixture produced no distribution and a null P(loss), never a zero', () => {
    expect(REFUSED.underwriting.verdict).toBe('refused_currency_mismatch');
    expect(REFUSED.underwriting.distribution).toBeNull();
    expect(REFUSED.underwriting.pLoss).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* D4 — THE SCREEN SAYS THE PRICE IS WRONG, AND BLOCKS THE ISSUE               */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a loss-making price', () => {
  it('makes P(margin < 0) the headline and says the price is wrong in words', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    const headline = await screen.findByTestId('ploss-headline');
    expect(headline).toHaveAttribute('data-over-appetite', 'true');

    // The figure, and the SENTENCE. A percentage in a table is a fact; the sentence is
    // the argument, and D4 asks for the argument.
    const pct = `${(LOSS.underwriting.pLoss! * 100).toFixed(1)}%`;
    expect(within(headline).getByTestId('ploss-value')).toHaveTextContent(pct);
    const said = within(headline).getByTestId('price-is-wrong');
    expect(said).toHaveTextContent(/this price is wrong/i);
    expect(said).toHaveTextContent(/lose money in/i);
    expect(said).toHaveTextContent(pct);
    // The count behind the fraction, so the number can be checked by hand (D1).
    expect(said).toHaveTextContent(String(LOSS.underwriting.lossSampleCount!.toLocaleString('en-US')));
    // The threshold it is being judged against — quoted, not implied.
    expect(said).toHaveTextContent(`${(LOSS.issue.policy.maxPLoss * 100).toFixed(1)}%`);
  });

  it('BLOCKS the issue control — disabled, not merely discouraged', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    const control = await screen.findByTestId('issue-control');
    // Three independent assertions, because "looks blocked" is not blocked: the
    // attribute a styling change cannot fake, the DOM property a click would ignore,
    // and the ARIA state a screen reader reads.
    expect(control).toHaveAttribute('data-blocked', 'true');
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(control).toHaveTextContent(/BLOCKED/);

    // The reason is quoted VERBATIM from the wire, so the screen and the action
    // registry cannot state different numbers.
    expect(screen.getByTestId('issue-reason')).toHaveTextContent(LOSS.issue.reason);
    expect(screen.getByTestId('issue-code')).toHaveTextContent('p_loss_above_threshold');

    // Both sides of the comparison are on screen (D2).
    expect(screen.getByTestId('check-observed-p_loss_above_threshold')).toBeInTheDocument();

    // And the threshold is not presented as agreed.
    expect(screen.getByTestId('policy-notice')).toHaveTextContent(LOSS.policyNotice);
  });

  it('does not block, and does not shout, when P(loss) is zero', async () => {
    mocked.mockResolvedValue(PROFIT);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u, '25000');

    const control = await screen.findByTestId('issue-control');
    expect(control).toHaveAttribute('data-blocked', 'false');
    expect(control).toBeEnabled();
    // THE ABSENCE HALF: a screen that shouts on every quote has taught the founder to
    // stop reading it, which costs the block its meaning.
    expect(screen.queryByTestId('price-is-wrong')).not.toBeInTheDocument();
    expect(screen.getByTestId('ploss-headline')).toHaveAttribute('data-over-appetite', 'false');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* D8 — A PRIOR IS DISCLOSED AS A PRIOR                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the basis of the distribution', () => {
  it('states that a prior comes from founder-entered estimates and not from outcomes', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    const banner = await screen.findByTestId('basis-disclosure');
    expect(banner).toHaveAttribute('data-basis', 'prior');

    const warning = within(banner).getByTestId('prior-warning');
    expect(warning).toHaveTextContent(/founder-entered effort estimates/i);
    expect(warning).toHaveTextContent(/not from recorded outcomes/i);
    expect(warning).toHaveTextContent(/prior, not a measurement/i);

    // The module's own sentence too, not only ours.
    expect(banner).toHaveTextContent(LOSS.underwriting.basisReason);

    // It is NOT behind a disclosure control: the warning must be readable without
    // opening anything, which is the only sense in which jsdom can check "prominent".
    expect(warning.closest('details')).toBeNull();
  });

  it('drops the prior warning once recorded outcomes are moving the numbers', async () => {
    mocked.mockResolvedValue(BLENDED);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u, '25000');

    const banner = await screen.findByTestId('basis-disclosure');
    expect(banner).toHaveAttribute('data-basis', 'blended');
    // The absence is the point. An always-on banner is decoration, and decoration on a
    // data surface is what D5 deletes.
    expect(screen.queryByTestId('prior-warning')).not.toBeInTheDocument();
    // What replaced it is arithmetic, not a label: the weight the outcomes actually carry.
    expect(banner).toHaveTextContent(`${Math.round(BLENDED.underwriting.blend.weight * 100)}%`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* D3 — NO BARE POINT-ESTIMATE MARGIN, ANYWHERE, ASSERTED STRUCTURALLY         */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE MOST IMPORTANT TEST IN THIS FILE, and the only one that is not about a specific
 * element.
 *
 * "Do not render a bare margin" is unenforceable as a review note — the next person in
 * the file will add a summary line with a median in it, in good faith, because it reads
 * well. So the page routes every margin through `<Figure>`, which requires a
 * `percentile` prop and stamps `data-margin-figure` + `data-percentile` onto the DOM,
 * and this test walks the whole tree.
 *
 * It caught a real one on the first run: the overrun slider's readout printed
 * "median $X" beside the control with no p10/p90 anywhere near it. The count-equality
 * assertion went red, and the readout became a triplet. That is the difference between
 * a doctrine and a mechanism.
 */
describe('D3 — uncertainty sits beside the estimate', () => {
  const assertNoBarePointEstimate = () => {
    const figures = Array.from(document.querySelectorAll('[data-margin-figure]'));
    expect(figures.length).toBeGreaterThan(0);
    // (a) Not one margin figure may render without saying which percentile it is.
    for (const f of figures) {
      expect(f.getAttribute('data-percentile')).toBeTruthy();
    }
    // (b) The three decision percentiles appear in EQUAL numbers, which is what makes a
    // lone median structurally impossible rather than merely discouraged.
    const count = (p: string) => document.querySelectorAll(`[data-percentile="${p}"]`).length;
    expect(count('p10')).toBeGreaterThan(0);
    expect(count('p50')).toBe(count('p10'));
    expect(count('p90')).toBe(count('p10'));
  };

  it('renders no margin figure without its percentile, on a loss-making quote', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);
    await screen.findByTestId('ploss-headline');
    assertNoBarePointEstimate();
  });

  it('holds with an uplift selected, and with the driver trail open', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    const slider = await screen.findByTestId('overrun-slider');
    fireEvent.change(slider, { target: { value: '3' } });
    await u.click(screen.getByTestId('toggle-trail'));
    expect(screen.getByTestId('driver-trail')).toBeInTheDocument();

    assertNoBarePointEstimate();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE OVERRUN SLIDER MOVES THE DISTRIBUTION                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the overrun slider', () => {
  it('changes the numbers and the chart, without a second request', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);
    await screen.findByTestId('ploss-headline');

    const points = LOSS.sensitivity.points;
    // The fixture has to have something to move to, or this test asserts nothing.
    expect(points.length).toBeGreaterThan(1);
    const last = points[points.length - 1]!;
    expect(last.p50MarginCents).toBeLessThan(points[0]!.p50MarginCents);

    const callsBefore = mocked.mock.calls.length;
    expect(screen.getByTestId('overrun-current')).toHaveTextContent('+0%');
    /*
     * The chart's own description carries the baseline median before the move.
     *
     * NAMED, not `getByRole('img')` alone. There are now TWO figures in this section — the
     * band, and the margin SURFACE over price × overrun that was added beside it — so a bare
     * role query is ambiguous and threw. Naming the band is also the stronger assertion: an
     * unnamed query that survived a second figure appearing could silently start reading the
     * wrong one and still pass.
     */
    const band = () => screen.getByRole('img', { name: /Realised margin band/ });
    const chartBefore = band().getAttribute('aria-label') ?? '';

    fireEvent.change(screen.getByTestId('overrun-slider'), { target: { value: String(points.length - 1) } });

    await waitFor(() => expect(screen.getByTestId('overrun-current')).toHaveTextContent(`+${last.effortUpliftPct}%`));
    // The BAND moved, not only a caption: `aria-label` is generated from the selected
    // point's percentiles, so a changed label is a changed chart.
    const chartAfter = band().getAttribute('aria-label') ?? '';
    expect(chartAfter).not.toBe(chartBefore);
    expect(chartAfter).toContain(`+${last.effortUpliftPct}% effort`);

    // AND NOTHING WAS RE-SIMULATED. The uplifts arrive on the same payload under common
    // random numbers, so the comparison is sample-by-sample and the numbers cannot
    // shimmer between two identical views.
    expect(mocked.mock.calls.length).toBe(callsBefore);
  });

  it('is selectable from the keyboard alone, via the sensitivity table (D6)', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);
    await screen.findByTestId('ploss-headline');

    const second = LOSS.sensitivity.points[1]!;
    const firstRow = screen.getByTestId('sensitivity-row-0');
    firstRow.focus();
    await u.keyboard('{ArrowDown}');
    await u.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByTestId('overrun-current')).toHaveTextContent(`+${second.effortUpliftPct}%`));
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* D2 — A REFUSAL REPLACES THE ANSWER                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a refusal', () => {
  it('shows the verdict and every reason, and shows NO band, no P(loss) and no slider', async () => {
    mocked.mockResolvedValue(REFUSED);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    const panel = await screen.findByTestId('refusal');
    expect(screen.getByTestId('refusal-code')).toHaveTextContent('refused_currency_mismatch');
    for (const reason of REFUSED.underwriting.reasons) {
      expect(panel).toHaveTextContent(reason);
    }

    // THE ABSENCES ARE THE ASSERTION. `pLoss` is null on a refusal and never 0, because
    // "no loss risk found" and "loss risk not computable" are opposite statements — a
    // screen that renders 0.0% here tells the lie the shared module refused to tell.
    expect(screen.queryByTestId('ploss-headline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ploss-value')).not.toBeInTheDocument();
    expect(screen.queryByTestId('overrun-slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-margin-figure]').length).toBe(0);

    // And the gate blocks: a proposal whose margin could not be computed at all is not
    // a proposal that may be issued.
    expect(screen.getByTestId('issue-control')).toBeDisabled();
    expect(screen.getByTestId('issue-code')).toHaveTextContent('underwriting_refused');
  });

  it('does not claim a basis for a distribution it never produced', async () => {
    mocked.mockResolvedValue(REFUSED);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);
    await screen.findByTestId('refusal');

    // `basis` IS still `'prior'` on the payload — it describes what the inputs would
    // have been — so a screen keyed only on the basis code would print "this
    // distribution comes from founder-entered estimates" about an object that does not
    // exist. The module's own sentence stands instead.
    expect(REFUSED.underwriting.basis).toBe('prior');
    expect(screen.queryByTestId('prior-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('basis-disclosure')).toHaveTextContent(REFUSED.underwriting.basisReason);
  });
});

describe('the unsupplied-input warning', () => {
  it('is not behind a disclosure control', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    const list = await screen.findByTestId('unresolved-inputs');
    // `underwrite.ts:1789` requires a blocking banner rather than a footnote, and a
    // collapsed <details> is a footnote with extra steps. The EDITOR may collapse; the
    // warning may not.
    expect(list.closest('details')).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* D1 · D4 — THE TRAIL OPENS, AND THE SYSTEM ARGUES                            */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('explainability and the argument back', () => {
  it('opens the driver trail from the band-width figure, with units from the wire', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    expect(screen.queryByTestId('driver-trail')).not.toBeInTheDocument();
    // ONE interaction, on the number itself — not a nav to a detail page.
    await u.click(await screen.findByTestId('open-trail-spread'));

    const trail = screen.getByTestId('driver-trail');
    for (const d of LOSS.underwriting.drivers) {
      expect(trail).toHaveTextContent(d.label);
    }
    // The unit is rendered, so a cents value can never print as "points".
    expect(trail).toHaveTextContent('cents');
    expect(trail).toHaveTextContent('days');
  });

  it('names the variance driver and prints the devil advocate source, not just its claims', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    expect(await screen.findByTestId('variance-driver')).toHaveTextContent(LOSS.underwriting.varianceDriver!.label);

    const advocate = screen.getByTestId('devils-advocate');
    // The SOURCE, in words: "drawn from three recorded overruns" and "inferred from the
    // exclusions because nothing has been recorded" are arguments of different weight,
    // and the claims alone do not distinguish them.
    expect(screen.getByTestId('advocate-source-statement')).toHaveTextContent(LOSS.devilsAdvocate.sourceStatement);
    expect(screen.getByTestId('advocate-source')).toHaveTextContent(LOSS.devilsAdvocate.source);
    for (const a of LOSS.devilsAdvocate.arguments) {
      expect(advocate).toHaveTextContent(a.claim);
      expect(advocate).toHaveTextContent(a.evidence);
    }
    expect(advocate).toHaveTextContent(LOSS.devilsAdvocate.whatWouldChangeThis);
  });

  it('prints every unresolved founder input, and the method, off the wire', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    await screen.findByTestId('ploss-headline');
    const unresolved = screen.getByTestId('unresolved-inputs');
    expect(LOSS.unresolvedInputs.length).toBeGreaterThan(0);
    for (const s of LOSS.unresolvedInputs) {
      expect(unresolved).toHaveTextContent(s);
    }
    // D8: not one method sentence is typed on the page.
    const method = screen.getByTestId('method');
    expect(method).toHaveTextContent(LOSS.underwriting.method);
    expect(method).toHaveTextContent(LOSS.sensitivity.method);
    expect(screen.getByTestId('percentile-method')).toHaveTextContent(LOSS.percentileMethod);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* NOTHING IS UNDERWRITTEN BEFORE THERE IS SOMETHING TO UNDERWRITE             */
/* ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE REQUEST — the browser may not choose its own answer                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THIS TEST EXISTS BECAUSE THE FIRST VERSION OF THIS SCREEN WOULD HAVE 400'd ON
 * EVERY KEYSTROKE.
 *
 * `UnderwriteRequest` (the shared declaration) carries `asOf`, `seed`, `samples`,
 * `hoursPerDay` and `effort.statedBy`. The route REFUSES all five with a
 * `SERVER_FACT` 400 (`apps/api/src/gps/underwrite.ts:665`) because each one would let
 * the browser choose its own answer — most sharply the seed, since a caller who picks
 * the seed can shop for one that puts P(loss) under the ceiling. The page sent `asOf`
 * and `effort.statedBy`. `tsc` was happy: the shared type permits them, and the
 * refusal lives in the route's validator, not in the type.
 *
 * HONEST LIMITATION, stated because it is the same class of hole this file's header
 * describes: the field list below is a COPY of the server's, not an import of it.
 * `apps/api/src/gps/underwrite.ts` cannot be imported from a jsdom test (measured: it
 * initialises the calibration barrel and throws "WIN_REASONS is not iterable"), so
 * this asserts the web side against a written list. It catches the regression that
 * actually happened — a page adding a field the server rejects — and it would NOT
 * catch the server adding a sixth server fact. The real fix is a contract test beside
 * the route, which is named in the return value rather than implied here.
 */
describe('the request body', () => {
  const SERVER_FACTS = ['asOf', 'seed', 'samples', 'hoursPerDay'] as const;

  it('sends none of the fields the route rejects as server facts', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    const [sent] = mocked.mock.calls.at(-1) as [Record<string, unknown>];
    for (const f of SERVER_FACTS) {
      expect(sent, `${f} may not be supplied — the route 400s on it`).not.toHaveProperty(f);
    }
    // The fields it MUST send, so this is not passing by sending nothing at all.
    expect(sent.priceCents).toBe(1_000_000);
    expect(sent.partnerId).toBe('partner-1');
    expect(sent.currency).toBe('USD');
  });

  it('sends an effort override without claiming who stated it', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await u.type(screen.getByTestId('price-input'), '10000');
    await u.type(screen.getByTestId('partner-input'), 'partner-1');
    await u.type(screen.getByLabelText('Optimistic (d)'), '4');
    await u.type(screen.getByLabelText('Likely (d)'), '6');
    await u.type(screen.getByLabelText('Pessimistic (d)'), '8');
    await waitFor(() => {
      const [last] = (mocked.mock.calls.at(-1) ?? [{}]) as [Record<string, unknown>];
      expect(last.effort).toEqual({ optimisticDays: 4, likelyDays: 6, pessimisticDays: 8 });
    }, { timeout: 3000 });

    const [sent] = mocked.mock.calls.at(-1) as [{ effort: Record<string, unknown> }];
    // `statedBy` comes from the authenticated session so the record is a record rather
    // than an assertion — and there is therefore no input for it on the page.
    expect(sent.effort).not.toHaveProperty('statedBy');
    expect(sent.effort).not.toHaveProperty('statedAt');
    expect(screen.queryByLabelText(/stated by/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/hours per day/i)).not.toBeInTheDocument();
  });

  it('sends a partial effort triple as no override at all', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);
    // Two of three days typed. A half-supplied triple must not be promoted to a real
    // figure — `effortFromRequest` owns `isPlaceholder` for exactly this reason.
    await u.type(screen.getByLabelText('Optimistic (d)'), '4');
    await u.type(screen.getByLabelText('Likely (d)'), '6');
    await new Promise((r) => setTimeout(r, 700));

    const [sent] = mocked.mock.calls.at(-1) as [{ effort: unknown }];
    expect(sent.effort).toBeNull();
  });
});

describe('before a price exists', () => {
  it('sends no request and shows no numbers', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);

    // A price with no partner is not underwritable: the rate card the cost is drawn from
    // is loaded server-side by partner id, and firing the request anyway would spend a
    // refusal on a field he has not filled in — which teaches him to ignore refusals.
    await u.type(screen.getByTestId('price-input'), '10000');
    await new Promise((r) => setTimeout(r, 700));
    expect(mocked).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-margin-figure]').length).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* GPS PHASE 11 — THE ANSWER IS AN ARTEFACT, AND IT FEELS LIKE WHAT IT WAS     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `GpsPrintArtefact` and `lib/gpsFeel.ts` both shipped with "nothing imports this yet" in
 * their headers, which is the defect one layer along from having no print sheet at all.
 * These assertions go through the RENDERED page, so a future edit that unwraps the answer or
 * drops the feel call fails here rather than in the apparatus's own green suite.
 *
 * The fixtures are the four already verified at the top of this file, so nothing below has
 * to re-establish that LOSS loses money or that REFUSED produced no distribution.
 */
describe('the underwriting answer prints as an artefact', () => {
  it('wraps the answer, dates it to two instants, and counts its own notices', async () => {
    // THE MUTATION THAT PROVES THIS: unwrap `<Answer>` from `<GpsPrintArtefact>` and every
    // assertion here goes red — which is the state the print apparatus shipped in.
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    const sheet = await screen.findByTestId('gps-print-artefact');
    expect(sheet).toHaveAttribute('data-gps-artefact', 'underwriting');
    // READ AT is the browser's clock; FIGURES COMPUTED is the server's `asOf`. Two facts, and
    // a sheet dated only to the first cannot be told from a stale one.
    expect(screen.getByTestId('gps-print-computed-at').textContent).toContain('2026-08-01');
    expect(screen.getByTestId('gps-print-read-at').textContent).toMatch(/READ AT \d{4}-\d{2}-\d{2}/);
    expect(screen.getByTestId('gps-print-notice-count').textContent).toMatch(/\d+ NOTICES? QUALIFY/);
  });

  it('carries the placeholder-price notice with its mark, on a prior basis', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    await screen.findByTestId('gps-print-artefact');
    // Both are true of this fixture and both are asserted at the top of the file: the bands
    // are placeholders and the basis is `prior`, not measured.
    expect(screen.getByTestId('gps-print-caveat-placeholder_price')).toBeTruthy();
    expect(screen.getByTestId('gps-print-caveat-distribution_basis')).toBeTruthy();
    // THE WORD, not the colour. A greyscale printer flattens every hue in this palette.
    expect(screen.getByTestId('gps-print-mark-placeholder_price').textContent!.trim().length)
      .toBeGreaterThan(0);
  });

  it('prints P(loss) with the sample count behind it, and omits it on a refusal', async () => {
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    const { unmount } = render(<GpsUnderwriting />);
    await fill(u);
    const table = await screen.findByTestId('gps-print-provenance');
    expect(within(table).getByText('P(margin < 0)')).toBeTruthy();
    unmount();

    // A refusal produces a null `pLoss` — never a zero, because "no loss risk found" and
    // "loss risk not computable" are opposite statements. The row is omitted rather than
    // zeroed, and the REFUSED notice is what says why.
    // THE MUTATION THAT PROVES THIS: print `prob(u.pLoss ?? 0)` unconditionally and the
    // second half goes red with a 0.0% row on a refused sheet.
    mocked.mockResolvedValue(REFUSED);
    const u2 = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u2);
    const refusedTable = await screen.findByTestId('gps-print-provenance');
    expect(within(refusedTable).queryByText('P(margin < 0)')).toBeNull();
    expect(screen.getByTestId('gps-print-refusal-refused_currency_mismatch')).toBeTruthy();
  });

  it('has no header, footer, aside or role=status inside the sheet', async () => {
    // `PrintStyles` hides all four in print, so the dateline and the notices — the two parts
    // that matter most — would vanish from the paper. The apparatus asserts this over its own
    // render; this asserts it over the real page, where `Answer` supplies the body.
    mocked.mockResolvedValue(LOSS);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);
    const sheet = await screen.findByTestId('gps-print-artefact');
    expect(sheet.querySelectorAll('header, footer, aside, [role="status"]').length).toBe(0);
  });
});

describe('a computed verdict feels like what it was', () => {
  it('announces an underwritten distribution politely, not as a refusal', async () => {
    mocked.mockResolvedValue(PROFIT);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u, '25000');
    await screen.findByTestId('gps-print-artefact');
    // The live region is the only channel that distinguishes the three under
    // `prefers-reduced-motion`, where every juice animation is 0.01ms.
    await waitFor(() => {
      expect(document.querySelector('[aria-live="polite"]')?.textContent ?? '')
        .toContain('Underwritten');
    });
  });

  it('a missing founder input is UNDETERMINED, so it does not shake at the operator', async () => {
    // `refused_price_not_set` and four siblings are the founder's gap, not the operator's:
    // `underwriteFeel` routes them to `became`+amber rather than to `refuse`+red.
    // THE MUTATION THAT PROVES THIS: flip that row to `refused` in `lib/gpsFeel.ts` and this
    // goes red on the assertive region.
    const missing = { ...REFUSED, underwriting: { ...REFUSED.underwriting, verdict: 'refused_price_not_set' as const } };
    mocked.mockResolvedValue(missing);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);
    await waitFor(() => {
      expect(document.querySelector('[aria-live="polite"]')?.textContent ?? '').toMatch(/price/i);
    });
    expect(document.querySelector('[aria-live="assertive"]')?.textContent ?? '').toBe('');
  });

  it('a real refusal IS assertive — the governed answer that did not happen', async () => {
    mocked.mockResolvedValue(REFUSED);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);
    await waitFor(() => {
      expect(document.querySelector('[aria-live="assertive"]')?.textContent ?? '').not.toBe('');
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* G3 — THE PROPOSE-PRICE CONTROL                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the propose-price control (G3)', () => {
  const PROPOSAL = {
    proposedPriceCents: 2_181_819,
    referencePriceCents: 1_000_000,
    basis: {
      policy: { targetMarginPct: 0.45, pLossCeiling: 0.1 },
      quantiles: { p50CostCents: 1_200_000, p90CostCents: 1_400_000, p95CostCents: 1_500_000, maxCostCents: 1_700_000 },
      marginFloorCents: 2_181_819,
      lossFloorCents: 1_400_000,
      lossQuantilePctUsed: 90 as const,
      conservativeSnap: 'ceiling 0.2 evidenced at the 0.10 grid point (p90 cost) — the next stricter observed statistic.',
      bindingFloor: 'margin' as const,
      method: 'the stated method',
    },
    policySource: { decidedBy: 'nik', decidedAt: '2026-08-22T00:00:00.000Z', rationale: 'the packet defaults' },
    stamps: {
      proposedBy: 'system:inverse-solver',
      policyDecidedBy: 'nik',
      requestedBy: 'nik',
      approvedBy: null,
      note: 'A proposal, not a price. The owner types the final figure on the quote (decision 4), and the issue guard keeps its veto either way.',
    },
    underwritingAtProposed: PROFIT,
  };

  it('solves, fills the price field, and renders a proposal that nobody has approved', async () => {
    mocked.mockResolvedValue(PROFIT);
    mockedPropose.mockResolvedValue(PROPOSAL);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    fireEvent.click(screen.getByTestId('propose-price'));
    const panel = await screen.findByTestId('price-proposal');

    // The request carried the typed reference; the field now carries the PROPOSAL.
    const sent = mockedPropose.mock.calls[0][0];
    expect(sent.priceCents).toBe(1_000_000);
    expect((screen.getByTestId('price-input') as HTMLInputElement).value).toBe('21818.19');

    // The arithmetic on display: both floors, the binding side, the snap, the author.
    // The panel prints through the page's own `money` helper (whole dollars); the
    // cents-exact figure lives in the FIELD, which is the number that gets underwritten.
    expect(within(panel).getByTestId('proposed-price')).toHaveTextContent('$21,818');
    expect(panel).toHaveTextContent(/the margin floor binds/);
    expect(within(panel).getByTestId('proposal-snap')).toHaveTextContent(/next stricter observed statistic/);
    expect(panel).toHaveTextContent(/Policy by nik/);
    // The stamps sentence — proposed by the solver, approved by NOBODY.
    expect(within(panel).getByTestId('proposal-stamps')).toHaveTextContent(/system:inverse-solver proposed/);
    expect(within(panel).getByTestId('proposal-stamps')).toHaveTextContent(/approved by nobody/);
    // The proof line reads off the forward run at the proposed price.
    expect(within(panel).getByTestId('proposal-proof')).toHaveTextContent(/P\(loss\)/);
  });

  it('a refusal renders verbatim and fills nothing', async () => {
    mocked.mockResolvedValue(PROFIT);
    mockedPropose.mockRejectedValue(new Error('No pricing policy has been approved. Approve the pricing_policy packet on the Inputs desk — the solver refuses to run on a default nobody chose.'));
    const u = userEvent.setup();
    render(<GpsUnderwriting />);
    await fill(u);

    fireEvent.click(screen.getByTestId('propose-price'));
    const alert = await screen.findByTestId('proposal-error');
    expect(alert).toHaveTextContent(/pricing_policy packet/);
    expect(screen.queryByTestId('price-proposal')).toBeNull();
    expect((screen.getByTestId('price-input') as HTMLInputElement).value).toBe('10000');
  });
});
