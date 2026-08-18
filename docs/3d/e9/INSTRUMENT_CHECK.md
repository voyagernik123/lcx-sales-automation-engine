# E9 · IS THE §7(b) TRIAL SAFE TO HAND A HUMAN? — status: **NO. Two of the seven relief surfaces print their own answer on the frame.**

Checked 2026-08-18 against `HEAD f2e80fa`, by driving `docs/3d/e9/task.html` in a real browser. Not generated:
run by hand, so every figure below names the thing it came from.

---

## THE VERDICT

**Do not hand this to an operator yet.** Four of the five checks found something, and two of the findings
would invalidate a reading taken today rather than merely blemish it.

The instrument's *machinery* is in better shape than its *content*. The clock gate, the exclusion path and all
five verdict branches work — I drove each one and they behave exactly as the file says. What is broken is the
surfaces the trial points at: on **E5** and **E7** the relief frame prints, in words, the answer to the
question that surface is asked. That is Audit 5c's defect 1 — the one that invalidated the machine-reader
trial — still live, in the shipping harnesses, not just in the captured images.

And it does not stay local to those two rows. `finish()` pools accuracy and pools medians across all seven
environments before comparing them (`docs/3d/e9/task.html:502` — `bySurface` filters by surface only). So a
relief trial that can be answered without looking at the relief lowers the pooled relief median for every
environment. **Two printed answers out of seven do not cost you two rows; they cost you the verdict.**

### Fix first, in this order

1. **`docs/3d/e5/entry.ts:761,769` — the peak readout prints the answer.** The frame carries `PEAK` /
   `74%` / `$500k · 30 d` at the top of the viewport. E5's relief question is *"At 30 days to close, which
   ticket-size band has the HIGHEST win rate?"*, answer `$500k`. None of the other three bands appears
   anywhere in the frame's text. Worse, E5's *pair* has the SAME answer for both members (`$500k` twice), so
   the callout also gives away the flat trial. Either stop printing the band and the day on the initial
   `PEAK` readout, or replace E5's pair with questions the readout does not state.
2. **`docs/3d/e7/entry.ts:1322` — the calendar prints `D13-D15 NOT MEASURED`.** E7's relief question is
   *"Which day range was NOT MEASURED (as distinct from withheld)?"*, answer `D13–D15`. The label states the
   range and its status. It also prints `D22-D23 WITHHELD`, i.e. the very distinction the question is testing.
3. **`docs/3d/e2/build.mjs:41` (with `docs/3d/_shared/flatFallback.ts:254`) — E2's flat branch paints nothing
   in the frame the operator is given.** `<div id="stage" style="…height:720px">` survives the refusal because
   `showRefusal` hides `canvas` elements only, so the table starts 766 px into a 758 px frame. Measured on the
   frame: 0 of 37 visible text nodes above the fold, 2 distinct colours, 0.43 % of pixels differing from the
   modal one. The operator is timed while looking at an empty box.
4. **`docs/3d/e9/task.html:525` — one exclusion prints an accuracy failure that did not happen.** The
   comparison is `three.correct < flat.correct` on raw counts, while `n` can differ because a trial was
   excluded. I drove it: one relief trial excluded, **every answer given correct**, and the verdict was
   `FAILS (b) — ENVIRONMENT_LESS_ACCURATE_THAN_FLAT` on 6/6 against 7/7. Compare rates, or refuse when
   `three.n !== flat.n`.
5. **The recovered result cannot be downloaded, and an abandoned run is still lost.** `$('save').onclick` is
   assigned only inside `finish()` (`task.html:586`), so after a reload the button an operator meets is inert
   (`typeof onclick === 'object'`, i.e. null — measured). And `localStorage.setItem` also runs only in
   `finish()` (`task.html:579`): I answered 5 of 14 trials and stopped, and nothing was saved. The failure
   mode that cost today's run is half closed, not closed.

Two relief surfaces — **E4** and **E1** — passed the answer-on-frame check on the evidence below, and their
flat branches paint. A four-trial trial over those two would not be refused by the instrument
(`three.n >= 2 && flat.n >= 2`). That is a fallback, not a recommendation: one operator over two environments
is an anecdote, and the file says so itself.

---

## WHAT THIS DOCUMENT IS NOT

**There is no clause (b) reading anywhere in this file, and I did not try to produce one.** Clause (b) asks
whether *an operator gets their answer at least as fast* from the relief surface. Every number below is either
a property of the apparatus (does a branch paint, is a string on the frame, does a code fire) or a stopwatch
reading of **my own scripted clicker**, whose dwell times are constants I chose — 150, 200, 250, 400 or 2500
milliseconds — precisely so that they could not be mistaken for a person reading a chart. Where a verdict
string like `MEETS (b)` appears below, it is the output of a control-flow test with a 200 ms relief dwell
against a 2500 ms flat dwell. It says the branch is reachable. It says nothing about legibility.

A machine cannot stand in for the operator here, and this is not a tooling gap that a better harness closes.
Given a rendered surface, a model reconstructs: it can extract the mask, fit a projection, and recover a value
that no eye could pick off the picture — which is why the last attempt's relief readers scored 6/6 while
independently reporting that the answer was *not legible*. A number obtained that way measures the reader's
persistence with an image. A person glancing at a chart for four seconds does something categorically
different, and the quantity clause (b) names is the second thing. Repeating the experiment with a fresh
instrument would reproduce the invalidity, not remove it. The only honest machine contribution is the one
attempted here: check that the apparatus is sound, so the human's twenty-five minutes are not spent on a
broken instrument a second time.

---

## HOW THIS WAS RUN

| | |
|---|---|
| repo | `HEAD f2e80fa` (2026-08-18); `task.html` last changed by that commit |
| server | `node docs/3d/serve.mjs 5601` — port 5600 was already held by another process (`lsof -iTCP:5600`) |
| browser | Chromium via Playwright 1.61.1, `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` |
| viewport | 1240×1000, DPR 1, unless a row says otherwise. The frame under test is 760 px tall in every case, so the fold that matters is internal to the iframe and does not move with the outer window |
| what was driven | the real `task.html`, its real Begin button, its real iframes, its own `#json` output. No mock of the instrument, and no edit to any file under test |
| surface list | **derived, not typed**: the `TASKS` literal was bracket-matched out of `task.html` and evaluated, and `buildTrials` was lifted verbatim from the same file. Cross-checked against the page's own *"Show the trial order without timing"* table, which agreed row for row |

Two mechanical instruments are worth naming because they replace things a picture-reader would have done:

- **On-frame text** is collected by walking the frame's DOM and keeping only text whose element is not
  `display:none` / `visibility:hidden` / `opacity:0`, is at least 2 px in both dimensions, and is not
  `clip-path: inset(50%)`. That last exclusion is what keeps the deliberately-clipped rule-1 table out of the
  "visible" set. Each hit carries its y coordinate, so *above the 760 px fold* and *reachable by scrolling*
  are distinguished rather than conflated.
- **Text painted into a canvas** is captured by wrapping `CanvasRenderingContext2D.prototype.fillText` and
  `strokeText` before page scripts run, and recording every string drawn. Exact strings, no OCR. It returned
  **0 strings on all 14 trials** — these harnesses label with projected DOM overlays, not canvas glyphs — so
  the DOM walk above is the complete picture of on-frame text.

The scripts were session-local (a scratchpad driver, ~200 lines, plus five check scripts). They are not
committed, so this file states the method precisely enough to redo rather than pointing at a path that will
not exist. **The bundles matter for re-testing:** every environment's `bundle.js` and `live.html` were last
committed 2026-08-13/14 while every `entry.ts` was last committed 2026-08-15, so the trial loads artefacts
older than their sources. Everything below is measured on what the trial actually loads. Rebuild before
re-checking, and expect findings 1 and 2 to survive it — both strings are in the current `entry.ts`.

---

## CHECK 1 · EVERY PAIR RENDERS ON BOTH BRANCHES

Derived set: **7 environments, 14 trials** — `e5 e6 e4 e2 e3 e7 e1`, each with a 2-member pair. Both branches
were driven for all seven inside one uninterrupted run of the instrument.

`ink y` is the smallest y of any visible text node. `above fold` counts visible text nodes with y < 760.
`colours` is distinct colours in a screenshot of the iframe, quantised to 5 bits per channel; `non-modal` is
the fraction of pixels differing from the most common one. A blank branch scores ≈1 colour and ≈0.

| # | env | branch | title | ink y | above fold | colours | non-modal | fallback | canvas |
|---|---|---|---|---|---|---|---|---|---|
| 1 | e5 | relief | READY | 42 | 31/31 | 477 | 0.561 | clipped 1×1 | block 1200×720 |
| 2 | e5 | flat | REFUSED | 46 | 37/51 | 400 | 0.065 | shown 1136×1022, 1 svg | none 0×0 |
| 3 | e6 | flat | REFUSED | 46 | 81/109 | 268 | 0.070 | shown 1136×910, 25 rows | none 0×0 |
| 4 | e6 | relief | READY | 44 | 36/36 | 503 | 0.721 | clipped 1×1 | block 1200×720 |
| 5 | e4 | relief | READY | 44 | 40/40 | 775 | 0.553 | clipped 1×1 | block 1200×720 |
| 6 | e4 | flat | REFUSED | 46 | 75/93 | 266 | 0.067 | shown 1136×887, 24 rows | none 0×0 |
| 7 | **e2** | **flat** | REFUSED | **766** | **0/37** | **2** | **0.0043** | shown 1136×406, 7 rows | none 0×0 |
| 8 | e2 | relief | READY | 60 | 26/32 | 1206 | 0.837 | clipped 1×1 | block 1200×720 |
| 9 | e3 | relief | READY | 44 | 48/48 | 697 | 0.500 | clipped 1×1 | block 1200×720 |
| 10 | e3 | flat | REFUSED | 46 | 84/84 | 269 | 0.079 | shown 1136×635, 12 rows | none 0×0 |
| 11 | e7 | flat | REFUSED | 46 | 142/238 | 269 | 0.082 | shown 1136×1049, 28 rows | none 0×0 |
| 12 | e7 | relief | READY | 44 | 38/38 | 1060 | 0.380 | clipped 1×1 | block 1200×720 |
| 13 | e1 | relief | READY | 51 | 18/18 | 542 | 0.726 | clipped 1×1 | block 1200×720 |
| 14 | e1 | flat | REFUSED | 46 | 46/46 | 266 | 0.070 | shown 1136×518, 9 rows | none 0×0 |

**13 of 14 branches paint. One does not.** Every relief branch reached `READY` with a painted 1200×720 canvas;
every flat branch reached `REFUSED`, hid its canvases and un-clipped its fallback. The refusal is the real one
— all seven flat loads raised a `FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be
captured.` page error, each ending in that environment's own words (five *"The three-dimensional view is not
being drawn"*, one *"The channel is not being drawn"*, one *"The volumetric field is not being drawn"*). That
is `die()` running, not a mock.

**E2's flat branch is the exception, and it is a trial that cannot be run as posed.** Two distinct colours in
the whole frame. Swept across all seven flat branches, E2 is alone in it:

| env | fallback starts at y | frame is 758 px | blocker above it |
|---|---|---|---|
| e5, e6, e4, e3, e7, e1 | 83 | visible | (none) |
| **e2** | **799** | **entirely below the fold** | `DIV#stage y28..748 h=720 css-height=720px display=block` |

`flatFallback.ts:254` hides `canvas` elements on refusal — the fix Audit 3 made after finding "720 px of blank
canvas filling the viewport with the data below the fold". On E2 the obstruction is one element *above* the
canvas, a stage host with an inline height that `build.mjs` writes, so a canvas-only sweep counts zero dead
canvases and reports the environment clean. Same defect, one level up the tree, invisible to the check that
was built for it. `e2/entry.ts:1233` already knows about this host — it is named in a comment there for an
unrelated reason.

---

## CHECK 2 · IS THE ANSWER PRINTED ON THE RELIEF FRAME?

The most valuable check available, because it is mechanical and it is the exact defect that invalidated Audit
5c. For each relief surface I took the answer key (computed by `task.html` from the datasets, extracted here
rather than retyped) and asked whether the frame's own text contains the answer to the question *that surface
is asked*.

**Match with care, or you miss one.** Comparison folds case, whitespace, thousands separators and the whole
dash class. My first pass did not fold dashes and passed E7: the option is spelled `D13–D15` with an EN DASH
(U+2013) and the frame prints `D13-D15` with a HYPHEN. A naive substring check calls that surface clean.

| env | asked on relief | answer | answer on frame | distractors on frame | grade |
|---|---|---|---|---|---|
| **e5** | 30-day band with the highest win rate | `$500k` | **yes**, y257 `"$500k · 30 d"`, under `PEAK` at y223 and `74%` at y233 | **0 of 3** | **PRINTED** |
| **e7** | day range NOT MEASURED | `D13–D15` | **yes**, y252 `"D13-D15 NOT MEASURED"` | 1 of 3 (`D22-D23 WITHHELD`) | **PRINTED** |
| e6 | is the OLDEST record allow/block/withheld | `Allowed` | 6 hits, y361 `"ALLOWED · 4d ago"`, y366 `"ALLOWED · 3d ago"`, … | 2 of 2 | **TEXT-DERIVABLE** |
| e2 | SHORTEST corridor from Vaduz | `London` | y60 `"LONDON"`, y100 `"corridor from Vaduz · 7.6° · lift 0.0245"` | 0 above fold, 3 below | **TEXT-DERIVABLE** |
| e3 | stage holding the LARGEST deal | `SIGNED` | y411/y221 `"SIGNED"`, beside y391 `"$4.20M · 3 d"` | 4 of 4 | **TEXT-DERIVABLE** |
| e4 | STRONGEST coupling to the core | `PARTNER` | label only, no magnitude attached | 2 of 3 | **pass** |
| e1 | environment nearest the camera | `E1` | label only, no distance or ordinal | 3 of 3 | **pass** |

**PRINTED** means the frame states the answer as the answer. E5's callout names one band out of four and puts
the word `PEAK` above it; the question asks which band peaks. E7's label names the range and the status the
question asks for, and prints the withheld range beside it so even the distinction is handed over.

**TEXT-DERIVABLE** is softer and still fatal to the reading. Nothing declares the answer, but the frame prints
enough numbers in words to compute it without using the relief at all:

- **e6** prints an age on all eight record callouts — `4d ago`, `3d ago`, `2.0d ago`, `1.9d ago`, `1.8d ago`,
  `1.3d ago`, `9h ago`, `3h ago`. "Which is oldest" is the maximum of eight printed numbers.
- **e2** prints `corridor from Vaduz · N°` beside each labelled site, and then, in a block headed
  `NOT LABELLED ON THIS FACE — 5 OF 12 SITES, WITH THE REASON` at y760 and below, prints the rest with their
  degrees: Dubai 42.1°, Chicago 64.8°, Singapore 91.9°, Tokyo 85.9°. That is the flat table's
  great-circle column, in prose, on the relief frame.
- **e3** prints every deal's value next to its stage label — `$4.20M · 3 d`, `$2.60M · 41 d`, `$1.75M · 52 d`,
  `$880k · 6 d`, … "Largest by value" is a scan of printed currency.

The distinction matters for what to do about it: a PRINTED answer must be removed or the question changed; a
TEXT-DERIVABLE answer means the pair is testing the caption rather than the geometry, and the *question* needs
rewriting to something the labels do not enumerate.

**E4 and E1 pass, and I checked the negative rather than assuming it.** On E4, no visible text node contains
both an entity name and a magnitude; the three coupling strengths appear only in a legend (`STRENGTH 0.29`,
`0.60`, `0.92`, `STRENGTH NEVER MEASURED`), unattached to any entity, so the mapping still has to come off the
tube thickness. On E1, all four options appear as panel labels — symmetrically, which is the point — and no
node carries a distance, an ordinal, or the words *nearest*, *front* or *focus*.

### Two further channels found while doing this

**The pair's OTHER answer leaks across trials, before it is asked.** The relief frame of **e4** prints
`COUNTERPARTY` at y266 with `2 HOPS · RECORDS ABSENT` at y280 — that is verbatim the answer to e4's *flat*
question, *"Which entity's record count is NOT KNOWN?"*. The relief frame of **e3** prints `PRAXIS DESK` /
`VALUE ABSENT · 9 d` at y201/208 beside `SOURCED` at y216 — verbatim the answer to e3's flat question. Both
environments show the relief surface **first**, so in both cases the operator sees the answer one trial before
being asked for it. The counterbalance was designed to stop the second surface benefiting from the first; this
is that leak arriving through the frame content instead of through the question.

**The fix that closed the printed-report channel is working.** `hideDiagnostic` fired on **all 14 trials** —
`#log` measured `display:none` in every frame — hiding between 2,416 and 5,052 characters of report per relief
surface. The one-directionality holds too: flat frames carry only the 128-character refusal sentence there.
And the residual the file already names is confirmed, not worsened: a select-all inside a relief frame still
reaches 1,911–3,306 characters, including the clipped rule-1 table. It cannot be reached by scrolling, only by
select-all, and the trial does not teach that gesture.

---

## CHECK 3 · IS THE COUNTERBALANCE REAL?

Read off the page's own dry-run table, on **five independent page loads**, hashed each time.

```
sha256(order)[0:16] = 45e0e4b1b8efd0dc  45e0e4b1b8efd0dc  45e0e4b1b8efd0dc  45e0e4b1b8efd0dc  45e0e4b1b8efd0dc
identical across loads: true
```

| property | measured |
|---|---|
| trials | 14, seven per surface |
| environments showing the **environment** first | 4 — E5, E4, E3, E1 |
| environments showing the **flat surface** first | 3 — E6, E2, E7 |
| duplicate questions among all 14 | **0** |
| every environment: one trial per surface, two distinct questions | **true** for all 7 |

**The assignment flips across environments within one operator, and it is identical for every operator.**
`buildTrials` keys the first surface off `TASKS` index parity, and nothing is shuffled, so the 4-3 residual the
file documents is not a residual that a second operator cancels — every operator gets the same four
environment-first and the same three flat-first. The file's argument for why that direction is the safe one
still holds; what does not hold is any expectation that running more operators averages it out. If that was
intended, it needs a per-operator seed.

**One pair defeats "a question is asked once per operator" without repeating a question.** E5's two members
have **the same answer and the same four options**:

| env | answers | same answer both members |
|---|---|---|
| **e5** | `$500k`, `$500k` | **yes** |
| e6 | `Concentrated`, `Allowed` | no |
| e4 | `PARTNER`, `COUNTERPARTY` | no |
| e2 | `Singapore`, `London` | no |
| e3 | `SIGNED`, `SOURCED` | no |
| e7 | `PAID_SOCIAL`, `D13–D15` | no |
| e1 | `E1`, `E8` | no |

So E5's second trial can be answered correctly by repeating the first answer, without reading the second
surface at all. The question text differs, which is what the duplicate check tests; the *answer* does not,
which is what recall actually needs. Combined with finding 1 — the relief frame printing `$500k` — E5
contributes a correct answer on both surfaces to an operator who has read neither.

---

## CHECK 4 · DOES THE CLOCK GATE WORK?

**Yes, on all three of its jobs — and driving the exclusion path surfaced a defect one line further on.**

**The zero point is the surface's appearance, not the trial's start.** Across the 14 trials, the ms the
instrument reported tracks the interval from *my own* independent detection of `READY`/`REFUSED` to my click,
within **−33 to +34 ms** — the page polls at 60 ms, so that is agreement. It does not include startup:

| branch | startup to title, ms (sorted) |
|---|---|
| relief | 7, 1045, 1477, 1563, 1612, 1629, 2519 |
| flat | 4, 4, 52, 52, 53, 53, 54 |

Had the clock started when the trial began, every relief trial would have carried roughly **1.0–2.5 s** of
shader compilation that no flat trial pays. The gate is load-bearing, and it is holding. (The 7 ms relief
figure is an artefact of my timer, which starts when the question text appears — after the iframe was created
— so these are lower bounds. The six four-figure values are the ones that matter.)

**A press before the surface appears is ignored.** With a stub in place of one relief surface so that startup
could not be confirmed, I pressed an option at t = 800 ms. The trial did not advance —
`{"n":1,"env":"e5","surface":"3d","swallowed":true}` — and the same press was accepted, first attempt, once the
20 s cap had fired. `task.html:479` (`if (!shownAt) return;`) does what it claims.

**Both unconfirmable-startup paths fire and both exclude.** I made startup unconfirmable two ways, by
intercepting one relief URL at the network layer and answering it with a stub:

| how startup was broken | flags recorded | ms recorded | excluded? | relief n | verdict |
|---|---|---|---|---|---|
| title never reaches `READY`/`REFUSED` (stub with a `#log`) | `startupUnconfirmed: true`, `diagnosticHidden: true` | 7017 | **yes** | 7 → **6** | `FAILS (b) · ENVIRONMENT_LESS_ACCURATE_THAN_FLAT` |
| document unreadable — served with `Content-Security-Policy: sandbox`, an opaque origin, so `contentDocument` throws | `startupUnconfirmed: true`, `diagnosticHidden: **false**` | 4167 | **yes** | 7 → **6** | `FAILS (b) · ENVIRONMENT_LESS_ACCURATE_THAN_FLAT` |

The trial is timed *and* flagged *and* left in the JSON *and* kept out of the statistics, which is what the
design says. The summary named it in prose: *"1 of 14 trials EXCLUDED — 0 where the harness's printed report
could not be hidden …, 1 where startup could not be confirmed."*

**But look at the verdict column.** In both runs **every answer I gave was correct** — 6 of 6 on the relief
surface, 7 of 7 on flat — and the instrument reported that the environment was **less accurate than flat**.
`task.html:525` compares `three.correct < flat.correct`, raw counts, while `n` differs by exactly the excluded
trial. Two consequences:

- A single exclusion converts a clean run into a coded failure, and the code asserts something the data
  contradicts. An operator reading `ENVIRONMENT_LESS_ACCURATE_THAN_FLAT` would conclude they had got relief
  answers wrong.
- It is one-directional. Only the relief branch plausibly fails to settle — its startup is 1.0–2.5 s against
  the flat branch's 4–54 ms — so exclusions land on the relief side, and every one of them pushes the verdict
  towards `FAILS (b)`. Safe direction for a showreel guard; still a false statement about accuracy.

Two smaller things, both derived:

- `hideDiagnostic` returns `false` when the frame has **no** `#log` element at all (`task.html:432`), so
  "there was nothing to hide" is recorded as "the answer could not be hidden" and the trial is excluded. It
  over-excludes, which is the conservative direction — and it is how I drove `TOO_FEW_TRIALS` cheaply below.
- The exclusion sentence prints one count per reason, so a single trial excluded for *both* reasons renders as
  `1 of 14 trials EXCLUDED — 1 … , 1 …`, which reads as two. Cosmetic, but this is a sentence someone will
  paste into a README.

---

## CHECK 5 · DO THE REFUSALS FIRE?

**All five branches of `finish()` are reachable and every code is the one the file promises.** Each row is a
complete 14-trial run of the real instrument.

| what I drove | verdict · code | relief | flat |
|---|---|---|---|
| every trial answered *"Cannot tell from this surface"* | `REFUSED · NO_CORRECT_ANSWERS_ON_ONE_SURFACE` | n 7, correct 0, unsure 7 | n 7, correct 0, unsure 7 |
| all seven relief surfaces stubbed so the report could not be hidden | `REFUSED · TOO_FEW_TRIALS` | **n 0** | n 7, correct 7 |
| relief 1 correct of 7, flat 7 of 7 | `FAILS (b) · ENVIRONMENT_LESS_ACCURATE_THAN_FLAT` | n 7, correct 1 | n 7, correct 7 |
| all correct; scripted dwell 2500 ms relief / 200 ms flat | `FAILS (b) · ENVIRONMENT_SLOWER_THAN_FLAT` | median 2532 ms | median 216 ms |
| all correct; scripted dwell 200 ms relief / 2500 ms flat | `MEETS (b)` (no code) | median 225 ms | median 2521 ms |

**The last row is a control-flow test and nothing else.** 225 ms is how long my script was told to wait. It is
in the table because an instrument that can only ever refuse would be as useless as one that can only ever
pass, and this proves the pass branch is reachable. It is not a result, and it must never be quoted as one.

Note the ordering inside `finish()`, which is correct and worth knowing when reading a refusal: `TOO_FEW_TRIALS`
is tested first, then `NO_CORRECT_ANSWERS_ON_ONE_SURFACE`, and only then accuracy. So a surface with zero
correct answers refuses rather than reporting an accuracy failure — which is why the third row needed one
correct relief answer to reach `ENVIRONMENT_LESS_ACCURATE_THAN_FLAT` at all.

---

## NOT ONE OF THE FIVE, CHECKED ANYWAY: CAN THE RESULT SURVIVE?

This is the failure that lost today's run, so it was worth twenty minutes.

| state the operator can be in | measured |
|---|---|
| run completes, Download pressed in the same session | **works** — download fired, `e9-7b-trial-2026-08-18T08-38-31-759Z.json`, 5,720 bytes, parses as JSON carrying a verdict, no failure |
| run completes, tab reloaded | **works** — 5,712-char payload recovered from `localStorage`, banner names the timestamp, *"Show it"* restores it and labels it *"This is an EARLIER run, not this session."* |
| result recovered after a reload, Download pressed | **BROKEN** — `document.getElementById('save').onclick` is `null` both after the reload and after pressing *Show it*, and no download event fires. The handler is assigned only inside `finish()` (`task.html:586`), which never runs on the recovery path. The button an operator meets in this state does nothing and says nothing |
| run abandoned part-way (I answered 5 of 14 and stopped) | **BROKEN** — `localStorage` empty, no recovery banner on reload. The write is inside `finish()` (`task.html:579`), so an interrupted trial saves nothing at all |

The second of those is the incident repeating in a narrower form: a person who runs the trial, closes the tab
having seen the verdict, comes back tomorrow, presses the only button on the page and gets nothing.

**And one ergonomic figure, because the clock is running while it happens.** The option buttons sit below the
760 px iframe, so answering requires scrolling the outer page on every trial:

| outer viewport | iframe | options at | options below the fold by |
|---|---|---|---|
| 1240×780 — the geometry `task.html`'s own notes cite | y261..1023 | y1068..1102 | **322 px** |
| 1440×900 | y261..1023 | y1068..1102 | 202 px |
| 1240×1000 | y261..1023 | y1068..1102 | 102 px |

Both surfaces pay that scroll, so it largely cancels in a comparison. E2's flat trial pays it **twice** — once
on the outer page to reach the buttons, once inside the frame to reach a table that starts at y799 — and that
does not cancel against anything.

---

## WHAT THIS CHECK DOES NOT ESTABLISH

- **Nothing about legibility, on either surface.** See *What this document is not*. The relief frames that
  passed check 2 passed a test about strings, not a test about whether a person can read a ridge.
- **Nothing about real-hardware behaviour.** Everything above ran under SwiftShader. That is fine for the
  apparatus — a string is on the frame or it is not — but the startup figures in check 4 are software-rasteriser
  figures. On a GPU the gap the clock gate removes will be smaller; it will not be zero, and the gate is still
  the difference between measuring reading and measuring shader compilation.
- **Nothing about the six environments' answer keys being right.** I used the key `task.html` computes and
  checked the *apparatus* against it. If a key is wrong, every check above passes unchanged and the trial is
  still invalid. The keys' derivations are argued in the file's own comments and were not re-derived here.
- **One residual I could not close from outside.** The select-all channel (1,911–3,306 characters per relief
  frame, including the clipped rule-1 table) is a consequence of §6 rule 1 keeping that table in the
  accessibility tree. It cannot be closed without hiding the surface under test. It is left open, and named.

## ONE STALE LINE, REPORTED RATHER THAN EDITED

`docs/3d/serve.mjs:78-79` prints, on every start:

> `Six environments are measured: e2 e3 e4 e5 e6 e7.` / `E8 is not applicable … and E1 is deferred —`

The set has been seven since E1's refusal was lifted on 2026-08-14, and the trial I drove ran E1 as trial 13
and 14. The first thing an operator reads when they start the server contradicts the page it points them at.
Not my file to change, so: two lines, one number, and the word *deferred*.
