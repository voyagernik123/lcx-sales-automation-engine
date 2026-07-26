# LCXOS — THE ALIVE PROGRAMME

**Making the instrument feel alive, fun, and compulsive — without adding a single panel.**

Author: this session, 2026-07-26. Status: proposed, awaiting approval.
Governing brief: *CIA × Palantir × Apple × Fortune 500 × Bloomberg × LCX × Rockstar.*

---

## 0. THE DIAGNOSIS — measured, not asserted

I audited the shipped app before proposing anything. Three findings, and together
they explain "kinda boring to use" completely.

### 0.1 Every animation in the app is the app talking about itself

Every `animate-*` utility in use across 62 pages:

| Count | Utility | What it communicates |
|---|---|---|
| 24 | `animate-spin` | "please wait" |
| 21 | `animate-pulse` | "please wait" |
| 12 | `animate-pulse-beacon` | "I am a status light" |
| 5 | `animate-slide-in` | toast arriving |
| 4 | `animate-fade` | something appeared |

**Not one of these is a reaction to something the operator did.** 100% of the
motion in the product is ambient — waiting, pending, alive-dot. 0% is
consequential. An interface where the only things that move are spinners and
blinking dots does not read as *alive*; it reads as *nervous*, or as *busy with
its own business*. That is the precise texture of "boring".

### 0.2 The layer that would fix it is built, tested, budgeted — and switched off

`lib/juice.ts` (202 lines) and `lib/feedback.ts` (172 lines) implement a complete
game-feel system: `flash`, `shake`, `snap`, `tick`, four semantic tints
(`live`/`blocked`/`warn`/`info`), `commit`/`refuse` composites, screen-reader
announcements, motion-token plumbing, trackpad haptics, and a sound cue set.
`globals.css` carries the four `@keyframes`. `juiceCss.test.ts` asserts they
exist. `framebudget.spec.ts` measures the cost at **0.034ms per element** — 15×
inside its own budget.

Its default state:

> *"Both default to OFF here, and that is a decision…"* — `feedback.ts:10`

That was my call in Phase 5: don't impose taste until it's approved. You have now
approved the taste. **The switch has been off this whole time.**

### 0.3 Even switched on, it is wired to almost nothing

Call sites for the entire feel layer, across 62 pages and 22 governed actions:

| File | Lines | What it is |
|---|---|---|
| `pages/Settings.tsx` | 226, 232 | the preview buttons that demo the feature to you |
| `components/command/VerbPanel.tsx` | 102, 111 | command-palette verb execution |
| *(one further call)* | | |

**Two of the five call sites are the feature demonstrating itself in Settings.**
The command palette is the only real surface that reacts to you. Everything
else — every table, every board, every governed write, every AI answer, every
navigation — is silent.

### The one-line diagnosis

> We built the game feel, wired it to one surface, and shipped it disabled.
> The app is not missing a feel layer. It is missing the *wiring* and the *default*.

This is very good news. The most expensive part is done and measured.

---

## 1. THE THEORY — three kinds of motion, and we only have one

Every interface has three motion budgets. Naming them is what turns "add
animations" into engineering.

| | Kind | Answers | Reference | Our state |
|---|---|---|---|---|
| **1** | **Ambient** | "is the system alive / busy?" | status boards | **Oversupplied** (57 instances) |
| **2** | **Consequential** | "did my input land, and what did it do?" | **Rockstar, Nintendo** | **Built, disabled, unwired** |
| **3** | **Continuity** | "how did state get from A to B, and where am I now?" | **Palantir, Bloomberg** | **Absent entirely** |

Kind 3 is the one nobody thinks to build and the one that separates a *tool* from
a *toy*. Right now every state change in LCXOS is a hard cut: a table re-sorts
and rows teleport, a filter applies and the list is simply *different*, a number
updates by replacement, a row opens a detail that appears from nowhere. The
operator has to re-find their place after every action. That is cognitively
expensive and it is the reason a dense tool can feel *hostile* rather than
*commanding*.

### How the reference philosophies actually decompose

Stripping the names down to mechanics we can implement:

- **Rockstar / Nintendo — consequence.** Steve Swink's *Game Feel*: real-time
  control, simulated space, **polish**. The rule is *every input produces an
  immediate, proportional, unmistakable reaction*. Proportional is the hard part:
  a keystroke gets a whisper, a $25k gate gets a vault door. Also — and this is
  the insight most tools miss — **the best game feel lives in failure states.** A
  Dark Souls death and a Rockstar wanted-level are more satisfying than most
  successes. Our refusals are currently a red toast.
- **Palantir / Bloomberg — continuity and density.** Never lose the thread; never
  lose your place; maximum information with zero confusion. Density is not
  clutter when hierarchy is right — and *under*-density reads as a toy. Bloomberg
  is beloved *because* it is dense and fast, not in spite of it.
- **Apple — restraint, materials, physics.** Few things move; the ones that do
  move *correctly*. Spring curves, never linear. Real materials and depth. One
  perfect detail beats ten flourishes. Apple's motion is almost entirely Kind 3.
- **CIA / hedge fund — gravity.** The tool must feel as consequential as the
  decisions. This is the constraint that kills confetti: celebrating a routine
  action *cheapens the real one*. Weight is earned and rationed.

### What "addictive" actually means in a professional tool

You asked for addictive, and I want to be precise rather than flattering,
because the obvious reading of that word would damage this product.

Compulsion in consumer apps comes from variable-ratio reward: streaks, badges,
XP, confetti, unpredictable payoffs. **None of that belongs here.** It would
insult a hedge-fund operator, and per the gravity constraint above it would
actively cheapen real decisions. I will not build it.

Compulsion in *professional* tools — Bloomberg, Vim, Superhuman, Linear,
Raycast, Warp — comes from four different mechanics, all of which are legitimate
and all of which raise real productivity:

1. **Speed as the drug.** Sub-100ms response makes you *want* to take another
   action. Latency is the single largest destroyer of flow. This is why Superhuman
   markets a keystroke budget and why Vim users never leave.
2. **Mastery expression.** The tool gets dramatically faster as you get better,
   and *shows* you getting better. A visible skill ceiling is the pull. Rockstar
   again: skill expression is the compulsion.
3. **Closure into the next action.** The loop finishes and immediately offers the
   next move. No dead ends, no "now what". Superhuman's whole design.
4. **A session that accumulates value.** A working set, a thread of
   investigation, state you'd be sorry to lose — this is what makes you not
   close the window.

Csikszentmihalyi's flow conditions are clear goals, **immediate feedback**, and
challenge/skill balance. Immediate feedback is the thing we disabled.

**So: addiction = speed + mastery + closure. Not rewards.** Conveniently, that is
also almost entirely interaction design and latency work — which is why it fits
the bundle budget below.

---

## 2. THE GOVERNING CONSTRAINT — 1KB

The perf budget is **849/850KB initial**, largest chunk 385/400KB, 109 lazy
chunks. **One kilobyte of headroom.** This is not a footnote; it is the single
most shaping fact about this plan.

| Option | Cost | Verdict |
|---|---|---|
| framer-motion | ~40KB gz | **impossible** |
| GSAP | ~25KB gz | **impossible** |
| any physics/spring lib | 5–15KB | **impossible** |
| CSS animations + custom properties | **0KB JS** | ✅ the spine |
| **View Transitions API** (native) | **0KB** | ✅ solves Kind 3 for free |
| `@starting-style` + `allow-discrete` | **0KB** | ✅ enter/exit without JS |
| Web Animations API (`element.animate`) | **0KB** | ✅ for the dynamic cases |
| a number-tween hook | ~200B | ✅ affordable |

Two consequences worth stating plainly:

- **The entire plan is deliberately built out of native platform primitives.**
  Not as a compromise — View Transitions is genuinely the right tool for Kind 3,
  and it is free. We are a **WKWebView** app on macOS, so we get it.
- **Being a native Mac app is an unfair advantage we are not using.** Real
  macOS vibrancy/materials, real window depth, and **real trackpad haptics**
  (already implemented in `feedback.ts`) are things no web competitor can do.
  Currently we ship a web page in a window.

If a phase below needs headroom, the honest move is a deliberate budget decision
(code-split to create room, or raise the ceiling with eyes open) — not a silent
creep past 850.

---

## 3. THE PROGRAMME

Ordered by **impact ÷ effort**, deliberately. Phase 0 is hours and is the
single largest perceptual change in the whole document.

### PHASE 0 — Turn on what we already own *(hours · ~0KB)*

The highest-ROI work in this plan and almost none of it is new code.

- Flip the juice + haptics defaults **ON**, with a restrained default set.
- Wire `commit`/`refuse` into **all 22 governed actions** via `invokeAction` —
  one choke point, so every write in the product reacts, forever, by
  construction rather than by remembering.
- Wire `flash` into every table row that changes state, every optimistic update,
  every AI answer arrival.
- Keep a real off switch for `prefers-reduced-motion` and for sound (sound stays
  opt-in; motion and haptics become default-on).
- **Ratchet:** a test asserting every registry action routes through the feedback
  path, so surface #23 cannot ship silent.

*Exit criterion: every operator-initiated state change in the product produces a
proportional reaction within one frame.*

### PHASE 1 — The latency floor *(days · ~0KB)*

Speed is the drug. This phase is mostly deletion.

- Instrument **real p95 interaction latency per surface** — the P2 "<100ms"
  claim was measured on reads; verify it holds for the 62 pages and all writes.
- **Optimistic UI on all 22 governed actions**: the row changes *instantly*,
  reconciles on response, and reverts *visibly* (with a refusal reaction) on
  failure. Governance is unaffected — the audit trail is server-side.
- **Kill loading states that have cached data behind them.** Many of the 21
  `animate-pulse` skeletons are showing a spinner over data we already hold. A
  skeleton where a cache exists is a self-inflicted latency lie.
- **Intent prefetch**: hover/focus on a nav item or row prefetches its route
  chunk and data. Back/forward becomes 0ms.
- Budget: **no operator action takes >100ms to acknowledge, ever.**

### PHASE 2 — Continuity, the missing dimension *(days · ~0.2KB)*

Kind 3, almost entirely free via native APIs.

- **View Transitions API** on route changes, so navigation is a *move*, not a cut.
- **Row → detail morph**: the inspector/split pane grows out of the row you
  clicked and returns to it. This is the single most "Palantir" gesture available.
- **Tables reorder by animation**: sort/filter slides rows to new positions
  instead of teleporting them. You keep your place, always.
- **Numbers tween** rather than snap (KPIs, counters, money). ~200 bytes.
- Arrival/exit via `@starting-style` — new rows *arrive*, removed rows *leave*.

*This phase is what will make it feel expensive.*

### PHASE 3 — Consequence, proportioned *(days · ~0KB)*

The Rockstar layer, with the gravity constraint enforced.

- A **significance ladder**, defined once and applied everywhere: keystroke →
  micro-tick; navigation → whisper; read → nothing; write/commit → flash +
  haptic; refusal → shake + named reason; SAT-gated or $25k action → real weight.
- **Make refusals the best-feeling thing in the product.** A blocked governed
  action should land like a vault door: heavy, unambiguous, and it must *name
  what the gate wants instead*. We already carry `remedy` text — it currently
  arrives as a toast. This is the highest-leverage single interaction in the app,
  because refusals are where operators currently feel punished.
- Haptics on commit through the native trackpad — already built, unused.

### PHASE 4 — Liveness: the data is breathing *(days · ~0.5KB)*

Right now the screen is a photograph of the data. It should be a window onto it.

- **Freshness decays visibly.** A figure sourced 6 days ago should *look* older
  than one from 6 minutes ago, continuously, not via a badge. We already grade
  sources (Admiralty) and track freshness — it's currently text.
- **Arrival motion for real events**: new alerts, new leads, monitor fires,
  job completions land with presence instead of appearing on next paint.
- **One honest heartbeat.** A single low-frequency pulse tied to real ingestion,
  not a decorative ticker. Replaces some of the 12 decorative beacons — fewer
  things twitching, but the ones that do mean something.
- **"What changed since you last looked"** as a diff, not a count badge. This is
  the mechanic that makes an operator open the app in the morning.

### PHASE 5 — Mastery made visible *(days · ~0.5KB)*

The legitimate compulsion loop. No badges, no streaks, no XP.

- **Show the operator getting faster.** Keyboard-vs-mouse ratio, actions per
  session, and specifically: *"you did that in 3 keys; the mouse path is 7
  clicks."* Time saved, keystroke economy — the Superhuman mechanic.
- **Progressive disclosure of depth.** The command grammar and chords reveal
  themselves as the operator is ready, rather than all at once in `?`.
- **Personal bests on the daily loop** — not as a game score, as a speedometer.
  The daily triage run has a time. Seeing it drop is the pull.

### PHASE 6 — Gravity and materials: the native pass *(days · ~0KB)*

Where it stops looking like a web page in a window.

- **Real macOS materials** via Tauri window effects: vibrancy, correct
  translucency, proper title-bar integration.
- **A depth model.** What floats, what is pinned, what is underneath. The app is
  currently visually flat, which reads as a document rather than an instrument.
- **Density pass, both directions**: Bloomberg density where data lives (tables,
  boards, ledgers), Apple air where decisions are made (gates, confirms,
  memos). Currently these are treated with the same spacing.
- **A small, expensive-sounding cue set.** Rationed. Sound stays opt-in.

### PHASE 7 — Prove it, or it didn't happen *(days)*

The plan claims productivity. That is measurable, so it must be measured.

- Instrument: time-to-first-action, actions/session, keyboard ratio, p95
  interaction latency, task completion time on the daily loop, return rate.
- Baseline **before** Phase 0 so the delta is real.
- *A 1000x experience claim that isn't in a number is decoration.*

---

## 4. WHAT I WILL NOT BUILD

Stated so it can be held against me:

- **No confetti, streaks, XP, levels, or badges.** Wrong register; insults the
  operator; cheapens real decisions per the gravity constraint.
- **No animation library.** The bundle forbids it and the platform doesn't need it.
- **No motion that adds latency.** Any animation that delays an acknowledgement
  is a regression, not a feature. Reactions overlap work; they never gate it.
- **No celebration on routine actions.** Weight is rationed or it is worthless.
- **No new panels or features.** Your constraint, and I agree with it — the
  entire document above is about the surfaces that already exist.

---

## 5. SEQUENCING RECOMMENDATION

Phase 0 first and on its own, shipped and lived with for a day. It is hours of
work, it is nearly free, and it will change the feel of the product more than
anything else in this document. Everything after it should be judged against
that new baseline rather than against today's.

Then **1 → 2 → 3** as the core of the programme: speed, continuity, consequence.
That trio *is* the 1000x. Phases 4–6 are amplifiers. Phase 7 runs alongside from
the start, because the baseline has to be captured before Phase 0 lands.
