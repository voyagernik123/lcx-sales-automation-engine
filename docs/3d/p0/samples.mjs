/**
 * P0 · the sample set the risk cloud renders.
 *
 * This exists so the PNG in this directory is REPRODUCIBLE. A capture harness fed
 * from a loose JSON blob proves nothing a screenshot doesn't — you cannot tell
 * whether the picture came from the engine or from a hand-tuned array that happened
 * to look good. This runs the real `monteCarloForecast` over a seeded open book and
 * writes exactly what the renderer consumes.
 *
 * Requires the shared package to be built:  npm run build -w @lcx/shared
 *
 * Usage:  node docs/3d/p0/samples.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { monteCarloForecast } from '../../../packages/shared/dist/forecast/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* Same PRNG the engine uses, so the BOOK is as reproducible as the simulation over
   it. Two different generators would make the book the one unpinned input. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A plausible open book: 26 deals, weighted toward the early stages the way a real
   funnel is, priced on the published package ladder. The lumpy discrete support the
   renderer has to cope with is a CONSEQUENCE of this ladder — a portfolio total is a
   sum of subsets of a small set of prices — not something the picture invents.
   The book is deliberately SMALL. A 44-deal book is smoothed into a bell by the
   central limit theorem, and a bell is the easy case: it hides the multi-modality
   that makes "p50 = $332k" misleading, and it lets the renderer off the hook on the
   exact problem P0 exists to prove it can solve. A 26-deal quarter is also the
   honest shape of the pipeline this product actually reports on. */
const STAGES = [
  ['not_started', 0.24],
  ['contacted', 0.26],
  ['discovery', 0.22],
  ['proposal', 0.18],
  ['negotiating', 0.1],
];
const LADDER_CENTS = [800_000, 1_500_000, 2_400_000, 3_600_000, 5_000_000, 9_500_000];

const rnd = mulberry32(20260808);
const pick = (weighted) => {
  let r = rnd();
  for (const [v, w] of weighted) {
    r -= w;
    if (r <= 0) return v;
  }
  return weighted[weighted.length - 1][0];
};

const deals = Array.from({ length: 26 }, (_, i) => ({
  id: `deal-${String(i + 1).padStart(2, '0')}`,
  stage: pick(STAGES),
  packageValueCents: LADDER_CENTS[Math.floor(rnd() * LADDER_CENTS.length)],
  priorityScore: Math.floor(rnd() * 40),
  daysSinceUpdate: Math.floor(rnd() * 45),
}));

const res = monteCarloForecast(deals, { runs: 10_000, seed: 42, keepSamples: true });

if (!res.samples) throw new Error('engine returned no samples — keepSamples ignored?');
if (res.p50Cents == null) throw new Error(`engine refused: ${res.distributionRefusal?.code}`);

const out = {
  samples: [...res.samples],
  p10: res.p10Cents,
  p50: res.p50Cents,
  p90: res.p90Cents,
  runs: res.runs,
  deals: deals.length,
};
writeFileSync(resolve(HERE, 'samples.json'), JSON.stringify(out));

const distinct = new Set(out.samples).size;
console.log(
  `  ${out.samples.length.toLocaleString()} samples · ${distinct} distinct · ` +
    `p50 $${Math.round(out.p50 / 100_000)}k · max $${Math.round(out.samples[out.samples.length - 1] / 100_000)}k`,
);
