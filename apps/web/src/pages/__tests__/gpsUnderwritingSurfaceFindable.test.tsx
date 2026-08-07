/**
 * THE MARGIN SURFACE IS FINDABLE, AND IT ACTUALLY REACHES THE DOM.
 *
 * ── THE DEFECT THIS FILE WAS OPENED FOR ──────────────────────────────────────
 * The owner looked at the product and reported there is no three-dimensional figure
 * anywhere in it. He was reading the evidence correctly. `MarginSurface` renders inside
 * `Distribution`, which renders only after an operator picks an offer, picks a partner,
 * types a price AND gets a non-refused verdict — so a human who browses to this screen
 * sees a form and an empty state, and nothing on that screen has ever mentioned that a
 * surface is what the form produces.
 *
 * ── WHAT THE THREE EXISTING SURFACE TESTS DO NOT COVER, WHICH IS WHY THIS EXISTS ──
 * `marginSurfaceWiring.test.ts` and `gpsUnderwritingSurface.test.tsx` read the page's
 * SOURCE and drive the pure builder. `components/geometry/__tests__/surfacePlot.test.tsx`
 * mounts the renderer against a hand-made outcome. Not one of them mounts THIS PAGE and
 * asserts a figure arrives in the DOM, so the entire chain page → `buildMarginSurface` →
 * `SurfacePlot` → SVG was green on every link and untested end to end. A `toContain` over
 * source text cannot tell you the component threw, was memoised into oblivion, or landed
 * inside a branch that never runs.
 *
 * So this file asserts the two halves of the fix against the RENDERED page:
 *
 *   BEFORE a quote — the surface is NAMED and NOT DRAWN. Both halves are load-bearing.
 *     Naming it is the findability fix. Not drawing it is the doctrine: an empty box with
 *     axes on it reads as a MEASURED FLAT SURFACE, which is the exact claim `SurfacePlot`'s
 *     refused branch exists to stop a figure ever making. Prose cannot be mistaken for a
 *     measurement; a placeholder box can.
 *
 *   AFTER a quote — the surface IS DRAWN, with its `readsAs` and its environment label,
 *     and the promise is gone because the thing it promised has arrived.
 *
 * ── THE FIXTURE IS THE ENGINE'S OWN OUTPUT ───────────────────────────────────
 * `buildUnderwriteResponse` with a real `CostModel` and a real `RateCard`, exactly as
 * `gpsUnderwriting.test.tsx` does it and for the reason recorded there: a hand-written
 * payload asserts the page against the same invented contract the page was written
 * against, and the two wrongs agree with a green tick.
 *
 * ── WHAT THIS FILE CANNOT SEE, STATED PLAINLY ────────────────────────────────
 * jsdom has no layout and no paint. "The surface is visible" is asserted here as "the
 * figure's elements are in the document and are not behind a disclosure control". It is
 * not a claim that a human can read the polygons, and no assertion below should be quoted
 * as one — `svg-figures-need-looking-at` is the standing note on why a passing DOM test
 * proves polygon ORDER and not legibility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  buildUnderwriteResponse,
  type CostModel,
  type UnderwriteQuote,
  type UnderwriteResponse,
} from '../../../../../packages/shared/src/gps/underwrite.js';
import type { RateCard } from '../../../../../packages/shared/src/gps/partners.js';
import { GpsUnderwriting, MARGIN_SURFACE_PROMISE } from '../GpsUnderwriting';
import * as api from '@/lib/api/gpsUnderwrite';

vi.mock('@/lib/api/gpsUnderwrite', async () => {
  const real = await vi.importActual<typeof import('@/lib/api/gpsUnderwrite')>('@/lib/api/gpsUnderwrite');
  return { ...real, underwriteQuote: vi.fn() };
});

const mocked = api.underwriteQuote as unknown as ReturnType<typeof vi.fn>;

const ASOF = '2026-08-01T00:00:00.000Z';

function card(): RateCard {
  return {
    offerKey: 'mica_whitepaper',
    unit: 'day_rate',
    amountCents: 200_000,
    expectedUnits: 6,
    currency: 'USD',
    validUntil: '2027-01-01T00:00:00.000Z',
    statedBy: 'nikhil.sharma@lcx.com',
    statedAt: '2026-07-01T00:00:00.000Z',
  };
}

function model(): CostModel {
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
      isPlaceholder: false,
    },
    hoursPerDay: null,
    fixedCostCents: 0,
  };
}

/** $25,000 against a $12,000 likely cost — comfortably underwritten, so a figure exists. */
const PROFIT: UnderwriteResponse = buildUnderwriteResponse(
  { offerKey: 'mica_whitepaper', priceCents: 2_500_000, currency: 'USD' } satisfies UnderwriteQuote,
  model(),
  { asOf: ASOF },
);

beforeEach(() => {
  mocked.mockReset();
  vi.useRealTimers();
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE PREMISE — verified against the engine before anything is asserted of    */
/* the screen. A "the surface renders" test proves nothing if the fixture      */
/* could not have produced one.                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the fixture is a quote that can carry a surface', () => {
  it('is underwritten, with a distribution and the overrun points the surface walks', () => {
    expect(PROFIT.underwriting.verdict).toBe('underwritten');
    expect(PROFIT.underwriting.distribution).not.toBeNull();
    // The y axis of the figure IS these points. Fewer than two and the engine refuses the
    // axis rather than drawing a line in three dimensions.
    expect(PROFIT.sensitivity.points.length).toBeGreaterThanOrEqual(2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* BEFORE A QUOTE — named, and deliberately not drawn                          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a reader who only browses the screen learns the surface exists', () => {
  it('prints the promise verbatim, before anything has been submitted', async () => {
    const { container } = render(<GpsUnderwriting />);

    /*
     * The exact constant, not a loose /margin surface/i. A regex that broad would keep
     * passing against a vaguer sentence — "there are charts" — which is an advertisement
     * rather than the description a reader can act on. Naming both floor axes is the
     * difference, and it is asserted below.
     */
    await waitFor(() => {
      expect(container.textContent).toContain(MARGIN_SURFACE_PROMISE);
    });
  });

  it('names BOTH floor axes, so the promise describes a figure rather than advertising one', () => {
    /*
     * NOT a self-assertion. The promise is prose someone can rewrite at any time, and the
     * property being ratcheted is that whatever it says must name the two independent
     * variables — a surface over one real variable and one decorative one is decoration
     * (`geometry/index.ts:24`), and a promise that cannot name two is describing decoration.
     */
    expect(MARGIN_SURFACE_PROMISE).toMatch(/price/i);
    expect(MARGIN_SURFACE_PROMISE).toMatch(/effort overrun/i);
    expect(MARGIN_SURFACE_PROMISE).toMatch(/median margin/i);
  });

  it('names the precondition, so it is not advertising a figure the platform cannot draw', () => {
    /*
     * THE DEFECT THIS RATCHETS. "When a quote lands" hid the whole reachability question.
     * `Distribution` renders only on a non-refused verdict, and with no `gps_rate_card` row
     * for the partner-offer pair `loadRateCard` returns `placeholderRateCard` — `validUntil`
     * null — and `resolveCostBasis` refuses `refused_rate_card_no_validity_stated`. No
     * distribution, no surface. On every environment with no recorded card, a reader who acts
     * on this sentence gets a refusal forever, and an empty state that advertises a figure
     * without naming what has to exist first has made the absence HARDER to explain, not the
     * figure easier to find. Not a self-assertion: the property is that whatever the sentence
     * says, it names the thing that has to be on record and the outcome when it is not.
     */
    expect(MARGIN_SURFACE_PROMISE).toMatch(/rate card/i);
    expect(MARGIN_SURFACE_PROMISE).toMatch(/refusal/i);
  });

  it('draws NOTHING — not a figure, not a refusal card, not an empty box', async () => {
    render(<GpsUnderwriting />);

    // Positive first, so the negatives below run against a page that has actually
    // rendered rather than against an empty container (doctrine-lint rule 5).
    await waitFor(() => {
      expect(screen.getByText('Nothing to underwrite yet')).toBeInTheDocument();
    });

    /*
     * THE HALF THAT IS EASY TO GET WRONG. The obvious way to "make the surface findable"
     * is to render one immediately with an empty grid. That draws a labelled box a reader
     * reads as a measured flat surface at the height of zero — a fabrication they cannot
     * detect. `SurfacePlot` refuses rather than doing it, and this page must not reach the
     * same outcome by calling the refusal branch early either: a refusal card before any
     * price has been typed says the platform declined to answer a question nobody asked.
     */
    expect(screen.queryByTestId('surface-plot')).toBeNull();
    expect(screen.queryByTestId('surface-refused')).toBeNull();
    expect(screen.queryByTestId('surface-reads-as')).toBeNull();

    // And the promise is prose, not a stalled request: nothing was fetched to produce it.
    expect(mocked).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* AFTER A QUOTE — the figure actually reaches the DOM                         */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the promised surface is what actually arrives', () => {
  it('renders the figure, its readsAs and its environment label once a quote lands', async () => {
    mocked.mockResolvedValue(PROFIT);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);

    await u.type(screen.getByTestId('price-input'), '25000');
    await u.type(screen.getByTestId('partner-input'), 'partner-1');

    await waitFor(() => {
      /*
       * THE END-TO-END LINK NOTHING ELSE COVERS: page → buildMarginSurface → SurfacePlot →
       * SVG. `surface-plot` is only emitted on the PROJECTED branch, so this failing means
       * either the figure is absent or it refused on a legitimate quote — and the two are
       * separated by the `surface-refused` assertion below.
       */
      expect(screen.getByTestId('surface-plot')).toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      // `readsAs` is required by the renderer precisely so a caller must state what the
      // flat version loses. Its presence is the figure declaring it is not decoration.
      expect(screen.getByTestId('surface-reads-as').textContent)
        .toMatch(/how much price buys back an overrun/i);
      // The frame names the API that answered, never a database nobody can point at.
      expect(screen.getByTestId('surface-environment').textContent).toMatch(/^API /);
    });

    // It PROJECTED. A refusal also renders (correctly, as a refusal) and would leave the
    // page looking answered while carrying no figure at all.
    expect(screen.queryByTestId('surface-refused')).toBeNull();
  });

  it('describes a feature the sheet actually has, and states what it cannot be read for', async () => {
    /*
     * THE CAPTION USED TO NAME A RIDGE. It said "the ridge between them is the answer the
     * table beside this cannot give". A ridge is a crest with the surface falling away on
     * both sides, and this surface has none: at a fixed simulated cost `marginPct` rises with
     * every price step, so the sheet climbs monotonically. Rendered at $25,000 against a
     * $12,000 median cost it runs 40.0/46.7/52.0/56.4/60.0 across price at baseline and
     * 10.0/20.0/28.0/34.5/40.0 at +50% — no crest anywhere in it. A caption naming a feature
     * the drawing does not contain is the same defect class as a fabricated number.
     *
     * The reading that IS there is the level set: 40% at (baseline, $20,000), (+25%, $25,000)
     * and (+50%, $30,000), a diagonal. And its limit is real — the engine draws no iso-height
     * contour and the vertical domain here excludes zero, so equal heights are compared by eye
     * against three ticks. The caption must carry both, and this asserts it against the
     * RENDERED figure rather than against the constant, so a caller that stops passing it goes
     * red too.
     */
    mocked.mockResolvedValue(PROFIT);
    const u = userEvent.setup();
    render(<GpsUnderwriting />);

    await u.type(screen.getByTestId('price-input'), '25000');
    await u.type(screen.getByTestId('partner-input'), 'partner-1');

    await waitFor(() => {
      const readsAs = screen.getByTestId('surface-reads-as').textContent ?? '';
      // The level set, which is the fact the flat table cannot hold.
      expect(readsAs).toMatch(/equal\s+height/i);
      // The absent crest, said out loud rather than left for a reader to hunt for.
      expect(readsAs).toMatch(/no ridge/i);
      // And the honest ceiling on the picture: a shape, not a source of numbers.
      expect(readsAs).toMatch(/quoted as one|printed as numbers nowhere/i);
    }, { timeout: 3000 });
  });

  it('retires the promise once the thing it promised is on screen', async () => {
    mocked.mockResolvedValue(PROFIT);
    const u = userEvent.setup();
    const { container } = render(<GpsUnderwriting />);

    await u.type(screen.getByTestId('price-input'), '25000');
    await u.type(screen.getByTestId('partner-input'), 'partner-1');

    await waitFor(() => {
      expect(screen.getByTestId('surface-plot')).toBeInTheDocument();
    }, { timeout: 3000 });

    /*
     * The empty state is REPLACED, not stacked above the answer. A page still saying "when
     * a quote lands you will get a surface" underneath an actual surface reads as a second,
     * different figure being withheld.
     */
    expect(container.textContent).not.toContain(MARGIN_SURFACE_PROMISE);
  });
});
