#!/usr/bin/env node
/**
 * Perf budget (FINAL_MASTER_PLAN 5.3 / D2) — the ratchet that keeps the win.
 *
 * Fails the build if the JS bundle regresses past budget:
 *  - no single chunk may exceed MAX_CHUNK_KB (guards the 500KB-monolith return)
 *  - the always-loaded set (entry + vendor groups, never lazy) must stay
 *    under MAX_INITIAL_KB — page chunks are excluded since they load on demand
 *
 * Raw (pre-gzip) KB, dependency-free. Run after `vite build`.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CHUNK_KB = 400;
const MAX_INITIAL_KB = 850;

// Chunks fetched on every page load (not code-split by route). These share the
// stable names assigned in vite.config manualChunks + the Vite entry ("index").
const INITIAL_PREFIXES = ['index-', 'vendor-', 'react-vendor-', 'icons-'];

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');

let files;
try {
  files = readdirSync(assets).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`✗ perf budget: no build found at ${assets} — run \`vite build\` first.`);
  process.exit(1);
}

const kb = (f) => statSync(join(assets, f)).size / 1024;
const isInitial = (f) => INITIAL_PREFIXES.some((p) => f.startsWith(p));

const failures = [];

const biggest = files.map((f) => ({ f, size: kb(f) })).sort((a, b) => b.size - a.size)[0];
if (biggest && biggest.size > MAX_CHUNK_KB) {
  failures.push(`largest chunk ${biggest.f} is ${biggest.size.toFixed(0)}KB > ${MAX_CHUNK_KB}KB budget`);
}

const initialKb = files.filter(isInitial).reduce((sum, f) => sum + kb(f), 0);
if (initialKb > MAX_INITIAL_KB) {
  failures.push(`initial bundle ${initialKb.toFixed(0)}KB > ${MAX_INITIAL_KB}KB budget`);
}

const pageChunks = files.filter((f) => !isInitial(f)).length;
console.log(
  `perf budget · initial ${initialKb.toFixed(0)}/${MAX_INITIAL_KB}KB · ` +
    `largest ${biggest ? biggest.size.toFixed(0) : 0}/${MAX_CHUNK_KB}KB · ${pageChunks} lazy page chunks`,
);

if (failures.length) {
  console.error('✗ perf budget exceeded:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('✓ perf budget OK');
