import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The juice layer's CSS contract (TERMINAL Phase 5).
 *
 * Two failure modes, both of which this phase's predecessors actually hit:
 *
 * 1. A UTILITY THAT SHIPS DEAD. Tailwind purges any class no source file names, so
 *    a declared-but-unused utility silently does not exist in the stylesheet.
 *    `.focus-ring-inset` shipped that way in Phase 4 while five controls needed it.
 *    Every juice class is checked for a real consumer here.
 *
 * 2. OVERSHOOT LEAKING. `--e-snap` overshoots, and the house rule in globals.css is
 *    "UI chrome never bounces or scales". The juice reads as meaningful precisely
 *    because overshoot is rationed to commit moments; if it spreads to hovers and
 *    panels, nothing feels special and the app feels cheap. A rule this easy to
 *    violate by copy-paste needs a test rather than a comment.
 */

const SRC = join(__dirname, '..', '..');
const GLOBALS = join(SRC, 'styles', 'globals.css');

/** Strip comments so the ratchet judges code, not documentation about code. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const css = codeOnly(readFileSync(GLOBALS, 'utf8'));
const sources = walk(SRC).map((f) => codeOnly(readFileSync(f, 'utf8')));
const allSource = sources.join('\n');

describe('the juice CSS', () => {
  it('defines all four one-shot animations', () => {
    for (const name of ['juice-flash', 'juice-shake', 'juice-snap', 'juice-tick']) {
      expect(css, `@keyframes ${name} is missing`).toContain(`@keyframes ${name}`);
      expect(css, `.${name} utility is missing`).toContain(`.${name} {`);
    }
  });

  it('every juice utility has a real consumer, so Tailwind cannot purge it', () => {
    // `lib/juice.ts` names the animation classes in its CLASS map and the tints in
    // its cleanup loop, which is enough for the content scan — but only while that
    // map exists. If someone inlines it, this test is what notices.
    for (const name of ['juice-flash', 'juice-shake', 'juice-snap', 'juice-tick']) {
      expect(allSource, `${name} is declared in CSS but named by no source file`).toContain(name);
    }
    for (const tint of ['tint-live', 'tint-blocked', 'tint-warn', 'tint-info']) {
      expect(allSource, `${tint} is declared but unused, so it will be purged`).toContain(tint);
    }
  });

  it('rations the overshoot easing to commit moments only', () => {
    // Extract each utility block that references --e-snap and check what it is.
    const snapUsers = [...css.matchAll(/\.([a-z-]+)\s*\{[^}]*--e-snap[^}]*\}/g)].map((m) => m[1]);
    expect(snapUsers.length, 'nothing uses --e-snap — has the snap been removed?').toBeGreaterThan(0);
    // Only the two commit-ish feedbacks may overshoot. `lift`, `focus-ring`, panel
    // transitions and anything else must use --e-out.
    expect(new Set(snapUsers)).toEqual(new Set(['juice-snap', 'juice-tick']));
  });

  it('defines the three motion durations as tokens', () => {
    // The vocabulary these replace was four ad-hoc values chosen per component:
    // duration-300 at 17 sites, 200 at 5, 700 at 3, 500 at 1.
    for (const token of ['--t-hover', '--t-state', '--t-panel']) {
      expect(css, `${token} is not defined`).toContain(`${token}:`);
    }
  });

  it('the flash tint is a variable, not four near-identical keyframes', () => {
    // One animation parameterised by --juice-tint, so adding a fifth semantic
    // colour is a one-line utility rather than another @keyframes block.
    const flashBlock = css.slice(css.indexOf('@keyframes juice-flash'));
    expect(flashBlock.slice(0, 300)).toContain('var(--juice-tint)');
  });

  it('the reduced-motion block does not use a bare 0s duration', () => {
    // Load-bearing since Phase 5: lib/juice.ts removes its animation class on
    // `animationend`, and at exactly 0s some browsers dispatch no end event — the
    // class would stick and the NEXT flash on that element would do nothing, for
    // reduced-motion operators only.
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    const head = block.slice(0, 600);
    expect(head).toContain('animation-duration: 0.01ms');
    expect(head).not.toMatch(/animation-duration:\s*0s/);
  });
});
