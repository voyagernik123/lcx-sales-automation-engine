# P0 · PROVE — the gate result

`3D_WORK_100X.md` §7 defines P0 as a **real gate**: measure three.js for real, build a
headless capture harness, spike S1's 10,000-point risk cloud end to end, and *look at
it*. Deliverable: "a real PNG of 10k points, and a byte count. **If the spike is ugly
or slow, the plan changes here.**"

This directory is that gate, and everything in it is reproducible:

```bash
npm run build -w @lcx/shared
node docs/3d/p0/samples.mjs      # runs the real engine → samples.json
node docs/3d/p0/capture.mjs      # headless WebGL2 → risk-cloud.png
node docs/3d/p0/measure.mjs      # the byte figures below; exits non-zero if they drift
```

---

## Verdict: hand-written WebGL2. The plan does not change.

The two byte rows are **generated** — `node docs/3d/p0/measure.mjs --write`. They used to be
hand-typed, and the three.js figure had become load-bearing: `docs/3d/p1/build.mjs` carries the
same byte count and derives its published "× the spine" ratio from it, so the two copies could
disagree with nothing checking. Regenerating also corrected the prototype figure, which had been
measured on a different recipe from the library it was being compared against — see
`measure.mjs`'s header for the three numbers that moved and why.

**This check is not in CI yet, and saying so is the point of a check.** `npm run gl-budget` runs
`docs/3d/p1/build.mjs` only, so it guards p1's lane table and w1's spine line and *not* this
table. Wiring it is one line in the root `package.json` —
`"gl-budget": "node docs/3d/p1/build.mjs && node docs/3d/p0/measure.mjs && node docs/3d/w1/build.mjs"`
— which is not this track's file. Until that lands, run `node docs/3d/p0/measure.mjs` by hand
after any change to `risk-cloud.html` or to `THREEJS_BYTES`.

| Question | Measured | Consequence |
|---|---|---|
<!-- gl-budget:begin p0-verdict -->
| three.js, tree-shaken to what S1 actually needs | **513.3 KB raw** (525,595 B, esbuild, minified, no gzip) — a **pinned** measurement from the P0 gate, held in `docs/3d/p1/build.mjs` and read from there; `three` is not a dependency, so it cannot be re-measured here | **Breaches two budgets at once.** `MAX_CHUNK_KB` is 440; it is 513.3 KB against an initial-JS ceiling of 850; passthrough allows 1152. There is no configuration of the budget that admits it. |
| The hand-written renderer that produced the PNG | **11.1 KB** minified (11410 B; 18.7 KB / 19115 B of source, comments and all) | **46.1× smaller** than the library it replaces, on the same esbuild settings, and it fits inside the existing headroom without touching the budget. |
<!-- gl-budget:end p0-verdict -->
| Headless capture, 10,000 instanced quads + 5 post passes, SwiftShader (no GPU) | **1.9–2.4 s** end to end, cold browser launch included | Fast enough to run per-commit if we choose to. On a real GPU the frame cost is a small fraction of this; the wall-clock here is dominated by Chromium start-up. |
| Does the picture hold up? | See `risk-cloud.png` | Yes — after five passes. The first four did not. See below. |

The byte count is the decisive fact. §8.1 of the plan said that if P0's capture were
not professional we would raise the budget and take three.js. The capture *is*
professional and the library *still* would not fit, so both arms of that fork point
the same way.

---

## What the spike actually renders

10,000 simulated quarters of the open book, from the real `monteCarloForecast` with
`keepSamples`. Each sample is one instanced gaussian deposit. Equal outcomes stack,
and the stack height **is** the probability mass. A kernel density estimate is drawn
over the top, with its bandwidth printed in the legend because a bandwidth is a
modelling choice the data does not make for you.

**The book is deliberately small (26 deals).** A 44-deal book is smoothed into a bell
by the central limit theorem, and a bell is the easy case: it hides the multi-modality
that makes a single reported `p50` misleading, and it lets the renderer off the hook
on the exact problem P0 exists to prove it can solve. The support here is genuinely
discrete and lumpy — a portfolio total is a sum of subsets of a small price ladder —
which is the hard case for any point renderer.

### The pipeline

Everything happens in **linear light**, and sRGB is encoded exactly once, in the final
composite. Additive blending or bloom done in sRGB is the single most common reason
WebGL work looks cheap: the maths is wrong, and the result goes grey and muddy at
exactly the densities you most want to read.

1. **HDR pass** — 10,000 instanced quads into `RGBA16F` (`EXT_color_buffer_float`),
   additive. Density accumulates far past 1.0 and is *kept*.
2. **Bright pass** → **4× separable 9-tap gaussian** at quarter resolution.
3. **Composite** — linear-space background gradient + scene + bloom, Reinhard applied
   to the **composite only** so accumulated density rolls off instead of clipping to
   white, and so a brand hue is never re-graded. `#2C6BFF` is *data*; it is not tone
   mapped.
4. **Type is DOM**, projected through the same matrix. Text baked into a GL texture at
   1× is a classic amateur tell.

### The one randomised quantity

Sample depth (`z`) is a hashed offset. `x` is the exact simulated value and `y` is the
exact rank within its stack — **neither is ever jittered.** Jittering `x` would smooth
the picture by fabricating outcomes the simulation never produced. Depth carries no
data, so spreading samples along it is presentation, not invention.

---

## Five passes. Four of them were wrong.

Recorded because the plan's §4 amateur-tell table was written from theory, and this is
the same list written from a render.

| Pass | What was wrong | Why it matters |
|---|---|---|
| 1 | Hard dot columns; skewed floor slab; a tick label bleeding off the canvas | Read as a glitch, not a distribution |
| 2 | **Solid black frame** | The marker pass rebound attribute 0 *inside the fullscreen-triangle VAO*, so every post-process blit afterwards drew a degenerate triangle. Vertex-array state is per-VAO and corrupting it fails **silently** |
| 3 | Visible lattice/moiré across the cloud; the p10/p50/p90 labels clipped out of the plate entirely | The depth walk was a cosine over `k` — a regular sequence, and a regular sequence on a pixel grid aliases. And the three reported numbers are the entire point of the figure, so losing them is not a cosmetic bug |
| 4 | Tick row pushed off the bottom edge; axis name colliding with it; 76 px stage gutter on the right; cloud bleeding *through* the baseline rule | The tick offset was projected from world space, so its distance from the rule depended on the camera |
| 5 | — | Shipped |

**Pass 2 is the one worth keeping.** A DOM test would have passed it: every draw call
was issued, every uniform was set, no error was thrown, and the frame was black. This
is the `svg-figures-need-looking-at` lesson in a second medium — a passing test proves
the calls happened, not that the image exists. Render it and open it.

---

## Files

| File | What it is |
|---|---|
| `samples.mjs` | Seeded 26-deal book → real `monteCarloForecast` → `samples.json`. Exists so the PNG is reproducible; a capture fed from a loose JSON blob proves nothing a screenshot doesn't |
| `capture.mjs` | Headless Chromium on SwiftShader (no GPU) → `risk-cloud.png` |
| `measure.mjs` | The only place the verdict table's byte figures come from. Measures the prototype live; reads the pinned three.js byte count out of `docs/3d/p1/build.mjs` rather than keeping a second copy of it, and fails if `three` ever becomes installable, because then the pin should be a measurement |
| `risk-cloud.html` | The spike. Becomes the reference implementation that `@lcx/gl` (P1 · L1) is extracted from |
| `risk-cloud.png` | The gate artefact |
| `samples.json` | Generated; regenerate rather than edit |
