import { describe, expect, it } from 'vitest';
import {
  startMotion, easeInOut, interpolateFraming, IdleMotionError,
  MOTION_POLICY, browserMotionEnvironment,
  type MotionEnvironment, type MotionPurpose,
} from './index.js';

/**
 * L3 is mostly a set of REFUSALS, and refusals only hold if something tries them. These
 * tests are the something.
 *
 * The two rules — motion carries information, and reduced motion is an instruction —
 * are exactly the kind that a later "make it feel more alive" change re-breaks. Both are
 * therefore enforced in code, and both are asserted from the outside here.
 */

const clock = (start = 0) => {
  let t = start;
  const env: MotionEnvironment & { advance(ms: number): void } = {
    reducedMotion: false,
    now: () => t,
    advance: (ms) => { t += ms; },
  };
  return env;
};

describe('motion carries information or it does not exist', () => {
  it('refuses a purpose outside the enum AT RUNTIME, not just in the type system', () => {
    // A purpose can arrive from configuration or an API response, where the type check
    // never ran. That is the path this guards.
    const env = clock();
    expect(() => startMotion({ purpose: 'ambient' as MotionPurpose, durationMs: 400 }, env))
      .toThrow(IdleMotionError);
    expect(() => startMotion({ purpose: 'idle-orbit' as MotionPurpose, durationMs: 400 }, env))
      .toThrow(/is not a purpose/);
  });

  it('names the valid purposes in the error, so the fix does not need this file', () => {
    const env = clock();
    try {
      startMotion({ purpose: 'because it looks good' as MotionPurpose, durationMs: 1 }, env);
      expect.unreachable('should have refused');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('data-transition');
      expect(msg).toContain('occlusion-resolve');
      expect(msg).toContain('3D_WORK_100X.md');
    }
  });

  it('will not loop a data transition — that is the idle orbit wearing a purpose', () => {
    const env = clock();
    expect(() => startMotion({ purpose: 'data-transition', durationMs: 400, loop: true }, env))
      .toThrow(/may not loop/);
    expect(() => startMotion({ purpose: 'entrance', durationMs: 400, loop: true }, env))
      .toThrow(/may not loop/);
    // The reader driving it themselves is the one case where repetition is theirs to stop.
    expect(() => startMotion({ purpose: 'user-driven', durationMs: 400, loop: true }, env))
      .not.toThrow();
  });

  it('there is no orbit() in the module surface', async () => {
    // The absence IS the design. `IdleMotionError` is excluded because it is the
    // refusal, not a motion — naming the thing you forbid is not offering it.
    const forbidden = ['orbit', 'spin', 'idle', 'autorotate', 'pulse', 'wobble', 'drift'];
    const mod = await import('./index.js');
    const offenders = Object.keys(mod)
      .filter((n) => n !== 'IdleMotionError')
      .map((n) => n.toLowerCase())
      .filter((n) => forbidden.some((f) => n.includes(f)));
    expect(offenders).toEqual([]);
  });
});

describe('prefers-reduced-motion resolves to the FINAL STATE, not to a slower animation', () => {
  it('progress is 1 immediately and stays 1', () => {
    const env: MotionEnvironment = { reducedMotion: true, now: () => 0 };
    const t = startMotion({ purpose: 'data-transition', durationMs: 5000 }, env);
    expect(t.progress()).toBe(1);
    expect(t.value()).toBe(1);
    expect(t.done).toBe(true);
    expect(t.instant).toBe(true);
  });

  it('the duration is IGNORED, not scaled — "a bit faster" is not honouring it', () => {
    const env: MotionEnvironment = { reducedMotion: true, now: () => 0 };
    for (const durationMs of [1, 400, 60_000]) {
      expect(startMotion({ purpose: 'entrance', durationMs }, env).value()).toBe(1);
    }
  });

  it('the reader still gets the information — the end state is the same one', () => {
    const a = { eye: [0, 1, 5] as const, target: [0, 0, 0] as const };
    const b = { eye: [2, 3, 4] as const, target: [1, 0, 0] as const };
    const reduced: MotionEnvironment = { reducedMotion: true, now: () => 0 };
    const t = startMotion({ purpose: 'occlusion-resolve', durationMs: 800 }, reduced);
    expect(interpolateFraming(a, b, t.value())).toEqual(b);
  });

  it('an environment that cannot tell defaults to REDUCED, never to motion', () => {
    // Defaulting the other way invents consent from a reader who never gave it.
    const saved = (globalThis as { matchMedia?: unknown }).matchMedia;
    delete (globalThis as { matchMedia?: unknown }).matchMedia;
    try {
      expect(browserMotionEnvironment().reducedMotion).toBe(true);
    } finally {
      if (saved) (globalThis as { matchMedia?: unknown }).matchMedia = saved;
    }
  });
});

describe('the tween itself', () => {
  it('runs from 0 to 1 over its duration and then stops', () => {
    const env = clock();
    const t = startMotion({ purpose: 'entrance', durationMs: 1000 }, env);
    expect(t.progress()).toBe(0);
    env.advance(500);
    expect(t.progress()).toBeCloseTo(0.5, 6);
    env.advance(900);
    expect(t.progress()).toBe(1);
    expect(t.done).toBe(true);
  });

  it('never overshoots, so an interpolated camera cannot fly past its target', () => {
    const env = clock();
    const t = startMotion({ purpose: 'user-driven', durationMs: 100 }, env);
    env.advance(10_000);
    expect(t.value()).toBe(1);
  });

  it('the ease is symmetric — an asymmetric one implies a direction the data lacks', () => {
    for (const u of [0.1, 0.25, 0.4]) {
      expect(easeInOut(u) + easeInOut(1 - u)).toBeCloseTo(1, 12);
    }
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOut(1)).toBe(1);
  });

  it('clamps inputs outside [0,1] instead of extrapolating', () => {
    expect(easeInOut(-5)).toBe(0);
    expect(easeInOut(5)).toBe(1);
  });
});

describe('the policy is a value that can be printed under a surface', () => {
  it('says what it does, in a sentence a reader can act on', () => {
    expect(MOTION_POLICY).toContain('prefers-reduced-motion');
    expect(MOTION_POLICY).toContain('final state');
    expect(MOTION_POLICY).toContain('no idle animation');
  });
});
