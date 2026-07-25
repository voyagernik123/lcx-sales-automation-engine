/**
 * The dead-capability guard (TERMINAL Phase 7, T1 #28).
 *
 * WHAT WENT WRONG THAT THIS CATCHES
 * `command_reopen_decision` sat in ACTION_REGISTRY for a full phase with no
 * invoker anywhere. Phase 3 already had a coverage test asserting every action is
 * reachable and fully specifiable through ⌘K — and it passed, correctly, because
 * ⌘K IS generated from the registry: it reaches EVERY action by construction. So
 * the one test that looked like it should have caught this could never have. A
 * capability that only ⌘K can name is one an operator has to already know about.
 *
 * SO THE CONDITION HERE IS DELIBERATELY "NAMED BY SOMETHING OTHER THAN ⌘K":
 *   A. a source file under apps/web/src names the action id — a page, a panel, or
 *      an api wrapper — as a string literal or in an `actions/<id>/invoke` URL;
 *   B. the AI operator's AI_PROPOSABLE allow-list names it; or
 *   C. this file exempts it, in writing, with a reason.
 *
 * Comments are STRIPPED before matching. A capability mentioned only in prose is
 * not reachable, and letting a comment satisfy the guard would have let #28 pass
 * (registry.ts discusses the action at length).
 *
 * WHAT THIS TEST DOES NOT PROVE — read this before trusting a green run:
 *   - It is a NECESSARY condition, not a sufficient one. Naming an id is not the
 *     same as rendering a control: `lib/readInvalidate.ts` names
 *     grant/revoke_entitlement in a cache map and would satisfy the guard on its
 *     own. Green means "a surface could plausibly invoke this", never "an operator
 *     can see it".
 *   - It is static string matching over source text. It cannot know whether the
 *     component that names the id is mounted on any route, nor whether the control
 *     is behind a condition that is never true.
 *   - The MONITOR engine is deliberately NOT counted as a channel. It invokes
 *     whatever action id an operator configures (intel/monitors.ts validates only
 *     that the id exists in the registry), so counting it would make the guard as
 *     universal — and as vacuous — as counting ⌘K.
 *
 * WHY NOT TIGHTER. A stricter matcher — the id must appear as a call's first
 * argument, `foo('<id>'`, or in an invoke URL — was written and measured against all
 * 22 actions. It passes 21 and produces one FALSE NEGATIVE: ProvenancePanel invokes
 * `run(state.watchlisted ? 'watchlist_remove' : 'watchlist_add')`, a perfectly good
 * invoker in a ternary. Buying call-position precision would therefore have cost an
 * exemption for a live capability, and an exemption list with a wrongly-listed entry
 * damages this guard more than file-level granularity does. So the granularity is a
 * measured choice, not an oversight.
 *
 * A tighter check would need a browser: the spec that would prove the affordance
 * actually renders and blocks correctly is a Playwright pass over the LCX COMMAND
 * decisions register. That is not this file's claim.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ACTION_REGISTRY } from '../registry.js';
import { AI_PROPOSABLE } from '../../ai/operator.js';

const WEB_SRC = fileURLToPath(new URL('../../../../web/src', import.meta.url));

/**
 * Actions with no surface affordance, on purpose, each with the reason.
 *
 * Adding an id here is a governance statement, not a way to quiet a test: it says
 * "an operator is not meant to find this on a surface, and here is why". An empty
 * list is the healthy state — it is empty today, which is the point.
 */
const EXEMPT: Record<string, string> = {};

/** Recursive walk, skipping tests and generated artifacts. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // `generated/` is the ⌘K manifest itself — the channel this guard exists to
      // discount. `__tests__` would let a test satisfy the guard for the app.
      if (entry === '__tests__' || entry === 'generated') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Block and line comments removed; `//` inside `http://` deliberately survives. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const WEB_SOURCES: Array<[string, string]> = sourceFiles(WEB_SRC).map((f) => [
  f.slice(WEB_SRC.length + 1),
  stripComments(readFileSync(f, 'utf8')),
]);

/**
 * Files that NAME this action id as code.
 *
 * Two forms, both anchored so an identifier that merely contains the id cannot
 * match: a quoted literal (`'assign'`), or the invoke URL path
 * (`/v1/actions/assign/invoke`). Without the anchoring, `window.location.assign(`
 * would "reach" the `assign` action.
 */
function namedBy(id: string): string[] {
  const re = new RegExp(`(['"\`]${id}['"\`]|actions/${id}/)`);
  return WEB_SOURCES.filter(([, src]) => re.test(src)).map(([rel]) => rel);
}

describe('every governed action is named by some channel other than ⌘K', () => {
  it('scanned a plausible number of web sources (the walk itself must not silently return nothing)', () => {
    // A broken path would make every action "unreached" — or, if the assertion
    // were inverted, make the whole guard pass vacuously. Pin the floor.
    expect(WEB_SOURCES.length).toBeGreaterThan(100);
  });

  for (const id of Object.keys(ACTION_REGISTRY)) {
    it(`${id} is reachable from a surface`, () => {
      if (EXEMPT[id]) return;
      const web = namedBy(id);
      const ai = (AI_PROPOSABLE as readonly string[]).includes(id);
      expect(
        web.length > 0 || ai,
        `${id} is in ACTION_REGISTRY but no surface names it: not in apps/web/src, not in AI_PROPOSABLE, ` +
          `and not exempt. It is still reachable through ⌘K, which is exactly the trap — a capability only ⌘K ` +
          `can name is one the operator has to already know exists. Either wire an affordance, add it to ` +
          `AI_PROPOSABLE, delete it from the registry (then run \`npm run gen:actions\`), or add it to EXEMPT ` +
          `in this file with a written reason.`,
      ).toBe(true);
    });
  }
});

describe('the exemption list stays honest', () => {
  it('exempts nothing that is not an action', () => {
    for (const id of Object.keys(EXEMPT)) {
      expect(ACTION_REGISTRY[id], `EXEMPT names '${id}', which is not in the registry`).toBeDefined();
    }
  });

  it('exempts nothing that is now actually reached', () => {
    // A stale exemption is worse than none: it holds a "this is deliberately
    // invisible" claim over a capability that has since been wired.
    for (const id of Object.keys(EXEMPT)) {
      const web = namedBy(id);
      expect(
        web,
        `${id} is exempt as unreachable but ${web.join(', ')} names it — drop the exemption`,
      ).toHaveLength(0);
    }
  });

  it('gives every exemption a non-trivial reason', () => {
    for (const [id, why] of Object.entries(EXEMPT)) {
      expect(why.trim().length, `EXEMPT['${id}'] needs a real reason, not a placeholder`).toBeGreaterThan(20);
    }
  });
});

describe('the matcher is anchored, not a substring search', () => {
  // If these ever fail, the guard above has become either vacuous or noisy — and
  // both failure modes are silent without them.
  it('does not treat a member-expression as naming an action', () => {
    expect(new RegExp(`(['"\`]assign['"\`]|actions/assign/)`).test('window.location.assign("/select")')).toBe(false);
  });

  it('does treat a quoted literal and an invoke URL as naming it', () => {
    const re = () => new RegExp(`(['"\`]assign['"\`]|actions/assign/)`);
    expect(re().test("invokeCommandAction('assign', ...)")).toBe(true);
    expect(re().test('request(`/v1/actions/assign/invoke`)')).toBe(true);
  });

  it('does not let a comment reach a capability', () => {
    expect(stripComments("// TODO: wire 'command_reopen_decision' one day\n")).not.toContain('command_reopen_decision');
    expect(stripComments("/* 'command_reopen_decision' is a real need */\n")).not.toContain('command_reopen_decision');
  });
});
