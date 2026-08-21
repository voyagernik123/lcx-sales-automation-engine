# GPS REVENUE 100× — from instrument to flywheel

**Status: AWAITING APPROVAL. Nothing below is built.**
Decision record: ten owner answers, 2026-08-21 (§1). Predecessor: `GPS_100X_PLAN.md` (P6–P12,
shipped). This plan does not remove anything that shipped; it puts fuel and demand through it.

---

## 0 · The thesis, and why the last plan could not produce revenue

P6–P12 built the correct instrument: a services book that is *underwritten* — Monte Carlo margin
distributions, P(loss) blocking proposal issue server-side, milestones derived from what was sold,
outcomes feeding calibration. 26,000 lines of engine. It is dormant for one reason that the
instrument itself cannot fix: **nothing enters it and nothing leaves it.** No demand flows in
(the $250k business runs outside it), no deliverable flows out (no drafting capacity), no cash
position closes the loop (no invoicing), and no client ever touches it.

The owner's answers define the missing three-quarters of the machine:

> **DEMAND → UNDERWRITE → DELIVER → COLLECT**, with the client inside the loop through a portal,
> AI compressing the cost side, and the owner approving — never entering — the numbers.

100× here means **booked revenue in the book**, measured by the book's own
`marginRealisation` and cash-conversion machinery. Not features. The plan is sequenced so the
shortest path to *the first engagement signed and invoiced through the instrument* comes first.

## 1 · The decision record (owner's answers, verbatim in effect)

| # | Question | Decision |
|---|---|---|
| 1 | What is 100× | **Revenue in the book** |
| 2 | Demand sources | **All four** — BD cross-feed, public inbound, marketing outbound, partner referrals — **plus owner's Telegram groups' project data** |
| 3 | Catalogue | **Make the five real AND expand** (full launch stack) |
| 4 | Pricing | **Underwritten + system-proposed; owner edits and approves the final price** |
| 5 | Client touch | **Interactive portal** — intake, approvals, uploads, deliverables |
| 6 | Delivery | **Three-stage waterfall: AI first draft → internal QA (hybrid) → partners for the partner-dependent (regulated) remainder** |
| 7 | AI's seats | **All four** — deliverable drafting, research dossiers, book copilot, outreach drafting |
| 8 | Founder inputs | **System proposes, owner approves** (price bands, effort triples, rate cards, perimeter, DPO) |
| 9 | Perimeter | **Enforce prohibitions only; unknown warns loudly but permits** |
| 10 | Money | **In-module invoicing** — numbered invoices from accepted milestones, aging, chase; rails stay external |

## 2 · Doctrine — carried forward, plus three new rules

D1–D8 from `GPS_100X_PLAN.md` §1 stand unchanged (traceable numbers, explicit refusals,
uncertainty beside the estimate, the system argues back, density, keyboard, printable, no claim
without a mechanism). Three additions for the new territory:

- **D9 — The client plane is a different country.** External identities NEVER touch roster auth,
  operator keys, or any `/v1/*` internal route. Separate token domain, separate rate budget,
  engagement-scoped visibility, no enumeration. The three access holes found while adding the 8th
  compartment (memory: every one bit on *adding* a plane) are the checklist for this, the 9th.
- **D10 — AI drafts are provenance, not authorship.** Every AI-produced artifact carries its
  basis (template version, fact slots filled, model, date), is immutable once QA'd, and NOTHING
  AI-drafted reaches a client or a regulator without a named human acceptance recorded. For MiCA
  materials the disclosure machinery (`renderDisclosure`'s throw-on-placeholder discipline) is
  the pattern: a draft with an unfilled slot refuses to render, it does not improvise.
- **D11 — Proposals are packets, not defaults.** Everything the owner must decide arrives as an
  approval packet — the proposed value, the evidence behind it, the consequence of approving —
  approvable in one action from GpsInputs. A default he never saw is a decision nobody made.

## 3 · The phases

Sequenced by *time-to-first-revenue-through-the-instrument*, not by architectural neatness.
G0→G1→G3 produce a quotable, priced, compliant pipeline; G4–G6 close delivery and cash; G7
hardens. Each phase lists what only the owner can do — none of it blocks the build (D11 packets
ship with badged placeholders exactly as before).

### G0 · TRUTH & UNBLOCKING — the five founder inputs become five approval packets
The instrument runs on approved numbers instead of placeholders.
- **Price-band packet**: proposed bands per offer from market comparables (MiCA white-paper
  drafting market, legal-opinion coordination fees, GTM sprint rates), each with sources and a
  LOW/BASE/HIGH structure mapping onto the quote desk's bands.
- **Effort-triple packet**: per offer, min/mode/max effort — derived for the NEW delivery
  reality (G5's waterfall), i.e. AI-draft + QA hours + partner hours, not artisan hours. This is
  what moves P7 off `basis: 'prior'`.
- **Rate-card packet**: partner classes and proposed rate cards; registry rows created inactive
  until a real partner is named (D5 stays his).
- **Perimeter seed packet**: jurisdiction × service-class rows for the markets he actually
  operates in, posture per answer #9 — **prohibitions enforce, unknown warns-and-permits with a
  loud stamp**. One flip in the guard: `service_prohibited` becomes blocking on quote, proposal
  and acceptance paths; every other verdict stays advisory-with-record. The double-lock
  (arrival-expired rows) stands — his approval IS the review that arms them.
- **DPO memo packet**: the controller/processor analysis for third-party confidential material,
  drafted for his sign-off. Approving it unlocks G4's uploads; until then the portal ships
  with intake *forms* (typed facts) and no file surface — `intakeLockout`'s discipline extends
  to the client plane rather than being deleted.
- **Approval surface**: GpsInputs grows a packet inbox — evidence, diff, one governed action to
  approve/edit each. Approvals are audit-sealed like every governed action.

### G1 · DEMAND — four channels and a Telegram pipe into one origination queue
Everything lands in `origination.ts`'s existing queue with provenance grades; nothing invents a
lead without a source.
- **BD cross-feed**: the listing pipeline already scores projects and 0072's join detector
  already links the two books. A rule engine turns listing states into services signals
  (stalled listing → MiCA paper target; new EU-exposure project → legal-opinion target), each
  carrying WHY as a cited reason, refusable per the origination refusal ledger.
- **Public inbound**: a services section on the public page (catalogue with honest price
  presentation per answer #4 — bands, not fixed prices) + an intake form. The form is the first
  external write surface: hardened like the x402 endpoints (rate-limited, schema-refused,
  no enumeration), lands as `intake` provenance.
- **Telegram project data**: an import path for HIS group exports — parse project names,
  contacts, announcements into origination candidates with `telegram` provenance and the
  marketing module's DPIA/data-minimisation gates applied at ingestion (this is personal data;
  the machinery for handling it lawfully already exists in the marketing compartment and gets
  reused, not reinvented). No bot in groups in this phase — file export he provides, nothing
  that touches his Telegram account credentials.
- **Partner referrals**: registry rows gain a referral intake; referred targets carry the
  partner as source and feed the same queue.

### G2 · DOSSIERS & OUTREACH — research and first contact, gated
- **AI research dossiers** per ranked target: background, raise history, regulatory exposure,
  the specific service hypothesis, every claim cited, Admiralty-graded, ICD-203 language for
  estimates — rendered with the same provenance discipline as the intel module.
- **Outreach drafting**: personalised first-contact/follow-up drafts per target. Every draft
  exits ONLY through the marketing module's outbound gate (claim safety, sender auth, the
  one-mouth rule) — GPS gets no second mouth. Send remains a human action.
- **The campaign loop**: outreach → response → qualification updates the origination queue;
  silence is recorded as silence (the marketing silence ledger pattern), never as progress.

### G3 · PRICING — the proposer, and the owner's hand on the final number
- **Inverse underwriting**: owner sets target margin and P(loss) ceiling once (a packet);
  the engine solves the existing distribution for the price that clears both, per quote —
  presented as PROPOSED beside the band evidence and the client's value anchors.
- **The approval flow**: owner edits or accepts the final price; the approved number becomes
  the quote, stamped `proposed_by: engine / approved_by: <owner> / basis: <distribution id>`.
  P7's `shouldBlockIssue` keeps its veto against approved-but-loss-making prices — the system
  still argues back (D4), even with him.

### G4 · THE PORTAL — the client inside the loop, in a separate country (D9)
- **Identity**: magic-link sessions scoped to ONE engagement, expiring, revocable, minted only
  by an internal governed action ("invite client"). A `client` principal type that no internal
  route accepts, on a separate API surface (`/v1/portal/*`) with its own rate budget and CORS.
- **Surfaces**: intake forms (typed facts per offer, feeding the engagement), proposal view
  (the printable proposal, on screen), milestone progress (the delivery view's honest states —
  `blocked` has no percent, and the client sees that honesty too), deliverable handover,
  milestone ACCEPTANCE as a client action (which is what arms invoicing in G6).
- **Uploads**: unlocked only by the approved DPO memo from G0; files land in the artifact
  machinery (which already exists on the delivery desk) with the client as recorded source.
- **Notifications**: portal events surface on the internal notification readout; clients get
  email (existing sender-auth machinery), never a second unsanctioned channel.

### G5 · THE DELIVERY FACTORY — the three-stage waterfall as a first-class object
- **Stage 1, AI draft**: a template library per offer (white-paper section skeletons, GTM sprint
  documents, diagnostic report frames) with typed fact slots filled from the engagement +
  intake + dossier. Missing slot ⇒ the draft refuses (D10). Output: versioned draft artifacts.
- **Stage 2, internal QA**: a review queue — diffable drafts, acceptance with a named human,
  rework loop. The engagement cannot advance a milestone on an unaccepted draft; the compiler
  pattern from `ProgressDisplay` (states that make lying inexpressible) applies here.
- **Stage 3, partner remainder**: work classed partner-dependent (legal opinions, regulated
  sign-offs) generates a handover packet (facts, drafts, scope, deadline) against the partner's
  rate card; partner deliverables come back through the same QA gate.
- **Effort truth**: each stage records actual hours/cost; the calibration loop finally gets the
  waterfall's real cost shape, and G0's effort triples stop being estimates.

### G6 · MONEY — invoices the book believes
- **Invoice engine**: numbered, immutable invoices derived from client-accepted milestones
  (integer cents, sealed like audit rows). No free-form invoices — an invoice that doesn't trace
  to an accepted milestone is inexpressible (D1/D8).
- **Aging & chase**: aging brackets into the Book's cash-conversion panel; chase drafts routed
  through the outreach gate; disputes recorded as states, not deleted.
- **Rails stay external** (answer #10): payment marking is a governed action with reference;
  reconciliation is a human act the system records, not a bank integration.

### G7 · INSTRUMENT & LOOP HARDENING
- ⌘K grammar for the new nouns/actions (packets, dossiers, invoices, portal invites), inspector
  drawers, print artifacts for proposal/dossier/invoice, density pass.
- The three unregisterable book monitors light up (margin floor, bench, perimeter review date —
  all real after G0). WBR gains the revenue block.
- The client plane gets its own pen-test round BEFORE first real client invite — D9 is a claim
  until adversarially tested, and memory says every new plane ships three access holes.

## 4 · Sequencing and the first-dollar milestone

```
G0 ──► G1 ──► G2 ──► (first qualified demand)
 │      └──────────► G3 (first APPROVED, underwritten price on a real target)
 ├────────────────► G4 (portal; uploads gated on DPO packet from G0)
 │                   └► G5 (factory; first AI-drafted, QA'd deliverable)
 │                        └► G6 (first invoice from an accepted milestone)  ◄── FIRST DOLLAR
 └► G7 last, before first external client invite goes out at volume
```
G0 is one working session of yours away from real numbers everywhere — every packet is
approve-or-edit, never author-from-scratch.

## 5 · What only the owner can do (all packet-shaped, none blocking the build)

1. Approve/edit the five G0 packets (prices, efforts, rate cards, perimeter, DPO).
2. Provide Telegram group exports (files — never account credentials; standing security rule).
3. Name real partners for the registry rows (D5, unchanged).
4. Approve the pricing-policy packet (target margin, P(loss) ceiling).
5. Send the first client invites (a governed action reserved to approvers).

## 6 · What this deliberately does NOT do

| | Why |
|---|---|
| Auto-send anything external | Outreach, chase and portal invites are drafted by machine, sent by human. One mouth, gated. |
| Touch Telegram/X credentials | Standing rule. Imports are file-based exports he provides. |
| Bank/payment integration | Answer #10: rails external. The book records, humans move money. |
| Let AI sign regulatory work | D10. MiCA-facing artifacts require named-human acceptance; partner stage exists precisely for regulated judgment. |
| Merge client identity into roster auth | D9. Separate plane, separate tokens, separate budget, engagement-scoped. |
| Auto-approve founder packets after a timeout | An unapproved packet stays unapproved. Silence is not consent, here of all places. |
| Delete the placeholder badges early | A badge comes off when its packet is approved, never when it becomes embarrassing. |

## 7 · Risks, named

- **The portal is the largest new attack surface this repo has ever added** — first external
  authenticated plane. Mitigation: D9 isolation, G7 pen-test gate before volume, magic-link
  scope-per-engagement, and the compartment-addition checklist from the 8th-workspace holes.
- **AI-drafted regulatory content is a reputational cliff.** Mitigation: D10 provenance, refuse-
  on-missing-slot templates, named-human acceptance, partner stage for opinions. The system
  must make "an unreviewed draft reached a client" inexpressible, not merely discouraged.
- **Telegram data is personal data.** Ingestion runs through the existing DPIA/minimisation
  gates or does not run.
- **Catalogue expansion widens the perimeter question** — every new offer needs a service-class
  row per jurisdiction before it is quotable in enforce mode. The packet structure absorbs this.
- **Calibration n stays small for quarters.** The loop's honesty rules (no auto-weight-adjust,
  packets for humans) already handle this; nothing in G0–G7 pretends otherwise.
