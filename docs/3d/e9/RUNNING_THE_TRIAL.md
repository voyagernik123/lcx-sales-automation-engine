# Running the §7(b) trial — twenty minutes, one person, not me

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
node docs/3d/serve.mjs
```

Then open **http://127.0.0.1:5600/e9/task.html** and press *Begin*.

That is the whole setup. The server is loopback-only, GET-only, serves `docs/3d` and nothing else, and sends
`cache-control: no-store` — because the trial's entire output is milliseconds and a cached second load would
make the flat surface look faster than it is.

If you prefer the editor's preview pane, `.claude/launch.json` has a `3d-trial` configuration on the same
port.

### Before you start

- **Do not read `task.html`.** It contains the answers.
- Give it twenty uninterrupted minutes. The clock starts when each surface appears and stops when you
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

**Measured — 6 environments:** E2, E3, E4, E5, E6, E7. Twelve trials, two per environment, order
counterbalanced (three show the environment first, three the flat surface first), and **no question is asked
twice** so the result cannot be recall.

Both surfaces of every pair are the **same harness page** one branch apart: `live.html` renders the
environment, `live.html?refuse=1` takes the real refusal path and renders that environment's own flat
fallback from the identical dataset. Not a re-implementation that could drift.

**Not applicable — E8 THE FORGE.** Clause (b) asks whether an operator gets *their answer* faster. E8 is a
machined disc, a ring and a plinth on the sign-in screen; it carries no dataset and answers no question, so
there is no answer to time. E8 is gated on clause (a) alone. This is a category difference, not an omission
— recording it as "unmeasured" would imply outstanding work that does not exist.

**Refused with a measured reason — E1 THE THEATRE.** Code `SURFACES_DO_NOT_CARRY_THE_SAME_DATA`.

This entry used to read *deferred*, and the reason was that E1's panel text is injected from the other
environments' READMEs at build time, so an answer key would rot on the next rebuild. **That reason is
settled.** A pair whose answers cannot rot exists and is written out in `task.html`: which environment the
view is *addressing* (nearest, held sharp) and which stands immediately behind it — `E1` then `E8`, derived
from the camera and the five hard-coded panel positions (face-centre eye distances 6.13, 7.44, 7.92, 10.41,
11.09 m; the harness's own report agrees on all five). No part of that touches panel copy, and a tenth
environment does not move it — a key absent from `PREFERRED` sorts behind all six named ones and lands in
`OMITTED`, verified by replaying the sort with `e9`, with `e10`, and with both.

What blocks E1 is **rule 1 of the trial** — the two surfaces must show the same data — and E1 is the one
environment where they do not. Its flat view carries nine rows of Env / Name / Verdict and no arrangement at
all; its rendered view carries five panels *plus* the arrangement and names the other four only in the HUD.
The pair above therefore has **no flat answer at any price**, which is not E2's situation (there the table
gives latitude and longitude and answering flat means spherical geometry in your head — dear, but possible).
Since the summary pools accuracy across environments before comparing medians, adding a question the flat
surface cannot answer hands the comparison to the environment for free. That is a fix to the instrument.

`task.html` states the exact change to `../e1/entry.ts` that would lift it — a front-to-back ordinal column
on the flat table, and the `SLOT_BY_RANK` defect that has to be settled first (it is called
"nearest-panel-first" twice and its last two entries are the wrong way round: P1 stands at 10.41 m, P5 at
11.09 m). **Measured stays at 6, not 7.**

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

## Verified ready, 2026-08-13

- 12 trials build across 6 environments; exactly 2 per environment, one per surface.
- Counterbalance is even: E5/E4/E3 show the environment first, E6/E2/E7 the flat surface first.
- 0 duplicate questions across the 12 trials — and the two members of every pair differ, so no operator
  answers the same question twice.
- Verified by **extracting and running `task.html`'s own `TASKS` and `buildTrials`**, not a copy of them; and
  independently through the page's dry-run button in a browser, which listed the same 12 rows.
- The printed-diagnostic fix confirmed running: on trial 1 (E5, environment) the 2,352-character report is
  `display: none` and the frame's document is 776 px, so there is nothing left to scroll to.
- Every answer in the key is one of its own question's options — a question that cannot be answered
  correctly would silently depress the accuracy of whichever surface carried it.
- All 12 surfaces and 6 bundles serve 200 through `serve.mjs`; `/../../package.json` and its percent-encoded
  form both return 404. Re-checked today, not carried over.
- The trial count on the button is **derived** from the task set. It used to read "Begin — 8 trials" as a
  literal, which was true for the four environments the set started with and wrong the moment two more were
  added — the same class of defect as E1 rendering E0's frame time under a printed checkability claim.
