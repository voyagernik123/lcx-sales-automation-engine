#!/usr/bin/env node
/**
 * WHAT DOES ONE LANE ACTUALLY DOWNLOAD? — the question `SUBPATH_COST.md` exists to answer, made
 * re-runnable so the answer stops being a figure somebody measured once in a mirror.
 *
 * ── WHY CHUNK-LEVEL ATTRIBUTION GIVES THE WRONG ANSWER, MEASURED ────────────────────
 * The obvious method is to list the chunks a route pulls and add up their bytes. It reports this
 * migration as a REGRESSION. Vite places `useFlatChart.ts` and `SignatureBackdrop.tsx` in the same
 * entry chunk, so while either one still reached the barrel, every byte the other pulled was
 * attributed to both lanes. A number that moves when an unrelated file changes is not measuring the
 * lane.
 *
 * So an `import()` is mapped back through the sourcemap MAPPINGS to the source module whose text it
 * came from, and a chunk counts as GL only when every `sources` entry in its map lies under
 * `packages/gl/src`. Nothing here reads a filename: `lit-*.js` is a name Rollup chose and is free to
 * stop choosing.
 *
 * ── THE HALF STATE IS WORSE THAN EITHER END, AND THIS IS HOW THAT WAS CAUGHT ────────
 * With the four flat adapters migrated and the two backdrops left on the barrel, the sign-in shell
 * measured 18 chunks / 102,832 B against 13 / 100,709 B before — five extra round trips on the first
 * screen a reader ever sees. `SUBPATH_COST.md` section 5 predicted exactly that and its own words are
 * "finish the migration or do not start it". Run this after touching any GL consumer.
 *
 * ── RUNNING THIS CONTAMINATES apps/web/dist FOR A DESKTOP RELEASE ───────────────────
 * It needs `npx vite build --sourcemap`, and a plain `vite build` reads `apps/web/.env.local`,
 * which on a developer machine carries `VITE_API_URL=http://localhost:8791`. The desktop release
 * bundles that same directory, so a build run for THIS measurement leaves an app that would show
 * API DOWN on every machine but the builder's.
 *
 * That is not hypothetical and it is not new: `apps/desktop/scripts/build-gate.mjs` exists because
 * three signed releases already shipped that way, and it overrides the variable for exactly this
 * reason. Running this script AFTER a gated desktop build silently undoes that override — which is
 * how it happened again, on 2026-08-16, and the release gate caught it.
 *
 * SO AFTER RUNNING THIS, RESTORE THE DIST BEFORE ANY DESKTOP BUILD OR RELEASE:
 *   npm run build -w @lcx/desktop        (its beforeBuildCommand re-runs the gate)
 * or, if you only need the web bundle back:
 *   VITE_API_URL=https://lcx-sales-api.onrender.com npm run build -w @lcx/web
 *
 * Usage:  node scripts/lane-closure.mjs            (requires a build with --sourcemap)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(WEB, 'dist/assets');
if (!existsSync(ASSETS)) {
  console.error('\n  no dist/assets — build first, with sourcemaps:\n    npx vite build --sourcemap\n');
  process.exit(2);
}

const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
const maps = new Map();
for (const f of files) {
  const mp = join(ASSETS, `${f}.map`);
  if (existsSync(mp)) {
    try { maps.set(f, JSON.parse(readFileSync(mp, 'utf8'))); } catch { /* unreadable map */ }
  }
}
if (maps.size === 0) {
  console.error('\n  no sourcemaps beside the chunks. Rebuild with: npx vite build --sourcemap\n');
  process.exit(2);
}

/** A chunk is GL when EVERY source it was built from is a gl package module. Derived, not named. */
const isGl = (f) => {
  const m = maps.get(f);
  if (!m || !Array.isArray(m.sources) || m.sources.length === 0) return false;
  return m.sources.every((s) => s.includes('packages/gl/src'));
};

/** Static imports a chunk declares, so a lane's closure includes what its chunks pull in turn. */
const staticDeps = (f) => {
  const body = readFileSync(join(ASSETS, f), 'utf8');
  return [...body.matchAll(/from"\.\/([\w.-]+\.js)"/g)].map((m) => m[1])
    .concat([...body.matchAll(/import"\.\/([\w.-]+\.js)"/g)].map((m) => m[1]));
};

/** Every chunk any module under `owner` dynamically imports, plus their static closure. */
function closureFor(ownerFragment) {
  const seeds = new Set();
  for (const [f, m] of maps) {
    const owns = (m.sources ?? []).some((s) => s.includes(ownerFragment));
    if (!owns) continue;
    const body = readFileSync(join(ASSETS, f), 'utf8');
    for (const d of body.matchAll(/import\("\.\/([\w.-]+\.js)"\)/g)) seeds.add(d[1]);
  }
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f) || !files.includes(f)) continue;
    seen.add(f);
    for (const d of staticDeps(f)) if (!seen.has(d)) queue.push(d);
  }
  const gl = [...seen].filter(isGl).sort();
  const bytes = gl.reduce((n, f) => n + readFileSync(join(ASSETS, f)).length, 0);
  return { chunks: gl, bytes };
}

const LANES = [
  ['flat charts', 'components/charts/gl/'],
  ['sign-in shell', 'components/brand/ForgeBackdrop'],
  ['ambient backdrop', 'components/command/SignatureBackdrop'],
];

console.log('\n  GL CLOSURE PER LANE — chunks reached, and their bytes\n');
for (const [name, frag] of LANES) {
  const { chunks, bytes } = closureFor(frag);
  console.log(`    ${name.padEnd(18)} ${String(chunks.length).padStart(2)} chunks   ${String(bytes).padStart(7)} B`);
  for (const c of chunks) console.log(`        ${c.padEnd(34)} ${String(readFileSync(join(ASSETS, c)).length).padStart(7)} B`);
  console.log('');
}
