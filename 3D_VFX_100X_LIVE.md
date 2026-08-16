# 3D VFX 100X — LIVE, THEME-CORRECT, REACTIVE

> **Status:** executing. Not awaiting approval — the owner's instruction was to plan and execute in one pass.
> **Written:** 2026-08-14, from four deep research tracks that measured rather than assumed.
> **Supersedes nothing.** `3D_VFX_FINAL_PLAN.md` closed its own scope; this is the next order of magnitude.

---

## 0 · THE FINDING THAT REORDERS EVERYTHING

I set out to make the environments work in light mode. The research found something underneath that:

> **§6 rule 5 — "brand hex exact, `assertBrandFidelity` runs on every new material" — is not enforced in the
> 3-D path, and the pipeline demonstrably moves data colours.**

Three measured facts, each of which I had wrong:

1. **`assertBrandFidelity` never touches the pipeline.** It computes
   `linearToHex(hexToLinear(BRAND_HEX[k])) === BRAND_HEX[k]` — a self-round-trip of the constants table
   (`look/tonemap.ts:110-118`). It never sees a material, a light, a tone map or a pixel. What is enforced is
   that the table and the sRGB encode agree with each other. Not that a mark keeps its colour.

2. **`brandUnderIllegalToneMap` proves the opposite of what I claimed.** I have been saying all session that
   it shows the hex survives a wrong tone curve. It is the **negative control**: it asserts the blue channel
   **moves by more than 20/255** under one (`look/look.test.ts:40-54`).

3. **And the 3-D path applies exactly that curve to data.** `TONE_POLICY` states tone mapping never touches a
   data-encoding colour (`tonemap.ts:35-38`). That policy was written for the 2-D chart path. In the 3-D path
   every lit fragment lands in one shared target and the single composite tone-maps **the whole frame,
   including the marks** — by construction, in all eight surfaces.

The repo already knew at material level and worked around it: `GlobeReliefGl` draws its brand-blue pins in a
separate pass at **`ambientGain: 120`**, with the stated reason that brand blue against a plate-level sky
returns about 0.02 of linear radiance. That is a lighting hack compensating for a colour-management defect.

**So "match the colour coding" is not a theming task with a correctness task hiding behind it. It is the
correctness task.** A surface that cannot hold `#2C6BFF` through its own pipeline cannot match anything.

---

## 1 · WHAT THE RESEARCH CORRECTED, BEFORE ANY CODE

Recorded because the plan is only as good as the facts under it, and four of mine were wrong.

| I said | Actually |
|---|---|
| Six of seven rebuild the GL context on a data change; Orrery is inert | **Seven of seven.** Orrery's `[]` is its *ResizeObserver*; its render effect lists `input` (`OntologyOrreryGl.tsx:575`) |
| `brandUnderIllegalToneMap` proves the hex survives | It is the **negative control** proving it moves |
| `assertBrandFidelity` runs on every material | It round-trips a constants table and never sees the pipeline |
| The GLTF loader was refused on ~40 KB against 11 KB of headroom | A loader this repo would write measures **3,699 B**, in a lazy chunk, against **304 KB** of free passthrough. **It was affordable all along** — and should still be refused, for better reasons (§4) |

Two mechanisms I was about to design already exist and ship:
- **The redraw-in-a-ref** that keeps one context across a data change — `DeckReliefGl.tsx:205-213`, *"THE
  REDRAW LIVES IN A REF, AND THAT IS WHAT KEEPS ONE GL CONTEXT"*.
- **The theme-change observer** that re-renders the *final frame* and not a replayed animation —
  `ForgeBackdrop.tsx:340-348`, already reasoned in rule-3 terms.

Both are generalisations of working code, not inventions. That is the cheapest kind of 100x available.

---

## 2 · THE WORKSTREAMS

### T · COLOUR CORRECTNESS AND THEME — *the one that had to come first*

**T1 · Make rule 5 real.** A data-encoding colour must arrive on screen as itself. Options, in order of
increasing honesty and cost: exclude marks from the composite; or tone-map scenery only and composite marks
after; or accept the shift and **stop claiming rule 5 for the 3-D path**. The third is a legitimate outcome
and must be written down if chosen — what is not legitimate is the current state, where the rule is claimed
and unenforced. Deliverable includes a test that actually reads a rendered pixel, because the existing one
provably cannot fail on a pipeline change.

**T2 · The scene theme.** `packages/gl/src/look/theme.ts` (built) encodes the taxonomy: `brand`,
`brandBright`, `brandDeep`, `reference`, `refusal` are **data and never move**; ground, structure, plate,
rule, sky and the light rig are **scenery and must**. Values follow ForgeBackdrop's proven swap, including its
counter-intuitive direction — light mode takes a **stronger key, weaker ambient, weaker shadows**, because on
a bright ground bounce already fills the scene and a hard shadow on a white plate reads as dirt.

**T3 · Bind all seven surfaces**, plus the theme observer so a toggle re-renders the final frame.

**T4 · Semantic divergence.** The 3-D surfaces encode a blocked audit record in burnt orange while every other
surface in the product renders blocked in **red**. One product, two colour languages. Resolve to the
platform's semantic roles wherever the colour is *status* rather than *identity*.

### R · REACTIVITY — *measured 33.30 → 9.70 ms per data change*

**R1 · Hoist the redraw into a ref on all seven.** Generalises `DeckReliefGl`. Zero engine bytes, ≈3 KB across
seven lazy chunks, no shared file touched, every ratchet stays green. Removes **415.8 KB of pointless sphere
re-upload** on E2 and a ≤400 ms viewpoint re-search on E4.

**R2 · Program cache in `stage.ts` — second and separately.** Compilation is essentially the entire rebuild
cost (7.80 ms with programs kept, against 33.30 rebuilt), so the boring fix captures most of the milliseconds.
It goes second because it edits the file this programme has already specified a wrong change to once (§10.9)
and shipped a silently blank chart from.

### X · REACH — *the only item that changes all 78 routes*

**X1 · Ambient dimensionality in `AppLayout`.** Today **one route of 78** shows a stranger a 3-D frame without
a click, and it is the sign-in screen. The shared-context backdrop is the cheapest possible reach — no new
context, no new shader, no spine bytes, CSS fallback already written. It clears §7(b) not by exemption-shopping
but because §11.4 already ruled that **a surface carrying no dataset is gated on clause (a) alone**.

**X2 · Sub-path exports** — 13.5 KB a route instead of 87.7 KB. Nobody sees it; it is what makes X1 affordable.

**Default nothing else on.** Promoting a data surface from opt-in is gated on §7(b), which no operator has run.
"The owner asked" is not a measurement, and the gate exists to stop exactly this.

### A · AUTHORING — **REFUSED, and the recorded reason replaced**

The standing decision refused Blender→GLTF twice on bytes. That arithmetic was wrong in both directions and
the pipeline was affordable all along. It is still refused, on four reasons that survive measurement:

1. **E1–E7 cannot use it.** The arguments to their geometry generators *are* their data —
   `pinHeight(s.projects, …)`, `arcTube(HUB.lat, HUB.lon, s.lat, s.lon, …)`, `heightfield(cols, rows, sampleAt, …)`.
   A modelled asset cannot participate. The only authorable geometry is Vault and Pipeline set dressing, which
   carries no data — exactly what the doctrine says to argue down.
2. **The first delivery would be a 21,732 B GLB copy of a cylinder** that `cylinder(0.92, 0.16, 96)` produces
   at zero payload. Measured both ends this session.
3. **The object anyone actually wants is not in the scene.** E8 draws a disc, a ring and a plinth; the LCX
   mark is a separate flat DOM SVG beside it.
4. **And it needs no pipeline** — 24 points of M/L/Z, already authored.

Blender 5.2 LTS is installed and headless scripting verified (`BPY_OK`). The capability is real; the case for
using it is not. Recorded so nobody re-opens it on the old, wrong arithmetic.

---

## 3 · ORDER, AND WHY

`T1 → T2/T3 → R1 → X2 → X1 → T4 → R2`

T1 first because every later colour decision is unsound until a mark can hold its own hex. R1 before X
because reach multiplies whatever per-surface cost exists. X2 before X1 because it is the difference between
reach costing 13.5 KB and 87.7 KB a route. R2 last because it touches the riskiest shared file and its value
shrinks once R1 lands.

Every step: full gate green, captures at real aspect ratio in **both themes**, and deployed before the next.

---

## 4 · WHAT THIS PLAN WILL NOT DO

- **Default a data surface on.** Gated on §7(b). Not measurable by me.
- **Fabricate a risk field to make E7 reachable.** §10.10; it would be the exact failure rule 6 prevents, on
  the one page whose output is filed.
- **Adopt an asset pipeline.** §2 A, refused with four measured reasons.
- **Claim rule 5 for the 3-D path until T1 makes it true.** If T1 concludes the shift cannot be removed at
  acceptable cost, the rule gets amended and the surfaces stop claiming it. An unenforced rule is worse than
  an honest exception.


---

## 5 · T1 RESOLVED — rule 5 is amended, and the measurement is why

**Decision: option D.** Rule 5's "brand hex exact" is replaced by an invariant that is true, load-bearing and
testable. Not a retreat — the old rule was incoherent for a lit surface, and believing it had already produced
one lighting hack in shipped code.

### What was measured

`docs/3d/brand-fidelity.mjs`, reproducible, recorded in `brand-fidelity.json` with a `sourceHash` over the
live composite, tone map, encode and palette so the record cannot drift from the code silently.

| colour | flat, most favourable | as shipped | lit marker | **lit centre** |
|---|---|---|---|---|
| `brand` #2c6bff | `#2c68dc` · ΔE **18.3** | `#306cdf` · ΔE 19.2 | `#447fff` · ΔE 15.2 | **`#c8ebff` · ΔE 87.6** |
| `brandBright` | `#7aa5dc` · ΔE 12.7 | | | |
| `reference` #ff8a3d | `#dc843c` · ΔE 14.4 | | | |

For scale: AgX, which `colour.ts` itself calls "badly wrong", is ΔE 41.1. Ours is **45% of that** and 3.7×
Khronos PBR Neutral. The blue channel is **35/255 low** on the anchor in the *best* case available.

### Why the fix was not to remove the shift *by changing the curve*

- **A fixed-point curve is refuted by arithmetic.** Brand blue's blue channel is linear **1.0**. Pinning it
  makes the curve identity at 1.0, leaving zero headroom above — every value greater than 1 clips, which
  deletes the one reason this pipeline has a tone map. *This bullet is sound and stands. The conclusion drawn
  from it — that no data-preserving fix exists — does not follow, and is corrected in §5.1.*
- **Excluding marks from the composite assumes a split that does not exist here.** In these surfaces the
  deck, the globe, the pins *are* the data. Geometry composited after the tone map is unlit geometry — a
  sticker, not a surface.
- **And the lit measurement settles it.** The centre of a lit blue marker is `#c8ebff` — nearly white,
  ΔE 87.6. That is not a defect; it is a specular highlight. **"Hex exact" over a shaded mesh is a category
  error.** A mark that kept its unlit hex under light would be the bug.

### The replacement invariant

> **ORDER SURVIVES.** The transform is monotone per channel, so a denser mark never renders lighter than a
> sparser one.

That is what a reader actually relies on, and unlike the old rule it can fail. The new test reads bytes from
the measured record and reproduces them from the live `toneMapComposite` — the first CPU-vs-GPU check in the
repo; `look.test.ts` only ever string-matched `"0.40"`.

**Proof the old gate was blind:** changing `TONE_SHOULDER` from 0.4 to 0.45 fails the new test with
*"CPU says 216, the GPU wrote 220"* — while **all 15 assertions in `look.test.ts` pass**.

Also corrected: `brandUnderIllegalToneMap` is renamed `brandThroughComposite`. The old name called the curve
illegal; the measurement shows it *is the shipped curve* and the function is a CPU model of it. A name that
misdescribes what a function tests is how its result came to be read backwards for an entire session.

---

## 5.1 · T1 AMENDED — the shift **can** be removed, for a bounded class of marks

*Added 2026-08-15, after adversarial review refuted the conclusion above.*

§5's three refutations are each correct about the thing they refute. Together they were read as
"**no** data-preserving fix exists", and that is false. The first refutation is about a **curve**; the fix is
not a curve.

`c/(1+0.4c)` is strictly increasing, so it is injective on `[0, 2.5)` and has an exact inverse `y/(1-0.4y)`
there. **Write `inverseToneMap(target)` into the scene target and the live, unmodified curve delivers
`target`.** The shoulder does not move. The composite does not move. Nothing about the tone map's headroom
*above the mark* changes except for the mark itself.

Measured on ANGLE/SwiftShader, RGBA16F scene target, plate 0, bloom 0 — the same instrument shape as
`brand-fidelity.mjs`, and its plain-write control reproduces `brand-fidelity.json`'s `compositeOnly` **byte
for byte on all seven entries**, so the two instruments agree:

| colour | written plain | written pre-compensated |
|---|---|---|
| `brand` #2c6bff | `#2c68dc` · ΔE **18.31** | **`#2c6bff` · ΔE 0.00** |
| `reference` #ff8a3d | `#dc843c` · ΔE 14.35 | **`#ff8a3d` · ΔE 0.00** |
| `brandBright` #7fb2ff | `#7aa5dc` · ΔE 12.74 | **`#7fb2ff` · ΔE 0.00** |

Seven of seven exact. The largest value this puts in the scene target is **1.6667** against RGBA16F's 65504 —
the buffer was never the constraint.

### The three costs, all measured, all enforced by a refusal

1. **It consumes the entire highlight range of a saturated mark.** `1/(1-0.4)` = **1.6667** is where the
   composite's output reaches 1.0 and the framebuffer pins the channel at 255 — the same number
   `primitives/lines.ts` already exports as `STROKE_CLIP_LINEAR`. A colour with a linear-1.0 channel
   pre-compensates to *exactly* that value, so its remaining headroom is **1.0×**: it starts at the clip
   point. Measured over 0.5/0.75/1.0/1.25/1.5/2.0× on the brightest channel — `brand`, `brandBright` and
   `reference` fall from **6 distinct bytes to 3**; `brandDeep`, `refusal`, `rule` and `plate` lose nothing.
   That split is not a list: it is exactly the entries whose brightest channel is linear 1.0.

2. **The plate is still added.** With the default plate (`pipeline.ts:188`) brand lands `#306dff` (ΔE 1.51),
   reference `#ff8b48` (ΔE 4.73). Subtracting the plate is arithmetically exact and is **refused anyway**,
   because `pipeline.ts:97` scales the plate by a **vignette** that varies per pixel from 0.38 to 1.0 — a
   single `Linear` cannot cancel it, and compensating for the full plate measures ΔE 0.00 at vignette 1.0 and
   up to ΔE 8.01 at 0.38. An error that moves across the frame is worse than a constant one.

3. **The bloom is added too, and this one the review did not name.** At `bloomGain: 0.3` — shipped by
   `FlatBars`, `FlatDial` and `FlatTrack` — `brandBright` lands `#8cc1ff`, **ΔE 10.20**, larger than either
   other cost. But `brandDeep`, `rule` and `plate` measured **ΔE 0.00** under the same bloom, and the
   predicate that separates them with no exceptions is `luminance(pre) < threshold[0]`: the bright pass ramps
   on Rec.709 luminance (`pipeline.ts:49-50`) and those three fall below its floor.

### Where it is safe, and the rule that decides

**The taxonomy is the blend's `dstFactor`, not what the mark looks like.** `ONE` (`stage.ts:593`
`beginAdditive`; `env/particles.ts:565`) makes overlap **sum** and is unbounded. `ONE_MINUS_SRC_ALPHA`
(`stage.ts:612` `beginAlpha`; `env/volume.ts:484`) is a convex combination bounded by its larger contributor,
so overlap **replaces**. Blend disabled (`stage.ts:616`, `env/lit.ts:755`, `env/sky.ts:145`) likewise. The
same primitive with the same colour is fixed-density under one and accumulating under the other.

`packages/gl/src/look/precompensate.ts` takes the composite configuration as a **required** argument — no
defaults, because a default here would be a second copy of `PipelineOptions`' inline literals and the failure
it produces is a function returning "exact" for a configuration it never saw — and refuses with the offending
number on `ACCUMULATES`, `PLATE_NOT_ZERO`, `BLOOM_REACHES_MARK`, `TARGET_ABOVE_POLE` or `SCALE_NOT_POSITIVE`.

### The narrow statement that replaces "no data-preserving fix exists"

> **Pre-compensation is exact for fixed-density unlit marks, and consumes the entire highlight range for
> accumulating fields.**

`ORDER SURVIVES` remains the invariant every mark has, precisely because the accumulating case is refused.
§5's other two refutations are untouched: a **lit** fragment's radiance is base colour × illumination, so
there is no value to pre-compensate toward, and pre-compensation does not put geometry after the tone map.

## 6 · X2 RESOLVED — and the stated cause was wrong

87.7 KB a route is **verified exactly** (the `@lcx/gl` barrel chunk plus eight unconditional static
dependencies = 89,793 B), and ten route chunks reach it — carrying the volumetric raymarcher onto pages that
draw bars. The floor is 13.8–23.1 KiB depending on lane, so the saving is **64 KiB, not 74**.

But the cause in §2 X2 was wrong, and the wrong cause leads to a fix that fails: **tree-shaking already
works** — named imports from the barrel versus from their own modules measured **four bytes apart**. What
defeats it is namespace retention, and the obvious cheap fix — "just destructure" — was *measured not to
work*: both lanes still resolve to `src/index.ts`, so Rollup places shared modules in their lowest common
ancestor and emits one 68.88 KiB chunk still carrying the raymarcher.

**Specifier identity is the lever, not shaking.** Hence an `exports` map with wildcards — derived rather than
a hand-written lane list, because a hand list cannot fail on a module nobody thought of.

---

# 8 · CLOSE-OUT, 2026-08-16 — what each workstream actually did

**This plan is closed.** Everything above is the plan as written; this section is what happened, so a
reader does not mistake a prediction for an outcome. Every figure here was measured after the fact
and most of them contradict the estimate the plan carried.

| | plan said | what shipped |
|---|---|---|
| **T1** rule 5 | make it real, or stop claiming it | Rule amended to ORDER PRESERVATION on measurement, then **partially reversed**: pre-compensation is *exact* — 7/7 — for fixed-density unlit marks. One surface qualifies (`FlatLine`); the six additive ones cannot, structurally. |
| **T2** theme.ts | the taxonomy | Shipped, then **corrected at the contract level**: `SceneTheme` now types `ground`/`structure`/`plate`/`rule` as `Albedo` and `skyHorizon`/`skyZenith`/`fog` as `Radiance`. Authoring a radiance as a display hex was a real bug that reached two surfaces. |
| **T3** bind seven | seven surfaces + observer | Six bound. **E7 Storm refuses to theme and argues why in arithmetic in its own file** — that refusal is delivery, not a gap. |
| **T4** semantic divergence | resolve status to platform roles | Delivered — but only after it shipped *built, correct and reachable by nothing*, the third time this programme did that. Being in the barrel was a precondition; the two consumers are the delivery. |
| **R1** hoist redraw | all seven | Seven. E1 was last and its ratchet entry is now deleted, not emptied. |
| **R2** program cache | second, separately | Shipped. `PROGRAM_CACHE` in `stage.ts`. |
| **X1** ambient reach | a stranger sees 3-D on more than one route of 78 | **Not met, and recorded as not met.** The layer draws nothing on the platform's default theme, so by default the count is still one route. |
| **X2** sub-path exports | 13.5 KB a route instead of 87.7 KB | **The estimate was wrong in both directions and the migration had never happened.** Measured: flat charts 100,709 B → **27,812 B**; sign-in shell 100,709 B → **52,349 B**. The half state — adapters migrated, backdrops not — measured *worse* than either end at 102,832 B. |
| **A** authoring | refused on four reasons | Still refused. Nothing in the tree is a GLB. |

## The four claims that died on measurement

Recorded because each was believed, written down, and false:

1. **"Brand hex exact through the pipeline"** rested on a constants table round-tripping through two
   pure functions — something no pipeline change can move. Off a real framebuffer, brand blue lands
   35 levels of blue low.
2. **Order preservation is insufficient.** Monotone is not injective; lighting collapses
   brand/refusal from 68.2 to 9.8.
3. **CIE76 was the wrong metric**, and wrong in the direction that hid the problem — 68.2 against
   14.2 in CIEDE2000, because both colours are blues.
4. **"The tone curve cannot be cancelled"** — it can, exactly, for a bounded class of marks.

## The instrument lessons, which outlived the fixes

- **A luminance-spread statistic reported a surface as a 743% improvement while its marks dissolved
  into white haze.** A gradient had spread carrying no information. Chroma percentiles catch it.
- **The capture sweep's numbers depended on the time of day.** The same commit measured one surface
  as catastrophically worse, mildly worse, and 211% *better*, because the globe's frame is aimed by
  the reader's clock. The clock is now frozen; before that, every published per-surface figure was
  unreproducible.
- **Three separate guards stopped guarding without going red**: a census that skipped the correctly
  guarded case, a predicate that stopped discriminating when a second surface adopted the same
  function for a different purpose, and a screenshot that waited on a heading and photographed a
  canvas.
- **Three of the four "worse in light" defects were misdiagnosed in their own briefs.** Each agent
  found that by segmenting or ablating before touching anything. The one that was not misdiagnosed
  had a cause nobody had proposed.

The current per-surface state is in `docs/3d/FINAL_SCORECARD.md`, measured on the deterministic
sweep. What remains for the owner is in that document and in the pen-test addendum.
