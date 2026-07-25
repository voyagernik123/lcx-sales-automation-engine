import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The ratchet on the empty / loading / error grammar (TERMINAL Phase 5).
 *
 * Adoption of the three shared components was already good when this was
 * written — 40+ EmptyState sites, 50 skeleton sites — so this file deliberately
 * does NOT assert "every page must import EmptyState". A rule like that would
 * fail on the 15 purely-computed pages (calculators, the Howey scorer, the
 * ontology explorer) that read from `@/data` and have no async state at all;
 * adding empty/error affordances there is noise, and a rule that demands noise
 * gets deleted.
 *
 * What it asserts instead are the three failure modes actually found in the
 * codebase, all of which are silent — nothing throws, nothing logs, and the
 * screen looks plausible:
 *
 *   1. A bare "Loading…" string standing in for a skeleton, so the layout jumps
 *      when data lands.
 *   2. An error handler that resets state to the same value the render uses as
 *      its LOADING sentinel — `.catch(() => setDeep(null))` under a
 *      `{!deep ? <CardSkeleton/> : …}` gate. The skeleton then pulses forever
 *      and the only recovery is a page reload. Found at five sites.
 *   3. An error discarded entirely — `.catch(() => {})` — with nothing said
 *      about why that is correct. Sometimes it IS correct (a garnish that
 *      renders only when present), which is exactly why the rule demands a
 *      written reason rather than banning the shape.
 *
 * Each rule is scoped to files that actually talk to the API, and each carries
 * an escape hatch that is a comment rather than a config list, so the argument
 * lives next to the code it excuses.
 */

const SRC = join(__dirname, '..', '..', '..');

/**
 * Strip comments before matching, so the ratchet judges what the app DOES
 * rather than what its documentation talks about — the same reason
 * focusVisible.test.ts needs this helper. Without it, the block comment at the
 * top of THIS file trips rules 1 and 3 on itself, and the explanatory comments
 * this file demands would themselves be read as violations.
 */
function codeOnly(text: string): string {
  return text
    // Blank the block comment but KEEP its newlines: every offender below is
    // reported as file:line, and a ratchet that points at the wrong line sends
    // the next engineer hunting. focusVisible.test.ts drops comment lines
    // outright and so drifts; this does not.
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n')
    .map((line) => {
      const t = line.trim();
      // Whole-line `//` and JSDoc continuations vanish; a trailing `//` is left
      // alone because it appears inside string literals such as `https://`.
      return t.startsWith('//') || t.startsWith('*') ? '' : line;
    })
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__' || entry === 'e2e') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (f: string) => f.replace(SRC, 'src');

interface Surface {
  file: string;
  /** Comments stripped — what the file does. */
  code: string;
  /** Comments intact — needed to find the "why this swallow is fine" notes. */
  raw: string;
  lines: string[];
}

/** Only surfaces that read from the API can have an async-state grammar to get wrong. */
const TOUCHES_API = /from '@\/lib\/api\/|from '@\/lib\/apiClient'/;

const surfaces: Surface[] = walk(SRC)
  .map((file) => {
    const raw = readFileSync(file, 'utf8');
    return { file, raw, code: codeOnly(raw), lines: codeOnly(raw).split('\n') };
  })
  .filter((s) => TOUCHES_API.test(s.code));

describe('the empty / loading / error grammar', () => {
  it('has surfaces to check (guards against the walk silently finding nothing)', () => {
    // If a refactor moves the source root, every rule below would pass vacuously.
    expect(surfaces.length).toBeGreaterThan(50);
  });

  it('no API-backed surface renders a bare "Loading…" instead of a skeleton', () => {
    // A text placeholder occupies one line; the table/cards that replace it
    // occupy many, so the whole page jumps when data lands. The shared
    // skeletons exist so the reserved space matches the arriving shape.
    //
    // Matched narrowly: the string as RENDERED TEXT — `>Loading…<` or
    // `{cond ? 'Loading…' : …}`. Deliberately NOT matched: `aria-label="Loading
    // table"` inside the skeletons themselves (that is the accessible name of
    // the correct thing), and identifiers like `setLoading` / `isLoading`,
    // which are how a page tracks the state properly.
    const bare = /(?:>|['"`])\s*Loading\s*(?:\.\.\.|…)/;
    const offenders: string[] = [];
    for (const s of surfaces) {
      s.lines.forEach((line, i) => {
        if (bare.test(line)) offenders.push(`${rel(s.file)}:${i + 1} — ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `Bare loading text where a skeleton belongs. Use TableSkeleton / CardSkeleton / ChartSkeleton ` +
        `whose shape matches what will appear:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('no error handler resets state to the value the render treats as "still loading"', () => {
    // The defect this phase found five times, e.g. DistributionGeo:
    //
    //   const [deep, setDeep] = useState<DistributionDeep | null>(null);
    //   fetchDistributionDeep().then(setDeep).catch(() => setDeep(null));
    //   …
    //   {!deep ? <CardSkeleton /> : <TheWholePage />}
    //
    // `null` means BOTH "not fetched yet" and "fetch failed", so a failure is
    // rendered as a skeleton that pulses until the tab is closed. It is worse
    // than a blank panel: a blank panel at least looks finished, while an
    // eternal skeleton tells the operator to keep waiting for data that is
    // never coming, and offers no retry.
    //
    // The rule fires only when all three parts are present in one file — the
    // catch, the reset to a falsy sentinel, and a render gate on that same
    // identifier within three lines of a skeleton. Setting an error flag
    // alongside (the fix) removes the gate's reachability and so passes.
    const SKELETON = /TableSkeleton|CardSkeleton|ChartSkeleton|PageSkeleton|animate-pulse/;
    const offenders: string[] = [];

    for (const s of surfaces) {
      s.lines.forEach((line, i) => {
        for (const m of line.matchAll(
          /\.catch\(\s*\(\s*\)\s*=>\s*(?:!?\w+\s*&&\s*)?(set[A-Z]\w*)\(\s*(null|undefined)\s*\)/g,
        )) {
          const state = m[1].slice(3);
          const ident = state.charAt(0).toLowerCase() + state.slice(1);
          const gate = new RegExp(`(!${ident}\\b|\\b${ident}\\s*===?\\s*null)`);
          const gateLine = s.lines.findIndex(
            (l, j) => gate.test(l) && SKELETON.test(s.lines.slice(j, j + 3).join(' ')),
          );
          if (gateLine >= 0) {
            offenders.push(
              `${rel(s.file)}:${i + 1} — .catch(() => ${m[1]}(${m[2]})) resets to the loading sentinel ` +
                `that gates a skeleton at ${rel(s.file)}:${gateLine + 1}`,
            );
          }
        }
      });
    }
    expect(
      offenders,
      `An eternal loading skeleton on failure. Give the failure its own state and render ` +
        `<ErrorNotice error={err} onRetry={load} />:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('every discarded error either sets state or says in a comment why discarding is right', () => {
    // `.catch(() => {})` is not always wrong. Several are correct: a forecast
    // chip that renders only when present, a clipboard write behind a toast, a
    // localStorage fallback. What is never acceptable is discarding with no
    // stated reason — the reader cannot tell a decision from an oversight, and
    // the operator gets a surface that is confidently missing information.
    //
    // The escape hatch is a comment rather than an allowlist in this file, so
    // the argument sits where the next engineer will read it. Handlers that do
    // anything at all with the error — set state, toast, log, re-throw — are
    // not matched; only the empty ones are.
    const discards = /\.catch\(\s*(?:\(\s*\)|\w+|\(\s*\w+\s*\))\s*=>\s*(?:\{\s*\}|undefined|null|void 0)\s*\)/;

    // The hatch is not "any comment nearby" — that would let an unrelated note
    // three lines up excuse a real swallow. It has to be a comment that SAYS
    // SOMETHING ABOUT FAILING: that the value is optional, that absence is a
    // designed rendering, that the surface degrades. Writing one of these words
    // is a claim the reviewer can check; a bare `// fetch the forecast` is not.
    const ARGUED = /best[- ]effort|garnish|degrade|enrich|optional|resilient|ignore|fall ?back|never dead-end|quiet|absent|transient/i;
    const offenders: string[] = [];

    for (const s of surfaces) {
      const rawLines = s.raw.split('\n');
      s.lines.forEach((line, i) => {
        if (!discards.test(line)) return;
        // Twelve lines of lookback, because the comment belongs at the top of the
        // effect or the promise chain rather than glued to the `.catch(` that can
        // sit six or seven lines below it (DealReviewMemo.tsx is exactly this).
        const window = rawLines.slice(Math.max(0, i - 12), i + 1).join('\n');
        if (!ARGUED.test(window)) offenders.push(`${rel(s.file)}:${i + 1} — ${line.trim()}`);
      });
    }
    // No allowlist, and none needed: every surviving swallow in the app carries
    // a written reason. Four did not when this landed — three were real (a
    // clipboard write behind a success toast that fired anyway, and two cockpit
    // instruments that removed themselves from the page on failure), one was a
    // genuinely best-effort forecast read whose enclosing loader already said so.
    expect(
      offenders,
      `An error thrown away with no reason given. Either set an error state and render it, ` +
        `or write the one line explaining why absent is a correct rendering here:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the three grammar components are reachable from one barrel', () => {
    // The grammar only stays one grammar while there is a single import site to
    // reach for. ErrorNotice sat at 3 usages against EmptyState's 40 largely
    // because surfaces hand-rolled a red <p> instead; keeping all three side by
    // side in the barrel is what makes the shared one the easy choice.
    const barrel = readFileSync(join(SRC, 'components', 'shared', 'index.ts'), 'utf8');
    for (const name of ['EmptyState', 'ErrorNotice', 'TableSkeleton', 'CardSkeleton', 'ChartSkeleton']) {
      expect(barrel, `${name} must stay exported from components/shared`).toContain(name);
    }
  });
});
