# The SVG / GL threshold — measured, and it is not the threshold anyone was looking for

> **What this closes.** `PLATFORM_VFX_100X.md:139-141` says L5 needs "a size/complexity threshold
> below which SVG is simply correct, and that threshold has to be measured, not guessed." It was
> never measured. This measures it.
>
> **Why now.** §4.4 of `3D_VFX_FINAL_PLAN.md` asks whether `TrendDelta`, the last un-GL-backed
> primitive, should be GL-backed. That question has no honest answer without this threshold.
>
> **The instrument.** `docs/3d/svg-gl-bench.mjs`, run 2026-08-13 on **ANGLE Metal Renderer:
> Apple M1**, headed Chromium, `dpr 2`, `EXT_color_buffer_float` present. Every millisecond in
> this document came out of that run. Nothing here is estimated.
>
> **The short version.** The threshold is not a primitive count and not a filled area — cost does
> not track either. It is two gates: a mark's **lit-axis extent in device pixels** (≥ 20), and the
> primitive's **draw-call order** (O(1), or O(n) with n bounded by legibility) — plus a page-level
> budget. Applied to the eleven primitives it says **eight should be GL-backed, two should be SVG,
> and the eleventh is not a chart at all.** Two of the ten currently GL-backed — `Sparkline` and
> `ControlBand` — fail it, and `TrendDelta`, the one §4.4 wants to add, cannot pass it because it
> has no marks.

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
| 2 | offscreen canvas grow | `canvas.width/height = max(...)`. **Grow-only**, so at most once per session per size class. |
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

| chart cell | device px | draw calls | **submit** | **blit alone** | **blur chain** | **realloc** | **SVG marks** |
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
- **blit alone** — the two 2-D calls timed by themselves, nothing else running.
- **blur chain** — the four blur passes, isolated under a forced flush. It is a **GPU** cost that
  overlaps with the next frame's submission at low chart counts, which is why it can exceed the
  submit figure without contradicting it.
- **realloc** — one `setRegion` at a size it has not just seen.

### 3.1 · The blit is free, and that sentence has never had a number under it

`flat/shared.ts:18-21` justifies the whole blit-instead-of-page-canvas architecture by asserting the
copy is "a rounding error against a frame that already runs five post-process passes."

**0.001 ms.** Confirmed, at every cell size from 10 752 to 422 400 device pixels. The architecture's
central trade is sound and is now measured rather than asserted.

Isolating it took two attempts, and the failed one is instructive: subtracting a no-blit run gave
**negative** deltas of a near-constant −0.37 to −0.42 ms across eight cells of wildly different
sizes. Removing `drawImage` also removes the implicit command-buffer flush it performs, so the
stripped arm stalled on backpressure; adding `gl.flush()` back to match the regime cost more than
the copy being measured. A constant delta across sizes is the signature of an instrument artefact,
not of a cost.

### 3.2 · Cost does not track area. My own derivation's cost arm was wrong

The 10 752-pixel `Sparkline` cell costs **0.120 ms**. The 422 400-pixel `ColumnChart` cell costs
**0.035 ms**. **39× the pixels, 3.4× less time.**

The fill-rate derivation in §2 — 2.31·A fragments, 4.31·A fetches — is arithmetically right and
predictively useless. On Apple silicon a chart frame is **submission-bound**, not fill-bound: what
it costs is driver calls, and what drives driver calls is the **draw-call count**.

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

| chart | GL, 25 frames + 1 realloc | SVG, 1 change | GL is |
|---|---|---|---|
| BarChartH (6) | 0.85 ms | 0.012 ms | 71× |
| ColumnChart (8) | 1.12 ms | 0.020 ms | 56× |
| Histogram (120) | 1.89 ms | 0.210 ms | 9.0× |
| ControlBand (55 dashes) — entrance | 1.00 ms † | 0.057 ms | 17× |
| ControlBand (55 dashes) — **update** | **11.9 ms** † | 0.057 ms | **209×** |

† `FlatBand` is the one layer that passes `entranceMs: 0`, so `ControlBand`'s entrance is a single
frame. It does **not** pass `updateMs: 0`, and `useFlatChart` defaults that to 260 ms — so a data
change runs ~16 animation frames while `FlatBand`'s `draw` ignores `t` entirely (its signature is
`(stage: Stage) => void`). Every one of those 16 frames paints the **identical picture** at 0.744 ms.
Declining the tween in the draw without declining it in the hook is how a chart that deliberately has
no motion still pays for sixteen frames of it.

**GL is always more expensive per transition.** There is no crossover and there was never going to
be one: the SVG is already on screen. So the threshold is not a cost comparison — it is a
value-per-cost floor, plus a page-level budget. Which is §4.

---

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
| 9 | **Sparkline** | FlatLine | **4.6** (2 · 1.15) | ❌ | 2 | ✅ | **SVG** | **GL ✗** |
| 10 | **ControlBand** | FlatBand | **5.2** (2 · 1.3) | ❌ | **~55** | ❌ | **SVG** | **GL ✗** |
| 11 | **TrendDelta** | — | **no marks** | n/a | 0 | n/a | **DOM, by rule 4** | DOM ✅ |

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
4. **`ControlBand`'s dash count is estimated from the pattern**, not read off a live chart: an
   8-unit period over a 426-unit plot gives ~54 calls. A short series produces fewer, and the chart
   would then fail Gate A alone rather than both gates.
5. **The stroke path's per-call cost is not explained.** At the same frame size one polyline call
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
