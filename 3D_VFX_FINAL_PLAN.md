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
| TrendDelta | **no** |
| ChartCard, StatCard, tooltip | n/a — containers, not primitives |

**10 of 11.** SDF with `fwidth` subpixel AA is implemented, and `flat/bars.ts:105-113` records a fixed bug worth
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

### 4.3 · Fix the anisotropic roughness discontinuity

`env/lit.ts:265-266` derives `at`/`ab` from **perceptual** roughness (`rough*(1±aniso)`) and passes them as
**alphas**, while the isotropic branch applies `alpha = rough²` internally. So as `aniso → 0⁺` the material does
not converge on the isotropic result — there is a visible step. E8's mark uses the anisotropic path. Latent
today; a Layer 3 rewrite would either fix it or entrench it.

### 4.4 · GL-back `TrendDelta`, closing Layer 5 at 11 of 11

The only chart primitive still outside the pipeline. Small, and it makes the blueprint's best claim literally
true rather than nearly true.

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
