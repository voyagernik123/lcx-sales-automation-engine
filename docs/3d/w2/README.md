# W2 / W3 — the layer is built and proven. One primitive swap is NOT.

`PLATFORM_VFX_100X.md` W2 is "re-back the 13 primitives, props unchanged, SVG retained as
fallback"; W3 is the motion grammar. This records exactly what landed and what did not.

## Built, tested, and correct

**The shared renderer** (`packages/gl/src/flat/shared.ts`) — §7.3 of the plan named context
exhaustion as the constraint that decides the architecture, and it does. Browsers cap live
WebGL contexts around 8–16 and then silently kill the OLDEST one, so a context-per-chart
build works on a three-chart test page and blanks the top half of a real dashboard with
nothing thrown. There is now exactly ONE context for the app, on an offscreen canvas; each
chart owns a cheap 2-D canvas and receives a `drawImage` blit of its own region.

Blit rather than one page-sized canvas behind the DOM, because the latter has to track
scroll, stacking context, overflow clipping and modals — all of which this app has — and
breaks the moment a chart sits inside a scroll container. One texture copy per chart is a
rounding error against a frame that already runs five post-process passes.

**The hook** (`apps/web/src/components/charts/gl/useFlatChart.ts`) — owns device-pixel
sizing, the refusal fallback and the entrance. `refused` starts TRUE and only clears once a
frame has actually been drawn, so the SVG is what renders on the server, in print, without
WebGL2, and on first paint. There is no state in which a reader sees nothing.

**W3 motion** — one purpose, `entrance`, once. The bar grows from its baseline, which is the
only motion here that carries the data: the bar *arrives at* its value rather than fading in
at it. A data refresh does NOT replay it — re-animating on every poll would make a
timer-refreshed dashboard permanently in motion, which is the idle animation the policy
forbids, reached from the other direction. Under `prefers-reduced-motion` it resolves to the
final state on frame one, and an environment that cannot read the preference assumes reduced.

**Three real pipeline bugs, found by looking:**

1. `createStage` hard-coded `alpha: false`, so an overlay canvas painted an opaque black
   rectangle across the card no matter how carefully the composite cleared to zero.
2. The composite always wrote `alpha = 1`. A transparent frame has to carry the coverage the
   primitives actually drew — they already write their mask into the scene target's alpha,
   so the fix was to stop discarding it.
3. **The bright pass and the blur wrote `alpha = 1` too**, so the bloom chain reported full
   coverage over the whole frame and a transparent composite came out as a grey wash across
   its entire rectangle. Opaque frames never noticed, because they discard that alpha.

All three are fixed and all three were invisible to every test — they only appear when a
transparent layer is composited over real DOM.

## `BarChartH` is swapped, and the three bugs it took to get there

It first rendered **four bars for six rows**, stretched and misaligned. All three causes
were in code I had written, and none was visible to any test.

**1 · The viewport, and it was an architectural defect rather than a slip.** `bindTarget`
set the viewport from the TARGET's size. That is correct for a stage owning its own canvas
and silently wrong for the shared renderer, where one 1024 × 512 buffer serves many charts:
`bindTarget` re-set the viewport to the full buffer AFTER the shared renderer had scissored
the chart's 960 × 312 region, so every mark rendered 1.64× too large and the bottom rows fell
outside the copied rect. The `Stage` now has a REGION — `setRegion(w, h)` resizes the targets
and `bindTarget` reads the viewport from it, reallocating only when the size actually
changes, so a page of same-sized charts pays for one allocation.

**2 · The contact shadow did not know which way was down.** It hard-coded "below" as
decreasing y. A chart borrowing its host SVG's viewBox counts y DOWNWARD, so the shadow was
cast above each bar. The direction is now read off the projection matrix.

**3 · `fwidth(d)` — the antialiasing bug, and the best of the three.** `sdRoundRect`
contains `max(q, 0.0)` and a `length()`, so its derivative is DISCONTINUOUS along the
diagonal running out of each corner. `fwidth` spikes on that seam, the edge smoothstep fires
deep inside the shape, and a small dark speck appears on the diagonal — on two bars of six,
and on nothing else. Exactly the kind of artifact that gets blamed on the data. The feather
now comes from `fwidth(p)`: `p` is linear in the quad's coordinates, so it is constant
across the primitive and one pixel wide everywhere, including across that seam.

The scale of bug 3 is worth noting: the whole visible symptom was two marks about six pixels
across, and the cause was a real mathematical error in the primitive that would have appeared
on every rounded shape the layer ever drew.

---

# Should the 3-D reliefs join the shared chart stage? — the costing, and the answer

`3D_VFX_FINAL_PLAN.md` §4.6, discharged. **This file is the home for it** rather than a new
`docs/3d/_shared/UNIFIED_STAGE_COSTING.md`, because the paragraph three screens up — *"Blit rather
than one page-sized canvas behind the DOM"* — is the direct ancestor of the same question, and
`docs/3d/_shared/` today holds two source files and no prose. Anyone re-opening the shared-renderer
architecture opens this README; splitting one decision across two homes is how the "45 KB" figure
came to mean three different things.

**The deliverable is a costing and a recommendation. Nothing was refactored.**

## 1 · What each side actually has

The blueprint asserts the 3-D views should join the same unified render pass. They cannot as built,
and the reason is not the canvas — it is the target set.

| | shared chart stage | what a relief builds |
|---|---|---|
| context attributes | `alpha: true` (`flat/shared.ts:88-89`), `antialias:false`, `premultipliedAlpha:false`, `preserveDrawingBuffer:true` (`stage.ts:158-166`) | `alpha: false` — all eight, e.g. `SurfaceReliefGl.tsx:107` |
| colour targets | `scene` RGBA16F at region, `bloomA`/`bloomB` at region `>>2` (`stage.ts:135-137`, `:192`, `:201-206`) | `Target3D` colour, RGBA16F at full render size (`env/target3d.ts:69-79`) |
| depth | **none.** Grepping `stage.ts` for `DEPTH_ATTACHMENT` returns nothing | `DEPTH_COMPONENT24`, *sampleable*, on the same FBO (`env/target3d.ts:81-92`) |
| shadow map | none | depth-only FBO, 1024² on seven reliefs, **1536²** on E1 (`DeckReliefGl.tsx:120`) |
| AO | none | two `R8` buffers at half resolution (`env/ao.ts:234-235`, `:251`) — 5 of 8 reliefs |
| DoF | none | one RGBA16F at **full** resolution, deliberately not half (`env/dof.ts:148-154`) — 2 of 8 reliefs |
| present | `look/pipeline.ts` — bright → 4 blurs → composite | its own `PRESENT_FRAG`, one blit |

Two facts from that table decide most of what follows.

**Not one of the eight reliefs calls `createPipeline`.** `stage.scene`, `stage.bloomA`, `stage.bloomB`
and `createPipeline` have exactly nine consumers, and all nine are flat: the five chart primitives
(`FlatBars`, `FlatLine`, `FlatBand`, `FlatDial`, `FlatTrack`), `SignatureBackdrop`, S6's
`renderMotion`, and the `w1`/`p1` reference lanes. So under unification the shared stage's three
existing targets are dead weight in every relief frame, and the relief's four are dead weight in
every chart frame. One stage serving both means *both* sets allocated for *either* consumer.

**The one thing a "unified pass" would be for is already unified.** Every relief's `PRESENT_FRAG`
interpolates `TONE_MAP_GLSL` and `SRGB_ENCODE_GLSL` from `look/tonemap.ts` — the same two strings the
flat composite uses (`look/pipeline.ts:87-88`). There is one tone curve and one sRGB encode across all
eight environments and all ten chart primitives *today* — verified by grep: all eight relief files
reference both strings. The only unshared part is the bloom chain, which the reliefs decline on
purpose: the bright pass thresholds accumulated density (`look/pipeline.ts:41-56`), and a GGX specular
highlight is not accumulated density.

## 2 · What would have to change in `stage.ts`

Six things, and the fifth and sixth are the ones with teeth.

1. `createStage` allocates a `DEPTH_COMPONENT24` texture and attaches it to `scene`. This is the
   change `env/target3d.ts:14-17` explicitly declined: *"a depth buffer bolted onto `stage.scene`
   would have been fewer lines and would have put every working 2-D surface at risk for a feature
   none of them use."*
2. `setRegion` (`stage.ts:238-248`) reallocates 3 textures today. It would reallocate 7 — scene,
   depth, bloomA, bloomB, DoF, AO×2 — and would have to drive `ao.resize()` / `dof.resize()` /
   `target3d.resize()`, which currently answer to their owners.
3. `alpha` has to be `true`, because the chart layer sits over a card and `alpha:false` paints an
   opaque black rectangle across it — bug 1 above. The reliefs' `PRESENT_FRAG` writes `1.0` alpha, so
   this one resolves in principle; it still needs a capture per surface to prove nothing moved.
4. The five chart components clear `COLOR_BUFFER_BIT` only (`FlatBars.tsx:96-97`, `FlatLine.tsx:85-86`,
   `FlatBand.tsx:131-132`, `FlatDial.tsx:149-150`, `FlatTrack.tsx:139-140`). A depth attachment they
   never clear is harmless *by luck*: `beginAdditive`/`beginAlpha` disable `DEPTH_TEST`
   (`stage.ts:354-358`, `:373-377`) and ES 3.0 makes depth writes conditional on the test being
   enabled, so charts would neither write nor read it. All eight reliefs clear it themselves. So the
   depth buffer would be 4 bytes per pixel of correctly-ignored memory on every chart frame — which is
   the worst kind of cost, because nothing fails and nothing tells you.
5. **The reliefs move onto the blit path.** One context lives on one canvas; a relief inside a card
   cannot be that canvas, so it becomes an offscreen render plus a `ctx.drawImage` into its own 2-D
   canvas, exactly as `flat/shared.ts:116-120` does per chart. This is the load-bearing change and §4
   costs it.
6. **The stage becomes a session-long singleton for the reliefs too.** Today each relief owns its
   stage and `stage.dispose()` frees its programs on unmount — `GlobeRelief.tsx:53` quantises
   `heightPx` to 24 px specifically to stop that teardown firing on every resize tick. A singleton
   never disposes (`resetSharedRenderer` is a test seam, `flat/shared.ts:68-72`), and
   `stage.compile` retains every program in a stage-owned array (`stage.ts:224`, `:305`, `:323-324`).
   Toggling a relief twenty times would compile and retain twenty sets of shadow/depth/lit/present
   (+AO, +DoF) programs. That class of leak has already been measured once in `stage.ts` itself, at
   **20 shader objects created and 0 deleted, still 20 after `dispose()` on every object and on the
   stage** (`stage.ts:255-257`), and `glState.test.ts:264-291` is what pins it shut.

## 3 · Bytes: measured, and not the reason to refuse

Measured with esbuild at `docs/3d/p1/build.mjs`'s exact `COMMON` settings — ESM, es2022, minified,
bundled, raw not gzip — through a synthetic re-export entry, `write:false`, so nothing was built into
the repo. Method reproduced from `build.mjs:41-49` and `:127-135`.

| lane | bytes | KB | vs today |
|---|---|---|---|
| L1 as budgeted today (`stage`, `math`, `points`, `lines`) | 11,941 | 11.66 | — |
| L1 + `target3d` | 14,912 | 14.56 | +2,971 B |
| L1 + `target3d` + `ao` | 21,071 | 20.58 | +9,130 B |
| **L1 + `target3d` + `ao` + `dof`** | **24,528** | **23.95** | **+12,587 B (+12.29 KB)** |

Against the L1 lane budget of 45 KB (`build.mjs:68`), a unified stage lands at 23.95 KB with
**21.05 KB of lane headroom left**. It does not breach the budget.

What it does do is move 12.29 KB from a lane only reliefs pay into a lane every chart pays. The
consumer path a chart actually pulls — `stage`, `math`, `flat/bars`, `flat/strokes`, `flat/shared`,
`look/*`, `motion` — measures **26,373 B** today and **38,971 B** with `target3d`+`ao`+`dof` welded
in: **+12,598 B, a 47.8 % increase** in the bytes a sparkline is charged. Tree-shaking cannot save it,
because `createStage` would reference the new targets unconditionally.

That 12.6 KB does **not** touch the 11 KB of initial-JS headroom `3D_VFX_FINAL_PLAN.md` §6.4 warns
about: `useFlatChart.ts:98` reaches `@lcx/gl` through a dynamic `import()`, so the whole lane is lazy.
**Bytes are a real cost and they are not the deciding one. Say so plainly rather than dressing the
recommendation in the easiest number.**

## 4 · Memory: derived, on the 8 GB M1 that is the only machine this repo has measured

**This is arithmetic from the `texImage2D` internal formats, not a GPU measurement.** WebGL exposes no
allocation query, so a real figure needs an external GPU tool and nobody has run one. `DEPTH_COMPONENT24`
is counted at 4 B/px because ANGLE on Metal backs it with a 32-bit depth format; a driver that packs it
at 3 B/px would reduce the depth and shadow rows by one quarter and change no conclusion below.

Per pixel of the stage's region: RGBA16F = 8 B, R8 = 1 B, depth24 = 4 B. Bloom is `region >> 2`
(`stage.ts:192`), AO is `region >> 1`, DoF is full region, shadow is region-independent.

Heights below are the components' own; **the 1200 CSS-px column width is an assumption**, since it is
measured from the DOM at runtime (`SurfaceReliefGl.tsx:77`) and is not a constant anywhere.

| region | today (scene + bloomA/B) | added (depth + shadow + AO + DoF) | unified |
|---|---|---|---|
| 1024×512 — the shared canvas's declared start, a real constant (`flat/shared.ts:85-86`) | 4.50 MiB | 2.00 + 4.00 + 0.25 + 4.00 = **10.25 MiB** | 14.75 MiB (3.28×) |
| 2400×800 — a 1200 × 400 CSS figure at dpr 2 | 16.48 MiB | 7.32 + 4.00 + 0.92 + 14.65 = **26.89 MiB** | 43.37 MiB (2.63×) |
| 2400×920 — E1's deck, `heightPx = 460` (`DeckRelief.tsx:42`), dpr 2, shadow 1536² | 18.95 MiB | 8.42 + 9.00 + 1.05 + 16.85 = **35.32 MiB** | 54.27 MiB (2.86×) |

And the number that settles it. `Sparkline` defaults to **96 × 28 CSS px** (`Sparkline.tsx:24-25`), so
on a dpr-2 display its region is 192 × 56 device px:

| region | today | added | ratio |
|---|---|---|---|
| 192×56, shadow 1024² | 96,768 B (0.092 MiB) | 4,328,704 B (4.13 MiB) — of which the shadow map is 4,194,304 | **46×** |
| 192×56, shadow 1536² (E1's baseline) | 96,768 B (0.092 MiB) | 9,571,584 B (9.13 MiB) — of which the shadow map is 9,437,184 | **100×** |

A page whose only GL is one 96 × 28 sparkline would allocate a 9 MiB shadow map, a full-resolution HDR
depth-of-field buffer and two occlusion buffers, and hold them for the session, because the stage that
draws the sparkline is the same stage that might later draw a lit deck. The shadow map is
region-independent, so `setRegion` cannot shrink it, and there is no `dispose` on a singleton. **98.6 %
of that 9.13 MiB is a shadow map for a chart that casts no shadows.**

## 5 · Frame time: the cost I cannot measure without building, bounded honestly

Change 5 in §2 puts a full-frame `ctx.drawImage` in every relief frame. `flat/shared.ts:19` already
judged that copy *"a rounding error against a frame that already runs five post-process passes"* — but
that judgement was made for a chart-sized region on a frame with no budget pressure. A relief frame at
2400×920 is **2.208 Mpx**, and E0 measured the full tier at **11.328 ms against a 16.6 ms budget**
(`env/quality.ts:6`, cost ratios at `:145`) — **5.272 ms of headroom** (the file rounds it to 5.3), on
the fastest machine this will ever run on.

**I did not measure the blit, so I will not put a number on it.** The honest bound is `0 < cost ≤ 5.272 ms`
— the measurement cannot currently rule out that a single texture copy consumes the entire remaining
headroom and puts E1 over 60 Hz. The instrument to settle it exists and is named in
`env/quality.ts:120-121`: trailing `readPixels`, **not** `gl.finish()`, which "returns on command-buffer
flush and produced two published numbers 140× wrong in this programme". Anyone who unifies must take
that measurement first, because taking it afterwards means discovering it in a capture.

## 6 · Refactor risk to the passes

Two pass sets, not one, and the plan's "five post-process passes" is the smaller of them.

- **Flat**: `pipeline.resolve` runs bright → four blurs → composite = six blits
  (`look/pipeline.ts:154-196`, default `blurSteps` `[1,1,2,2]` at `:156`). All six ping-pong through
  `stage.bloomA`/`bloomB` and sample `stage.scene`. Adding a depth attachment to `scene` while
  `composite` samples it is the `FEEDBACK_LOOP` class the stage already names as a refusal code
  (`stage.ts:32-37`) — measured on a real driver as `GL_INVALID_OPERATION`, ANGLE's *"Feedback loop
  formed between Framebuffer and active Texture"*, and **zero pixels written** against 13,456 for the
  identical draw into a second target (`glState.test.ts:403-410`). Not a certainty here; a hazard that
  currently cannot arise and afterwards could.
- **Environment**: nine passes each carry a save/restore contract, and each has its own test —
  `sky.draw`, `lit.shadowPass`, `lit.depthPrepass`, `lit.draw`, `ao.compute`, `dof.apply`,
  `particles.step`, `particles.draw`, `volume.draw` (`glState.test.ts:318-401`). The entry state that
  suite asserts against is *"deliberately NOT the GL defaults"* (`:319-323`). A unified stage changes
  that entry state: a relief pass would now run after an arbitrary chart pass in the same context,
  with whatever `SCISSOR_TEST` the shared renderer left enabled (`flat/shared.ts:110-114`) and whatever
  region `setRegion` last chose. Every one of the nine restore proofs would have to be re-established
  against the new entry state, and `ao.compute`'s own comment records what that class of bug looks like
  when it slips: the viewport left at `0,0,320,200` after entering at `0,0,640,400`, invisible only
  because *"every environment happens to call `target.bind()` immediately afterwards"*
  (`env/ao.ts:295-298`).

## 7 · What would have to be re-verified

- **21 `createStage` call sites**: `flat/shared.ts`, the 8 app reliefs, S6's `renderMotion`, and 11
  harness/reference entries (`e0`–`e8`, `w1`, `p1/surface.ts`). The harness entries are a *second*
  implementation of each environment — `e5/entry.ts` builds its own stage and imports `@lcx/gl`
  directly — so unification either migrates all eleven or leaves the thing captured under `docs/3d`
  structurally different from the thing that ships. Rule 8 ("every claim gets a capture") is satisfied
  today because both paths call the same `createStage`; it would stop being satisfied by construction.
- **All 51 PNGs under `docs/3d`** (40 across `e0`–`e8`, 11 across `p0`/`p1`/`s6`/`w0`/`w1`/`w2`/`w5`).
  Every one is a claim about pixels produced by a stage whose context attributes and present path would
  change. "It should be pixel-identical" is precisely the claim this programme does not accept without
  the capture.
- **Test suites that would have to be re-established, not merely re-run.** Counts below are `grep -c
  '\bit('` on 2026-08-13 and they move — `env/env.test.ts` gained 18 cases while this section was being
  written. Regenerate rather than trust them:
  `grep -c '\bit(' packages/gl/src/stage.test.ts packages/gl/src/env/*.test.ts packages/gl/src/{flat,look,motion}/*.test.ts`.

  `stage.test.ts` 7 · `env/glState.test.ts` 5 declared cases, one of which is a loop over the 9 passes ·
  `env/env.test.ts` 117 · `env/harnessRules.test.ts` 12 · `flat/shaderSource.test.ts` 6 ·
  `look/look.test.ts` 15. Plus the relief component suites: `ontologyOrrery` 30 · `globeRelief` 19 ·
  `pipelineRelief` 17 · `vaultRelief` 15 · `stormRelief` 13 · `forgeBackdrop` 9 · `deckRelief` 7 ·
  `lpSurfaceMounts` 7 · `surfaceRelief` 6.

  One of them fails on the *edit* rather than on the behaviour: `globeRelief.test.tsx:134-135` asserts on
  the literal source text `createStage(canvas` and on `assertBrandFidelity()` appearing before it.

## 8 · Does any environment actually benefit? — the decisive question

**No. And the argument for unifying is an argument about a constraint this repo does not have.**

The only stated motivation is context exhaustion — `flat/shared.ts:4-9` and this README's own opening
name it, correctly, as the constraint that decided the shared chart renderer: browsers cap live WebGL
contexts around 8–16 and then silently kill the oldest. That argument is why sixty charts share one
context. It does not extend to the reliefs, because there are never sixty of them.

Grepped every route for all eight relief wrappers. Each is mounted on exactly one page, and only one
page can mount two:

| route | own-stage consumers mountable | of those, default ON |
|---|---|---|
| `CommandDeck.tsx` | `DeckRelief` (:162) **and** `SurfaceRelief` via `LpOptimizerPanel` (:287 → `CockpitPanels.tsx:501`) | **0** |
| `MarketMap.tsx:272` | `GlobeRelief` | 0 |
| `AuditLog.tsx:237` | `VaultRelief` | 0 |
| `OntologyExplorer.tsx:317` | `OntologyOrrery` | 0 |
| `MarketingCrisis.tsx:1241` | `StormRelief` | 0 |
| `BdPipeline.tsx:849`, `:893` | `PipelineRelief` — two mounts, **mutually exclusive** (`:890`) | 0 |
| `SelectOperator.tsx:151` | `ForgeBackdrop` — the one that is **not** opt-in; it is a backdrop, mounted unconditionally | 1 |
| `DealBoard.tsx:347` | S6 `PipelineMotion` — its own stage, not one of the eight | — |

The shared chart stage adds **at most one** context to any of those, whatever the chart count, because
it is a process-wide singleton (`flat/shared.ts:53-66`). So:

**Maximum simultaneously-live GL contexts on any route in this application: 3 — `CommandDeck`, whose
`SignatureBackdrop` (:95) is an unconditional consumer of the shared stage, plus both of its reliefs
switched on. Against a browser cap of 8–16.** And reaching 3 takes two deliberate clicks: seven of the
eight reliefs default `wantRelief = false` (`SurfaceRelief.tsx:40`, `DeckRelief.tsx:43`, and the same
line in the other five) because §7(b) is unmeasured. The steady state on every route in the
application is **1**.

So unifying would take 2 contexts to 1 on six routes, 3 to 1 on `CommandDeck`, and 1 to 1 on
`SelectOperator` — in a system whose worst case already sits at 37 % of the most pessimistic cap.
**The context-exhaustion argument for unifying does not apply.** Nothing is exhausted, nothing is near
exhaustion, and no environment gets a frame it cannot get today.

The only *other* thing one stage would buy is a shared depth buffer — a chart mark occluded by relief
geometry inside one frame. No surface in the programme asks for that: the eight reliefs each replace a
figure wholesale and the flat fallback is a sibling, never a co-inhabitant of the same depth range.

## 9 · Recommendation

**Do not unify. The shared chart stage keeps `scene`/`bloomA`/`bloomB` with no depth buffer, and the
reliefs keep building their own stage per surface.**

The reason is §8, not §3. The costing is not close on any axis, but a cost is only a reason when
something is being bought, and nothing is: the constraint that would justify one stage — running out of
GL contexts — is at 3 of 8 in the worst case and 1 in the steady state. Against that, unifying charges
every sparkline 12,598 bytes and up to 9.13 MiB it cannot use, puts a full-frame texture copy inside
the one 16.6 ms budget with 5.272 ms of slack, and re-opens nine pass-restore contracts, 21 call sites
and 51 captures — to remove one context from a page that can afford eight.

It also reverses `env/target3d.ts:14-17` on no new evidence. That file's stated reason for being
additive is that `stage.ts` stays untouched so the re-backed chart primitives keep the exact targets
they were verified against. Everything in §3 through §7 is what changing that mind costs.

**The named condition that would reopen this**, since a permanent no on an architectural question is
usually a no that stopped thinking:

1. A single route's *measured* live GL context count reaches **6** — not projected, counted in a real
   browser on a real route. At 6 the cap's lower bound of 8 is close enough to act on, and the correct
   move is likely to merge the reliefs *with each other* rather than with the chart stage, which is a
   smaller change than this one and does not touch `flat/shared.ts` at all.
2. A surface needs a chart mark **depth-occluded** by relief geometry in one frame. That is a shared
   *depth buffer* requirement, which one stage is the only way to satisfy, and no amount of context
   headroom substitutes for it.
3. `flat/shared.ts`'s per-region reallocation becomes the measured bottleneck on a real dashboard. Then
   the fix is in `setRegion`, and it is in the *opposite* direction from this proposal — fewer targets
   per region change, not seven.

Until one of those holds, the blueprint's §1.1 seam is real and the answer to it is written down:
**what "one unified pass" is actually for — one tone curve, one sRGB encode, one palette across all
eight environments and all ten chart primitives — is already true, through `look/tonemap.ts`, without
one stage.** The bloom chain is the only unshared part, and the reliefs decline it deliberately.

## 10 · How every number here was obtained

| number | method |
|---|---|
| 11,941 / 14,912 / 21,071 / 24,528 B; 26,373 / 38,971 B | esbuild, `docs/3d/p1/build.mjs`'s `COMMON` settings verbatim, synthetic re-export entry, `write:false`. Re-run to check. |
| 11.66 KB for L1 as it stands | reproduces the `L1 renderer` lane `npm run gl-budget` measures (`build.mjs:68`), taken first so the deltas are against a figure the existing gate agrees with |
| 7 relief wrappers default OFF | `useState(false)` read in all seven wrapper files; `ForgeBackdrop` has no such state and is mounted unconditionally at `SelectOperator.tsx:151` |
| all MiB figures | **derived**, from the `texImage2D` internal formats at `stage.ts:171-172`, `env/target3d.ts:69-81`, `env/ao.ts:251`, `env/dof.ts:152-154`. Not a GPU measurement — WebGL has no allocation query. depth24 assumed 4 B/px. |
| 11.328 ms, 16.6 ms budget, 5.272 ms headroom | E0's measurement, quoted from `env/quality.ts:6` and `:145`. Not re-derived here. |
| the blit's frame cost | **not measured.** Bounded `0 < cost ≤ 5.272 ms` and named as the first thing to measure. |
| 3 simultaneous contexts, 1 steady state | grep of every route for the eight relief wrappers plus `SignatureBackdrop` and S6, cross-checked against each wrapper's `useState(false)` default. Table in §8 lists the file:line for each. |
| 21 `createStage` call sites | `grep -rn 'createStage('` over `apps/web/src`, `packages/gl/src`, `docs/3d`, minus test files and the definition. **This README now matches that grep too** — exclude it, or the count reads 22. |
| 51 captures | `ls docs/3d/*/*.png \| wc -l`. |
| per-suite test counts | `grep -c '\bit('`, dated in §7 because they move. |
