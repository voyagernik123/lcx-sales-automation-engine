# The SVG / GL threshold — measured, and it is not the threshold anyone was looking for

> **What this closes.** `PLATFORM_VFX_100X.md:139-141` says L5 needs "a size/complexity threshold
> below which SVG is simply correct, and that threshold has to be measured, not guessed." It was
> never measured. This measures it.
>
> **Why now.** §4.4 of `3D_VFX_FINAL_PLAN.md` asks whether `TrendDelta`, the last un-GL-backed
> primitive, should be GL-backed. That question has no honest answer without this threshold.
>
> **The instrument.** `docs/3d/svg-gl-bench.mjs`, run 2026-08-13 on **ANGLE Metal Renderer:
> Apple M1**, headed Chromium, `dpr 2`, `EXT_color_buffer_float` present. Every millisecond here
> came out of that run except the blit term, which is imported from the sibling instrument
> `docs/3d/blit-cost.mjs` because **my own measurement of the blit was wrong and is withdrawn —
> see §3.1.** Nothing is estimated.
>
> **The short version.** The threshold is not a primitive count and not a filled area — cost does
> not track either. It is two gates: a mark's **lit-axis extent in device pixels** (≥ 20), and the
> primitive's **draw-call order** (O(1), or O(n) with n bounded by legibility) — plus a page-level
> budget. Applied to the eleven primitives it says **eight should be GL-backed, two should be SVG,
> and the eleventh is not a chart at all.** Two of the ten then GL-backed — `Sparkline` and
> `ControlBand` — fail it, and `TrendDelta`, the one §4.4 wants to add, cannot pass it because it
> has no marks.
>
> **ACTED ON — see §9.** Both verdicts were re-verified from source and then measured, and both
> hold. The GL path is gone from `Sparkline` and `ControlBand`; `charts/gl/FlatBand.tsx` is
> deleted and `FlatLine`'s polyline path with it. **Layer 5 is now 8 GL-backed primitives, all
> eight above the floor, and the count "10 of 13 charts re-backed" is retired.** §9 carries the
> ink measurement (**56.8 %**, both arms rasterised), the draw-call count (**55, and invariant to
> the data**), the budget delta (**−100 B of initial JS, which refutes the reclaim this was
> expected to produce** — and −5,278 B of total JS), the enforcement test, and two corrections to
> this document's own §4 and §7.4.

---

## 1 · What the hand exclusion actually was

The exclusion at `apps/web/src/components/charts/gl/FlatBand.tsx:12-22` (committed `38c01b1`) is
not a chart. It is **one mark inside one chart**: `ControlBand`'s lo–hi envelope, a 14 %-opacity
tint between two different polylines. Two reasons are given, and **both are correct**:

1. **`createStrokeBatch.area` cannot express the shape.** Its signature is
   `area(mvp, points, baselineY, s)` — `baselineY` is a **scalar** (`flat/strokes.ts:63`), so the
   region's lower edge is a horizontal line. `ControlBand`'s lower edge is the `lo` *series*.
   Flattening it would be a change to a number, not to a fill. Verified against the source.
2. **An additive pass writes full coverage into alpha.** The stroke fragment stage emits
   `frag = vec4(uColour * uGain * shade * a, a)` where `a = edge * fade`; an area is emitted with
   `soft = 0`, so `edge = 1`, and with `uFade` unset `fade = 1`. Alpha is therefore **1 across the
   whole envelope**, and the composite's transparent branch passes `sceneT.a` straight through. A
   correctly-shaped envelope would land on the card as a solid block of hue, not a 14 % wash.
   Verified against the source.

`Sparkline` declined its own 10 % area wash for reason (2) alone, and its `<polygon opacity={0.1}>`
is consequently the one mark in that component **not** gated on `glRefused` — it draws on both
paths. Also verified.

### The finding that matters here

Reason (2) is a property of **the pipeline's alpha policy**, not of the envelope. Applied
consistently it excludes *every* translucent fill this kit draws, which is exactly what happened:
both known washes — `ControlBand`'s band and `Sparkline`'s area — are excluded, by the same
argument, in two different files.

And then the inversion:

> **The excluded mark is the only mark in `ControlBand` that the GL layer could have helped.**

The envelope is a large filled region — hundreds of device pixels across. The two marks the layer
*did* take are hairlines at **5.2 device px**, which is below every resolution floor in §4. The
hand exclusion removed the mark GL was good at and kept the two it is not. That is not a criticism
of the exclusion, which is right on its own terms; it is the reason a threshold was needed and the
reason its absence cost something real.

---

## 2 · The real cost structure of the GL path, per chart, from the code

Counted from `flat/shared.ts`, `stage.ts`, `look/pipeline.ts`, `flat/bars.ts`, `flat/strokes.ts`
and `charts/gl/useFlatChart.ts` at `38c01b1`. This is what one `sharedRenderer().render()` does.

### Fixed — independent of how many primitives the chart has

| # | what | detail |
|---|---|---|
| 1 | shared-context lookup | `sharedRenderer()` — a singleton truthiness check. Free. |
| 2 | offscreen canvas grow | `canvas.width/height = max(...)`. Grow-only, so the allocation is once per session — but the blit in row 9 is sized by the **resulting buffer**, so one large chart raises the per-frame cost of every small one for the rest of the session. See §3.1. |
| 3 | **`stage.setRegion(w,h)`** | Early-returns on an unchanged size. Otherwise **deletes 3 textures + 3 framebuffers and creates 3 + 3**, with **3 `checkFramebufferStatus` driver round-trips**. Per chart, per frame. |
| 4 | viewport / scissor set | `gl.viewport`, `gl.scissor`, `gl.enable(SCISSOR_TEST)` — 3 state calls. |
| 5 | scene bind + clear | `bindTarget(scene)` + `clearColor` + `clear` — one full-region clear. |
| 6 | blend state | `beginAdditive` / `endPass`. |
| 7 | **the post chain — 6 full-screen passes** | 1 bright at `⌈w/4⌉×⌈h/4⌉`; **4 blur passes** at the same resolution, **9 texture fetches per fragment**; 1 composite at full `w×h` with 2 fetches, tone map and sRGB encode. |
| 8 | **17 `gl.getUniformLocation` calls** | Every frame. 2 in the bright pass, 2 per blur step × 4, 7 in the composite. None cached. |
| 9 | the blit out | `target.getContext('2d')` + `clearRect(w,h)` + `drawImage` of `w×h` from the WebGL canvas into a 2-D canvas. |
| 10 | **3 leaked `WebGLProgram`s per chart instance** | `createPipeline` compiles 3 programs via `stage.compile`, which pushes each into the Stage's `programs[]`. `pipeline.dispose()` is a documented no-op. Every component's unmount cleanup disposes only its *batch*. `stage.dispose()` is reached only from `resetSharedRenderer()`, a test seam. See §6.4. |

Fill, in device pixels, if the frame were fill-bound: `1·A` clear + `5·A/16` bloom chain + `1·A`
composite ≈ **2.31·A fragments** and `A/16 + 36A/16 + 2A` ≈ **4.31·A texture fetches**, plus the
`A`-read/`A`-write of the blit. **It is not fill-bound — see §3.2.**

### Per-primitive — the part that scales with N

| batch | draw calls for N primitives | per-call work | fill |
|---|---|---|---|
| `createBarBatch` (`FlatBars`, `FlatTrack`) | **2, for any N** — `drawArraysInstanced` once for the contact quads and once for the bars | 2 `bufferData` of `4N` + `3N` floats; ~12 uniform sets total | Σ mark area **+ N · 1.076 · T²** of contact quad |
| `createStrokeBatch.polyline` | **1 per polyline** | one `new Float32Array(6n)`, a CPU mitred-normal loop, one `bufferData`, 6 uniform sets | ribbon area |
| `createStrokeBatch.arc` | **1 per arc** | segment count from arc length: `max(6, ⌈(sweep/2π)·128·max(0.35, rOuter)⌉)` | annulus sector |

The contact quad's `1.076·T²` is worth pausing on: it is **quadratic in the bar's thickness**, so a
chart with few thick bars pays far more shadow fill than one with many thin bars. At 2 columns in a
480-unit viewBox the two quads cover ~62 000 viewBox² against a 105 600 frame — 58 % of the chart,
in shadow alone. At 1 column they cover **2.35× the whole frame** and are clipped away. This is
measured in §3.4 and it is the reason a naive sweep looks like noise.

### And the transition multiplier

`useFlatChart`'s default `entranceMs` is **420 ms** — about **25 frames** at 60 Hz — and nine of
the ten GL-backed charts take that default. Only `FlatBand` passes `entranceMs: 0`. So everything
above is paid **25 times on mount**, and again for `updateMs` (260 ms ≈ 16 frames) on every data
change. Under `prefers-reduced-motion` it is paid **once**.

---

## 3 · What it actually costs — measured

All figures ms per chart per frame, min of 3 batches of 400 renders. `performance.now()` in
Chromium is clamped to 100 µs, so single-frame timing cannot resolve this work at all; the first
version of the instrument reported `0.00` for six of ten cells and would have "proved" the post
chain free. See the note in `svg-gl-bench.mjs`.

| chart cell | device px | draw calls | **submit** | ~~blit~~ ✗ | **blur chain** | **realloc** | **SVG marks** |
|---|---|---|---|---|---|---|---|
| Sparkline | 10 752 | 2 | 0.120 | 0.001 | 0.141 | 0.248 | 0.018 |
| ControlBand | 384 000 | 55 | **0.744** | 0.001 | 0.220 | 0.256 | 0.057 |
| GaugeChart | 245 760 | 2 | 0.028 | 0.001 | 0.163 | 0.250 | 0.010 |
| DonutChart | 102 400 | 5 | 0.039 | 0.001 | 0.232 | 0.240 | 0.016 |
| StackedBarH | 38 400 | 2 | 0.028 | 0.001 | 0.141 | 0.239 | 0.010 |
| BarChartH | 299 520 | 2 | 0.024 | 0.001 | 0.147 | 0.251 | 0.012 |
| FunnelChart | 384 000 | 2 | 0.026 | 0.001 | 0.151 | 0.252 | 0.013 |
| ColumnChart | 422 400 | 2 | 0.035 | 0.001 | 0.158 | 0.250 | 0.020 |
| ColumnChart, 40 cols | 422 400 | 2 | 0.052 | 0.001 | 0.152 | 0.269 | 0.071 |
| Histogram, 120 bins | 422 400 | 2 | 0.065 | 0.001 | 0.154 | 0.266 | 0.210 |

Read the columns precisely, because they are not additive:

- **submit** — wall time to submit one frame's commands. WebGL is queued, so `gl.finish()` after
  600 frames added nothing measurable to any cell: at one chart the GPU is never the bottleneck.
- ~~**blit alone**~~ — **withdrawn, §3.1.** These are the two 2-D calls timed by themselves, but
  `drawImage` into a 2-D canvas is lazily executed and nothing in this run forced it to land, so
  0.001 ms is the cost of issuing the call and not of the copy. The real figure is **0.467–0.643 ms**
  from `docs/3d/blit-cost.mjs`. The column is left in, struck through, because a plausible wrong
  number is worth keeping visible next to the reason it was wrong.
- **blur chain** — the four blur passes, isolated under a forced flush. It is a **GPU** cost that
  overlaps with the next frame's submission at low chart counts, which is why it can exceed the
  submit figure without contradicting it.
- **realloc** — one `setRegion` at a size it has not just seen.

### 3.1 · The blit is NOT free — and my own measurement of it was wrong

**Withdrawn.** The `blit alone` column above reads 0.001 ms at every cell size, and I published
that as vindication of `flat/shared.ts:18-21`, which justifies the whole blit-instead-of-page-canvas
architecture by asserting the copy is "a rounding error against a frame that already runs five
post-process passes."

`docs/3d/blit-cost.mjs` — a sibling instrument written concurrently, pointed at exactly this
question — measures the same copy on the same machine class at **0.467 / 0.643 ms**, about what the
whole rest of the chart frame costs. **Its number is the right one and mine is not**, for a reason
worth stating because it is the same class of error this document catches elsewhere:

> `drawImage` into a 2-D canvas is **lazily executed**. `gl.finish()` drains the **WebGL** command
> queue; it does not force the destination 2-D canvas to realise the copy. So my figure is the cost
> of *issuing* the call, not of the copy landing. The sibling instrument ends each batch with a
> 1-pixel `getImageData` on the destination — which cannot return until pending copies have been
> applied — and pays it in **both** arms so the call overhead cancels. That is the forcing function
> my run does not have.

`blit-cost.mjs` also settles something my §2 got wrong. I recorded the offscreen canvas grow as
"grow-only, so at most once per session" and therefore free. Its buffer sweep, at a **fixed** chart
rect of 480×160:

| shared buffer | blit |
|---|---|
| 1024 × 512 | 0.467 / 0.643 ms |
| 2400 × 920 | 1.083 / 1.373 ms |
| 3200 × 1600 | 1.988 / 2.368 ms |

**The copy is sized by the BUFFER, not by the chart's rect.** Since `shared.ts` grows the buffer to
the largest chart that ever asks and never shrinks it, **one large chart makes every sparkline on the
page pay for it, for the rest of the session.** That is a live cost, it is in the architecture's
central trade, and neither of us would have found it from reading.

Two conclusions, and I am keeping both:

- The **structural** half of `shared.ts:18-21` holds: one copy per chart, flat in chart count.
- The word **"rounding error" does not.** Every per-frame figure in the tables above therefore has
  a `+~0.5 ms` blit term that my instrument could not see, and §3.6 below is recomputed with it.

### 3.2 · Cost does not track area. My own derivation's cost arm was wrong

The 10 752-pixel `Sparkline` cell costs **0.120 ms**. The 422 400-pixel `ColumnChart` cell costs
**0.035 ms**. **39× the pixels, 3.4× less time.**

The fill-rate derivation in §2 — 2.31·A fragments, 4.31·A fetches — is arithmetically right and
predictively useless *for the marks and the post chain*. What that work costs is driver calls, and
what drives driver calls is the **draw-call count**.

**The qualification §3.1 forces:** the frame's *other* term, the blit, does scale with area — but
with the **shared buffer's** area, not the chart's. So the correct statement is that **a chart's own
size predicts nothing**, and the two things that do are its draw-call count and the size of the
largest chart anywhere on the page.

A fit across the bars cells: `submit ≈ 0.024 + 0.00036·N` ms. Across the stroke cells the per-call
cost is an order of magnitude larger. That is the whole cost model, and area is not in it.

> This is the second time a plausible derivation about this renderer has been wrong in this repo
> (`3D_VFX_FINAL_PLAN.md` §6.5 counts five). The correction is that the derivation is published
> next to the measurement that refutes it, rather than quietly replaced.

### 3.3 · The `setRegion` reallocation is the largest per-chart cost, and it is avoidable

**0.24–0.27 ms** in isolation — **4× to 10× the entire render it precedes.**

`setRegion` compares for equality and early-returns, so this is a **cliff, not a slope**: a page of
identically-sized charts pays it once for the whole page; a page of differently-sized charts pays it
per chart per frame. Measured, K charts of 960×440 in one frame:

| charts | canvas backing store | all the same size | each a different size | penalty |
|---|---|---|---|---|
| 4 | 6 MB | 0.222 ms | 10.070 ms | **45×** |
| 12 | 19 MB | 0.640 ms | **29.942 ms** | **47×** |
| 30 | 48 MB | 28.760 ms | 74.078 ms | 2.6× |
| 60 | 97 MB | 81.535 ms | 145.605 ms | 1.8× |

Per chart, the 12-chart varied case costs `(29.942 − 0.640)/12 = 2.44 ms` — an order of magnitude
worse than the isolated 0.25 ms, because twelve distinct sizes defeat whatever reuse the driver
manages between two alternating ones. **Twelve differently-sized charts miss a 16.7 ms frame by
1.8×.** Twelve identical ones use 3.8 % of it.

The 30- and 60-chart rows stop rising monotonically in the penalty column. That is the tell that
they have left the render-bound regime and become **memory-bound**: 60 targets at 960×440 RGBA is
97 MB of GPU-resident canvas before a single chart has drawn, on the 8 GB machine
`PLATFORM_VFX_100X.md` §7.3 names. Those two rows are not per-chart render costs and must not be
quoted as such.

> §7.3 predicted that sixty charts on a dashboard would break. **It does break** — 81.5 ms/frame,
> 12 fps, with every chart the same size. But it breaks on **canvas backing store**, not on GL
> context exhaustion. The shared-context design solved the failure it was built for. The failure
> that remains is one nobody costed.

### 3.4 · The primitive-count sweep — bars are flat, strokes are not

Total mark area held roughly constant at 480×220 (dpr 2), so only the draw-call count varies:

| N | bars | bars, contact off | stroke |
|---|---|---|---|
| 2 | 1.069 | 0.837 | 0.929 |
| 4 | 0.948 | 0.824 | 1.233 |
| 8 | 0.709 | 0.699 | 0.955 |
| 16 | 0.494 | 0.598 | 1.437 |
| 32 | 0.391 | 0.745 | 1.411 |
| 64 | 0.252 | 0.721 | 1.414 |
| 120 | 0.096 | 0.648 | 1.438 |
| 240 | 0.195 | 0.208 | 1.717 |
| 480 | 0.337 | 0.314 | **3.180** |

Three things, and one caveat:

- **Bars cost *falls* as N rises**, and it is not noise. The contact shadow's total area is
  `N · 1.076 · (480/N)² = 1.076 · 480²/N` — it scales as **1/N**. Turning contact off flattens the
  curve, which is the control that proves it.
- **Bars with contact off are flat** from N = 2 to N = 120 (0.837 → 0.648). Two instanced draw
  calls for any N, exactly as `bars.ts` implies.
- **Strokes rise**, 0.929 → 3.180 from N = 2 to N = 480. One `bufferData` + one `drawArrays` +
  6 uniform sets per call, and it shows.
- *Caveat:* `thickness = max(1, 480/n − 2)` clamps at n ≥ 240, so the marks collapse there and the
  last two rows are not area-matched. N = 1 is discarded as warm-up contaminated — bars measured
  0.027 with contact and 0.311 without, which cannot both be true.

**A primitive-count threshold therefore cannot exist for bars and does exist for strokes.** That is
Gate B in §4.

### 3.5 · What SVG costs

SVG is retained mode, so the honest unit is not a frame but **a change**. Measured, per transition
frame, mutating N marks' geometry and forcing style + layout:

`svg ≈ 0.008 + 0.0017·N` ms — a clean linear fit across 2 → 120 marks (0.010 at N=2, 0.020 at N=8,
0.071 at N=40, 0.210 at N=120).

Three properties that matter and that no timing shows:

- **On screen and unchanged it costs nothing.** No frame, no submission, no GPU work. The GL path
  has the same property once its entrance lands — the 2-D canvas holds the blitted image — so
  steady state is free on both sides and the entire comparison lives in the transition.
- **It costs *layout* to change.** The 0.0017 ms/mark above is Blink recomputing style and geometry
  per node, which is why it is linear in node count where the GL bars path is not.
- **Node count is larger than mark count in every real component.** The measured column above is
  marks only, so it is a **lower bound**: the shipped `ColumnChart` also carries a `<g>+<line>+
  <text>` triple per tick and a `<g>`, a value `<text>`, a label `<text>` and a hit `<rect>` per
  column; `BarChartH` carries 5 nodes per row. The GL layer removes exactly one node per mark —
  the fill — and leaves every other node in place, because text, tooltips, hit targets and the
  accessibility tree live in that SVG.

### 3.6 · One transition, both paths

GL pays its cost 25 times (the 420 ms entrance); the SVG kit does not animate, so it pays once.
Each GL frame is `submit + blit`, with the blit taken as **0.5 ms** from `blit-cost.mjs` at the
1024×512 shared buffer this run produced, plus one `setRegion` reallocation.

| chart | GL per frame | GL, whole transition | SVG, 1 change | GL is |
|---|---|---|---|---|
| BarChartH (6) | 0.52 ms | 25 × → **13.35 ms** | 0.012 ms | 1100× |
| ColumnChart (8) | 0.54 ms | 25 × → **13.63 ms** | 0.020 ms | 680× |
| Histogram (120) | 0.57 ms | 25 × → **14.39 ms** | 0.210 ms | 69× |
| ControlBand (55 dashes) — entrance | 1.24 ms | 1 × → 1.50 ms † | 0.057 ms | 26× |
| ControlBand (55 dashes) — **update** | 1.24 ms | 16 × → **19.90 ms** † | 0.057 ms | **349×** |

† `FlatBand` is the one layer that passes `entranceMs: 0`, so `ControlBand`'s entrance is a single
frame. It does **not** pass `updateMs: 0`, and `useFlatChart` defaults that to 260 ms — so a data
change runs ~16 animation frames while `FlatBand`'s `draw` ignores `t` entirely (its signature is
`(stage: Stage) => void`). Every one of those 16 frames paints the **identical picture**. Declining
the tween in the draw without declining it in the hook is how a chart that deliberately has no
motion still pays for sixteen frames of it.

Two things fall out, and the second is the one that sets Gate C:

- **GL is always more expensive per transition**, by 69× to 1100×. There is no crossover and there
  was never going to be one: the SVG is already on screen. So the threshold is not a cost
  comparison — it is a value-per-cost floor plus a page budget. Which is §4.
- **The per-frame figure is ~0.52 ms and it is dominated by the blit**, which is the same for every
  chart on a page because it is sized by the shared buffer. `16.7 / 0.52 ≈ 32` charts would saturate
  a frame on arithmetic alone; the measured ceiling in §3.3 is lower still, at between 12 and 30,
  because memory arrives first.

## 4 · The threshold

### It is not what §7.2 asked for

`PLATFORM_VFX_100X.md` §7.2 asks for "a size/complexity threshold below which SVG is simply
correct", and reasons from size: *a 40 px sparkline in a table cell must never take a GL context.*

**Size is the wrong variable, and the guess is right for the wrong reason.** Small charts are
*cheap* here — cost tracks draw calls, not pixels (§3.2), and the 40 px sparkline's whole frame is
10 752 device pixels. What is wrong with a GL sparkline is that at that size the layer draws
**nothing a reader can see**, and for a stroke it draws **less ink than the SVG it replaces**.

### Gate A · VALUE — the mark's lit-axis extent, in device pixels

Every visual difference the GL layer makes is **proportional to the mark**, so the criterion is a
length. Define **L** = the mark's extent in device pixels along the axis the shading varies on:

| primitive | L is | why, from the shader |
|---|---|---|
| vertical bars | column **height** | `float t = uHorizontal > 0.5 ? vUV.x : vy;` — a vertical bar shades along y |
| horizontal bars | bar **length** | the same line — a horizontal bar shades along **x**, not across its thickness |
| arcs | band **thickness** (`rOuter − rInner`) | `vAcross` runs +1 outer to −1 inner and is the only varying input |
| polylines | **2 · halfWidth** | same `vAcross`, across the ribbon |

Then, from the two constants in `flat/bars.ts`:

- The lit edge is `smoothstep(0.10, 0.0, t)` — **the first 10 % of L**. It **exists** when
  `0.10·L ≥ 1`, i.e. **L ≥ 10 device px**. It **reads as an edge** rather than one lighter pixel row
  when `0.10·L ≥ 2`, i.e. **L ≥ 20 device px**.
- The contact shadow extends `0.48·T` beyond the mark's base, where T is the mark's thickness. Two
  visible pixels of shadow need **T ≥ 4.2 device px**; a readable falloff needs **T ≥ 8.4**.
- The modelling ramp `1 − m·t²` shares L with the lit edge.
- The analytic AA feather is **exactly one device pixel at every size**, and SVG's rasteriser
  supplies the same thing for free. **It is not a differentiator.**

> ### CORRECTION (§9) · the lit-edge constant is not in the branch a ribbon takes
>
> The four bullets above are the constants a **bars** or **track** mark meets, and the first of
> them does not reach a polyline at all. `smoothstep(0.10, 0.0, edgeT)` is at `flat/bars.ts:133`;
> `flat/strokes.ts` has no lit-edge term. Its whole fragment stage is
> `edge = uSoft > 0.0 ? smoothstep(1.0, 1.0 - uSoft, abs(vAcross)) : 1.0`,
> `shade = 1.0 - uModelling * vAcross * vAcross`, `fade`, and `a = edge * fade`. A ribbon
> therefore gets **a feather and a quadratic cross-stroke ramp, and no lit edge and no contact
> shadow** — so "10 % of L is sub-pixel" was the right verdict reached through the wrong branch.
>
> **The corrected argument is stronger, not weaker.** At `uSoft = 1` the feather spans the ribbon's
> ENTIRE width, so there is no opaque core to put a highlight beside; and the SVG rasteriser
> already supplies the one-pixel feather. Of everything the GL layer could contribute to a
> sparkline, three terms are not in this code path and the fourth — bloom — is switched off by
> `FlatLine` on purpose. Nothing is left but the ink deficit below.
>
> This is the third derivation about this renderer that was right about the maths and wrong about
> which branch the shipping material takes (`3D_VFX_FINAL_PLAN.md` §6.5 counts the others). The
> rule it re-earns: **trace the path before asserting an effect.**

> **Gate A: GL requires L ≥ 20 device px. Between 10 and 20 it is marginal. Below 10 the GL layer's
> only remaining difference from the SVG is a feather the SVG already has.**

**For polylines, below the gate it is worse than neutral.** `polyline` is emitted with `uSoft = 1`,
so `edge = smoothstep(1, 0, |vAcross|)` spans the *whole* ribbon — there is no opaque core. The
integrated coverage is `∫₋₁¹ smoothstep(1,0,|x|) dx = 1.0` in `across` units, and `across` spans
`2·halfWidth` of physical width, so the **effective ink width is exactly `halfWidth`**. Against an
SVG `strokeWidth = 2·halfWidth`, the GL ribbon delivers **half the ink**.

`ControlBand` found this by looking and compensated — `HALF = 1.3` for a 2-unit stroke, with a note
saying a ribbon at exactly half the stroke width "renders visibly thinner than the line it
replaces". **`Sparkline` uses `halfWidth: 1.15` against the identical `strokeWidth={2}` and did not
get the correction.** And the captures show 1.3 was not enough either — see §6.1.

### Gate B · COST — draw-call order

From §3.4: bars are `drawArraysInstanced`, **2 calls for any N**, and measurably flat. Strokes and
arcs are **one call each**, and measurably linear.

> **Gate B: GL requires the primitive to issue O(1) draw calls, or O(n) where n is bounded by
> legibility rather than by a rendering detail.**

The distinction is load-bearing. `DonutChart` issues one call per slice — O(n) — and passes, because
a donut past about eight slices is unreadable, so n is bounded by the reader. `ControlBand` issues
one call **per dash**: `dashRuns(pts, 5, 3, 1)` splits the `actual` series on an 8-unit period over
a 426-unit plot, so **one series becomes ~54 draw calls**. That n is bounded by the dash pattern,
not by legibility, and it measures **0.744 ms — 21× the 8-column `ColumnChart` at the same frame
size**.

### Gate C · PAGE — the affordability budget, dated and machine-specific

From §3.3:

> **≤ 12 GL-backed charts per page, and all of them at the same device-pixel size.**
>
> 12 identical: 0.640 ms/frame (3.8 % of budget). 12 varied: **29.942 ms/frame — misses.**
> 30 identical: 28.760 ms and already memory-bound. 60 identical: 81.5 ms, 97 MB, 12 fps.
>
> *M1/8 GB, 2026-08-13. Gate C is the only one of the three that moves with the machine, which is
> why it carries a date and the other two do not. M2/M3 are unmeasured, as everything else in this
> programme is.*

Gate A gates **value** and cannot be bought with a faster machine. Gate B is a property of the
primitive. Gate C is the one an owner can trade.

---

## 5 · The eleven primitives

`L` is at `dpr 2`, marks at 60 % of their track, and a card rendering the 480-unit viewBox at
480 CSS px. `Sparkline` and `DonutChart` set fixed pixel sizes and do not scale with the card.

| # | primitive | GL layer | L (device px) | Gate A | draw calls | Gate B | **threshold says** | ships as |
|---|---|---|---|---|---|---|---|---|
| 1 | **BarChartH** | FlatBars | 576 (bar length) | ✅ | 2 | ✅ | **GL** | GL ✅ |
| 2 | **ColumnChart** | FlatBars | 220.8 (col height) | ✅ | 2 | ✅ | **GL** | GL ✅ |
| 3 | **CompareBars** | FlatBars | 220.8 † | ✅ | 2 | ✅ | **GL** | GL ✅ |
| 4 | **Histogram** | FlatBars | 220.8 ‡ | ✅ | 2 | ✅ | **GL** | GL ✅ |
| 5 | **StackedBarH** | FlatTrack | 576 (segment width) | ✅ | 2 | ✅ | **GL** | GL ✅ |
| 6 | **FunnelChart** | FlatBars | 576 (bar length) | ✅ | 2 | ✅ | **GL** | GL ✅ |
| 7 | **GaugeChart** | FlatDial | 52.0 (band thickness) | ✅ | 2 | ✅ | **GL** | GL ✅ |
| 8 | **DonutChart** | FlatLine | 44.0 (band thickness) | ✅ | 1/slice, n ≤ ~8 | ✅ | **GL** | GL ✅ |
| 9 | **Sparkline** | ~~FlatLine~~ | **4.6** (2 · 1.15) | ❌ | 2 | ✅ | **SVG** | SVG ✅ *(§9)* |
| 10 | **ControlBand** | ~~FlatBand~~ | **5.2** (2 · 1.3) | ❌ | **55** | ❌ | **SVG** | SVG ✅ *(§9)* |
| 11 | **TrendDelta** | — | **no marks** | n/a | 0 | n/a | **DOM, by rule 4** | DOM ✅ |

The `ships as` column was `GL ✗` for rows 9 and 10 when this table was written. **Both were changed
to SVG in §9**, so the eight rows above them are now the whole of the GL-backed kit, and every one
of them clears the floor. `ControlBand`'s draw-call figure is no longer a `~` — it was counted.

† `CompareBars` uses the same `FlatBars` path and the same plot geometry as `ColumnChart`
(`colW = max(4, min(24, band − 10))`, same `plotH`), so its L is `ColumnChart`'s. Derived by
identity, not separately measured.
‡ `Histogram` passes on its modal bins. Its `colW = max(1, min(24, band − 1))` floor means the
*cross*-axis can reach 1 viewBox unit = 2 device px, at which the contact shadow's `0.48·T` is
0.96 px and vanishes; and a tail bin at 2 % of the mode has L ≈ 7.4 device px and gets no highlight.
The chart passes; some of its marks do not. Conditional, and named.

### The two disagreements, plainly

> **`Sparkline` and `ControlBand` should not have been GL-backed.**

- **`Sparkline`** fails Gate A at 4.6 device px, and it is the worse of the two failures because
  `FlatLine` also sets `bloomGain: 0, threshold: [4, 5]` — bloom is deliberately off. So of the
  four things the layer contributes, three are sub-resolution and the fourth is switched off, and
  what remains is a ribbon carrying **57.5 %** of the ink of the `strokeWidth={2}` polyline it
  replaces. `PLATFORM_VFX_100X.md` §7.2 predicted this outcome. The threshold reaches it by a
  different route and for a better reason.
- **`ControlBand`** fails Gate A at 5.2 device px *and* Gate B at ~55 draw calls, and the mark that
  would have passed both was excluded by hand (§1). It is the single most expensive chart in the
  kit — 0.744 ms/frame, 18.85 ms per transition — for the least visible return.

The case *for* keeping them is doctrinal, not visual: `3D_VFX_FINAL_PLAN.md` §1.5 cites "incl. the
40px `Sparkline`" as the evidence that the blueprint's strongest claim — *every* visual passes
through the pipeline — is literally true. That is a real thing to value. **It is not a
measurement**, and it is what the two gates above are weighed against. The threshold's answer is
SVG; the decision is an owner's.

### `TrendDelta` and §4.4 — the question is a category error

`TrendDelta` is **26 lines and contains no SVG at all**. It is a `<span>` holding a `▲`/`▼`
character and `Math.abs(value).toFixed(1)`, coloured from `CHART_GOOD`/`CHART_BAD`. Zero geometric
primitives. Its marks are **type**.

So §4.4 — "GL-back `TrendDelta`, closing Layer 5 at 11 of 11" — cannot be done in the sense
intended, and doing it in any sense available would **violate rule 4**, the DOM-typography
invariant that exists for the accessibility and print paths and is ratcheted by
`harnessRules.test.ts:158-161`.

> **Recommendation: close §4.4 as NOT APPLICABLE, not as done.** The honest count for Layer 5 is
> **8 of the 10 mark-bearing primitives are correctly GL-backed, the other 2 are GL-backed and
> should not be, and the 11th has no marks at all.** "10 of 11" flatters the state of the kit in one direction and
> "1 remaining" flatters it in the other.
>
> **Now settled (§9).** The two came out. The count that is true of the shipping tree is
> **8 GL-backed, 2 deliberately SVG, 1 with no marks — 8 of 8 above the floor**, and it is
> ratcheted by `apps/web/src/components/charts/__tests__/glThreshold.test.ts` rather than
> asserted here.

---

## 6 · Found while costing this — four items, none of them mine to fix

These are code readings and measurements from the run above, reported rather than changed. Every
file below is owned by another track right now.

### 6.1 · The stroke ink deficit is visible, and `HALF = 1.3` did not fix it

`docs/3d/svg-gl-bench.mjs` writes one capture per cell, GL beside SVG at the same size and on the
same background. On both stroke cells the GL line is **markedly thinner and dimmer** than the SVG
polyline it replaces — obvious at a glance, at `ControlBand`'s corrected `halfWidth: 1.3` and at
`Sparkline`'s uncorrected 1.15. This is the `∫ smoothstep = halfWidth` result of §4 arriving on
screen. Rule 8 — every claim gets a capture — and this one has two.

Two things follow. The compensation `ControlBand` applied is in the right direction and
insufficient; and `Sparkline` did not get it at all, so two components replace an identical
`strokeWidth={2}` polyline with ribbons of different weight.

### 6.2 · The blur chain runs for two charts that multiply its output by zero

`FlatLine` resolves with `bloomGain: 0, threshold: [4, 5]` — a deliberate and correct choice
("a hairline has no highlight to bloom; the glow was pure blowout"). But `pipeline.resolve` has no
path that skips the chain: the bright pass runs, `smoothstep(4, 5, luminance)` returns 0 for every
normal luminance, **four blur passes then blur a buffer of zeros**, and the composite adds
`bloom * 0`.

Measured: **0.141 ms for `Sparkline` and 0.232 ms for `DonutChart`**, per chart per frame, for
nothing. `DonutChart`'s is the largest blur cost of any cell in the table. `resolve` already accepts
`blurSteps`, and `steps.forEach` over an empty array is a no-op, so `blurSteps: []` would remove the
four passes today without touching `@lcx/gl`. The bright pass and the composite's second texture
fetch would remain.

### 6.3 · `setRegion` reallocates where it could pool

The 0.25 ms cliff of §3.3 exists because `setRegion` deletes and recreates three textures and three
framebuffers whenever the size changes, and a dashboard's charts have different sizes. A
size-keyed pool of targets would make the cliff flat. This is a `stage.ts` change and a real
design decision, not a tweak — noted, not proposed.

### 6.4 · Three `WebGLProgram`s leak per chart instance, for the life of the page

`createPipeline` compiles bright, blur and composite through `stage.compile`, which pushes each into
the Stage's `programs[]`. `pipeline.dispose()` is a no-op by design ("Programs are owned and freed
by the Stage"). Every component's unmount cleanup disposes only its **batch** — `FlatBand` does
`held.current?.batch.dispose()`, and `FlatDial`/`FlatTrack`/`FlatBars` are the same shape.
`stage.dispose()` is reached only from `resetSharedRenderer()`, a test seam.

So the shared Stage accumulates **3 programs per chart instance ever mounted**, and route changes
add to it. The shaders themselves are correctly deleted inside `compile` — this is programs and
their linked binaries only. It is the same class of defect the long comment in `stage.ts:260-268`
was written about, one level up: that one leaked shaders a program had been built from, this one
leaks the programs.

---

## 7 · What this does not settle

1. **One machine.** M1/8 GB. Gate C is the only machine-dependent gate and it is dated for that
   reason. M2, M3 and every non-Apple GPU are unmeasured, exactly as everything else in this
   programme is (`3D_VFX_FINAL_PLAN.md` §6.6).
2. **The harness is the architecture, not the components.** It replicates the four calls every
   chart makes — `sharedRenderer().render`, the batch, the post chain, the blit — with the style
   values and `resolve` options transcribed from each `Flat*` layer. It does not render React, so
   it prices the renderer and not the reconciliation. A React re-render adds cost to both sides.
3. **Gate A's constants are the shaders' constants, not perceptual ones.** "1 device pixel to
   exist, 2 to read as an edge" is a resolution argument, not a psychophysical one. The captures in
   §6.1 support it at the two sizes where it matters most; a proper legibility threshold would need
   the §7(b) instrument (`docs/3d/e9/task.html`) pointed at chart marks, and a person.
4. ~~**`ControlBand`'s dash count is estimated from the pattern**, not read off a live chart: an
   8-unit period over a 426-unit plot gives ~54 calls. A short series produces fewer, and the chart
   would then fail Gate A alone rather than both gates.~~
   **CLOSED, and the caveat was wrong — see §9.2.** Counted off a live render the figure is
   **55**, which confirms the estimate. The guess that "a short series produces fewer" does not:
   it is **55 at 2 points and 55 at 90 points**, because the dash count comes from the plot's arc
   length and every series spans the same plot. A two-point `ControlBand` paid 55 draw calls, so
   it failed both gates at every series length and never only Gate A.
5. **The sub-0.1 ms figures are not stable to three decimals.** Two runs an hour apart returned
   0.024 and 0.035 for `BarChartH`, 0.744 and 0.996 for `ControlBand`, 0.141 and 0.144 for the
   `Sparkline` blur. Run-to-run spread on the small cells is ±30–50 %. What is **reproducible** is
   everything the threshold actually rests on: the ordering (`ControlBand` 20–30× every other
   chart, every time), the realloc cliff (0.19–0.27 ms across runs, 45–47× penalty at 12 charts),
   the blur chain (0.14–0.35 ms, always several times the submit cost), the flat-versus-rising
   sweep shape, and `svg ≈ 0.008 + 0.0017·N`. **Read the tables for orders of magnitude and for
   which column beats which, not for the third decimal.** They are printed to three places because
   the instrument prints three, and the honest thing is to say what they are worth rather than to
   round them into a false stability.
6. **The stroke path's per-call cost is not explained.** At the same frame size one polyline call
   costs an order of magnitude more than one instanced bars call, and area does not account for it.
   The measurement is repeatable; the cause is not established, and no explanation is offered here
   rather than a plausible one.

---

## 8 · The threshold, in one block, for whoever needs to check a new primitive against it

```
GL-back a chart primitive if and only if:

  A · VALUE       every mark's lit-axis extent L >= 20 device pixels, where L is
                    vertical bars    -> column height
                    horizontal bars  -> bar length          (NOT thickness)
                    arcs             -> rOuter - rInner
                    polylines        -> 2 * halfWidth
                  and, for polylines, halfWidth >= the SVG's full strokeWidth,
                  because integrated ribbon coverage == halfWidth exactly.

  B · COST        the primitive issues O(1) draw calls, or O(n) with n bounded by
                  legibility rather than by a rendering detail such as a dash period.

  C · PAGE        <= 12 GL charts per page, all at the same device-pixel size.
                  [M1/8 GB, 2026-08-13 — re-measure per machine class]

Re-derive A and B with:  node docs/3d/svg-gl-bench.mjs --sweep
A is arithmetic and needs no browser. B and C are measured and do.
```

And the ratchet that enforces it without anyone reading this file:
`apps/web/src/components/charts/__tests__/glThreshold.test.ts`.

---

## 9 · ACTED ON — 2026-08-13. Both verdicts re-verified, both charts changed, and what the measurements said

The two disagreements in §5 were checked against the source and the shader constants **before**
anything was removed, on the standing rule that a working code path is not deleted on a claim.
**Both verdicts hold.** One of the arguments FOR them was wrong about the branch (§4's correction),
and one of the numbers in §7 was wrong in the direction that made the case weaker (§7.4). Both are
corrected in place above rather than quietly replaced.

### 9.1 · `Sparkline` — CONFIRMED, and the 57.5 % is now a measurement

**Gate A, value.** L = `2 · halfWidth` = 2 × 1.15 = 2.3 viewBox units. `Sparkline` sets
`viewBox="0 0 96 28"` at `width={96} height={28}`, so one unit is one CSS pixel and, at the dpr 2
`useFlatChart` clamps to (`gl/useFlatChart.ts:106`), **L = 4.6 device px** against a floor of 20.

**Gate A, ink.** Confirmed from the shader, then rasterised. `createStrokeBatch.polyline` calls
`emit(mvp, v, s, 1)` — `uSoft = 1` — and the fragment stage is
`edge = smoothstep(1.0, 1.0 - uSoft, abs(vAcross))`, i.e. `smoothstep(1, 0, |vAcross|)` across the
whole ribbon. With `u = 1 − |x|`, `∫₋₁¹ u²(3−2u) dx = 2·[u³ − u⁴/2]₀¹ = 1.0` in `across` units, and
`across` spans `2·halfWidth`, so **the effective ink width is exactly `halfWidth`**. `FlatLine`
draws source-over (`beginAlpha` = `ONE, ONE_MINUS_SRC_ALPHA`, `stage.ts:373-376`) over a
`clearColor(0,0,0,0)`, so the scene's alpha is `edge`; and it resolves with `bloomGain: 0`, so the
composite's `a = clamp(sceneT.a + bloomT.a · uBloomGain, 0, 1)` (`look/pipeline.ts:106-107`) passes
that alpha through unchanged. The alpha that lands on the card **is** the ribbon's coverage.

Measured, both arms rasterised at dpr 2 and Σ alpha read back out of real pixels — the GL arm
running the shipped `flat/strokes.ts` (its mitred-normal expansion and its fragment shader, bundled,
not modelled) in a real WebGL2 context, the SVG arm the exact `<polyline stroke-width="2">` this
component emits, rasterised by Blink:

| case | device px | GL ink px² | SVG ink px² | **GL / SVG** | GL width | SVG width | GL / SVG |
|---|---|---|---|---|---|---|---|
| flat segment, 96×28 | 192×56 | 397.961 | 700.125 | **56.8 %** | 2.314 | 4.000 | **57.8 %** |
| real series, 96×28 | 192×56 | 405.678 | 757.114 | **53.6 %** | 2.522 | 4.706 | 53.6 % |
| `StatCard`'s 80×24 | 160×48 | 333.306 | 626.365 | **53.2 %** | 2.180 | 4.314 | 50.5 % |

*Chrome, ANGLE Metal Renderer: Apple M1, dpr 2. The closed form predicts a cross-section of
`halfWidth · dpr` = 2.300 device px; the readback says 2.314, **0.60 % apart**, and the run refuses
to report at all if that gap exceeds 2 %. It also refuses if the two arms' inked bounding boxes are
more than 2 px apart, which is what would catch a wrong transform silently halving the answer.*

Two notes on reading this table. The **flat-segment row is the one the headline number comes from**:
it is the only geometry where a pixel column is a clean cross-section. The zig-zag rows come out
*lower* (53 %) because the SVG's `stroke-linejoin="round"` and `stroke-linecap="round"` add ink at
every corner and at both ends that the butt-ended GL ribbon has no equivalent for — a real part of
the deficit, but not part of the `∫ smoothstep` claim, so it is reported beside it and not folded in.

**The derivation's 57.5 % was right to within 0.7 points.** So was `PLATFORM_VFX_100X.md` §7.2's
instinct about a 40 px sparkline, for a different and worse reason than the one it gave.

> **Unasked-for finding: this quantity is not driver-dependent, and that is checkable.** The same
> instrument under headless SwiftShader returned 57.0 / 53.5 / 53.6 % against Metal's
> 56.8 / 53.6 / 53.2 % — agreement to 0.4 points. `svg-gl-bench.mjs` and `blit-cost.mjs` both
> refuse to publish under a software rasteriser, correctly, because they measure MILLISECONDS.
> Coverage is a `smoothstep` of an interpolated varying and is specified to float precision, so it
> is the one figure in this document a CPU rasteriser may legitimately produce. The cross-check
> against the closed form is what licenses that, rather than the assertion.

### 9.2 · `ControlBand` — CONFIRMED on both gates, and the dash count was read, not estimated

**Gate A.** `HALF = 1.3` over a 480-unit viewBox in a 480 CSS px card gives **L = 5.2 device px**.
The compensation was in the right direction and insufficient: at `halfWidth 1.3` against
`strokeWidth={2}` the ribbon carries **65 %** of the polyline's ink. Robust to the card, too —
`ControlBand` is fluid (`className="w-full"`), and even at a 960 CSS px card L is only 10.4 device
px. Clearing 20 would need a card about 1,850 CSS px wide.

**Gate B, counted.** The GL hook was mocked and the argument it receives counted off a live render:

| readable points | GL draw calls | |
|---|---|---|
| 2 | **55** | 1 centre line + 54 dashes |
| 3 | **55** | |
| 5 | **55** | |
| 30 | **55** | |
| 90 | **55** | |

**The count does not depend on the data at all** — it is the plot's arc length over the 8-unit
period, and every series spans the same plot. §7.4's estimate of ~54 is confirmed; its caveat that
"a short series produces fewer" is refuted, and refuted in the direction that makes the verdict
unconditional rather than conditional. At 0.744–0.996 ms/frame this was 20–30× every other chart in
the kit, for two marks at 5.2 device px.

### 9.3 · The specific hazard was checked, and the SVG had NOT been thinned

Removing GL from a chart whose SVG was weakened to accommodate it leaves the chart worse than
before either change. It was not the case here, and the check is in the history rather than in an
opinion: `git show f7ec572 -- Sparkline.tsx` and `git show 86527f5 -- ControlBand.tsx` change the
SVG in exactly three ways — a `glRefused &&` guard on the marks the ribbon replaces, a
`relative z-10` class so the SVG paints above the canvas, and a positioned wrapper. **Every
`strokeWidth={2}` is byte-identical to the pre-GL file**, on all four polylines across the two
components. So the removal restores the full authored rendering, and both charts are back to the
exact markup W0 found correct — down to `Sparkline`'s `className="shrink-0"` on the `<svg>` and no
wrapper `<span>`.

### 9.4 · What changed in the tree

| file | change |
|---|---|
| `charts/Sparkline.tsx` | GL path removed. No React hooks left at all — the component is a pure function of its props again. |
| `charts/ControlBand.tsx` | GL path removed, and `dashRuns` with it (68 lines that existed only to turn a dash into geometry). `useTooltip` is the only hook, so the empty-data return is back at the top. |
| `charts/gl/FlatBand.tsx` | **deleted.** `ControlBand` was its only consumer. |
| `charts/gl/FlatLine.tsx` | the `lines` path and `LinePath` removed; `arcs` kept for `DonutChart`, its only remaining caller. Leaving the polyline path in place would leave the refuted thing armed for the next chart. |
| `charts/__tests__/glThreshold.test.ts` | new. §9.6. |

An arc is **not** subject to the ink deficit and the distinction is now written down in
`FlatLine.tsx`: `arc` emits with `soft = 0.9`, so 90 % of its cross-section is an opaque core and
only the outer 10 % is feather, and `DonutChart`'s band is 44 device px against the 20 px floor.

### 9.5 · The budget, measured — and **the reclaim this was expected to produce is not there**

The premise was that each adapter is ~1,539–1,902 B minified, rides eagerly in every chunk that
renders its chart, and that `Sparkline` reaches many routes through `StatCard` — so with 11 KB of
headroom against the hard 850 KB initial-JS ceiling this ought to be a real reclaim. **It is not.**

| | initial JS (index.html's entry + modulepreload) | total JS | chunks |
|---|---|---|---|
| before | 827,886 B · **808 KB** / 850 | 3,138,766 B | 197 |
| after | 827,786 B · **808 KB** / 850 | 3,133,488 B | 195 |
| delta | **−100 B** | **−5,278 B** | **−2** |

**Why it is only 100 B: the adapters were already code-split, and none of them was in the initial
set.** `index.html` declares three scripts — `index`, `react-vendor`, `vendor` — and that is what
the budget counts (`scripts/check-bundle.mjs:272`). `FlatLine` and `FlatBars` were their own lazy
chunks (2,371 B and 2,120 B), and `FlatBand` was inlined into the two page chunks that render
`ControlBand`. The 100 B that did leave `index-*.js` is `Sparkline`'s hook plumbing, nothing more.

Where the 5,278 B actually is:

| chunk | before | after | delta |
|---|---|---|---|
| `KpiDashboard` | 50,514 | 47,317 | **−3,197** |
| `FlatLine` (chunk eliminated) | 2,371 | — | −2,371 |
| `FlatBars` (chunk eliminated) | 2,120 | — | −2,120 |
| `Sparkline` | 1,658 | 971 | −687 (−41 %) |
| `tonemap` | 8,814 | 8,685 | −129 |
| `index` (entry) | 415,499 | 415,399 | −100 |
| `Home` / `OutreachOps` / `WinLoss` / `BoardReport` / `ReportBuilder` / `ExchangeGaps` / `BarChartH` / `FunnelChart` | | | −31 to −97 each |
| `DonutChart` | 3,003 | 4,719 | +1,716 — `FlatLine` merged in, its last consumer |
| `tooltip` | 1,864 | 3,927 | +2,063 — `FlatBars` merged into the shared chunk its callers all pull |

So the honest statement of the win is **−3,197 B on the `KpiDashboard` route, −41 % off the
`Sparkline` chunk, and two fewer HTTP requests on every route that draws a bar chart or a donut** —
not headroom against the ceiling.

> **A trap worth recording, because it nearly went into this document as a 31 KB reclaim.** The
> first before/after pair straddled a sibling track's change: `apps/web/src/data/stateNarrative.*`
> became a lazy 35,269 B chunk between the two builds, taking initial JS 839 → 808 KB and headroom
> 11 → 42 KB. Attributing that to this work would have overstated it by **310×**. The numbers above
> come from an A/B where only these four files differ and every other file in the tree is byte-for-
> byte identical: restore them from HEAD, build, measure; restore the change, build, measure. **On a
> tree several agents are writing to, a before and an after taken minutes apart are not a
> measurement of your own change unless you pin everything else.** The 42 KB of headroom the budget
> now reports is real and is somebody else's.

### 9.6 · The enforcement — `charts/__tests__/glThreshold.test.ts`, 17 tests, all passing

A registry of the eight GL-backed primitives with L for each (one test per entry), plus five live
scans of the tree and four mutation arms. Run against the tree **before** the removal, four live
arms failed and named both charts with the right numbers:

```
completeness    GL-wired with no lit-axis extent declared: ControlBand, Sparkline
gate A          Sparkline   L = 2 × 1.15 × 2 = 4.6 device px < 20
gate A          ControlBand L = 2 × 1.3  × 2 = 5.2 device px < 20
gate A · ink    Sparkline   halfWidth 1.15 < strokeWidth 2 → 57.5 % of the polyline's ink
gate A · ink    ControlBand halfWidth 1.3  < strokeWidth 2 → 65.0 % of the polyline's ink
gate B          ControlBand builds GL geometry from a dash splitter
gate B          Sparkline is calling a GL hook
```

Four properties it was designed for, because a threshold nobody can check is a document:

- **The completeness check is the one that would have caught this first.** GL-backing a primitive
  was free — nothing had to be filled in, so no L had to be derived. Now a GL-wired chart with no
  declared lit-axis extent fails, by name.
- **The ribbon rules read `halfWidth` out of the component**, resolving a one-level `const`, so the
  `HALF = 1.3` form is visible to them. A registry number alone could drift from the code.
- **Gate B is counted, not grepped**, for the one chart still GL-backed through the stroke batch:
  `DonutChart`'s draw calls must equal its slice count and stay ≤ 8, which is what "O(n) bounded by
  legibility" means operationally.
- **Every gate has a mutation arm.** After the removal no chart is GL-backed through a polyline, so
  the live ribbon scan alone would be a test that cannot fail. Each checker is therefore also run
  over the code that shipped at `38c01b1`, quoted verbatim, and required to fail — and once over a
  passing ribbon, so a checker that flags everything is caught too. The zero-draw-call assertions
  are guarded the same way: `DonutChart` renders through the same mock and must return non-zero, or
  the two zeros beside it mean only that the mock is dead.

### 9.7 · One change this pass could not make, and one latent defect it exposed

**`apps/web/src/components/__tests__/glContextBudget.test.ts:209-210` now fails, and it is not
because the removal was wrong.** Its census is

```ts
const SHARED_USERS = FILES.filter((f) => /sharedRenderer\s*\(/.test(SOURCE.get(f)!));
...
expect(SHARED_USERS.length, 'no sharedRenderer call sites found — the flat chart path vanished')
  .toBeGreaterThanOrEqual(4);
```

and it **does not strip comments**. Of the four files that satisfied it, exactly **one contains a
call** — `charts/gl/useFlatChart.ts:99`. The other three matched header PROSE: `FlatDial.tsx:35`,
`FlatTrack.tsx:32`, and the deleted `FlatBand.tsx:23`, each of which explains
`sharedRenderer().render(target, draw)` in a sentence. Deleting a dead adapter whose only match was
a comment took the count 4 → 3 and fired a guard whose message claims the chart path vanished.

There is only ever **one** shared-renderer call site, by design: `useFlatChart` owns it, which is
the entire point of that hook. A floor of 4 asserts an architecture the code deliberately does not
have, and it has been satisfied by documentation since it was written. The fix is one line —
strip comments in the filter and lower the floor to 1 — but the file belongs to another track, so
it is reported and not touched. Its other 31 assertions, including every per-route context budget,
pass unchanged: `SHARED_USERS` is only used elsewhere to ask whether a route reaches the shared
renderer, and `useFlatChart.ts` is in every chart route's import closure, so that answer was never
resting on the prose.

**Also outstanding, and also another track's file:** `charts/TrendDelta.tsx:15` and `:28` cite
`useFlatBand` and `gl/FlatBand.tsx:16-20` in their header comment. Both citations are now dangling.

### 9.8 · What §9 does not settle

1. **The ink figure is one shader and one size class.** It is measured at three sizes on one
   machine, and cross-validated against the closed form, so it generalises as far as the
   arithmetic does — but the *perceptual* consequence is still unmeasured. §7.3 already said the
   20 px floor is a resolution argument and not a psychophysical one, and that stands.
2. **Gate C was not re-measured.** Nothing here changes the page budget; two charts leaving the GL
   path only makes a 12-chart page easier to afford.
3. **The instrument is not committed.** `ink-parity.mjs` ran from a scratch directory. It belongs
   beside `svg-gl-bench.mjs` in `docs/3d/`, and until it is there the table in §9.1 is reproducible
   only by rewriting it. Adding a file outside this pass's scope was not available.
4. **§6.2's blur-chain waste is now `DonutChart` alone.** `Sparkline`'s 0.141 ms/frame of blurring
   a buffer of zeros went away with its GL path, but `DonutChart`'s 0.232 ms — the largest blur cost
   of any cell in §3 — is untouched, and `blurSteps: []` would still remove it without touching
   `@lcx/gl`.
