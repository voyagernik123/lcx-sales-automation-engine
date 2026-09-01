# THE INSTRUMENT — the 100x plan for the dimensional layer

> **Status:** proposed 2026-09-01, for approval. Built **solo — no subagents, no workflows** — by the
> owner's instruction, to see whether one mind can carry it. Nothing below is started.
> **Supersedes as a planning document:** `DIMENSIONAL_100X_PLAN.md` (THE SOLID), `3D_VFX_100X_LIVE.md`,
> `ALIVE_PLAN.md`, `DESIGN_FATIGUE_FIX_PLAN.md`. All four stay in the repo as the record; two of them are
> absorbed here as systems rather than left as separate programmes.
> **Every number in §0 was measured this morning against `HEAD = 2e0340a`.** Every mechanism in §4 is cited
> to a file and a symbol. Where a claim is not yet measured it says so, and §4's S0 exists to measure it.

---

## 0 · THE FINDING — the engine is built; the vehicle is wrong

You have said the 3-D/VFX layer is "kind of ass" after three programmes and seven plan documents. I went to
find out why, expecting to find missing technology. I found the opposite.

| What exists, measured today | Where |
|---|---|
| A **8,907-line** GL package: GGX + Smith + anisotropic specular, Schlick Fresnel, analytic-sky IBL, PCF shadows with slope bias, half-res CoC depth of field, analytic height fog, GPU particles and volumes, SDF-antialiased 2-D primitives, linear-HDR pipeline with one tone-map composite | `packages/gl/src/env/lit.ts`, `dof.ts`, `particles.ts`, `volume.ts`, `flat/*`, `look/pipeline.ts` |
| A **measured** brand-fidelity system that replaced four claims that died on measurement — order preservation at the 5th-percentile fragment, CIEDE2000 not CIE76, an invertible tone curve used only where it can be | `look/categorical.ts`, `look/precompensate.ts`, `look/colour.ts` |
| A **theme rig** in which data never moves and scenery must, with the light-theme regressions on E1/E3/E6 found by an instrument that turned out to have a ruler longer in one theme than the other — and then **fixed, each half proven by reverting it alone** | `look/theme.ts`; commit `338db4f` |
| **Eight environments** E1–E8, seven reachable, 15 GL chunks live on the deployed site, zero eager GL bytes | `apps/web/src/components/{geometry,risk,market,brand,command}/*Gl.tsx` |
| Harness rules **enforced by test**: flat fallback + captured refusal, no idle animation in source or bundle, one context per environment, GLSL ships no comments, every capture has a README whose first line is a verdict | `packages/gl/src/env/harnessRules.test.ts` |

Roughly nine-tenths of a production graphics architecture — and it does not read as a crown jewel. Here is
the shape of what was built, in the same table's discipline:

| The shape, measured today | Number |
|---|---|
| Routes in the app | **80** |
| Routes that carry a GL environment | **7** (CommandDeck, BdPipeline, AuditLog, OntologyExplorer, MarketMap, MarketingCrisis, the underwriting surface) — **8.75%** |
| Where the environments sit relative to the operator's work | **behind it** — `SignatureBackdrop` under every route in `AppLayout.tsx:265`, `ForgeBackdrop` under sign-in, the reliefs under page content. The dimensional layer is *scenery by construction* |
| Independent clocks running at once | **at least five** — `Footer.tsx:82` (1 s `setInterval`), `KpiTicker.tsx` (6 s cycle + 5 min fetch), `AppLayout.tsx:53` (route-commit timer), one `requestAnimationFrame` loop per mounted environment, `online.ts`. **No shared timebase exists** |
| Route transitions with continuity | **0 of 80** — no `startViewTransition`, no `view-transition-name`, anywhere. Every navigation is a hard cut |
| Colour systems the operator's eye must reconcile | **two, authored separately** — `apps/web/src/styles/tokens.css` for the DOM, `look/theme.ts` `AUTHORED_HEX` for the GL. A physically-lit canvas sits under flat cards that were never lit by the same rig |
| Ambient motion (spinners, pulses, beacons) | **64 occurrences** — `animate-spin` 24 · `animate-pulse` 28 · `animate-pulse-beacon` 10 · `animate-slide-in` 2 |
| Consequential motion — files wiring the built feel layer | **4** (of 62 pages and 22 governed actions). `lib/juice.ts` + `lib/feedback.ts` are built, tested at 0.034 ms/element, and reach almost nothing |
| Objects the platform's ontology can join across | **11 types, none newer than 2025** — `graph/links.ts:19` `InspectorType` has no engagement, target, partner, draft, asset or holding. The two newest compartments are invisible to the one mechanism whose purpose is joining |

**The diagnosis in one sentence:** the platform is 80 pages rendering 80 fetches in two unrelated material
systems under five unrelated clocks with zero continuity between them, and eight beautifully-lit pieces of
scenery were placed behind seven of those pages. A Ferrari engine bolted to eight wheelbarrows. No amount of
fidelity in the engine changes what the vehicle is.

---

## 1 · WHY THREE PLANS MISSED, so this one does not

The record is honest about the first two; the third was never written down.

1. **The first plan** put a third axis on individual pages — "eight better charts." Correct and incremental.
   You called it slop. It was.
2. **THE SOLID** answered with one building, eight rooms, one camera. It got the *one idea* right — none of the
   five references is a set of pages — and then made it a **rendering**. A building changes nothing the
   platform can do. You called it slop. It was.
3. **The blueprint that was then executed** (`3D_VFX_FINAL_PLAN.md`, approved end to end) delivered a six-layer
   graphics architecture and eight signature environments. Nine-tenths was built already; the tenth got built
   and measured with real rigour. But its *unit of work* was **an environment behind a page** — which is
   exactly the first plan's error wearing the second plan's fidelity. The doctrine that data geometry stays
   SVG (correct, and kept below) forced the GL into the only role left: **wallpaper**. Wallpaper with GGX is
   still wallpaper.

Underneath all three is one mistake I made every time: I treated the five references as *looks*. Palantir,
Apple, a CIA watch floor, a Fortune-500 desk, a hedge-fund book, and — the one you added this morning —
**Bloomberg**. Not one of them is a look. Read as capabilities they say five different things (§3.2). Read
as *architecture* they say exactly one thing, and it is the thing this plan is built on.

---

## 2 · FIRST PRINCIPLES — what the six references actually share

Strip each to what it is when you are sitting in front of it:

| | What it is when you are in it |
|---|---|
| **Bloomberg** | one screen, dense, every figure **live and dated**, everything reachable by key, nothing is a "page" — the terminal is one instrument that happens to show many things |
| **Palantir** | you stand on one object and **traverse**; the join across sources is the product |
| **Apple** | one object, **continuous** — nothing cuts, things come toward you; the artefact feels machined |
| **CIA watch floor** | the arriving officer is **told what changed while they slept, ranked by consequence**, before reading a word |
| **Fortune-500 desk** | a **living** pipeline you *work*, that reacts when you act |
| **Hedge fund** | the book is **marked daily**; you walk from the top number to the one position that moved it |

Every one of them is **one instrument rendering one state under one clock through one camera in one
material.** That sentence is the whole plan. "Extremely synchronized" — your words — is not a metaphor in it.
It means a timebase. One.

LCXOS today is eight compartments that share a nav bar. What would make it one instrument is not more
environments. It is five unifications, each of which is small, each of which is measurable, and each of
which today's platform provably lacks (§0). The dimensional layer's job is not to decorate the eight rooms.
It is to be **the thing that makes them one room.**

---

## 3 · THE DOCTRINE THAT SURVIVES — every proposal below passes all of this

### 3.1 The one test, both halves
> **Does the third dimension carry information the flat version loses?** Yes → instrument. No → slop with
> lighting. **And:** geometry that *removes a false implication* a flat layout adds is as earned as geometry
> that adds a value (`MarketingCrisis.tsx` clearance cards encoding a sequence CERC forbids).

### 3.2 The five multipliers and five kill tests (from the second rejection, 2026-08-03 — kept verbatim)
Score every system by **LEVERAGE · FORESIGHT · CERTAINTY · REACH · COMPRESSION**. Kill it unless it
(1) names the blind decision and who makes it today, (2) derives the missing information from data **already
held** — cite the table, (3) cannot be done by a human with a spreadsheet and a week, (4) moves money,
liability or headcount, (5) refuses on absent data. And: *is it a visualisation in a capability costume?* →
dies.

### 3.3 Honesty, unchanged
Absent data refuses; placeholders are visibly placeholders; `prefers-reduced-motion` honoured (checked at
call time, `lib/motion.ts`); print survives black-and-white; every data render is dated, sourced and
reproducible from a versioned input; **nothing moves while an operator reads a table**; brand hex is proven
by measurement off a framebuffer, never asserted from a constants table.

### 3.4 Banned by name (unchanged, plus two)
Spinning globes · glowing network hairballs · particle backgrounds · a 3-D logo · animated counting on a
money figure · anything that makes a placeholder price look expensive. **Added:** any GL surface whose only
content is scenery (§4 S5 retires them); any environment that renders a number Blender drew (§4 S7).

---

## 4 · THE SEVEN SYSTEMS

Organised by **system, never by module** — a plan organised by module has already lost. Each system states:
what it is · why it is 100x · the mechanism, cited · what it costs in bytes · its kill tests · how it is
measured · what it refuses.

### S0 · THE MEASURE — build the ruler before the work
**What.** One harness, `scripts/instrument-audit.mjs`, that captures **every one of the 80 routes in both
themes** (the existing `scripts/3d-audit-app.mjs` Playwright sweep, widened from 7 GL routes to all 80) and
reports six numbers per route: chroma above the data floor (nearest-exposure-locus CIEDE2000, the corrected
ruler from `338db4f`); ambient-vs-consequential motion count; continuity (was the route commit a view
transition or a cut); **seam delta** (ΔE2000 between the GL ground/plate and the DOM `--canvas`/`--card`
where they touch); figures per viewport; and **clock drift** (the maximum disagreement, in frames, between
any two "now" readings visible at once).
**Why 100x.** Four claims about this layer died on measurement; a luminance-sd ratio once reported a
dissolving surface as a 743% improvement. Nothing in S1–S7 is allowed to claim success without moving one of
these six numbers in a published before/after.
**Cost.** Zero shipped bytes — it is a script. **Kill tests.** N/A: it is the instrument the others answer to.
**Refuses.** A route it cannot capture in both themes is reported as unmeasured, never scored.

### S1 · ONE CLOCK — the literal meaning of "synchronized"
**What.** `apps/web/src/lib/clock.ts`: a single platform timebase. One `requestAnimationFrame` loop, paused on
`visibilitychange`, corrected once per `/health` ping to the server's `timestamp` (the ping already exists in
`Footer.tsx:64`), exposing `now()`, `phase(periodMs)`, and a subscription. It writes **one** CSS custom
property per frame on `:root` (`--t`, seconds) and hands the same value to every GL environment's `u_time`.
Under reduced motion it ticks in whole seconds.
**Then every "now" in the app reads it and nothing else:** the footer clock, `KpiTicker`, every "x min ago",
every staleness colour, every `isNew()` in `useLastSeen.ts`, every relief's animation phase, every CSS
transition duration token. **Five clocks become one.** Two surfaces on screen can never disagree about the
second, and any motion that does occur is phase-locked across the whole shell — the property you have been
asking for by name.
**Mechanism.** A store, not a context, so GL code outside React reads it. `Footer.tsx:82` and
`KpiTicker.tsx`'s intervals are deleted, not wrapped.
**Cost.** ~1 KB initial. **Kill tests.** LEVERAGE (one loop replaces five) and CERTAINTY (a "now" is one
fact). **Measured.** S0 clock-drift: today unmeasured, target **0 frames**. **Refuses.** With no server
correction it says "local clock" in the footer rather than pretending to UTC.

### S2 · ONE MATERIAL — the GL and the DOM lit by the same rig
**What.** Stop authoring two palettes. `look/theme.ts` already computes, per theme, `ground`, `plate`,
`structure`, `rule`, `sky` and the light rig with stated ratios (`AUTHORED_HEX`, `sceneTheme()`). A build
step emits `apps/web/src/styles/tokens.generated.css` from it — `--canvas`, `--card`, `--raised`, `--line`
and the *edge model* (a top-left highlight and bottom-right shadow hairline whose intensities come from the
rig's key direction and ambient, not from taste) — for both themes. A test asserts every generated DOM
scenery token sits within **ΔE2000 < 1.0** of the GL value it was derived from.
**Why 100x.** This is the Apple half — *one object*. Today a card standing on a relief is drawn by a
different author than the ground it stands on, and the eye reads the seam as "a canvas pasted under a UI".
Derive the DOM from the rig and the seam disappears by arithmetic, in both themes, forever — including on
the 73 routes that have no GL at all, which then look like the same instrument as the seven that do.
**Mechanism.** `theme.ts` is already the one place where the light rig's ratios live ("dark is arithmetic
identity"). Data tokens (`--navy`, brand hexes, status hues) are **not** touched — data never moves.
**Cost.** Zero net bytes: generated CSS replaces authored CSS of the same size. **Kill tests.** CERTAINTY:
a colour on screen becomes derivable. REACH: one function covers 80 routes. **Measured.** S0 seam delta:
today unmeasured; target < 1.0 everywhere GL meets DOM. **Refuses.** If a generated token would fail
`contrast.test.ts`'s 3:1 control floor, the build fails — the a11y ratchet outranks the rig.

### S3 · ONE CAMERA — continuity without a building
**What.** THE SOLID wanted one camera and built it as a rendering. The browser now ships it as a primitive:
the **View Transitions API**. Every route commit in `router.tsx`, every inspector/drawer open, becomes a
transition; every addressable object — engagement, target, deal, contact, draft, invoice — carries a
`view-transition-name` keyed on its id, so **the row you select becomes the page**, the card you open
becomes the drawer, and nothing cuts. Unsupported browser → today's instant behaviour. Reduced motion →
instant. ~250 ms, one easing token, phase-locked to S1.
**Why 100x.** Zero of 80 transitions have continuity today. This is the entire "nothing navigates" quality
of an Apple object, at **~0 KB**, on the DOM the platform already has — and it is what THE SOLID was
reaching for with a raymarcher. The camera is the browser's.
**Mechanism.** Wrap `navigate` at one seam (`AppLayout`'s route commit, where the existing route-commit
clock lives) in `document.startViewTransition` when present. Name the shared elements in the existing
table/row components — the ids are already on every row for `useListNavigation`.
**Verified first, not assumed.** The desktop shell is WKWebView on macOS 27 (`otool -L` proved the probe
binary links the shipping WebKit). Extend `apps/desktop/scripts/webview-capability-probe.mjs` to **measure**
`startViewTransition` behaviour — presence is not behaviour, the lesson `OES_texture_float_linear` taught.
**Cost.** < 1 KB. **Kill tests.** COMPRESSION: the operator never re-finds their place. **Measured.** S0
continuity: 0% → 100% of route commits, with zero layout-shift regression. **Refuses.** Falls back to a cut,
and the audit records which browser cut.

### S4 · THE WATCH — the only motion in the app is the truth arriving
**What.** The CIA half, and the fix `ALIVE_PLAN.md` diagnosed and never got. On arrival — session start, or
return after the operator's own absence (`useLastSeen.ts` already keeps the watermark) — the API answers one
question: **what changed since you last looked, in every room you hold a key to, ranked by consequence.**
Then, phase-locked to S1, the shell performs **one synchronized sweep**: the sidebar rooms with changes light
in rank order, the ticker turns over to the top item, the environment behind the current page — if it has
one — lights the marks that moved. **Everything unchanged stays perfectly still.** That is the whole motion
budget of the application. Spinners and pulses that say "please wait" are replaced by the clock-locked
stillness of an instrument that is *ready*.
**Why 100x.** The blind decision is "what do I look at first" — today the operator answers it by opening 80
routes. The information is **already held**: `audit_log(actor, action, entity, entity_id, meta, created_at)`,
every table's `updated_at`, `gps_outcome`, `decisions`, the demand queue, invoices' aging, perimeter
`review_by`. A human with a spreadsheet cannot join eight compartments' change-trails in a minute. It moves
money and liability (an unpaid invoice, an at-risk deal, a perimeter review expiring, a refusal that fired
overnight). It refuses on absent data — no rows since the watermark reads *"nothing recorded since 09:41 —
this is a statement about the record, not about the world"* — never a fake calm.
**Mechanism.** `GET /v1/watch?since=` behind the existing entitlement gate (`middleware/workspace.ts`),
reading only compartments the operator holds; ranking is a stated prior in code (money > liability >
deadline > activity) that S0 publishes and the loop can later learn. The feel layer (`lib/juice.ts`,
`lib/feedback.ts` — built, measured, wired to four files) is finally wired **here and to every governed
action**: `commit`/`refuse` on writes, arrival choreography on the watch. The 64 ambient animations are
retired to the clock (a "loading" state becomes a still, dated placeholder, not a pulse).
**Cost.** One lazy chunk on the home/arrival path; the API route. **Kill tests.** all five pass, FORESIGHT
and COMPRESSION strongest. **Measured.** S0 motion ratio: ambient 64 / consequential 4 → **ambient ~0 /
consequential = every governed action**. **Refuses.** Render asleep → the shell says the watch is
unavailable and shows the last watermark; it never animates a guess.

### S5 · THE FLOOR IS DATA — every environment becomes an instrument or goes
**What.** Apply §3.1 to all eight environments, publicly, and act on the verdicts:
- **Keep and bind:** E5 the underwriting surface (margin over price × effort **is** a volatility surface — the
  one case I got wrong once and will not again), E4 the orrery (real once S5's ontology extension lands),
  E3 the pipeline relief (stage × value × age), E6 the vault (audit marks), E2 the globe (**static** sites;
  the ban on spinning stands), E7 the storm (data-gated and refusing correctly today — stays gated).
- **Convert:** E8 `SignatureBackdrop`, the one always-on GL surface under every route, becomes **the canvas
  of THE WATCH** — eight rooms as fixed positions, lights on where S4 found change, dark where it found
  none, fog where the operator holds no key. It stops being signature and starts being state. If it cannot
  earn that, it is removed; a backdrop that says nothing on 73 routes is the definition of slop with
  lighting.
- **Retire** anything that fails the test after binding. Apple is subtraction.
- **The Palantir join:** extend `InspectorType` (`graph/links.ts:19`) with `engagement`, `target`,
  `partner`, `draft`, `asset`, `holding`, with `RelatedGroup` builders that respect entitlements. The
  orrery and the graph page then traverse the **whole** platform — the search-around whose purpose is
  joining finally reaches the two compartments that carry the money and the liability.
**Cost.** GL stays lazy (15 chunks, 0 eager bytes, unchanged). The ontology extension is API code.
**Kill tests.** Each environment individually — the verdict is published in its `docs/3d/e*/README.md`
first line, which the harness already demands. **Measured.** S0 chroma-above-floor on every kept surface
in both themes; S4's change marks visible in the environment's capture. **Refuses.** An environment with
no data renders its flat fallback and says so — rule 1, already enforced.

### S6 · THE TERMINAL — Bloomberg density and liveness, one figure system
**What.** One component, `<Fig>`: IBM Plex Mono `tabular-nums`, the value, its **delta since the last mark**
(▲▼ and *when*, from S1), its staleness colour by age, its semantic state from the existing status tokens,
and a **key address** — every figure reachable through the ⌘K grammar and the `g`-chords LCX TERMINAL
already ships (`components/command/gpsGrammar.ts` is the model). The eight desk pages are re-laid on a
terminal grid: no cards inside cards, the density floor `text-micro` (11 px) that `DESIGN_FATIGUE_FIX_PLAN`
set becomes the *only* small size, and `PageTitle`/`SectionLabel` are the only headings.
**Why 100x.** REACH and COMPRESSION: a screen holds three times the figures, every figure is live and
dated, and every figure is one keystroke away. This is the Bloomberg essence — not the colour orange.
**Cost.** `<Fig>` ~2 KB; the re-layouts are CSS. **Kill tests.** CERTAINTY (a figure carries its own date and
delta) and COMPRESSION. **Measured.** S0 figures-per-viewport ×3 on the eight desks with **zero** contrast
regressions (`contrast.test.ts` ratchet is the judge). **Refuses.** A figure with no source instant renders
undated — the −10 confidence rule made visible, not hidden.

### S7 · THE OBJECT — the machined artefact (the Blender track, synthesised as promised)
**What.** The things that reach a hand: the Mac app icon (exists, generated from the mark's extracted
geometry), the **DMG background** (missing — `tauri.conf.json` has no `background`, the installer opens
white), the launch and empty states, the `/lcxos` hero, the print sheets' plate. Rendered in **Blender 5.2**
headless on your M1 (smoke-tested: EEVEE first, Cycles+OIDN on Metal when a material needs it, 2× render
and downsample, `view_transform = "Standard"` because it is the only transform that round-trips `#2C6BFF`
exactly — AgX renders it `#467ECF`). Shipped as WebP/AVIF, committed beside the `.blend` and `render.py`.
**Never in CI. Never a number.** Blender renders no geometry whose shape encodes data — data stays SVG from
the pure engines so an auditor can re-derive it. **Cost.** `public/` passthrough is at 722/1024 KB — ~300 KB
of headroom, budgeted per asset; icon and DMG live in the desktop bundle at zero web cost. **Kill tests.**
Exempt from the five as a *brand* artefact, bound by §3.3 and by the byte budget. **Measured.** Brand hex
decoded from PNG bytes, not read back through Blender's colour management.

---

## 5 · BUILD ORDER, and the minimum slice worth approving

```
 S0 MEASURE ─▶ S1 CLOCK ─▶ S2 MATERIAL ─▶ S3 CAMERA ─▶ S4 WATCH ─▶ S5 FLOORS ─▶ S6 TERMINAL ─▶ S7 OBJECT
 (ruler)       (one time)   (one object)   (continuity)  (capability)  (instruments)  (density)      (artefact)
```

**Minimum approvable slice: S0 + S1 + S2 + S3.** Four systems, near-zero bytes, no new features — and on the
day they land the platform stops being 80 pages: one clock, one material, no cuts. That is the change in
daily feeling you have been asking for, and it is measured before it is claimed. **S4** is the first
capability and the one the CIA reference demands; it is where the feel layer finally gets wired. S5–S7
complete the instrument.

Each system ships as its own commit series through the standing gate (`npm run ci-check`, `grep -c 'npm
error'`), is verified live **by content** on both surfaces, and publishes its S0 before/after in the commit
body. A system whose numbers do not move does not merge.

---

## 6 · BUDGETS AND CONSTRAINTS — stated, so nothing is discovered late

| Constraint | Value | Consequence |
|---|---|---|
| Initial JS | **813 / 850 KB** | 37 KB total headroom for S1 + S3 + S6's `<Fig>` — combined estimate < 5 KB; everything GL stays lazy |
| Largest chunk | 411 / 440 KB | S4's arrival chunk and any environment growth are lazy routes |
| Passthrough (`public/`) | 722 / 1024 KB | S7's web assets budgeted per file; icon/DMG are desktop-only |
| Fonts | 434 / 440 KB | **`<Fig>` uses the Plex Mono already loaded — no third preloaded font, ever** (a 527 KB one already fails the budget by design) |
| Hardware | Apple M1, 8 GB unified | S7 renders lean and downsampled; the app's GL quality tiers (`useQualityTier.ts`) already exist |
| API | Render free tier, sleeps | S4 degrades to "watch unavailable" honestly; the public page keeps making zero API calls |
| Static hosting | Cloudflare Pages | S2's generated CSS is a build step, not a runtime |
| Accessibility | contrast ratchet, reduced motion, print | every system passes `contrast.test.ts`; S1 ticks in seconds under reduced motion; S3 falls to cuts; S7 assets carry alt text and print in B&W |

---

## 7 · WHAT IS DELIBERATELY NOT BUILT

- **No building.** Continuity comes from the browser's camera, not a raymarched shell.
- **No new environments.** Eight exist; the work is binding, converting and retiring — not a ninth.
- **No GL on the 73 routes without it.** They become part of the instrument through S1/S2/S3, at zero GL bytes.
- **No WebGPU, no three.js, no glTF loader.** The package is WebGL2, measured at 227 fps on the target; a loader
  was costed at 3.7 KB and refused for better reasons than bytes (`3D_VFX_100X_LIVE.md` §4).
- **No Blender for data, no Blender in CI.** Authoring tool; committed output; regenerated by hand.
- **No ranking the loop has not seen.** S4's consequence ranking is a stated prior until `gps_outcome`-style
  feedback exists to learn it from — and it says so on the screen.
- **No motion while a table is read.** The watch moves once, on arrival; then the instrument is still.

---

## 8 · VERIFICATION — how each system proves it is live and better

1. **S0 before/after, per route, both themes**, in every merging commit body.
2. **Gate:** full `ci-check`, masked-error grep, ratchets (contrast, state-grammar, harness rules, byte-door,
   gpsGrammar pins) — plus two new ratchets: **one-clock** (no `setInterval`/`rAF` outside `lib/clock.ts` and
   the GL stage) and **one-material** (no scenery hex authored outside `theme.ts`).
3. **Deploy:** Pages verified by walking the chunk graph for a runtime string only the new build carries;
   Render by the GitHub deployments API for the exact SHA (the method proven this week).
4. **The independent read:** every measured claim is re-run by the skeptic sweep
   (`APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs`, widened by S0) before it is written into this
   file's record.

---

## 9 · DECISIONS ONLY YOU CAN MAKE

1. **Approve the slice** — S0–S3 first, or the whole S0–S7 end to end. (Recommendation: approve end to end
   with the minimum slice as the first checkpoint, same as the GPS G-phases.)
2. **The watch's consequence order** — money > liability > deadline > activity is my stated prior. Yours
   overrides it, and it is one constant.
3. **Feel defaults** — motion on, sound off is the current state (`feedback.ts`). S4 wires motion everywhere;
   sound stays off unless you say otherwise.
4. **The DMG and icon** — the icon is your earlier choice (white mark on `#262626`); the DMG background is new
   and needs one look from you before it ships.

---

## 10 · RISKS, each with its mitigation

| Risk | Mitigation |
|---|---|
| View Transitions behave differently in WKWebView than in Chromium | S3 is **measured on the desktop probe before** it is wired; fallback is today's behaviour |
| S2's derived tokens fail the 3:1 control floor in one theme | The a11y ratchet outranks the rig; the build fails and the ratio is retuned in `theme.ts`, not by hand in CSS |
| S4 becomes a notification firehose | Ranking with a hard cap (the top N by consequence), entitlement-filtered, and the rest behind one line: "and 14 more, unranked" |
| One clock makes one bug universal | `clock.ts` is the smallest module in the plan and gets the densest tests: drift, pause on hide, reduced-motion quantisation, server correction |
| The terminal density regresses readability | `text-micro` is a floor, not a target; figures-per-viewport is measured against the contrast ratchet, never alone |
| I claim a number I did not measure | S0 exists first; §8's independent sweep re-runs every figure; this document's own tables are dated |

---

*Written after reading `3D_VFX_FINAL_PLAN.md`, `3D_VFX_100X_LIVE.md`, `DIMENSIONAL_100X_PLAN.md`,
`ALIVE_PLAN.md`, `DESIGN_FATIGUE_FIX_PLAN.md`, the GL package, the eight environments, the router, the
clocks, the feel layer, the ontology, and commit `338db4f`. Nothing above was proposed without first
checking whether it already existed.*
