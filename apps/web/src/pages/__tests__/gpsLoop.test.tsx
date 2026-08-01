import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
/**
 * THE FIXTURES ARE BUILT BY THE REAL ENGINE, imported by relative path.
 *
 * WHY NOT A HAND-WRITTEN OBJECT LITERAL, AND WHY NOT `@lcx/shared`. A hand-written
 * `LoopResponse` fixture is the exact defect that shipped a broken page with a green
 * suite in this compartment eight days ago (`lib/api/gps.ts:83`): the test mocked the
 * API module, so it asserted the page against the SAME invented contract the page was
 * written against, and two wrongs agreeing is not a passing test. So every payload
 * below comes out of `loopResponse()`, `winLossSummary()` and `marginRealisation()`
 * themselves — if the engine's suppression, sign or null semantics change, these
 * tests change with them instead of quietly continuing to assert last week's shape.
 *
 * The relative path is deliberate too. `@lcx/shared`'s barrel does not export the
 * Phase-12 block yet (a human wiring pass owns that file), and pointing the test at
 * the barrel would make it fail for a reason that has nothing to do with the page.
 */
import { loopResponse } from '../../../../../packages/shared/src/gps/loop';
import { marginRealisation, winLossSummary } from '../../../../../packages/shared/src/gps/calibration';
import type { OutcomeRecord } from '../../../../../packages/shared/src/gps/calibration';
import { WEIGHTS_V1 } from '../../../../../packages/shared/src/gps/targeting';
import { GpsLoop } from '../GpsLoop';
import * as loopApi from '@/lib/api/gpsLoop';

/**
 * GLOBAL SERVICES — THE LOOP: the guards on the screen that is honest about what it
 * does not know.
 *
 * These are not smoke tests. Each one asserts a boundary a future edit could cross in
 * good faith, and three of them assert an ABSENCE — the only kind of claim that
 * survives somebody adding a helpful feature:
 *
 *  1. NO PERCENTAGE BELOW THE THRESHOLD, ANYWHERE ON THE PAGE. Not "the win rate is
 *     hidden" — no percent sign in the document at all at n=3, because the failure
 *     mode is a rate escaping into a screenshot and outliving the bug.
 *  2. NO CONTROL THAT ADJUSTS A WEIGHT. The packet informs a human. A slider, an
 *     "apply", or a DISABLED one (which implies the capability exists and is merely
 *     gated) all fail this.
 *  3. NO CLIENT-ARTIFACT INTAKE. Decision D2 is unanswered, so the fetcher module's
 *     export list is read and any upload-shaped name fails.
 *
 * WHAT THESE TESTS CANNOT SEE, stated plainly: jsdom has no layout and no paint, so
 * "the health block is the main content at low n" is asserted here only as "the health
 * verdict and all six conclusions are in the DOM, ahead of the aggregates, not behind
 * a disclosure control". That is a real regression guard and it is not a claim about
 * what a human perceives.
 */

vi.mock('@/lib/api/gpsLoop', () => ({
  fetchGpsLoop: vi.fn(),
  fetchGpsWinLoss: vi.fn(),
  fetchGpsMarginRealisation: vi.fn(),
  fetchGpsCaptureForm: vi.fn(),
  recordGpsOutcome: vi.fn(),
}));

const mocked = vi.mocked(loopApi);

/** jsdom implements neither. The page uses both; neither is under test here. */
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  window.print = vi.fn();
});

/* ── Real records, built to exercise one boundary each ─────────────────────── */

function record(over: Partial<OutcomeRecord> & Pick<OutcomeRecord, 'engagementId'>): OutcomeRecord {
  return {
    clientId: 'c-1',
    offerKey: 'gtm_sprint',
    disposition: 'won',
    reason: 'price',
    quotedPriceCents: 2_000_000,
    realisedPriceCents: null,
    quotedVendorCostCents: 800_000,
    realisedVendorCostCents: null,
    cycleTimeDays: null,
    acceptanceFirstPass: null,
    partner: null,
    factorScoresAtQuote: null,
    decidedAt: '2026-07-20',
    ...over,
  };
}

/**
 * THREE outcomes — one below `MIN_N_FOR_RATE` (8) by a wide margin, and the exact
 * case the doctrine names: "33%" off three data points, whose Wilson interval is
 * roughly 12%–88% (`calibration.ts:236`).
 */
const THREE: readonly OutcomeRecord[] = [
  record({ engagementId: '11111111-1111-4111-8111-111111111111' }),
  record({ engagementId: '22222222-2222-4222-8222-222222222222' }),
  record({
    engagementId: '33333333-3333-4333-8333-333333333333',
    disposition: 'lost',
    reason: 'price_too_high',
  }),
];

const ASOF = '2026-08-01T09:00:00.000Z';
const WEEK = '2026-07-27';

const loopAt = (records: readonly OutcomeRecord[]) => loopResponse({
  asOf: ASOF,
  records,
  recordsThisWeek: records,
  weekStart: WEEK,
  currentWeights: WEIGHTS_V1,
  wip: null,
});

/**
 * A REALISED LOSS, built from the engine's own worked example inverted: quoted
 * $20,000 on an $8,000 partner cost (margin $12,000); realised $19,000 invoiced
 * against a $25,000 partner invoice. Realised margin is −$6,000 and slippage is
 * −$18,000. Both must render with their sign.
 */
const LOSS_RECORD = record({
  engagementId: '44444444-4444-4444-8444-444444444444',
  partner: 'specialist-a',
  realisedPriceCents: 1_900_000,
  realisedVendorCostCents: 2_500_000,
});

/**
 * The section that owns a title.
 *
 * `getByText` is ambiguous here on purpose: the page prints its section index as a
 * nav (which doubles as the D6 key legend), so every title appears twice. The HEADING
 * is the content; the link is navigation.
 */
async function sectionFor(title: RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: title });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

/** Source with comments stripped — a doctrine stated in prose must not satisfy a
 *  ratchet that is about code. Both of the absence checks below read code only. */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function mountAll(records: readonly OutcomeRecord[], opts: { margin?: boolean; winLoss?: boolean } = {}) {
  mocked.fetchGpsLoop.mockResolvedValue(loopAt(records));
  if (opts.winLoss === false) {
    mocked.fetchGpsWinLoss.mockRejectedValue(new Error('not registered'));
  } else {
    mocked.fetchGpsWinLoss.mockResolvedValue(winLossSummary(records));
  }
  if (opts.margin === false) {
    mocked.fetchGpsMarginRealisation.mockRejectedValue(new Error('not registered'));
  } else {
    mocked.fetchGpsMarginRealisation.mockResolvedValue(marginRealisation(records));
  }
  return render(<MemoryRouter><GpsLoop /></MemoryRouter>);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 1 · AT n=3 NO PERCENTAGE IS RENDERED, AND THE REFUSAL IS A SENTENCE          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the loop at n=3', () => {
  it('renders no percentage anywhere on the page', async () => {
    const { container } = mountAll(THREE);
    await sectionFor(/Calibration health/i);
    await waitFor(() => expect(mocked.fetchGpsWinLoss).toHaveBeenCalled());

    /**
     * THE WHOLE DOCUMENT, not just the win/loss block. A suppressed headline with a
     * "33%" surviving in a tooltip, a WBR line or a review row is the same defect —
     * the number is what gets screenshotted, and it does not carry its section with
     * it. Three decided outcomes support no rate, no margin percentage and no
     * utilisation figure, so at this n the correct count of percent signs is zero.
     */
    expect(container.textContent ?? '').not.toMatch(/\d\s*%/);
  });

  it('states the suppression in words, with the count, instead of a dash', async () => {
    mountAll(THREE);
    // The engine's own sentence, reproduced verbatim by the screen. Asserting the
    // shape rather than the exact string keeps this test honest if the wording is
    // improved, while still failing if it degrades to "—" or to "N/A".
    // The ENGINE's sentence, verbatim (`calibration.ts:380`) — the count, the
    // threshold and what is reported instead, in one line a human can read on a
    // slide. The screen prints `suppressionReason` rather than composing its own, so
    // this asserts the wording the review will actually see.
    const sentences = await screen.findAllByText(
      /3 decided engagements is below the stated minimum of 8; reporting counts only/i,
    );
    expect(sentences.length).toBeGreaterThan(0);
  });

  it('shows the raw counts that replace the rate', async () => {
    mountAll(THREE);
    expect((await screen.findAllByText(/2 won \/ 1 lost/)).length).toBeGreaterThan(0);
  });

  it('renders all six conclusions as rows, including the unanswerable ones', async () => {
    mountAll(THREE);
    const section = await sectionFor(/Calibration health/i);
    // "cannot conclude" is a VERDICT with a stated reason, not an omission. Six
    // questions are asked at every n, including zero.
    const verdicts = within(section).getAllByText(/cannot conclude|answerable/i);
    expect(verdicts.length).toBe(6);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 2 · A LOSS RENDERS AS A LOSS                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('signed money', () => {
  it('renders a realised loss with its sign, never as a magnitude', async () => {
    const { container } = mountAll([...THREE, LOSS_RECORD]);
    await waitFor(() => expect(mocked.fetchGpsMarginRealisation).toHaveBeenCalled());
    const text = await waitFor(() => {
      const t = container.textContent ?? '';
      expect(t).toMatch(/−\$/);
      return t;
    });

    // U+2212 MINUS SIGN, the character `formatMoney` emits. Realised margin −$6,000
    // and slippage −$18,000 both come from the engine's arithmetic, not from this test.
    expect(text).toContain('−$6,000');
    expect(text).toContain('−$18,000');

    // And the unsigned form must NOT appear on its own: an absolute value here would
    // make an overrun read identically to coming in under budget.
    expect(text).not.toMatch(/(^|[^−])\$18,000/);
  });

  it('counts engagements delivered at a loss rather than rating them', async () => {
    mountAll([...THREE, LOSS_RECORD]);
    expect((await screen.findAllByText(/at a loss/i)).length).toBeGreaterThan(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 3 · NO CONTROL ANYWHERE ADJUSTS A WEIGHT                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the review packet applies nothing', () => {
  const WEIGHT_CONTROL = /weight|adjust|tune|recalibrat|apply|retrain|optimi[sz]e/i;

  it('renders no control that could change a weight, disabled or otherwise', async () => {
    const { container } = mountAll(THREE);
    await sectionFor(/Review packet/i);

    /**
     * EVERY interactive element on the page, not just the review section, and
     * DISABLED ONES COUNT. A greyed-out "Apply recommendations" implies the
     * capability exists and is merely gated, which is a different and worse lie than
     * silence — the reader concludes the system does tune weights and simply will not
     * let them do it today.
     */
    const controls = container.querySelectorAll(
      'button, input, select, textarea, [role="button"], [role="slider"], [contenteditable="true"]',
    );
    for (const el of Array.from(controls)) {
      const label = [
        el.textContent ?? '',
        el.getAttribute('aria-label') ?? '',
        el.getAttribute('name') ?? '',
        el.getAttribute('title') ?? '',
      ].join(' ');
      expect(label).not.toMatch(WEIGHT_CONTROL);
    }
    expect(container.querySelector('input[type="range"]')).toBeNull();
  });

  it('states the only mechanism by which a weight ever changes', async () => {
    mountAll(THREE);
    expect((await screen.findAllByText(/a human edits WEIGHTS_V1 in targeting\.ts/i)).length).toBeGreaterThan(0);
  });

  it('exposes no weight-writing function on the fetcher module', () => {
    // A control cannot appear before a function to call, so the module boundary is
    // the cheaper ratchet and it does not depend on rendering.
    for (const name of Object.keys(loopApi)) {
      expect(name).not.toMatch(/weight|tune|retrain|calibrate|adjust/i);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 4 · n=0 IS USEFUL AND IMPLIES NOTHING                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the loop at n=0', () => {
  it('states a verdict rather than rendering an empty state', async () => {
    const { container } = mountAll([]);
    await sectionFor(/Calibration health/i);

    // "No outcomes recorded" is the engine's verdict label — a finding with content,
    // not an illustration with "no data yet" under it.
    expect((await screen.findAllByText(/No outcomes recorded/i)).length).toBeGreaterThan(0);
    expect(container.textContent ?? '').not.toMatch(/no data (yet|available)|nothing to show|get started/i);
  });

  it('still asks all six questions and answers each with a reason', async () => {
    mountAll([]);
    const section = await sectionFor(/Calibration health/i);
    expect(within(section).getAllByText(/cannot conclude|answerable/i).length).toBe(6);
    // Every answer cell is prose. A dash in one of these is what reads as an
    // oversight rather than as a finding (`loop.ts:757`).
    expect(section.textContent ?? '').not.toMatch(/>\s*—\s*</);
  });

  it('renders no percentage and no invented zero for margin', async () => {
    const { container } = mountAll([]);
    await waitFor(() => expect(mocked.fetchGpsMarginRealisation).toHaveBeenCalled());
    await waitFor(() => {
      /**
       * ONE PERCENT SIGN IS ALLOWED AT n=0, AND ONLY THIS ONE: the engine's own
       * refusal sentence for the pooled rate ends `... and no counts either. Not
       * "0%".` A percentage QUOTED INSIDE A REFUSAL is the opposite of the defect
       * being guarded against — it is the page saying which number it declines to
       * print. Everything else must still be percent-free, so the quoted form is
       * stripped rather than the check being weakened.
       */
      const text = (container.textContent ?? '').replace(/Not\s*["“]\d+%["”]/g, '');
      expect(text).not.toMatch(/\d\s*%/);
    });
    // "Not zero margin — unmeasured margin" is the distinction the whole page turns on.
    expect((await screen.findAllByText(/not zero margin/i)).length).toBeGreaterThan(0);
  });

  it('carries the volume constraint and the survivorship disclosure at the top', async () => {
    mountAll([]);
    // `CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL`, verbatim on the wire.
    expect((await screen.findAllByText(/fits nothing, learns nothing, and adjusts no weight/i)).length)
      .toBeGreaterThan(0);
    expect((await screen.findAllByText(/survivorship bias/i)).length).toBeGreaterThan(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 5 · MONITORS ARE DEFINITIONS, AND DETAIL ROUTES DEGRADE HONESTLY             */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('stated absences', () => {
  it('says none of the monitors is registered, and offers no control to fire one', async () => {
    const { container } = mountAll(THREE);
    expect((await screen.findAllByText(/None of these is registered/i)).length).toBeGreaterThan(0);
    const controls = Array.from(container.querySelectorAll('button'));
    for (const b of controls) {
      expect(b.textContent ?? '').not.toMatch(/enable|register|run monitor|fire/i);
    }
  });

  it('names the missing route instead of rendering an empty win/loss table', async () => {
    mountAll(THREE, { winLoss: false, margin: false });
    expect((await screen.findAllByText(/win-loss is not answering/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/margin is not answering/i)).length).toBeGreaterThan(0);
    // The rest of the page must survive a detail route being unregistered — the blocks
    // that are useful at n=0 are exactly the ones that do not depend on it.
    expect(await sectionFor(/Calibration health/i)).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 6 · NO CLIENT-ARTIFACT INTAKE ON THIS SURFACE EITHER                         */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('the artifact lockout reaches Phase 12', () => {
  const FETCHER = resolve(__dirname, '../../lib/api/gpsLoop.ts');
  const PAGE = resolve(__dirname, '../GpsLoop.tsx');

  it('exports no upload-shaped function', () => {
    for (const name of Object.keys(loopApi)) {
      expect(name).not.toMatch(/upload|attach|artifact|multipart|presign|blob/i);
    }
  });

  it('has no file input and no multipart anywhere in the two files', () => {
    const src = codeOf(FETCHER) + codeOf(PAGE);
    expect(src).not.toMatch(/type="file"|FormData|multipart\/form-data|\.files\b/);
  });

  it('never takes an absolute value of money', () => {
    // `Math.abs` on a slippage figure is how a loss becomes indistinguishable from a
    // saving. The sign is the entire message (`calibration.ts:459`).
    expect(codeOf(PAGE)).not.toMatch(/Math\.abs/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* 7 · THE CAPTURE FORM — no defaults, and every refusal comes from the engine  */
/* ══════════════════════════════════════════════════════════════════════════ */

const SUBJECT = {
  engagementId: '55555555-5555-4555-8555-555555555555',
  clientId: 'c-9',
  offerKey: 'gtm_sprint' as const,
  status: 'proposed' as const,
  quotedPriceCents: 2_000_000,
  quotedVendorCostCents: 800_000,
};

function mountWithCapture(records: readonly OutcomeRecord[] = []) {
  mocked.fetchGpsLoop.mockResolvedValue(loopResponse({
    asOf: ASOF,
    records,
    recordsThisWeek: records,
    weekStart: WEEK,
    currentWeights: WEIGHTS_V1,
    wip: null,
    capture: { subject: SUBJECT },
  }));
  mocked.fetchGpsWinLoss.mockResolvedValue(winLossSummary(records));
  mocked.fetchGpsMarginRealisation.mockResolvedValue(marginRealisation(records));
  return render(<MemoryRouter><GpsLoop engagementId={SUBJECT.engagementId} /></MemoryRouter>);
}

describe('outcome capture', () => {
  it('opens the realised price EMPTY rather than pre-filled from the quote', async () => {
    /**
     * THE MOST IMPORTANT ASSERTION IN THIS FILE.
     *
     * Defaulting realised price to the quoted price is superficially reasonable and
     * would destroy `priceSlippageMeanCents` by construction (`loop.ts:360`): every
     * engagement would show zero discount, and the one number that tells the founder
     * whether he is discounting under pressure would read zero forever. It is also
     * exactly the "helpful" edit a future contributor makes without malice, which is
     * why it is a test and not a comment.
     */
    mountWithCapture();
    const price = await screen.findByLabelText(/Realised price/i) as HTMLInputElement;
    expect(price.value).toBe('');
    const cost = await screen.findByLabelText(/Realised partner cost/i) as HTMLInputElement;
    expect(cost.value).toBe('');
    // The quoted side is present as a figure and absent as a control: it was fixed at
    // proposal time, and re-typing it at close rewrites the quoted side of every
    // slippage number to match the realised one.
    expect(screen.queryByLabelText(/Quoted price|Quoted margin/i)).toBeNull();
  });

  it('refuses the reason field until a disposition is chosen, and says why', async () => {
    mountWithCapture();
    const reason = await screen.findByLabelText(/Reason \(closed vocabulary\)/i) as HTMLSelectElement;
    // D2 — a disabled control that explains itself. `reasonOptions` is null until a
    // disposition exists, because the two vocabularies do not overlap.
    expect(reason.disabled).toBe(true);
    expect(reason.textContent).toMatch(/choose won or lost first/i);
  });

  it('offers a three-valued acceptance control, because null is not false', async () => {
    mountWithCapture();
    const accepted = await screen.findByLabelText(/Accepted first pass/i) as HTMLSelectElement;
    // "not delivered" and "failed first pass" are opposite facts; a checkbox can only
    // express one of them (`calibration.ts:192`).
    expect(accepted.tagName).toBe('SELECT');
    expect(Array.from(accepted.options).map((o) => o.value)).toEqual(['', 'true', 'false']);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('names the missing migration when the store does not exist, and keeps the entry', async () => {
    mocked.recordGpsOutcome.mockResolvedValue({
      outcome: 'store_missing',
      form: null,
      migration: '0050_gps_outcome.sql',
      detail: null,
    });
    mountWithCapture();
    const button = await screen.findByRole('button', { name: /Record the outcome/i });
    button.click();
    // The remedy is "run one file", not "re-enter this" and not "the platform is down".
    expect((await screen.findAllByText(/0050_gps_outcome\.sql/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/entry was acceptable/i)).length).toBeGreaterThan(0);
  });

  it('renders the engine’s blockers on a refusal, and states that nothing was written', async () => {
    const { outcomeCaptureForm } = await import('../../../../../packages/shared/src/gps/loop');
    /**
     * D4 — the system argues back, and the argument is the ENGINE'S.
     *
     * `won` on a `proposed` engagement raises `won_before_acceptance` rather than
     * being accepted: at $10–25k the difference between a verbal yes and an accepted
     * proposal is the whole basis of the deposit leg. The form comes back from the
     * server on the 422 so the reason travels with the refusal (D2) — the browser
     * does not compute this and must not.
     */
    const refused = outcomeCaptureForm(SUBJECT, {
      disposition: 'won',
      reason: 'price',
      realisedPriceCents: null,
      realisedVendorCostCents: null,
      cycleTimeDays: null,
      acceptanceFirstPass: null,
      partner: null,
      decidedAt: '2026-07-30',
      factorScoresAtQuote: null,
    });
    expect(refused.record).toBeNull();
    expect(refused.blockers.map((b) => b.code)).toContain('won_before_acceptance');

    mocked.recordGpsOutcome.mockResolvedValue({ outcome: 'blocked', form: refused });
    mountWithCapture();
    (await screen.findByRole('button', { name: /Record the outcome/i })).click();

    expect((await screen.findAllByText(/won_before_acceptance/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Nothing was written/i)).length).toBeGreaterThan(0);
  });

  it('states that the capture is what the aggregates depend on', async () => {
    mountWithCapture();
    // The operator must be able to see WHY the rest of the page says "nothing can be
    // concluded" — because this form has not been filled, not because of the business.
    expect((await screen.findAllByText(/distributions depend on/i)).length).toBeGreaterThan(0);
  });
});
