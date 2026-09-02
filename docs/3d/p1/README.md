# P1 · SPINE — the gate result

`3D_WORK_100X.md` §7 defines P1 as **L1 renderer + L2 look + L3 motion**, one sequential
lane, with the gate: *"brand hex exact after tone mapping."* **That half of the gate was measured on
2026-08-14 and it fails — the pipeline moves `#2C6BFF` to `#2c68dc`, ΔE76 18.3. It was also incoherent
as written; see "The first row, retracted" below.** §6 rule 5 was amended to the invariant that does
hold, and this document reports both.

The spine is `packages/gl` (`@lcx/gl`). This directory is its proof: S1's risk cloud,
rebuilt on the package with every line of hand-written WebGL removed, captured headlessly
and compared against P0's plate pixel by pixel.

```bash
node docs/3d/p0/samples.mjs      # the real engine → samples.json
node docs/3d/p1/build.mjs        # bundle + MEASURE each layer against §6.4, and check the tables below
node docs/3d/p1/capture.mjs      # → risk-cloud.png AND refusal.png
node docs/3d/p1/compare.mjs      # → does the spine still reproduce P0?
```

`npm run gl-budget` is wired into `ci-check`, so a layer that overruns fails the build
rather than being noticed later. It **also fails when a byte figure published in this file
or in `docs/3d/w1/README.md` disagrees with a fresh measurement** — because for months a
layer that *did not overrun* still made every published figure wrong, and nothing noticed.

---

## The gate

| gate | required | measured |
|---|---|---|
| ~~Brand hex exact after tone mapping~~ | `#2C6BFF` in, `#2C6BFF` out | **FAILS, and the gate was wrong to ask** — measured `#2c68dc`, blue 35/255 low, ΔE76 **18.3**. See below |
| Order survives the tone map (§6 rule 5, amended 2026-08-14) | monotone per channel, so a denser mark never renders lighter | **holds** — pinned over every ordered channel pair against framebuffer bytes in `packages/gl/src/look/brandPixel.test.ts` |
| **60 fps on M1** | ≤ 16.67 ms/frame | **4.41 ms/frame — 227 fps**, on an actual Apple M1 / 8 GB via ANGLE Metal. 3.8× headroom |
| The spine reproduces P0 | no visible regression | **mean \|Δ\| 0.09/255, max 6/255, 0 channels over 8** of 13,789,500 |
| Every lane inside its §6.4 allocation | no lane over | **all six ✓** — the table below is generated, not stated |
| No WebGL2 is a real state, not a crash | renders something honest | **`refusal.png`** |

### The first row, retracted 2026-08-14

This row read **"exact, whole palette — `assertBrandFidelity()` returns `[]`"**, and it was published
here from the first commit. It was not a measurement of anything the gate asked about.
`assertBrandFidelity()` compares `linearToHex(hexToLinear(BRAND_HEX[k]))` with `BRAND_HEX[k]` — a frozen
constants table round-tripping through two pure functions. It never sees a material, a light, a tone map
or a pixel, so no change to the composite could ever have made it non-empty. Proof it could not fail:
moving `TONE_SHOULDER` from 0.4 to 0.45 — a real change to the curve every surface runs — leaves all 15
assertions in `look.test.ts` green while `brandPixel.test.ts` fails with *"CPU says 216, the GPU wrote
220"*.

What the pipeline does, rendered on a driver and read back (`docs/3d/brand-fidelity.mjs`, recorded in
`docs/3d/brand-fidelity.json`):

| colour | in | out, most favourable case | ΔE76 |
|---|---|---|---|
| `brand` | `#2C6BFF` | `#2c68dc` (blue −35/255) | **18.3** |
| `reference` | `#FF8A3D` | `#dc843c` (red −35/255) | 14.4 |
| `brandBright` | `#7FB2FF` | `#7aa5dc` | 12.7 |

"Most favourable case" means a flat mark at exactly the palette linear value, plate 0, bloom 0 — nothing
between the constant and the framebuffer but the tone map and the sRGB encode. For scale, AgX, which
`packages/gl/src/look/colour.ts` calls badly wrong, is ΔE 41.1. On the lit path every colour lands 46–88
ΔE from its hex, and that is not a defect: a lit material's radiance is base colour × illumination, so
**"hex exact" over a shaded mesh was a category error, not a bug.** The fix that looks obvious is refuted
by arithmetic — brand blue's blue channel is linear 1.0, so a curve pinned there is the identity at 1.0
and leaves zero headroom above it, clipping everything brighter to white.

So §6 rule 5 was amended rather than the pipeline, and the surviving invariant is the row above it.
`assertBrandFidelity()` still runs in every environment and still refuses on a corrupt palette table;
that is the only thing it ever checked.

## The bytes

**Nothing in this table is typed by a human.** It is emitted by `docs/3d/p1/build.mjs` from
the bundler, and `npm run gl-budget` fails if what is committed here disagrees with a fresh
measurement. Regenerate with `node docs/3d/p1/build.mjs --write`; get the same numbers as
JSON with `--json`.

<!-- gl-budget:begin lanes -->
| lane | allocated | measured | |
|---|---|---|---|
| L1 renderer | ≤ 45 KB raw | **12.9 KB** | ✓ |
| L2 look | ≤ 10 KB raw | **6.9 KB** | ✓ |
| L3 motion | ≤ 8 KB raw | **1.7 KB** | ✓ |
| L4 env | ≤ 60 KB raw | **39.0 KB** | ✓ |
| L3.5 particles | ≤ 11 KB raw | **10.9 KB** | ✓ |
| L4.5 field | ≤ 13 KB raw | **9.0 KB** | ✓ |
| **spine total** (all six lanes) | ≤ 147 KB raw | **80.4 KB** | 66.6 KB of the allocation unspent |
| gate bundle — spine + this surface, tree-shaken | — | **24.0 KB** (24567 B) | what this lane actually ships |
| three.js, same job, same settings (P0) | — | 513.3 KB | **6.4× the spine** |
<!-- gl-budget:end lanes -->

That is what the audit of 2026-08-13 fixed. This table previously read **L1 10.4 / L2 5.3 /
L3 1.7 / spine 17.5 KB, "45.5 KB under, and 29× smaller than three.js"** — hand-transcribed
when the spine was *three* lanes. Three more shipped (L4 env, L3.5 particles, L4.5 field)
and every one of those five figures silently became wrong, in a table headed "measured".

### "45 KB" means three different things, so this document never says it unqualified

| the number | what it is | status |
|---|---|---|
| **45 KB** | **L1 renderer's lane allocation** (`3D_WORK_100X.md` §6.4) | live — it is the `L1 renderer` row above |
| **30–45 KB** | the **original whole-engine estimate**, made before L4 / L3.5 / L4.5 existed (`3D_WORK_100X.md:80`) | superseded — six lanes allocate 147 KB |
| **"45 KB unspent"** | the **spine's leftover headroom** back when the spine was L1+L2+L3 against 63 KB | stale, and never a budget — the live figure is the "unspent" cell above |

Invariant 4's "**<45 KB total**" cap is the second reading, and it is unsatisfiable: honouring
it means deleting L4 env, L3.5 particles and L4.5 field — GGX lighting, shadows, AO, DoF, sky,
particles and volumetrics. The two budgets that are real are the per-lane table above and the
initial-JS ceiling enforced by `npm run perf-budget`; `@lcx/gl` contributes **zero** bytes to
initial JS, being dynamically imported in every case.

---

## What is in the spine

```
L1  packages/gl/src/
      stage.ts          context, HDR targets, programs, refusals, depth policy
      math.ts           column-major mat4, projection, screen projection
      primitives/
        points.ts       10k–1M instanced gaussian deposits
        lines.ts        rules, ticks, reference marks, curves
L2  packages/gl/src/look/
      colour.ts         linear working space, brand palette, the data-vs-light rule
      tonemap.ts        Reinhard on the composite ONLY + the fidelity gate
      pipeline.ts       bright pass → separable blur ×4 → composite → one sRGB encode
L3  packages/gl/src/motion/
      index.ts          purposes, reduced motion, and the refusals
```

53 unit tests, all pure. The GPU half cannot be unit tested — jsdom has no WebGL2, and a
`jsdom` suite here would exercise the same refusal path as `node` while *implying* it had
exercised a renderer. So the GPU half is verified by the capture in this directory, which
runs a real driver and produces an image somebody reads.

### The three rules the layers enforce in code rather than in review

1. **A colour that means something is DATA, and data is never graded.** §4.1 measured
   brand blue coming out of AgX as `#467ECF` — a shift of 48 in green, invisible without a
   reference beside it. So the tone map is applied to the composite only, `look.test.ts`
   asserts it appears in exactly one shader, and it asserts the **negative control**: that
   tone-mapping a data colour genuinely does move it. An equality test between two things
   that were never going to differ proves nothing.
2. **Motion carries information or it does not exist.** `MotionPurpose` has four members
   and none of them is "because it looks good". `startMotion` throws at *runtime*, not
   just in the type system, because a purpose can arrive from configuration. Under
   `prefers-reduced-motion` every transition resolves to its **final state** — not a
   shorter animation — and an environment that cannot read the preference defaults to
   reduced rather than inventing consent.
3. **A refusal is a state, not an exception.** `createStage` returns a discriminated
   union, so the fallback is unskippable rather than something to remember.

---

## Frame time — the half of the gate I first shipped without

§7's P1 gate has two conditions: *"brand hex exact after tone mapping; 60fps on M1 proxy."*
The first commit measured the colour half and reported it as though it were the gate. It
was not. This is the other half.

And the colour half was not measured either — it reported `assertBrandFidelity()` returning `[]`, which
is a constants-table round trip with no pixel in it. The real measurement came on 2026-08-14 and the
condition fails; see "The first row, retracted" above. This row is the only one of the two that was ever
measured against the thing it names.

```bash
node docs/3d/p1/serve.mjs        # then open http://127.0.0.1:5599/?perf=120
```

It is not a proxy: the host is an **Apple M1 / 8 GB**, which is the target device.

| batch | ms / frame | frames / sec |
|---:|---:|---:|
| 100 | 0.066 | 15,151 |
| 200 | 0.131 | 7,663 |
| 400 | 3.583 | 279 |
| 800 | 4.353 | 230 |
| **1600** | **4.406** | **227** |

**4.41 ms for a full frame** — 10,000 instanced gaussian deposits, ~30 reference strips, a
bright pass, four separable blurs and a composite, at 3200 × 1480. 60 fps allows 16.67 ms,
so there is **3.8× of headroom**. Setup (sample geometry, the kernel density estimate,
buffer upload, shader compilation) is 26 ms and happens once.

**The first two rows are the point, not noise.** 15,000 fps is not a measurement, it is the
GPU being asked to do work and not yet having done it. Watching that collapse as the batch
grows — and then *converge* between 800 and 1600 to within 1.2% — is the evidence that the
trailing sync is genuinely being paid for. A single number with no convergence curve behind
it would be worth nothing here, because:

**The first version of this harness reported 5,000 fps and I nearly believed it.** It timed
`redraw()` with `performance.now()` around a per-frame `gl.finish()`. Two things make that
meaningless, and both are invisible in the output:

1. Chromium runs WebGL in a **separate GPU process**. `gl.finish()` on the renderer side
   returns once the command buffer is flushed, not once the GPU has finished. It times
   bookkeeping.
2. `performance.now()` is clamped to **100 µs**. A median of exactly 0.1 ms and a minimum
   of exactly 0 are the clamp reporting itself.

`EXT_disjoint_timer_query_webgl2` — the correct instrument — advertises itself as present
and then never resolves a single query: all 120 came back disjoint or unresolved. That is
reported as `UNAVAILABLE` with the reason, rather than quietly dropped or filled in.

The harness also took two attempts to run at all. It first awaited `requestAnimationFrame`
between polls and hung, because the browser pane reported `document.hidden === true` and a
hidden tab fires no animation frames. Switching to `setTimeout(0)` hung for the same reason
one level down — background timers are throttled to about one per second. Anything that
must measure while a page is not foregrounded rules out every cooperative scheduler the
platform offers, so the poll is a busy-wait with a wall-clock deadline.

### The type-check hole this opened

Making the surface measurable meant splitting `renderRiskCloud` into setup and a `redraw()`
— which is better design anyway, since a surface that can only draw once cannot respond to
a data change, resize, or be driven by L3. Adding `docs/3d/p1/tsconfig.json` to check that
work found **three pre-existing type errors on the very first run**: `RenderResult` had no
discriminant, so `if ('kind' in out && out.kind === 'refused')` never narrowed in its `else`
branch and every field access on the success path was unchecked.

`docs/3d/p1/*.ts` had been compiled only by esbuild, which **strips types rather than
checking them**. The reference lane that nine more surfaces get written against had never
been type-checked. It is now in `npm run type-check`.

---

## Two captures, and the second is the one that mattered

`capture.mjs` shoots **both** paths: WebGL2 present, and WebGL2 removed by stubbing
`getContext('webgl2')` to `null` — the shape a locked-down enterprise browser, a
fingerprint blocker, or a dead GPU process actually presents.

**The refusal capture immediately caught a broken fallback.** The first version hid the
canvas on refusal, which collapsed `.stage` to zero height; `.refusal` is `inset: 0` inside
it, so the message rendered into nothing and the page showed a title above a blank gap. It
was a fallback that had never been looked at, and it did not work. It also promised *"the
flat view below shows the same measurements"* on a page that has no flat view — so the
package's refusal text now states only what it knows (what happened, and that the data is
unaffected), and the remedy is stated by the surface, which is the layer that knows whether
one exists.

---

## Chasing a max of 248, and being wrong twice

`compare.mjs` first reported **max |Δ| = 248** — a pixel going from near-black to
near-white. That reads as a broken renderer, and it was not one. The sequence is recorded
because two plausible explanations were checked and both were wrong:

| step | hypothesis | result |
|---|---|---|
| 1 | *Capture noise.* | **Wrong.** `p0/capture.mjs` run twice is bit-identical: mean 0, max 0. The harness has no noise, so the difference was real. |
| 2 | *My exposure-stop conversions were rounded* (`×0.42` written as `2^-1.25`). | **Wrong.** Substituting exact stops changed the number by 0.001. |
| 3 | Profile *where* the differing pixels are. | 233 of 1450 plate rows contain any difference at all, concentrated in rows 1665–1673 — the tick-label row. Every GL row was untouched. |
| 4 | Measure every DOM box in both pages. | Ticks, readout, axis name, stage and canvas: **identical to 0.01 px.** Nothing had moved. |
| 5 | The P1 page is 192 px taller (it prints the L2/L3 policies). Hide that one paragraph. | **max 248 → 6, and zero channels over 8.** |

A taller page rasterizes text on different compositor tiles, so antialiased glyph edges
land differently. That is a fact about Chromium, not about the renderer. `compare.mjs`
therefore hides that paragraph and compares like for like.

The general lesson is the one this repo keeps relearning in new media: **a number is not a
measurement until you have found what would make it different.** Steps 1 and 2 were both
confident and both wrong, and only step 3 — profiling instead of theorising — moved it.

---

## Files

| File | What it is |
|---|---|
| `surface.ts` | S1 rebuilt on `@lcx/gl`. The first L4 lane, written to the contract nine lanes will share: imports from `@lcx/gl` and nowhere else, touches no `WebGL*` symbol, makes no colour decision the palette has not made |
| `entry.ts` | Browser entry — mounts it, prints the readout, renders the refusal |
| `risk-cloud.html` | The page. Type is DOM, positioned by `projectScreen`, so a label cannot drift from the geometry it names |
| `build.mjs` | Bundles, and measures each layer against its §6.4 allocation. Exits non-zero on overrun, and on any published byte figure disagreeing with the measurement. `--write` regenerates them; `--json` emits them machine-readably |
| `capture.mjs` | Both captures — rendered, and refused |
| `compare.mjs` | The regression gate against P0 |
| `perf.ts` | Frame-time harness. Two methods, and it reports when the better one is unavailable rather than filling in |
| `serve.mjs` | Static server, so the page can run on a real GPU instead of SwiftShader |
| `tsconfig.json` | Type-checks the reference lane. It found three errors the moment it existed |
| `bundle.js` | Derived, gitignored. Rebuild with `build.mjs` |
