# 3D VFX FINAL PLAN

> **Supersedes as a planning document:** `PLATFORM_VFX_100X.md`, `3D_WORK_100X.md`, `3D_VFX_1000X.md`,
> `3D_VFX_100X_HANDOVER_BLUEPRINT.md`. Those stay in the repo as the record of what was decided and why.
> **Status:** **APPROVED END TO END and executing.** All seven §7 decisions taken — recorded in
> `3D_VFX_1000X.md` §11.1. One item (F0, the §7(b) trial) is built, verified and **blocked on a person**:
> the instrument is its own answer key, so whoever built the surfaces cannot be the operator. See
> `docs/3d/e9/RUNNING_THE_TRIAL.md`.
> **Written:** 2026-08-13, after auditing the handover blueprint line by line against the shipped code.
> **§10 below records what execution actually found**, including four shader defects the blueprint never
> mentioned and one structural gap larger than the item this plan had named.

---

## 0 · THE FINDING THAT DECIDES THIS ENTIRE DOCUMENT

You gave me a blueprint proposing a 6-layer graphics architecture and eight signature environments. I audited
every layer against the repo. **Roughly nine-tenths of it is already built and live.**

That is not a criticism of the blueprint. It is the single most important fact about it, because a plan that
treats built work as new work spends weeks re-specifying 4,400 lines of shipped component code and calls the
result progress. So this plan starts by saying exactly what is already true.

| Blueprint asks for | Status | Evidence |
|---|---|---|
| L1 · one shared GL context at `flat/shared.ts` | **built** — and it *is* that file | `packages/gl/src/flat/shared.ts:53-66` |
| L1 · `SCISSOR_TEST` + `gl.scissor(x,y,w,h)` | **built**, already in the render path | `flat/shared.ts:111-114` |
| L2 · linear HDR working space, float targets | **built** | `look/pipeline.ts`, `env/target3d.ts` |
| L2 · single tone-map composite pass | **built** — `toneMapComposite` | `look/tonemap.ts` |
| L2 · bloom accumulated in linear | **built** | `stage.ts` (`bloomA`/`bloomB`), `look/pipeline.ts` |
| L2 · brand hex invariant `assertBrandFidelity` | **built**, plus `brandUnderIllegalToneMap`, `dataRoundTrip` | `look/colour.ts` |
| L3 · GGX specular + Schlick Fresnel | **built, and goes further** — Smith G, anisotropic, analytic-sky IBL | `env/lit.ts:201-274` |
| L3 · PCF shadows with slope-scaled bias | **built** | `env/lit.ts:233-243` |
| L4 · GPU-side simulation, 10k+ points | **built** in WebGL2, not WebGPU | `env/particles.ts`, `env/volume.ts` |
| L5 · SDF primitives with `fwidth` subpixel AA | **built** | `flat/bars.ts:113`, `flat/strokes.ts` |
| L5 · "re-back the 13 core 2D chart primitives" | **10 of 11 done**, incl. the 40px `Sparkline` | see §1.5 |
| L6 · analytic height fog | **built**, analytic along the ray | `env/lit.ts` |
| L6 · half-res CoC gather DoF | **built**, per-sample CoC weighting | `env/dof.ts` |
| L6 · zero idle motion, reduced-motion snap | **built AND enforced by test** | `env/harnessRules.test.ts:110` |
| §3 · all eight environments E1–E8 | **all eight live** | commit `175709c`; verified deployed today |
| Phase 0 · 10k instanced points at 60 fps on Apple Silicon | **measured 4.406 ms/frame, 227 fps** | `docs/3d/p1/README.md:27` |

Verified independently an hour before writing this: **15 of 15 GL chunks reachable on the deployed site**, each
carrying its shaders, zero GL bytes in the eager set.

**What is genuinely unbuilt is small, specific, and listed in §4.** The largest single item in this plan is not
a feature at all — it is a measurement nobody has taken (§4.1).

---

## 1 · THE AUDIT, LAYER BY LAYER

### 1.1 · Layer 1 — the blueprint reverses a decision that shipping code already overturned

The blueprint proposes mounting **one page-sized canvas behind the UI** (`position:fixed; z-index:0`) and
scissoring every visualiser into it.

`PLATFORM_VFX_100X.md:141-142` originally said exactly that. The implementation **deliberately diverged**, under
a named heading, and recorded why (`flat/shared.ts:14-21`): a page-level canvas

> "has to track scroll, stacking context, overflow clipping and every card that animates, and it breaks the
> moment a chart sits inside a scroll container or a modal — both of which this app has."

That premise is verifiable and true. `apps/web/src/pages/KpiDashboard.tsx:228` is `flex-1 overflow-y-auto` and
wraps a `DonutChart` and a `ColumnChart`; `BoardReport.tsx:249` is another. There is a second, harder blocker:
the GL layer sits **inside** each chart's stacking context, *below* that chart's SVG, because text, values,
tooltips, hit targets and the accessibility tree all live in that SVG (`charts/gl/FlatBars.tsx:158-161`). A
single canvas at `z-index:0` cannot be simultaneously *above* an opaque card fill and *below* that SVG.

And the stated motivation — "multiple canvases exhaust the 8–16 context cap" — describes a repo state that has
not existed for months. Charts share one context; only the 3-D reliefs take their own, at most two per route,
both defaulting off. **Worst-case live context count is 3, against a cap of 8–16.**

> **Verdict: the code. Layer 1 is closed, and re-litigating it would undo a documented decision without
> engaging any of its four reasons.**

**The one real seam the blueprint did find** is buried in this layer: it asserts the 3-D views should join the
same unified pass. As built they cannot — the shared stage carries `scene`/`bloomA`/`bloomB` with `alpha:true`
and *no depth buffer* (`stage.ts:135-137`, `:158-166`), while the reliefs need depth, a shadow map, AO and DoF
targets. Unifying is possible but is a **Stage redesign, not a canvas change**, and nobody has costed it. See
§4.6.

### 1.2 · Layer 2 — built; two named absences

Linear HDR, float targets, the single tone-map composite and the brand-hex invariant are all implemented, and
the brand invariant is stronger than the blueprint describes: `brandUnderIllegalToneMap` proves the hex survives
even a wrong tone curve. **Subsurface scattering is not implemented** — the blueprint lists it in passing, and
no dataset in this programme calls for it. Recommend dropping it from scope rather than carrying it as debt.

### 1.3 · Layer 3 — a restatement, and the blueprint's own formulas are the weaker ones

Three of the blueprint's specifics are wrong against the implementation, and **the code is right in all three**:

1. **It enumerates only D and F.** The implemented BRDF is `D*G*F / (4·NdotV·NdotL)` (`lit.ts:215-221`, `:274`).
   D·F alone is not a BRDF and cannot conserve energy — without Smith G and the normalisation the specular
   diverges at grazing angles. The blueprint says "energy-conserving" while omitting the two terms that make it so.
2. **Its `a` is undefined.** The code binds `alpha = roughness²` (`lit.ts:201`), the Disney/Burley perceptual
   remap. Both readings satisfy the blueprint's literal text; implementing the wrong one makes every material
   read far glossier. **This must be pinned before anyone writes code from that formula.**
3. **Its shadow bias is ~an order of magnitude too large.** Blueprint `max(0.05·(1-NdotL), 0.005)` versus
   implemented `max(0.0009, 0.0045·(1-NdotL))` (`lit.ts:233`) — 11.1× and 5.6× smaller. The light projection is
   **orthographic and therefore linear in depth** (`camera.ts:126`), so the blueprint's figure — a
   perspective-projection rule of thumb — would introduce visible peter-panning.

What Layer 3 does *not* mention is the four things actually missing: **split-sum DFG, multiscatter
compensation, `kd` on environment diffuse, and contact hardening.** If Layer 3 is kept at all, that is its
content.

### 1.4 · Layer 4 — the only wholly-unbuilt architecture in the blueprint

**There are zero references to WebGPU anywhere in this repo.** Particles and volumetrics use WebGL2 ping-pong
float textures, chosen for a specific reason: `readState()` makes claims assertable, and it has already caught
two real bugs by counting live particles against the expected total (`env/particles.ts:189`).

The blueprint's targets are already met or exceeded by the existing path: **4.406 ms/frame, 227 fps at
3200×1480** for 10,000 instanced gaussian deposits plus a bright pass and four separable blurs, on a real
**M1/8 GB via ANGLE Metal** (`docs/3d/p1/README.md:27`). The blueprint asks to verify 60 fps for 10,000 points;
that was P0/P1's job and it returned 227.

So WebGPU would be a **second rendering backend**, maintained in parallel, to reach numbers the WebGL2 path
already reaches. See §7.2 — this is a decision, not a task.

### 1.5 · Layer 5 — the blueprint's best idea, and it is already nine-tenths done

The blueprint's strongest claim is that *every* visual, "whether a 40px sparkline or a 3D orbital graph", must
pass through the render pipeline. It is right, and the repo already agrees:

| Chart primitive | GL-backed today |
|---|---|
| BarChartH, ColumnChart, CompareBars, ControlBand, DonutChart, FunnelChart, GaugeChart, Histogram, **Sparkline**, StackedBarH | **yes** — via `FlatBars`/`FlatLine`/`FlatBand`/`FlatDial`/`FlatTrack` |
| TrendDelta | **no — and correctly so.** 100% text, no SVG mark, 661 px² against the smallest GL surface's 1,920. Refused on measurement; see §4.4 |
| ChartCard, StatCard, tooltip | n/a — containers, not primitives |

**10 of 10 that have a mark**, plus one documented exclusion. I first wrote "10 of 11", which counted
TrendDelta as a primitive because of where it lives rather than what it draws. SDF with `fwidth` subpixel AA is implemented, and `flat/bars.ts:105-113` records a fixed bug worth
knowing: the obvious `fwidth(d)` form is wrong because `sdRoundRect` has a gradient seam at the corner arcs, so
the feather must be taken on `p`, which is linear in `vUV`.

Phase 1 of the blueprint is therefore **one component** (§4.4), not thirteen.

### 1.6 · Layer 6 — built, and the motion grammar is enforced rather than described

Fog is analytic along the ray and applied in linear radiance *before* the tone map; DoF is a half-res gather
with per-sample CoC weighting. The motion grammar is not merely written down: `harnessRules.test.ts:110` **bans
`requestAnimationFrame` and `setInterval`** in environment entry points, and `scripts/3d-audit.mjs:131` wraps
rAF on the live page to prove reduced motion resolves to a final frame.

God rays remain deliberately unbuilt with an argument on the record (`3D_VFX_1000X.md:330`): a light shaft
"carries no information about any dataset in this programme". E7 is named as the one place they could earn it —
a shaft attenuated by the risk field reads as *where the field is dense enough to block light*. See §7.5.

### 1.7 · Invariant 4 — the "<45 KB" cap cannot mean what it says

**45 KB is the budget for one lane (L1 renderer), not the engine** (`docs/3d/p1/build.mjs:44`). The engine has
six budgeted lanes allocating 147 KB and measuring **76.6 KB (78,416 B)**. Against three.js at **513.3 KB** for
the same job.

The invariant is unsatisfiable in one reading and vacuous in the other:

- As an **engine cap** it is 1.7× breached, and enforcing it literally means deleting L4 env (37.4 KB), L3.5
  particles (10.8 KB) and L4.5 field (8.6 KB) — that is GGX lighting, shadows, AO, DoF, sky, particles and
  volumetrics. It would delete Layers 3, 4 and 6 to satisfy Layer 4's own budget line.
- As an **initial-JS cap** it is trivially true: `@lcx/gl` contributes **zero bytes** to initial JS. The
  deployed document declares exactly three JS resources and none is a GL chunk — verified live today.

**Recommendation: replace it with the two budgets that are real** — the per-lane table in `docs/3d/p1/build.mjs`
(enforced by `npm run gl-budget`) and the initial-JS ceiling of **839/850 KB with 11 KB of headroom** (enforced
by `npm run perf-budget`). Both already fail the build when breached.

While auditing this, a repo-internal problem surfaced that this plan should fix: **three documents carry three
stale spine figures** (17.5 KB, 17.6 KB, "45 KB unspent"), and the number "45" now means three different things
— L1's lane budget, the original whole-engine estimate, and the spine's unspent headroom. See §4.5.

---

## 2 · WHAT THE BLUEPRINT OMITS, WHICH MATTERS MORE THAN WHAT IT PROPOSES

The blueprint lists **three** invariants (DOM typography, refusal fallbacks, gaps-never-zeros). The programme
has **eight rules and a two-clause gate** (`3D_VFX_1000X.md:239-268`). The blueprint's three map onto rules 4,
1 and 6. Missing: rule 2 (no idle animation), rule 3 (reduced motion → final frame), rule 5 (brand hex exact),
rule 7 (one shared GL context), rule 8 (every claim gets a capture) — **and the whole of §7, the gate:**

> **(a) A stranger stops scrolling.**
> **(b) An operator still gets their answer at least as fast as the flat version.**

Clause (b) is the anti-showreel clause. It is the only mechanism that has ever stopped this programme shipping
something that looks expensive and reads worse. It is why all eight environments default **off**.

**A plan that adds volumetrics and a second GPU backend while dropping clause (b) is precisely how this work
gets worse rather than better.** §4.1 is therefore the first item, ahead of every feature.

One more omission, in the opposite direction: the blueprint states DOM typography as a satisfied invariant. The
repo is more honest — `harnessRules.test.ts:158-161` pins the set of environments with no projected DOM text at
exactly `'e0,e2'` — an honest ratchet that stops the violation growing while recording that it exists.
Adopting the blueprint's wording verbatim would silently mark a tracked violation as resolved.

> **CORRECTION, 2026-08-13, and it is mine.** I wrote here and in §7.4 that E2 "bakes label text into a
> texture". **It does not, and could not.** `LIT_FRAG` has no texture sampler and `Material` carries no map
> of any kind — the same absence that leaves E2's earth a plain blue ball. E2 rendered **no text at all**,
> and `docs/3d/e2/build.mjs:19-23` records why as a deliberate decision rather than an oversight: eight of
> its city labels sit within eight degrees of each other, which at that camera is ~23 px apart — closer than
> the labels are wide — and *"projected text without a collision policy is text that reads as broken."*
>
> So the violation was real but the mechanism was the opposite of what I described: there was nothing to
> unbake, there was a layer to write. It has now been written (projection from the same matrix, hard hide by
> the report's own limb dot product, fade normalised on the same quantity, a radial fallback with leader
> lines for labels that cannot sit beside their dot, and every unlabelled site stated in DOM prose with its
> coordinates and the reason). The ratchet is flipped to `'e0'`.
>
> Worth keeping as an entry in this document's own error log: I asserted a mechanism I had not checked,
> from a test assertion that only ever said "no projected DOM text" and never said why.

---

## 3 · WHAT THIS PLAN IS, THEN

Not a build-out. A **closing plan**: measure the thing that gates everything, fix four specific defects the
audit found, finish the one chart primitive left, and refuse or scope the one genuinely new architecture.

---

## 4 · THE REAL WORK, RANKED

### 4.1 · Measure §7(b) on all eight environments — *the highest-value item in this document*

**Cost: ~20 minutes of one operator's time. Blocks: the honest status of all eight environments.**

The instrument exists and is verified: `docs/3d/e9/task.html` — same page for both surfaces, counterbalanced,
matched question pairs, clock starting when the surface appears, refusing on too few trials or unequal accuracy.
**No operator has run it.** It cannot be run by whoever built the surfaces, because the file is its own answer
key. My own attempt returned 6/6 versus 0/3 and I declared it invalid on four defects of mine.

Until this runs, every one of the eight ships behind a toggle defaulting off with the label "nobody has yet
timed whether it answers faster than this grid" — which is honest, and is also a permanent asterisk on three
weeks of work. One trial converts eight hedges into eight verdicts, in either direction.

### 4.2 · Fix `shadowTaps`: the quality ladder promises perf it does not deliver

`env/quality.ts:83` declares `shadowMapSize: 512, shadowTaps: 1` for the minimum tier. **No code path reads
`shadowTaps`** — the PCF loop in `LIT_FRAG` is hard-coded to 9 taps. So the minimum tier pays 9× the shadow cost
it advertises, on exactly the machines that cannot afford it. Either wire it in or delete the field; a config
value nobody reads is worse than no config value, because it reads as a guarantee. **Owner call in §7.3.**

> **DONE, and this section is now stale in a useful way.** `lit.ts` reads `uShadowTaps` as two static
> branches and all nine harnesses pass `Q.shadowTaps`.
>
> **The defect class was wider than this one field, and is now CLOSED.** Wiring the ladder into the app
> turned up four more settings nothing read — and one of them was worse than unread.
>
> | field | verdict | why |
> |---|---|---|
> | `shadowMapSize` | **wired** | **Two ladders, disagreeing, neither aware of the other.** `shadowMapSizeFor` hard-coded factors 1 / 0.5 / 0.25 while the ladder declared 1536 / 1024 / 512 = 1 / 0.667 / 0.333. A test asserted the declared one; every shipped shadow map came from the other. I never flagged this one. |
> | `volumeLightSteps` | **wired in E7, and floored at 1** | E7 passed a literal 6. And the minimum rung declared **0**, which `volume.ts` returns full transmittance for — losing the lit top and dark underside that its own comment calls "the entire cue that makes a volume read as having VOLUME". The ladder shipped the one value that rung may not take. |
> | `particleCapacity` | **deleted** | E3 needs **956 particles simultaneously alive**; minimum's 512 slots cap the live count at 53.6% — a data change, not a saving. And capacity is fixed by the emitter's arithmetic (`slots / emissionPerSec` must exceed the longest life), which a tier cannot know. |
> | `volumeMaxSteps` | **deleted** | At a fixed world step, steps are **reach**, not quality. E7's box is 14.00 m in z and it prints `marchReachM` 16.0; 96 steps reach 12.0 m and 48 reach 6.0 m. Both truncate while the printed sentence still claims 16.0, so distant days would read as lower risk than they are. |
> | `aoScale` | **deleted** | 0.5 in all three tiers — it could not vary anything even in principle, and AO is off entirely at minimum. It was never a tier field. |
>
> `gl-budget` delta: **0 bytes.** And the 230-byte particles margin turned out not to be the argument against
> wiring `particleCapacity` — the 956-particle reading was; `quality.ts` is in no lane at all.
>
> The new ratchet enumerates fields from `Object.keys(qualitySettings('full'))` rather than a hand-list,
> because a hand-list cannot fail on a field nobody thought of — which is how all five got in.

### 4.3 · Fix the anisotropic roughness discontinuity

`env/lit.ts:265-266` derives `at`/`ab` from **perceptual** roughness (`rough*(1±aniso)`) and passes them as
**alphas**, while the isotropic branch applies `alpha = rough²` internally. So as `aniso → 0⁺` the material does
not converge on the isotropic result — there is a visible step. E8's mark uses the anisotropic path. Latent
today; a Layer 3 rewrite would either fix it or entrench it.

### 4.4 · ~~GL-back `TrendDelta`, closing Layer 5 at 11 of 11~~ — **REFUSED on measurement**

**Outcome: TrendDelta stays outside the GL path, as a recorded hand exclusion. Layer 5 closes at 10 of 10
primitives that have a mark, plus one documented exclusion — not 11 of 11.** I had this wrong: I counted
TrendDelta as a chart primitive because it lives in the charts directory.

**It has no mark to re-back.** It is a `<span>` with a font glyph (`▲`/`▼`, `aria-hidden`) and a number.
There is no `<svg>` in the file — no path, rect, polyline, arc or circle. Measured at its real classes,
**100% of the ink is text**, and the box has no stable size: 41.34 / 53.72 / 39.17 CSS px for 4.2% / 124.7% /
0.1%. Every one of the ten GL-backed primitives hands the renderer a geometric fill it already drew in SVG,
in viewBox units. There is nothing here to hand over.

Three further reasons, each already on the record:

1. The only candidate mark — a good/bad tint plate — was settled at `gl/FlatBand.tsx:16-20`: an additive
   pass writes full coverage into alpha, so a tint "would land on the card as a solid block of hue rather
   than a wash". `Sparkline` declined its own area wash for the same reason.
2. The other candidate is baking text, and **the ratchet is now at zero** — `'e0'` since E2 was fixed this
   session. An SDF triangle here would be the surface that reopened it.
3. **The threshold `PLATFORM_VFX_100X.md` §7.2 says was never built, measured at last.** The smallest thing
   GL backs is the StatCard `Sparkline` at 80×24 = 1,920 px². The chip is **661 px², 2.90× smaller.** And
   `stage.setRegion` short-circuits *only* on an identical size, so with three different chip widths at
   dpr 2 (83 / 107 / 78 device px) **no two consecutive chips hit the fast path** — a full target-set
   reallocation, three framebuffers and three textures deleted and six allocated, per chip per frame, for
   zero marks. Chips are the most numerous primitive in the product: 16 across three routes.

`docs/3d/w0/README.md:43-45`, the audit that ranked these eleven, reached the same verdict from the other
side: TrendDelta's one filed finding is "**not** fixed by a new renderer".

**And refusing it found a real defect that shipping GL would have papered over.** `Math.abs()` strips the
sign and the glyph is `aria-hidden`, so **+4.2% and −4.2% produced the identical accessible name, "4.2%"** —
lost to every screen reader, to text extraction and to copy-paste. Colour was not a second cue: simulating
deuteranopia on the real tokens collapses their separation from **ΔE76 121.3 to 13.5** at a contrast ratio of
**1.16:1**. Fixed with an `sr-only` direction word, at a cost of +16 B gzip, and the dpr-2 screenshot is
byte-identical by SHA-256 so no Playwright snapshot moves.

### 4.5 · Retire the three stale spine figures and the three meanings of "45"

`docs/3d/p1/README.md:29-32` publishes L1 10.4 / L2 5.3 / L3 1.7 / spine 17.5 KB and "45.5 KB under". Current
measurement is 76.6 KB. Two other documents carry 17.6 KB and "45 KB unspent". Fix by generating those tables
from `gl-budget` output rather than transcribing them — the same fix that stopped E1 printing E0's frame time.

### 4.6 · Cost the unified-stage question, and only then decide it

The blueprint's one genuine architectural find (§1.1). Deliverable is **a costing, not an implementation**: what
a depth-and-target-set-carrying shared Stage would cost in bytes, in refactor risk to five post-process passes,
and whether any environment actually benefits. If nothing benefits, that is the answer and it gets written down.

### 4.7 · Optional, with a reason: god rays in E7 only

Not as an effect. As the reading described in §1.6 — a shaft attenuated by the risk field. If it cannot be
stated as a sentence about the data, it does not ship. **Owner call in §7.5.**

---

## 5 · PHASES

Each ships something you can look at, and none begins before the §7 answers it depends on.

| Phase | Content | Gate |
|---|---|---|
| **F0** | §4.1 — the §7(b) trial, run by an operator who is not me. Results written into `3D_VFX_1000X.md` §10.3, replacing "unmeasured". | Eight verdicts, or a documented refusal with the reason |
| **F1** | §4.2, §4.3, §4.4 — the two shader defects and the last chart primitive. Each with a capture at real aspect ratio (rule 8). | `gl-budget` + `perf-budget` green; captures show before/after |
| **F2** | §4.5 — budget figures generated, not transcribed. | No hand-written byte count survives anywhere in `docs/3d` |
| **F3** | §4.6 — the unified-stage costing, as a written decision. | A number and a recommendation, not a refactor |
| **F4** | Whatever §7 authorises: WebGPU spike, split-sum DFG, god rays, E2's text. | Each individually gated on §7(b) not regressing |

**F1 does not start until F0 reports**, because an environment that fails clause (b) is not one to spend shader
work on.

---

## 6 · WHAT WILL FAIL, HONESTLY

1. **§7(b) may come back negative for several environments.** That is the point of measuring, and I will report
   it plainly. The likeliest casualties are E1 (its own README already records the focus-rack trade as "a real
   tension, not a gap") and E6.
2. **A single operator is n=1.** The instrument refuses on unequal accuracy, which protects against the worst
   failure, but eight environments × one person is a weak result. It is still infinitely stronger than nothing.
3. **The anisotropic fix may change E8's appearance.** The sign-in screen is the one surface every visitor sees.
   Fixing a discontinuity is correct, and it will alter a look you have already approved.
4. **11 KB of initial-JS headroom is nothing.** Any new eager code fails the build. Every item here must land in
   a lazy chunk, and §4.4 touches a component that appears on many routes — that is the one with real budget risk.
5. **I have now been wrong about this question five times**, in both directions. The correction is in the gates,
   not in this prose.
6. **M2/M3 have never been measured.** Every frame-time figure in this repo is M1/8 GB. If your audience runs
   anything else, the quality ladder is doing work nobody has verified.

---

## 7 · WHAT ONLY YOU CAN DECIDE

Seven questions. Five are one-liners; two are real.

1. **§7(b) trial — will you run it, or find one operator who will?** *(~20 min, unblocks F1 and eight
   verdicts.)* Recommend: yes, this week. Everything else in this plan is worth less than this.
2. **WebGPU — adopt a second backend, or refuse it?** Recommend **refuse, and write down why**: the WebGL2 path
   already returns 227 fps for the blueprint's 10,000-point target, WebGPU is zero-referenced in the repo today,
   and a parallel backend doubles the surface that must satisfy all eight rules. Revisit only if a dataset
   appears that WebGL2 genuinely cannot carry.
3. **`shadowTaps` — wire it in, or delete the field?** Recommend **wire it in**: the minimum tier exists for
   weak machines and is currently paying full price.
4. **E2's missing label layer (rule 4) — build it, or accept as permanent documented debt?** Recommend
   **build**, because rule 4 is the accessibility and print path, not a stylistic preference. *(Corrected:
   this said "baked label text". E2 baked nothing — see the correction in §2. The work was to write a
   collision-and-occlusion policy, which is why it had been deferred rather than botched.)* **DONE.**
5. **God rays in E7 — yes on the information argument, or no?** Recommend **no for now**; it is the only item
   here that would exist to look expensive, and it can wait behind §7(b).
6. **E8's mark — procedural forever, or spend the Blender time and ~40 KB loader?** *(Standing since
   `3D_VFX_1000X.md` §10.1; the GLTF route was recommended and never taken.)* Recommend **procedural**, given
   the 11 KB of initial-JS headroom.
7. **Do you want Layer 1 re-litigated?** Recommend **no** — §1.1 gives four reasons the page-mounted canvas
   fails specifically in this app. I will implement it if you overrule that, but I would be undoing a decision
   the code won on evidence.

---

## 8 · THE FIRST THING I DO ON YOUR ANSWER

If §7.1 is yes: I send you the trial link and a two-line instruction, and I do not touch the renderer until the
numbers come back — because the first thing that should happen to eight environments defaulting off is finding
out whether they deserve to default on.

If §7.1 is no: I start at §4.2, and the eight toggles keep their honest label permanently.

---

## 9 · WHAT I AM NOT DOING, AND WHY

- **Not rebuilding E1–E8.** All eight ship. Verified live today: 15 of 15 GL chunks reachable, zero eager.
- **Not adopting "<45 KB total".** Unsatisfiable in one reading, vacuous in the other (§1.7).
- **Not moving to a page-mounted scissored canvas.** Overturned on evidence (§1.1).
- **Not implementing subsurface scattering.** No dataset here calls for it.
- **Not implementing the blueprint's shadow bias or bare D·F BRDF.** Both are worse than what ships (§1.3).
- **Not treating the blueprint's three invariants as the invariant set.** Eight rules and a two-clause gate, or
  the anti-showreel protection goes with it (§2).


---

## 10 · WHAT EXECUTION FOUND — appended as it happened

The plan's value turned out to be less in the items it listed than in what looking at them properly exposed.

### 10.1 · Four defects in the lit shader; the blueprint named none of them

Two were §4.2 and §4.3. **The other two were found by the test written to prove the second one** — which is
the argument for mirroring shader algebra in TypeScript rather than pinning the source with a string match.

| # | defect | consequence | status |
|---|---|---|---|
| 1 | `shadowTaps` declared in `quality.ts`, read by nothing | the minimum tier paid 9 texture fetches per lit fragment for a 1-tap result it had asked for | fixed; all nine harnesses pass `Q.shadowTaps` |
| 2 | `at`/`ab` derived from perceptual roughness and passed as alphas | crossing `aniso > 0.001` jumped alpha `rough²`→`rough`, widening the lobe; E8's mark uses this path | fixed |
| 3 | anisotropic guard `max(1e-8, v2)` above `v2`'s real floor of `1.6e-11` | smooth materials near the peak returned ~⅔ of correct intensity | fixed |
| 4 | isotropic guard `max(1e-6, PI*d*d)` above a real floor of `5.3e-11` — five orders out | **live on the sign-in screen.** Fired for roughness < 0.154 inside `NdotH > 0.9997`. `ForgeBackdrop` 0.13, `e8` 0.13, `e2` 0.14 → peak **3.9× too dim**; 18,930× at the clamp | fixed |

Defects 2 and 4 compounded on the same material. E8's mark had both a **blurred and a clipped** highlight —
most of the difference between machined metal and grey plastic.

### 10.2 · The quality ladder is in all nine harnesses and none of the shipping app

Larger than §4.2, which is what led to it. `3D_VFX_1000X.md` §10.1 records the ladder as the decided answer,
"wired into all nine" — true of the nine harnesses, **false of the eight shipping components**, every one of
which hard-codes `createShadowMap(stage, 1024)` and full-quality AO and DOF. A weak machine gets the full
frame with no degradation available. The ladder was never carried across the promotion into the app.

And the harnesses do not adapt either: each reads the tier from a URL parameter defaulting to `full`, and
`pickQualityTier` — which needs a *measured* frame time and refuses to guess — is called by nothing. So
"wired into all nine" has always meant **parameterisable, not adaptive.**

### 10.3 · §7(b) covers six environments, not eight, and that is correct

The plan said "measure §7(b) on all eight". Building it out showed that was wrong in two places, both
category errors rather than gaps:

- **E8 THE FORGE is NOT APPLICABLE.** Clause (b) asks whether an operator gets *their answer* faster. E8 is a
  machined disc, a ring and a plinth; it carries no dataset and answers no question. Gated on (a) alone.
- **E1 THE THEATRE is DEFERRED with a reason.** Its panel text is injected from other environments' READMEs
  at *build time*, so an answer key would rot on the next rebuild — and a stale key does not fail loudly, it
  marks correct answers wrong and reports a legible surface as illegible.

The instrument was **extended from 4 environments to 6** (E2 and E3 added; answers derived from the datasets,
not read off the render — E2's from computing seven great-circle distances from Vaduz). Verified: 12 trials,
2 per environment, counterbalance even at 3/3, **0 duplicate questions**, every answer among its own options,
all 12 surfaces serving 200. `docs/3d/serve.mjs` and the `3d-trial` launch config make it one command.

Also fixed while there: the Begin button read **"Begin — 8 trials"** as a literal. True for the four
environments the set started with, wrong the moment two more were added — the same class of defect as E1
rendering E0's frame time under a printed checkability claim. It is now derived.

### 10.4 · The blit claim does not survive measurement — and it was load-bearing

`flat/shared.ts:18-21` justified choosing the offscreen-plus-blit architecture over the blueprint's
page-mounted scissored canvas partly on cost: the `drawImage` blit "costs one texture copy per chart per
redraw, which is a rounding error against a frame that already runs five post-process passes." That sentence
is repeated in `docs/3d/w2`'s README and in a commit body, and **nothing had ever measured it.**

Measured now, on a real M1 through ANGLE Metal at dpr 2, two runs, with a warm-up frame and a trailing
`readPixels` (the only reliable sync — `gl.finish()` returns on command-buffer flush):

| arm | run 1 / run 2 |
|---|---|
| chart frame **without** the blit | 0.518 / 0.503 ms |
| chart frame **with** the blit | 1.162 / 0.970 ms |
| **the blit alone** | **0.643 / 0.467 ms — 0.9× to 1.2× the whole rest of the frame** |
| blit at buffer 1024×512 / 2400×920 / 3200×1600, chart fixed at 480×160 | 0.643 / 1.373 / **2.368** ms |
| 60 charts, blit total | 31.65 / 28.59 ms — flat at ~0.5 ms per chart |

**"A rounding error" is false by roughly a factor of a thousand in framing:** the copy costs about what the
five post-process passes plus the geometry cost. And worse, **it is sized by the offscreen buffer, not by the
chart.** The buffer is grow-only, so a 40 px sparkline on a page that also holds one large chart pays
**2.368 ms per redraw** to copy a region it does not use. That is precisely the hazard
`docs/3d/w2/README.md:314` raised and could not settle.

**What survives, and what this does and does not change.** The half of the claim that held is per-chart
flatness — 60 charts cost 60× one chart, not worse. And **the architectural decision still stands**, because
its two real reasons were never about cost: a page-mounted canvas cannot track scroll containers and modals
(both of which this app has), and it cannot be simultaneously above an opaque card fill and below the chart's
own SVG, where the text and the accessibility tree live. Those are unaffected by a millisecond figure.

So this is not a reversal. It is a false supporting argument removed, plus a real and previously invisible
performance defect: **the grow-only buffer taxes every small chart on any page containing a large one.**
Named here as newly-found work rather than fixed in passing, because the fix is a measured design change —
size-bucketed buffers, or a readback path for small regions — and this programme's rule is that a change to
a shipped surface starts from a measurement, not from an intuition about what is cheap.

Two further findings from the same measurement, both new:

- **`stage.setRegion` reallocates on any size change**, and it costs *more than the blit itself*: four charts
  alternating two sizes over three redraws allocated **39 textures against 6**, adding 2.8–5.8 ms per redraw.
  It happens per animation frame during `useFlatChart`'s 420 ms entrance.
- **`stage.dispose()` never calls `WEBGL_lose_context.loseContext()`**, so a context is reclaimed only when
  its canvas is garbage-collected. Toggling a relief off and on can hold more live contexts than there are
  mounted components — against a cap where exceeding it kills the *oldest*, which on a chart route is the one
  shared context every chart depends on.

### 10.5 · The interface colours failed WCAG on the default theme, and the ratchet could not see them

The eight relief wrappers were painted for a dark deck. **The app defaults to light** — `index.html:11-19`
adds `.dark` only from stored preference, and `CommandDeck.tsx:81-83` strips it deliberately for printing.
Worse, **`--brand` and `--rule` are not defined anywhere** in `apps/web/src/styles/`, so every
`var(--brand, #7FB2FF)` in those files was a literal wearing a token's clothes.

Measured against the real surfaces (WCAG 2.x relative luminance, `rgba()` composited as the browser does):

| shipped colour | light card | needs |
|---|---|---|
| refusal alert `#E0A94A` — the message rule 1 exists to deliver | **2.11** | 4.5 |
| opt-in reason `rgba(196,212,240,.66)` | **1.30** | 4.5 |
| E4's crossing count `#BFD6FF` — the number that environment lives on | **1.47** | 4.5 |
| "unavailable" label `#6B7A99` | 4.31 | 4.5 — fails on all four surfaces |

All three also *printed* at those ratios, because printing forces light. The existing ratchet at
`lib/__tests__/contrast.test.ts` could not have caught any of it: it parses `tokens.css`, and these were
literals in a `style` prop. Fixed to existing tokens, and the source is now scanned for interface hex.

Four accessibility defects came with them, all fixed. The sharpest: **`disabled` was being set on the
focused button.** `onRefused` fires one tick after the reader pressed Enter, and disabling a focused element
blurs it — `document.activeElement` becomes `<body>` and the next Tab restarts from the top of the document.
On `PipelineRelief` that also drops the reader out of the table its triage keys act on. Now `aria-disabled`
with a guarded handler. Also: `aria-pressed` contradicted the accessible name, so
`<button aria-pressed="true">Flat deck</button>` announced *"Flat deck, pressed"* — the name asserting one
surface and the state bit the other.

**Colour-vision safety came back clean**, which is worth recording as a negative result: Machado–Oliveira–
Fernandes at severity 1.0 in linear RGB, then CIEDE2000, over every data pair. One encoding was colour-alone
(the toggle's enabled-vs-unavailable state) and now carries `border-dashed` as well. Every *data* encoding is
redundant with position, shape, a ring, or a DOM caption. No brand hex was touched.

### 10.6 · THE RED TEAM REFUTED MY HEADLINE CLAIM, AND IT WAS RIGHT

I ran an adversarial pass over the four shader fixes precisely because two of the four were found by accident
while testing the other two — which is the situation where a fifth is likely still sitting there. It came back
with one refutation, one regression I had caused, and two corrections. All four are recorded here rather than
quietly patched, because the commit message for `38c01b1` is now partly wrong and that matters more than the
code.

**REFUTED — "defect 4 was live on the sign-in screen" is false.** I claimed the isotropic guard
`max(1e-6, PI*d*d)` was clipping the LCX mark's highlight 3.9× too dim on `ForgeBackdrop`, `e8` and `e2`.
Those three materials carry `anisotropy` 0.72, 0.72 and 0.8, and `lit.ts:514` routes anything above 0.001 to
`distributionGGXAniso`. **They never call `distributionGGX` at all.** The isotropic guard could not have
touched the sign-in screen, and I asserted a code path without checking which branch the material took — the
same error as the E2 texture claim in §2, twice in one day.

The arithmetic *around* the claim was right (threshold `rough < 0.154119`, factors 3.902× at 0.13 and 18,930×
at the clamp, and the guard reached 1.53× the lobe half-width so it flattened the whole core, not an edge).
The fix is still correct and still worth having. But the only material in the repo that actually reaches the
isotropic branch below 0.154 is `docs/3d/e0/entry.ts:260` at roughness 0.045, under `?diag=1`. **A latent fix,
not a live one.**

**CORRECTED — defect 3 also had no live effect.** The smallest `v2` floor across all eight lit materials is
1.892e-8, above the old `1e-8` guard. And my derivation was one case short: `(at·ab)²` is not automatically
the floor, because `at` reaches 1.95 at roughness 1 with anisotropy 0.95, so `S_min = 1/at² < 1`. The number
(1.681e-11) survives; the proof did not. Correct latent fix, zero live effect, which the commit does not say.

**A REGRESSION I CAUSED — defect 2's fix silently redesigned eight surfaces.** The algebra is confirmed
(worst float64 disagreement 1.5e-12). But every anisotropic material in the repo was *authored against the
buggy convention*, so correcting it made all eleven of them sharper:

| material | roughness | lobe half-width | peak D |
|---|---|---|---|
| e8 + ForgeBackdrop **disc** | 0.30 | **3.33× narrower** | 13.6 → 150.9 |
| e8 + ForgeBackdrop **ring** | 0.13 | **7.9× along, 7.7× across** | 39.1 → 2314.1 |
| e2 `RING_MAT` | 0.14 | 7.1× | 45.1 → 2301.6 |
| e2 `CORRIDOR_MAT` | 0.22 | 4.6× | 23.7 → 489.7 |

`docs/3d/e8/README.md` states the intent in as many words: *"THE HIGHLIGHT HAS TO TRAVEL. That is the whole
effect"*, the disc is *"brushed, not mirror — a broad travelling highlight instead of a hotspot"*, and it
*"shows a bar of light rather than a dot."* A lobe 3.3–7.9× narrower works against that. So my commit's
framing — that the old code was "most of the difference between machined metal and grey plastic" — is right
for the ring and **backwards for the disc**, whose breadth was the authored intent.

The correct remedy is to fix the *convention* without changing the *design*: re-author each anisotropic
roughness as `sqrt(rough)` so the effective alpha is unchanged (0.30 → 0.5477, 0.13 → 0.3606, and so on
across all eleven), regenerate the captures, and update the README material tables. In progress.

**AN UNADDRESSED RISK — the shadow bias is not scaled by texel size.** `shadowMapSizeFor('minimum', 1024)`
returns **256**, not the `shadowMapSize: 512` the tier declares — the multiplier path wins and the absolute
field is unread, which is the same defect class as `shadowTaps` itself. The bias constants are not scaled by
`uShadowTexel`, so at 256 the required bias is ~4× what it is at 1024. Under 3×3 PCF the residual acne was
averaged into a dither; **at one tap there is no averaging and it becomes hard binary speckle** — on exactly
the tier that just took the 1-tap path, on the machines least able to hide it. And there is **no capture at
the minimum tier anywhere in the repo**: `git show 38c01b1 --stat` contains no `.png` at all, against F1's own
gate wording and rule 8. Being fixed with a capture.

**One risk it raised that was already closed:** the shadowTaps saving reached no shipping surface at
`38c01b1`, because the three React call sites fell through to `?? 9`. The quality-ladder work in `ff3d007`
wired `shadowTaps: Q.shadowTaps` into all of them — verified at `ForgeBackdrop.tsx:276`,
`DeckReliefGl.tsx:553`, `OntologyOrreryGl.tsx:457`.

**What I take from this.** Two of my four claims were about code paths I had not traced, and both were wrong
in the same direction — overstating live impact. The tests I wrote were sound about the *maths* and silent
about *reachability*, which is exactly the gap an adversarial pass exists to find. Reachability is now part of
what a shader claim has to establish before it goes in a commit message.


### 10.7 · The buffer tax is fixed; the `setRegion` thrash needs a `stage.ts` change nobody has costed

The grow-only blit buffer (§10.4) is fixed and measured: quantised to a 256 px grid with a 1024×512 floor,
growing immediately and shrinking only after two quiet frames. **The defect case — a 480×160 chart on a page
whose largest is 3200×1600 — went 1.92 ms to 0.49 ms, 3.9×.**

The cause turned out to be worth stating precisely, because it is the opposite of the intuition: `drawImage`
from a WebGL canvas **cannot sample the drawing buffer in place.** The browser resolves the whole buffer into
a snapshot a 2-D context can read, then applies the source rect to the snapshot. So cost is affine in
**canvas area** (~0.45 ms fixed + ~0.38 ms/Mpx) and **independent of the rect**: an 8×8 copy and a 1600×800
copy off the same 3200×1600 canvas both cost ~2.5 ms — twenty thousand times the pixels for the same money.
It is also one resolve per *modification*, not per copy, and it is not `preserveDrawingBuffer`.

Per-render bucketing was built first and **regressed** — 16.51 ms against 9.07 — because two live bucket
sizes meant four drawing-buffer reallocations per frame at ~1.45 ms each. At eight charts it was a wash, so
there is no chart count at which per-render bucketing is right. That is why the shrink is frame-conditional,
and it is the measurement that forced the design rather than a preference.

**Still open, and it needs a file the fix could not touch.** The other half of §10.4 — `setRegion`
reallocating three framebuffers and three textures whenever consecutive charts differ in size (39 textures
against 6) — cannot be fixed from `flat/shared.ts`. Passing the bucket to `setRegion` would hit its fast path
and delete the thrash, and it is **wrong**: `stage.bindTarget` derives the viewport from the target's own
size, so a bucket-sized `scene` renders a 480×40 chart at 1024×512 scale and the blit copies a window of it —
1.64× too large, bottom rows cropped, nothing thrown. `sharedBuffer.test.ts` pins `setRegion` receiving the
exact chart size for exactly this reason.

The change `stage.ts` would need: **separate the allocation size from the logical region.** `setRegion(w,h)`
keeps `region = {w,h}` so `bindTarget` still sets the exact viewport, while allocating `scene`/`bloomA`/
`bloomB` at a quantised size that only grows — and `bindTarget` then derives the viewport from the region
rather than from the target's dimensions. Named here as an uncosted change to a shared renderer, which is the
kind this programme does not make without measuring first.
