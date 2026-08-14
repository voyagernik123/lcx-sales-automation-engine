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

### Why the fix was not to remove the shift

- **A fixed-point curve is refuted by arithmetic.** Brand blue's blue channel is linear **1.0**. Pinning it
  makes the curve identity at 1.0, leaving zero headroom above — every value greater than 1 clips, which
  deletes the one reason this pipeline has a tone map.
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
