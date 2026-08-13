# 3D WORK 100X

**An implementation plan for real-time rendered data geometry across all eight compartments
and the platform itself — nine surfaces.**

Status: **AWAITING APPROVAL.** Nothing in here is built.
Written 2026-08-07 against commit `1905067`.

---

## 0. THE ONE TEST, AND WHY IT IS NOT A BRAKE

> **Does the third dimension carry information the flat version LOSES?**

Every surface below has to answer that in one sentence a sceptic would accept. This is not
austerity. I got this exact call wrong once already and it is recorded: I called 3D decoration
everywhere and lumped the GPS margin surface in with a spinning globe. **That was wrong** — margin
over price × effort overrun is a *volatility surface*; two independent axes and a value is
genuinely that shape, and flattening it is the lossy choice. Hedge funds render vol surfaces
dimensionally because that IS the object.

So the test cuts both ways:
- **Slop is UNEARNED richness.** A spinning globe on a KPI page is slop.
- **A plain table is not the opposite of slop.** *Earned* richness is. Refusing to render a
  surface that genuinely has two independent axes is its own failure, and it is the one I made.

The failure mode this plan is actually guarding against is the third one: **a beautiful render of
fabricated numbers.** That already happened this week — a channel-mix surface was built, rendered
as "a violently folded grey accordion", and deleted when its scores turned out to be
`3 + ((i * 2) % 3)`, derived from the row index. Nothing here ships over invented data.

---

## 1. WHAT IS MEASURED (not assumed)

Every number here I read out of the repo today. They bound the whole design.

| fact | value | source |
|---|---|---|
| initial JS | **837 / 850 KB** — **13 KB headroom** | `perf-budget` output |
| per-chunk ceiling | **440 KB** | `check-bundle.mjs:102` |
| passthrough (lazy assets) | **720 / 1024 KB** — **304 KB headroom** | `check-bundle.mjs:135` |
| **budget unit** | **RAW pre-gzip bytes** | `check-bundle.mjs:6` |
| lazy page chunks | 171, every route already split | build output |
| Monte Carlo samples | **`runs = opts.runs ?? 10_000`** | `forecast/index.ts` |
| Monte Carlo samples SHOWN | **3** (p10, p50, p90) | `GpsUnderwriting.tsx` |
| his machine | **M1 · 8 cores · 8 GB UNIFIED** | recorded, `blender-3d-track` |
| brand blue | `#2C6BFF` | recorded, measured from PNG bytes |
| existing 3D | 2 SVG surfaces (GPS margin, command LP) | `1905067` |

**Two of those decide almost everything.**

### 1.1 The budget kills three.js, and this is arithmetic not taste

The budget counts **raw pre-gzip** bytes. three.js r1xx ESM is ~600 KB raw for a scene with
`WebGLRenderer` + geometry + materials; even hard tree-shaken it lands 400–500 KB.

- against **MAX_CHUNK_KB 440** → at or over the per-chunk cap on its own
- against **304 KB passthrough headroom** → over, before a single surface is written

*(three.js sizing is from knowledge, not measured today — web research was unavailable this
session, and it is the first thing Phase 0 measures for real. If it comes in far under, the
decision below is revisited on evidence, not defended.)*

### 1.2 The 10,000 samples are the headline

`monteCarloForecast` runs **10,000 simulations** and the underwriting screen shows **three
numbers**. 9,997 samples are computed and discarded on every quote.

That is not an aesthetic argument. It is a capability argument, and it has a hard threshold:
**SVG dies at roughly 1–2k elements; a GPU draws 10k instanced points without noticing.** The
distribution — the actual shape of the risk, its skew, its bimodality, the fat tail that p90 hides
— is *computed today and thrown away* because the renderer cannot draw it. That is the single
strongest 3D case in the platform and it is a real one.

---

## 2. THE RENDERER DECISION

**Build `@lcx/gl` — a hand-written WebGL2 renderer, ~30–45 KB raw, dynamically imported.**
No three.js. No new npm dependency.

> **2026-08-13 — which 45 this is, and how it turned out.** The "~30–45 KB" here is the ORIGINAL
> WHOLE-ENGINE ESTIMATE. It is not the 45 KB in §6.4's table below, which is L1 renderer's lane
> budget, and it is not the "45 KB unspent" in `PLATFORM_VFX_100X.md:37`, which was the spine's
> leftover headroom. Three different 45s, and reading any one as another is what let invariant 4's
> "<45 KB total" cap be quoted as if the engine had breached it (`3D_VFX_FINAL_PLAN.md` §1.7).
> **The estimate was superseded by three lanes that did not exist when it was made** — L4 env,
> L3.5 particles, L4.5 field. Six lanes now allocate **147 KB**, and the engine measures several
> times this "~30–45 KB" while still coming in at a fraction of three.js's 513.3 KB for the same job,
> which is all point 1 below ever needed.
>
> **The measured total is deliberately absent from this note.** Restating it in a second document is
> the defect §4.5 exists to close. It is generated into `docs/3d/p1/README.md` by
> `node docs/3d/p1/build.mjs --write`, and `npm run gl-budget` fails if that file disagrees with the
> bundler.

**Why this and not three.js:**

1. **It fits and three.js does not** (§1.1). 45 KB against 304 KB of passthrough headroom leaves
   room for nine surfaces; 500 KB leaves none. *(2026-08-13: the 45 here is the whole-engine
   estimate of the note above, and the conclusion survived the engine outgrowing it — `@lcx/gl`
   contributes zero bytes to initial JS, being dynamically imported in every case.)*
2. **The maths is already done and it is pure.** `packages/shared/src/geometry/` already projects,
   builds meshes, and refuses dishonestly-shaped input, with 20 refusal codes and a ruleset
   version. A GPU path is a *renderer*, not an engine. three.js's scene graph solves a problem we
   do not have.
3. **One source of geometric truth.** Both the SVG and GPU paths read the same engine, so a
   printed figure and a screen figure cannot disagree about where a vertex is. Introducing a second
   maths stack is how they drift.
4. **three.js does not give you taste.** The gap between professional and school-project is
   *colour management, tone mapping, shading model, antialiasing, motion discipline and type* —
   all shader and pipeline work. A library gives you a cube with a Phong material, which is
   precisely what a school project looks like.

**What we give up, stated:** shadows, post-processing stacks, glTF import, and a large ecosystem.
None of those are on the critical path for data geometry. If a surface later genuinely needs
photographic lighting, that is a **Blender pre-render** (offline, §7), not a runtime dependency.

**WebGPU:** target WebGL2 first. WebGPU gets a capability probe and a compute path for the
point-cloud reduction in Phase 3, with WebGL2 as the always-present fallback. We never ship a
surface that only exists on WebGPU. *(Support percentages unverified this session — Phase 0
measures against the real browser matrix before any WebGPU code is written.)*

---

## 3. ARCHITECTURE — FIVE LAYERS

```
L0  GEOMETRY ENGINE      packages/shared/src/geometry/     EXISTS, pure, CI-green
      projections · meshes · refusals · observation frame
                              │  typed arrays, no DOM, no colour
                              ▼
L1  @lcx/gl  RENDERER     packages/gl/                     NEW  ~30-45KB
      WebGL2 context · instanced draw · depth sort · MSAA · mat4/vec3
      NO scene graph. NO colour decisions. Draws what L0 computed.
                              ▼
L2  LOOK — the pipeline   packages/gl/look/                NEW  ~8KB
      linear working space · tone map · key+fill+AO · brand palette
      THIS LAYER DECIDES PROFESSIONAL vs SCHOOL PROJECT
                              ▼
L3  MOTION                packages/gl/motion/              NEW  ~6KB
      camera choreography · data transitions · reduced-motion honoured
      Motion that CARRIES INFORMATION or does not exist
                              ▼
L4  THE NINE SURFACES     apps/web/src/surfaces/<module>/  NEW  5-12KB each
      one lane per module · hard contract against L1-L3
```

**The contract that makes orchestration possible:** L4 lanes never touch L0–L3. They receive a
`SurfaceOutcome` from L0 and a `Stage` handle from L1, and emit draw declarations. A lane that
believes L1 is missing a primitive files it as a spine request; it does not reach in. This is why
nine lanes can run in parallel without colliding, and it is the same discipline that let five
lanes run cleanly this week.

### 3.1 L1 primitives — the whole surface area

Deliberately small. Everything in §5 is expressible in these:

| primitive | for |
|---|---|
| `instancedQuads` | surface cells, heat lattices, glyph billboards |
| `points` | Monte Carlo clouds, sample scatter (10k–1M) |
| `lines` | axes, edges, critical paths, chain links |
| `ribbons` | time-series fans, forecast cones |
| `text` | SDF atlas, DPI-aware, screen-space |

`instancedQuads` + `points` + `lines` covers seven of the nine surfaces.

---

## 4. LAYER 2 — WHY THINGS LOOK AMATEUR, AND THE FIX

This is the section that answers *"should not look like a school project"*, and it is
concrete rather than aspirational. Each row is a specific, common, identifiable tell.

| the tell | why it happens | what we do |
|---|---|---|
| **Muddy, plasticky colour** | shading in sRGB space | **Linear working space**, sRGB only at output. Non-negotiable and the single biggest win. |
| **Blown-out highlights** | no tone mapping | Tone map — **but see the trap below** |
| **Plastic shading** | Phong/Blinn defaults | Energy-conserving GGX-lite: one key, hemispheric fill, screen-space AO approximation |
| **Jaggies** | no AA | MSAA 4× where available + shader-side edge softening |
| **Z-fighting shimmer** | coplanar geometry | polygon offset + a stated depth policy in L1 |
| **Default blue/orange** | library defaults | Brand palette only. `#2C6BFF` is the anchor. |
| **Spinning for no reason** | "3D means rotating" | L3 forbids idle motion. Motion is a response to data or to occlusion. |
| **Fuzzy text** | canvas text at 1× | SDF atlas, devicePixelRatio-aware, screen-space and never on the mesh |
| **Reads as a toy** | no depth cues | Contact shadow at the floor, aerial haze on depth, honest occlusion |

### 4.1 THE TONE-MAPPING TRAP — measured, and it would have bitten us

I have this measured from PNG bytes on the Blender track, and it transfers exactly:

| view transform | brand blue `#2C6BFF` renders as |
|---|---|
| **Standard** | **`#2C6BFF` — exact** |
| Khronos PBR Neutral | `#2563EF` |
| **AgX** *(the fashionable default)* | **`#467ECF`** ← badly wrong |
| Filmic | `#2F75CE` |

**Reaching for ACES or AgX because it "looks filmic" would silently destroy brand fidelity.**
Every LCX blue on every chart would shift, and nobody would notice for months.

**The rule:** brand-critical chroma renders under a **Standard/neutral** transform. Tone mapping
applies only to *rendered lighting* — specular, AO, haze — never to a data-encoding colour. A
colour that means something is data, not lighting, and does not get graded.

---

## 5. THE NINE SURFACES

Ranked by **honesty of the 3D case**, not by module order. Each states the data, the third axis,
what flat loses, and — where relevant — that it is **blocked**.

### S1 · GPS — THE RISK CLOUD ★ strongest case
**Data:** the 10,000-sample Monte Carlo that already runs on every quote.
**Geometry:** margin surface over price × effort overrun (**exists, SVG**), with the **10k sample
cloud rendered beneath it** and the p10/p50/p90 planes as slices through it.
**Flat loses:** *everything except three numbers.* Skew, bimodality, the fat tail p90 conceals,
and whether the distribution is tight or merely centred. A quote of "€38k median" over a bimodal
distribution is a different business decision from the same median over a tight one, and today
those two are pixel-identical.
**Upgrade path:** SVG surface stays as the print/fallback; GPU adds the cloud.

### S2 · INTEL — THE FORECAST FAN
**Data:** `monteCarloForecast`, 10k paths, per-deal win probabilities.
**Geometry:** time × value × path-density as a translucent ribbon fan; the median as a solid spine.
**Flat loses:** a p10–p90 band is a *summary of a summary*. The fan shows where paths bunch and
where they diverge — when the uncertainty actually opens up.
**Blocked-ish:** honest today for the current book; richer once `score_refresh` accumulates
vintages (the crons are armed but have never run).

### S3 · THE PLATFORM ITSELF — THE ONTOLOGY OBJECT ★ the Palantir move
**Data:** 8 compartments, their `apiPrefixes`, the entitlement graph, and the cross-compartment
joins (`ticker_norm ↔ asset_symbol`, the verdict broker, the reviews subject map).
**Geometry:** a navigable 3D object of the platform's own shape — compartments as volumes, joins
as edges, need-to-know boundaries as surfaces you can see *through* but not *past*.
**Flat loses:** the platform's structure is genuinely a graph in more than two dimensions;
every existing view is one slice. This is the thing that makes it read as an *ontology*, not a
CRM — and it doubles as the access-control explainer.

### S4 · REGULATORY — THE JURISDICTION LATTICE
**Data:** `OntologyExplorer` already holds nodes/edges with layers and a timeline step.
**Geometry:** jurisdiction × product × posture as a lattice; the existing timeline becomes real
depth rather than a slider over a flat graph.
**Flat loses:** a 2D force layout of a tripartite graph puts unrelated nodes adjacent by accident.
Separating the axes removes false adjacency, which on a regulatory map is a correctness issue.

### S5 · COMMAND — THE BENCH TERRAIN (upgrade)
**Data:** LP scorecard, 10 dims × 9 partners, real authored values. **Exists as SVG at
`/command-deck`.**
**Geometry:** GPU terrain + the weight sliders driving *live* deformation.
**Flat loses:** the ranked list collapses 90 cells into one weighted average per row.
**Why it's mid-ranked:** already shipped and legible in SVG. The GPU upgrade buys live
re-weighting and comparison across scorecards — real, but incremental.

### S6 · SALES — THE PIPELINE IN MOTION
**Data:** deals, stages, values, `stage_changed_at`, and the win-probability model.
**Geometry:** stage × time × value, with each deal a body moving through it; velocity is slope,
stalling is visible as flatness.
**Flat loses:** a Kanban board shows *where* deals are and never *how they are moving*. The
recorded seed for this whole track: **"TIME is the missing axis nearly everywhere."**

### S7 · GOVERNANCE — THE SEAL CHAIN
**Data:** `audit_log` with `seal_seq` (0070 is now applied), the control register, entitlement
events (`AS OF`).
**Geometry:** the hash chain as a physical spine over time; pre-seal rows in a visibly different
material because they are `AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE` — neither intact nor broken.
**Flat loses:** a table of hashes cannot show *continuity*, which is the entire claim a chain
makes. The seam where sealing began is the most important fact and is invisible in a list.

### S8 · MARKETING — THE PERIMETER CUBE
**Data:** claim × jurisdiction × channel, plus the Title VI regime and the embargo register.
**Geometry:** a permission cube — where a claim may be said, to whom, on what surface.
**Flat loses:** the compliance question is genuinely 3-way. Every 2D view forces a fixed third
variable, which is exactly how a claim gets cleared for the wrong channel.

### S9 · DISTRIBUTION — **BLOCKED, AND I WILL NOT FAKE IT**
**Status:** the channel-mix scorecard's scores are `3 + ((i * 2) % 3)` — **derived from the row
index** (`routes/distribution.ts:381`). Fabricated, not measured.
A surface was built over it this week, rendered as an unreadable accordion, and was **deleted**.
**It stays blocked until a human authors real channel scores.** Same shape as GPS price bands and
effort triples: the flag flips in the commit that supplies the data, never before.

---

## 6. ORCHESTRATION — HOW THIS GETS BUILT BY AGENTS

You asked for this to be *built* with agent orchestration and loop engineering. The architecture
in §3 exists partly to make that possible.

### 6.1 The shape

**The spine (L1–L3) cannot be parallelised.** A renderer is one coherent object; three agents
writing one WebGL context produce three renderers. Spine phases run **sequential, single-lane,
high effort**.

**The nine surfaces can.** Each is an independent lane against a frozen L1–L3 contract, touching
its own directory. Nine lanes, disjoint files — the same pattern that ran cleanly this week.

### 6.2 The loop, per lane

```
CLAIM ──► BUILD ──► GATE ──► ADVERSARY ──► LOOK ──► EVIDENCE ──► SHIP
                       ▲                     │
                       └───── defect ────────┘
```

**LOOK is a required gate, not a nicety.** This repo has now learned twice that *a passing DOM
test proves polygon order, not legibility* — a clipped label's node still holds the whole string.
For GPU surfaces the equivalent is a **headless WebGL capture** (`--use-gl=swiftshader`) → PNG →
an agent that reads the image and describes what it sees. **No surface ships un-looked-at.**

### 6.3 Per-lane definition of done

1. `readsAs` sentence a sceptic accepts — the one test, in the caller's words
2. No fabricated number; absent renders as absent, never zero
3. **Bytes measured and reported** (raw KB, lane budget below)
4. **Frame rate measured on an M1/8GB proxy**, not asserted
5. **Rendered, captured, and LOOKED AT** — the image described
6. Reduced-motion path verified
7. **SVG or refusal fallback present** — no WebGL context is a real state, not a crash
8. Mutation-tested: revert the change, watch the test fail, report the message

### 6.4 Byte budget, allocated up front

304 KB of passthrough headroom, spent deliberately:

| | raw KB |
|---|---|
| L1 renderer | 45 &nbsp;← *this 45 is L1's LANE budget; it is still live and still enforced* |
| L2 look | 10 |
| L3 motion | 8 |
| SDF font atlas | 30 |
| 9 surfaces × ~10 | 90 |
| **total** | **183** |
| **headroom left** | **121** |

If the spine overruns 63 KB it eats a surface. **A lane that overruns reports it and stops**; it
does not silently take the budget.

> **2026-08-13 — this table grew three lanes and the docs did not follow, which is the whole of
> `3D_VFX_FINAL_PLAN.md` §4.5.** L4 env (60), L3.5 particles (11) and L4.5 field (13) were added to
> `docs/3d/p1/build.mjs` after this was written, so the spine is now six lanes allocating **147 KB**,
> not the 63 KB above — and for months `docs/3d/p1/README.md` still published 17.5 KB measured
> against 63 KB allocated, both wrong.
>
> **The allocations are here; the measurement is nowhere but the generator's output.** The lane list
> in `docs/3d/p1/build.mjs` is the only authority on allocations, and `npm run gl-budget` regenerates
> and verifies every published figure, so a fourth stale copy cannot be created by hand. If the total genuinely needs to exceed 304 KB, that is a
deliberate raise of `MAX_PASSTHROUGH_KB` with the number stated and re-measured — which is exactly
what the script's own header demands.

---

## 7. PHASES

| phase | what | lanes | gate |
|---|---|---|---|
| **P0 · PROVE** | Measure three.js for real. WebGL2/WebGPU matrix. Headless capture harness. Spike **S1's 10k cloud** end to end and *look at it*. | 1 | A real PNG of 10k points, and a byte count. **If the spike is ugly or slow, the plan changes here.** |
| **P1 · SPINE** | L1 renderer + L2 look + L3 motion. Colour pipeline proved against `#2C6BFF`. | 1 sequential | Brand hex exact after tone mapping; 60fps on M1 proxy |
| **P2 · THE THREE THAT EARN IT** | S1 GPS cloud · S2 intel fan · S3 the ontology object | 3 parallel | Each looked at; each `readsAs` survives an adversary |
| **P3 · THE STRUCTURAL FOUR** | S4 regulatory · S5 command · S6 sales · S7 governance | 4 parallel | as above |
| **P4 · THE LAST ONE + POLISH** | S8 marketing cube · motion pass · a11y pass · perf pass | 2 | full gate + perf budget + CI |
| **S9** | **blocked on authored channel scores** | — | — |

**P0 is a real gate.** If the spike proves ugly, or hand-written WebGL2 proves to be a 3-week
detour, we change the decision *there* — on evidence — rather than defending it for four phases.

---

## 8. WHAT COULD FAIL, HONESTLY

1. **Hand-written renderer looks amateur anyway.** The mitigation is L2 and P0's look-gate, but
   this is the real risk and I am not going to pretend it is small. *If P0's capture is not
   visibly professional, we raise the budget and take three.js instead.* That decision is yours
   and it is cheap at P0 and expensive at P3.
2. **M1/8GB.** 8 GB is *unified* — GPU memory is stolen from system RAM. 1M-point clouds are not
   free. Every lane measures on-device; nothing is assumed from a desktop GPU.
3. **The data is not there.** S9 is already blocked. S2 and S7 get materially better once the
   crons have run for weeks. **The surfaces will be honest about thin data rather than filling it.**
4. **Scope.** Nine surfaces is genuinely large. The phasing is designed so P2 alone is worth
   shipping — three surfaces that earn it beats nine that half-do.
5. **I have been wrong on this exact question before**, in both directions: first calling all 3D
   decoration, then shipping a surface over fabricated numbers. Both errors are in this plan's
   guardrails rather than in its prose.

---

## 9. WHAT ONLY YOU CAN DECIDE

1. **Approve the renderer decision** — hand-written WebGL2 (fits the budget) vs raising the budget
   for three.js. I recommend hand-written, revisited at P0 on measured evidence.
2. **Approve the byte budget** — 183 KB of 304 KB, or raise `MAX_PASSTHROUGH_KB` deliberately.
3. **Rank the nine**, or accept my ranking. P2 builds the top three.
4. **Channel scores for S9** — real authored numbers, or it stays blocked.
5. **Motion appetite.** Restrained-and-purposeful, or more expressive? This is taste and it is
   yours. My default is restrained: motion that answers a question.

---

## 10. THE FIRST THING I DO ON APPROVAL

P0, in one lane, and it produces an image rather than an argument:

- measure three.js tree-shaken, for real
- stand up the headless WebGL capture harness
- render **10,000 real Monte Carlo samples** from an actual GPS quote
- capture it, look at it, and put the PNG in front of you

If that image is not obviously worth the whole programme, you will know at the cheapest possible
moment — and so will I.
