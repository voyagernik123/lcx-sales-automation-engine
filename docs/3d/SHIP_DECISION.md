# SHIP DECISION — what ships, per surface, on the evidence that exists

**The answer: 1 surface ships ON, 7 stay behind their toggle, 0 are deleted. The one that ships ON is
the only one that makes no reading claim at all.**

That is a conservative result and it is forced rather than chosen. The programme has measured, well and
repeatedly, whether each surface *renders correctly*: whether it paints in both themes, whether its marks
are separable from its room, whether it degrades to a readable flat surface on every refusal path, whether
it reaches paper, whether it survives a lost GL context. Every one of those is a **hygiene** measurement.
Hygiene tells you a surface is not broken. It does not tell you a surface is *better*, and "better" is the
only thing that justifies turning something on for an operator who did not ask for it.

The measurement that would justify a promotion — clause (b), *an operator still gets their answer at least
as fast as from the flat surface* — is **unmeasured on all seven surfaces it applies to**. So the honest
recommendation for those seven is to leave them where they are, and to say what each one is waiting for.

---

## 0 · What this document deliberately does NOT contain

**There is no reading time anywhere in this file, for any surface, and there will not be one.**

Clause (b) has one valid instrument (`docs/3d/e9/task.html`) and it needs a person. An operator ran it and
the result was lost because the page rendered its verdict on screen with no save affordance; that defect is
fixed (`f2e80fa`) and the operator is not obliged to run it again.

A machine-reader substitute was already tried and **invalidated itself** — `docs/3d/e9/README.md`
"Audit 5c". Its headline was flattering (relief 6/6 correct, flat 0/3) and its four defects are recorded by
the author in his own words: the relief frame printed the answer in a HUD callout; every relief reader said
the answer was *not* legible and reconstructed it by extracting the surface mask and fitting a projective
map; the flat panel could not answer at all because a static capture cannot rotate an azimuth the shipping
component exposes; and — the defect that cannot be repaired — given an image, a model does projective
reconstruction, which is not what a human glancing at a chart does.

So any number produced here by reading pictures would be that same invalid instrument with fresh paint.
**Every recommendation below is made without a clause (b) figure, and says so.** The one SHIP ON is argued in
§5 with a *"what would change it"* clause naming the measurement that would falsify it and what it costs.

---

## 1 · The eight surfaces, for a reader who was not here

The LCX OS web app ships **eight three-dimensional surfaces**. Seven are an *alternative reading* of a page
that already works without them: the flat table, chart or diagram is what loads, and the 3-D version is one
click away behind a toggle that defaults **off** with a label saying nobody has timed it. The eighth (E8) is
the sign-in screen's backdrop and simply runs.

E1–E8 are labels, not an order or a ranking.

| | surface | route | what a reader opens it to learn | flat surface it replaces |
|---|---|---|---|---|
| **E1** | DeckRelief | `/command-deck` | which of four panels is the one being addressed — the nearest is the one in focus, where a flat grid gives every panel equal weight | the four panels themselves |
| **E2** | GlobeRelief | `/market-map` | where projects sit geographically, as a globe. It places **regions, not organisations**, and says so before you click | a 2-D scatter (`MarketScatter`) |
| **E3** | PipelineRelief | `/bd-pipeline` | the BD lead queue as a lit channel — market cap, gate and movement read *jointly*, where the table can only sort one of the three at a time | `LeadTable` |
| **E4** | OntologyOrrery | `/ontology` | how the ontology's entities relate, as orbital rings. A flat node-link diagram spends both axes on layout, so its edges cross and a reader cannot resolve them; depth separates them | a ReactFlow node-link diagram, ~74 labelled nodes |
| **E5** | SurfaceRelief | `/command-deck` | the liquidity-partner scorecard as a height field — which partner leads, and on which weighted dimension | `SurfacePlot`, an axonometric flat figure |
| **E6** | VaultRelief | `/audit-log` | the audit log as a corridor — the sequence of recorded actions with time carried as depth | the audit table, 50 rows |
| **E7** | StormRelief | `/marketing/crisis` | forward risk over a calendar, as a storm field | `RiskCalendar` |
| **E8** | ForgeBackdrop | `/select` | nothing. It is the sign-in screen's backdrop: the LCX mark as a machined metal object under one key light. It carries no dataset and answers no question | — |

### A naming hazard, because it will mislead you

**Two numbering systems are live in `docs/3d` for the same components.** `FINAL_SCORECARD.md`,
`app-sweep/README.md` and the harness READMEs (`docs/3d/e1/`…) use the numbering in the table above.
`AUDIT_QA.md:26-34` labels `DeckRelief` as *"E2 THE THEATRE"* and `GlobeRelief` as *"E2b THE GLOBE"*, and
`w2/CATEGORICAL_SEPARATION.md` §5b calls `ForgeBackdrop` *"(E1)"*. When reading a finding, **match on the
component name, never on the E-number.** Every reference below is by component name for that reason.

---

## 2 · What I measured today, and what it cost

Every number attributed to "this pass" comes from one of these. Nothing below is read off a picture.

```bash
# 1 · the source fingerprint the sweep computes, over apps/web/src + apps/web/index.html + packages/gl/src
node <the sourceFingerprint routine from scripts/3d-audit-app.mjs:701-720, applied to the tree>
#    → HEAD: 512 files, digest 5c2031618578
#    → same digest at 338db4f and f2e80fa; digest 0393e1e15bcd at 2e548af

# 2 · the theme sweep, twice, into isolated output directories
APP_SWEEP_OUT_DIR=<scratch>/ship-run-a APP_AUDIT_PORT=5688 APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs
APP_SWEEP_OUT_DIR=<scratch>/ship-run-b APP_AUDIT_PORT=5689 APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs
#    → both reports MD5 b214aa2d680058a8f6fe84cddc8d88a4; `diff` returns nothing
#    → 14 instrument controls PASS on both runs, including the four that fail the old chroma floor

# 3 · the suites that pin the accessibility and print behaviour of the ON state
cd apps/web && npx vitest run --config vitest.config.ts \
  src/components/__tests__/reliefPrintPath.test.tsx \
  src/components/geometry/__tests__/surfaceReliefOnState.test.tsx \
  src/components/risk/__tests__/stormReliefOnState.test.tsx        # 28 + 7 + 11 = 46 passed
cd apps/web && npx vitest run --config vitest.config.ts \
  src/components/geometry/orrery/__tests__/orreryViewport.test.ts  # 11 passed
cd apps/web && npx vitest run --config vitest.config.ts \
  src/components/report/__tests__/printStylesAmbientCanvas.test.tsx # 6 passed
```

Two sweeps of the same tree, on different ports, producing **byte-identical** reports is the positive control
that makes the per-surface table below mean something. The sweep's own negative controls — move the frozen
clock and the numbers must move — are recorded in `app-sweep/README.md` and were not re-run here, so what I
have established is repeatability at one instant, not that the instrument is still sensitive. It reproduces
the recorded instant's geometric guard on both runs (sub-solar point off by 0.002° of longitude, "holds"),
which is the closest thing to a sensitivity check I did run.

### The per-surface figures this pass measured, at tree `5c2031618578`

Contrast is data-to-scenery in that surface's own drawing buffer, classified by nearest exposure locus in
CIEDE2000 — *not* by the old chroma floor. Read every column against **the same surface's own dark row**.

| surface | data px % dark → light | data:scenery contrast dark → light | ratio | sd luma dark → light | data Lab chroma light ÷ dark | indecisive % | verdict the sweep prints |
|---|---|---|---|---|---|---|---|
| **E8** ForgeBackdrop | 0.88 → 0.62 | 1.85:1 → **2.82:1** | 152% | 16.07 → 29.89 | 100% | 1.2 | holds up |
| **E4** OntologyOrrery | 2.81 → 4.06 | 1.98:1 → **3.94:1** | 199% | 16.51 → 37.26 | 106% | 4.6 | holds up |
| **E5** SurfaceRelief | 3.08 → 3.08 | 2.27:1 → **2.85:1** | 125% | 17.46 → 21.44 | 103% | 3.1 | holds up |
| **E3** PipelineRelief | 0.72 → 0.17 | 5.86:1 → 3.23:1 | 55% | 13.96 → 20.57 | 118% | 1.5 | degraded |
| **E6** VaultRelief | 1.39 → 0.67 | 3.16:1 → 1.77:1 | 56% | 8.99 → 18.88 | 79% | 1.4 | degraded |
| **E2** GlobeRelief | 4.38 → 3.25 | 2.70:1 → 1.30:1 | 48% | 37.57 → 113.41 | 64% | **18.9 / 14.4** | marks **WITHHELD** |
| **E1** DeckRelief | **0.00 → 0.00** | — → — | — | 27.22 → **22.00** | — | 0.0 | no data marks in either theme |
| **E7** StormRelief | **TOGGLE_DISABLED** in both themes | — | — | — | — | — | not comparable |

**Zero surfaces are measurably worse in light at HEAD.** Two are *degraded* — a real loss recorded rather
than dressed up. One has its verdict withheld because no classifier built on this palette can separate its
marks from its scenery. One draws no data mark in either theme. One never draws.

---

## 3 · The state of the record — three documents disagree with the tree, and you should not quote them

This matters before any recommendation, because the two documents a reader would reach for first are both
stale, in the same way, for the same reason.

### 3.1 · `FINAL_SCORECARD.md` predates the classifier correction AND four renderer fixes

Its headline — *"3 of 8 surfaces are correct in both themes. 4 are measurably worse in light"* — is not true
at HEAD. It was measured on 2026-08-16 against tree `2e548af`, whose fingerprint is `0393e1e15bcd`, before
`338db4f` landed. `338db4f` did two things at once:

- **It replaced the data/scenery classifier.** The old one split pixels on `max(r,g,b) − min(r,g,b) ≥ 60`,
  a floor **derived from unlit palette hexes and applied to lit pixels**. Measured through the repo's own
  composite, that premise fails in *opposite directions per theme*: dark `rule` clears the floor at
  illumination gain 1.55 while the dark rig runs at ambient 1.15 + key 5.2, and **no** light scenery colour
  clears it at any gain. So the dark buffer over-counted marks and the light buffer under-counted them, and
  **every light-over-dark chroma ratio the programme had published was taken with a ruler that is longer in
  one theme.** The scorecard's numbers are that ruler's numbers.
- **It fixed four surfaces.** E6's corridor was fogged with `skyHorizon` — a *sealed vault* hazed with the
  daylight sky — and its light room was 30% under-exposed; E3's data pass took the fog density; E1's
  exposure criterion was inherited from a surface with a 44.67% clip while E1 clips 0.00% at every exposure;
  E4's viewpoint search stopped being bounded by a wall-clock deadline.

The consequence, per row: the scorecard's **E6 light 1.02:1** is now **1.77:1**; its **E1 light sd 11.50**
is now **22.00** (so "flattened to 42%" is 81%); its **E3 light chroma 82** is now 138. Its E2 caveat —
*"no verdict on E2 should be read as one until the classifier can tell a pin from an ocean"* — has since
been settled as a measurement, and the answer is that no classifier on this palette ever can.

**Suggested change, not made (this lane owns only this file):** `docs/3d/FINAL_SCORECARD.md:3` and its
tables at `:127-157` and `:249-254` should be marked superseded, or regenerated.

### 3.2 · `app-sweep/README.md` does not describe the tree it was committed with — for the second time running

The committed report states, at `docs/3d/app-sweep/README.md:45`, that it swept tree **`cc71d6f2a92f`**.
Measured: the tree at its own commit `338db4f` — and at `f2e80fa`, and in the clean working tree —
fingerprints to **`5c2031618578`** over the same 512 files. No commit after `338db4f` touches any of the
three source roots and the working tree is clean for all of them. So the report was generated **before later
edits inside its own commit**.

By that file's own rule two lines further on (*"two carrying different digests may not be compared"*), its
figures are disqualified from comparison with anything at HEAD. **This is the identical defect
`FINAL_SCORECARD.md` §5 raised about the *previous* edition of the same file.** It has now happened twice in
consecutive commits, which makes it a process defect rather than an accident: the report is generated, then
the surfaces are edited, then both are committed together.

The practical consequence is exactly one surface's rows. Diffing the committed report against my run changes
**20 lines**, and every substantive one is E3's:

```
- | **E3** PipelineRelief | light | … 126 / 129 | **0.00** | — | 224.3 | **—** | — |
+ | **E3** PipelineRelief | light | … 138 / 142 | **0.17** | 117.5 | 224.4 | **3.23:1** | 61.5 |

- | **E3** PipelineRelief | 145% | 131% | 0% | 0% | 0% | 54% | **WORSE IN LIGHT** |
+ | **E3** PipelineRelief | 147% | 141% | 118% | 24% | 55% | 61% | **degraded** |
```

Plus the status headline, the fingerprint, the date stamp, and the deletion of the whole
*"Worse in light — the list"* section. **Every other surface's numbers are unchanged**, which is also the
closest thing to a mutation test available here: a real source change moved exactly the axis the instrument
guards and moved nothing else.

**So: E3 PipelineRelief is not "worse in light". It is degraded in light.** Anything quoting the former is
quoting a report generated against source that was then edited.

### 3.3 · Three HIGH findings in `AUDIT_QA.md` are closed at HEAD, and one is not

`AUDIT_QA.md` was measured against `b9770fb`. Checked against HEAD:

| finding | status at HEAD | how I checked |
|---|---|---|
| **F1** — turning E5 on deletes the whole figure from the accessibility tree (net **−118** named nodes) | **CLOSED** | `SurfaceRelief.tsx:286-293` now renders a derived `ReliefTextForm` inside `[data-relief-live]` with no `aria-hidden`; `surfaceReliefOnState.test.tsx` derives its expectations from the engine's own notices, `Object.entries(frame)` and the three tick arrays — **7 tests pass** |
| **F2** — a plain ⌘P in dark prints a near-black full-document canvas behind the board pack and the compliance record | **CLOSED** | `PrintStyles.tsx:134` now carries `canvas:not(main canvas) { display: none !important; }`; `printStylesAmbientCanvas.test.tsx` — 6 tests pass. Note the scope: this reaches only pages that mount `PrintStyles` |
| **F6** — E4 cannot be opened below roughly 940 CSS px of viewport height (so not on a 13-inch MacBook or a 1366×768 laptop) | **CLOSED** | the camera was solved against the system's bounding sphere and the drawing is not a sphere; frame fill went 66.5% h / 51.7% w → 88.2% / 68.6%. `orreryViewport.test.ts` asserts both laptops draw the page-default graph with every body above the 9-px floor, **and** that the guard still refuses when it must — 11 tests pass |
| **F3** — filtering `/audit-log` or `/bd-pipeline` silently discards an open relief, and the refusal machinery written for exactly that case never runs | **STILL OPEN** | `apps/web/src/pages/AuditLog.tsx:236` still gates on `entries.length > 0` and `apps/web/src/pages/BdPipeline.tsx:831` on `!loading && !error`, so a refetch unmounts the wrapper. `aria-disabled` stays `null`, so `onRefused` never fires and the alert count is 0 |

F3 is not a blocker for the current default-off state — an operator loses a relief they opened. It becomes a
*new and worse* problem under default-on, and §4 says so where it applies.

---

## 4 · The decision rule

Four gates. **All four must pass for SHIP ON.** Gates 1 and 2 are the two the brief states are not open;
gates 3 and 4 are mine and are defended below.

| gate | the question | fails → |
|---|---|---|
| **G1 · SEPARABILITY** | are this surface's data marks attributable as data in **both** themes, and does it avoid authoring scenery inside the 10 ΔE2000 floor of a data colour (which withholds the verdict)? | cannot ship ON |
| **G2 · NOTHING DELETED** | does enabling it leave the flat figure's information in the accessibility tree and in the print output? | cannot ship ON until closed |
| **G3 · REACHABLE** | does it draw, on the routes and viewports its readers have, from data that exists? | not a rendering decision — say whose decision it is |
| **G4 · A MEASURED ADVANTAGE** | is there a number, computed on the reader's **own** data, that the flat surface demonstrably loses? | KEEP: promotion would be an unproven claim |

**One provenance note that applies to G2 four times below.** The figure *"readable figures, relief off → on:
1 → 0 (lost)"* comes from `docs/3d/APP_SWEEP.md` Axis 2, swept 2026-08-14 and last regenerated at
`bd4f1c2` — so it predates HEAD. I did not re-run it. What I did verify at HEAD, by grep and by a currently
passing census (`reliefPrintPath.test.tsx`, 28 tests), is the **mechanism** that produces it: `/bd-pipeline`,
`/audit-log`, `/market-map` and `/ontology` mount no `PrintStyles`; their four wrappers set neither
`data-relief-live` nor `data-relief-print-flat`; and each of the four unmounts its flat figure entirely while
the relief is open. Those three facts together are what "1 → 0" measures, and all three hold at HEAD. Read
the count as corroboration and the mechanism as the finding.

**Why G4 is a gate and not a preference.** Clause (b) is unmeasured for all seven surfaces it applies to.
That is not going to change from a desk. But "unmeasured" is not the same as "unevidenced": one surface
(E4) computes, on the graph in front of the reader, a quantity the flat reading provably loses, and refuses
itself when it does not. That is the strongest substitute available, and it is not a reading time. Every
other surface's clause (b) case is an *argument*. G4 separates the two.

**Why passing all four still would not make a promotion safe.** It would make it *defensible*. The
distinction is the whole discipline of this programme, and §8 keeps it.

### When DELETE is the right answer

A surface earns deletion when **all three** hold:

1. it fails G1 or G2 in a way that cannot be closed without a redesign of what it encodes; **and**
2. it has no measured advantage over its flat form; **and**
3. keeping it costs something real.

Point 3 is where every candidate here fails the test for deletion, and it is measured rather than assumed:

- every surface is behind a toggle that **defaults off**, so the ordinary reader never meets it;
- every refusal path lands back on the flat surface with the refusal named — `AUDIT_QA` drove all seven
  controls **from the keyboard** with WebGL genuinely denied (`getContext` returning `null` for every
  `webgl*` string, both constructors deleted from `window`) and got `NO_WEBGL2`, focus retained on the
  button, `aria-describedby` resolving to the reason, zero page errors, and the flat surface intact —
  counted: DeckRelief 61, PipelineRelief 87, VaultRelief 26, GlobeRelief 33, OntologyOrrery 113
  tables/SVGs, with SurfaceRelief's and StormRelief's recorded as intact without a count;
- the GL arrives in a **lazy chunk** — the environment layer alone is 35.7 KB against ~11 KB of headroom in
  a 850 KB budget — so a reader who never opens a surface pays nothing for it;
- context churn is bounded: **1** live GL context after 8 off/on cycles on five surfaces, and after 14 fast
  cycles on a dark `/bd-pipeline`; **0** after 5 navigations away mid-mount.

So the cost of keeping is close to zero and every repair named below is bounded. **I recommend no
deletions**. §5 names the two surfaces that came closest — VaultRelief and DeckRelief — and the single
measurement or decision that would move each of them; §6 ranks them last for that reason.

---

## 5 · The eight recommendations

### E8 · ForgeBackdrop — `/select` — **SHIP ON by default**

A reader opens it to learn nothing: it is the sign-in screen's backdrop, the LCX mark as a machined metal
object under one key light. It carries no dataset and answers no question.

**This recommendation ratifies the status quo and changes no code.** E8 has no toggle — it is the one
surface that simply runs. I state it as SHIP ON rather than quietly leaving it out, because a decision sheet
that skips the surface every unauthenticated stranger sees is not a decision sheet.

**The measurements that drive it**

1. **Clause (b) is NOT APPLICABLE, not unmeasured.** `docs/3d/e9/README.md` settles the split: E8 carries no
   dataset and answers no question, so recording it as unmeasured *"would imply work that does not exist."*
   It is therefore the only surface where SHIP ON promotes no unproven reading claim.
2. **It is better in light, measured.** Data-to-scenery contrast 1.85:1 → **2.82:1** (152%), data Lab chroma
   unchanged at 100%, and the lowest indecisive share of the eight (1.2%). Both runs identical.
3. **Reduced motion resolves to the final frame, not to a faster animation.** Under
   `prefers-reduced-motion: reduce` it requests **zero** `requestAnimationFrame` and calls `render(1)`
   directly; compared against the settled normal-motion frame over a whole 1440×900 viewport the mean
   absolute channel difference is **0.003 / 255**. It is the only surface that animates (a five-second key-
   light arc: 7 frames between t≈385 ms and t≈5518 ms, then it stops, with no trailing frame), and
   `apps/web/e2e/smoke.spec.ts` holds a reduced-motion pixel baseline for it.

**What would change it.** A real-hardware measurement of sign-in time-to-interactive. Every frame time in
this programme is SwiftShader, a CPU rasteriser, and the E9 sweep **refuses** to convert one into a headroom
figure, because the ratio to real hardware is not a constant: E8's harness measures 157.4 ms/frame there,
while the one scene with a recorded M1 number (E0) measures 1.305 ms on hardware for a scene SwiftShader
labours over. If the arc measurably delays the sign-in form on a real machine, this becomes KEEP — or,
cheaper, render the final frame only.

**Cost of being wrong.** A stranger's first impression of the product is slow or ugly. It reaches nobody's
data and no decision. Two smaller known costs, both stated rather than discovered: E8 does **not** import
`look/theme.ts` — it predates the module and branches on the `dark` class with its own hand-tuned pair, so a
future palette change will not move it; and its two canvas captures are among the three in the sweep that
are not byte-identical across runs (an 18×18 px patch at max channel delta 5 in dark, 19×19 at 6 in light —
0.013% of the image, sub-perceptual).

---

### E5 · SurfaceRelief — `/command-deck` — **KEEP BEHIND THE TOGGLE**

A reader opens it to learn which liquidity partner leads, and on which weighted dimension, from the LP
bench scorecard (`POST /v1/command/engines/lp-rescore`, authored score, 10 dimensions × 9 ranked partners).

**This is the only surface with no engineering blocker left.** Its recommendation turns purely on clause (b),
which is exactly the situation §7 of the doctrine was written for.

**The measurements that drive it**

1. **G1 passes cleanly and symmetrically.** Data share **3.08% in both themes**, contrast 2.27:1 → **2.85:1**
   (125%), data Lab chroma 103% of dark. It draws one category (`#2C6BFF`, `#7FB2FF`), so
   `CATEGORICAL_SEPARATION.md` §5b records it as having no cross-category pair that could fail.
2. **G2 is closed and tested — it is the only surface where that is true of the ON state.** F1 was the
   worst finding in `AUDIT_QA` (net −118 named accessibility nodes, including the figure's own accessible
   name, its provenance list, and `Z_DOMAIN_EXCLUDES_ZERO` — a truncated-axis warning disappearing in
   precisely the reading where a floor above zero misleads most). It is fixed by a text form whose contents
   are **derived** — `Object.entries(frame)`, the engine's own `notices`, the three tick arrays — so a field
   added tomorrow appears without anyone remembering. `/command-deck` mounts `PrintStyles`, and the flat
   figure is the second arm of the same Suspense boundary, so paper gets the figure and not the canvas.
   Verified by 7 passing on-state tests and 28 on the print census.
3. **G4 fails.** There is no number here that the flat form loses. Worse for the promotion case than for
   most: E5's flat form (`SurfacePlot`) is *already an axonometric projection*, so the relief's marginal
   claim over it is the weakest of the credible candidates, not the strongest.

**What would change it.** One operator, one sitting, E5's matched question pair in `docs/3d/e9/task.html`.
The instrument is verified mechanically (14 trials, counterbalance 4-3, zero duplicate questions, startup
excluded in all 14) and it **refuses** rather than reporting a meaningless comparison. Its counterbalance
bias runs *against* reporting a pass, which is the right direction. **If exactly one trial is ever run, run
E5's** — it is the only surface where a clause (b) pass would immediately imply SHIP ON, because nothing
else is in the way.

**Cost of being wrong.** Near zero either way. The flat figure is the default and is unharmed; the surface
is one click and one line (`SurfaceRelief.tsx:241`, `useState(false)`) from either state.

---

### E4 · OntologyOrrery — `/ontology` — **KEEP BEHIND THE TOGGLE**

A reader opens it to learn how the ontology's ~74 entities relate: distance from the core is hops by
breadth-first search, size is record count, entity kind is orbital inclination, relationship strength is
tube thickness, height above the reference plane is read from a body's own shadow.

**This is the surface the evidence most wants to promote, and it is held back by one gap that is closeable.
If one recommendation in this document is wrong, it is this one.**

**The measurements that drive it**

1. **G4 — the only measured advantage in the programme, and it is camera-independent.** Crossings a reader
   cannot resolve: **7 of 7** in the flat layout, **0** in the orrery. Minimum separation at a crossing
   0.0000 m flat against **0.2845 m**, and the proof needs no camera: two tubes can only fuse into an
   unreadable X if their minimum 3-D separation is less than the sum of their radii, which is 0.172 m here —
   so `grazingPairs3D` is 0 and **no viewpoint whatsoever** can produce an ambiguity. A 36-azimuth sweep
   agrees empirically. The flat layout cannot reorder its way out: over **120,000** random angular
   permutations its best result was 1 crossing, never 0. The orrery has *more* crossings on screen (up to
   18) and the file says so, because the claim is that none of them is ambiguous.
   And it self-refuses: if the orbital layout ever fails to beat the plane on that count, the reader keeps
   the diagram with `THIRD_AXIS_BUYS_NOTHING` (`orreryLayout.ts:1295`).
2. **G1 is the strongest of the eight.** Best light contrast (1.98:1 → **3.94:1**, 199%), highest data share
   (2.81% → 4.06%, 145%), chroma 106% of dark. Its one cross-category failure is closed: `core`/`withheld`
   was collapsing at `metalness 0.36` — a third of the mark's colour was a mirror of the sky rather than its
   own albedo — and at `metalness 0.08` it measures p05 **12.92** dark / **12.76** light against a floor of
   10, with `core`/`observed` *improving* from 9.55 to 13.70 as a side effect.
3. **G2 FAILS, and this is the whole blocker.** With the orrery on, the ReactFlow diagram — ~74 labelled
   nodes with badges, all real DOM — is unmounted (`OntologyOrrery.tsx:151,175`), and what replaces it in
   text is **at most two labels**: `CORE · …` and `SELECTED · …`. That is not an oversight, it is E4's
   design: the kind is *deliberately* not printed, because if it were, a reader would never need the planes
   and inclination would be decoration. `/ontology` mounts no `PrintStyles` (grepped at HEAD), and the app
   sweep measured readable figures **1 → 0 (lost)** under print media with the relief open.
4. **G3 now passes, and did not a week ago.** F6's viewport floor is closed: both a 1440×900 13-inch MacBook
   and a 1366×768 laptop draw the page-default graph with every body above the 9-px floor, verified by 11
   passing tests, with the refusal still firing when it must.

**What would change it.** Close G2 and I would recommend SHIP ON for E4 on the next pass. Concretely: a
derived text form for the orrery's reading — shells, kinds, the crossing counts for both readings, the
entities per plane — inside `[data-relief-live]` with no `aria-hidden`, exactly the pattern
`SurfaceRelief.tsx` established, plus `<PrintStyles />` on `OntologyExplorer.tsx` and a `print-flat` copy of
the diagram. **The price is measurable, because it has been paid twice:** E5's ON-state fix was
**170** inserted lines in the wrapper plus a **229**-line derived test; E7's was **248** plus **378**. So
budget roughly 400–600 lines including the test that keeps it honest.

**Cost of being wrong (turning it on before G2 closes).** A screen-reader operator, a text extraction and a
copy-paste each lose every entity name on the ontology page, silently, by default, with no action of their
own. That is the same defect class as F1, which was rated HIGH, and it would be shipped deliberately rather
than by accident. That asymmetry is why the recommendation is KEEP despite E4 having the best evidence.

---

### E3 · PipelineRelief — `/bd-pipeline` — **KEEP BEHIND THE TOGGLE**

A reader opens it to read market cap, gate and movement **jointly**: cap as an object's size (cube-rooted,
because size is volume), gate as position down a lit channel, days since `updatedAt` as height — so value
that cleared the warm gate and then stopped moving is a *shape* rather than two sorts and some arithmetic.

**The measurements that drive it**

1. **G1 passes in both themes — and this is the row the committed record gets wrong.** Measured twice at
   HEAD: light data share **0.17%**, contrast **3.23:1**, data Lab chroma **118%** of dark. The committed
   report says 0.00% and "WORSE IN LIGHT" because it was generated before the fix in its own commit (§3.2).
   The honest verdict is **degraded**: contrast fell to 55% of dark and the light data share is 24% of dark,
   both real losses, neither a collapse.
2. **G2 FAILS.** With the channel on, `LeadTable` is not rendered at all (`PipelineRelief.tsx:111-113`); what
   survives in text is the caption — the axis, the gate order, and one headline number. Every lead name, cap
   and date leaves the document. `/bd-pipeline` mounts no `PrintStyles`, and the sweep measured readable
   figures **1 → 0 (lost)** in print. The surface's own header is straight about the other half of this:
   *"`s`, `d`, `e`, `j`/`k` and Space act on table rows; a canvas has no rows"* — so the ON state also loses
   the triage grammar this page exists for.
3. **F3 makes default-on actively worse here, not merely unproven.** `BdPipeline.tsx:831` unmounts the
   wrapper on every refetch. Today that costs an operator the relief they opened. Under default-on it would
   *reopen* on every filter action — a fresh GL context and the table hidden again per keystroke-driven
   refetch — which inverts the harm rather than removing it.

**What would change it.** G2 closed the E5 way (a derived text form for the channel's reading, plus a print
path), and F3 closed by hoisting the wrapper above the loading gate. Then the argument returns to clause (b),
where E3's case is genuinely good but is an argument: the joint reading is a product of three columns a table
can only sort one at a time.

**Cost of being wrong.** The BD queue is a working surface with a keyboard grammar. Defaulting it to a canvas
would take the triage tools away from the operator who uses them most, and give back a shape.

---

### E6 · VaultRelief — `/audit-log` — **KEEP BEHIND THE TOGGLE**

A reader opens it to see the sequence of recorded governed actions with time carried as depth — 12 hours per
metre — and fog as the stated reading limit.

**This is the recommendation I am least sure of, and the one where KEEP may be too generous.**

**The measurements that drive it**

1. **G1 passes, barely.** It is one of the two surfaces the sweep records as *degraded*: contrast 3.16:1 →
   **1.77:1** (56% — E3 is 55%, so the two are a point apart), light data share 48% of dark, data Lab chroma
   79%. Both ends still read as two populations, which is why this is recorded and not raised as a finding —
   and a 44% loss of separation printed as "holds up" is how a capture programme turns into a marketing
   exercise, so it is not printed that way here either. That is a genuine improvement on
   what the record says — the scorecard's **1.02:1** (marks and room the same brightness) came from a
   *sealed vault fogged with the daylight sky* plus a room rendering at 70% while the marks arrived at 100%.
   Both halves were proven by reverting each alone: haze-only revert drops chroma to 113/114, exposure-only
   revert drops contrast to 1.17.
2. **G2 FAILS — and this is a judgement about consequence, not a metric: of the four surfaces that fail G2
   this is the one whose deletion costs most, because what it deletes is a governance record.** With the
   vault on, the 50 audit rows are not rendered (`VaultRelief.tsx:157-164`). What replaces them in text is the projected label layer — and that
   layer contains **only records the surface itself judges legible** (`VaultReliefGl.tsx:1412-1415` pushes
   only `d.shown`). `AUDIT_QA` F4 measured, at three viewports, **0 of 50** records carrying text in the
   **default (light)** theme and 8 of 50 in dark, with 19 of 50 withheld specifically for
   `BELOW_READABLE_CONTRAST` — a category that does not appear in dark at all. Viewport made no difference;
   the binding term is contrast. `/audit-log` mounts no `PrintStyles`, and the sweep measured readable
   figures **1 → 0 (lost)**: ⌘P with the vault open produces a picture of fifty boxes where fifty records
   were, with the rows not in the document.
3. **F3 applies here too, and costs more.** `AuditLog.tsx:236` unmounts on any filter click, which also
   throws away the GL context and the corridor's position.

**What would change it — and this is the cheapest high-value measurement in this document.** F4's *0 of 50*
was measured at `b9770fb`, before `338db4f` changed the light room's exposure and haze in the direction that
raises the room's luminance relative to the marks. The label gate is a **runtime** comparison of label-over-
background against 4.5:1, so that count is *unknown at HEAD*. Re-measure it: open `/audit-log` in the light
theme with the vault on and read the surface's own printed withheld census. Two outcomes:

- the count is now materially above zero → E6 stays KEEP, with G2 to close like the others;
- the count is still 0 of 50 in the default theme → **the honest recommendation becomes DELETE, or a
  redesign of the label layer.** A depth-is-time corridor with no legible time is not a degraded reading of
  the audit log; it is fifty unlabelled slabs, and the surface's reason to exist is gone on the theme that
  is the default (`stores/useUIStore.ts:28`, `darkMode: false`).

**Cost of being wrong.** Highest of the eight. `/audit-log` is a governance record; turning this on by
default would replace a legible table of recorded actions with a picture, on the theme where the picture
carries no labels, and would delete the rows from paper. The surface is *honest* — it states its own failure
on the frame — but honesty about an unreadable frame is not a reading.

---

### E2 · GlobeRelief — `/market-map` — **KEEP BEHIND THE TOGGLE**

A reader opens it to see where projects sit geographically, as a globe with a day/night terminator and
markers placed from latitude/longitude by a documented formula. It places **regions, not organisations**,
and says so before you click.

**The measurements that drive it**

1. **G1 FAILS in both themes, and the rule is not open.** Its verdict is **WITHHELD**, not degraded: the
   surface authors `#0B2B5C` (ΔE2000 **3.2** from the data colour `brandDeep`), `#4C86FF` (**8.8** from
   `brand`) and `#8FA3C4` (**9.9** from `brandBright`), all inside the 10 ΔE2000 floor
   `look/categorical.ts` sets for *"a reader cannot reliably tell them apart"*. Its atmosphere shell at
   `#7FB2FF` **is** `brandBright`, exactly. The palette states that `BRAND_HEX` are the only colours a
   surface may encode data in, so these are not data encodings — which means **no classifier built on this
   palette can separate this surface's marks from its scenery, in either theme.** Its own renderer says so
   at `GlobeReliefGl.tsx:463`. Corroborating: the highest indecisive share of the eight by an order of
   magnitude — **18.9%** dark, **14.4%** light, against ≤4.6% everywhere else.
   This also retires an old caveat properly: E2's verdict used to swing by a factor of four across one
   simulated day (7.21:1 at 05:00Z, 5.91:1 at 07:18Z, 2.81:1 at 09:00Z, 1.62:1 at 13:00Z) because most of
   what landed in its DATA population was *lit ocean*. Freezing the clock made that column repeatable; it
   never made it a measurement of the marks.
2. **G2 FAILS.** The flat scatter is unmounted while the globe is on (`GlobeRelief.tsx:212-220`);
   `/market-map` mounts no `PrintStyles`; readable figures **1 → 0 (lost)** in print. In partial mitigation,
   and measured: E2 is the one surface that *gains* accessibility nodes when opened (**+50** net) because it
   projects DOM labels.
3. **G3 is an owner question, not an engineering one.** E2's subject is geography and its dataset has none:
   `MapPoint` carries a coarse `region` string and no coordinates. The globe places published reference
   points for regions. **Whether per-project coordinates should exist is the owner's decision**, and until
   they do, the strongest reading this surface can offer is regional.

**What would change it.** G1 first, and the repair is in the surface rather than in the instrument: author
the ocean and the atmosphere **outside** the 10 ΔE2000 neighbourhood of every `BRAND_HEX` data entry. That
is two or three albedos — which is why this is KEEP and not DELETE. Then G2. Then the data question.

**Cost of being wrong.** A reader mistakes a globe of regions for a map of where partners are. The surface's
own header says it plainly: *"a globe that a reader mistakes for a map of where partners are would be worse
than no globe."* Under default-on that caveat has to be read *after* the picture, which is the order the
header argues against.

---

### E1 · DeckRelief — `/command-deck` — **KEEP BEHIND THE TOGGLE**

A reader opens it to learn which of four command-deck panels is the one being addressed: the panel nearest
the camera is the one in focus, where a flat grid gives every panel equal weight.

**Joint least-sure recommendation with E6, for a different reason: what remains here is a decision, not a
measurement, and it is not mine to take.**

**The measurements that drive it**

1. **G1 FAILS, in both themes, by construction.** Not one pixel of E1's drawing buffer is attributed to a
   data colour in either theme: **100.00%** of the buffer sits below the achromatic ceiling of 18.6 Lab
   chroma, with max encoded chroma 31 dark / 29 light. Its geometry is a grey room. Under the rule that a
   surface whose marks are not separable as data in either theme cannot ship ON, E1 cannot ship ON.
2. **There is a real and partly exculpatory explanation, and it is a decision rather than a defect.** E1's
   panel text is **projected DOM, not baked pixels** — the numbers a reader reads are HTML over the canvas,
   and the sweep's statistics come from the GL drawing buffer alone, which cannot see them. So "no data
   marks" is true of the geometry and not necessarily of the page. What the geometry contributes is depth
   *ordering*, which carries emphasis rather than a value. **The open item is a choice:** either E1's
   reading is agreed to live in DOM — in which case no chroma-based instrument will ever score it, and that
   should be written down — or the geometry should carry a mark that clears the floor. **That is the owner's
   call, not a fix.**
3. **G2 passes, and E1 is one of only three surfaces where it does.** `CommandDeck.tsx:97` mounts
   `PrintStyles`, `DeckRelief.tsx:149-150` carries both the `print-flat` copy and the `relief-live` block,
   and the print rule removes the *whole* live block rather than only the canvas — which matters here more
   than anywhere, because deleting only the bitmap would print projected text unbacked on white paper, in a
   homography transform, on top of the flat deck it duplicates. Measured retention in the ON state: **805**
   characters inside `[data-relief-live]`. **Honest limit:** no net accessibility-node delta has been
   measured for E1's ON state — the flat panels sit inside the `aria-hidden` print copy while it is open, so
   what the projected text preserves versus what the panel bodies carried is *not* known.
4. **E1 is the only surface still flatter in light** — sd luma 27.22 → 22.00 (81%). That is much better than
   the record's 42%, but it is still the wrong direction, and it is the direction the light rig was retuned
   to prevent.
5. **Its own header refuses its promotion**, and this is the clearest case in the codebase of a component
   arguing against itself: the reading is *"a small one"*, and its harness records §7(b) as
   *"a real tension, not a gap"*, because the focus rack that states the emphasis is the same mechanism that
   costs the other panels legibility (far panels measure 1.5:1 when the lens is on).

**What would change it.** (a) The DOM-versus-geometry decision, written down either way. (b) If the answer
is "the reading lives in DOM", then an accessibility-node delta for the ON state, so G2's pass is measured
rather than structural. Note that a clause (b) trial would *not* settle E1 on its own: with G1 failing as
measured, a favourable reading time would tell us the projected DOM reads well, not that the geometry
encodes anything.

**Cost of being wrong.** Low in information terms — the print path is closed and the panel text is
projected. The real cost is a precedent: promoting a surface whose geometry carries no mark would make the
separability gate decorative, and that gate is the only thing standing between this programme and a
showreel. There is also a small operational cost on record: E1's dark canvas capture lands in exactly one of
**two discrete states** across runs (7.17% of pixels differing at max channel delta 230, in the projected
DOM text and the panel and floor *edges*, never the fills), so anyone diffing captures of `/command-deck`
will hit it.

---

### E7 · StormRelief — `/marketing/crisis` — **KEEP BEHIND THE TOGGLE**

A reader would open it to see forward risk over a calendar as a storm field, where the depth of colour is
the total risk between the reader and a given day.

**This is not a rendering decision, and the recommendation is the engineering half only.**

**The measurements that drive it**

1. **G3 FAILS: it is unreachable, and confirmed on both of my runs.** `MarketingCrisis.tsx:89` builds the
   field with `riskFieldUnavailable(...)` — a *named* absence, because no forward risk feed is produced
   anywhere in the system. The toggle is permanently `aria-disabled` and both themes report
   `TOGGLE_DISABLED` with the page's own words: *"NO CALENDAR — NO_FORWARD_RISK_FEED No forward risk feed
   reaches this desk."* **The data question belongs to the owner.** The surface states its own requirement:
   one feed reporting risk by day × channel × severity band, each day carrying its coverage state
   explicitly rather than inferred, with a `source` and an `observedAt`. `buildRiskField` takes it and both
   views work with no change to the wrapper or the page.
2. **G1 FAILS independently, and separately it is deliberately dark-only.** The precondition withholds its
   verdict: it authors `#22315A`, ΔE2000 **4.4** from `brandDeep`. And its renderer argues its dark-only
   decision in arithmetic rather than taste: brand `#2C6BFF` linear luminance 0.18271 against reference
   `#FF8A3D` at 0.39774 — the orange is 2.177× the blue — giving a **5.74×** span on a dark ground
   (1.14–5.06:1) that becomes **1.05–1.28:1** over the light theme's floor. **The severe half of the ramp is
   the half that disappears**: 5.06:1 → 1.28:1 while the calm half stays visible. That is not a dimmer
   picture, it is the reading inverted, with the worst days rendering faintest. And it cannot be re-exposed
   away: the high end renders darker than the low end over a light ground only if
   `s_hi < 0.4594 · s_lo`, which at the shipped `s_lo = 0.55` caps `s_hi` at 0.2527 — where the two ends are
   equal by construction.
3. **G2 is closed, which is worth recording even on an unreachable surface.** The same fix E5 got: with the
   storm open, readable text fell from **1,699** characters to **641** on the test fixture and not one number
   from the field survived; the text block restores it to **2,339**, and the OFF state is untouched at 1,699.
   The test re-derives every count per run. `/marketing/crisis` mounts `PrintStyles` and E7 carries the
   print-flat copy, so it is one of the three surfaces that reach paper correctly.

**What would change it.** The feed. Nothing else. **And note the prediction on record:** the day it lands,
E7's light half is tested against a white page for the first time and the arithmetic above predicts it will
fail. So the feed decision and a light-theme decision for E7 arrive together, and should be taken together.

**Cost of being wrong.** Zero in the ON/OFF direction, because there is no ON: the renderer never runs and
the flat calendar is unaffected. The only way to be costly here is to *record* E7 as shipping. Its own header
gives the correct status in three words — **BUILT AND GATED ON DATA** — and this document adopts it. The
second cost, if the recommendation is read as "leave it alone forever", is that the light-theme arithmetic
above quietly becomes a surprise on the day the feed lands.

**One thing I would change now and cannot from this lane:** a permanently `aria-disabled` toggle on a live
route advertises a capability the desk cannot have. Consider not offering the control until the feed exists.
That is a judgement about operator experience, not a measurement, and it is stated as such.

---

## 6 · The eight, ranked by how confident I am

| rank | surface | recommendation | why the confidence is where it is |
|---|---|---|---|
| 1 | **E7** StormRelief | KEEP | Nothing to decide on rendering. Unreachable by a named absence, confirmed in both themes on both of my runs and by the page's own words. The only way to be wrong is if the feed already exists somewhere and nobody wired it |
| 2 | **E8** ForgeBackdrop | SHIP ON | The only surface where clause (b) is NOT APPLICABLE, so the recommendation promotes no unproven claim. Better in light, measured. Ratifies the status quo, changes no code |
| 3 | **E2** GlobeRelief | KEEP | Forced by a rule that is not open: verdict withheld in both themes, and the reason is arithmetic about the palette rather than a judgement. The repair is named and small, which is why it is not DELETE |
| 4 | **E5** SurfaceRelief | KEEP | No blocker and no advantage. Confident about both halves; the whole decision sits on one missing measurement, and its flat form is already a projection, which weakens the promotion case rather than strengthening it |
| 5 | **E3** PipelineRelief | KEEP | Confident in the verdict, and I had to correct the published numbers to reach it (§3.2). G2 fails, and F3 would make default-on worse than the status quo rather than merely unproven |
| 6 | **E4** OntologyOrrery | KEEP | **The direction I am least comfortable with.** It has the only measured advantage in the programme and now clears the viewport floor. It is held back by one closeable gap, at a price already paid twice (~400–600 lines). If this document is wrong anywhere, it is here |
| 7 | **E1** DeckRelief | KEEP | Least sure. G1 fails as measured, but the measurement cannot see the projected DOM that carries the reading, and what remains is a decision the owner has to take rather than a number I can produce |
| 8 | **E6** VaultRelief | KEEP | Least sure, and KEEP may be too generous. It turns on one count — 0 of 50 record labels in the default theme — measured before the room was fixed. If that count is still zero, the honest answer is DELETE or a redesign |

**Least sure, plainly: E6, E1, and E4** — E6 and E1 because a single missing measurement or decision could
change the recommendation itself; E4 because I believe the recommendation is right *today* and expect it to
be wrong within one commit of somebody closing its accessibility gap.

---

## 7 · What I did not touch, and would change elsewhere

This lane owns only this file. Each of these is a change I would make and did not:

- `docs/3d/FINAL_SCORECARD.md:3`, `:127-157`, `:249-254` — the headline and the per-surface tables are the
  old chroma-floor classifier's numbers over a pre-`338db4f` tree. Mark superseded or regenerate.
- `docs/3d/app-sweep/README.md:45` — states tree `cc71d6f2a92f`; the tree at its own commit and at HEAD is
  `5c2031618578`. Its E3 rows (`:485`, `:509`, `:532`, `:582`, `:652-656`) are stale. Regenerating the file
  fixes all of it, and the generator should refuse to write when the digest it is about to print differs
  from the digest of the tree at `HEAD`.
- `docs/3d/AUDIT_QA.md:26-34` and `docs/3d/w2/CATEGORICAL_SEPARATION.md` §5b — two different numberings for
  the same components (§1). One of them should move.
- `docs/3d/AUDIT_QA.md` F1, F2, F6 — closed at HEAD (§3.3). Mark them so; a closed HIGH that still reads as
  open costs the next reader a day.
- `apps/web/src/pages/AuditLog.tsx:236` and `apps/web/src/pages/BdPipeline.tsx:831` — F3 is still open: a
  refetch unmounts the relief wrapper, so a documented and tested refusal path is unreachable.

---

## 8 · What this document does not establish

- **Clause (b), for any surface.** No reading time appears anywhere above. §0 says why, and why producing
  one would have been worse than producing nothing.
- **That the surfaces I recommend keeping are worth keeping *as readings*.** A contrast ratio is not a design
  review. A scene can keep its luminance spread and its chroma and place them somewhere useless, and no
  number here would notice. Every verdict should be read next to the capture it came from
  (`docs/3d/app-sweep/theme/*.png` — the `*-canvas.png` files are the stable ones).
- **Real-hardware anything.** Every frame in every measurement cited here is rasterised on the CPU by
  SwiftShader (Chromium 149.0.7827.55 on my runs). Channel ordering survives, exact hexes do not —
  `#2c6bff` lands at `#2c68dc`. There is no timing column anywhere on purpose.
- **The E6 label count at HEAD**, which is the single measurement most likely to change a recommendation in
  this document. §5 (E6) says exactly how to take it.
- **E1's accessibility-node delta in the ON state**, which is what would turn its G2 pass from structural
  into measured.
- **That the data is right.** Where a route needs seeded data the sweep replaces the network with the
  smallest fixture that makes the surface drawable. No number here is read off production.

---

## 9 · Reproduce

```bash
# the theme statistics in §2, into an isolated directory so nothing in docs/3d is overwritten
APP_SWEEP_OUT_DIR=/tmp/ship-a APP_AUDIT_PORT=5688 APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs
APP_SWEEP_OUT_DIR=/tmp/ship-b APP_AUDIT_PORT=5689 APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs
diff -r /tmp/ship-a /tmp/ship-b     # must be empty; check the source fingerprint line first

# the accessibility / print / reachability gates in §3.3 and §5
cd apps/web
npx vitest run --config vitest.config.ts src/components/__tests__/reliefPrintPath.test.tsx
npx vitest run --config vitest.config.ts src/components/geometry/__tests__/surfaceReliefOnState.test.tsx
npx vitest run --config vitest.config.ts src/components/risk/__tests__/stormReliefOnState.test.tsx
npx vitest run --config vitest.config.ts src/components/geometry/orrery/__tests__/orreryViewport.test.ts
npx vitest run --config vitest.config.ts src/components/report/__tests__/printStylesAmbientCanvas.test.tsx

# the one measurement that could change a recommendation: E6's light-theme label count
# /audit-log, light theme, vault open — read the surface's own printed withheld census
```

**Where the rest of the evidence lives.** `docs/3d/app-sweep/README.md` (the theme pass — read §3.2 first),
`docs/3d/APP_SWEEP.md` (print, reduced motion, context loss, GL context budget), `docs/3d/AUDIT_QA.md` (the
accessibility and print findings — read §3.3 first), `docs/3d/w2/CATEGORICAL_SEPARATION.md` (whether marks
are separable as data at all), `docs/3d/e9/README.md` (the per-surface gate status, and Audit 5c on why a
machine reader cannot stand in for the human one), and each surface's own component header, which in this
codebase argues its case in measured detail and twice refuses its own promotion.
