import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE ONE-CLOCK RATCHET — S1 of INSTRUMENT_100X_PLAN.md, made mechanical.
 *
 * S0 measured eight live `setInterval`s under every route and a 60 fps
 * `requestAnimationFrame` loop on 76 of 79 — the frame sampler measuring itself. The fix
 * is `lib/clock.ts`; the ratchet is this file, which makes the fix permanent by making
 * the regression a red build:
 *
 *   · `setInterval` may exist in exactly ONE product source file: the heartbeat.
 *   · `requestAnimationFrame` may be called only from an allowlisted file, and every
 *     allowlisted file must still exist and still call it — an entry that stops being
 *     needed is removed, never left as dead permission. The list shrinks; it does not grow
 *     without a reason written beside the entry.
 *   · The frame sampler owns no loop of its own.
 *
 * Comments are stripped before matching, because this programme's own prose about clocks
 * would otherwise count as clocks. The matchers are validated against controls first, so an
 * empty census cannot be mistaken for a clean codebase.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'e2e' || name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.spec\./.test(name) && !name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}
const rel = (p: string) => relative(SRC, p).split('\\').join('/');
const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/.*$/, ''))).join('\n');

const SET_INTERVAL = /\bsetInterval\s*\(/;
const RAF = /\brequestAnimationFrame\s*\(/;

/** Every file allowed to schedule a frame, and WHY. One-shots and bounded tweens are not clocks. */
const RAF_ALLOWED: Record<string, string> = {
  'lib/clock.ts': 'the one frame loop, run only while a frame subscriber exists and the page is visible',
  'lib/perf.ts': 'afterPaint(): two one-shot frames to observe a paint, never a loop',
  'components/ui/CountUp.tsx': 'a bounded tween that stops at its final value',
  'components/charts/gl/useFlatChart.ts': 'a bounded entrance/update tween that stops',
  'components/brand/ForgeBackdrop.tsx': 'the sign-in sweep, bounded, stops at completion (rule 2)',
  'components/deals/DealDetailPanel.tsx': 'one frame to mount off-screen then slide in',
  'components/ui/Modal.tsx': 'one frame to settle focus',
  'components/ui/InspectorDrawer.tsx': 'one frame to settle focus',
  'lib/juice.ts': 'one frame to set announcement text after mount',
  'lib/hints.ts': 'one frame to finish a hint, with a setTimeout fallback',
};

describe('the one clock', () => {
  it('the matchers pass their controls', () => {
    expect(SET_INTERVAL.test('const iv = setInterval(() => tick(), 1000);')).toBe(true);
    expect(SET_INTERVAL.test('window.setInterval(fn, 1)')).toBe(true);
    expect(SET_INTERVAL.test('clearInterval(iv); // setInterval was here')).toBe(false);
    expect(RAF.test('rafRef.current = requestAnimationFrame(step);')).toBe(true);
    expect(RAF.test('cancelAnimationFrame(id)')).toBe(false);
    expect(strip('// setInterval(x)\nconst a = 1; /* requestAnimationFrame( */')).not.toMatch(SET_INTERVAL);
  });

  it('setInterval exists in exactly one product source file — the heartbeat', () => {
    const offenders = walk(SRC)
      .filter((p) => SET_INTERVAL.test(strip(readFileSync(p, 'utf8'))))
      .map(rel)
      .sort();
    expect(offenders, 'a private interval is a second clock — subscribe to lib/clock.ts every() instead').toEqual(['lib/clock.ts']);
  });

  it('every requestAnimationFrame caller is allowlisted, with its reason, and every entry is still live', () => {
    const callers = walk(SRC)
      .filter((p) => RAF.test(strip(readFileSync(p, 'utf8'))))
      .map(rel)
      .sort();
    for (const c of callers) {
      expect(RAF_ALLOWED[c], `${c} schedules frames and is not on the allowlist — if it is a bounded tween or a one-shot, add it WITH its reason; if it loops, use lib/clock.ts onFrame()`).toBeTruthy();
    }
    for (const entry of Object.keys(RAF_ALLOWED)) {
      expect(existsSync(join(SRC, entry)), `stale allowlist entry: ${entry} no longer exists`).toBe(true);
      expect(callers, `stale allowlist entry: ${entry} no longer calls requestAnimationFrame — remove it`).toContain(entry);
    }
  });

  it('the frame sampler owns no loop of its own', () => {
    const perf = strip(readFileSync(join(SRC, 'lib/perf.ts'), 'utf8'));
    expect(perf).not.toMatch(/frameHandle/);
    expect(perf).toMatch(/observeFrames\(/);
  });

  it('the Dashboard fabricates no events', () => {
    const src = readFileSync(join(SRC, 'pages/Dashboard.tsx'), 'utf8');
    expect(strip(src)).not.toMatch(/simulatedEvents|Math\.random/);
  });
});
