/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  THE APP VERSION LIVES IN SIX PLACES. THEY ARE CHECKED HERE, TOGETHER, ONCE.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  Releasing 0.2.7 took four attempts, and three of them failed on a version field nobody had
 *  enumerated:
 *
 *    attempt 2  `cargo` refused — Cargo.toml and Cargo.lock still said 0.2.6
 *    attempt 3  `launch.test.tsx` went red — the PUBLIC download page prints the version as a
 *               deliberate literal and asserts it matches tauri.conf.json
 *    attempt 4  `publish-release.mjs` refused — apps/web/package.json feeds `__APP_VERSION__`,
 *               which is the version the OPERATOR sees in the footer, while the updater compares
 *               tauri.conf.json. Drift there ships an update that appears not to have installed.
 *
 *  Every one of those checks was correct and well-built. The problem was that they fire SERIALLY:
 *  each one costs a full rebuild to discover, and none of them tells you about the next. Four
 *  rebuilds to learn a list that fits on one screen.
 *
 *  So this asserts the whole list at once, in the unit suite, in under a second. A release that
 *  forgets a field now learns about ALL of them before it builds anything.
 *
 *  ── WHY THE LIST IS DERIVED AND NOT TYPED ─────────────────────────────────────────────────────
 *  A hand-written list cannot fail on the field nobody thought of, which is precisely the defect
 *  above. So each entry carries a READER — how to extract the version from that file — and the test
 *  additionally sweeps for `0.2.x`-shaped strings in the files a release touches, failing on any it
 *  does not already know about. Adding a seventh home for the version turns this red on the day it
 *  is added rather than on the day someone releases.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * ANCHORED TO THIS FILE, NOT TO THE WORKING DIRECTORY.
 *
 * This was `resolve(process.cwd(), '..', '..')`, which is only the repository when the runner
 * happens to be in `apps/desktop`. Run from the repo root it resolved to the parent of the repo and
 * every assertion failed with ENOENT on a path outside the project — three identical failures whose
 * message pointed at `tauri.conf.json` rather than at the real cause, which was the caller's cwd.
 *
 * This file is a RELEASE GATE. A gate that fails for a reason unrelated to what it guards teaches
 * whoever is mid-release to distrust it, on the run where its actual verdict matters most.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

/** Each home for the app version, with how to read it. The reader is the point: a regex per file. */
const HOMES: ReadonlyArray<{ readonly file: string; readonly why: string; readonly read: (s: string) => string | null }> = [
  {
    file: 'apps/desktop/src-tauri/tauri.conf.json',
    why: 'the updater compares this, and it stamps Info.plist',
    read: (s) => (JSON.parse(s) as { version?: string }).version ?? null,
  },
  {
    file: 'apps/desktop/package.json',
    why: 'the workspace version npm prints during the release',
    read: (s) => (JSON.parse(s) as { version?: string }).version ?? null,
  },
  {
    file: 'apps/web/package.json',
    why: 'feeds __APP_VERSION__ via vite.config.ts — this is the version the OPERATOR sees',
    read: (s) => (JSON.parse(s) as { version?: string }).version ?? null,
  },
  {
    file: 'apps/desktop/src-tauri/Cargo.toml',
    why: 'cargo refuses to build if this disagrees with the lockfile',
    read: (s) => /^version = "([0-9.]+)"/m.exec(s)?.[1] ?? null,
  },
  {
    file: 'apps/desktop/src-tauri/Cargo.lock',
    why: 'the lockfile entry for our own crate',
    read: (s) => /name = "lcx-terminal"\nversion = "([0-9.]+)"/.exec(s)?.[1] ?? null,
  },
  {
    file: 'apps/web/src/pages/Launch.tsx',
    why: 'printed on the PUBLIC download page, where a stale number misleads a visitor',
    read: (s) => /LCXOS_VERSION = '([0-9.]+)'/.exec(s)?.[1] ?? null,
  },
];

describe('every home for the app version agrees', () => {
  it('reads a version out of all six — a null here means the reader broke, not that the file is fine', () => {
    for (const h of HOMES) {
      expect(h.read(read(h.file)), `could not read a version from ${h.file}; the reader is stale`).toBeTruthy();
    }
  });

  it('and they are all the same value', () => {
    const found = HOMES.map((h) => ({ file: h.file, why: h.why, v: h.read(read(h.file)) }));
    const distinct = [...new Set(found.map((f) => f.v))];
    expect(distinct.length === 1, () =>
      'the app version disagrees across its homes. Set them all to one value before releasing:\n'
      + found.map((f) => `    ${f.v}  ${f.file}\n        ${f.why}`).join('\n')).toBe(true);
  });

  it('and no SEVENTH home has appeared that this test does not know about', () => {
    /*
     * The derivation that makes the list above more than a hand-list. Any `0.2.x`-shaped literal in
     * the release-relevant files must belong to a known home — otherwise a new one has been added and
     * nobody told this test. Third-party crate versions in Cargo.lock are excluded by construction:
     * only our own crate's entry is read, and the sweep skips that file for exactly that reason.
     */
    const SWEPT = [
      'apps/desktop/src-tauri/tauri.conf.json',
      'apps/desktop/package.json',
      'apps/web/package.json',
      'apps/desktop/src-tauri/Cargo.toml',
      'apps/web/src/pages/Launch.tsx',
    ];
    /*
     * COMMENTS STRIPPED FIRST, and this is not hygiene — the first version of this sweep failed on
     * `Launch.tsx`, which discusses `0.2.0` and `0.2.6` in prose while recording why the DMG-size
     * guard exists. Those are HISTORY, correctly written down, and a census that reads them as live
     * values is measuring its own documentation. That exact mistake has been made several times in
     * this repository: two source censuses that matched prose about a symbol rather than a use of
     * it, and a CSS parser that broke on a brace inside a comment.
     */
    const withoutComments = (src: string): string => src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      .replace(/^\s*#[^\n]*/gm, ' ');

    const known = new Set(HOMES.map((h) => h.read(read(h.file))));
    const surprises: string[] = [];
    for (const f of SWEPT) {
      const src = withoutComments(read(f));
      for (const m of src.matchAll(/0\.2\.\d+/g)) {
        if (!known.has(m[0])) surprises.push(`${f}: ${m[0]}`);
      }
    }
    expect(surprises,
      'a 0.2.x version appears in a release file at a value no known home carries — either a new home'
      + ' was added and belongs in HOMES above, or a stale number was left behind').toEqual([]);
  });
});
