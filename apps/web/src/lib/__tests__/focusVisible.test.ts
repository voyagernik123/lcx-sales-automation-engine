import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The ratchet that keeps focus visible (TERMINAL Phase 4).
 *
 * "Focus is never invisible" is the load-bearing claim of the motion model: if you
 * cannot see where you are, nothing else about keyboard navigation matters. It was
 * false in a measurable way before this phase, and the failure was silent — nothing
 * errors when a focus ring disappears.
 *
 * The mechanism, verified against the shipped stylesheet: Tailwind compiles
 * `focus:outline-none` to `.focus\:outline-none:focus`, specificity (0,2,0),
 * emitted AFTER the global `:focus-visible` rule at (0,1,0). It therefore wins
 * unconditionally. There were 49 such sites, 17 of them with no replacement style
 * whatsoever — mostly the dense filter selects and inputs a keyboard-first operator
 * reaches first.
 *
 * The fix is to DROP the suppression entirely and use the shared `.focus-ring`
 * utility. Worth recording why the obvious-looking alternative is wrong: switching
 * to the `focus-visible:` variant compiles to `:focus-visible` — KEYBOARD focus —
 * with a transparent outline, at the same (0,2,0) specificity as `.focus-ring` but
 * emitted LATER, so it would win and blank the very ring being added. The
 * suppression was never needed: `:focus-visible` does not match a mouse click,
 * which is the only thing the original `focus:outline-none` was for. I only caught
 * this by reading the compiled stylesheet rather than trusting the source.
 *
 * Note the deliberate narrowness: bare `outline-none` is NOT forbidden. It compiles
 * to (0,1,0) and is emitted BEFORE `:focus-visible`, so the global rule still wins.
 * Banning it too would be 70 more edits for no behavioural gain, and a rule that
 * forbids harmless things gets disabled.
 */

const SRC = join(__dirname, '..', '..');

const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /focus:outline-none/,
    why:
      'compiles to .focus\\:outline-none:focus (0,2,0) emitted after :focus-visible (0,1,0), so it blanks the focus ring for KEYBOARD users too. ' +
      'Use the shared `focus-ring` utility instead — and do NOT reach for the focus-visible: variant, which blanks the keyboard ring.',
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('focus stays visible', () => {
  const files = walk(SRC);

  it('no source file re-introduces focus:outline-none', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(line)) {
            offenders.push(`${file.replace(SRC, 'src')}:${i + 1} — ${why}`);
          }
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the focus colour is a token, not a hard-coded value', () => {
    // Scattered focus colours are how the previous treatment became 62
    // hand-written `focus:border-cyan-500` sites with no single place to tune.
    const css = readFileSync(join(SRC, 'styles', 'globals.css'), 'utf8');
    expect(css).toContain('outline: 2px solid rgb(var(--focus))');
  });

  it('the focus rule does not restyle what it indicates', () => {
    // The old rule set `border-radius: 4px` on the focused element, so a
    // rounded-full control snapped to a rectangle the moment it took focus.
    const css = readFileSync(join(SRC, 'styles', 'globals.css'), 'utf8');
    const rule = css.slice(css.indexOf(':focus-visible {'), css.indexOf(':focus-visible {') + 200);
    expect(rule).not.toContain('border-radius');
  });

  it('both themes define a focus token', () => {
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    const occurrences = tokens.match(/--focus:/g) ?? [];
    // One for light, one inside .dark — a single definition would leave one theme
    // with a ring tuned for the other, which is how contrast regressions happen.
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('the focus token clears the WCAG 3:1 non-text minimum on every app surface', () => {
    const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
    const values = [...tokens.matchAll(/--focus:\s*(\d+)\s+(\d+)\s+(\d+)/g)].map((m) =>
      [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
    );
    expect(values.length).toBeGreaterThanOrEqual(2);

    const [light, dark] = values;
    // Surfaces taken from tokens.css: card, page canvas, and the raised wash that
    // controls actually sit on.
    const lightSurfaces: Array<[number, number, number]> = [
      [255, 255, 255],
      [244, 246, 251],
      [234, 241, 254],
    ];
    const darkSurfaces: Array<[number, number, number]> = [
      [16, 24, 43],
      [9, 14, 27],
      [32, 43, 72],
    ];

    for (const s of lightSurfaces) {
      expect(contrast(light, s), `light ring vs rgb(${s})`).toBeGreaterThanOrEqual(3);
    }
    for (const s of darkSurfaces) {
      expect(contrast(dark, s), `dark ring vs rgb(${s})`).toBeGreaterThanOrEqual(3);
    }
  });
});

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
