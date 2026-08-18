# Running the §7(b) trial — about twenty-five minutes, one person, not me

> This file is **not generated**. `README.md` in this directory is output from `npm run audit-3d` and says so
> at the top; instructions for a human belong somewhere the generator will not overwrite.

§7 gates every environment on two clauses together:

> **(a) A stranger stops scrolling.**
> **(b) An operator still gets their answer at least as fast as the flat version.**

Clause (b) is the anti-showreel clause. It is the only mechanism that has ever stopped this programme
shipping something that looks expensive and reads worse, and it is why all eight relief views default **off**
with the label *"nobody has yet timed whether it answers faster than this grid."*

**It has never been run.** The instrument has existed and been verified for weeks. What it needs is a person
who does not already know the answers — which excludes whoever built the surfaces, because `task.html` is its
own answer key. A self-administered result would be worse than none.

---

## How to run it

```bash
cd /Users/nik/Downloads/usclaude-main && node docs/3d/serve.mjs
```

Then open **http://127.0.0.1:5600/e9/task.html** and press *Begin*.

> The `cd` is not decoration. This used to read `node docs/3d/serve.mjs` on its own, which only works
> if your shell already happens to be in the repository — and the first person to try it was in their
> home directory, got `Cannot find module '/Users/nik/docs/3d/serve.mjs'`, and then
> `ERR_CONNECTION_REFUSED` in the browser because nothing was listening. Two confusing errors for one
> missing directory. A setup step that assumes where you are standing is a setup step that fails.

That is the whole setup. The server is loopback-only, GET-only, serves `docs/3d` and nothing else, and sends
`cache-control: no-store` — because the trial's entire output is milliseconds and a cached second load would
make the flat surface look faster than it is.

If you prefer the editor's preview pane, `.claude/launch.json` has a `3d-trial` configuration on the same
port.

### Before you start

- **Do not read `task.html`.** It contains the answers.
- Give it twenty-five uninterrupted minutes. That is the original twenty-minute figure scaled from 12
  trials to 14, not a new estimate. The clock starts when each surface appears and stops when you
  answer, so a pause mid-trial spoils that trial.
- Answer as fast as you honestly can, but **do not guess** — a wrong answer fast is a worse surface, not a
  better one, and the instrument is built to catch exactly that (see below).
- One pass. Do not restart to "do better"; the second pass measures recall.

### What comes out

A JSON block to paste into the environment's README under §7(b). It is the only §7(b) evidence that will
exist. The instrument **refuses to report** rather than mislead when:

- there are too few trials (`TOO_FEW_TRIALS`),
- accuracy differs between the two surfaces — because a mean time across unequal accuracy hides a faster
  wrong reading,
- no answers were correct at all.

A refusal is a real outcome and should be recorded as one.

Trials are also **excluded and named** — never quietly averaged in — when the harness's printed diagnostic
could not be hidden, or when the surface's startup could not be confirmed. The first of those matters: see
the finding below.

---

## What it covers, and what it cannot

**Measured — 7 environments:** E1, E2, E3, E4, E5, E6, E7. Fourteen trials, two per environment, and **no
question is asked twice** so the result cannot be recall.

Order is counterbalanced 4–3, not 3–3: seven environments cannot split evenly, and `buildTrials` assigns
the first surface by index parity, so E5/E4/E3/E1 show the environment first and E6/E2/E7 the flat surface
first. The trial that comes **second** for an environment is the one that benefits from the operator having
just thought about that shape of question, so the flat surface holds that position four times and the
environment three — the residual biases **against** reporting `MEETS (b)`, which is the direction this page
should err in. Recorded rather than rounded off.

Both surfaces of every pair are the **same harness page** one branch apart: `live.html` renders the
environment, `live.html?refuse=1` takes the real refusal path and renders that environment's own flat
fallback from the identical dataset. Not a re-implementation that could drift.

**Not applicable — E8 THE FORGE.** Clause (b) asks whether an operator gets *their answer* faster. E8 is a
machined disc, a ring and a plinth on the sign-in screen; it carries no dataset and answers no question, so
there is no answer to time. E8 is gated on clause (a) alone. This is a category difference, not an omission
— recording it as "unmeasured" would imply outstanding work that does not exist.

**E1 THE THEATRE was refused here, and the refusal was lifted on 2026-08-14.** The record is kept because
the refusal is the reason the fix is shaped the way it is.

The code was `SURFACES_DO_NOT_CARRY_THE_SAME_DATA` — rule 1 of the trial. E1's flat view carried nine rows
of Env / Name / Verdict and no arrangement at all; its rendered view carried five panels *plus* the
arrangement and named the other four only in the HUD. The pair `task.html` had ready — which environment
the view is *addressing* and which stands immediately behind it, `E1` then `E8` — therefore had **no flat
answer at any price**, and since the summary pools accuracy across environments before comparing medians,
asking it would have handed the comparison to the environment for free.

Two changes to `../e1/entry.ts` lifted it, in this order:

1. **The `SLOT_BY_RANK` defect was settled first**, because the ordinal would otherwise have been built on
   it. It was the literal `['P3','P4','P2','P5','P1']` under a comment calling it "nearest-panel-first",
   twice, and it is not: the measured face-centre eye distances are P3 6.13, P4 7.44, P2 7.92, **P1 10.41,
   P5 11.09** m, so its last two entries were reversed and E6 and E5 each stood on the other's panel. It is
   now the sort itself rather than a corrected literal, so it cannot disagree with the geometry again. E1
   was rebuilt and re-captured under the corrected order — and the rebuild **failed the contrast gate**,
   which is how far the defect actually reached: `E5 · THE SURFACE` landed on the 11.09 m panel and measured
   4.39:1 against a 4.5:1 floor where `E6 · THE VAULT` had measured 4.73:1 on the same panel with the same
   blur and opacity. The DOM blur/opacity pair had been bisected at its own limit against the wrong
   assignment; it is now 0.34 px / 0.06 with the binding run at 4.92:1, chosen for margin.
2. **The flat table gained a front-to-back ordinal column** — `Front-to-back (1 = nearest)`, with `absent`
   on the four environments that have no panel — derived from the same sort, not a second list. Read off
   the built surface: `E0 3 | E1 1 | E2 absent | E3 absent | E4 absent | E5 5 | E6 4 | E7 absent | E8 2`.

The pair's answers cannot rot: `PANELS`, the viewpoint and `PREFERRED` are hard-coded literals and
`SLOT_BY_RANK` is computed from the first two; the only build-time input is the first two **keys** of
`__ENV_STATES__`, and a README edit changes an environment's name and verdict, never its key. A tenth
environment does not move it either — a key absent from `PREFERRED` sorts behind all six named ones and
lands in `OMITTED`, verified by replaying the sort with `e9`, with `e10`, and with both.

One clause of the pair changed on the way in. The draft asked for the environment "nearest you, **the one
the lens holds sharp**"; there is no lens on the flat surface, so that wording invites a flat operator to
press *Cannot tell from this surface* on a question their table can answer — the same free point, bought
with wording instead of data. Both questions are surface-neutral now, like every other pair in the set. The
derivation and both answers are unchanged.

**A correction this exposed.** The paragraph above used to contrast E1 with E2 — "there the table gives
latitude and longitude and answering flat means spherical geometry in your head, dear but possible". Read
off the built surface at `/e2/live.html?refuse=1`, E2's fallback columns are `Corridor to | Lat | Lon |
Great-circle separation` and the last is populated (London 7.6°, Singapore 91.9°), so both members of E2's
pair are an extremum over one column of seven. That has been true for as long as E2 has been in the set.
E1's ordinal column is the same shape of help and slightly dearer to read. The wrong claim came from E2's
own `readsAs`, which still says the table gives "no reach" — a defect in `../e2/entry.ts`, reported and not
repeated here.

**Measured is now 7.**

## What it will not tell you

Clause **(a)**. "A stranger stops scrolling" is not measurable at a desk by two people who built the thing,
and a five-point scale would not make it one — it would make it a number with no instrument behind it, which
is the specific failure this programme has already committed twice (a 0.45 ms frame time and a 60 Hz
headroom, both measured with something that could not measure them). For (a) there is a blind, shuffled
decision sheet at `/e9/gate-a.html`; its output is explicitly tagged `JUDGEMENT_NOT_MEASUREMENT`.

---

## The harness printed the answer under the frame — found 2026-08-13, fixed in `task.html`

Found while tracing E1's two surfaces, and it was **live on the pair this page holds up as its best-derived
one.** Every harness ends with `log.textContent = JSON.stringify(report)` into a visible `<pre id="log">`
directly below the 720 px canvas. Measured at the trial's own geometry — the 760 px iframe, a 1240×780
window, real hardware (ANGLE Metal, Apple M1, headroom 11.8 ms) — with offsets located by a `Range` over the
text node rather than counted against an assumed line height:

| environment | what the printed report gives away | where |
|---|---|---|
| **E2** | `"to": "London" … "separationDeg": 7.6` through `"Singapore" … 91.9`, all seven corridors — **the answer to both members of its pair**, already listed | y 1096–1521 in a 1771 px document; the first city row is **361 px below the fold** |
| **E1** | `"focusPanel": "P3"`, then `"environmentsShown": ["E1","E8","E0","E6","E5"]` | y 935 and y 3835 in a 4425 px document |

It is **one-directional**: on `?refuse=1` that element holds 128 characters (the `FORCED_REFUSAL` sentence),
because `die()` runs before any report exists. So the channel was open only on the 3-D surface — the
direction that would have made this page report `MEETS (b)` for nothing. And the operator did not have to go
looking: every flat surface puts its table *below* the hidden canvas, so flat trials require scrolling, and
having learnt that, scrolling a 3-D trial is the same gesture.

`task.html` now hides that element in both surfaces **before the clock starts**, and records whether it
succeeded; trials where it did not are excluded and counted in the summary. Nothing is lost on the flat path
— verified on E5's refusal: the rendered surface is still there, the refusal notice still carries the same
code and reason, and the document shrinks by 36 px.

### Re-verified on E1's pair, 2026-08-14

E1's pair is the one this channel answered outright, so a fix confirmed on E5 is not a fix confirmed here.
Re-measured by **extracting `hideDiagnostic` from `task.html` and running it** against both E1 surfaces at
the trial's own geometry — the `src` string `showTrial` builds, a 760 px iframe, a 1240×780 window:

| | before | after `hideDiagnostic` |
|---|---|---|
| **E1 · environment** | `#log` 5,052 chars, y 760–4,530 in a 4,570 px document — it *begins* at the fold — containing `focusPanel`, `environmentsShown` and `"P3"` | `display: none`, 0×0 box, document 776 px; **none** of the three fields in the frame's visible text. Returned `true`, so the trial counts |
| **E1 · flat** | `#log` 128 chars (the `FORCED_REFUSAL` sentence), none of the three fields | unchanged; the one-directionality confirmed on *this* pair rather than assumed |

The other half of the claim is that nothing routes around it: the src is `../${t.env}/live.html?frames=6…`
for every trial, `t.diagnosticHidden = hideDiagnostic(iframe)` runs on every trial including the 20 s
timeout path, and `finish`'s exclusion is `results.filter((r) => r.startupUnconfirmed || !r.diagnosticHidden)`
with no environment named in it. E1 gets the guard because every trial gets it.

**One residual channel, named rather than closed, and older than E1's entry.** `_shared/flatFallback.ts`
deliberately *clips* the rule-1 table to 1×1 on the success path instead of removing it, so it survives in
the accessibility tree — which means every 3-D surface carries its own flat table, painting zero pixels,
inside `getSelection()`. Measured: a select-all reaches 2,270 characters on E1 including the ordinal header,
1,911 on E2 including the great-circle separations that answer **both** members of its pair, and 2,564 on
E5. So this is a property of all seven environments and of the design of rule 1, not something E1
introduced; and unlike `#log` it is not below the fold, so it cannot be reached by scrolling — only by
select-all and paste, which is not a gesture this trial teaches. It is left open because closing it means
hiding the surface under test: on the flat path that table *is* the surface, and on the 3-D path it is that
surface's §6 rule 1 deliverable.

## Verified ready, 2026-08-14 (re-run after E1 joined; the 2026-08-13 run covered 12 trials)

- **14 trials across 7 environments**; exactly 2 per environment, one per surface.
- Counterbalance **4–3**, the closest an odd count allows, and the residual favours the flat surface — see
  the coverage section above for which direction that biases the verdict in.
- **0 duplicate questions** across the 14 trials — and the two members of every pair differ, so no operator
  answers the same question twice.
- Verified by **extracting and running `task.html`'s own `TASKS` and `buildTrials`**, not a copy of them; and
  independently through the page's dry-run button in a browser, which listed the same 14 rows in the same
  order. The two lists were compared row for row rather than counted.
- Every answer in the key is one of its own question's options — a question that cannot be answered
  correctly would silently depress the accuracy of whichever surface carried it.
- The button reads `Begin — 14 trials across 7 environments`, and it is **derived**. It used to read
  "Begin — 8 trials" as a literal, which was true for the four environments the set started with and wrong
  the moment two more were added — the same class of defect as E1 rendering E0's frame time under a printed
  checkability claim.
- The printed-diagnostic fix confirmed running **on E1's own pair**, not carried over from E5's: see the
  section below.
- All 12 surfaces and 6 bundles served 200 through `serve.mjs` on 2026-08-13, and `/../../package.json` and
  its percent-encoded form both returned 404. **E1's two surfaces were served and driven today; the other
  six and the traversal check were not re-run**, so that line is 2026-08-13 evidence and is dated here
  rather than silently inherited.
