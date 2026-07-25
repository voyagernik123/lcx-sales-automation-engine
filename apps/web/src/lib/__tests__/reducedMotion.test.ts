import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The ratchet that keeps `prefers-reduced-motion` honoured (TERMINAL Phase 4).
 *
 * Like the focus ratchet next door, this asserts on the TEXT of the stylesheet
 * rather than on rendered behaviour, and for the same reason: jsdom does not
 * evaluate media queries against a simulated OS setting, so there is nothing to
 * observe at runtime. Reading the source is the only check that can actually
 * fail when someone deletes the rule.
 *
 * Why a test at all, for four lines of CSS. Because every failure mode here is
 * silent for whoever is looking at the screen. The developer without the OS
 * setting on sees an app that behaves identically whether the rule is present,
 * mangled, or absent — so a refactor can quietly drop it and nothing will look
 * wrong to the person who did it.
 */

const SRC = join(__dirname, '..', '..');
const globals = () => readFileSync(join(SRC, 'styles', 'globals.css'), 'utf8');

/** The text of the `@media (prefers-reduced-motion: reduce)` block, braces balanced. */
function reduceBlock(css: string): string {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  expect(start, 'no prefers-reduced-motion block in globals.css').toBeGreaterThan(-1);
  // Brace-count instead of a regex: the block contains nested rules, so
  // "up to the next }" would truncate it and quietly weaken every assertion below.
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in the reduced-motion block');
}

describe('reduced motion is honoured', () => {
  it('globals.css carries a prefers-reduced-motion: reduce block', () => {
    const block = reduceBlock(globals());
    // The four properties that actually do the work. `animation-iteration-count`
    // is the one people forget, and without it an infinite animation carries on
    // forever at 0.01ms per cycle — i.e. it spins FASTER, not less.
    expect(block).toContain('animation-duration: 0.01ms !important');
    expect(block).toContain('animation-iteration-count: 1 !important');
    expect(block).toContain('transition-duration: 0.01ms !important');
    expect(block).toContain('scroll-behavior: auto !important');
  });

  it('uses 0.01ms, never a bare 0s, for durations', () => {
    /*
     * The deliberate choice this test exists to protect. A duration of exactly
     * zero lets some browsers skip firing `transitionend` / `animationend`
     * altogether — no transition is deemed to have run, so no end event is
     * dispatched. Any code waiting on that event to unmount a node or advance a
     * state machine then hangs forever, and ONLY for the reduced-motion user.
     *
     * `0.01ms` is instant to a human and still fires the event, so every code
     * path behaves the same for everyone. It looks like a superstition, which is
     * exactly why a well-meaning tidy-up would "simplify" it to 0s.
     *
     * Nothing in this app listens for those events today (grepped: zero hits for
     * transitionend / animationend / onTransitionEnd / onAnimationEnd — see the
     * assertion below, which will tell you when that stops being true). The
     * precaution is insurance, not a live fix, and it is worth being straight
     * about that: it costs nothing and removes a whole class of future bug.
     */
    const block = reduceBlock(globals());
    const bareZero = /(animation|transition)-duration:\s*0s\b/;
    expect(bareZero.test(block), 'use 0.01ms, not 0s — 0s can skip transitionend/animationend').toBe(
      false,
    );
    // Also reject the unitless form, which is invalid CSS for a duration and
    // would drop the declaration silently rather than error.
    expect(/(animation|transition)-duration:\s*0\s*[;!]/.test(block)).toBe(false);
  });

  it('the .motion-essential escape hatch is excluded from the blanket rule', () => {
    /*
     * A blanket rule is right for decorative motion and wrong where the motion IS
     * the information. `animation-iteration-count: 1` stops a spinner dead after
     * one rotation, and a frozen spinner does not read as "reduced motion" — it
     * reads as "the app has hung", the exact opposite of the state it exists to
     * communicate. `.motion-essential` marks those elements, and it only works if
     * the universal selectors actually exclude it.
     */
    const block = reduceBlock(globals());
    expect(block).toContain('*:not(.motion-essential)');
    expect(block).toContain('*:not(.motion-essential)::before');
    expect(block).toContain('*:not(.motion-essential)::after');
    // And no un-narrowed universal selector that would re-catch them. A bare
    // `*` line anywhere in the block silently defeats the escape hatch.
    const selectors = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith(',') || l.endsWith('{'))
      .map((l) => l.replace(/[,{]\s*$/, '').trim());
    for (const sel of selectors) {
      expect(/^\*(::?[a-z-]+)?$/.test(sel), `bare universal selector "${sel}" defeats .motion-essential`).toBe(
        false,
      );
    }
  });

  it('the escape hatch is applied to spinners, and only to spinners', () => {
    // If nothing carries the class, the exclusion above is dead code and the
    // spinners are frozen — the bug this whole exception exists to prevent.
    const users = walk(SRC).filter(
      (f) => /\.tsx?$/.test(f) && readFileSync(f, 'utf8').includes('motion-essential'),
    );
    expect(users.length, 'nothing uses motion-essential — the exclusion is dead code').toBeGreaterThan(0);

    // Every use must sit next to `animate-spin`. The class is a busy-indicator
    // exemption, not a general "keep my animation" opt-out; the moment it spreads
    // to hover lifts and panel slides the media query stops meaning anything.
    for (const file of users) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!line.includes('motion-essential')) return;
          expect(
            line.includes('animate-spin'),
            `${file.replace(SRC, 'src')}:${i + 1} — motion-essential is only for animate-spin busy indicators`,
          ).toBe(true);
        });
    }
  });

  it('programmatic smooth scrolling goes through the motion helper', () => {
    /*
     * The hole CSS cannot close. `scrollIntoView({ behavior: 'smooth' })` is an
     * explicit author instruction that OVERRIDES the CSS `scroll-behavior`
     * property, so `scroll-behavior: auto !important` in the media query does
     * nothing to it. A full-viewport smooth scroll is also the worst single
     * offender for vestibular motion sickness. `scrollToId` in lib/motion.ts
     * checks the query in JS; a raw call site is unreachable by the stylesheet
     * and there is no way to tell from the CSS that it exists.
     */
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (!/\.tsx?$/.test(file)) continue;
      if (file.endsWith(join('lib', 'motion.ts'))) continue; // the one legitimate caller
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/behavior:\s*'smooth'/.test(line)) {
            offenders.push(`${file.replace(SRC, 'src')}:${i + 1}`);
          }
        });
    }
    expect(
      offenders,
      `use scrollToId() from @/lib/motion instead of a raw smooth scrollIntoView:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the 0.01ms comment agrees with whether anything actually listens', () => {
    /*
     * A tripwire on a CLAIM, not a rule about code — and it has already fired once,
     * which is the reason it is now shaped like this.
     *
     * The original version asserted that nothing in the app waits on a
     * transition/animation end event, because globals.css said so and the 0.01ms
     * (rather than 0s) precaution was therefore insurance. Phase 5's juice layer
     * added exactly such a listener: `lib/juice.ts` removes a one-shot animation
     * class on `animationend`, so at 0s the class would stick and the next flash on
     * that element would silently do nothing — for reduced-motion operators only.
     *
     * The test then failed as designed, telling the reader to correct the comment
     * and keep the 0.01ms. Both happened. So the invariant worth guarding was never
     * "no listeners exist" — it is that the COMMENT and the CODE agree, in either
     * direction. That holds whether the app has one listener or twenty, and it still
     * fails if someone deletes the last listener and leaves the comment claiming it
     * is load-bearing, or adds one back while the comment says nothing listens.
     */
    const listeners: string[] = [];
    for (const file of walk(SRC)) {
      if (!/\.tsx?$/.test(file)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\b(transitionend|animationend|onTransitionEnd|onAnimationEnd)\b/.test(line)) {
            listeners.push(`${file.replace(SRC, 'src')}:${i + 1}`);
          }
        });
    }

    const css = globals();
    // The comment must state one of the two positions explicitly. Matching on the
    // phrasing rather than on a marker keeps the assertion about the prose a human
    // will actually read.
    const claimsNoneListen = /nothing here listens for those events|NOT load-bearing/i.test(css);
    const claimsLoadBearing = /made it load-bearing|is what makes the normal path work/i.test(css);

    expect(
      claimsNoneListen || claimsLoadBearing,
      'globals.css no longer says either way whether anything depends on transition/animation end events. Say so explicitly — the 0.01ms choice is unexplainable without it.',
    ).toBe(true);

    if (listeners.length > 0) {
      expect(
        claimsLoadBearing,
        `${listeners.length} file(s) wait on transition/animation end events:\n${listeners.join('\n')}\n` +
          'globals.css still describes the 0.01ms duration as insurance. Correct the comment; keep the 0.01ms.',
      ).toBe(true);
    } else {
      expect(
        claimsNoneListen,
        'nothing waits on transition/animation end events any more, but globals.css still calls the 0.01ms load-bearing. Correct the comment; keep the 0.01ms anyway.',
      ).toBe(true);
    }
  });

  it('the map transition, which outranks the blanket rule, is named explicitly', () => {
    /*
     * `path.state` in globals.css declares its transition with `!important` at
     * specificity (0,1,1). `*:not(.motion-essential)` is only (0,1,0), and
     * between two `!important` declarations the cascade falls back to
     * specificity — so the blanket rule LOSES and the US state map keeps its
     * 250ms fill fade under reduced motion. It needs an equally specific
     * override inside the block.
     */
    const css = globals();
    const block = reduceBlock(css);
    const mapUsesImportant = /path\.state\s*\{[^}]*transition:[^}]*!important/.test(css);
    if (mapUsesImportant) {
      expect(block, 'path.state uses !important, so the blanket rule cannot reach it').toMatch(
        /path\.state\s*\{[^}]*transition-duration:\s*0\.01ms\s*!important/,
      );
    }
  });
});

/** Same walk as focusVisible.test.ts — tests excluded so this file's own strings don't match. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}
