import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
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

const rawGlobals = readFileSync(GLOBALS, 'utf8');
const css = codeOnly(rawGlobals);
const sources = walk(SRC).map((f) => codeOnly(readFileSync(f, 'utf8')));
const allSource = sources.join('\n');

/** Every .css file the app authors, so an alias cannot be hidden in tokens.css. */
const CSS_FILES = readdirSync(join(SRC, 'styles'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => join(SRC, 'styles', f));

/**
 * Every selector that can reach the overshoot easing, however it is spelled.
 *
 * THE REGEX THIS REPLACES was `/\.([a-z-]+)\s*\{[^}]*--e-snap[^}]*\}/g`, and it
 * only ever matched a single lowercase class selector. Five shapes walked straight
 * past it — `.lift:hover`, `button`, `#nav`, `[data-open]`, `.Panel` — and the
 * first of those is the exact violation the house rule in globals.css calls out by
 * name ("Hover and focus keep `--e-out`"). A guard blind to the one case its own
 * documentation forbids is not a guard.
 *
 * A tighter regex was the wrong fix. Selectors are not a regular language you want
 * to enumerate by hand (`:is()`, `:where()`, comma lists, escapes, nesting), and
 * `[^}]*` cannot even see out of the block it is standing in. postcss already
 * ships in this repo as Tailwind's own dependency, so the guard walks real
 * declarations and asks the parser what the selector is.
 *
 * It also follows ONE INDIRECTION CLASS that no regex could: aliasing. Declaring
 * `--e-lift: var(--e-snap)` and spending `var(--e-lift)` on a hover would defeat
 * any text search for `--e-snap` next to a selector. Custom properties are tainted
 * to a fixpoint first, then ordinary declarations are checked against the taint.
 *
 * AND IT NO LONGER GUARDS A NAME. Every version of this check up to and including
 * the postcss rewrite banned the SPELLING `--e-snap`, so
 * `.lift:hover { transition: transform var(--t-hover) cubic-bezier(0.34,1.42,0.64,1) }`
 * — the token's own value, pasted — passed green. The house rule is "UI chrome never
 * bounces", which is a fact about the CURVE, not about the identifier; and pasting a
 * literal where a token belongs is the demonstrated failure mode in this very
 * stylesheet, where `.lift` carried a hand-typed `0.12s` that happened to equal
 * `--t-hover` until Phase 5's cleanup. So overshoot is now detected
 * mathematically: a cubic-bezier overshoots iff a control-point ordinate leaves
 * [0,1], and any curve that does, named or literal, aliased or inline, is reported.
 * That also covers overshoot curves nobody has invented yet.
 */
/** A cubic-bezier overshoots iff y1 or y2 falls outside [0,1]. */
function overshoots(value: string): boolean {
  for (const m of value.matchAll(
    /cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g,
  )) {
    const y1 = Number(m[2]);
    const y2 = Number(m[4]);
    if (y1 > 1 || y2 > 1 || y1 < 0 || y2 < 0) return true;
  }
  return false;
}

function overshootSelectors(files: string[]): string[] {
  const roots = files.map((f) => postcss.parse(readFileSync(f, 'utf8'), { from: f }));

  // 1. Taint --e-snap and anything that aliases it, transitively.
  const tainted = new Set(['--e-snap']);
  for (let pass = 0, changed = true; changed && pass < 10; pass++) {
    changed = false;
    for (const root of roots) {
      root.walkDecls((decl) => {
        if (!decl.prop.startsWith('--')) return;
        if (tainted.has(decl.prop)) return;
        if ([...tainted].some((t) => decl.value.includes(`var(${t})`) || decl.value.includes(t))) {
          tainted.add(decl.prop);
          changed = true;
        }
      });
    }
  }

  // 2. Any ORDINARY declaration that spends a tainted value hands us its selector.
  const out: string[] = [];
  for (const root of roots) {
    root.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) return; // definitions, not uses
      const named = [...tainted].some((t) => decl.value.includes(t));
      if (!named && !overshoots(decl.value)) return;
      const parent = decl.parent;
      if (parent && parent.type === 'rule') {
        // `.selectors` is postcss's own comma split — handles `.a, .b:hover { }`.
        out.push(...(parent as postcss.Rule).selectors.map((s) => s.trim()));
      } else if (parent && parent.type === 'atrule') {
        out.push(`@${(parent as postcss.AtRule).name} ${(parent as postcss.AtRule).params}`);
      } else {
        out.push('<top level>');
      }
    });
  }
  return out;
}

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
    const snapUsers = overshootSelectors(CSS_FILES);
    expect(snapUsers.length, 'nothing uses --e-snap — has the snap been removed?').toBeGreaterThan(0);
    // Only the two commit-ish feedbacks may overshoot. `.lift:hover`, `.focus-ring`,
    // panel transitions, a bare `button`, an id, an attribute selector and anything
    // else must use --e-out. The message names the offender because the failure a
    // future reader gets is "which selector?", not "did it fail?".
    expect(
      new Set(snapUsers),
      `overshoot leaked outside commit moments: ${[...new Set(snapUsers)].join(' , ')}. ` +
        'UI chrome never bounces — see the house rule in globals.css. (Reported for ' +
        '--e-snap, for any custom property aliasing it, and for any literal ' +
        'cubic-bezier whose y1/y2 leaves [0,1].)',
    ).toEqual(new Set(['.juice-snap', '.juice-tick']));
  });

  it('no TS/TSX source names the overshoot easing directly', () => {
    // The CSS walk above cannot see an inline `style={{ transitionTimingFunction:
    // 'var(--e-snap)' }}` or a Tailwind arbitrary value like
    // `ease-[var(--e-snap)]`, both of which land in the DOM without passing through
    // a stylesheet this repo authors. Nothing does that today; this keeps it so.
    //
    // The literal curve is checked here for the same reason it is checked in the CSS
    // walk: `ease-[cubic-bezier(0.34,1.42,0.64,1)]` is the token's value with the
    // token filed off, and banning only the identifier bans only the honest spelling.
    const offenders = walk(SRC)
      .filter((f) => {
        const code = codeOnly(readFileSync(f, 'utf8'));
        return code.includes('--e-snap') || overshoots(code);
      })
      .map((f) => f.slice(SRC.length + 1));
    expect(
      offenders,
      `overshoot named from application code, bypassing the CSS ration: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('defines the four motion durations as tokens', () => {
    // The vocabulary these replaced was four ad-hoc values chosen per component:
    // duration-300 at 17 sites, 200 at 5, 700 at 3, 500 at 1 — 26 utilities, all but
    // the two in sibling-owned files now converted. `--t-sweep` is the fourth token
    // and was missing from this list, which is why the name said "three".
    for (const token of ['--t-hover', '--t-state', '--t-panel', '--t-sweep']) {
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
