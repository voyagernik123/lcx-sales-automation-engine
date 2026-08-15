# WAS THE PLAN EXECUTED, OR DOES THE RECORD JUST SAY SO?

> **Audited 2026-08-15** against `HEAD = b9770fb`, which is also the commit serving
> `https://lcx-sales-automation-engine.pages.dev` (entry `index-C4dUaGRs.js`, confirmed by fetch).
> Read-only pass. Every mutation used to test a test was reverted by editing; `git status` is clean.
> **This file is the only thing in the repo it wrote.**

---

## THE VERDICT, LEADING WITH WHAT IS NOT DONE

**Three of the nine workstreams the plan named for itself are not delivered, and one of them went
backwards.** The plan's own highest-value item is untouched. Against that, six workstreams are
genuinely complete on all four axes — code, reach, production and a test that can fail — and the
programme's central intellectual claim (rule 5 was false, and here is the pixel) survives an
adversarial check that most of this repo's older claims do not.

| | what |
|---|---|
| **NOT DONE — T4 semantic divergence** | `look/semantic.ts` measures the defect precisely and **fixes nothing**. `statusAlbedo` / `sceneStatusRoles` have **zero consumers** anywhere outside their own test, are **not exported from the `@lcx/gl` barrel**, and appear in **no production chunk**. The diverging burnt orange `#C9552B` still ships in `PipelineReliefGl-D3S-RUgA.js` and `VaultReliefGl-CuK03MF6.js` on production today. The plan said "resolve to the platform's semantic roles"; what happened is that the divergence was measured to three decimal places and left in place. It was not written down as a refusal either, which §4's own standard requires. |
| **NOT DONE — X2 sub-path exports** | The `exports` map exists in `packages/gl/package.json` and, as `SUBPATH_COST.md` §4 itself says, **moves no byte by itself**. The migration it exists to enable was never done: every flat-chart consumer still calls `import('@lcx/gl')` and retains the namespace (`FlatLine.tsx:62`, `FlatBars.tsx:66`, `FlatDial.tsx:86`, `FlatTrack.tsx:80`, `ForgeBackdrop.tsx:266`, `SignatureBackdrop.tsx:387`) — the exact pattern §3 of that document measured as the defeater. **Measured on the live bundle today: a route that draws one donut fetches 97,494 B across 12 chunks**, including the volumetric raymarcher, the lit renderer, AO and DoF. The recorded "before" was 89,793 B / 9 chunks and the claimed "after" 23,681 B. It is 8.6% **worse** than the before, not 74% better. |
| **NOT DONE — §4.1 / F0, the §7(b) trial** | `3D_VFX_FINAL_PLAN.md` §4.1 calls this "the highest-value item in this document" and §5 says **"F1 does not start until F0 reports."** F0 has never reported: `docs/3d/e9/RUNNING_THE_TRIAL.md` states in its own words that it has never been run, and `e9/README.md` records that the one machine-reader substitute **invalidated itself** on four design defects. F1 (§4.2, §4.3, §4.4) shipped anyway. The gate was breached; the record acknowledges F0 is blocked on a person but does not acknowledge that F1 proceeded regardless. |
| **PARTIAL — R1 "all seven"** | Six of seven. `DeckReliefGl.tsx:965` still lists `panels` in the dependency array of the effect that calls `createStage` (line 363), so **E1 still rebuilds its GL context on every data change**. This is honestly ratcheted as a `PENDING` admission in the test, not hidden. |
| **PARTIAL — X1 ambient reach** | Mounted unconditionally in `AppLayout.tsx:265`, so the code is on every shell route. But `SignatureBackdrop.tsx:264` returns `null` in the light theme, **and the platform defaults to light** (`index.html` adds `dark` only from stored preference). X1's stated purpose was that a stranger sees a 3-D frame without a click; on the default theme it still renders **nothing, on every route**. The light refusal is deliberate, measured and tested — but the deliverable as written is not met by default. |
| **PARTIAL — T3 "all seven surfaces"** | Six bound (`@lcx/gl/look/theme.js` imported by E1–E6); E7 `StormReliefGl` refuses in writing at `:368-370` with arithmetic. A refusal executed as written is delivery, so this is complete-as-amended rather than a gap — but the sentence "bind all seven" is not literally true. |
| **UNVERIFIABLE HERE** | "Full gate green at every step" — I am forbidden from running `npm run gate` / `ci-check`. The commit bodies assert it; that is prose, and prose is not proof. |

**Everything else in the plan is delivered, and three of the refusals are delivered as refusals** —
which the doctrine counts as execution. No GLTF or `.glb` reference exists anywhere in `apps/` or
`packages/` (workstream A, executed as written); no god-ray code exists and `env.test.ts:1986` pins
that refusal; no data surface defaults on; no fixture was written to light E7.

---

## THE PERCENTAGE, DERIVED FROM THE TABLE AND NOT ASSERTED

Counting the **25 commitments** parsed out of the two governing documents' own deliverable
statements (§2 workstreams, §3 process, §4 negative commitments, `FINAL_PLAN` §4 items, and the §10
items that carry deliverables):

| status | count | share |
|---|---:|---:|
| **Complete on all four axes** (code + reached + on production + pinned by a test that was made to fail) | 12 | **48%** |
| **Delivered as a refusal, executed as written** | 5 | **20%** |
| **Partial** (delivered against a weaker statement than the plan made) | 4 | **16%** |
| **Not done** | 3 | **12%** |
| **Unverifiable in a read-only pass** | 1 | **4%** |

So **68% of the plan's commitments are fully discharged** (complete + refusals executed), 16% landed
short of their own wording, and 12% did not land. That is the number, and the four tables below are
where it comes from — recount them rather than taking this row on trust.

---

## TABLE A · THE NINE WORKSTREAMS OF `3D_VFX_100X_LIVE.md` §2

| # | commitment | (a) code exists | (b) reached at runtime | (c) on production | (d) pinned by a test I made fail | verdict |
|---|---|---|---|---|---|---|
| **T1** | Make rule 5 real — a test that reads a rendered pixel | `look/precompensate.ts` (`inverseToneMap` :109, `precompensate` :192); rule 5 amended verbatim at `3D_VFX_1000X.md:255-305`; `brandPixel.test.ts` 21 cases | **One call site in the app**: `FlatLine.tsx:109` → `DonutChart` → `/kpi-dashboard`, `/report-builder`. Zero of the eight 3-D surfaces pre-compensate (correctly — they are lit or additive) | ✓ `ACCUMULATES`, `PLATE_NOT_ZERO`, `BLOOM_REACHES_MARK`, `TARGET_ABOVE_POLE` all found in `index-aZp1mH5a.js` | ✓ **`TONE_SHOULDER` 0.4→0.45 ⇒ `brandPixel.test.ts` 4 failures incl. verbatim `"brand channel 2: CPU says 216, the GPU wrote 220"` — while all 23 of `look.test.ts` stayed GREEN** | **COMPLETE (as amended)** |
| **T2** | The scene theme — data never moves, scenery must | `look/theme.ts` :86-121, taxonomy in the header | ✓ imported by E1–E6 | ✓ `theme-CAWfo7OL.js`, values byte-identical (`#E8EDF6`, `#C3CEE0`, `#B9C6E0`, `ambientGain .62`, `keyGain 7.4`) | ✓ light `keyGain` 7.4→3.4 ⇒ `theme.test.ts` red: *"expected 3.4 to be greater than 5.2"* | **COMPLETE** |
| **T3** | Bind all seven + a theme observer that redraws the final frame | 6 renderers import `@lcx/gl/look/theme.js`, each with a `MutationObserver` on `class` + `beforeprint`; E7 refuses in writing (`StormReliefGl.tsx:368`) | ✓ `reliefTheme.test.tsx:374` drives a real flip through a real effect | ✓ all six renderer chunks import `theme-CAWfo7OL.js` | ✓ neutering `redrawForTheme` in `SurfaceReliefGl` ⇒ *"a theme change drew no frame — the canvas is still showing the other theme"* | **COMPLETE-AS-AMENDED** (6 + 1 written refusal, not 7) |
| **T4** | Semantic divergence — resolve status colours to the platform's roles | `look/semantic.ts` + 318-line test, all measurement | ✗ **`statusAlbedo` / `sceneStatusRoles`: zero consumers; not in `packages/gl/src/index.ts`** | ✗ **absent from all 197 prod chunks; `#C9552B` still in `PipelineReliefGl` and `VaultReliefGl` chunks** | the test pins the **defect** ("is outside the platform's red bucket in BOTH themes"), and its own comment says it "keeps saying so **after those files are fixed**" | **NOT DONE** |
| **R1** | Hoist the redraw into a ref on all seven | 6 of 7 (`DeckReliefGl.tsx:965` still lists `panels`) | ✓ for the six | ✓ | ✓ adding `surface` to `SurfaceReliefGl`'s setup deps ⇒ two failures, static and dynamic; the one gap is ratcheted as `PENDING` and fails if silently fixed | **PARTIAL (6/7)** |
| **R2** | Program cache in `stage.ts` | `PROGRAM_CACHE` `stage.ts:214`, keyed on both sources | ✓ the only `createProgram`/`linkProgram` site in the package | ✓ `stage-Czq0CoGZ.js` | ✓ breaking the cache lookup ⇒ *"the rebuild recompiled a program the context still holds: expected 2 to be 1"* | **COMPLETE** |
| **X1** | Ambient dimensionality in `AppLayout` | `AppLayout.tsx:265` `<SignatureBackdrop />` | **light ⇒ `null` (`SignatureBackdrop.tsx:264`), and light is the default** | ✓ eager in `index-C4dUaGRs.js` | ✓ `ambientBackdrop.test.tsx` (18 cases incl. `:164` "the light theme has no corridor for this, which is why it renders nothing", `:387` AppLayout mounts it) | **PARTIAL** |
| **X2** | Sub-path exports — 13.5 KB a route instead of 87.7 KB | `packages/gl/package.json` exports map with wildcards | ✗ only `look/theme.js` uses a sub-path; the flat lane still takes the barrel and retains the namespace | ✗ **measured: 97,494 B / 12 chunks fetched by a donut route** | ✗ no test guards the specifier discipline | **NOT DONE** |
| **A** | Authoring — REFUSED, four measured reasons recorded | `3D_VFX_100X_LIVE.md` §2 A, four reasons | n/a | ✓ **zero `GLTF` / `gltf` / `.glb` references in `apps/` or `packages/`** | — | **REFUSAL EXECUTED** |

---

## TABLE B · `3D_VFX_FINAL_PLAN.md` §4

| # | commitment | (a) | (b) | (c) | (d) | verdict |
|---|---|---|---|---|---|---|
| **4.1 / F0** | Measure §7(b) — *"the highest-value item in this document"* | instrument built: `docs/3d/e9/task.html`, extended to **7 environments**, 14 trials, counterbalance 4-3, zero duplicates | — | — | it refuses on garbage (`REFUSED · NO_CORRECT_ANSWERS_ON_ONE_SURFACE`) | **NOT DONE — never run. §7(b) unmeasured on all 7 environments it applies to** |
| **4.2** | Wire `shadowTaps`; carry the ladder into the app | `quality.ts:99`, consumed at `lit.ts:851`; ladder reaches the app via `useResolvedQualityTier` | ✓ all 8 surfaces stamp `canvas.dataset.qualityTier = tier` | ✓ `useQualityTier-BdksVXaw.js` | ✓ `qualityTierStamp.test.ts` censuses ≥8 surfaces and requires the **resolved** binding, not a literal | **COMPLETE** |
| **4.3** | Fix the anisotropic roughness discontinuity (and the 3 defects found with it) | `lit.ts:473` `max(1e-16, PI*d*d)`, `:480` `max(1e-16, v2)` | ✓ shipped shader | ✓ `lit-BvNyckCg.js` on prod, 28,906 B | ✓ reverting the guard to `1e-6` ⇒ `env.test.ts` red — *but by string match on the shader source, not by a rendered pixel* | **COMPLETE** (weaker instrument than T1's) |
| **4.4** | GL-back `TrendDelta` | struck through in the plan, refused on measurement | — | — | `trendDelta.test.tsx` carries the refusal | **REFUSAL EXECUTED** |
| **4.5 / F2** | Budget figures generated, not transcribed | fenced regions in `p1/README.md` and `w1/README.md`, written by `p1/build.mjs` | — | — | ✓ **I ran `node docs/3d/p1/build.mjs`: exit 0, no drift, nothing written** — and it exits 1 with *"A published byte figure is stale"* if the committed table diverges | **COMPLETE** |
| **4.6 / F3** | Cost the unified stage, then decide | `docs/3d/w2/README.md` §§3-9: **"Do not unify"**, with 3 named reopening conditions | — | — | — | **COMPLETE** (a written decision was the deliverable) |
| **4.7** | God rays in E7, only on the information argument | no god-ray code exists | — | — | `env.test.ts:1986` exists *"so the refusal cannot be quietly"* reversed | **REFUSAL EXECUTED** |

---

## TABLE C · THE NEGATIVE AND PROCESS COMMITMENTS (`3D_VFX_100X_LIVE.md` §3, §4)

| commitment | evidence | verdict |
|---|---|---|
| **Will not default a data surface on** | `SurfaceRelief.tsx:79` `useState(false)`; same shape in every wrapper | **HELD** |
| **Will not fabricate a risk field to make E7 reachable** | `MarketingCrisis.tsx:89` is a module-level `riskFieldUnavailable(...)`; `riskField.ts:157` returns `{kind:'refused'}`; no fixture exists to light it | **HELD** |
| **Will not adopt an asset pipeline** | zero GLTF/glb references | **HELD** (= workstream A) |
| **Will not claim rule 5 for the 3-D path until T1 makes it true** | `harnessRules.test.ts:109` matches the **shape** of the claim, not a list. ✓ I injected `"brand hex exact, the palette survives the pipeline unchanged"` into `docs/3d/e5/entry.ts` ⇒ red: *"expected 'e5' to be ''"*. The recorded open set is now **empty** — but `3D_VFX_1000X.md:273` still names `e3` and `e7` as open, which is stale prose | **HELD** (one stale sentence in the doctrine doc) |
| **Captures at real aspect ratio in both themes, every step** | 28 PNGs in `docs/3d/app-sweep/theme/` — 7 surfaces × 2 themes × (canvas + viewport). E7 correctly reported as not captured in both themes rather than as a pass | **PARTIAL** — the committed `app-sweep/README.md` is dated 2026-08-14 and **predates the last two commits**; it still reports the `index.html` key defect as *"Not fixed here"* when `b9770fb` fixed it, and its E8 rows are pre-fix (see the measured table below) |
| **Full gate green at every step** | commit bodies assert it (`b9770fb`: "2,604 web tests, 346 gl, 78 e2e, perf-budget 813/850 KB") | **UNVERIFIED** — running the gate is out of scope for this pass |
| **Deployed before the next step** | prod entry `index-C4dUaGRs.js` = `HEAD` `b9770fb`; `verify-live.mjs` passes all three claims | **HELD for the final state**; per-step not checkable after the fact |

---

## TABLE D · THE §10 EXECUTION FINDINGS THAT CARRY DELIVERABLES

| # | commitment | verdict |
|---|---|---|
| **10.2** | Quality ladder reaches the shipping app, not just the harnesses | **COMPLETE** — pinned at ≥8 surfaces with a resolved-tier requirement |
| **10.7** | The grow-only blit buffer taxed every small chart | **COMPLETE** — `flat/shared.ts:118` floor + conditional end-of-frame shrink, 9 cases in `sharedBuffer.test.ts` green |
| **10.10** | E7 ships as code and is unreachable as a surface | **COMPLETE AND CORRECT** — I re-traced every link in the commit's chain and it holds. This is rule 6 working, and it is recorded as *"seven surfaces a reader can open, one that renders only in its harness"* rather than as eight live |

---

## REACHABILITY, STATED SEPARATELY BECAUSE IT FAILS SEPARATELY

Of the eight environments:

- **7 reachable** by an operator with a seat, behind an opt-in toggle that defaults off.
- **E8 `ForgeBackdrop`** is the one surface a stranger sees with no click, on the public `/select`.
- **E7 `StormRelief`** is **unreachable by anybody, on any machine, today** — and that is the correct
  state, not a gap.
- **X1's ambient layer** is mounted on every shell route and **draws nothing on the default theme**.
- **T4's `look/semantic.ts`** is 300+ lines of correct, tested code that **nothing imports**. It is
  built and not delivered — the same failure class as E7 before `621363d`, minus the honesty.

`verify-live.mjs` against production: **197 chunks, 15 GL chunks reachable (8 renderer surfaces +
7 shared), zero shader bytes in any of the 3 eager scripts.** That claim holds.

---

## THE MEASURED BEFORE / AFTER TABLE

Every row states whether **I reproduced it** or am **quoting it**. The cheap ones were reproduced.

### Reproduced by this audit

| metric | before | after | change | how |
|---|---:|---:|---:|---|
| **E2 GlobeRelief — bytes uploaded per data change** | 489,432 B | 73,596 B | **−415,836 B, −85.0%** | Both arms measured. Mutated `GlobeReliefGl`'s setup deps to restore the pre-R1 shape; the counting context printed `contexts=1 programs=7 vaos=7 textures=8 bytes=489432` — the recorded "before" **to the byte**. Unmutated: `contexts=0 programs=0 bytes=73596` |
| **E2 — GL contexts / programs per data change** | 1 / 7 | 0 / 0 | **−100%** | same run |
| **E3 PipelineRelief — bytes per data change** | 143,196 B | 1,104 B | **−99.2%** | mount vs change arms, same instrument. *Recorded figure was 142,092 B — off by 1,104 B today* |
| **E4 OntologyOrrery — bytes per data change** | 345,528 B | 330,420 B | **−4.4%** | R1 removed the context rebuild here but **not** the upload: the deck and ring geometry genuinely is the data. *Recorded figure was 399,612 B and 10 VAOs; today it is 345,528 B and 9 — the record does **not** reproduce* |
| **E5 SurfaceRelief** | 2,040 B | 924 B | −54.7% | same |
| **E6 VaultRelief** | 4,704 B | 936 B | −80.1% | same |
| **E7 StormRelief** | 60,336 B | 53,760 B | −10.9% | same; mount figure matches the record exactly |
| **E8 light sign-in — clipped pixels on production** | 37.07% (quoted, previous deploy) | **2.57% page / 0.00% canvas** | **−93%** | Measured on the deployed site in headless chromium, both themes, instrument validated on synthetic all-white (100.00%) and mid-grey (0.00%) first. **The dark control came back 0.11% — exactly the figure `b9770fb` records.** Commit claimed 3.28% after; I measure 2.57% at 1440×900, and the GL canvas itself is now 0.00% |
| **E8 light — luminance sd (canvas buffer)** | 34.89 | 30.57 | −12.4% | The committed sweep predates the ground fix; my re-run is after it. `p01→p99` went `77→255` to `57→217` — **the 255 clip is gone**, which is the fix landing |
| **E3/E6/E1 "worse in light"** | — | **still true today** | — | Re-ran the theme sweep (script copied to a scratchpad with its output paths redirected; repo untouched). E3 p99.9 chroma 154→59 (38%), E6 34→21 (62%), E1 sd 27.22→14.35 (53%). Instrument's own 8 controls all PASS |
| **X2 flat-lane chunk closure on production** | 89,793 B / 9 chunks (recorded) | **97,494 B / 12 chunks** | **+8.6% — WORSE** | Crawled the deployed asset graph and computed the static closure of `index-aZp1mH5a.js`. Claimed target was 23,681 B |
| **Spine byte budget** | — | 79.5 KB against a 147 KB allocation, all 6 lanes ✓ | — | Ran `node docs/3d/p1/build.mjs`: no drift, exit 0 |
| **The old rule-5 gate's blindness** | `look.test.ts` 23/23 green under a broken pipeline | `brandPixel.test.ts` 4 failures on the same mutation | — | Reproduced verbatim, including the recorded failure string |

### Quoted, not reproduced

| metric | before | after | change | why not reproduced |
|---|---:|---:|---:|---|
| **Rebuild time per data change** | 33.30 ms | 9.70 ms | −70.9% | **No artifact exists.** The figure appears only in `3D_VFX_100X_LIVE.md:85,92` and in a comment at `reliefRedrawRatchet.test.ts:49`, which itself says *"Node has no GPU … nothing here asserts a frame time"*. There is no `.json`, no capture, no script. **UNVERIFIED** |
| **Program compilation share of rebuild** | 33.30 ms rebuilt | 7.80 ms programs kept | −76.6% | same — prose only. **UNVERIFIED** |
| **Blit copy per chart** | 1.92 / 1.98 ms | 0.49 / 0.51 ms | **−74%, 3.9×** | `flat/shared.ts:218`; measured on an M1 through ANGLE Metal, which this pass cannot reproduce |
| **Pre-compensation ΔE** | 18.31 / 14.35 / 12.74 | **0.00 / 0.00 / 0.00** | −100% | GPU record in `brand-fidelity.json`; re-rendering it would write into `docs/3d`. **Pinned rather than reproduced**: the record carries a `sourceHash` over the live shaders and my `TONE_SHOULDER` mutation proved that hash binds |
| **Sub-path lane cost in a mirrored build** | 90,181 B | 23,681 B | −73.7% | Measured in a mirror that was never merged. The production number above is what a reader actually pays |

### The losses, counted

Three surfaces are recorded as measurably worse in light, and **all three are still worse today** —
independently re-measured at the live commit, not read off the committed file:

| surface | metric that says so | dark | light | ratio |
|---|---|---:|---:|---:|
| **E3 PipelineRelief** `/bd-pipeline` | p99.9 chroma · max chroma · share above the derived data floor | 154 · 155 · 1.24% | 59 · 59 · **0.00%** | **38%** |
| **E6 VaultRelief** `/audit-log` | p99.9 chroma · max chroma | 34 · 49 | 21 · 22 | **62% / 45%** |
| **E1 DeckRelief** `/command-deck` | luminance sd · p01→p99 range | 27.22 · 71 | 14.35 · 44 | **53% / 62%** |

Two further losses that the "3 worse" headline does not carry:

- **E6 and E1 have no data marks in either theme.** Not one pixel of either buffer clears the derived
  data-chroma floor of 60 in dark or light. That is not a light-theme finding and it is not a pass.
- **E2 GlobeRelief is degraded, recorded and not raised**: data:scenery contrast 4.93:1 → 2.08:1
  (42%). Both still read as two populations, so it did not clear the finding bar — but a programme
  summary that counts only improvements is marketing, and this is a loss.

**And one loss nobody has counted at all:** X2's lane cost went from a recorded 89,793 B to a
measured 97,494 B. That is not a controlled A/B — the two numbers come from different builds with
different content — but the live number is unambiguously not the 23.1 KiB the plan promised, and it
is above the figure the plan called the defect.

---

## FIVE THINGS THE RECORD SAYS THAT MEASUREMENT DOES NOT SUPPORT

1. **`3D_VFX_100X_LIVE.md` §2 X2, "13.5 KB a route instead of 87.7 KB."** True of a mirror, false of
   production. Nothing in `apps/web` uses the exports map for the lane it was built for.
2. **`docs/3d/app-sweep/README.md` is stale in three places** — it reports the `index.html` key defect
   as unfixed (fixed in `b9770fb`), and its E8 rows are pre-ground-fix. It is a *generated* file whose
   header says it cannot go stale; it went stale because the generator was not re-run after the two
   commits that changed what it measures. The generated-file argument only holds if regeneration is
   part of the commit.
3. **`3D_VFX_1000X.md:273` still names `e3` and `e7` as the uncited rule-5 claim set.** The test that
   owns that set expects `''` and records "CLOSED TO EMPTY, 2026-08-15". The doctrine document is
   behind its own ratchet.
4. **Two of the six recorded R1 "before" figures do not reproduce.** E3 is 143,196 B not 142,092 B;
   E4 is 345,528 B and 9 VAOs, not 399,612 B and 10. E2, E5, E6 and E7 reproduce exactly. Nobody
   re-ran the census after the theme binding changed those scenes.
5. **"33.30 → 9.70 ms" has no instrument anywhere in this repository.** It is the headline of an
   entire workstream and it is the one number in the programme with no artifact behind it.

---

## WHAT I WOULD DO NEXT, IN ORDER

1. **Decide T4 out loud.** Either bind the three status literals to `statusAlbedo` (the test already
   names the companion edit — `#E0A94A` must move at the same time or two amber meanings land 0.7°
   apart), or write the refusal into `3D_VFX_100X_LIVE.md` §4 the way workstream A was written. What
   is not legitimate is a measured module with no consumers.
2. **Finish X2 or delete it.** `SUBPATH_COST.md` §5 says it in its own words — *"Finish the migration
   or do not start it"* — and the half state is the one that ships today.
3. **Run F0.** One person, ~25 minutes, and it is the gate every other item was supposed to wait
   behind.
4. **Re-run `APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs`** and commit the output, so the
   theme record stops describing a build that is two commits old.
5. **Either measure the 33.30 → 9.70 ms with a real instrument, or strike it from the plan.**

---

## HOW EACH CLAIM ABOVE WAS OBTAINED

- Production: `curl` of the index, a recursive crawl of all 197 asset chunks, static-closure
  arithmetic over their import statements, and `node scripts/verify-live.mjs` (exit 0).
- E8 clipping: headless chromium against the deployed `/select`, both themes seeded through the app's
  own persisted key shape, two real `requestAnimationFrame` ticks before reading, counter validated
  on synthetic white and grey first, and the dark frame used as the live negative control.
- Theme sweep: `scripts/3d-audit-app.mjs` copied to a scratchpad with `ROOT` pinned to the repo and
  `OUT`/`SHOTS` redirected out of it, run on port 5377. Its own 8 instrument controls passed.
- Tests: `npx vitest run <file>` at HEAD for the baseline, then one mutation at a time, then the
  mutation reverted by editing and `git status` confirmed clean before moving on.
- Everything else: `git log`/`git show`, and reading the files at the line numbers cited.

**What this audit does NOT establish:** that any surface *reads well*; that the gate is green (I may
not run it); anything about real GPU hardware (every pixel here is SwiftShader or ANGLE); and
anything about the four seated relief routes on production, which need a seat this pass does not have
— those were measured against a dev server built from the identical commit instead, which is stated
rather than glossed.
