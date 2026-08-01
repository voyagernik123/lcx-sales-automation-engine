# GLOBAL SERVICES — the 100× plan

**Additive.** Nothing built in Phases 0–5 is removed. This is Phases 6–12 on top,
plus a doctrine that binds them.

Status: **awaiting approval.** No code written.

Prior documents: `GPS_IMPLEMENTATION_PLAN.md` (Phases 0–5, shipped, live at `b5ff139`).

---

## 0. Why the first six phases produced a form and a list

Not an apology — a diagnosis, because the same failure will recur if the cause is
not named.

**Measured, not asserted:**

| | |
|---|---|
| `targeting.ts` + `partners.ts` + `calibration.ts` + `delivery.ts` | **4,564 lines**, 151 tests |
| Web files referencing any of it | **0** |
| GPS API routes no UI calls | **6 of 9** (`/offers`, `/quote`, `/engagements/:id`, `/conflict-check`, `/proposal`, `/status`) |
| GPS surfaces | **1** page, 868 lines |

Five sixths of GPS has no surface. The screen looks thin because it *is* one sixth
of the system.

**Three root causes:**

1. **The plan was an exercise in reduction.** I cut 22 proposed objects to 2, killed
   the discovery engine, cut the MM lane, replaced the scoring formula. Each cut was
   defensible; the aggregate was a product conception thin enough that a form could
   express it. Minimum-viable is the structural opposite of crown jewel.
2. **I mistook hygiene for product.** Margin derived-not-stored, contract tests,
   artifact lockout, integer cents, RLS — all correct, none of it a capability. I
   optimised what I could verify instead of what he could *do*.
3. **I never asked the generative question.** Not "what is the minimum that sells"
   but *"what would a Palantir-grade origination instrument do that no CRM can?"*
   That question produces the rest of this document. I skipped it for six phases.

**The reframe that fixes it:**

> GPS is not a pipeline you fill. It is a **book you underwrite.**

Each engagement is a position with an expected margin, a variance, a capacity draw,
a concentration contribution, and a counterparty. A services business run by one
seller with a subcontracted bench is a **portfolio problem**, and the repo already
contains the machinery for portfolio problems — Monte Carlo, Admiralty provenance,
estimative language, SATs, Driver explainability, governed actions. GPS used none
of it.

---

## 1. Doctrine — the bar every phase below must clear

Not styling. These are testable properties, and each maps to a lineage the platform
already claims.

**D1 · Every number is traceable (Palantir).** Any figure on any GPS surface must
answer "what produced this" in one interaction — the rows, the formula, the source
grade, the timestamp. A number that cannot be opened is decoration. Reuse the
existing `Driver { label, points }` pattern (`alpha.ts:41`) and the search-around
inspector.

**D2 · Refusals are explicit and reasoned (CIA tradecraft).** Nothing is ever
silently ranked low, quietly excluded, or defaulted. `evaluateGates` already returns
a `GateHit` with a reason; that reason must reach the screen. The system says *no,
and why*, or it says nothing.

**D3 · Uncertainty is first-class, and it lives beside the estimate, never inside
it.** Point estimates are banned on anything decision-bearing. p10/p50/p90 or a
band. Confidence is reported adjacent — folding it into a score is the exact defect
that made the mandate's formula gameable (`GPS_IMPLEMENTATION_PLAN.md` §1.3).
ICD-203 vocabulary (`estimative.ts`) for anything verbal.

**D4 · The system argues back.** A premortem before acceptance. A devil's advocate
on a quote. *"At this price you lose money in 23% of simulated outcomes."* An
instrument that only records what you tell it is a spreadsheet with a login.

**D5 · Information density (Bloomberg).** Data surfaces are dense, monospace,
`tabular-nums`, no decorative whitespace. If a pixel does not change a decision it
is deleted. The four-stat strip currently occupying the page is the anti-pattern.

**D6 · Keyboard is primary (Rockstar / LCX TERMINAL).** Every GPS action reachable
from ⌘K by its registry id; every list navigable without a mouse; one Escape owner.
The grammar exists (`lib/command/`), GPS is simply absent from it.

**D7 · Every client-facing artifact is printable and dated.** A proposal, an
engagement dossier, a conflict record. Print CSS is already a solved problem here
(`/wbr` prints).

**D8 · No claim without a mechanism.** If a surface says "verified", something
verified it. This is the standard the rest of the repo holds and where GPS has
already failed once (`counts` never existed).

---

## 2. Phase 6 — THE BOOK · portfolio, not pipeline

**What he can do that he cannot now:** open one screen and know whether the book is
healthy — where it is concentrated, what it is worth net of cost, what cash is late,
and whether he can take another engagement at all.

| Slice | Substance |
|---|---|
| 6.1 | **Concentration** — by client, offer, partner, jurisdiction, currency. A services book with 60% of margin behind one partner is one resignation from a crisis. Herfindahl per axis + the top-3 rollup. Reuses `deskSummary` groupings; adds `partner` and `jurisdiction` axes. |
| 6.2 | **Capacity utilisation** — surfaces `benchHeadroom()` (dark). Per offer: slots free, why not more, and the binding constraint named. Not a gauge — a *reason*. |
| 6.3 | **Cash conversion** — booked → accepted → deposit → invoiced → collected, with aging buckets per currency and the oldest unpaid deposit in days (already computed, `awaitingDeposit.oldestAcceptedDays`, never shown). |
| 6.4 | **Margin realisation** — surfaces `marginRealisation()` (dark): quoted vs realised per offer and per partner, with variance. The single most important number in a partner-delivered business, currently invisible. |
| 6.5 | **The uncomfortable list** — `gaps` promoted from a strip to a worklist: missing conflict checks, declined conflicts, unpriced live engagements, deposits without acceptance, unstaffable engagements. Each row actionable in place. |

**Doctrine:** D1 (every figure opens to its rows), D5 (dense), D2 (constraints named).

---

## 3. Phase 7 — UNDERWRITING · the capability no CRM has

**What he can do:** before quoting, see the *distribution* of realised margin, not a
number — and be told when a price loses money in a material fraction of outcomes.

| Slice | Substance |
|---|---|
| 7.1 | **Cost model per offer** — partner rate card × effort triple (optimistic/likely/pessimistic), the same shape `launchSim.ts` already uses (`DurationTriple`, `sampleTriangular`, `resolveDuration`). Effort triples are founder-entered per offer, sourced and dated. |
| 7.2 | **Monte Carlo the engagement** — reuse `runLaunchSim`/`monteCarloForecast` machinery over cost and duration → realised-margin distribution. Output p10/p50/p90, **P(margin < 0)**, and the driver of the variance. |
| 7.3 | **The quote screen becomes an underwriting screen** — price in, distribution out, live. `P(loss)` above a threshold blocks issuing the proposal through the governed action rather than warning politely. |
| 7.4 | **Scope-overrun sensitivity** — one slider: +10/25/50% effort → what happens to margin. At $10–25k an overrun eats the engagement; this makes that visible before signature rather than after. |
| 7.5 | **Devil's advocate on the quote** (D4) — reuses the existing SAT copilot pattern: the three most likely reasons this engagement runs over, drawn from recorded outcomes once there are any, and from the offer's own exclusions before then. |

**Why this is the crown-jewel phase:** every CRM stores a price. None tells you the
price is wrong. This is a hedge-fund discipline applied to a services book, built on
Monte Carlo machinery already in the repo and tested.

**Honest limit:** with zero recorded outcomes the distribution is driven entirely by
founder-entered triples. The surface must *say so* — labelled as a prior, not a
measurement, and it must visibly tighten as real outcomes land (D3, D8).

---

## 4. Phase 8 — ORIGINATION · surface the targeting engine

**What he can do:** open a finite, ranked, explained queue of real targets and know
why each is there — and why the excluded ones were excluded.

| Slice | Substance |
|---|---|
| 8.1 | **The queue** — `rankTargets()` (dark) surfaced: score, confidence *band beside it*, the Driver trail, why-now trigger with its date. Finite by construction: a day's work, not a lead list. |
| 8.2 | **The refusal ledger** (D2) — gated targets shown *with the gate that fired and its reason*, plus `recoverable`/`remedy`. "Do the conflict check" is a task; "sanctioned" is a wall. Today both would be invisible. |
| 8.3 | **Provenance on every fact** — Admiralty grade (`provenance.ts:69`) + age on each field feeding the score. A stale B2 and a fresh A1 must not look alike. |
| 8.4 | **The research brief** — per target, generated, **cited**, with unverified fields marked as such. The failure mode to design against is a brief that reads well and is wrong, walking him into a client conversation on a false premise. Never asserts an unsourced fact; every claim carries grade + date or is labelled UNVERIFIED. |
| 8.5 | **Point of view → outreach** — the brief produces a proposed opening, human-approved before any send, reusing the existing send-gate discipline. |

**Explicitly not built:** the global discovery engine. Curated watchlist only, per the
original reasoning (§1.1 of the prior plan). This surfaces the engine that exists; it
does not resurrect mass sourcing.

---

## 5. Phase 9 — THE CONFLICT WALL · the defensibility instrument

**What he can do:** answer, in one screen and in front of anyone, "what was your
conflict position on this client, who decided it, when, and what did you disclose."

| Slice | Substance |
|---|---|
| 9.1 | **The wall** — every engagement's conflict position: cleared / cleared-with-disclosure / declined / **missing**, with decider, date, and the exact disclosure wording used. Missing is red and blocks client-facing states (the DB already enforces this; the screen must make it obvious). |
| 9.2 | **Disclosure text as versioned policy** — the wording is compiled, reviewed like code, and the *version used* is recorded per engagement. A disclosure you cannot reproduce is not a disclosure. |
| 9.3 | **Jurisdiction perimeter** — human-entered, sourced, dated, **expiring**. Permitted / counsel-required / partner-required / prohibited per service per jurisdiction. The system enforces a perimeter a qualified human defined and **refuses when it is stale or unknown** rather than guessing. (No regulatory fact was verifiable in this environment; this design is the correct one regardless.) |
| 9.4 | **The employee-conflict register** — LCX-adjacency per engagement, and a standing statement of what GPS does not do (no listing influence, no venue promise). Recorded once, cited everywhere. |
| 9.5 | **Second-tier session visibility** — surfaces `secondTierUsage()`/`secondTierUnexpected()` (dark). Who has entered on the shared passcode, and the non-roster count that signals rotation. A shared secret you cannot observe is worse than one you can. |

**Why this is not compliance theatre:** he is an exchange employee selling
market-access-adjacent services. This screen is the difference between a defensible
business and an indefensible one, and no CRM on earth ships it.

---

## 6. Phase 10 — DELIVERY · surface the plan that already knows what was sold

**What he can do:** see, per engagement, the plan derived from what was *sold*, what
is blocked and why, what he is waiting on from the client, and whether he is over his
own coordination ceiling.

| Slice | Substance |
|---|---|
| 10.1 | **Milestones from the sale** — `deriveMilestones()` (dark) surfaced. It already **throws on scope drift in both directions**: a sold acceptance criterion no milestone delivers, and a milestone claiming none. That guarantee is invisible today. |
| 10.2 | **Blocked ≠ not-started** — `engagementProgress()` refuses to report a flattering percentage when a milestone is blocked, and names the blocker. "60% done" with a blocked milestone is a lie the surface must not tell. |
| 10.3 | **Evidence chase list** — outstanding client inputs, overdue derived not stored, with the human-typed external reference. **No upload path** — the artifact lockout stays (D8, mutation-tested, 20 assertions). |
| 10.4 | **Acceptance gate** — `canAccept()` with its refusal reasons; review-required work cannot be accepted unreviewed (enforced in the DB by 0049, must be legible on screen). |
| 10.5 | **WIP ceiling** — `wipLoad()` surfaced. He sells and coordinates around a full-time job; coordination hours are the real ceiling and it should be possible to hit it and be told. |

---

## 7. Phase 11 — THE INSTRUMENT PASS · the craft layer

This is the phase that answers "it looks like AI slop" directly. It is not styling; it
is the difference between a page and an instrument.

| Slice | Substance |
|---|---|
| 11.1 | **⌘K grammar for GPS** — all five governed actions reachable by id, plus nouns (client, engagement, target, partner). GPS is currently absent from the command surface entirely. |
| 11.2 | **Inspector drawers** — client, engagement, target, partner each open an L3 drawer with the related panel, reusing `search-around` and `LINK_RESOLVERS`. Every number traceable (D1). |
| 11.3 | **Split-pane evidence** — ⌘\ docks the target's evidence beside the queue, using the existing split machinery. Research and decision on one screen. |
| 11.4 | **Density pass** — monospace tabular numerics, no decorative cards on data surfaces, information-per-pixel to the standard of the regulatory toolkit. Delete anything that does not change a decision. |
| 11.5 | **Print artifacts** (D7) — engagement dossier and proposal, dated, with exclusions, conflict position and disclosure wording. The proposal is the thing a client actually receives; it deserves to be a first-class output, not a screen scrape. |
| 11.6 | **Motion + feel** — the existing juice/haptic layer applied to governed GPS commits and refusals, reduced-motion respected. A refusal should *feel* like a refusal. |

---

## 8. Phase 12 — THE LOOP · learning, honestly

| Slice | Substance |
|---|---|
| 12.1 | **Outcome capture** at close — won/lost reason from the closed vocabulary, realised price and realised vendor cost. Without this, Phase 7's distributions never improve. |
| 12.2 | **Quarterly review packet** — `weightReviewPacket()` (dark). Which factors discriminated won from lost, with sample sizes and an explicit *insufficient evidence* verdict where that is the truth. It must never auto-adjust weights. |
| 12.3 | **`calibrationHealth`** on screen — a plain statement of what can and cannot be concluded at the current data volume. At ~29 engagements a year the answer is usually "not much", and saying so is the anti-slop move. |
| 12.4 | **Monitors on the book** — reuse the existing object-monitor spine: deposit overdue, conflict missing, margin below floor, bench headroom zero, perimeter stale. Condition → governed act. |
| 12.5 | **GPS block in the WBR** — the book's week, printed, in the existing weekly review. |

---

## 9. Sequence, and why this order

1. **P6 The Book** first — it is the screen that makes the other five feel necessary, and it needs no new server work.
2. **P7 Underwriting** second — the crown jewel, and it changes what a quote *is* before there is volume to regret.
3. **P8 Origination** third — demand only matters once the book can price and staff.
4. **P9 Conflict Wall** — must precede real client volume, not follow it.
5. **P10 Delivery** — becomes load-bearing at the second concurrent engagement.
6. **P11 Instrument pass** — continuous doctrine, one dedicated sweep here.
7. **P12 Loop** — needs outcomes to exist.

**P6 and P11 together are the answer to the slop complaint.** P7 is the answer to
"why is this a crown jewel".

---

## 10. What this deliberately does NOT do

| | Why |
|---|---|
| Remove anything from Phases 0–5 | Additive by instruction. The lockout, the contract test, the access fixes all stand. |
| Build artifact/document intake | Still gated on the DPO question. P10.3 works around it by design. |
| Resurrect global discovery | Wrong bottleneck; P8 surfaces the curated engine instead. |
| Invent regulatory facts | Nothing here asserts a regulatory conclusion. P9.3 stores and enforces what a qualified human entered, and refuses when stale. |
| Auto-adjust scoring weights | ~29 outcomes/year cannot train anything. P12.2 produces a packet for a human. |
| Invent prices | Placeholders stay badged until D4 is supplied. |

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Phase 7's distributions are founder-priors dressed as measurement | Labelled as priors on the surface; visibly tighten as outcomes land; `calibrationHealth` states what is concluded |
| A research brief reads well and is wrong | Every claim carries grade + date or is marked UNVERIFIED; no unsourced assertion permitted |
| Density becomes illegibility | The regulatory toolkit is the reference standard, not a new invention |
| Surfacing four dark engines at once produces four thin screens | One phase per engine, each with a "what can he DO" test that must be answered before the phase closes |
| 42 unverified pen-test findings still outstanding | Triage before P7 touches money paths; the one confirmed finding (the summary contract) proved the pile is not noise |

---

## 12. Approval

Approving authorises **P6 and P7**, which together answer both complaints — the
screen and the substance. P8–P12 return for approval with P6/P7's evidence.

Needed from you, unchanged and still not blocking: price bands (D4), a named partner
per offer (D5), the DPO answer (D2). P7 additionally wants **effort triples per
offer** — optimistic / likely / pessimistic days — which only you can supply, and
which is the input that turns the underwriting screen from a prior into a model.
