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

/**
 * Strip comments before matching, so the ratchet judges what the app DOES rather
 * than what its documentation talks about.
 *
 * Not hypothetical: the block comment in globals.css explaining why
 * `focus:outline-none` is banned tripped the ban on itself. This is the second
 * time this phase that prose was mistaken for code — the first was Tailwind's
 * content scan compiling class names out of a test file's own comments and
 * shipping two outline-blanking rules to production. A rule that cannot tell code
 * from writing about code will eventually be silenced instead of obeyed.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    // Only whole-line comments: a trailing `//` is too risky to strip blind (it
    // appears inside string literals such as `https://`).
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
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('focus stays visible', () => {
  const files = walk(SRC);

  it('no source file re-introduces focus:outline-none', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = codeOnly(readFileSync(file, 'utf8'));
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

  it('no control carries both focus-ring and a legacy ring utility', () => {
    // Two focus indicators on one control is not redundancy, it is two things that
    // drift apart. It also reintroduces POINTER focus rings: every one of these
    // used the `focus:` variant, which fires on a mouse click, so the app kept
    // drawing the click ring this phase claims to have removed. 59 of these
    // survived the first conversion pass because grep-and-replace only touched the
    // `focus:outline-none` token and left its companions in place.
    const offenders: string[] = [];
    for (const file of files) {
      codeOnly(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (!line.includes('focus-ring')) return;
          // `focus:ring-0` is exempt: it zeroes the forms-plugin ring on checkboxes
          // and never touches `outline`. `focus:border-*` is exempt too — a border
          // colour change is the field's own active state, a different affordance.
          const legacy = line.match(/\s(?:dark:)?focus(?:-visible)?:ring-(?!0\b)[a-z0-9/.[\]-]+/g);
          if (legacy) offenders.push(`${file.replace(SRC, 'src')}:${i + 1} — also has ${legacy.join(' ')}`);
        });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no ring-offset is used without a ring-offset colour', () => {
    // Measured on the live app before this was removed: a focused <Button> in DARK
    // mode painted `box-shadow: rgb(255,255,255) 0 0 0 2px` — a pure white halo on
    // a dark card. Tailwind's `ring-offset-2` sets the offset WIDTH; the colour
    // comes from `--tw-ring-offset-color`, which no file in this app ever set, so
    // it fell through to preflight's `#fff`. The defect is invisible in light mode,
    // which is why it survived so long.
    const offenders: string[] = [];
    const setsColour = files.some((f) => /--tw-ring-offset-color|ring-offset-(?:navy|card|transparent)/.test(codeOnly(readFileSync(f, 'utf8'))));
    for (const file of files) {
      codeOnly(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (/ring-offset-\d/.test(line) && !setsColour) {
            offenders.push(`${file.replace(SRC, 'src')}:${i + 1} — ring-offset width with no ring-offset-color anywhere in the app`);
          }
        });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('focus-ring-inset is actually applied somewhere', () => {
    // A utility no source file names is purged by Tailwind's content scan, so it
    // silently does not exist in the shipped stylesheet. This one shipped dead in
    // the first pass while five controls that needed it — both segmented view
    // toggles and the Sign out button — sat flush inside `overflow: hidden`
    // ancestors that clip the offset outline entirely. If this ever drops back to
    // zero, either the clipped controls regressed or the utility should be deleted.
    const users = files.filter(
      (f) => !f.endsWith('globals.css') && codeOnly(readFileSync(f, 'utf8')).includes('focus-ring-inset'),
    );
    expect(users.length, 'focus-ring-inset is declared but unused, so Tailwind purges it').toBeGreaterThan(0);
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
