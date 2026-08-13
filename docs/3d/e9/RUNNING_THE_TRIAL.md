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

**Deferred with a reason — E1 THE THEATRE.** Its panel text is injected from the other environments' READMEs
at *build time* (`__ENV_STATES__` in `../e1/entry.ts`), so an answer key written here would silently rot the
next time a README changed. A stale answer key does not fail loudly: it marks correct answers wrong and
reports a legible surface as illegible. E1 needs a question whose answer is a property of the *geometry*
rather than of the panel copy, and it has no interactive addressing today, so the obvious candidate — "which
panel is being addressed" — has no answer either. Outstanding, and named rather than skipped.

## What it will not tell you

Clause **(a)**. "A stranger stops scrolling" is not measurable at a desk by two people who built the thing,
and a five-point scale would not make it one — it would make it a number with no instrument behind it, which
is the specific failure this programme has already committed twice (a 0.45 ms frame time and a 60 Hz
headroom, both measured with something that could not measure them). For (a) there is a blind, shuffled
decision sheet at `/e9/gate-a.html`; its output is explicitly tagged `JUDGEMENT_NOT_MEASUREMENT`.

---

## Verified ready, 2026-08-13

- 12 trials build across 6 environments; exactly 2 per environment.
- Counterbalance is even: E5/E4/E3 show the environment first, E6/E2/E7 the flat surface first.
- 0 duplicate questions across the 12 trials.
- Every answer in the key is one of its own question's options — a question that cannot be answered
  correctly would silently depress the accuracy of whichever surface carried it.
- All 12 surfaces and 6 bundles serve 200 through `serve.mjs`; path traversal returns 404.
- The trial count on the button is **derived** from the task set. It used to read "Begin — 8 trials" as a
  literal, which was true for the four environments the set started with and wrong the moment two more were
  added — the same class of defect as E1 rendering E0's frame time under a printed checkability claim.
