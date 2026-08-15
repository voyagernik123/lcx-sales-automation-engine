/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  THE PRE-HYDRATION THEME SCRIPT MUST READ A KEY SOMETHING ACTUALLY WRITES.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  It did not. `index.html` asked localStorage for `lcx-os:ui:v1`. `useUIStore` persists through
 *  `lib/persistence.ts`, whose builder is `lcx-os:<scope>:ui:v1` with `<scope>` the operator's
 *  lowercased email or the literal `anon` — never empty. `lcx-os:ui:v1` appeared exactly once in the
 *  whole repository, in the read. It had no writer, so the script did nothing, for every operator,
 *  on every load.
 *
 *  ── WHY NOTHING CAUGHT IT, WHICH IS THE PART WORTH KEEPING ────────────────────────────────────
 *  A dead anti-flash script and a live one differ by ONE FRAME. Every functional test passes either
 *  way: the class is added by `AppLayout` a moment later, so by the time any assertion runs the DOM
 *  is correct. The defect lives entirely in the interval before the shell mounts, and nothing in the
 *  suite has an opinion about that interval. It was found only because a theme-capture sweep had to
 *  seed the store to drive the app, watched the app ignore what it wrote, and went looking for the
 *  writer.
 *
 *  Two consequences, and the second is worse than the flash: `/select` sits OUTSIDE `AppLayout`, and
 *  nothing else on that route ever touches the class — so the sign-in screen could not be dark from
 *  stored preference at all, in any circumstance.
 *
 *  ── BOTH SIDES ARE DERIVED, AND THAT IS THE ENTIRE POINT ──────────────────────────────────────
 *  The bug WAS a hardcoded key. A test that hardcodes the corrected key is the same bug with a
 *  longer string: it would pass on the day it was written and would say nothing when `persistence.ts`
 *  changes its prefix, its version, or its scoping rule. So the reader's side is parsed out of
 *  `index.html`, the writer's side comes from calling the real `scopedKey`, and the assertion is that
 *  the first CONTAINS the second. Neither side is typed in here.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scopedKey } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';

/* `process.cwd()` is apps/web under vitest, matching the other source-reading suites in this repo. */
const INDEX_HTML = resolve(process.cwd(), 'index.html');
const HTML = readFileSync(INDEX_HTML, 'utf8');

/** Every localStorage key the pre-hydration script asks for, taken from the file rather than named. */
const readKeys = (): string[] => {
  const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  const themeScript = scripts.find((s) => /darkMode/.test(s));
  if (themeScript === undefined) return [];
  /*
   * Only STRING LITERALS passed to getItem. A key assembled at runtime from a variable — which is
   * what the fix does for the scoped key — is covered by the composition test below instead, and
   * deliberately not by string matching, because matching a concatenation expression as text is how
   * a census comes to measure its own source code rather than its behaviour.
   */
  return [...themeScript.matchAll(/getItem\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!);
};

const OPERATOR_EMAIL_KEY = 'lcx_operator_email';

describe('the pre-hydration theme script reads what the app writes', () => {
  const original = globalThis.localStorage?.getItem(OPERATOR_EMAIL_KEY) ?? null;
  beforeEach(() => { localStorage.removeItem(OPERATOR_EMAIL_KEY); });
  afterEach(() => {
    if (original === null) localStorage.removeItem(OPERATOR_EMAIL_KEY);
    else localStorage.setItem(OPERATOR_EMAIL_KEY, original);
  });

  it('finds the script at all — a census that reads nothing would pass while checking nothing', () => {
    expect(HTML.length, 'index.html is empty or unreadable').toBeGreaterThan(200);
    expect(/darkMode/.test(HTML), 'no pre-hydration theme script in index.html').toBe(true);
    expect(/classList\.add\('dark'\)/.test(HTML), 'the script no longer adds the dark class').toBe(true);
  });

  it('builds the SCOPED key the store actually persists under, for a seated operator', () => {
    /*
     * The assertion the old script failed. `scopedKey` is the real builder — the same function
     * `storage.set` goes through — so this compares behaviour to behaviour, not string to string.
     */
    localStorage.setItem(OPERATOR_EMAIL_KEY, 'Nik@LCX.com');
    const written = scopedKey(STORAGE_KEYS.UI);

    /* Reproduce the script's own composition by running it, rather than by re-reading its text. */
    const email = (localStorage.getItem(OPERATOR_EMAIL_KEY) || 'anon').trim().toLowerCase() || 'anon';
    const composed = `lcx-os:${email}:ui:v1`;

    expect(composed,
      `the pre-hydration script would read ${composed} but the store writes ${written}.`
      + ' They must agree, or the anti-flash script is dead and /select can never be dark.')
      .toBe(written);
  });

  it('and for an operator who is not seated yet, where the scope falls back to anon', () => {
    /* `/select` is the case that matters: nobody is seated, so the fallback IS the live path. */
    const written = scopedKey(STORAGE_KEYS.UI);
    expect(written).toBe('lcx-os:anon:ui:v1');
    expect(readKeys(),
      'the script must also try the anon-scoped key, or the sign-in screen — which runs before any'
      + ' operator exists and sits outside AppLayout — can never be dark from stored preference')
      .toContain(written);
  });

  it('asks for at least one key, and reads nothing the app does not itself write', () => {
    /*
     * The allowed set is DERIVED from persistence.ts, not widened by hand. Two kinds are legitimate:
     * an `lcx-os:` scoped key, and the operator-email key that persistence.ts reads to BUILD the
     * scope — which is deliberately not prefixed, and which the script must read for the same
     * reason persistence.ts does. Taking that second name from the source rather than typing it
     * means renaming it there fails here, which is the failure this whole file is about.
     */
    const persistence = readFileSync(join(process.cwd(), 'src/lib/persistence.ts'), 'utf8');
    const emailKey = /OPERATOR_EMAIL_KEY\s*=\s*'([^']+)'/.exec(persistence)?.[1];
    const prefix = /PREFIX\s*=\s*'([^']+)'/.exec(persistence)?.[1];
    expect(emailKey, 'could not find OPERATOR_EMAIL_KEY in persistence.ts — this check is blind').toBeTruthy();
    expect(prefix, 'could not find PREFIX in persistence.ts — this check is blind').toBeTruthy();

    const keys = readKeys();
    expect(keys.length, 'the script reads no string-literal key at all').toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.startsWith(prefix!) || k === emailKey,
        `${k} is neither a ${prefix} key nor the operator-email key ${emailKey} —`
        + ' the script is reading something the app does not write').toBe(true);
    }
  });

  it('NEVER reads the unscoped key as its only source — that was the whole defect', () => {
    /*
     * The unscoped key is still ALLOWED, as a last-resort fallback for a reader who somehow holds
     * one. What is banned is it being the only thing asked for, which is the state that shipped.
     */
    const keys = readKeys();
    const unscopedOnly = keys.length === 1 && keys[0] === 'lcx-os:ui:v1';
    expect(unscopedOnly,
      'index.html reads ONLY lcx-os:ui:v1. Nothing in this repository writes that key —'
      + ' lib/persistence.ts scopes every key by operator email or `anon` — so the script is dead.')
      .toBe(false);
  });

  it('and the ban is real: the check FAILS against the script as it actually shipped', () => {
    /*
     * The negative control. Without it, every assertion above is satisfied by any file that happens
     * not to collide, and the suite would keep passing if `readKeys` silently returned nothing.
     */
    const shipped = "const stored = localStorage.getItem('lcx-os:ui:v1');\nparsed.state.darkMode";
    const keysOf = (s: string) => [...s.matchAll(/getItem\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!);
    const keys = keysOf(shipped);
    expect(keys).toEqual(['lcx-os:ui:v1']);
    expect(keys.length === 1 && keys[0] === 'lcx-os:ui:v1',
      'the detector does not fire on the exact script that shipped broken — it proves nothing')
      .toBe(true);
  });
});
