import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDERWRITE_VERDICT_LABEL, isRefusal, type MarginVerdict, type UnderwriteVerdict } from '@lcx/shared';
import { ApiError } from '../apiClient';
import { feedback, _resetDedupe, _resetFeedback } from '../feedback';
import { _resetJuice } from '../juice';
import {
  gpsSignal,
  marginFeel,
  requestFeel,
  signalGps,
  underwriteFeel,
  type GpsOutcome,
} from '../gpsFeel';

/**
 * GPS's three feels (Phase 11).
 *
 * The asymmetry is the product here, so most of this file asserts inequalities
 * rather than values: a refusal must not arrive as the success reaction, and
 * "we could not tell" must not arrive as either. Those are the assertions that can
 * fail in a way an operator would notice — a table row edited to the wrong outcome
 * is invisible in review and unmistakable in use.
 *
 * The reactions themselves (which class, which tone, which haptic pattern) are
 * `feedback.ts`'s and are tested in `juice.test.ts`. What is tested here is that
 * GPS routes each outcome to the right one of them.
 */

const OUTCOMES: GpsOutcome[] = ['committed', 'refused', 'undetermined'];

const UNDERWRITE_VERDICTS = Object.keys(UNDERWRITE_VERDICT_LABEL) as UnderwriteVerdict[];

/**
 * Enumerated by hand because `partners.ts` ships no label map to read. The module's
 * own table is `Record<MarginVerdict, …>`, so a verdict missing THERE fails `tsc`;
 * this list only has to stay long enough to make the loops below meaningful.
 */
const MARGIN_VERDICTS: MarginVerdict[] = [
  'not_capable',
  'no_rate_card',
  'cost_not_derivable',
  'currency_mismatch',
  'margin_intact',
  'margin_eroded',
  'margin_negative',
];

beforeEach(() => {
  localStorage.clear();
  _resetJuice();
  _resetFeedback();
  _resetDedupe();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** OS-level reduce-motion, as `CountUp.test.tsx` stubs it. */
function setReducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.appendChild(node);
  return node;
}

describe('the three feels are three', () => {
  it('gives each outcome its own channel', () => {
    const channels = OUTCOMES.map((o) => gpsSignal(o, { sentence: 'why' }).channel);
    expect(new Set(channels).size).toBe(OUTCOMES.length);
  });

  it('never routes a refusal or an absent-data outcome to the commit channel', () => {
    // The one assertion this whole module exists for.
    expect(gpsSignal('refused', { sentence: 'why' }).channel).not.toBe('commit');
    expect(gpsSignal('undetermined').channel).not.toBe('commit');
  });

  it('does not paint "we could not tell" as blocked', () => {
    // Amber, not red: absent data is not a rule refusing, and none of the three
    // feels may be alarming.
    expect(gpsSignal('undetermined').tint).toBe('warn');
  });

  it('speaks on every outcome, so the three survive with no motion at all', () => {
    for (const outcome of OUTCOMES) {
      const suppressed = gpsSignal(outcome, { sentence: 'why', motionSuppressed: true });
      // Under `prefers-reduced-motion` every juice animation is 0.01ms, so no
      // visual channel distinguishes these. If speak were ever null the outcome
      // would be undetectable for that operator.
      expect(suppressed.speak, outcome).toBeTruthy();
    }
  });

  it('makes the refusal the only assertive announcement', () => {
    expect(gpsSignal('refused', { sentence: 'why' }).speak).toBe('assertive');
    expect(gpsSignal('committed').speak).toBe('polite');
    expect(gpsSignal('undetermined').speak).toBe('polite');
  });
});

describe('reduced motion', () => {
  it('reads the OS setting rather than assuming', () => {
    // `window.matchMedia` is undefined in this repo's jsdom, which is exactly why
    // `motion.ts` guards for it — and why the default has to be exercised through a
    // stub rather than trusted.
    expect(gpsSignal('committed').motionSuppressed).toBe(false);
    setReducedMotion(true);
    expect(gpsSignal('committed').motionSuppressed).toBe(true);
  });

  it('reports the setting without changing which reaction fires', () => {
    // The stylesheet already neutralises the animation (`globals.css`). A second
    // reduced-motion policy here would be one more thing to keep in step.
    for (const outcome of OUTCOMES) {
      const on = gpsSignal(outcome, { sentence: 'why', motionSuppressed: true });
      const off = gpsSignal(outcome, { sentence: 'why', motionSuppressed: false });
      expect(on.channel, outcome).toBe(off.channel);
    }
  });
});

describe('a refusal with no reason', () => {
  it('downgrades to the quiet refusal rather than inventing prose', () => {
    const signal = gpsSignal('refused');
    expect(signal.channel).toBe('refuseQuiet');
    expect(signal.sentence).toBe('');
  });

  it('treats a blank reason as no reason', () => {
    // `announce('   ')` is a live region that changed and said nothing, which is
    // worse than staying quiet: it consumes the announcement the surface was about
    // to make.
    expect(gpsSignal('refused', { sentence: '   ' }).channel).toBe('refuseQuiet');
  });

  it('still says the caller’s reason when there is one', () => {
    const signal = gpsSignal('refused', { sentence: 'the rate card expired on 2026-01-01' });
    expect(signal.channel).toBe('refuse');
    expect(signal.sentence).toContain('rate card expired');
  });

  it('falls back to a sentence for the other two outcomes', () => {
    expect(gpsSignal('committed').sentence.length).toBeGreaterThan(0);
    expect(gpsSignal('undetermined').sentence.length).toBeGreaterThan(0);
  });
});

describe('signalGps fires the reaction', () => {
  it('commits through feedback.commit and not through refuse', () => {
    const commit = vi.spyOn(feedback, 'commit');
    const refuse = vi.spyOn(feedback, 'refuse');
    const node = el();
    signalGps(node, 'committed');
    expect(commit).toHaveBeenCalledWith(node);
    expect(refuse).not.toHaveBeenCalled();
  });

  it('refuses through feedback.refuse with the reason, and never commits', () => {
    const commit = vi.spyOn(feedback, 'commit');
    const refuse = vi.spyOn(feedback, 'refuse');
    const node = el();
    signalGps(node, 'refused', 'the quote and the card are in different currencies');
    expect(refuse).toHaveBeenCalledWith(node, 'the quote and the card are in different currencies');
    expect(commit).not.toHaveBeenCalled();
  });

  it('routes absent data to the ambient flash, not to a refusal', () => {
    const became = vi.spyOn(feedback, 'became');
    const refuse = vi.spyOn(feedback, 'refuse');
    const quiet = vi.spyOn(feedback, 'refuseQuiet');
    const node = el();
    signalGps(node, 'undetermined');
    expect(became).toHaveBeenCalledWith(node, 'warn');
    expect(refuse).not.toHaveBeenCalled();
    expect(quiet).not.toHaveBeenCalled();
  });

  it('announces a commit, which the juice layer alone does not', () => {
    vi.useFakeTimers();
    signalGps(el(), 'committed', 'Deposit recorded.');
    vi.runAllTimers();
    const region = document.getElementById('lcx-live');
    // With reduced motion on, the snap is 0.01ms — without this line a landed
    // write is undetectable for that operator.
    expect(region?.textContent).toBe('Deposit recorded.');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('says nothing extra on a reasonless refusal', () => {
    vi.useFakeTimers();
    signalGps(el(), 'refused');
    vi.runAllTimers();
    // The surface holding the remedy prose gets to speak instead.
    expect(document.getElementById('lcx-live')?.textContent ?? '').toBe('');
  });

  it('survives a null element, as every feedback call site may', () => {
    expect(() => signalGps(null, 'committed')).not.toThrow();
    expect(() => signalGps(undefined, 'undetermined')).not.toThrow();
  });
});

describe('underwriting verdicts', () => {
  it('lands the only non-refusal as committed', () => {
    expect(underwriteFeel('underwritten').outcome).toBe('committed');
  });

  it('never feels like a success on a verdict the engine calls a refusal', () => {
    // `isRefusal` is the engine's own definition, imported rather than restated,
    // so this cannot drift from `underwrite.ts`.
    for (const verdict of UNDERWRITE_VERDICTS) {
      if (!isRefusal(verdict)) continue;
      const { outcome } = underwriteFeel(verdict);
      expect(outcome, verdict).not.toBe('committed');
      expect(gpsSignal(outcome, { sentence: 'why' }).channel, verdict).not.toBe('commit');
    }
  });

  it('shakes only where the disqualifying facts are on record', () => {
    expect(underwriteFeel('refused_currency_mismatch').outcome).toBe('refused');
    expect(underwriteFeel('refused_rate_card_expired').outcome).toBe('refused');
  });

  it('does not scold the operator for inputs nobody has supplied', () => {
    // A placeholder price band and a placeholder effort triple are the founder's
    // to fill in. Shaking the screen at the operator for them is the app blaming
    // someone for its own empty shelf.
    expect(underwriteFeel('refused_price_not_set').outcome).toBe('undetermined');
    expect(underwriteFeel('refused_effort_is_zero').outcome).toBe('undetermined');
    expect(underwriteFeel('refused_rate_not_derivable').outcome).toBe('undetermined');
    expect(underwriteFeel('refused_hours_per_day_not_stated').outcome).toBe('undetermined');
    expect(underwriteFeel('refused_rate_card_no_validity_stated').outcome).toBe('undetermined');
  });

  it('carries the reason on every row', () => {
    for (const verdict of UNDERWRITE_VERDICTS) {
      expect(underwriteFeel(verdict).because.length, verdict).toBeGreaterThan(20);
    }
  });
});

describe('margin verdicts', () => {
  it('treats every answer as landed, including the bad news', () => {
    // A falling cue for bad NEWS would be indistinguishable from a falling cue for
    // a REFUSAL, and refusal-versus-answer is the distinction the screen cannot
    // recover on its own.
    expect(marginFeel('margin_intact').outcome).toBe('committed');
    expect(marginFeel('margin_eroded').outcome).toBe('committed');
    expect(marginFeel('margin_negative').outcome).toBe('committed');
  });

  it('says "we could not tell" where the comparison has no input', () => {
    expect(marginFeel('no_rate_card').outcome).toBe('undetermined');
    expect(marginFeel('cost_not_derivable').outcome).toBe('undetermined');
  });

  it('refuses on the never-convert rule, in step with underwriting', () => {
    // The same fact pattern must not be a refusal in one engine and an absence in
    // the other, or the third feel stops meaning anything.
    expect(marginFeel('currency_mismatch').outcome).toBe('refused');
    expect(underwriteFeel('refused_currency_mismatch').outcome).toBe('refused');
  });

  it('carries the reason on every row', () => {
    for (const verdict of MARGIN_VERDICTS) {
      expect(marginFeel(verdict).because.length, verdict).toBeGreaterThan(20);
    }
  });
});

describe('failed requests', () => {
  it('feels refused when a rule said no', () => {
    expect(requestFeel(new ApiError('forbidden', 403, 'WORKSPACE_FORBIDDEN'))).toBe('refused');
    expect(requestFeel(new ApiError('needs a premortem', 409, 'SAT_REQUIRED'))).toBe('refused');
  });

  it('feels undetermined when the environment could not answer', () => {
    // Migrations 0047/0049 unapplied answer 503. Nothing was refused; nothing was
    // decided either.
    expect(requestFeel(new ApiError('migration pending', 503, 'MIGRATION_PENDING'))).toBe('undetermined');
    expect(requestFeel(new ApiError('boom', 500))).toBe('undetermined');
  });

  it('feels undetermined when the request never got an answer at all', () => {
    // A retry after a silent success writes twice. That is not a refusal.
    expect(requestFeel(new TypeError('Failed to fetch'))).toBe('undetermined');
    expect(requestFeel(undefined)).toBe('undetermined');
  });
});
