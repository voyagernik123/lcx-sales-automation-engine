import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * The transition vocabulary (TERMINAL Phase 5, delivered late — T1 #26).
 *
 * Phase 5 claimed "one motion vocabulary replaces four ad-hoc durations". For the
 * one-shot ANIMATIONS that was true. For TRANSITIONS it was not, and the gap was
 * measurable rather than cosmetic:
 *
 *   - `--t-hover` was defined and consumed by NOTHING. Zero sites. A token nothing
 *     names does not exist; `.focus-ring-inset` proved that in Phase 4 by being
 *     purged by Tailwind after shipping at zero call sites.
 *   - 38 `transition-all` and 26 ad-hoc `duration-*` utilities survived.
 *   - `transition-all` animates EVERY animatable property, and two of them are
 *     `outline-color` and `outline-offset`. Measured in Chromium against the built
 *     stylesheet, a `transition-all duration-300` button taking keyboard focus put
 *     its ring at `outline-color: rgb(30,40,98)` (the text colour) at t=8ms and did
 *     not reach `rgb(8,145,178)` until after t=200ms. The focus ring — the one thing
 *     Phase 4 existed to make visible — crept in wherever `transition-all` sat on
 *     something focusable: 16 of the 38 carriers, counted rather than estimated
 *     (15 `<button>` and the `<main tabIndex={-1}>` that the skip link targets).
 *     The other 22 were divs, spans and SVG shapes that never take focus.
 *   - A SECOND, smaller instance of the same defect was found by measuring rather
 *     than by reading: `box-shadow` in the base-layer `header, aside, main, button,
 *     select, table, th, td` rule faded the `.focus-ring-inset` ring in over 150ms.
 *     See `no element-level rule fades an inset ring` below.
 *
 * This file is the ratchet. It is deliberately several separate assertions: that the
 * ad-hoc utilities stay extinct, that the vocabulary that replaced them cannot be
 * purged, and that no member of it can ever name `outline` again.
 *
 * ── FIVE HOLES FOUND BY ADVERSARIAL REVIEW, each confirmed against the EMITTED
 * stylesheet (`tailwindcss -i globals.css -o …`) and not merely against this test.
 * Every one of them shipped the exact defect the assertion above it names, green:
 *
 *   1. A `*.test.tsx` sitting NEXT TO its component (not under `__tests__`) counted
 *      as a real consumer here, but `tailwind.config.js` excludes
 *      `!./src/**\/*.test.{ts,tsx}` from its content scan. Dropping `t-sweep`'s three
 *      real call sites and naming it only from `src/pages/Sweep.test.tsx` left this
 *      file green while `.t-sweep{…}` VANISHED from the built CSS — the precise
 *      `.focus-ring-inset` Phase-4 bug, reintroduced through the blind spot of the
 *      assertion written to prevent it. `walk()` now mirrors the Tailwind content
 *      globs exactly, and `mirrors the Tailwind content scan` fails if they drift.
 *   2. `button { transition: box-shadow 0.15s ease; }` as its OWN rule. The old
 *      check keyed on a selector containing both `button` and `select`, so the same
 *      declaration in a different rule shape sailed past and reached the bundle as
 *      `button{transition:box-shadow .15s ease}`. Now no element-level rule in any
 *      authored stylesheet may transition `box-shadow` at all.
 *   3. `button { transition: all 300ms ease; }` written in `tokens.css`. The focus-
 *      ring assertion parsed `globals.css` only — but `globals.css` `@import`s
 *      `tokens.css`, so it ships. Every assertion here now reads every authored
 *      stylesheet.
 *   4. `.t-chrome { @apply transition-all duration-300; }`. The source scan reads
 *      `.ts`/`.tsx` and the CSS walk reads declarations, so an `@apply` in a
 *      stylesheet was seen by neither; it emitted
 *      `.t-chrome{transition-property:all;transition-duration:.3s}`.
 *   5. A FIFTH duration token with zero consumers. The "spend every token"
 *      assertion iterated a HARDCODED list of four names, so the one failure mode
 *      it exists to catch — defining a token nothing spends — was unguarded for any
 *      token added after it was written. Tokens are now discovered from the CSS.
 *
 * Also closed here: `transition-[all]` / `transition-[outline-color]` arbitrary
 * values, which emit `transition-property:all` (verified: the bundle grows
 * `.transition-\[all\]{transition-property:all}`) while dodging a search for the
 * literal `transition-all`. The builder recorded these as uncatchable; they are
 * catchable, because the escape hatch has a fixed prefix.
 */

const SRC = join(__dirname, '..', '..');
const WEB = join(SRC, '..');
const STYLES = join(SRC, 'styles');
const TW_CONFIG = join(WEB, 'tailwind.config.js');

/** The five names, and the token each one spends. */
const VOCABULARY: Record<string, string> = {
  't-hover': '--t-hover',
  't-surface': '--t-hover',
  't-metric': '--t-state',
  't-panel': '--t-panel',
  't-sweep': '--t-sweep',
};

/**
 * SHRINK-ONLY ALLOWLIST. Each entry is a file that still contains banned motion
 * utilities and the reason it was not converted. `max` may go DOWN (someone fixed
 * it) but the test fails if a count goes up or a new file appears — which is the
 * only property that makes this a ratchet rather than a note.
 *
 * Both survivors are owned by other agents in the same run: this agent was
 * explicitly scoped out of `pages/BdPipeline.tsx` and everything under
 * `components/queue/`, so converting them would have been a merge conflict rather
 * than a fix. The conversions they need are recorded here so whoever picks them up
 * does not have to re-derive them:
 *
 *   pages/BdPipeline.tsx        tier-scope pill, `transition-all duration-300`
 *                               → `t-hover` (border + background only)
 *   components/queue/SessionMode.tsx
 *                               session progress bar, `transition-all duration-300`
 *                               → `t-metric` (it animates `width`)
 */
const ALLOWLIST: Record<string, { transitionAll: number; duration: number }> = {
  'pages/BdPipeline.tsx': { transitionAll: 1, duration: 1 },
  'components/queue/SessionMode.tsx': { transitionAll: 1, duration: 1 },
};

/**
 * The files Tailwind compiles classes FROM, and therefore the only files in which
 * naming a utility keeps it in the bundle. This must stay identical to the `content`
 * globs in tailwind.config.js: a file this walk sees but Tailwind does not is a
 * class that looks alive here and is purged in the artifact (hole 1 above), and a
 * file Tailwind sees but this walk does not is a banned utility that ships unseen.
 */
const SCANNED = /\.(js|ts|jsx|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCANNED.test(entry) && !TEST_FILE.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The stylesheets that actually SHIP: `globals.css` plus whatever it `@import`s,
 * transitively. Resolved rather than globbed, because `styles/` also contains
 * `components.css`, which nothing imports — it is dead, it still carries a 300ms
 * `.panel-collapse` transition, and letting a walk treat it as live would make a
 * utility declared only there look alive when Tailwind never emits it. Globbing the
 * directory is the convenient answer and the wrong one in both directions.
 */
function shippedCss(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry)) return [...seen];
  seen.add(entry);
  const text = readFileSync(entry, 'utf8');
  for (const m of text.matchAll(/@import\s+['"]\.\/([^'"]+)['"]/g)) {
    shippedCss(join(STYLES, m[1]), seen);
  }
  return [...seen];
}

const FILES = walk(SRC).map((f) => ({ rel: relative(SRC, f), text: readFileSync(f, 'utf8') }));
const CSS = shippedCss(join(STYLES, 'globals.css')).map((f) => ({
  rel: relative(SRC, f),
  text: readFileSync(f, 'utf8'),
  root: postcss.parse(readFileSync(f, 'utf8'), { from: f }),
}));
const globals = CSS.find((c) => c.rel.endsWith('globals.css'))!;

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

// `transition-all` and `transition-[…]`; `duration-300` and `duration-[220ms]`.
// Word-bounded so `t-duration` or `--t-panel` cannot false-positive. The bracket
// forms are included because Tailwind compiles `transition-[all]` to the identical
// `transition-property:all` that this whole item exists to delete.
const TRANSITION_ALL = /\btransition-all\b|\btransition-\[/g;
const AD_HOC_DURATION = /\bduration-(?:\d+|\[)/g;

describe('the transition vocabulary', () => {
  it('mirrors the Tailwind content scan, so a live class here is a live class there', () => {
    // Hole 1. If these globs change, `walk()` above must change with them or this
    // file starts lying about which classes survive purging.
    const cfg = readFileSync(TW_CONFIG, 'utf8');
    expect(cfg, 'Tailwind no longer scans exactly {js,ts,jsx,tsx}').toContain(
      "'./src/**/*.{js,ts,jsx,tsx}'",
    );
    expect(cfg, 'Tailwind no longer excludes __tests__ — widen walk()').toContain(
      "'!./src/**/__tests__/**'",
    );
    expect(cfg, 'Tailwind no longer excludes *.test.{ts,tsx} — narrow TEST_FILE').toContain(
      "'!./src/**/*.test.{ts,tsx}'",
    );
  });

  it('has no ad-hoc `transition-all` outside the shrink-only allowlist', () => {
    const offenders: string[] = [];
    for (const { rel, text } of FILES) {
      const n = count(text, TRANSITION_ALL);
      if (n === 0) continue;
      const budget = ALLOWLIST[rel]?.transitionAll ?? 0;
      if (n > budget) {
        offenders.push(
          `${rel}: ${n} × transition-all (allowed ${budget}) — ` +
            'use t-hover / t-surface / t-metric / t-panel / t-sweep. `transition-all` ' +
            'includes outline-color and outline-offset, which fades the focus ring.',
        );
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('has no ad-hoc `duration-*` utility outside the shrink-only allowlist', () => {
    const offenders: string[] = [];
    for (const { rel, text } of FILES) {
      const n = count(text, AD_HOC_DURATION);
      if (n === 0) continue;
      const budget = ALLOWLIST[rel]?.duration ?? 0;
      if (n > budget) {
        offenders.push(
          `${rel}: ${n} × duration-* (allowed ${budget}) — the duration belongs to the ` +
            'vocabulary class, not to the call site. 120 hover / 160 state / 200 panel / 700 sweep.',
        );
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('smuggles no banned utility in through `@apply`', () => {
    // Hole 4. `@apply transition-all duration-300` in a stylesheet is seen by
    // neither the source scan (it reads .ts/.tsx) nor the declaration walks below
    // (postcss models @apply as an at-rule, not a declaration), and it emits the
    // banned `transition-property:all` verbatim.
    const offenders: string[] = [];
    for (const { rel, root } of CSS) {
      root.walkAtRules('apply', (rule) => {
        if (TRANSITION_ALL.test(rule.params) || AD_HOC_DURATION.test(rule.params)) {
          offenders.push(`${rel}: @apply ${rule.params}`);
        }
        TRANSITION_ALL.lastIndex = 0;
        AD_HOC_DURATION.lastIndex = 0;
      });
    }
    expect(
      offenders,
      `@apply pulls a banned motion utility into authored CSS:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('defines every vocabulary utility and gives it a real consumer', () => {
    // Tailwind purges any class no source file names, so a vocabulary member with
    // zero call sites silently does not exist in the shipped stylesheet — exactly
    // how `.focus-ring-inset` shipped dead in Phase 4. Both halves are checked:
    // declared in CSS, and named from a file Tailwind actually scans.
    const declared = new Set<string>();
    for (const { root } of CSS) {
      root.walkRules((rule) => {
        for (const sel of rule.selectors) declared.add(sel.trim());
      });
    }
    for (const [name, token] of Object.entries(VOCABULARY)) {
      expect(declared, `.${name} is not declared in globals.css`).toContain(`.${name}`);
      const users = FILES.filter(({ text }) => new RegExp(`\\b${name}\\b`).test(text));
      expect(
        users.length,
        `.${name} is declared but named by no source file — Tailwind will purge it, ` +
          'and a token nothing names does not exist',
      ).toBeGreaterThan(0);
      // And it spends the duration the table above says it does — otherwise the
      // table is documentation rather than a contract, and `.t-panel` quietly
      // running at --t-hover is exactly the drift this whole item is about.
      const durations: string[] = [];
      for (const { root } of CSS) {
        root.walkRules((rule) => {
          if (!rule.selectors.map((s) => s.trim()).includes(`.${name}`)) return;
          rule.walkDecls('transition-duration', (decl) => {
            durations.push(decl.value.trim());
          });
        });
      }
      expect(durations, `.${name} should run at var(${token})`).toEqual([`var(${token})`]);
    }
  });

  it('spends every duration token it defines, --t-hover included', () => {
    // --t-hover had ZERO consumers when Phase 5 shipped. This is the assertion that
    // would have caught it — but hole 5: it used to iterate a hardcoded list of four
    // names, so a FIFTH token defined tomorrow with no consumer was unguarded by the
    // one assertion whose entire subject is unspent tokens. Tokens are discovered.
    const defined = new Set<string>();
    const used = new Set<string>();
    for (const { root } of CSS) {
      root.walkDecls((decl) => {
        if (/^--t-[a-z-]+$/.test(decl.prop)) defined.add(decl.prop);
        if (decl.prop.startsWith('--')) return; // a definition is not a consumer
        for (const m of decl.value.matchAll(/var\((--t-[a-z-]+)\)/g)) used.add(m[1]);
      });
    }
    expect(defined.size, 'no --t-* duration tokens found at all — did they move?').toBeGreaterThan(
      3,
    );
    for (const token of [...defined].sort()) {
      expect(used, `${token} is defined but nothing spends it — delete it or use it`).toContain(
        token,
      );
    }
  });

  it('lets no transition utility animate the focus ring', () => {
    // The root cause, encoded. `outline`, `outline-color`, `outline-offset` and
    // `outline-width` are the four properties the focus ring is painted with; a
    // transition that names any of them (or `all`, which names all of them) makes
    // the ring ease in, and a focus ring you cannot follow with your eyes is the
    // defect Phase 4 was spent on. Hole 3: this read globals.css alone, and
    // globals.css `@import`s tokens.css, so `button { transition: all 300ms }`
    // written one file over shipped unchallenged.
    const RING = /\boutline(-color|-offset|-width)?\b|(^|[\s,])all([\s,]|$)/;
    const offenders: string[] = [];
    for (const { rel, root } of CSS) {
      root.walkDecls((decl) => {
        if (!/^transition(-property)?$/.test(decl.prop)) return;
        if (RING.test(decl.value)) {
          offenders.push(`${rel}: ${(decl.parent as postcss.Rule).selector} { ${decl.prop}: ${decl.value} }`);
        }
      });
    }
    expect(
      offenders,
      `a transition in authored CSS animates the focus ring:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('lets no element-level rule fade an inset focus ring', () => {
    // `.focus-ring-inset` paints its ring with `box-shadow: inset 0 0 0 2px`, so ANY
    // element-level rule that transitions box-shadow fades that ring on every
    // element of that type — measured at 0.72px / alpha 0.357 at t=40ms, under the
    // SC 1.4.11 3:1 floor on the way in.
    //
    // Hole 2: the previous version of this test keyed on a selector containing both
    // `button` and `select`, i.e. on the SHAPE of the one rule that had the bug.
    // `button { transition: box-shadow 0.15s ease; }` as its own rule reproduced the
    // defect exactly and passed. The invariant is about element-level selectors, not
    // about that one selector list, so that is what is asserted: a selector with no
    // class, id or attribute part may not transition box-shadow. `.lift` and
    // `.t-surface` are classes and stay legal — a call site opts INTO a shadow
    // transition by name, which is the whole distinction.
    const offenders: string[] = [];
    for (const { rel, root } of CSS) {
      root.walkRules((rule) => {
        const elementLevel = rule.selectors.filter((s) => !/[.#[]/.test(s.trim()));
        if (elementLevel.length === 0) return;
        rule.walkDecls(/^transition(-property)?$/, (decl) => {
          if (/box-shadow/.test(decl.value)) {
            offenders.push(`${rel}: ${elementLevel.join(', ')} { ${decl.prop}: ${decl.value} }`);
          }
        });
      });
    }
    expect(
      offenders,
      'an element-level transition names box-shadow, which fades the .focus-ring-inset ring:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('never pairs .focus-ring-inset with a utility that transitions box-shadow', () => {
    // globals.css states this in prose — "pairing `.t-surface` with
    // `.focus-ring-inset` on the same element re-creates the fade on the ring.
    // Don't" — and then asserts "as of this change no element carries both". That
    // sentence was true and untested, which is how the base-layer instance of the
    // same bug survived a whole phase. Adding `t-surface` to the `.focus-ring-inset`
    // button in TopNav left every test green.
    const shadowUtilities = new Set<string>();
    for (const { root } of CSS) {
      root.walkRules((rule) => {
        rule.walkDecls(/^transition(-property)?$/, (decl) => {
          if (!/box-shadow/.test(decl.value)) return;
          for (const sel of rule.selectors) {
            const m = sel.trim().match(/^\.([a-z][a-z0-9-]*)$/);
            if (m) shadowUtilities.add(m[1]);
          }
        });
      });
    }
    expect(shadowUtilities, 'expected .t-surface to be one of the shadow-transitioning utilities')
      .toContain('t-surface');

    const offenders: string[] = [];
    for (const { rel, text } of FILES) {
      for (const line of text.split('\n')) {
        if (!line.includes('focus-ring-inset')) continue;
        for (const u of shadowUtilities) {
          if (new RegExp(`\\b${u}\\b`).test(line)) {
            offenders.push(`${rel}: .focus-ring-inset shares an element with .${u}`);
          }
        }
      }
    }
    expect(
      offenders,
      'a .focus-ring-inset control also carries a box-shadow transition, which fades its ' +
        `inset ring:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('still has globals.css as the stylesheet the vocabulary lives in', () => {
    // Cheap guard on the assumption every walk above makes.
    expect(globals.text).toContain('--t-hover');
    expect(CSS.length, 'authored stylesheets vanished — the walks above are reading nothing')
      .toBeGreaterThan(1);
  });
});
