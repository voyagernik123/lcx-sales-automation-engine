# LCX TERMINAL — THE SHIP PLAN
**The final plan. From “seven phases shipped” to “Monty and Sam use this on Monday.”**

**Date:** 2026-07-25 · **Prepared for:** Nik (LCX) · **Supersedes:** nothing — it *completes* `LCX_TERMINAL_PLAN.md`
**Execution contract:** maximum rigor, depth, precision. Time is not a constraint. Build → full gate (lint · type-check · emit builds `shared→api→web` · tests · perf budget · e2e) → verify on the running app → one push per phase → **your approval before the next**.

---

## 0. WHY THIS DOCUMENT EXISTS

`LCX_TERMINAL_PLAN.md` §8 records all seven phases as **SHIPPED**, with commits. That is true. It is also incomplete in a way that matters, and the two facts sitting side by side are the reason for this plan:

> **A phase shipping is not the same as a phase being delivered.** Each phase shipped its *centrepiece* and left named items unbuilt. Nobody hid it — every phase ledger entry is honest about what it cut — but the residue was never collected in one place, so “all seven phases are done” became sayable while six plan items had never been written at all.

Two audits collected that residue into **Table 1** (31 items that are mine) and **Table 2** (11 that only you can do). This document reconciles those tables against the seven phases, and turns what remains into an ordered plan whose finish line is not “Phase 7 complete” but **three people using the instrument every day**.

**State as of this document:** 10 of Table 1 shipped today, 1 withdrawn, 20 open. 1 of Table 2 closed, 10 open. CI is green on both jobs for the first time in the project’s history (`4ace36a`), after five red runs that each found a real defect while 1,083 tests were green locally.

---

## 1. THE RECONCILIATION — seven phases × forty-two items

Every open item, mapped to the phase that promised it. This is the table to argue with; everything after it follows mechanically.

| Phase | Centrepiece — shipped | What it left, and where that item now lives |
|---|---|---|
| **P1** The Shell | `LCX TERMINAL.app`, Tauri v2, ⌥Space, Keychain, DMG + signed updater | **T2 #2** Apple cert · **T2 #6** install on 2 Macs · **T2 #7** nobody has hand-driven the packaged app |
| **P2** The Speed Floor | Two-metric SLO, opaque read cache, offline read-only. *SQLite cut with reason; p95 gate not independently verified* | **T1 #22** cache age never shown — `storedAt` has zero consumers, so cached is indistinguishable from live · **T1 #23** `ui_settle_p95` is a second copy of paint, so its claim is false |
| **P3** The Grammar | ⌘K generated from the registry; 22 actions in a committed manifest; two live security defects found and fixed | **T1 #27** drift test misses 3 mutation classes · **T1 #28** `command_reopen_decision` has no invoker anywhere |
| **P4** The Motion Model | One Escape owner (`lib/dismiss.ts`), roving tabindex, `g`+digit, focus made visible. **T1 #10 `f` hints shipped today** | **T1 #11** “one tab stop” true on 1 of 16 tables · **T1 #12** ⌘\ split view · **T1 #13** two modes + indicator · **T1 #14** Space navigates instead of peeking, two handlers per press · **T1 #30** the keyboard day-in-the-life gate was never run |
| **P5** The Feel | Juice layer, rationed overshoot, sound + haptics off by default, the Jobs pass, the frame-budget spec | **T1 #18** count roll-ups · **T1 #25** overshoot regex evaded by `.lift:hover` — the exact case its own comment forbids · **T1 #26** `--t-hover` has zero consumers; 31 `duration-*` + 38 `transition-all` remain · **T1 #29** Jobs leftovers · **T1 #31** the before/after gate was never run |
| **P6** The Teacher | `?` living manual generated from the registry; the nudge engine (mostly rules about staying quiet); cheat card | **T1 #19** first-run tour · **T1 #20** practice range · **T1 #21** spaced-repetition coach · **T1 #24** cheat-card ratchet cannot detect a rebound chord · **T2 #8** the cold-start gate was never run |
| **P7** The Audit | **T1 #1 #2 #3 #5 #6 #7 #8 #16 #17 shipped today**; #4 withdrawn | **T1 #9** sign-out leaves the read cache on disk, and the quickstart claimed otherwise · **T1 #15** 2 of 4 modals still don’t register with the dismiss stack — Escape dead |
| — | — | **T2 #3** Render region (~150ms/request) · **T2 #4** the SQL paste · **T2 #5** release-channel decision · **T2 #9** haptics confirmation · **T2 #10 #11** two taste calls |

**What this reconciliation reveals**, and it changes the plan’s shape: the open items are not evenly distributed by *importance*. Sorted by what a new operator actually collides with, the list collapses hard. Two dead Escapes, a Space-key collision, three tables that ignore arrows, and cached numbers that look live — that is **under two days of work** and it is nearly everything standing between today and handover. The remaining eighteen items are a five-day teaching build-out, two features awaiting your taste, and six ratchets that cannot currently catch their own regression.

---

## 1b. AMENDMENT, 2026-07-25 — ONE TESTER, NO CERT, SHARE AT THE END

Recorded rather than quietly folded in, because it reverses one of this document's own
recommendations.

Nik's decision, mid-Phase-B: **he is the only tester.** Monty and Sam get nothing until the
whole programme is built end to end, and then they get a link (or a one-line command). And
**the Apple Developer cert is not being bought now.**

**What moves.** T2 #6 (install on two Macs) and T2 #8 (the cold-start test) leave Phases B
and C and become the **final gate before sharing**. T2 #2 (the cert) is deferred
indefinitely — ad-hoc signing stays.

**What deferring the cert costs, stated because it lands on the one person testing:**
right-click→Open once per Mac, and a **Keychain prompt after every self-update**, because
macOS keys Keychain ACLs to the code signature and an ad-hoc signature changes on every
build. During a phase of repeated update testing that prompt appears every time. Annoying,
not blocking.

**THE REVERSAL.** §4 Phase F and §2 both argue for considering Phase E (tour, practice
range, coach) **cut**, on the grounds that five days of teaching machinery rested on an
untested assumption. **That argument depended on Nik onboarding them in person, and he is
not going to.** Sam and Monty will arrive completely cold, with no walkthrough, on a
finished build. That is exactly the situation the teaching layer exists for, and the
practice range gains value it did not have before: it is how they learn without touching
production, which matters far more when nobody is sitting next to them.

**So Phase E is now BUILD, not decide.** The recommendation is withdrawn.

**And Phase C loses its decision gate**, which has to be said plainly rather than left as a
dangling promise: the cold start was going to decide Phase E, and it now happens after
everything is built. Two things partly replace it. #30 and #31 still run in Phase C — one is
a script, the other is Nik's judgment, and neither needs a stranger. And **the nudge engine
is already instrumenting the one tester**: Settings → "these you still reach for with the
mouse" records which capabilities never get adopted, which is the direct input the
spaced-repetition coach needs and partial evidence for what the tour should teach. That is
not a cold start and is not claimed to be one.

**Never tested and now on the critical path:** Gatekeeper treats a *downloaded* DMG
differently from a locally built one — the quarantine attribute. Right-click→Open is
expected to handle it. To be confirmed on a real download from the real URL, not assumed.

**A SECOND MAC CHANGES WHAT PHASE B CAN PROVE.** Nik has a personal MacBook that has never
seen the app, which makes Phase B's gate fully runnable today rather than partially:
a **downloaded** DMG (quarantine attribute and all) onto a genuinely clean machine → launch
→ sign in → one governed action in the audit log with the right actor → self-update to a
newer build with the new version visible afterwards. Every step of that was previously
either unrunnable or reduced to a locally-built approximation.

**What it does NOT establish, and the distinction is the whole point.** It is a fresh
MACHINE, not a fresh OPERATOR. T2 #8 asks whether someone who has never seen the platform
can complete a governed task unaided in ten minutes; Nik has seen every surface. So this
proves INSTALLATION thoroughly and proves nothing about LEARNING. Letting it count for #8
would be laundering a machine test as a human test — which is the same move as a passing
Chromium test being offered as evidence about a WebKit-only defect, and that one cost this
programme a full verification cycle. #8 still needs a different person, at the end, before
the link goes out.

## 2. THE ONE QUESTION THAT ORDERS EVERYTHING

Not *“what is left in the plan?”* — that question produced a 31-row list with a 10-day tail and no ordering principle. The question is:

> **What stands between today and Monty and Sam opening this instrument on Monday and getting real work done in it?**

Answering that honestly reorders the whole remainder, and it demotes the most expensive items in the plan:

- The **first-run tour** (2 days), the **practice range** (2 days) and the **spaced-repetition coach** (1 day) are five days of teaching machinery built on an assumption nobody has tested — that a cold operator cannot get productive with the `?` manual and the nudge engine that already shipped. **T2 #8 is the experiment that settles it, and it costs one afternoon and one human.** Building five days of teaching before running it is the single largest avoidable risk in the remainder.
- **Two modes + a mode indicator** (T1 #13) is the one item in the entire programme I will argue against building. See §4, Phase F.

So this plan front-loads handover, makes the expensive work **conditional on evidence**, and treats the never-run gates as decision instruments rather than paperwork.

---

## 3. WHAT IS DELIBERATELY NOT IN THIS PLAN

Stated up front, because a plan that quietly omits things is how the last one accumulated a 31-item residue.

| Not doing | Why |
|---|---|
| **SQLite local read model** | Cut in P2 with a judged design panel; the opaque response cache captured nearly all the win. The bottleneck is round-trips, not local query capability. Revisiting it needs a new reason, not a revived plan line. |
| **Making prod self-migrating** | `migrate()` now has a CLI entry and CI is its first real caller. Wiring it into deploy is a *different* change: forward-only, no locking, applying DDL on every instance start races itself the moment there are two instances. |
| **Hash-chaining `audit_log`** | Append-only by convention. A real integrity chain is a governance project with a key-management story, not a phase item. Recorded so nobody re-reads P2’s corrected comment as a TODO. |
| **Closing T1 #4 (identity re-verification)** | Withdrawn, not deferred. The desk passcode is shared **by design**, so operator B presenting A’s credential resolves to A and any client-side check compares A against A. It needs a per-person secret — a product decision, not a bug fix. The honest next step is a “you are signed in as A — not you?” prompt, which is Phase F if you want it. |
| **A pre-push hook** | CI is the backstop now. A hook that developers `--no-verify` past is theatre; if the gate needs enforcing harder than CI, that is a branch-protection setting, which is yours. |
| **Dark patterns of any kind** | Carried verbatim from the original plan’s standing rules. Speed, mastery and closure — never streaks, variable rewards or manufactured urgency. |

---

## 4. THE PLAN — SIX PHASES, TWO OF THEM CONDITIONAL

Each phase states: **intent**, the **items** it closes with their ledger numbers, the **gate** that proves it, **what only you can do**, and — new in this plan, because of what this session taught — the **verification method**, since “the tests pass” has now been demonstrated three times to be compatible with the feature doing nothing.

---

### PHASE A — SAFE TO HAND OVER
*Nothing a new operator hits in their first hour is broken, dead, or lying.*

**Intent.** Every item here is something Monty or Sam collides with in normal use, not an edge case. Two of them are silent, which is worse than broken: a modal whose Escape does nothing teaches that Escape is unreliable everywhere, and a cached number that looks live gets used in a decision.

| # | Item | Size |
|---|---|---|
| T1 #15 | `DistributionCampaigns` and `AccessControl` never register with `lib/dismiss.ts` — Escape is dead on both. P4 built one Escape owner; 2 of 4 modals still bypass it | 30m |
| T1 #14 | `Space` navigates instead of peeking while `TriageBar` advertises peek, and **two handlers fire on one press** because `BdPipeline`’s document listener ignores `defaultPrevented` | 30m |
| T1 #11 | “A list is ONE tab stop” is true on **1 of 16 tables**. `ProductGrid`, `CompetitorGrid` and `ProductMatrix` hard-code per-row `tabIndex={0}` at 3 sites and ignore arrows entirely — so `⇥` walks every row | 3h |
| T1 #22 | Cache age never shown. `storedAt` and `peek()` have **zero consumers**, so a cached read is visually identical to a live one, and the offline banner is the only signal | 3h |
| T1 #9 | Sign-out leaves the read cache on disk — the page navigates away before the IndexedDB clear commits. Namespaced per operator so **not** inheritable, but `TERMINAL_QUICKSTART.md` claimed it was cleared | 1h |
| T1 #28 | `command_reopen_decision` is a governed action with no invoker anywhere — the one genuinely dead capability in the registry | 30m |

**Why #22 is in the *handover* phase and not the hygiene one.** Its size says 3h and its consequence says something else. Three people share this desk, the API is behind a 165–195ms floor so the cache is doing real work, and the decisions being made have money attached. A number that cannot be distinguished from live is the highest-consequence honesty gap left in the product. It ships before anyone else touches the app.

**Gate.** A scripted pass, on the packaged app, asserting: every modal in the app closes on one Escape and appears in `?`’s Escape section; every ranked table takes `↑↓`/`Home`/`End` and is one tab stop; every value served from cache carries an age affordance; and `TERMINAL_QUICKSTART.md`’s cache claim is either true or corrected. A test asserts the dismiss-stack registration is **complete** — enumerate the modals, not spot-check them, or #15 recurs the next time someone adds one.

**Verification method.** For #14 and #15, the assertion must be that a *page-level* handler does not see the key — the same shape as the `f`-hint fix, where `preventDefault()` on a document bubble listener did nothing to `BdPipeline`’s verbs bound on `window`. Mutation-prove each: remove the registration, watch the test go red, restore.

**You:** nothing. **Effort:** ~1.5 days.

---

### PHASE B — HAND IT OVER
*The app installs, updates, and stops lying at launch.*

**Intent.** Self-update cannot work at all today: the updater points at `releases/latest/download/latest.json` on a **private** repo, GitHub rejects unauthenticated downloads of private release assets, and the updater sends no credentials. So `check()` throws on every launch. This phase makes distribution real.

> **A correction to this document, made while starting the phase it describes.** The paragraph above originally said the failure "shows a warning toast … the first thing a new operator sees." **That is false, and was false when I wrote it.** The launch check is `checkForUpdate(false, …)` and the catch block notifies only `if (interactive)` (`apps/web/src/lib/terminal.ts:207-215`), so a launch failure goes to the shell log and shows nothing. It *did* toast once; a later phase silenced it deliberately, for the reason that a warning nobody can act on trains operators to ignore the layer the governance refusals use. I carried the stale sentence out of `TERMINAL_QUICKSTART.md:22` without reading the code — in the document that sets the rule against doing that (§6 rule 8). Both are now corrected. The real cost of the current design is the opposite of what I claimed: a desk that has silently stopped updating looks **identical** to one that is current, which is why the phase gate below insists on a genuine version-to-version update rather than an absent toast.

| # | Item | Owner | Size |
|---|---|---|---|
| **T2 #5** | **Decide the release channel** — public repo, or an authenticated endpoint. Self-update is *impossible* from a private repo: the updater sends no credentials and `latest.json` 404s today. **Verified the shipped bundle contains no secrets** — only `VITE_APP_TITLE` and the API URL — so this is an IP call, not a security one | **you** | a decision |
| — | Cut a real release against the chosen channel, publish `latest.json`, verify a genuine version-to-version self-update, and remove the every-launch warning | me | 1d |
| **T2 #4** | Paste the 5-step SQL. **0045 is now proven to apply**, not merely written — all 46 migrations ran against both an empty scratch database and a fresh CI-shaped one. Until it lands, T1 #2’s replay protection fails open on prod and stamps `idempotencyDegraded` | **you** | 10m |
| **T2 #2** | Apple Developer cert (~$99/yr, Account Holder only) — removes right-click→Open per Mac **and** a Keychain prompt after every self-update, because ACLs key on the code signature. Parallel; nothing blocks on it | **you** | procurement |
| **T2 #6** | Install on Monty’s and Sam’s Macs | **you** | 30m |
| **T2 #7** | Hand-drive the packaged DMG — ⌘W, ⌘R, a killed webview, both update toasts. Four P7 fixes are compile-verified and reasoned from source, never pressed. Screen capture and accessibility scripting were unavailable to me all session | **you** | 30m |

**Gate — the one that actually means “shipped”.** A DMG **downloaded** (not built locally — Gatekeeper treats those differently, and that distinction has never been tested) installs on a Mac that has never seen the app, launches, signs in, performs one real governed action that appears in the audit log with the right actor, and then **self-updates to a genuinely newer build, with the new version number visible in the running app afterwards.**

> **Second correction to this gate.** It originally demanded the update land "with no warning toast and no manual step". That contradicts T1 #8, shipped in this programme: installs are gated behind an explicit notice action **on purpose**, because the macOS installer `remove_dir_all`s the running `.app` before renaming, so an unattended install that fails the rename can leave NO bundle on disk. **Exactly one deliberate click is the correct behaviour, not a defect.** What must be absent is a *failure* toast; what must be present is the consent step. A gate that demanded zero clicks would have failed the app for having the safety property.

**You:** #5 first — it blocks the rest of the phase. Then #4, #6, #7; #2 whenever. **Effort:** ~1 day mine, gated on your decision.

---

### PHASE C — LEARN FROM REAL USE
*Run the three gates that were never run, and let the results decide what gets built.*

**Intent.** This is the decision phase, not a checkpoint. Three of the original plan’s gates were never executed, and one of them — the cold start — is the only evidence that would justify or kill five days of Phase E.

| # | Item | Size |
|---|---|---|
| T1 #30 | **P4’s gate:** a scripted keyboard-only day-in-the-life — triage the desk, decide a gated decision, record an RFI, advance a listing, launch a campaign through its gate — completed without touching the trackpad. Depends on Phase A’s #11/#14/#15 | 3h |
| T1 #31 | **P5’s gate:** a side-by-side before/after of five key surfaces, for your judgment. The Jobs pass has never been shown to you | 2h |
| **T2 #8** | **P6’s gate, and the decision instrument:** someone who has never seen the platform completes a real governed task, unaided, within 10 minutes of first launch | **you** — needs one human |

**The gate is a decision, and I am naming the rule in advance so the result cannot be rationalised afterwards:**

- **Cold start succeeds** → Phase E is **cut**. The `?` manual and the nudge engine are sufficient, and five days go to Phase D and F instead. I will say so plainly and not build the tour.
- **Cold start fails** → the *transcript of where they got stuck* becomes Phase E’s specification. Not the plan’s guess at what teaching is needed — the actual failure. This is strictly better than building from the original plan text, which was written before anyone had used the thing.
- **Cold start is ambiguous** (finishes, but slowly or with one hint) → build **#21 the coach only**, skip the tour and the practice range. The coach is the cheapest of the three and the only one that helps an operator who is already working.

**You:** find one person who has never seen it — not Monty or Sam if they have already been shown anything, which is why #6 and #8 have an ordering constraint worth respecting. **Effort:** ~1 day mine, one afternoon yours.

---

### PHASE D — THE RATCHETS THAT CANNOT FAIL
*This programme’s signature defect is a true-sounding claim about code that does something else. Six of our ratchets cannot currently catch their own regression.*

**Intent.** Named honestly: this phase buys no features. It buys the ability to trust the next twelve months of green checkmarks. The case for it is the evidence, not the principle — in this session alone, a 16-case idempotency suite was green while the feature had never once executed on a real request; a focus utility shipped applied at zero sites and was purged; a contrast claim was literally unassertable because the helper only matched a different token syntax; and a test pinned floating-point `Math.log` output so it passed on exactly one machine.

| # | Item | Size |
|---|---|---|
| T1 #23 | `ui_settle_p95` is a **second copy of paint** — `AppLayout:59,65` register both `afterPaint` back-to-back, so both fire next frame. Exposure is zero today because paint is equally read-independent, but `slo.ts:169`’s claim is false, and the two-metric design exists precisely to stop the headline p95 improving as the desk gets slower | 2h |
| T1 #24 | The cheat-card ratchet **cannot detect a rebound chord** — flip the modifier on all 24 webview presses and 24/24 still validate, because only the `nativeMenu` branch reads `press.mod` | 1h |
| T1 #25 | The overshoot-ration regex matches only simple lowercase class selectors; `.lift:hover`, `button`, `#nav`, `[data-open]`, `.Panel` all evade it — and `.lift:hover` is **the exact case the adjacent comment forbids** | 30m |
| T1 #26 | `--t-hover` has **zero consumers**; 31 ad-hoc `duration-*` and 38 `transition-all` remain. “One motion vocabulary” is undelivered for transitions, and it is the root cause of the focus ring animating over 300ms in two places | 3h |
| T1 #27 | The manifest drift test misses 3 mutation classes — adding `.refine`, adding `.superRefine`, **removing** a `.refine`, and a replaced `execute` body. 10 of 13 caught | 1h |
| T1 #29 | Jobs-pass leftovers: 183px of chrome in 5 bands above the BD table; `ui/Panel` has zero consumers **and** a `max-height: 2000px` that will clip when someone finds it; `SendQueue` never passed | 4h |
| — | The `text-cyan-500` sweep — **57 sites at 2.43:1**, which fails the text floor *and* the 3:1 icon floor, a dozen of them rendering glyphs. Plus a source-scanning ratchet, because the token-based contrast suite structurally cannot cover Tailwind-scale classes | 4h |
| — | Pin the Node version. `engines` says `">=20"`, a range; CI runs 20, this laptop runs 22. **Check what Render runs first** — aligning CI to the laptop would trade a test bug for a prod/CI mismatch | 1h |

**Gate.** Every ratchet in this phase is **mutation-proven**: break the thing it guards, watch it go red, restore, and record the failure message in the commit. A ratchet that has never been seen to fail is a comment.

**You:** nothing, except telling me which major Node Render runs if it is not discoverable in-repo. **Effort:** ~2 days.

---

### PHASE E — TEACHING · **CONDITIONAL ON PHASE C**
*Built only if the cold start says it is needed, and specified by how it failed.*

| # | Item | Size |
|---|---|---|
| T1 #19 | Per-persona first-run, generated from entitlements, 6–8 min, hands-on, no video, no wall of text | 2d |
| T1 #20 | The practice range — a sandbox with realistic fake objects where every gate and every mistake is safe. Nobody learns on prod | 2d |
| T1 #21 | Spaced-repetition shortcut coach, timed to actual usage | 1d |
| T1 #18 | Count roll-ups — the last unbuilt piece of the P5 juice layer, and a teaching affordance as much as a feel one | 2h |

**Gate.** A **second** cold start, with a different person. The first one specified this phase; only a fresh pair of eyes can tell you it worked. If Phase C succeeded and this phase is cut, that decision gets recorded in the ledger with the transcript that justified it — so “we skipped the tour” is a finding, not an omission.

**You:** a second human, only if this phase runs. **Effort:** ~5 days, or zero.

---

### PHASE F — THE LAST TWO FEATURES · **CONDITIONAL ON YOUR TASTE**

| # | Item | Size |
|---|---|---|
| T1 #12 | `⌘\` split view. **T2 #10 is your call**; the plan’s default is “decision left, evidence right” and I will build that unless you say otherwise | 1d |
| T1 #13 | Two modes + a persistent mode indicator | 1d |
| — | Optional: the “you are signed in as A — not you?” front-door prompt, which is the honest remnant of withdrawn T1 #4 | 4h |

**My recommendation, and it is to cut one of them.** **T1 #13 — two modes — is the one item in this entire programme I would argue against building**, and I would rather say so than build it silently.

The original plan called for a normal/insert distinction, “vim-shaped but discoverable”. Three things have changed since that was written, all of them measured:

1. The `f` hint layer now makes **every control on every screen** reachable without a mode, including screens built later. That was the problem modes were going to solve.
2. ⌘K reaches every governed action in the registry in under five seconds from anywhere. That was the other problem.
3. This app binds bare letters that **mutate records** — `s` snoozes, `d` disqualifies. P4 already retired WASD for exactly this reason, and the `f` layer shipped today with a bug where a fumbled tag could open the disqualify dialog on a real lead. A modal grammar layered over live single-letter verbs is that same hazard with a persistent state variable attached.

A mode indicator is a permanent tax on the operator’s attention — *which mode am I in?* — paid on every glance, in exchange for a speed gain the two mechanisms above already deliver. For a three-person decision tool, I do not think that trade is worth it. **Your call; if you want it, I will build it properly and stop arguing.**

**You:** T2 #10 (split-view layout), T2 #11 (sound/haptics default — sample buttons are in Settings → The Feel), T2 #9 (confirm haptics fire, which needs a fingertip on a Force Touch trackpad and no test can prove). **Effort:** ~2 days.

---

## 5. THE CRITICAL PATH

```
        ┌── A ── safe to hand over ────────────── 1.5d ── me
        │
        ├── B ── hand it over ──────────────────  1d   ── me + YOUR #5 decision, #4 SQL, #6 install, #7 hand-drive
        │        └─ GATE: downloaded DMG installs, signs in, acts, self-updates
        │
        ├── C ── learn from real use ───────────── 1d   ── me + YOUR one human
        │        └─ DECISION GATE: cold start decides whether E exists
        │
        ├── D ── ratchets that cannot fail ────── 2d   ── me
        │
        ├── E ── teaching ─────────────── 5d or 0d ──── conditional on C
        │
        └── F ── last two features ────── 2d or 1d ──── conditional on your taste (I recommend cutting #13)
```

**To shipped-and-honest: A + B + C + D = ~5.5 days of mine**, plus roughly two hours of yours spread across a decision, a SQL paste, two installs and one hand-drive.
**Everything after that is discretionary, and Phase C tells us which parts are real.**

**What Monday looks like if we run A and B and stop there:** Monty and Sam have the app installed. It launches without a warning. Escape works everywhere, every table takes arrows, and no number lies about being live. Governed writes are replay-protected on prod. Nothing they touch in the first hour is broken. That is a shippable instrument, four days from now, and Phases C–F make it better rather than making it work.

---

## 6. STANDING RULES

Carried from `LCX_TERMINAL_PLAN.md` §5, plus five earned this session.

1. **The gate includes the real emit builds** — `shared → api → web`, in Docker order, plus the Tauri bundle. Never just vitest. The root `build` script **skips api**, which has let api type errors reach Render before.
2. **Keyless-first.** Ad-hoc signing until the Apple cert exists; nothing blocks on procurement.
3. **Governance is not negotiable.** Every write goes through `invokeAction` — audited, attributed, gated. The command line is a faster mouth, not a new door.
4. **No dark patterns.** Speed, mastery and closure. Never streak-guilt, variable rewards or manufactured urgency.
5. **The trackpad stays first-class.** Keyboard-first, never keyboard-only.
6. **One push per phase**, verified on the running app, with your approval before the next.
7. **The web build stays alive** as the dev loop and a fallback surface.
8. **NEW — mutation-test the wire, not the mechanism.** A fix is not done when its unit test passes. It is done when a test **fails** after you delete the line connecting it to the app. Earned from a 16-case idempotency suite that was green while the feature had never executed on a real request.
9. **NEW — a test may not depend on its environment.** No borrowing `projects[0]` from whatever the database happens to hold; no pinning floating-point output; no asserting a set that a different libm computes differently. Arrange the fixture or derive the assertion.
10. **NEW — never buy green by proving less.** When a check fails because the environment lacks something, the default is to *give the environment what it lacks*, not to narrow the check. CI got a real Postgres and a build step for exactly this reason.
11. **NEW — a run's colour is looked at, never inferred.** `npm run gate` passing locally does not predict CI, and the reason is structural: **the local database is seeded and CI's is empty by design.** Reproduce it — `createdb probe && DATABASE_URL=…/probe npm run migrate` gives 100 tables and 0 rows — then run the suite against that. Earned by reporting a red run as green and, worse, by not noticing that a red test job makes the `playwright` job report `skipped`, so **one failure hides the entire e2e ratchet**. Note also that the test which broke this violated **rule 9, which I had already written** — a rule in a document stops nothing on its own; only the check that fails does.
12. **NEW — withdrawing a claim is a deliverable.** Six claims have now been withdrawn or narrowed across this programme, and every one was an improvement. Narrowing a sentence beats inflating the code, especially at the end of a long session.

---

## 7. WHAT I NEED FROM YOU, IN ORDER

| When | What | Cost |
|---|---|---|
| **Now** | Approve this plan, or tell me what to reorder | — |
| **Before Phase B** | **T2 #5** — the release-channel decision. It blocks the phase | a decision |
| During Phase B | **T2 #4** — the 5-step SQL. Guided, idempotent, `0045` proven to apply | 10 min |
| During Phase B | **T2 #6 #7** — install on two Macs, hand-drive the DMG | 1 hour |
| Before Phase C’s gate | **T2 #8** — one human who has never seen the app | one afternoon |
| Before Phase F | **T2 #10 #11** — split-view layout, sound/haptics default. And tell me whether you want **#13 two modes**, which I recommend cutting | two taste calls |
| Whenever | **T2 #2** Apple cert · **T2 #3** Render region (~150ms/request) · **T2 #9** confirm haptics fire | parallel |

---

## 8. WHAT “DONE” MEANS IN THIS PLAN

Not “Phase F is complete.” The original plan’s §7 described the feeling; this one states the test:

> **Monty opens LCX TERMINAL on his own Mac, on a Monday, having been shown nothing. Within ten minutes he has completed a real governed action that appears in the audit log attributed to him. He does it again on Tuesday without asking anyone a question. Nothing he touches lies to him about whether a number is live, whether a write landed, or whether Escape will work.**

That is the finish line. It is reachable at the end of Phase C, and Phases D–F are how the instrument gets better after it already works.

---

*Approval requested. Phase by phase, as agreed — I will not start Phase B until you have approved Phase A’s result.*


---

## 9. PHASE LEDGER — what each phase actually cost and found

Written after the fact, from the commit log, because an estimate that is never compared to an
outcome teaches nothing.

| Phase | Shipped | Wall-clock | The finding the plan did not anticipate |
|---|---|---|---|
| pre | `17cf731`…`cd28784` | ~1h | CI had **never run**. Five red runs, each a real defect: no database on the runner; `migrate()` with **zero callers** across 46 SQL files; a test borrowing `projects[0]` from a 54k-row dev database; a test pinning floating-point `Math.log` output; an e2e job that never built |
| **A** | `62339f3` | ~50m | **The BD queue had two cursors, one invisible.** `s`/`d`/`e` read `selectedId` while the focus ring followed `useListNavigation` — arrow to row 2, press `d`, and the disqualify dialog opened for **row 1**. Fixing only the guard the ledger asked for would have made it worse |
| **B** | `4f4b783`…`a647475` | ~1h40 | **Every release shipped pointing at `localhost:8791`.** Three signed builds that could never work on any machine but mine, and I misdiagnosed it three times from evidence gathered on the wrong side. Four silent-failure guards exist because of it |
| **C** | `4c14e5d` | ~2h | **⌘K reached 7 of 22 governed actions**, so Phase 3's gate was false — its coverage test passed by checking the registry against itself. Also: 69 presses to triage one lead |
| **D** | `f16040b` | ~1h | **Three of four agents found their own brand-new guard was a decoration.** A regex that could never match; an assertion satisfied by a parameter list; a positive control with its own copy of the regexes. Plus `ui_settle_p95` was a byte-for-byte copy of paint |
| **C-fix + E** | `406a8ed` | ~2h | ⌘K **7 → 20 of 22**. A dialog that silently discarded everything typed into it, with a **second** defect underneath. The e2e suite **required** an absent API rather than tolerating one — 56 of 73 specs failed with a real one reachable |
| **F** | see commit | — | **The docked pane does not follow the cursor, and the arrows were never structurally scoped.** Two true-sounding sentences in the shipped comments, both refuted by measurement (a request log in Chromium; a guard deleted and watched). Plus a live defect the tests could not see because every overlay case was pressed from the undocked side: `⌘\` **undocked behind the `?` manual's scrim** |

**Every single gate found something the plan did not know about.** That is the finding about the
findings, and it is the reason §4's briefs insist a gate is not a formality.

**AND THE LEDGER ITSELF CONTAINED A FALSE CLAIM, which is the last thing to go in it.** I recorded
"CI green" for the C-fix + E row without opening the run. It was **red**, and had been since Phase
D. Because the `playwright` job `needs:` the test job, the two runs after D report
`playwright: skipped` — so the e2e ratchet, the thing Phase A existed to resurrect, **had not
executed in CI at all** while this document called the suite enforcing. Cause: one api test
asserted on whatever the developer's database happened to contain, and CI's Postgres is migrated
and **empty by design**; two neighbouring tests said `if (!g) return` and had been passing while
asserting nothing. Fixed in `8aa14f1`, and the fix was proven by reproducing CI's condition on
this machine — `createdb` + `npm run migrate` → 100 tables, 0 rows — where the previous version of
the file produced CI's message character for character. Reading the test had not found it. The
rule this adds to §6: **a run's colour is a thing you look at, not a thing you infer from a local
gate.** The local database is seeded; CI's is empty; a green `npm run gate` predicts neither.

**AND THE FIRST THING THE REVIVED E2E JOB DID WAS FIND A GOVERNED WRITE REACHABLE BY A BARE
ARROW.** With the test job green, `playwright` ran for the first time since Phase C and failed on
`keyboardday.spec.ts:903` — `three ArrowDowns produced a governed write`, naming
`dist_listing_set_status`. The assertion had been passing on this Mac for two phases because
**macOS was satisfying it instead of our code**: Chrome and WKWebView open a select's popup on an
arrow and fire `change` only on commit, while Linux advances the selection immediately. So on any
Windows or Linux browser reaching the web fallback, Tab-ing into Listing Ops and arrowing once
advanced a real listing's status — audited, attributed, unconfirmed. Fixed in `861a504` by making
arrow traversal *stage* and requiring ↵ (macOS's own model, made platform-independent), with the
staged value labelled on screen. **This is the strongest argument in the document for why a
ratchet must actually execute**: the spec was correct, committed, and useless for two phases, and
the defect it was written for was live the whole time.

**GREEN, ON BOTH JOBS, VERIFIED BY LOOKING: run `30176121615` on `b20a2c5`.** 35 api files / 306
tests · 80 web files / 961 tests · perf budget 846/850KB · playwright **78 passed / 1 skipped**.
The line worth keeping from that run's log is CI reporting on its own platform:

```
[keyboard-day] arrow moves the displayed selection on this engine: yes (staged)
```

That is Linux — the engine where the bare arrow used to write — confirming the value now *stages*
and the assertion proves the invariant rather than the operating system. Three red runs were
needed to get here (`8aa14f1` fixed the seeded-DB dependency; `861a504` fixed the governed write;
`b20a2c5` corrected the assertion that had pinned the platform), and each one was a real defect.

## 10. THE CLAIMS WITHDRAWN, IN ONE PLACE

Twelve, and this document contains two of them. Kept together because the programme's signature
defect is not broken code — it is a true-sounding sentence about code that does something else.

1. "The app shows a warning toast every launch" — it does not, and had not for a phase. I carried
   it out of the quickstart into **this document**, whose §6 rule 8 forbids exactly that.
2. "The update should land with no manual step" — contradicted T1 #8. One deliberate click is the
   safety property, not a defect.
3. "`?` works in any dialog" — the command line autofocuses, so `?` is a character there.
4. "Outlines survive an `overflow: hidden` ancestor" — they do not; proven with pixels.
5. "`audit_log` is hash-chained" — it is not; append-only by convention.
6. "The Keychain replaces localStorage" — both are written; localStorage is what is read.
7. "Operator B stops inheriting A's session" (T1 #4) — not deliverable client-side; the desk
   passcode is shared by design. **Withdrawn, not deferred.**
8. "One motion vocabulary replaced the ad-hoc durations" — written in the past tense while
   `--t-hover` had zero consumers.
9. "The subject-type mismatch is now structurally impossible" — **an agent refused this one of
   mine**, proving `subjectTypes: string[]` accepts a typo silently. The honest claim is "caught
   loudly in both directions."
10. "Docked, the same work is `Space` then `j` `j` `j` — the pane follows the cursor row" (T1 #12)
   — it does not. `move()` sets the selection and nothing else; only `Space`, `↵` and a click
   peek. Measured in Chromium off the pane's own `/v1/projects/:id` request log: `j` asks for
   nothing and the pane keeps showing the previous lead. Every row is still one `Space`, and the
   leftover mismatch — evidence for one lead beside a disqualify dialog naming another — is now
   named in `lib/split.ts` instead of denied.
11. "The arrows need no guard at all — `useListNavigation` binds them on the container, so a
   keypress with focus in the pane never reaches it" (T1 #12) — true of the hook, irrelevant to
   the surface: `BdPipeline` does not use it and handles `↑`/`↓` on its own `window` listener.
   The arrows are pane-scoped by `keysBelongToSurface()`, exactly like the letters. Proven by
   deleting the guard and watching the arrow assertion go red with the three verb assertions.

12. "Bubbling gives the innermost interested element the first claim — **it calls
   `stopPropagation`**, so the key never reaches us" (`lib/dismiss.ts`, Phase 4's own docstring)
   — five inline editors call neither `stopPropagation` nor `preventDefault` on Escape:
   `ui/InlineEdit.tsx`, `queue/SavedScreens.tsx` ×2, `CommandDeck.tsx` ×2. What protects them is
   `handleKeyDown`'s `stack.length === 0` early return and the fact that a non-empty stack has
   so far always meant a backdrop no inline field can hold focus behind. **The property is held
   up by emptiness, not by the inner handlers** — so the first non-modal entry anyone pushes
   re-opens "one Escape closes two things" for all five. Found independently by both Phase F
   agents; the docstring now says this, and it is the recorded reason the evidence pane stays
   off the stack.

Two agents refuted instructions I gave them, with measurement, and both were right: the tour must
NOT register on the dismiss stack (it would kill `g` and `f`, 7 of its own 10 steps), and the seam
fix does not make the mismatch impossible.
