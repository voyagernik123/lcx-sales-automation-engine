# LCX OS — THE IMPLEMENTATION PLAN

**Status:** for approval, 2026-08-03. Supersedes `DIMENSIONAL_100X_PLAN.md`, which is folded in
here as Track B and materially reduced.

Method: eight agents ground-truthed one compartment each and killed their own weak ideas; one
agent worked the cross-compartment joins; one synthesised. **45 candidate capabilities, 28 killed
by the agents, 4 more cut by me. 13 survive.** Every load-bearing citation below I re-verified
against the code myself; where my verification changed a claim, the change is recorded.

---

## 1. THE THESIS

LCX is a regulated exchange that also sells paid services to the issuers it might list. That is
the whole shape of the business and it is the whole shape of its risk, and the platform cannot
currently see it.

It cannot see it in the ordinary sense — there is no query that answers "is this counterparty
paying us while applying to list" — and it cannot see it in a stricter sense either: **the numbers
it reports about itself are largely invented.** The price on a listing proposal is a constant. The
value of a lead is a formula fitted to look plausible. The compliance limb on a token campaign is
arithmetically incapable of returning false. The capital figure printed in a document addressed to
state regulators is produced by a parser that reads `$1M` as `1`.

This programme makes the platform able to state, and defend, five things:

- **what we have actually charged**, from contracts on disk that no code has ever read;
- **the price below which we lose money**, which no function anywhere computes;
- **whether we are permitted to speak today**, joined against an embargo register and a holdings
  declaration rather than asserted in prose;
- **whether a counterparty is simultaneously paying us and applying to list**;
- **whether our own answers have historically been right.**

Every figure traces to something observed, or refuses out loud. That last clause is the product.
An exchange that can prove its own numbers to a regulator, a client and its own board — from one
system, on demand — is the asset. Everything below is in service of it.

**What this is not.** It is not a redesign, and after this the platform will not look meaningfully
different. Two earlier attempts at this plan proposed exactly that and were correctly rejected.

---

## 2. THE STANDARD USED HERE

The first attempt proposed nine phases of adding a third axis to charts. The second proposed a
continuous spatial substrate — "one building, eight rooms". Both answered *how should it look*. A
chart and a building are renderings; neither changes what the platform knows. The five names in
the brief — Palantir, Apple, CIA, a Fortune 500 sales desk, a hedge fund's crown jewel — are
capability claims: the join no human can do by hand; a step that disappears; being told what
changed before you ask; the machine doing the judgement work of ten people; a measured edge with
the losses counted.

So every candidate had to pass five tests, and 32 of 45 did not:

1. **Blind decision** — name a decision a named human makes today with insufficient information.
2. **The join** — the missing information must come from a table that exists *and is written to*,
   on a real shared identifier. Not string matching, not an LLM guessing.
3. **The hand test** — a competent human with a spreadsheet and a week must not be able to do it.
4. **Consequence** — money, liability, or headcount-equivalent work, with direction.
5. **Honesty** — on absent data it refuses; it never renders 0 or an estimate.

Plus the costume test: visualisation or a new page wearing a capability's name. And the inertia
test: a capability that is inert without a human input nobody will type is not a capability.

---

## 3. PRE-WORK — one live defect, ahead of everything

**`apps/api/src/notifications/service.ts` — `listNotifications` is
`SELECT … FROM notifications ORDER BY created_at DESC LIMIT n`. No workspace filter, no
entitlement check.** Every operator's notification bell shows every compartment's alerts,
elevated ones included, in production right now. In a system whose founding premise is
need-to-know, that is a breach, not a backlog item. It is one column and one predicate.

Fix this first regardless of what else is approved.

---

## 4. THE EIGHT COMPARTMENTS

### 4.1 SALES — the price is a constant, and the contracts are on disk

**Blind decision.** What to charge on a listing proposal, and where the walk-away floor is. Made
by the rep generating the proposal, signed off by you, from `PACKAGES[].basePrice = 2_000_000`
cents = **$20,000** (`packages/shared/src/deals/index.ts:18`) with tiers at ×0.7 / ×1.0 / ×1.6.
The whole price table is hardcoded, and `packages/shared/src/alpha.ts:162` manufactures a deal
value as `15_000 + blended × 235_000` from market cap and liquidity — the comment concedes the
tiers were *chosen* to "land in the desk's real package range".

**Capability — MARK TO CONTRACT.** Every price quoted and every dollar reported derives from a fee
LCX actually collected from a comparable counterparty, or refuses.

**The join.** `listing_labels(project_id, listing_fee_usd, marketing_fee_usd, outcome, stage_trail)`
→ `projects(market_cap_usd, category, chain)`, bucketed by the existing feature bands
(`packages/shared/src/scoring/propensity/features.ts:38-88`). The FK resolves at *write* time by
`name_key` with an unambiguous-ticker fallback and ambiguous tickers dropped
(`apps/api/src/labels/extract.ts:104-119`) — so every read is uuid-to-uuid, never string-matched.

**What the contracts actually say** (computed from `data/seeds/LCX Listings - Closed Token
Listings.csv`, 37 rows, no blank fee columns): fee revenue totals **$639,500**; **median $10,000**,
mean $17,284, p75 $25,000. The listing fee is **$0 in 25 of 37** closes, and the marketing fee
exceeds it in **27 of 37**. Against the fabrications: **22 of 37 closed at or below $15,000** — the
invented floor; **0 of 37** reached $250,000 — the invented ceiling; only **14 of 37** reached
$20,000 — the default quote. Closes run 2024-02-02 → 2026-02-03.

**A correction that is the argument for F1.** An earlier pass reported this book as $816,500 with a
$15,000 median. That included `Liquidity Amount` — $177,000 — which is capital placed alongside a
market maker, not a fee LCX collects. *The analysis of the fabrication committed the same error
class as the fabrication.* Honesty has to be mechanical, not diligent.

**Absent data.** Below *K* comparables no value is emitted and a code names the empty stratum; the
stratum is never widened to manufacture a mark. `parsed || CAPITAL.DEFAULT_LICENSING_FEE`
(`apps/web/src/pages/CapitalEstimator.tsx:36-37`) and the em-dash renderings that read as zero
(`apps/web/src/pages/Targets.tsx:157`) are deleted, not relocated.

**Cost.** No table, no migration. One engine replacing `defaultPackageValue` and
`buildProposalTiers` (`apps/api/src/routes/deals.ts:155`, `:400`); add `listing_labels` to
`apps/api/src/db/schema.ts`, where it is absent; unpin the test that asserts the fiction
(`packages/shared/src/deals/__tests__/deals.test.ts:42-56`). One operational step: run
`extract.ts` against production once. **If it has never run there, every figure refuses on day one
— and that refusal is the finding.**

### 4.2 GPS — the system reports the consequence of a price it was handed

**Blind decision.** What to quote on a £10–25k engagement, and whether to approve a discount. Made
by you. Every engine takes `priceCents` as an *input*; nothing in `packages/shared/src/gps` or
`apps/api/src/gps` inverts it.

**And the gate that would catch a below-floor quote has never executed.**
`apps/api/src/gps/actions.ts:732-735` calls `markGateDegraded()` and skips the band check entirely
while `PRICE_BANDS_ARE_PLACEHOLDERS` is true — and it is true
(`packages/shared/src/gps/catalogue.ts:58`, verified). Every proposal issued to date passed a gate
that did not run.

**Capability — THE FLOOR.** Report the minimum price at which this offer, delivered by this
partner, meets a stated loss tolerance; and make the discount gate read a real band.

**The join — no new data, and the inversion is already half-written.** `simulate()` builds and
**sorts** a 4,000-element margin vector (`packages/shared/src/gps/underwrite.ts:783-817`). Cost
carries no price term, so margin is a pure translation of cost:
`costsAsc[i] = priceCents − marginsAsc[n−1−i]`. The minimum price for P(loss) ≤ *t* is one order
statistic (`:647`). `buildDistribution` already computes `p10CostCents = priceCents − p90` and its
siblings at `:846-848` and keeps three. **Zero additional simulation.** Second half:
`actions.ts:736` and `apps/api/src/gps/service.ts:408` stop reading compiled `TODO_PRICE_BANDS` and
read `gps_price_band` (`0066_gps_price_band.sql:54`) — a table with a writer, one SELECT, and no
engine consumer anywhere.

**Absent data.** Refuses through verdicts that already exist — `refused_no_rate_card`,
`refused_card_expired`, `refused_currency_mismatch` (`underwrite.ts:291-313`). Never a fallback to
the catalogue placeholder. It is labelled a **partner-cost** floor, not a business floor, because
your own coordination time is a placeholder (`packages/shared/src/gps/delivery.ts:1186`) and a
floor computed without it is systematically low.

**Cost.** One function, three fields, two read swaps. No migration. **But there is a bootstrap
deadlock that must open first:** `apps/api/src/routes/gpsInputs.ts:1172-1197` refuses every rate
card with `409 PARTNER_BENCH_EMPTY`, while the only sources of a partner name are an empty compiled
array (`packages/shared/src/gps/partners.ts:332`, verified `= []`) or a rate card that already
exists. Nothing can ever be entered. The fix is to accept a named human's attributed assertion —
the pattern already exists at `apps/api/src/gps/conflict.ts:589`.

### 4.3 MARKETING — the record cannot prove what it contains

**Blind decision.** "Is this Art 8(2) production complete? Can I sign it?" Made once, under a
deadline, by the approver calling `GET /v1/marketing/export`.

**Capability — PRODUCE OR ADMIT.** The export bundle stops asserting completeness it cannot prove,
and instead names every statement the desk cleared and never recorded, by hash, with actor and
timestamp.

**The join.** `marketing_outbound_gate_decision WHERE phase='clearance' AND allowed=true` LEFT JOIN
`marketing_record ON statement_hash = text_sha256`. I verified both hash bodies are the same
expression over the same bytes (`apps/api/src/marketing/outboundGate.ts:166-167`;
`apps/api/src/marketing/record.ts:461`) — a 256-bit content digest, not a name match, with indexes
on both sides and live writers on both.

**The gap is currently 100% by construction.** The clearance path writes a gate row and no record
(`apps/api/src/routes/marketing.ts:465-476`); `writeRecord`'s only caller is a separate manual POST.
`closeOutPublication` and `listOutstandingCloseOuts` have **zero callers**, so
`close_out_state DEFAULT 'outstanding'` stays outstanding forever behind a maintained index nobody
queries. The design anticipated the drift and built no detector.

**Absent data.** If either table is missing the bundle refuses the completeness claim and names the
migration; it never reports "0 unrecorded". Where text was legitimately edited between clearance
and recording, that is `hash_differs` with both digests — its own finding, folded into neither
bucket.

**Cost.** No table, no migration. One LEFT JOIN, one field group, one sentence in the renderer —
roughly one file. Ships with a defect fix: `gateReferenceFrom` mints `gate:<16 hex>` and the Art 90
refusal tells the drafter to quote it to an approver who has no way to resolve it, because no
reader of `text_sha256` exists outside the writer.

### 4.4 COMMAND — criticality is a frequency presented as a magnitude

**Blind decision.** Where the next week of your attention goes, across ~20 open tasks. Ranked by
`criticality` — the *fraction of runs* in which a task sat on the critical path — under the heading
"Highest criticality (drives the date)" (`apps/web/src/pages/CommandDeck.tsx:587-595`). A fraction
is not a magnitude: two tasks can both be critical in every run while compressing one buys nothing,
because a parallel branch takes over.

**Capability — THE BINDING ITEM.** Rank all 24 tasks by how many days of launch one day of
compression actually buys, with each task's slack and the dependency edge that binds it.

**The join — 12,000 simulated paths already run, 7 scalars kept.** The loop at
`packages/shared/src/launchSim.ts:182-210` samples every task's duration per run and computes the
run makespan, then keeps three aggregates. Three accumulators per task per run give
∂makespan/∂duration with a standard error; a reverse pass over the topological order
`prepareGraph` already computes gives slack and P(zero slack). The binding edge is computed and
discarded — `critPred` holds it at `:198`.

**The sibling limb.** `monteCarloForecast` runs 10,000 paths, on every path knows the full winner
set, and returns four scalars (`packages/shared/src/forecast/index.ts:80-107`). Two accumulators
per deal give E[book | won] − E[book | lost]: **which deal decides the quarter.** Both surfaces
rank by expected value today — the wrong ranking when the question is whether the book lands.

**Absent data.** A zero-variance task has an undefined slope and returns `null` with
`ZERO_VARIANCE` — never 0, because 0 means "compressing this buys nothing" and null means the
question does not apply. A slope whose standard error exceeds its magnitude is excluded, not ranked
at a number the runs cannot support. Unpriced deals are named and excluded, never contributed as 0.

**Cost.** ~50 lines in each engine, additive fields, zero migrations, zero inputs. Also here:
**RECESSION RATE** — read `wbr_reports.payload.program` as a series and regress
`week_start + simP50Days` on `week_start`. Slope ≥ 1.0 means the launch recedes as fast as time
passes and never arrives. Refuses below three stored weeks, and depends on the Monday job having
fired, which I cannot verify from the repository.

### 4.5 DISTRIBUTION — a compliance gate arithmetically incapable of failing

**Blind decision.** Whether to launch a token-incentivised campaign. Your compliance evidence is a
`window.prompt` that accepts any four characters
(`apps/web/src/pages/DistributionCampaigns.tsx:82-84`) against a six-line prose checklist citing
MiCA **Art 68** — the wrong title; the live exposure is Title VI.

**And the budget limb cannot fail.** Verified: `registry.ts:800-802` passes
`treasuryBudgetLcx = Math.max(budget, 1)` and `emissionBudget` returns
`withinBudget: emitted <= treasuryBudgetLcx` — i.e. **`budget <= budget`, true for every input.**
A 10,000,000 LCX campaign passes identically to a 1,000 LCX one, and every campaign reports exactly
100% utilisation with status `healthy`, because the breach test is `util > 100`.

**Capability — THE EMISSION WARRANT.** A token-incentivised campaign cannot reach `approved` or
`live` until the Title VI engine has run over the campaign's own public text and the launcher's LCX
position, with refusal codes and the sha256 ledgered as that campaign's warrant. The budget limb
aggregates live and approved emission against a declared cap.

**The join.** `dist_campaigns.name + detail + task labels` → `gateOutboundText`, which extracts
asset symbols **server-side** so the drafter cannot suppress the check. `token_incentivized = true`
fixes the reward asset to LCX by the fee schedule. `dist_campaigns.created_by` →
`marketing_holdings_declaration.member_id`, a CHECK-constrained slug whose stated purpose is that a
display name "cannot land here and fork the register" (`0060_marketing_abuse.sql:308`).

**Absent data.** An unattested register makes `assessMarketAbuse` return `refused` with
`EMBARGO_REGISTER_ABSENT` / `HOLDINGS_DECLARATION_MISSING`, and there is deliberately no flag that
lets an empty register read as clear. `TREASURY_CAP_NOT_DECLARED` is a refusal, not
`withinBudget: true`. Four fabricated figures are deleted, not framed: `cacUsd` 45/38, the `i % 3`
channel scorecard rendered as a reach ranking, the 0.5 LCX→USD rate, and the uncaveated
"1.20 · viral" K-factor built on constants the ontology itself labels "not confirmed metrics".

**Cost.** One call site replacing the tautological limb, one refusal code, deletions, one migration
widening the `phase` CHECK so shadow-mode verdicts are recordable. **Human dependency, stated with
the capability: the launching approver must declare whether they hold LCX** — and refusing to launch
until they have is the control, not a side effect.

### 4.6 INTEL — a 60% suppression written from one unverified number

**Blind decision.** Nobody makes it, which is the problem. `deception_scan` writes a grade-F
`wash_trading_flag` from a single source and `alpha.ts:233` multiplies conviction by 0.4 — a 60%
suppression that removes a real target from Targets, DailyBrief and the I&W list. The threshold is
a hardcoded `TURNOVER_SUSPECT = 2.0` and the detector reads only two columns.

**Capability — TWO WITNESSES.** Every fact two sources report gets cross-examined, and a
disagreement is ranked by whether it actually flips a decision.

**The join.** Witness A: `projects.volume_24h_usd`. Witness B:
`SUM(exchange_listings.volume_24h_usd) GROUP BY project_id` — per-venue volume on a real FK
(`0015_exchanges.sql:7`), upserted with outliers already filtered at source. Witness C on size:
`fdv_usd`, written for every matched token (`apps/api/src/connectors/defillama.ts:112`) and read by
no engine. The materiality gate re-runs scoring with and without the disputed value: a disagreement
that does not move the band is recorded, not escalated.

**Absent data.** No second witness yields no verdict and no change to the existing flag; the token
is `UNVERIFIED` and the single-source flag is downgraded from "suspected" to "unconfirmed — one
source". **v1 publishes the distribution of disagreements before it publishes a verdict on any of
them**, because per-venue volumes differ from the headline for legitimate reasons and treating
every mismatch as a dispute produces noise the desk stops reading.

**Also fixed here, as defects.** `apps/api/src/intel/backfill.ts:33-36` DELETEs every market and
score vintage on each run and re-stamps `observed_at`, destroying the one history that would let a
scoring decision be replayed — on an otherwise append-only table that carries the exact index for a
series read. And the existing calibration loop is **contaminated**: it reads the latest observation
per subject while `alpha.ts:110`/`:201` deliberately apply −40 and −50 once `listed_on_lcx` is true,
so it measures its own penalty.

**Cost.** No migration. Verdicts write as observations under their own predicate with both source
grades. One engine, one aggregate query per sync. Stop the DELETE.

### 4.7 REGULATORY — a monetary parser that strips the M

**Blind decision.** How much capital LCX must post to enter a cohort of states, and the 12-month
outflow. Made by the CFO/CCO on the Capital Calculator — and reprinted in a document whose default
addressees are the board, state regulators, and the **U.S. Securities & Exchange Commission**
(`apps/web/src/pages/BriefGenerator.tsx:218-224`).

**`apps/web/src/lib/formatting.ts:3-16` strips every character except digits, `.` and `K`.** The
`M` branch at `:10` is therefore unreachable: **`'$1M'` returns 1.** And
**`'$100,000-$500,000'` becomes `'100000500000'` → 100,000,500,000.** 27 of 50 states carry a range
surety bond. `BriefGenerator.tsx:160,170` reimplements the same defect.

Both halves of the correct parser already exist in the same directory and neither is reused:
`competitiveScoring.ts:3-11` handles B/M/T/K, and `formatting.ts:25-31` already takes a range's
upper bound.

**Capability — figures that round-trip, or refuse.** Every monetary string must parse to a value
that re-renders to its source string, or the surface prints the source string and refuses to sum it.

**Second capability — THE CLAIM LEDGER.** `claim_id` is a genuine shared identifier across
`marketing_record_claim.claim_id`, `marketing_statement.claims` and `drafts.claims_used` — so
"everywhere this claim was asserted, at which version" is one query. The index for it was built at
`0061_marketing_record.sql:320-321` with a comment naming a read path nobody issues.

**Absent data.** There is no claim review register — the code says so at
`marketingRecord.ts:404-411` — so `buildClaimExpiryLedger` keeps returning `usable: false` and must
never report "0 claims past due". Unresolvable `claims_used` entries are reported with their literal
text and counted separately.

**Cost.** One shared parser plus tests (this compartment has none over any of it), five call-site
conversions, deletions. One read-only route, which gives a compartment declaring `apiPrefixes: []`
its first server-enforced boundary. **Two defects ship as defects:** both copies of
`computeBriefDigest` — a djb2 hash printed as `'sha256_…'` on a signature block — are deleted; and
`messageRules.ts:124-136` validates claim ids by prefix, so `us-path-999` passes, while the approved
library ships a FINRA-affiliated claim that `messageRules.ts:15-24` was written to block.

### 4.8 GOVERNANCE — the markers are written and no code reads them

**Blind decision.** Signing off that a governed decision passed its controls — the board file, the
WBR, a regulator response. Every row in the audit log looks equally clean.

**Capability — THE CONTROL THAT DID NOT RUN.** A standing, ranked register of every governed act
that succeeded while one of its controls was not evaluated, was overridden, or threw — and whether
the missing review was ever filed afterwards.

**The join.** `gateDegraded`, `gateDegradedReason`, `overrideSat`, `overrideGate`, `overrideReason`,
`idempotencyDegraded` land in **both** `audit_log.meta` and `object_actions.params`
(`apps/api/src/actions/registry.ts:1223-1245`) from three call sites in three compartments — the SAT
gate, the campaign launch limb, and the GPS discount limb **firing on every quote today**. A fourth
vocabulary lives in `marketing_outbound_gate_decision.gate_error`. **Zero readers, verified by
grep.** Then join on `(subject_type, subject_id)` to `analytic_reviews` — a join
`registry.ts:788-790` already performs in production.

**Absent data.** Three states, never collapsed: no markers in the window (stating the window and
the earliest reachable row); a row written *before* the marker existed → `UNVERIFIABLE` in its own
bucket with the commit-date boundary named, because absence of a marker on a pre-marker row means
unknown, not clean; and the register labels itself structurally incomplete, covering only
registry-mediated paths. **It never renders "100% of controls passed"** — that claim is unavailable
and the surface says why.

**Cost.** No new table. Two partial indexes on `audit_log`, plus emitting the index that
`apps/api/src/db/schema.ts:442` declares **with no columns and which was therefore never created** —
so every actor- and action-filtered audit read is a full scan today. One union query, one alert rule
in `evaluateAlertRules`, which has six rule families and none for governance. Also here: **THE
SEAL** (make `audit_log` append-only and hash-chained — its DDL is seven columns with no
constraints, while `0029_spine.sql:6` calls it "the hash-chained audit_log" and the only chain in
the repo is a browser-local, clearable, non-cryptographic one) and **AS OF** (replay the grant
ledger to answer "who could see this on date D", which `entitlements` cannot answer because revoke
DELETEs the row).

---

## 5. THE PLATFORM

### 5.1 Foundations — build these or several capabilities die

**F1 — THE HONESTY CEILING.** `assertHonestPayload`
(`packages/shared/src/marketing/observation.ts:569`) is compartment-agnostic and has **exactly one
production caller**, in a browser file (`apps/web/src/lib/api/marketing.ts:129`) — whose own comment
records that it previously had *zero*. Move it into API middleware and the doctrine becomes
mechanical across 76 pages and 223 API files instead of depending on whoever is paying attention.
The $816,500 error in §4.1 is the argument.

**F2 — `platform_forecast`.** The one thing that exists in no form across all 66 migrations. Without
it, nothing can resolve a prediction against an outcome, and every "are we any good" claim stays
unfalsifiable. Note: calibration already exists twice, in silos
(`apps/api/src/intel/calibration.ts`, `apps/api/src/gps/loop.ts:322`) — this unifies rather than
invents, and §4.6's contamination fix is a precondition for either being believable.

**F3 — `notifications.workspace`.** Closes §3's live leak and is the precondition for anything
arriving unprompted.

**F4 — the verdict broker.** Compose, don't invent: spec-filtering at `search.ts:154` plus visible
withholding at `audit.ts:136-155`. Lets one compartment learn *that* another holds something,
and its verdict, without reading it.

**F5 — `partner_registry`. NAMED, NOT BUILT.** Four namespaces name partners and **two migrations
refuse the foreign key in prose.** This permanently blocks a unified partner book and per-partner
margin attribution. It is the only foundation that needs a decision from you before it can exist.

**F6 — THE SEAL.** Everything evidential depends on the audit log being what it claims to be.

### 5.2 The joins that survived

- **THE OTHER LEDGER** — GPS conflict check reads the listing pipeline; a deal reaching proposal
  writes the embargo signal. Your largest uninsured liability (Art 88/90/91(3)(c), €700k personal)
  stops being a free-text paragraph. Joins on `projects.ticker_norm` ↔
  `marketing_asset_embargo.asset_symbol`, both upper-normalised, the latter CHECK-enforced.
- **THE 07:00 READOUT** — one column, one filter, one rank: a per-reader ranked brief where the
  redaction is visible ("3 items withheld") rather than silent.
- **ONE MOUTH** — the Title VI engine runs over sales email and campaign text, not just marketing
  drafts. Ships in **shadow mode first**, producing the count that justifies enforcement before
  enforcement is switched on.
- **PRODUCE OR ADMIT** and **THE CLAIM LEDGER** — §4.3 and §4.7, joined on content hash and
  `claim_id` respectively.

### 5.3 Need-to-know

Every join above either stays inside one compartment's entitlement or passes through F4, which
returns a verdict and a visible withholding count rather than the other side's contents. **A
refusal that tells you something exists without telling you what it is** is how a real
compartmented system behaves, and it is the design here — not a limitation of it.

---

## 6. TRACK B — THE OBJECT

This is what remains of `DIMENSIONAL_100X_PLAN.md`, reduced to what survives the same five tests.
It runs parallel to Track A and shares no dependencies with it.

### 6.1 The boundary that governs everything here

**Blender renders nothing whose shape encodes a number.** A margin surface baked to a bitmap is a
screenshot that will be lying within a month: no date, no source, not re-derivable. Data geometry
stays SVG generated from the pure engines, so an auditor can recompute it. Brand objects — an icon,
an installer plate, a hero still — carry no number, and there Blender is the right tool.

That line is not aesthetic conservatism. It is the same honesty doctrine as F1, applied to pixels.

### 6.2 Measured on the M1 — not assumed

Blender **5.2.0 LTS** installed, `blender` on PATH at `/opt/homebrew/bin/blender`, `uv` 0.12.1.
Cycles + EEVEE + Workbench available. Metal device `Apple M1 (GPU - 8 cores)` detected. All numbers
below are from `scratchpad/bl_smoke.py` and `bl_bench.py` on this machine.

**The colour finding, measured by decoding the output PNG's bytes.** Brand blue `#2C6BFF`
(`apps/web/tailwind.config.js:28`) round-trips **exactly under `Standard` and nothing else**:

| view transform | `#2C6BFF` renders as |
|---|---|
| **Standard** | **#2C6BFF — exact** |
| Khronos PBR Neutral | #2563EF |
| **AgX — Blender's default** | **#467ECF** |
| Filmic | #2F75CE |
| Filmic Log | #6E96C1 |
| Raw | #0625FF |

Left on the default, every brand asset ships in a colour that is not yours. So
`scene.view_settings.view_transform = "Standard"` is a hard rule in the render config, with AgX
reserved for photographic shots where no hex is being matched.

**Device: GPU at production size, and the first number lies.**

| resolution | samples | GPU | CPU |
|---|---|---|---|
| 480² | 64 | 2.46s | **1.60s** |
| 1024² | 128 | **12.4s** | 21.2s |
| 2048² | 128 | **48.9s** | 99.3s |

Metal is ~2× at 2048², and 8 GB unified held fine. The first Metal render pays ~190s of kernel
compilation, then caches — a cold number read as render cost would have wrongly condemned the GPU.

**Four headless gotchas, each of which cost a run.** `--factory-startup` disables addons and Cycles
*is* an addon. `--factory-startup` still loads the default scene, whose cube sits at the origin and
gets photographed instead of your object. Dynamic enums cannot be introspected — probe by
assignment. And reading colour back through Blender's image loader applies a transform you cannot
account for; decode the PNG bytes.

### 6.3 What ships

- **The DMG plate.** `apps/desktop/src-tauri/tauri.conf.json` has `appPosition`,
  `applicationFolderPosition` and `windowSize` and **no `background` key** — the installer window is
  default white. It is the last surface a colleague sees before Gatekeeper. One PNG, three lines.
- **The icon**, refined. `sips` and `iconutil` are already on the machine.
- **The traffic-light inset.** `titleBarStyle: "Transparent"` with zero `data-tauri-drag-region`
  hits means macOS chrome sits on the wordmark. Not 3D at all, and it must be fixed before anything
  claims to be a machined object.
- **Data geometry as SVG** — a small pure module (`packages/shared/src/geometry/`) plus renderers,
  5–9KB each on already-lazy routes, so zero initial bytes and no new dependency.

**Blocker, and it comes first:** `apps/web/scripts/check-bundle.mjs:47` filters
`.endsWith('.js')` inside `dist/assets`, so `public/` is never measured — **744KB is invisible
today** and a 40MB asset tree would land green. A 2048² RGBA PNG is 2.0MB, which is why web imagery
ships WebP/AVIF and why this hole closes before the first asset.

**Not promised:** that Blender belongs in CI. It does not — ~400MB of runner image for assets that
change twice a year. Renders are committed alongside their `.blend` and script, and regenerating is
a deliberate human step.

---

## 7. TRACK C — THE MACHINE THAT BUILDS IT

A plan this size fails in the delivery, not the design. So the apparatus is part of the plan.

Every rule below is derived from something that **actually went wrong on this codebase in the last
few days**, not from general practice. That is the only reason to trust any of it.

### 7.1 The loop

One loop per phase, same eight steps, no step skippable. A phase is not done because the code is
written; it is done when the evidence exists.

```
  CLAIM  →  BUILD  →  GATE  →  ADVERSARY  →  EVIDENCE  →  SHIP  →  RATCHET  →  CARRY
```

**CLAIM — write the falsifiable claims before the code.** Each phase opens with a list of
statements that will be true when it lands, each paired with the command that would disprove it.
A phase whose claims cannot be disproved has no exit condition, and "it works" is not a claim.

**BUILD.** Lanes may run in parallel only where they touch disjoint files. Two lanes in one file is
not concurrency, it is a merge conflict with extra steps.

**GATE — the real one, and both jobs.** `npm run ci-check` is what CI runs; run *that*, not a
subset. It must include real `tsc` **emit** builds in Docker order (shared → api → web), because
type-checking without emit lets an api type error through and kills the Render deploy. **And CI has
TWO jobs** — `type-check · test · build · perf-budget` and `playwright screenshots + interaction
smoke` — where **job 2 is skipped when job 1 fails.** A green job 1 therefore proves nothing. I read
job 1 as "CI green" for three consecutive pushes while job 2 was red. The gate script must fail if
it cannot see both.

**ADVERSARY — try to break what you just built, before anyone else does.** Not a review; an attack.
This is non-negotiable because of a specific event: a fix pass in this session broke two things and
overclaimed a third, and it was caught *only* because an adversarial audit ran afterwards. Without
that pass it would have shipped. Minimum: every new refusal gets a test that it actually refuses;
every new figure gets a test that absent input yields no number.

**EVIDENCE — the command and its output, or it did not happen.** "Tests pass" is not a report.
The phase record carries the invocation and the numbers. I have overclaimed a gate result three
times in this session; the only defence that worked was pasting output.

**SHIP.** One push per phase, to `lcx-sales dev:main`. Then verify the deployed thing, not the
build log.

**RATCHET — lock the win so it cannot silently regress.** Every phase that fixes something adds the
guard that keeps it fixed. The perf budget, the reachability pin and the desktop version guard all
exist because something already slipped past once.

**CARRY.** What was learned goes into the next phase's CLAIM list. That is the loop closing.

### 7.2 The stop condition — the most expensive lesson here

**Two consecutive gate failures for reasons unrelated to the diff → stop and escalate. Do not
re-run.**

A ship lane in this session spent **5.5 hours** re-running a gate that was failing for reasons that
had nothing to do with its own changes. It never stopped to ask why. A machine that cannot
distinguish "my change is wrong" from "the gate is broken" will burn a day proving neither.

The corollary: **never trust a lane's reported numbers.** Re-run the gate at the top level. That
caught three overclaims in one session.

### 7.3 The five ratchets, and what each one already caught

| Ratchet | Why it exists |
|---|---|
| **Perf budget** (`apps/web/scripts/check-bundle.mjs`) | Prevents the 500KB-monolith return. **Currently counts `.js` only, so `public/` is unmeasured — 744KB invisible today. Track B cannot start until this is fixed.** |
| **Reachability pin** (`apps/web/e2e/keyboardday.spec.ts`, `expect(missing.length).toBe(23)` over a 30-action manifest) | Adding a governed action moves it and reddens CI. Regenerate with `npm run gen:actions` — **never hand-edit.** Track A adds governed actions in four compartments, so this will move; each lane must expect it. |
| **Version guard** (`launch.test.tsx`) | I bumped the desktop version *after* my last test run and pushed. It caught me, and its own comment says it exists for exactly that. It then surfaced a second stale constant the same push would have carried. |
| **Emit-order gate** | Type-check without emit passes while the Docker build fails. |
| **Doctrine linter** (new, ships with F1) | `assertHonestPayload` reached production with **one** caller and previously **zero**. A doctrine with no enforcement decays to decoration. CI must fail when a new figure-bearing payload ships without an `ObservationFrame`. |

### 7.4 Migration numbers are a lease, not a guess

Two lanes were both told to write `0058`. GPS had silently taken `0057` and `0058`, so marketing's
work had to be renumbered to `0059`–`0061` mid-flight.

Rule: a lane **claims** its number against the migrations directory at the moment it starts writing,
and the number appears in its CLAIM list. Latest is `0066`; next free is `0067`.

### 7.5 The lane contract

Binding on every parallel lane, human or agent:

- **Never run `git reset`, `checkout`, `stash`, `clean` or `restore`.** One agent did and briefly
  deleted `packages/shared/src/marketing/`. Nothing was lost, and only because 633 engine tests
  proved it.
- Write only inside your declared file set. Declare it up front.
- Do not "fix" a flake by raising a timeout. `testTimeout` is already 20s in both vitest configs
  with the measured numbers in a comment. The flakes were CPU/IO starvation, not clock collisions —
  I misdiagnosed that once and the wrong fix would have hidden it.
- If your diff needs a ratchet moved, say so in CLAIM. Moving one silently is the failure mode the
  ratchet exists to prevent.

### 7.6 The deliberate-absences register

This plan is full of capabilities whose correct output is a refusal — no comparables, no rate card,
no second witness, no stored history. **Every one of those needs a test that it refuses**, because
an untested refusal is a silent default waiting to happen. The register lists each absence, the
code that must refuse, and the test that proves it. It is reviewed at every SHIP.

This is the same principle as F1 one level up: the honesty of the system has to be mechanical,
because — as §4.1 shows — even the audit of a fabrication reproduced the fabrication's own error.

### 7.7 What this costs

Roughly one phase's worth of effort spread across all of them: the gate script change, the doctrine
linter, the absences register, the evidence format. Set against 5.5 hours lost to one thrash and
three pushes made on a misread CI signal, it pays for itself inside the first phase.

**Not promised:** that this eliminates rework. It converts silent rework into loud rework, which is
the achievable goal.

---

## 8. THE SEQUENCE

**P0 — THE LEAK.** §3, plus F3. Days, not weeks.

**P1 — THE SCALE AND THE CEILING.** F1, then MARK TO CONTRACT, THE FLOOR, THE BINDING ITEM, and
the parser fix. Four fabrication families deleted. **No new tables.** Ships: real prices, a floor,
and two lists ranked by days rather than frequency.

**P2 — THE PERIMETER.** F4, THE OTHER LEDGER, THE EMISSION WARRANT, ONE MOUTH **in shadow mode** —
producing the number that justifies enforcement rather than assuming it.

**P3 — TOLD, NOT ASKED.** THE 07:00 READOUT with its own observation frame and withheld count; THE
CONTROL THAT DID NOT RUN; PRODUCE OR ADMIT.

**P4 — THE MARKS.** F2, TWO WITNESSES, the contamination fix, RECESSION RATE. **Its honest headline
is likely a refusal** — too little history to claim calibration — and that is stated up front
rather than discovered later.

**P5 — THE RECORD.** THE SEAL, AS OF, the audit index that was declared and never created.

**Track B runs alongside from P1**, gated on the bundle-budget fix. It shares no code with Track A,
so it cannot block it.

**Track C is not a phase — it wraps every phase.** Its own build (the gate-script fix, the doctrine
linter, the absences register, the evidence format) lands inside P0 alongside the leak fix, because
every phase after it is run through the loop. P0 is therefore the only phase not fully protected by
the machine, which is a reason to keep it small.

---

## 9. WHAT THIS COSTS, AND WHAT COULD FAIL

**Code.** Two new tables (`platform_forecast`, `partner_registry` — the latter only if you approve
F5), three or four small migrations, one middleware, six or seven shared engines, and a meaningful
amount of deletion. Present LOC is 338,317; my estimate for this programme is **+105k to +160k**,
landing near 460k — with the caveat that the last 60 commits ran 209,535 insertions against 1,059
deletions, and if that ratio holds here the plan has failed at one of its stated aims.

**What could fail.**

- **The refusals may be the deliverable.** If `extract.ts` has never run on production, if the
  Monday WBR job has never fired, if no partner name is ever typed — then several capabilities ship
  as honest refusals rather than answers. That is the correct behaviour and it will still feel like
  nothing happened.
- **Deleting fabricated numbers makes surfaces emptier before it makes them truer.** Four
  compartments will visibly lose figures. There is no version of this where that does not happen.
- **F5 may simply be declined**, and then the partner items are permanently dead. Stated, not
  hedged.
- **Shadow mode may show the Title VI gate would fire constantly**, in which case enforcement is a
  business decision I cannot make for you.
- **Nobody may use the 07:00 readout.** A briefing that arrives unprompted still has to be worth
  opening.

---

## 10. KILLED — 32 of 45

The kills are load-bearing: they are the evidence this was filtered rather than generated.

**Extending the ontology with the missing node types.** Proposed independently by three audits —
**including by me, in this conversation.** I claimed `apps/api/src/graph/links.ts:20` knows nothing
about GPS engagements or marketing drafts and called that "the Palantir gap". It died on the costume
test, and the proof is in this plan: THE OTHER LEDGER performs the sales↔marketing join through
`ticker_norm ↔ asset_symbol` **without touching `links.ts` at all.** `links.ts` is inspector
navigation — a UI registry. I mistook a UI registry for the join capability, which is precisely the
error I had criticised in my own two rejected plans.

**Fuzzy / LLM entity resolution.** `marketing_holdings_declaration.member_id`'s CHECK
(`0060:308`) exists specifically to stop a display name landing there. Building this means
presenting a probably-true fact to an approver on the highest-liability judgement in the business.

**Giving the shared machine key GPS access so a cron could run this overnight.**
`machineAccess: false` is the design — `entitlements.ts:50-58` states that "a `decided_by` of
'operator' would be an audit row naming nobody". Told-before-you-ask gets delivered at sign-in, not
at 03:00.

**Four survivors I cut after the agents passed them.** THE 402 LEDGER (measures demand for
payloads its own code calls "Illustrative" stubs — fails test 1 outright). THE FILING ORDER
(precision theatre: 50 states of hand-typed literals where `sourceAuthority: 1` is documented as
"direct statute/regulator" and not one row carries a citation or as-of date). WHO KNEW (its author
conceded the honest version is "a candidate set to interview from, not a list", and the Art 90
population that matters is people told verbally, which it cannot see — a capability whose output
must never be used as its name suggests should not be on a plan). THE TEMPLATE SPINE (trigram at
0.75 over short social replies is a false-positive engine).

**Also killed:** perimeter-as-terrain (all 15 `PERIMETER_PROFILES` cells are unreviewed
placeholders, so drawing a wall smuggles a legal finding `perimeter.ts` refuses to encode); the
delivery-drift solid (`ProgressDisplay`'s `blocked` variant has no `pct` field — the geometry
demands exactly the lie the engine withholds); the treasury runway surface (arithmetic over two
localStorage guesses); the funnel cone (`marginal` is linear in budget, so it would imply a
saturation the model does not model).

---

## 11. WHAT ONLY YOU CAN DO

Three of these block. The rest can wait.

**BLOCKING**

1. **May a named human assert a partner name and rate card, attributed to them?**
   `Yes` / `No — partner items stay dead`
   *(F5 and THE FLOOR both stop here. The bootstrap deadlock in §4.2 makes "no" a permanent no.)*

2. **May GPS read the listing pipeline — verdict only, logged?**
   `Yes` / `Sales-side only` / `No`
   *(THE OTHER LEDGER, i.e. the €700k exposure, stops here.)*

3. **Do you declare whether you hold LCX, per asset, with a renewal date?**
   `Yes` / `No`
   *(THE EMISSION WARRANT stops here. Art 91(3)(c) is personal liability, not corporate.)*

**NOT BLOCKING — needed at P2/P4**

4. After the shadow count lands, enforce the Title VI gate on sales email and campaigns?
   `Enforce` / `Distribution only` / `Stay shadow` / `Kill`
5. Quarterly LCX emission cap — a number, or `no cap` (the gate then refuses instead of passing)?
6. `audit_log` retention period and free-text minimisation — `your ruling` / `DPO first`?
7. Has the Monday `wbr` job ever run on production? `Yes` / `No` / `I'll check`
8. Will counsel position the 19 claims × jurisdiction, or does that gate stay report-only?

**MINE, NOT YOURS** — running `extract.ts` against production, and
`SELECT count(*) FROM exchange_listings WHERE exchange_id='lcx'`. I'll do both and report; neither
needs a decision.
