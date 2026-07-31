# Global Project Services — Implementation Plan

**The 8th LCX OS workspace.** Supersedes `OPUS5_GLOBAL_PROJECT_SERVICES_COMPLETE_MASTER_MANDATE.md`
as the build document. That file remains valid as a statement of intent; this one is what gets built,
in what order, and what must not be built.

Status: **awaiting founder approval.** No code written. No migration authored. Nothing deployed.

---

## 0. Provenance and honest limits — read before trusting anything below

| Claim class | Confidence | Why |
|---|---|---|
| Repo capability (`file:line`) | **HIGH** | Read directly and re-verified by hand |
| Commercial reasoning | **MEDIUM** | Derived from founder-stated facts + arithmetic below |
| Anything regulatory | **UNVERIFIED** | `WebSearch`/`WebFetch` failed all session (`LongCat-2.0` model error) |

**No regulatory fact in this plan was verified.** MiCA notification-vs-approval, who may issue a legal
opinion in which jurisdiction, marketing-communication rules, referral-disclosure duties — all of it is
recalled training data with a May 2026 cutoff. The mandate's `[web:131]`, `[web:154]` citations could
not be checked either.

This is not a gap to paper over; it is a **design input**. Every jurisdiction and perimeter rule in this
plan is therefore modelled as **human-entered, sourced, dated and expiring policy that the system
enforces but never originates**. The system's job is to refuse when the perimeter is unknown or stale.
That is the correct design even with working web access.

**Founder facts** (answered directly, override the mandate where they conflict):
sold all four of MiCA white paper, legal-opinion coordination, GTM/TGE strategy, marketing — ~$250k,
manually, no system · LCX listing currently unavailable · **partners deliver, he sells and coordinates**
· **$10–25k per engagement** · contracting entity deliberately undecided, must be configuration ·
LCX employee · wants an 8th workspace separate from the other 7 · "still looks a vanity project" ·
wants **surgical** outreach.

---

## 1. Five corrections to the mandate

### 1.1 The bottleneck is deliverable supply, not lead supply — and not research hours

I initially argued the constraint was research-depth-per-target, from this funnel: $17.5k × 29 =
$500k/yr → 2.4 closes/mo → 8 proposals → 16 conversations → ~130 outreaches → 65–130 research
hrs/mo.

**That derivation is wrong and I withdraw it.** It mixes a *warm* close rate (30% proposal→close, 50%
conversation→proposal — plausible only because his $250k came from reputation and network) with a
*cold* reply rate (12%). Made internally consistent it breaks both ways: if the channel is cold, the
close rates fall to cold levels and required outreach becomes 300–600/month, arithmetically impossible
for one seller; if the channel is warm, 130 cold-researched outreaches is the wrong work entirely.
It also has **no capacity term** — it solves for revenue and derives demand, never asking how many
engagements a partner bench with zero named members can deliver concurrently.

The real ordering of constraints:

1. **No priced, bounded, sendable offer** for the four things he sells — proposal turnaround, and the
   exclusions that make partner delivery safe.
2. **No partner bench.** With partners delivering, bench depth per offer *is* the concurrency cap.
3. **Cash.** Quote → deposit → collection. The mandate parks this in Phase 4.
4. *Then* research depth, and only for a curated few hundred — which needs no discovery engine.
5. **Global discovery, dead last**, and only if 1–4 saturate.

### 1.2 The existing intelligence layer scores the wrong business

`packages/shared/src/alpha.ts:5` computes **Listing Propensity** — likelihood of listing *on LCX* —
and treats `listedOnLcx: true` as *reducing* opportunity (`alpha.ts:80`). `dealValue` anchors on
"a listing's value scales with the token's size and liquidity" (`alpha.ts:157`).

For a services business this is inverted: **an already-listed project is an excellent client** — it
still needs documentation, GTM, liquidity and distribution. Reusing `listingPropensity` would
systematically down-rank the best prospects. The mandate says "reuse those atoms" (§8) without noticing
the atoms encode the business he is moving away from.

**Reusable:** the raw signal bundle (market cap, volume, GitHub, team size, TVL, `dataConfidence`,
`washTradingFlag`), the Admiralty provenance grading (`packages/shared/src/provenance.ts:69`), the
driver/confidence explainability pattern. **Not reusable:** every composite score.

### 1.3 The priority score is not merely imperfect, it is unusable

Mandate §6: `Priority = Need × AbilityToPay × Urgency × Access × RegulatoryFeasibility × PartnerFit ×
ExpectedMargin × EvidenceConfidence − ReputationRisk − DeliveryComplexity`

Eight factors in [0,1] multiplied collapse toward zero (eight independent 0.7s ≈ 0.058), so all real
targets compress into a band narrower than the noise in the inputs. Then two additive penalties on a
product that small means **the penalties own the ranking entirely** — the formula effectively sorts by
`−ReputationRisk − DeliveryComplexity`, i.e. it selects for *easy and safe* rather than *valuable*.
`EvidenceConfidence` inside the product conflates "we are unsure" with "it is bad", so the cheapest way
to raise any score is to lower the two protections, and a single zero silently deletes a target with no
audit trail. Replacement in §7.

### 1.4 The mandate asks for ~3× the data model that is needed

Against 47 applied migrations: **2 genuinely new root objects, 7 extensions of existing tables, and 9
things that should not be built at all.** `partner` would be the **third** partner table
(`partners`, `0024_dealdesk_ext.sql:66`; `command_partners`, `0040_command.sql:29`).
`invoice_schedule` is `payment_milestones` (`0024_dealdesk_ext.sql:37`) renamed. Four requested objects
(`service_catalog_item`, `service_module`, `jurisdiction_profile`, `service_perimeter`) are **policy**,
and this repo already puts commercial and legal policy in versioned code, not tables — the claim library
(`packages/shared/src/claims/claims.ts:236`), the package catalogue
(`packages/shared/src/deals/index.ts:17`), the source registry (`provenance.ts:48`). Policy in a table
is policy that changes without code review. For a licensed exchange's employee selling
regulated-adjacent services that is a downgrade. Full ruling in §5.

### 1.5 An 8th workspace is a routing boundary, not a data boundary

This is the most important finding in the document and it changes the sequencing.

| A workspace entry gives you | Reality |
|---|---|
| Nav/route visibility scoped to entitled members | **WIRED** (`workspaces.ts:190`, `app.ts:96`) |
| 403 on its own `/v1/<prefix>` for unentitled members | **WIRED** (`middleware/workspace.ts:20`) |
| Request-access front door with justification | **WIRED** (`0042_lcx_os_access.sql:41`) |
| Isolation from desk-level readers (`/v1/search`) | **ABSENT** |
| Default-deny for a **newly added** roster member | **ABSENT — the opposite happens** |
| Isolation from the shared machine key | **ABSENT** |
| Per-person attribution you could show a client | **ABSENT** (shared `DESK_PASSCODE`) |
| Any "this row belongs to client X" dimension | **ABSENT** |
| Anywhere to put a client's document | **ABSENT** |
| Control over which LLM sees client text | **ABSENT** |
| Schema separation from LCX's own pipeline | **ABSENT — same tables** |

**The default-deny inversion, verified by hand.** `apps/api/src/access/entitlements.ts:56-61`: a roster
member with **zero** grant rows receives `legacyEntitlements(member.role)`, and
`packages/shared/src/workspaces.ts:219-224` loops **every** workspace: `for (const w of WORKSPACES)
map[w.id] = cap`. A `grep` for `.legacy` across `packages/shared/src`, `apps/api/src`, `apps/web/src`
finds only the type declaration, five literal values and two comments — **`legacy: false` is read by no
code**. Default-deny is a property of *having a grant row*, not of the flag.

Consequence: add a marketing hire or a delivery specialist to `operators.ts`, deploy, and until someone
remembers to insert a grant row they hold every workspace — US COMMAND, GOVERNANCE, and GPS — at
`approve` if their role is approver.

**Therefore: shipping the 8th workspace and calling the boundary handled is the single most dangerous
move available in this programme.** It produces a *visible* separation that the data plane does not
honour — worse than no boundary, because a client, an auditor or LCX compliance would be invited to
trust it.

---

## 2. The sequencing consequence — and why it does not block revenue

The naive reading of §1.5 is "fix the data boundary before anything." That would stall revenue for
weeks on work with no commercial return.

The resolution is a single test applied to every slice:

> **Does this slice cause LCX infrastructure to hold a third party's confidential material?**

- **Proposal generation does not.** A catalogue, a price, exclusions, a partner owner, a PDF sent
  outbound. No client filing, no privileged work product, no corporate record.
- **Artifact intake does.** Receiving an unpublished white paper draft, legal facts, or cap-table
  material is the moment LCX becomes a processor for non-LCX confidential data.

So the boundary work is a **hard gate on Phase 3 (delivery/artifacts)**, not on Phase 1 (sell). He can
earn while the entity and DPO questions are still open, provided the system physically cannot accept a
client document until the gate is passed. That constraint is enforced in code, not by discipline.

**Corrected phase order** (departures from the mandate justified):

| Phase | Content | Mandate had it | Why moved |
|---|---|---|---|
| **0** | Decisions + 4 safety fixes | Phase 0 (decisions only) | The safety fixes are prerequisites, not hygiene |
| **1** | Offer → Proposal → Deposit | Phase 1 (commercial core) | Kept first. Correct. |
| **2** | Partner bench + margin | Phase 3 / Phase 4 | Partners deliver ⇒ bench is the capacity cap and cost is the business |
| **3** | Delivery + artifacts | Phase 3 | **Gated** on the Phase-0 data boundary |
| **4** | Surgical targeting + research briefs | Phase 2 (discovery, second) | Demand-side work is worthless until 1–3 exist; `ExpectedMargin`/`PartnerFit` are literally uncomputable before the catalogue |
| **5** | Calibration + learning | Phase 4 | Needs outcomes to learn from; ~29/yr means this is a 2027 concern |
| — | Ontology, missions, agent graph | Phase 5 | **Cut.** See §8 |

---

## 3. Blocking decisions — human only, ranked

**D1. Who contracts with the client?** Answered "design for both", so: `contracting_entity` is a
column with a default, and disclosure text, invoice header, artifact storage target and referral
wording all derive from it. **Not blocking Phase 1.** Becomes blocking at Phase 3.

**D2. Does LCX legal/DPO accept third-party client confidential material on LCX infrastructure?**
Blocking **Phase 3 only**. Needs a named answer on controller-vs-processor, the subprocessor chain
(Supabase, Render, Cloudflare, Anthropic/OpenRouter), retention and erasure. Until answered, artifact
intake stays disabled in code.

**D3. Does his employment permit this, and on what disclosure?** Blocking **any external outreach**
that names LCX or implies venue access. Not blocking internal build.

**D4. Price bands and exclusions per offer.** Blocking Phase 1 slice 1. Only he can set these.
$10–25k engagement band given; the **paid diagnostic should be $1.5–3k creditable against the
engagement**, not the mandate's implied $5–10k, which is 20–50% of the whole deal and will not sell.

**D5. Named partner per offer.** Blocking Phase 2. Who actually writes the white paper, who issues the
legal opinion, per jurisdiction. Without names, "partners deliver" is aspiration.

**D6. BitStreet.** Executed agreement must be read before any client-facing representation. Website
copy is not diligence. Blocking the MM lane only — which is **deferred out of v1** (§8).

---

## 4. Phase 0 — decisions and the four safety fixes

Four fixes, all small, all prerequisites. None is optional.

**S0.1 — Close the default-deny inversion.** `entitlements.ts:56-61` must not grant all workspaces to
a zero-row member. Replace `legacyEntitlements(role)` with an explicit **grandfather list of the three
existing member ids**; anyone not on it gets `{}` and sees the request-access surface. Then make
`legacy` load-bearing or delete the field — a flag that documents a guarantee it does not enforce is
worse than no flag.
*DoD:* a test adds a fourth roster member with no rows and asserts zero workspaces; the three existing
members are unaffected. **Effort: hours.**

**S0.2 — Scope `/v1/search`.** It is desk-level and reads across compartments unfiltered. Every
GPS-owned row must be excluded unless the caller holds GPS `view`.
*DoD:* a test signs in as a member without GPS entitlement, searches a GPS client name, gets nothing.
**Effort: days.**

**S0.3 — A client dimension.** No row anywhere says "this belongs to client X". Introduce `client_id`
on GPS-owned tables from the first migration. Retrofitting a tenancy seam later is a rewrite.
**Effort: hours** (as part of Phase 1's migration).

**S0.4 — Artifact intake disabled by construction.** There is nowhere to put a client document today,
and that is temporarily a feature. No upload endpoint, no storage bucket, no attachment column ships
until D2 is answered. A ratchet test asserts no such route exists.
*DoD:* the test fails if anyone adds one. **Effort: hours.**

Also in Phase 0, from the governance dossier and worth knowing: **the audit log is not hash-chained**
despite the claim appearing in four places, **client-side idempotency is unwired** so replay protection
is not actually in force, and the compartment gate guards `view` only. None blocks GPS, all three
weaken any assurance given to a client. Log them; fix the audit-chain claim by **deleting the false
claim** rather than by asserting it harder.

---

## 5. The data design

**Two new root objects. Seven extensions. Nine cuts.**

### New (2)

**`gps_engagement`** — the only unavoidable new root object. A *pursuit* (deal) is not a *delivery*.
Carries `client_id`, `contracting_entity`, offer key, scope version, price, **`vendor_cost_cents`**,
status, acceptance state, owner.

> **Why a new table rather than reusing `deals`:** `0033_deals_unique_project.sql:12` creates
> `UNIQUE INDEX idx_deals_project_unique ON deals (project_id)` — **one deal per project, forever**. A
> client buying a white paper in March and a GTM sprint in June would get a 409. Repeat business, which
> is the entire renewal/referral end of the loop, is impossible at the DB level today. Engagements in
> their own table fixes this without the risk of dropping a unique index other code may depend on.

**`gps_conflict_check`** — but not as the mandate frames it. One row per engagement recording the
check, the decision, the decider and the disclosure text actually used. This is the artifact that makes
an exchange employee's services business defensible; it is the one piece of compliance machinery that
genuinely does not exist.

### Extensions (7)

`payment_milestones` (`0024_dealdesk_ext.sql:37`) **is** the invoice schedule — add nothing, use it ·
proposal snapshot gains an **`exclusions`** field (it currently emits `inclusions`, `tiers`,
`claimsUsed`, `disclaimer` only, and exclusions are the single most protective sentence in a services
proposal) · `partners` (`0024_dealdesk_ext.sql:66`) gains capability, rate card, capacity ·
`referrals` gains disclosed economics + consent + approver · `tasks` becomes the evidence request ·
`analytic_reviews` becomes the readiness/liquidity assessment · `deals` gains `contracting_entity`.

### Cut or deferred (9)

`service_catalog_item`, `service_module`, `jurisdiction_profile`, `service_perimeter` → **compiled
policy in `packages/shared`**, reviewed like code, sourced and dated with an expiry.
`engagement_scope_version`, `engagement_milestone`, `client_artifact`, `legal_matter`,
`counsel_assignment`, `disclosure_record`, `venue_opportunity`, `liquidity_readiness_assessment`,
`service_case_study`, `partner` (third table), `partner_capability`, `commercial_quote` → reuse,
fold, or defer. `venue_opportunity` in particular: **his venue is currently unavailable.**

---

## 6. Phase 1 — Offer → Proposal → Deposit (the first slice, and the whole argument)

**Build this first, in days not weeks.** It is the only build that raises revenue at **zero
incremental pipeline** — it improves conversations he is already having. A build that pays off with no
new leads cannot be a vanity project; that is the strongest available test, and the mandate's §6/§8/§10
fail it.

1. Replace `PACKAGES` / `PackageConfig.type` (`packages/shared/src/deals/index.ts:17`) with a service
   catalogue: the four sold offers + a fixed-scope paid diagnostic as the front door. Each item:
   outcome, inclusions, **exclusions**, required client inputs, partner owner, expected vendor cost,
   acceptance criteria, price band, renewal path.
2. Extend `generateProposal` (`deals/index.ts:124`) to render it, exclusions included.
3. Retire `buildProposalTiers` (`deals/index.ts:100-121`). Mechanical ×0.6/×1.6 tiering off a base
   price is right for listing SKUs and wrong for scoped professional services, where tiers differ in
   **scope**, not by a multiplier.
4. Wire an accepted proposal to a deposit milestone on the existing endpoints
   (`apps/api/src/routes/dealdesk.ts:107`), **with margin visible at quote time** — price minus
   expected vendor cost. There is no margin column in 47 migrations; at $10–25k with a subcontractor
   delivering, one scope overrun eats the engagement.
5. `contracting_entity` as a catalogue/quote field with a default — D1 satisfied in one column.
6. Register `proposal_issue` and `discount_approve` in the existing action registry; the
   propose-then-confirm pattern already exists (`dealdesk.ts:53`, `:73`).

**What he can do the day it lands:** take a live conversation, pick an offer, generate a scoped
proposal with real exclusions and a deposit schedule, see his margin before he sends it, and have the
issuance audited. **Success test:** one real proposal sent from the system inside a week, and he does
not reach for a Google Doc.

**Why not discovery first:** `ExpectedMargin` and `PartnerFit` — two factors the mandate's own scoring
depends on — are uncomputable until the catalogue and bench exist. Discovery cannot be built first
without inventing them.

---

## 7. The replacement for the priority score

**Gates first, then an additive score, with confidence orthogonal.**

**Hard gates** (binary, auditable, each a stated reason for exclusion — never a silent multiply-by-zero):
sanctions/AML hit · no identifiable decision maker · no budget or capital proxy · jurisdiction outside
the current perimeter · unresolved conflict · demand for guaranteed listing/approval · materially
misleading facts. A gated target is **excluded with a reason**, not ranked low.

**Score** for those that pass — additive, weighted, each term explainable in one sentence, bounded 0–100:

```
Score = w1·Need + w2·AbilityToPay + w3·Urgency + w4·Access + w5·ExpectedMargin − w6·DeliveryComplexity
Confidence = f(Admiralty grade, evidence age, field completeness)   ← reported BESIDE the score, never inside it
```

Confidence must stay orthogonal: folding it into the score conflates "we are unsure" with "it is bad",
which is precisely the defect that lets the mandate's formula be gamed by weakening its own
protections. Sort by score, **band by confidence**, and show the drivers — the pattern `alpha.ts`
already uses (`Driver { label, points }`).

With ~29 outcomes a year, weights cannot be learned. They are a **stated prior**, reviewed quarterly
against won/lost, and the plan says so rather than implying a calibration loop that cannot exist.

---

## 8. Deliberately not building

| Not building | Why | Trigger to revisit |
|---|---|---|
| Global discovery engine | Solves a constraint he does not have; highest ToS/cost exposure in the mandate | Phases 1–3 saturated and bench has spare capacity |
| Market-making / BitStreet lane | Cannot be represented before the executed agreement is read; nothing about MM performance may ever be promised | D6 answered with the signed agreement in hand |
| `venue_opportunity` | His venue is currently unavailable | LCX listing resumes |
| Ontology / missions / agent graph (mandate Phase 5) | This is the vanity-project surface. No workflow has yet proven the need | A validated workflow demands it |
| Client-facing portal / external logins | Identity model cannot express an external principal; shared passcode makes attribution self-asserted | Per-person credentials exist |
| Artifact intake | D2 unanswered; enforced absent by ratchet test | LCX DPO answer + storage boundary |
| 10-offer catalogue | Four have ever been sold; five including the diagnostic | Two consecutive quarters at capacity |

---

## 9. Top risks

| Risk | Severity | Mitigation |
|---|---|---|
| The 8th workspace is trusted as a data boundary | **Blocker** | §4 S0.1–S0.4 before any client data; artifact intake absent by construction |
| A partner fails a client he vouched for — destroys the moat | **High** | Bench + acceptance criteria in Phase 2, before volume; capacity cap enforced |
| Perception of selling listing influence as an LCX employee | **High** | D3 + conflict check per engagement + disclosure text derived from `contracting_entity` |
| Margin erosion on $10–25k partner-delivered work | **High** | `vendor_cost_cents` and margin-at-quote-time in Phase 1, not Phase 4 |
| An AI research brief reads well and is wrong, sending him into a client conversation on a false premise | **High** | Briefs cite Admiralty-graded sources with dates; unverified fields marked; never assert an unsourced fact |
| Regulatory content drifts stale and silently wrong | **High** | Perimeter as expiring policy; system refuses when stale rather than guessing |
| Building the mandate as written | **Medium** | This document |

---

## 10. Approval

Approving this authorises **Phase 0 + Phase 1 only** — the four safety fixes and the
Offer→Proposal→Deposit core. Phase 2 onward returns for approval with Phase 1's evidence.

Needed from you to start: **D4 (price bands + exclusions per offer)**. Everything else in Phase 0/1 is
mine to do.
