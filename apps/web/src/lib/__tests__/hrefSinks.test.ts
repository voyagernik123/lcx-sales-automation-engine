import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE RATCHET. `safeHref` existed, was correct, and was applied at nine of
 * twenty-three anchors.
 *
 * That is the whole shape of the defect. Nobody skipped it on purpose; a helper you
 * have to REMEMBER is a helper that gets forgotten, and the one it was forgotten at
 * (`Readout.tsx`, `href={item.href}`) rendered a value the API had STORED. In the
 * LCXOS webview a `javascript:` href is not a bad link — it is script running in the
 * app origin, next to the Tauri commands, one of which reads the desk credential out
 * of the Keychain.
 *
 * So fixing the fourteen sinks is not the deliverable. THIS is: without it the
 * fifteenth skips the helper exactly as these did, and nothing says so.
 *
 * WHAT IS ASSERTED — a property of the SOURCE, checked in the source. Every
 * `href={…}` in a shipped file must be one of exactly three things:
 *
 *   1. a string literal              href={'/deal-board'}
 *   2. a template literal whose text BEFORE the first `${` already fixes a safe
 *      scheme — `#…`, `/…`, `https://…`, `mailto:…`. `href={`#${s.id}`}` passes;
 *      `href={`${base}/x`}` does not, because `base` decides the scheme.
 *   3. a single `safeHref(…)` call wrapping the whole expression.
 *
 * THE ALLOWLIST IS EMPTY, DELIBERATELY. There was one candidate —
 * `Launch.tsx`'s `LCXOS_DOWNLOAD_URL`, a module constant holding a literal https
 * string — and it was wrapped instead. An allowlist entry is a standing promise that
 * a human re-checks that constant every time it is edited; one function call is
 * cheaper and does not depend on anyone remembering. The mechanism is kept, and kept
 * empty, so the next person has a documented escape hatch that is not "delete the
 * test".
 *
 * WHAT IT DOES NOT CATCH, stated rather than implied:
 *   · `<a {...props}>` — an href arriving through a spread. None exists today.
 *   · `element.href = x` and `window.location = x` in imperative code.
 *   · `dangerouslySetInnerHTML`, which is a different sink with a different fix.
 *   · react-router `to={…}`, which is routed by the router, not by the URL parser.
 *   · test files, which do not ship.
 * A grep-shaped ratchet buys reliable coverage of the shape it names and nothing
 * else. It is the second layer regardless: `actions/registry.ts` now refuses a
 * non-navigable scheme at the point the value is STORED.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');

/**
 * Exceptions, as `{ file, expr, why }`. Matched on the EXACT expression text rather
 * than on a line number, so an unrelated edit above it cannot silently move the
 * exception onto a different anchor.
 */
const ALLOWED: Array<{ file: string; expr: string; why: string }> = [];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Pull the balanced expression out of `href={…}`.
 *
 * Brace-matching rather than a regex, because the expression may contain object
 * literals, nested JSX, and braces inside strings. Strings, template literals and
 * comments are skipped so a `}` inside one does not end the expression early —
 * which is the same class of bug as the backtick-in-a-template-literal trap.
 */
function extractHrefExpr(src: string, openIdx: number): { expr: string; end: number } | null {
  let i = openIdx + 1;
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; if (depth === 0) return { expr: src.slice(openIdx + 1, i), end: i }; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue; }
    if (c === '/' && src[i + 1] === '*') { const close = src.indexOf('*/', i + 2); i = close === -1 ? src.length : close + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    i++;
  }
  return null;
}

/** Is the whole expression a single `safeHref(…)` call and nothing else? */
function isWholeSafeHrefCall(expr: string): boolean {
  const t = expr.trim();
  if (!t.startsWith('safeHref(')) return false;
  let depth = 0;
  for (let i = 'safeHref'.length; i < t.length; i++) {
    if (t[i] === '(') depth++;
    else if (t[i] === ')') {
      depth--;
      // The call closed. Anything after it (`?? '#'`, `+ x`, `, y`) means the value
      // reaching the DOM is not the one safeHref returned.
      if (depth === 0) return i === t.length - 1;
    }
  }
  return false;
}

/** A scheme the anchor's own text already fixes, before any interpolation. */
const SAFE_PREFIX = /^(https?:\/\/|mailto:|tel:|#|\/(?!\/))/;

function classify(expr: string): { safe: boolean; why: string } {
  const t = expr.trim();
  if (!t) return { safe: false, why: 'empty href expression' };

  if (/^'[^']*'$/.test(t) || /^"[^"]*"$/.test(t)) return { safe: true, why: 'string literal' };

  if (t.startsWith('`') && t.endsWith('`')) {
    const inner = t.slice(1, -1);
    const prefix = inner.split('${')[0]!;
    if (SAFE_PREFIX.test(prefix)) return { safe: true, why: 'template literal with a literal scheme prefix' };
    return {
      safe: false,
      why: `template literal whose scheme is interpolated (before the first \${ it reads ${JSON.stringify(prefix)}), so the interpolated value decides the scheme`,
    };
  }

  if (isWholeSafeHrefCall(t)) return { safe: true, why: 'safeHref() call' };
  if (t.includes('safeHref(')) {
    return { safe: false, why: 'safeHref() is in there but is not the whole expression — what reaches the DOM is not what safeHref returned' };
  }
  return { safe: false, why: 'data-driven expression with no safeHref() guard' };
}

interface Sink { file: string; line: number; expr: string }

function collect(): Sink[] {
  const sinks: Sink[] = [];
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    let at = src.indexOf('href={');
    while (at !== -1) {
      const open = at + 'href='.length;
      const got = extractHrefExpr(src, open);
      if (got) {
        sinks.push({
          file: relative(SRC, file),
          line: src.slice(0, at).split('\n').length,
          expr: got.expr,
        });
        at = src.indexOf('href={', got.end);
      } else {
        at = src.indexOf('href={', at + 1);
      }
    }
  }
  return sinks;
}

const SINKS = collect();

describe('every href={} in apps/web/src is scheme-guarded', () => {
  it('the walker actually found the anchors — otherwise this suite passes by seeing nothing', () => {
    // Anti-vacuity. There were 27 `href={` sites when this was written. A refactor
    // may move them; a walker that silently stops finding them must not read as green.
    expect(SINKS.length).toBeGreaterThanOrEqual(20);
  });

  it('every sink is a literal, a scheme-pinned template, or safeHref()', () => {
    const violations = SINKS
      .map((s) => ({ ...s, verdict: classify(s.expr) }))
      .filter((s) => !s.verdict.safe)
      .filter((s) => !ALLOWED.some((a) => a.file === s.file && a.expr === s.expr.trim()));

    // One line per violation, naming the file, the line and the expression, so the
    // fix is "open that line and wrap it" and not "go and find them".
    const report = violations
      .map((v) => `  apps/web/src/${v.file}:${v.line}  href={${v.expr.trim()}}\n      ${v.verdict.why}`)
      .join('\n');

    expect(
      violations.length,
      violations.length === 0 ? '' :
        `${violations.length} unguarded href sink(s). React does NOT block javascript:/data: hrefs, and `
        + 'these render inside the LCXOS webview where such a navigation executes in the app origin.\n'
        + "Wrap the value: import { safeHref } from '@/lib/safeHref' and write href={safeHref(x)}.\n"
        + report,
    ).toBe(0);
  });

  it('the sink that was actually exploitable is guarded', () => {
    // Named explicitly rather than left to the sweep above: `notifications.href` is
    // SERVER-STORED, so this anchor replays an attacker-chosen value to every later
    // reader. If a refactor moves it, this fails loudly instead of quietly dropping
    // out of the sweep's coverage.
    const readout = SINKS.filter((s) => s.file === 'pages/Readout.tsx');
    expect(readout.length).toBeGreaterThan(0);
    for (const s of readout) expect(classify(s.expr).safe, `Readout.tsx:${s.line}`).toBe(true);
    expect(readout.some((s) => s.expr.includes('safeHref(item.href)'))).toBe(true);
  });

  it('the allowlist stays small, and no entry may go stale', () => {
    // Currently EMPTY (see the header). The cap is what makes growth a decision
    // somebody has to defend rather than the path of least resistance, and the
    // per-entry checks stop an exception outliving the anchor it was written for —
    // a stale entry is an exception nobody is checking.
    expect(ALLOWED.length, 'the allowlist is the escape hatch, not the pattern').toBeLessThanOrEqual(3);
    for (const a of ALLOWED) {
      expect(
        SINKS.some((s) => s.file === a.file && s.expr.trim() === a.expr),
        `stale allowlist entry — no href={${a.expr}} in ${a.file}`,
      ).toBe(true);
      expect(a.why.length, `allowlist entry for ${a.file} has no stated reason`).toBeGreaterThan(20);
    }
  });
});

describe('the classifier itself, so the sweep above cannot pass by being broken', () => {
  // A source walker that classifies everything as safe is indistinguishable from a
  // codebase with no defects. These are the negative controls.
  const REJECTED: Array<[string, string]> = [
    ['the exact expression Readout.tsx shipped', 'item.href'],
    ['a bare property', 'person.linkedin'],
    ['a nullish fallback around the guard', "safeHref(s.url) ?? '#'"],
    ['a fallback the guard never sees', "s.url ?? '#'"],
    ['safeHref applied to only one branch', "cond ? safeHref(a) : b"],
    ['a template whose scheme is interpolated', '`${base}/path`'],
    ['a call that merely looks similar', 'notSafeHref(x)'],
    ['a function call that is not the guard', 'buildUrl(x)'],
  ];
  it.each(REJECTED)('rejects %s', (_label, expr) => {
    expect(classify(expr).safe, `${expr} was classified SAFE`).toBe(false);
  });

  const ACCEPTED: Array<[string, string]> = [
    ['a single-quoted literal', "'/deal-board'"],
    ['a double-quoted literal', '"/ops"'],
    ['a fragment template', '`#${s.id}`'],
    ['an https template', '`https://t.me/${handle}`'],
    ['a mailto template', '`mailto:${person.email}`'],
    ['the guard', 'safeHref(item.href)'],
    ['the guard around an expression', "safeHref(a ?? b)"],
    ['the guard, whitespace-padded', '  safeHref(x)  '],
  ];
  it.each(ACCEPTED)('accepts %s', (_label, expr) => {
    expect(classify(expr).safe, `${expr} was classified UNSAFE`).toBe(true);
  });

  it('extracts an expression containing braces and strings without ending early', () => {
    const src = 'const x = <a href={safeHref(`${a}}`)} />;';
    const got = extractHrefExpr(src, src.indexOf('href={') + 'href='.length);
    expect(got?.expr).toBe('safeHref(`${a}}`)');
  });

  it('the reported line number is the line the anchor is actually on', () => {
    // The failure message is the deliverable here — a ratchet that says "something
    // is wrong somewhere" gets suppressed. Line numbers are 1-based and counted from
    // the START of `href=`, so they land on the attribute, not on the closing brace.
    const src = ['const a = 1;', 'const b = 2;', '<a href={item.href} />'].join('\n');
    const at = src.indexOf('href={');
    expect(src.slice(0, at).split('\n').length).toBe(3);
  });
});
