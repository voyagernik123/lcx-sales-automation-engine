# THE FINAL SCORECARD — the eight 3-D surfaces, in both themes

**Status: 3 of 8 surfaces are correct in both themes. 4 are measurably worse in light. 1 never draws at all.**

This is the last word of the 3-D programme, and it is written for someone who was not here. Nothing below
assumes you know what "E3" or "T4" means. Every figure comes from one instrument, run five times on
2026-08-16 against the tree at commit `2e548af`, and the first section tells you how to re-run it and get the
same numbers back.

---

## 0 · What you are looking at, if you have never seen this before

The LCX OS web app ships **eight three-dimensional surfaces**. Each one is an *alternative reading* of a page
that already works without it: the flat table, chart or diagram is what loads, and the 3-D version is one
click away behind a toggle that defaults **off**. Seven of the eight are opt-in like that; the eighth (E8) is
the sign-in screen's backdrop and simply runs.

They are numbered E1–E8 for historical reasons — the numbers are labels, not an order or a ranking. Each has
a short name, a route, and a question a reader opens it to answer. Section 2 names all three for every one.

The app has **two themes**, dark and light. The light theme shipped without a single capture of any surface
in it — "the light theme works" was a sentence rather than a measurement. Closing that gap is what this
scorecard is the end of.

**"Data" and "scenery"** are the two populations every judgement below rests on. Scenery is the room: the
ground, the plate, the rules, the structure. Data is the marks that carry a reading: the brand blues, the
reference colour. The split is not a list somebody typed — it is derived from the palette source
(`packages/gl/src/look/theme.ts`) on every run, by the rule that a colour is scenery if a scene-theme field
has the same name and data otherwise. Every scenery colour in both themes is a desaturated blue-grey, so the
instrument separates the two populations by **chroma** (colourfulness), with a floor **derived** at 60 from
the most saturated scenery colour in either theme (52). It is not a threshold anyone chose.

**"Data-to-scenery contrast"** below is the WCAG contrast ratio between the mean luminance of the data pixels
and the mean luminance of the scenery pixels, in that surface's own drawing buffer. 1.00:1 means the marks
and the room are the same brightness.

---

## 1 · The instrument, and why its numbers can be trusted this time

Every per-surface figure this programme published before now depended on **what time of day the sweep ran**.
Three of the eight surfaces reach code that reads the reader's wall clock and draws the answer. The same
unchanged commit could be reported as catastrophically worse, mildly worse, or dramatically better purely by
the hour. Numbers like that are not measurements.

The clock is now frozen at a **derived** instant (`2026-09-21T07:18:41.000Z`), along with the random seed,
the timezone, the locale, the device pixel ratio and the OS-level display preferences. I ran the sweep five
times to establish that this actually holds.

### What I ran

```bash
# the two runs the scorecard is written from — identical inputs, different wall-clock times
APP_SWEEP_OUT_DIR=/tmp/run-a APP_AUDIT_PORT=5811 APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs
APP_SWEEP_OUT_DIR=/tmp/run-b APP_AUDIT_PORT=5822 APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs

# control: a different host date and a different host timezone must not reach the numbers
AUDIT_DATE=2026-01-01 TZ=Asia/Tokyo APP_SWEEP_OUT_DIR=/tmp/run-c APP_AUDIT_PORT=5833 \
  APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs

# negative controls: move the frozen instant, and the numbers MUST move
APP_SWEEP_CLOCK=2026-09-21T19:18:41.000Z APP_SWEEP_OUT_DIR=/tmp/run-night APP_AUDIT_PORT=5844 \
  APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs
APP_SWEEP_CLOCK=2026-09-21T13:00:00.000Z  APP_SWEEP_OUT_DIR=/tmp/run-noon  APP_AUDIT_PORT=5855 \
  APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs
```

The sweep exits **1** whenever it has findings, so a non-zero exit here is the instrument working, not
crashing (observed: exit 1 on a run that wrote a complete report with 3 findings).

### The positive control — identical inputs give an identical report

Run A finished 00:53:38, run B finished 00:55:54 local. `diff` on the generated reports returns **nothing**:

```
MD5 (run-a/app-sweep/README.md) = 5df12f821cf042300950b0965ad576f1
MD5 (run-b/app-sweep/README.md) = 5df12f821cf042300950b0965ad576f1
```

Run C, at a different simulated host date and under `TZ=Asia/Tokyo`, differs from run A by **exactly one
line** — the `Swept 2026-08-15` date stamp, which is the host's UTC date and is overridable with
`AUDIT_DATE`. Two changed lines in the whole file, both halves of that one substitution. Nothing about the
host clock or timezone reaches a single measurement.

**Every number in this scorecard therefore means something, and the same numbers in earlier documents did
not.**

### The negative control — an instrument that cannot move is not reading

A sweep whose numbers never change is indistinguishable from a broken one. So I moved the frozen instant and
confirmed the readings follow it. At **13:00:00Z** the sun sits near the camera's own meridian, the day/night
terminator falls off the visible face of the globe, and the globe becomes an evenly lit ball:

| E2 GlobeRelief at | data pixels | dark contrast | light contrast | verdict the sweep prints |
|---|---|---|---|---|
| `07:18:41Z` — the derived instant | 4.75% | 5.91:1 | 1.67:1 | **degraded** |
| `13:00:00Z` — terminator off the face | 38.82% | 1.62:1 | 4.46:1 | holds up |

The verdict flips. The sweep also refuses to let that pass silently: its own geometric guard fires and stamps
the report **"DRIFTED: the instant no longer means what it says"**, having measured the sub-solar point
85.327° away from where the rule requires it. At the chosen instant the same guard measures the error at
**0.002° of longitude — 0.5 seconds of daylight** — and prints "holds".

**13:00Z is the instant that must never be chosen**, and it is the one that produces the flattering answer:
the surface passes because nothing was asked of it. The instant this scorecard uses was fixed by a geometric
rule written before any of these numbers existed, and it is not the kindest of them.

### The pixel readback was validated separately

A blank capture and "the light theme renders nothing" look identical, so the instrument proves itself on
known input before judging anything — 8 checks, all PASS on every run, half of them *negative*: a
deliberately uniform pattern must report one colour, zero luminance spread, and no data pixels. An instrument
that returns zero because its readback is broken would raise the alarm on every surface.

I validated my own comparison tooling the same way. The pixel-differ used in §4 reports **0** differing
pixels for a file against itself, **99.99%** for a dark capture against its own light counterpart, and **0**
for a pair `diff` independently called byte-identical.

---

## 2 · One row per surface — all eight

Derived from the sweep, not from any list. Contrast is data-to-scenery in that surface's own drawing buffer.
"Marks clear floor" asks whether any pixel of the surface exceeds the derived data-chroma floor of 60.

| | surface | route | what a reader opens it to learn | renders in both themes | marks clear the chroma floor | contrast dark | contrast light | light vs dark |
|---|---|---|---|---|---|---|---|---|
| **E8** | ForgeBackdrop | `/select` | nothing — it is the sign-in screen's backdrop: the LCX mark as a machined metal object under one key light. It carries no dataset and answers no question | **yes** | yes / yes | 1.83:1 | 2.57:1 | **BETTER** (140%) |
| **E4** | OntologyOrrery | `/ontology` | how the ontology's entities relate, drawn as orbital rings. A flat node-link diagram spends both axes on layout, so its edges cross and a reader cannot resolve them; depth separates them | **yes** | yes / yes | 2.23:1 | 3.80:1 | **BETTER** (170%) |
| **E3** | PipelineRelief | `/bd-pipeline` | the BD lead queue as a channel — market cap, stage and movement read *jointly*, where the flat table can only sort one of the three at a time | **yes** | yes / yes | 4.65:1 | 1.66:1 | **WORSE** (36%) |
| **E2** | GlobeRelief | `/market-map` | where projects sit geographically, as a globe. It places **regions, not organisations**, and says so before you click | **yes** | yes / yes | 5.91:1 | 1.67:1 | **WORSE** (28%) |
| **E6** | VaultRelief | `/audit-log` | the audit log as a corridor — the sequence of recorded actions with time carried as depth | **yes** | yes / yes | 3.16:1 | **1.02:1** | **WORSE** (32%) |
| **E1** | DeckRelief | `/command-deck` | the command deck as a room: four panels at graded depths, where the nearest is the one being addressed. A flat grid gives every panel equal weight | **yes** | **no / no** | — | — | **WORSE** (flattened to 42%) |
| **E5** | SurfaceRelief | `/command-deck` | the liquidity-partner scorecard as a height field — which partner leads, and on which weighted dimension | **yes** | yes / yes | 2.29:1 | 2.85:1 | **BETTER** (125%) |
| **E7** | StormRelief | `/marketing/crisis` | forward risk over a calendar, as a storm field | **no / no** | not measured | — | — | **not comparable** |

### The full statistics behind those rows

| surface | theme | mean luma | sd luma | p01→p99 | colours | p99.9 chroma | max chroma | data px % | data luma | scenery luma | contrast |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **E8** ForgeBackdrop | dark | 71.4 | 16.07 | 48→106 | 460 | 174 | 188 | 0.98 | 104.4 | 71.0 | 1.83:1 |
| **E8** ForgeBackdrop | light | 207.3 | 29.89 | 59→218 | 647 | 161 | 186 | 0.97 | 124.0 | 208.1 | 2.57:1 |
| **E4** OntologyOrrery | dark | 30.3 | 16.51 | 6→87 | 350 | 157 | 161 | 2.44 | 78.4 | 29.0 | 2.23:1 |
| **E4** OntologyOrrery | light | 226.3 | 37.26 | 95→246 | 434 | 176 | 179 | 3.03 | 110.0 | 230.0 | 3.80:1 |
| **E3** PipelineRelief | dark | 22.0 | 13.96 | 9→90 | 69 | 154 | 155 | 1.22 | 124.9 | 20.7 | 4.65:1 |
| **E3** PipelineRelief | light | 224.6 | 19.18 | 166→246 | 70 | **82** | **84** | 0.69 | 175.0 | 225.0 | **1.66:1** |
| **E2** GlobeRelief | dark | 27.4 | 37.57 | 1→198 | 346 | 211 | 222 | 4.75 | 145.1 | 21.5 | 5.91:1 |
| **E2** GlobeRelief | light | 115.9 | 113.41 | 1→255 | 266 | **132** | 172 | 4.32 | 150.6 | 114.3 | **1.67:1** |
| **E6** VaultRelief | dark | 13.3 | 8.99 | 8→83 | 34 | 196 | 196 | 1.39 | 84.4 | 12.3 | 3.16:1 |
| **E6** VaultRelief | light | 177.4 | 21.59 | 148→226 | 61 | **113** | **114** | 1.27 | 174.2 | 177.4 | **1.02:1** |
| **E1** DeckRelief | dark | 51.5 | 27.22 | 15→86 | 24 | **31** | **31** | **0.00** | — | 51.5 | — |
| **E1** DeckRelief | light | 228.3 | **11.50** | 189→236 | 34 | **31** | **32** | **0.00** | — | 228.3 | — |
| **E5** SurfaceRelief | dark | 37.6 | 17.46 | 28→87 | 62 | 162 | 162 | 3.06 | 82.4 | 36.2 | 2.29:1 |
| **E5** SurfaceRelief | light | 235.8 | 21.44 | 134→246 | 42 | 178 | 178 | 3.08 | 134.5 | 239.0 | 2.85:1 |
| **E7** StormRelief | dark | — | — | — | — | — | — | — | — | — | TOGGLE_DISABLED |
| **E7** StormRelief | light | — | — | — | — | — | — | — | — | — | TOGGLE_DISABLED |

Read every column against **the same surface's own dark row**, never against a global threshold. These
surfaces draw wildly different amounts of geometry, and one threshold would pass a busy scene that had lost
half its contrast while failing a sparse one working exactly as designed.

---

## 3 · The honest total

**Correct in both themes: 3 of 8** — E8 ForgeBackdrop, E4 OntologyOrrery, E5 SurfaceRelief.

That is a count, not a percentage anyone invented. The other five:

- **E3, E6, E1 — worse in light (3).** Each fails on a measurement stated in §4.
- **E2 — degraded (1).** Its contrast fell to 28% of its dark value. Both ends still read as two separable
  populations, so the sweep records it rather than raising it — but a 72% loss of separation printed as
  "holds up" is how a capture programme turns into a marketing exercise, and it is not printed that way here.
- **E7 — never draws (1).**

### E7 is correct only because it refuses, and its file argues the refusal in arithmetic

**E7 StormRelief refuses in two independent ways, and neither is a pass.**

First, it is **unreachable**. `/marketing/crisis` builds its field with `riskFieldUnavailable(...)` — a named
absence, because no forward risk feed is produced anywhere in the system. The toggle is permanently
`aria-disabled`, and both themes report `TOGGLE_DISABLED` with the page's own words: *"NO CALENDAR —
NO_FORWARD_RISK_FEED No forward risk feed reaches this desk."* The sweep confirms this rather than assuming
it, and reports it identically in dark and in light.

Second, and separately, **it is deliberately dark-only**. It is one of two surfaces that do not import
`look/theme.ts` at all, and the only one that refuses by *decision* rather than by age. Its own renderer
(`apps/web/src/components/risk/StormReliefGl.tsx`, header lines 55–75) makes the case in arithmetic rather
than in taste:

- Linear luminance: brand `#2C6BFF` = 0.18271, reference `#FF8A3D` = 0.39774 — the orange is **2.177× the
  blue**.
- Shipped exposures: low × 0.55 → 0.10049, high × 1.45 → 0.57672 — a **5.74× span** on a dark ground.
- Put the same volume over the light theme's floor, measured against that floor at α = 0.2 / 0.5 / 0.8:

| | low end (calm) | high end (severe) |
|---|---|---|
| dark tile `#22315A` | 1.14 / 1.37 / 1.58 | 2.21 / 3.74 / 5.06 |
| light ground | 1.14 / 1.52 / 2.50 | 1.05 / 1.14 / **1.28** |

The **severe** half of the ramp is the half that disappears — 5.06:1 becomes 1.28:1 — while the calm half
stays visible. That is not a dimmer picture; it is *the reading inverted*, with the worst days rendering
faintest.

And it cannot be re-exposed away. For the high end to render darker than the low end over a light ground it
must satisfy `s_hi < (L_blue / L_orange)·s_lo = 0.4594·s_lo`. At the shipped `s_lo = 0.55` that caps `s_hi`
at 0.2527, where the two ends are equal by construction; at `s_hi = 0.25` the whole ramp spans 1.0% of its
low end's luminance against 5.74× on dark. A ramp with no luminance range carries its severity in hue alone,
and this surface's redundancy exists precisely so the reading survives a glance or greyscale.

So the field stays a depicted **night** field on either page. That is an honest decision with a proof behind
it. It is still not a surface that works in light — it is a surface that declines to try, on a route that
currently cannot draw it at all.

### E8 also does not use the shared theme, and that is worth knowing

E8 ForgeBackdrop is the other surface that does not import `look/theme.ts`. It predates the module and
branches on the `dark` CSS class with its own hand-tuned pair — which is where the shared light numbers came
from in the first place. It passes on its own merits (contrast 1.83:1 → 2.57:1), but it passes through
different code from the six surfaces the shared palette governs, so a future palette change will not move it.

---

## 4 · What remains, per surface, with the measurement that says so

### The two findings that are NOT about themes, and matter more

**E1 DeckRelief draws no data marks in either theme.** Not one pixel of its drawing buffer clears the derived
chroma floor of 60 — max chroma **31 in dark, 32 in light**, against a floor of 60. The data-to-scenery
contrast column is empty for both rows because there is no data population to compute it over. This is not a
light-theme finding and it is not a pass; it means the chroma classifier is comparing two scenes whose most
saturated content is already scenery-grade.

There is a real and partly exculpatory explanation, and it is also an instrument limit: E1's panel text is
**projected DOM, not baked pixels** — the numbers a reader actually reads sit in HTML layered over the
canvas, and the statistics are taken from the GL drawing buffer alone, which cannot see them. So "no data
marks" is true of the geometry and not necessarily of the page. What the geometry contributes is depth
ordering, which carries emphasis rather than a value. **What remains is a decision, not a fix:** either E1's
reading is agreed to live in DOM — in which case no chroma-based instrument will ever score it, and that
should be written down — or the geometry should carry a mark that clears the floor.

**E7 StormRelief is unreachable on both themes**, for the reason given in §3. What remains is upstream of
3-D entirely: no forward risk feed exists. The day one lands, this surface's light half gets tested against a
white page for the first time, and §3's arithmetic predicts it will fail.

### Still worse in light after this programme

| surface | the measurement | what it means |
|---|---|---|
| **E6 VaultRelief** `/audit-log` | contrast **3.16:1 → 1.02:1** (32%); p99.9 chroma 196 → 113 (58%); max chroma 196 → 114 (58%); data pixels 1.39% → 1.27% | **The worst single number in the sweep.** 1.02:1 means the marks and the room are the same brightness. The 18 record marks are still *there* — the data pixel share barely moved — but they no longer stand out from what they sit on |
| **E3 PipelineRelief** `/bd-pipeline` | contrast **4.65:1 → 1.66:1** (36%); p99.9 chroma 154 → 82 (53%); max chroma 155 → 84 (54%); data pixels 1.22% → 0.69% | The marks lost their colour, and 44% of them stopped clearing the floor at all. Luminance spread actually *rose* (137%), which is why a luminance-only check would have called this a pass |
| **E1 DeckRelief** `/command-deck` | sd luma **27.22 → 11.50** (42%); p01→p99 range 71 → 47 (66%) | The scene is measurably *flatter* on a white page than on a black one — the exact direction the light rig was retuned to prevent. **This is new since the last committed sweep** (see §5) |
| **E2 GlobeRelief** `/market-map` | contrast **5.91:1 → 1.67:1** (28%); p99.9 chroma 211 → 132 (63%); max chroma 222 → 172 (77%) | Recorded as *degraded* rather than raised, because both ends stay above 1.5:1. Read it with the caveat below |

**The E2 caveat, which is load-bearing.** The data/scenery classifier splits on chroma, and sunlit ocean is
saturated blue. On this surface most of what lands in the DATA population is *lit earth*, not markers — which
is why its contrast column swings by a factor of four across one simulated day (measured: 1.62:1 dark at
13:00Z against 5.91:1 dark at 07:18Z) and why its verdict follows the sun. Freezing the clock makes that
column **repeatable**. It does not make it a measurement of the marks. **No verdict on E2 should be read as
one** until the classifier can tell a pin from an ocean.

### The three that hold, and what is still unproven about them

- **E8 ForgeBackdrop** — contrast 1.83:1 → 2.57:1. Nothing outstanding on this instrument. It is the only
  surface that animates (a five-second key-light arc, once, then it stops), and the only one an
  unauthenticated stranger sees.
- **E4 OntologyOrrery** — contrast 2.23:1 → 3.80:1, the largest improvement in light of the eight. **One
  thing is unclosed:** its viewpoint is chosen by a search bounded on a *wall-clock deadline*
  (`apps/web/src/components/geometry/orrery/orreryLayout.ts:928` and `:1306`). A deadline is not a stopwatch —
  it does more work on a faster machine, so the frame it produces is a function of how busy the laptop was.
  Freezing that clock would stop `requestAnimationFrame` and React's scheduler, so it must not be done; the
  fix belongs in the app, as a budget counted in **candidates** rather than milliseconds. Across my five runs
  E4's row did not vary at all, but that is one machine under one load and is not a guarantee.
- **E5 SurfaceRelief** — contrast 2.29:1 → 2.85:1. Nothing outstanding on this instrument.

### Two open items that are about the app, not about any one surface

- **The captures for `/command-deck` are not reproducible even though its numbers are.** E1's dark canvas
  capture lands in exactly **one of two discrete states** across my five runs — not a drift, two modes.
  Measured: runs A and "noon" are pixel-identical to each other; runs B, C and "night" are identical to each
  other to within 0.19% of pixels at a maximum channel delta of 2; *between* the two groups, **7.17% of
  pixels differ at a maximum channel delta of 230**. E1's *light* canvas is identical across all five. The
  differing pixels, rendered as a mask, are the projected DOM text and the panel and floor **edges** — never
  the panel fills. Since every GL statistic for E1 was identical in all five runs, the instability is in the
  composited DOM layer rather than in the drawing buffer. A reader diffing captures will hit this; it does
  not touch a single number in this scorecard.
- **A defect the theme sweep found on its way in has since been fixed, and the fix is in the tree this
  scorecard measured.** `apps/web/index.html` used to read `localStorage['lcx-os:ui:v1']` before hydration —
  a key **nothing has ever written**, because the store persists under `lcx-os:<operator-email>:ui:v1`. Every
  dark-mode operator got a white flash on every load, and `/select`, which lives outside the app shell, could
  never be dark from stored preference at all. `index.html` now resolves the scope exactly the way
  `lib/persistence.ts` resolves it and keeps the unscoped key as a fallback. On all five runs the sweep asked
  for each theme on `/select` and on `/ontology`, and measured the theme the app **actually applied**,
  including after a reload — 4 of 4 correct, every run.

---

## 5 · The instrument's own limits — read this before quoting anything above

### What the sweep does not measure

- **Whether a surface that holds up numerically actually reads well.** A contrast ratio is not a design
  review. A scene can keep its luminance spread and its chroma and place them somewhere useless, and no
  number here would notice. Every verdict should be read next to the capture it came from.
- **Real-hardware colour.** Every frame is rasterised on the CPU by SwiftShader (this run: Chromium
  **149.0.7827.55**). Channel ordering survives, exact hexes do not — `docs/3d/brand-fidelity.json` already
  measures `#2c6bff` landing at `#2c68dc`.
- **Performance.** There is no timing column anywhere, on purpose: the ratio between a CPU rasteriser and
  real hardware is not a constant, so a frame time from here describes a machine nobody ships on.
- **Anything drawn in the DOM.** The statistics come from the GL drawing buffer alone. E1's reading is
  projected DOM, so §4's "no data marks" is a statement about its geometry, not about what an operator sees.
- **Marks in the `refusal` colour** (`#6B7A99`, chroma 46), which sit *below* the derived floor by design —
  the palette wants a refusal to read as "no measurement", never as a low value. A surface drawing only
  refusals would score as having no data marks.
- **Whether the data is right.** Where a route needs seeded data the network is replaced with the smallest
  fixture that makes the surface drawable, and no number here is read off one.

### What the frozen clock fixes, and what it cannot

**Fixed** — and this is what makes the scorecard possible: the wall clock, fixture ages, `Math.random`,
`crypto.getRandomValues`, `crypto.randomUUID`, timezone, locale, all four OS display preferences, device
pixel ratio, and the animation phase (captures are taken only after the per-context draw counters stop).
Proven by the byte-identical reports of §1, not asserted.

**Not fixed, and named rather than left to be discovered:**

1. **`performance.now()` is deliberately left running.** Freezing it would stop `requestAnimationFrame` and
   React's scheduler. It is the reason E4's deadline stays open, and the reason the app's own chrome keeps
   moving between runs.
2. **Frame counts** in the sibling report `docs/3d/APP_SWEEP.md` are machine speed, not surface properties.
   Their *verdicts* are stable; the counts are evidence the counter is alive, never a figure to compare
   across runs.
3. **Viewport captures can never be byte-stable, and the cause is app-wide chrome rather than any surface.**
   All 14 viewport captures differ between two otherwise identical runs. I identified why by cropping the
   regions that moved: `apps/web/src/components/layout/SidebarFieldNotes.tsx` renders a rotating tip card
   that advances between runs (measured: *"Every closed deal makes tomorrow's queue smarter."* in run A
   against *"50,000+ tokens in the universe — the core refreshed nightly, free."* in run B), and
   `apps/web/src/components/layout/Footer.tsx` prints a live frame-time readout (`UI 33/52MS` against
   `UI 45/80MS`). Both live in the shell, which is why every seated route is affected. E2 additionally
   prints its own measured milliseconds into its caption.
   By contrast **11 of the 14 canvas captures are byte-identical across runs**; the three that are not are
   E1 dark (§4) and E8 in both themes, where a single small patch differs — 18×18 pixels at a maximum
   channel delta of 5 in dark, 19×19 at a maximum delta of 6 in light, 0.013% of the image either way.
   Sub-perceptual, and the sign-in screen is outside the shell.
4. **The report carries the host's UTC date** in its `Swept` line, so two runs on different days differ in
   exactly that one line. `AUDIT_DATE` pins it; measured in §1.
5. **SwiftShader's own build.** These numbers are reproducible on one browser build and not necessarily
   across two. Compare the browser version the same way you compare the source fingerprint.
6. **Web workers** would not see the freeze — it is installed on the page's global. No `new Worker` exists
   under `apps/web/src` or `packages/gl/src` today, so this is a note for whoever adds the first one.

### Which recorded numbers predate the freeze, and are therefore not reproducible

**The test to apply is not a date — it is the file's own headers.** Every figure in any edition of
`docs/3d/app-sweep/README.md` or `docs/3d/APP_SWEEP.md` that lacks the *"The clock this was measured at"*
section was swept on the machine's clock, at an hour nobody recorded, over a tree nobody digested.
`git log --oneline -- docs/3d/app-sweep/README.md` lists them. Those figures **cannot be reproduced** —
re-running the same commit gives different numbers — and nothing here is a correction of them, because a
correction implies a comparison and there is none to make. The same applies to any document that quoted them.

**And there is a second, sharper problem with the currently committed `docs/3d/app-sweep/README.md`, which I
measured rather than inherited.** That file carries the freeze section, so it looks reproducible. It is not,
because it does not describe the tree it was committed with:

- The committed report states it swept tree `1f4d9aeedd53`.
- The tree at HEAD hashes to **`0393e1e15bcd`** over the same 512 files (`apps/web/src`,
  `apps/web/index.html`, `packages/gl/src`) — reported identically by all five of my runs.
- No commit between that report's own commit (`8d97768`) and HEAD touches any of those three roots, and the
  working tree is clean for all of them. So the report was generated **before** later edits inside its own
  commit — which changed `apps/web/src/components/geometry/DeckReliefGl.tsx` (20 lines) and
  `packages/gl/src/look/theme.ts` (278 lines), among others.

By that file's own stated rule — *"two runs may only be compared when this matches"* — its numbers are
disqualified from comparison with anything measured at HEAD.

The practical consequence is exactly two rows, and they are E1's. Diffing the committed report against my
run-A report changes **13 lines in total**, of which the substantive ones are:

```
- | **E1** DeckRelief | light | yes | 233.9 | **23.50** | 171→255 | 28 | **48** | 49 | 0.00 | — | 233.9 | — |
+ | **E1** DeckRelief | light | yes | 228.3 | **11.50** | 189→236 | 34 | **31** | 32 | 0.00 | — | 228.3 | — |

- | **E1** DeckRelief | 86% | 118% | 155% | 158% | 0% | holds up · no data marks in either theme |
+ | **E1** DeckRelief | 42% | 66% | 100% | 103% | 0% | **WORSE IN LIGHT** · no data marks in either theme |
```

The remaining differences are the status headline, the fingerprint line and the date stamp. **Every other
surface's numbers are unchanged.** So the theme-contract fix that landed in `8d97768` moved E1 from "holds
up" to "worse in light", and the committed report is the last one that says otherwise. That is also the
closest thing to a mutation test this pass could perform: a real source change moved exactly the axis the
instrument guards, and moved nothing else. I could not run the pre-change tree to confirm the 23.50 figure
directly, so it is reported as *what the older file claims*, not as a number I measured.

---

## 6 · Where the evidence lives

- **The generated report**, rewritten from a live sweep and not editable by hand:
  `docs/3d/app-sweep/README.md` (regenerate with `APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs`).
- **The captures**: `docs/3d/app-sweep/theme/*.png`, two per surface per theme — `*-canvas.png` is the
  surface clipped to its canvas box, `*-viewport.png` is the surface judged against the page around it.
  Remember §5.3: the canvas captures are the stable ones.
- **The four-axis sweep** (print, reduced motion, context loss, GL context budget), which is a different
  question from this one: `docs/3d/APP_SWEEP.md`.
- **The instrument itself**: `scripts/3d-audit-app.mjs`. Its header states what it deliberately does not
  claim, and every classifier in it is derived from source rather than typed into it.

**A surface this sweep could not reach is reported as not reached on both themes, never as a pass.** That
rule is why the total in §3 is 3 and not a larger number, and it is the rule this whole programme was
missing.
