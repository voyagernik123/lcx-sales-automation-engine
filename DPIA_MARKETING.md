# DPIA — Per-handle scoring in the marketing compartment

> ## DRAFT PREPARED FOR REVIEW — UNSIGNED — NOT APPROVED
>
> **Status:** `DRAFT`
> **This document has not been reviewed, accepted, or signed by anyone.**
> It was prepared by an engineering agent reading the code and the research
> dossiers. It is **not legal advice**, it is **not a completed DPIA**, and it
> **does not authorise the processing it describes**. Nothing in it may be cited
> as a DPIA reference until the signature block in §12 is filled in by a named
> human.
>
> Until that happens the capability it concerns is **refused in code** —
> `scoreHandleOverTime` at `apps/api/src/marketing/record.ts:1981` returns
> refusal `RECORD_DPIA_ABSENT` (`GDPR Art 35(3)(a)`), and there is no production
> call site anywhere in the repository. See §11 for the exact change that would
> turn it on, and why the decision is deliberately a single line of code.

| | |
|---|---|
| Subject | Per-handle scoring / risk history over time, marketing reply compartment |
| Controller | **PLACEHOLDER — NOT CONFIRMED.** Presumed LCX AG; the owner must state it. §12 O1 |
| Regime | Regulation (EU) 2016/679 (GDPR), Art 35 |
| Trigger | Art 35(3)(a) — systematic and extensive evaluation of personal aspects |
| Prepared | 2026-08-03 |
| DPO consulted (Art 35(2)) | **No.** Not done. Required before signature. |
| Signed | **No.** See §12. |
| Reference id, once signed | *(none — a reference does not exist yet)* |

---

## 1. Why this document exists at all

The compartment triages public replies sent to LCX's X account. Triaging the
message in front of you is ordinary processing. **Accumulating a judgement about
the person behind it — a reputation score, a "difficult account" flag, a
bot-likelihood that persists across their posts — is a different activity**, and
it is the activity Art 35(3)(a) names: a systematic and extensive evaluation of
personal aspects relating to natural persons based on automated processing,
including profiling.

The adversarial research pass reached the same line independently and drew it in
the same place (`mkt-r5-adversary.md` §6, "DPIA"): computing signals *per reply*
and storing none stays outside the Art 35 box; storing a score *per handle over
time* is inside it, because "evaluation or scoring" is the first criterion in the
EDPB/WP248 DPIA guidelines. Two further WP248 criteria are arguably met already —
use of innovative technology (an LLM in the drafting path) and, weakly, data
concerning vulnerable data subjects.

The capability was built to the point of its own refusal and stopped there. This
document is the paperwork that a human must actually do before it can go further,
and §11 is the single place the decision lands in code.

**Scope of this assessment.** Per-handle scoring only. It does **not** assess, and
must not be read as approving:

- the existing queue, triage, and draft-assistance processing (that runs today on
  the basis discussed in §3 and has its own unclosed gaps, listed in §3.2);
- any follower-graph, profile-enrichment, or cross-post identity building — named
  out of scope in the header of `apps/api/src/db/migrations/0046_marketing.sql:17`.
  That is a stated design limit, not a database constraint, and nothing is built;
- automated *decisions* about a data subject. Nothing in the compartment can post,
  block, report, or restrict anyone. Art 22 is therefore not engaged today, and
  §5.6 explains why that is fragile rather than settled.

---

## 2. What would be processed, and whose data

### 2.1 The fields, and where they come from

Everything below is already parsed from a forwarded X notification email by
`apps/api/src/marketing/xNotificationParse.ts`. Scoring would introduce **no new
collection** — it changes what is *derived and kept*, which is the whole point.

| Field | Source | Personal data? |
|---|---|---|
| Author handle | `xNotificationParse.ts` (`authorHandle`) | Yes — a direct identifier |
| Display name | subject-line extraction (`subjectDisplayName`) | Yes, often a real name |
| Reply body text | body extraction (`extractBody`) | Yes; unpredictable content (see §5.4) |
| Post timestamp / received timestamp | notification headers | Yes, in combination |
| Parent post id | notification | Not by itself |
| **Derived, new:** a per-handle score or band | this capability | Yes — and it is an *opinion about a person* |
| **Derived, new:** a per-handle history of prior scores | this capability | Yes — and it is the Art 35(3)(a) trigger |

The last two rows are the entire delta. A score is not a copy of a fact the data
subject published; it is an inference LCX manufactures about them and then keeps.

### 2.2 Whose data

1. **Members of the public who replied to an LCX post.** The dominant category and
   the one this assessment is really about. They did not contact LCX to enter a
   relationship; many are not customers, some are commenting on a thread they did
   not start. They have no account with LCX, no notice from LCX, and no reason to
   expect a firm is keeping a running judgement of them. §5 is written from this
   person's position.
2. **Customers** raising a complaint in public.
3. **Impersonators and scam accounts** — the operational motivation for scoring.
   They are still data subjects, and an assessment that quietly assumes the
   scoring only lands on them is the assessment that fails, because a scorer
   cannot know which category a handle is in until after it has scored them.
4. **Bystanders named inside a reply's text.** Collected incidentally, never the
   subject of the row, and invisible to any per-handle key.

### 2.3 What the scoring could and could not see

Stated because a DPIA that overstates the capability also overstates the
safeguards. From the notification mail, the following are **available**: handle
string (so typosquat / homoglyph distance against LCX's real handles), display
name, body text, arrival and post timestamps, parent post id, and template reuse
across the queue. The following are **not available and no parsing will produce
them**: account age, follower or following counts, verified status, profile image,
bio, and anything about accounts that reply to *customers* rather than to LCX.

Consequence for proportionality (§4): a per-handle "risk history" built on this
data would be a judgement formed from a partial view — only the subset of a
person's behaviour that happens to touch LCX's own threads — while reading, to
anyone who sees it, like a judgement about the person.

---

## 3. Lawful basis

### 3.1 The basis relied on, and the assessment that is missing

The basis is **Art 6(1)(f), legitimate interests**: answering people who write to
LCX in public, and protecting customers from impersonation. Consent is
unobtainable (there is no channel to the data subject before processing begins);
contract does not fit (the replier is frequently not a party to one); legal
obligation does not fit (no rule obliges LCX to score a handle).

> **THERE IS NO LEGITIMATE-INTERESTS ASSESSMENT ON FILE.**
>
> This is stated plainly because it is the load-bearing gap. Art 6(1)(f) is not
> self-executing: it requires a documented balancing of LCX's interest against
> the interests, rights, and freedoms of the data subject, and in particular
> against their reasonable expectations. The research pass found no LIA
> (`mkt-r5-adversary.md` §6, "Lawful basis"), and the code says so out loud
> rather than papering over it — the Art 15 subject-access answer returns the
> sentence "NO legitimate-interests assessment is on file today" to the data
> subject themselves (`apps/api/src/marketing/record.ts:1788`).
>
> A DPIA cannot substitute for the LIA and does not contain it. **Signing this
> document without an LIA behind it would leave the scoring resting on a basis
> nobody has assessed.** That is open question O2 in §12.

Note the direction of travel: the existing purpose limits — no profile
enrichment, no follower graph, no cross-post identity building — *are* the
necessity argument that makes Art 6(1)(f) tenable for the queue today. Per-handle
scoring erodes exactly those limits. So the feature does not merely need its own
assessment; it weakens the basis for the processing already running.

### 3.2 Related duties that are open today

These are not caused by scoring, but scoring makes each of them heavier, so a
reviewer needs them in front of them.

| Duty | State |
|---|---|
| Art 14 notice (data not obtained from the subject) | **No privacy notice is referenced anywhere in the repository.** The Art 14(5)(b) disproportionate-effort argument is far stronger if lcx.com states that public replies are triaged and retained. Scoring makes silence harder to defend. |
| Art 21 objection | **No mechanism.** A 6(1)(f) subject can object; there is no route to lodge one and no field to record one. |
| Art 15 access | Implemented — `subjectAccess`, `record.ts:1729`. |
| Art 17 erasure | Implemented — `eraseByHandle`, `record.ts:1862`. |
| Art 30 transfer register | Table and writer exist (`recordProcessorTransfer`, `record.ts:1643`) but **have no production call site** — see §6. |
| Art 35(2) DPO consultation | Not done. |

---

## 4. Necessity and proportionality (Art 35(7)(b))

**The operational need is real.** Fake-support accounts replying under LCX threads
cause direct, monetary harm to customers who follow them. Detecting them fast is a
legitimate interest with a customer-protection edge, which is the strongest form
of the argument.

**But the need does not reach as far as the proposed means.** Three points a
reviewer should press on:

1. **Per-reply signals achieve most of the purpose without the trigger.** Handle
   distance from LCX's real handles, a display name claiming to be LCX support, a
   scam-lexicon hit, a URL or address in an inbound reply, and template reuse
   across the queue are all computable *from the message in front of you*, and all
   of them fire on the first offending reply. A per-handle history mostly adds
   *recall on repeat offenders* — a genuine but incremental gain, bought with the
   entire Art 35(3)(a) exposure.
2. **A hash is more proportionate than a history.** The strongest available bot
   signal is the same body text arriving from many handles. A normalised shingle
   hash plus a count over the retention window delivers it while storing no
   per-person judgement at all.
3. **The output shape matters more than the accuracy.** A named, individually cited
   signal list ("handle is one edit from @lcx", "display name claims LCX support",
   "same text seen from 6 other handles this week") with an explicit
   "signals we cannot see" list is defensible to a regulator asking how a number
   was produced. A 0–100 risk score is not, and is not more useful.

**Data minimisation.** If scoring proceeds, the minimising design is: key on
`handlePseudonym` (`record.ts:483`, SHA-256 of the normalised handle) rather than
the handle; store the signal names that fired, not free text; store no copy of the
reply body in the score row; and expire the score on the same clock as the content
that produced it (§7). None of that is implemented — it is the design the reviewer
would be approving, not a description of code that exists.

---

## 5. Risks to the data subject

Written from the position of the person in §2.2(1): a member of the public who
replied to a tweet. They are the hardest case and the right one to design against.

### 5.1 A permanent judgement formed from a partial view
LCX sees only the fraction of their behaviour that touched LCX's own threads
(§2.3). A score built on that fraction is nonetheless read by every internal
viewer as a judgement about the person. **Severity: high. Likelihood: certain if
the feature ships as a score.** This is inherent to the design, not a bug in it.

### 5.2 The score outlives the reason for it
Content expires on the retention sweep. A derived score, if stored on its own
clock or on no clock, becomes an assertion about a person whose evidential basis
has been deleted — unchallengeable, because the underlying reply is gone. **Severity:
high. Likelihood: high absent an explicit expiry (§7).**

### 5.3 Wrong-person harm
Handles are reassigned. Homoglyph and edit-distance logic is *designed* to treat
lookalike handles as related, so a person whose legitimate handle happens to sit
one character from LCX's gets scored as an impersonator. A person with a common
display name inherits someone else's history. **Severity: high — the harm lands on
someone who did nothing. Likelihood: moderate, and rising with volume.**

### 5.4 Unpredictable special-category content (Art 9)
Replies contain health, political, and religious content at random — LCX does not
solicit it and cannot filter it before it arrives. Feeding reply text into an
inference that is *retained per person* risks a stored judgement that is
effectively derived from Art 9 data. **Severity: high. Likelihood: low per row,
approaching certain across a corpus.** The current mitigations are short retention,
no enrichment, and using text only to answer; a per-handle score removes the third.

### 5.5 Asymmetry: no notice, no objection, no knowledge
They were never told (no privacy notice, §3.2), cannot object (no Art 21
mechanism), and would only learn a score exists by submitting an access request
they have no reason to suspect is warranted. **Severity: moderate to high.
Likelihood: certain** — this is the state of the world today, not a hypothetical.

### 5.6 Drift from "assist a human" to "decide about a person"
Nothing today can post, block, or report. But a stored band is exactly the field a
future feature auto-filters, auto-hides, or auto-reports on, and at that point
Art 22 engages and the data subject acquires rights nobody has built for.
**Severity: high if reached. Likelihood: moderate over time** — this is how scoring
features normally end up, and no code prevents it.

### 5.7 The score leaving the compartment
A reputational band is the kind of field that gets joined to a CRM row, exported
to a spreadsheet, or shown in a screenshot. Once outside, the caveats in §2.3 do
not travel with it. **Severity: high. Likelihood: moderate.**

### 5.8 Breach or insider browsing of a reputational dataset
A per-handle score table is a more attractive and more damaging target than a
queue of public tweets, because it contains LCX's *opinions*, which are not public
and are embarrassing to have leaked — to LCX and to the people scored.
**Severity: moderate to high. Likelihood: low.**

---

## 6. The transfer to the AI provider

Reply text already leaves the EU today, before any scoring exists.

- The drafting path calls `apps/api/src/ai/llm.ts`. Provider precedence is
  Anthropic when `ANTHROPIC_API_KEY` is set (`llm.ts:30`), otherwise OpenRouter
  (`llm.ts:32`), otherwise no model call at all and the caller keeps its
  deterministic text. **Both configured providers are US-based**, and OpenRouter
  routes onward to further model providers — a processor chain, not a single
  processor.
- What goes out is narrow: the single reply's text and handle, `maxTokens: 220`,
  `temperature: 0.4` (`apps/api/src/ai/socialReply.ts:153-154`). Prompt text is not
  persisted locally.
- **This is a third-country transfer** and needs a DPA and Art 46 SCCs, or the
  EU–US Data Privacy Framework where the specific provider is certified, plus an
  Art 30 entry. Which instrument covers which provider is a question for a human
  with the contracts in front of them (open question O3, §12).
- The register to hold that answer exists: `recordProcessorTransfer`
  (`record.ts:1643`) refuses rather than defaulting, forcing the caller to state
  the processor, the purpose, whether third-party personal data was in the
  payload, and whether it left the EEA. Its `transfer_basis` may honestly be
  `not_assessed`, which is today's true value.
- **But it has no production call site.** Verified by search: the only callers are
  its own unit tests. So no per-row evidence exists that a given person's words
  were disclosed to a US provider, which is precisely what an Art 15 answer needs.
  Wiring it is not in this document's scope and is named here so it is not lost.

**If scoring ships and the score is computed by a model**, the transfer stops being
"text sent out to draft a reply" and becomes "a person's data sent out to have a
judgement formed about them". That is a materially different transfer and would
need its own assessment. **Recommendation: any scoring must be deterministic and
local.** The signals in §4 all are.

---

## 7. Interaction with retention

This is where scoring collides with an unresolved question rather than a settled
rule, and the reviewer needs to see the collision.

- Third-party content runs on `MARKETING_RETENTION_DAYS`, default **90 days**
  (`apps/api/src/marketing/service.ts:18`), swept by
  `runRetentionClock` (`apps/api/src/marketing/retention.ts:716`).
- LCX's own cleared statements run on an inferred **five-year** clock, extendable
  to seven (`RETENTION_YEARS_BASE`, `record.ts:304`), read off MiCA Art 68(9) —
  which is a CASP records article that does not say "marketing". The code carries
  this as an inference, not a citation: `RETENTION_BASIS` (`record.ts:313`) names
  the theory and `RETENTION_INFERENCE_CAVEAT` (`record.ts:319`) is printed in
  every bundle.
- **These two periods contradict each other for the same bytes**, and the
  contradiction is unresolved. `RETENTION_DPO_RULING_OUTSTANDING`
  (`record.ts:331`) states the open question in code so it cannot be forgotten:
  may LCX's own published statements be retained past the 90-day sweep, and may a
  minimised excerpt of the third-party message they answered be retained with
  them?

**What that means for a score.** A per-handle score is neither an LCX statement nor
third-party content, so **it falls into the gap between the two clocks and would
inherit no expiry by default.** A score with no clock is the §5.2 harm exactly:
an assertion about a person that survives the deletion of its own evidence.

Therefore: **the DPO ruling behind `RETENTION_DPO_RULING_OUTSTANDING` should be
obtained before, not after, this DPIA is signed** (open question O4, §12). If
scoring is approved regardless, the minimum condition is that the score expires
with the newest content that contributed to it, and that erasure under Art 17
deletes the score — `eraseByHandle` (`record.ts:1862`) does not currently know
about a score table, because none exists.

---

## 8. Mitigations actually implemented

Only things that exist in code today. Each is a file reference a reviewer can open.

| # | Mitigation | Where | Addresses |
|---|---|---|---|
| M1 | **The capability refuses.** `scoreHandleOverTime` returns `RECORD_DPIA_ABSENT` citing `GDPR Art 35(3)(a)` unless a DPIA reference is supplied. It is deliberately synchronous and I/O-free, so it is impossible to reach a query through it. | `record.ts:1981`, code at `:140`, rule text at `:223` | The whole of §5 |
| M2 | **No production call site.** Nothing in `apps/api/src`, `apps/web/src`, or `packages/shared/src` calls it outside tests, so no route, job, or surface can reach it. Pinned by a test — `__tests__/dpiaGateSource.test.ts`. | repository-wide | §5.6 drift |
| M3 | **Handle pseudonymisation exists.** `handlePseudonym` is SHA-256 over the normalised handle, so the register never holds a handle in the clear. | `record.ts:483` | §5.8 |
| M4 | **Art 15 access is real.** `subjectAccess` returns what is held for a handle *and* the honest sentences — including that no LIA is on file and that nothing scores a handle over time. | `record.ts:1729`, notes at `:1788-1796` | §5.5 |
| M5 | **Art 17 erasure is real**, cascades to drafts, NULLs third-party excerpts inside LCX's retained records, reports what it retained and under which exemption, and logs *that* an erasure happened rather than what was erased. | `record.ts:1862` | §5.2 |
| M6 | **Art 30 transfer register refuses rather than defaults** — a caller cannot log a transfer without stating processor, purpose, third-party-personal-data, and EEA exit. A register that read clean because nobody answered would be worse than none. | `record.ts:1643` | §6 |
| M7 | **Retention is not on the ingest tick.** The clock runs independently, so disabling the mail poller cannot silently stop deletion. | `retention.ts:716` | §5.2 |
| M8 | **Retention env is validated.** A non-numeric `MARKETING_RETENTION_DAYS` refuses instead of building a `NaN` interval. | `record.ts:390` | §5.2 |
| M9 | **The queue read does not ship raw email bodies to the browser.** Named column list, `raw_email` excluded, pinned by a source-level test. | `service.ts`, `__tests__/queueDataMinimisation.test.ts` | §5.4, §5.8 |
| M10 | **The inference is labelled as an inference.** The retention theory is carried as `RETENTION_BASIS` + `RETENTION_INFERENCE_CAVEAT` and printed in every bundle, and the open DPO question is carried in code. | `record.ts:313`, `:319`, `:331` | §7 |
| M11 | **Only the single reply's text and handle leave for the model**, and prompt text is not persisted locally. | `socialReply.ts`, `llm.ts` | §6 |

## 9. Mitigations NOT implemented

Listed so that §10 is not read as a shorter list than it is.

- **N1 — No LIA.** §3.1. The basis under the whole compartment is unassessed.
- **N2 — No privacy notice** to satisfy Art 14 / support Art 14(5)(b). §3.2.
- **N3 — No Art 21 objection mechanism.** §3.2.
- **N4 — The Art 30 transfer register is not wired.** §6. It exists and nothing calls it.
- **N5 — The DPO has not been consulted** (Art 35(2)) and the retention ruling behind `RETENTION_DPO_RULING_OUTSTANDING` is outstanding. §7.
- **N6 — No score expiry, no score-aware erasure, no score table.** There is nothing to expire because the feature does not exist; the point is that these must be built *before* it does, not after. §7.
- **N7 — CLOSED, 2026-08-03.** The gate accepted any non-empty string as a DPIA reference: `scoreHandleOverTime(handle, { dpiaRef: 'anything' })` succeeded. The change in §11.2 has now been applied — `PER_HANDLE_SCORING_DPIA` exists in `record.ts` and is `null`, and the reference must *equal* it — so no string opens the gate and `grep PER_HANDLE_SCORING_DPIA` answers "is scoring on?" in one line. What is **not** closed is the decision: §12.2 is still unsigned, and the constant may only be set by whoever signs it. Pinned by `dpiaGate.test.ts` ("no string opens the gate while the DPIA constant is null").

## 10. Residual risk

**Residual risk with the capability OFF (today's state): LOW.**
The processing that actually runs is triage of public replies, on Art 6(1)(f), with
erasure and access paths built and a validated retention clock. The residual
exposure is N1–N3 — an unassessed basis, no notice, and no objection route — which
are real and are the owner's to close, but they concern the queue, not scoring.
No score is computed, stored, or reachable.

**Residual risk if the capability is switched on as designed in §4's minimising
form — pseudonymous key, named signals not a number, no body copy, expiry tied to
the content clock, erasure-aware, deterministic and local: MEDIUM.** §5.1 and §5.3
do not go away. They are inherent: a judgement formed from a partial view, landing
sometimes on the wrong person.

**Residual risk if it is switched on as a stored 0–100 per-handle risk score with
no expiry, or computed by the model provider: HIGH, and in this author's
engineering view not acceptable.** That configuration realises §5.1, §5.2, §5.4,
§5.6, and §6 simultaneously, on a basis nobody has assessed (N1), with no notice
(N2) and no way to object (N3).

**This assessment does not conclude that the processing may proceed.** Art 35(7)(d)
requires the measures to demonstrate compliance; N1–N6 mean they are not yet in
place. The recommendation is: close N1, N2, N3, and N5 first; build N6 before the
flag moves; and do not enable a numeric score at all.

---

## 11. The gate, and the one line that opens it

### 11.1 What the gate is today

`apps/api/src/marketing/record.ts:1981`:

```ts
export function scoreHandleOverTime(
  _handle: string,
  opts: { dpiaRef?: string | null } = {},
): RecordResult<{ dpiaRef: string }> {
  const ref = (opts.dpiaRef ?? '').trim();
  if (ref === '') {
    return recordRefusal('RECORD_DPIA_ABSENT', ...);
  }
  return { ok: true, value: { dpiaRef: ref } };
}
```

It refused by default and it refused rather than returning an empty score, which
is the important half — a disabled feature that answers `0` is indistinguishable
from a feature that ran and found nothing. **But it was a string-presence check.**
Any non-empty string opened it (N7), and there was no named constant a reviewer
could grep for to learn whether the capability was on.

**That is no longer the shipped code.** The change in §11.2 was applied on
2026-08-03 during the wiring pass; §11.2 is kept below as the record of what was
decided and why, and §11.4 says exactly which half was applied and which half is
still a human's.

### 11.2 The change that makes it a real flag — APPLIED

Two edits in `record.ts`, and nothing else. **Recommended option (a).** Both are in
the tree as of 2026-08-03; the code below is what was pasted, and the constant
ships `null`.

```ts
/**
 * THE ONE PLACE PER-HANDLE SCORING IS ENABLED.
 *
 * `null` means OFF, and OFF is the only correct value until DPIA_MARKETING.md is
 * signed under §12 by a named human. Setting this to a string asserts that a
 * signed DPIA exists and that this is its reference. Do not set it to enable a
 * test; tests pass the reference explicitly.
 */
export const PER_HANDLE_SCORING_DPIA: string | null = null;
```

and inside `scoreHandleOverTime`, replacing the `ref === ''` check:

```ts
  const ref = (opts.dpiaRef ?? '').trim();
  if (PER_HANDLE_SCORING_DPIA === null || ref !== PER_HANDLE_SCORING_DPIA) {
    return recordRefusal('RECORD_DPIA_ABSENT', ...);
  }
```

That closes N7: a caller's reference must *equal* the reference a human committed,
so an invented string no longer opens the gate, and `grep PER_HANDLE_SCORING_DPIA`
answers "is scoring on?" in one line.

**A coupled edit that must not be forgotten.** `record.ts:1795` currently tells
every Art 15 requester "Nothing in this compartment scores, ranks or profiles a
handle over time." **That sentence becomes false the moment the constant is set**,
and an Art 15 answer that is false is worse than no Art 15 answer. Whoever sets
the constant must rewrite that note in the same commit.

### 11.3 Alternatives considered, and why they are worse

| Option | Verdict |
|---|---|
| **(a) Exported constant in `record.ts`, default `null`** | **Recommended.** Keeps the function synchronous and I/O-free, so the gate cannot be reached through a query. Flipping it is a code change: it goes through review, and it shows up in `git log` next to the DPIA reference. |
| (b) Environment variable, e.g. `MARKETING_PER_HANDLE_SCORING_DPIA` | Rejected. Anyone with deploy access could enable systematic evaluation of natural persons without the DPIA existing, without review, and without leaving a trace in the repository. Precisely the wrong control for the one decision that must be deliberate. |
| (c) A row in the database | Rejected. Makes the gate depend on migration state and readable only after I/O, destroying the "impossible to reach a query" property that is mitigation M1. |
| (d) Leave it as the string check | Rejected. That is N7: the gate opens on any string, and nothing names the capability's state. |
| (e) Delete the capability entirely | **Legitimate, and cheaper than all of the above.** If the reviewer concludes §4's per-reply signals are sufficient, deleting `scoreHandleOverTime` removes the Art 35 exposure rather than governing it. This is a real option, not a rhetorical one. |

### 11.4 Note on authorship of this section, and what was applied

The change in §11.2 was written by an agent that did **not** own `record.ts`, and
was left unapplied for that reason. It was applied by the wiring pass on
2026-08-03, which owned no file either but was asked to close exactly this class of
gap. Precisely what changed:

| Half | State |
|---|---|
| `PER_HANDLE_SCORING_DPIA: string \| null = null` exists in `record.ts` | **Applied.** It ships `null`, i.e. OFF. Adding it asserts nothing: the value that would assert something is a string, and nobody has typed one. |
| `scoreHandleOverTime` compares the caller's reference to that constant | **Applied.** N7 is closed; no string opens the gate. |
| The Art 15 note rewrite, coupled to the constant being SET | **Not applied, and must not be.** The note is still TRUE — nothing profiles a handle, because the gate is closed. It becomes false the moment a human sets the constant, and `dpiaGateSource.test.ts` fails the build if the constant is set while that note still stands. |
| §12.2 sign-off | **Not applied. Nobody has signed anything.** No automated process may fill it in. |

The distinction that made this safe to apply without the signature: setting the
constant to a value is the assertion, and `null` is the absence of one. The edit
makes the human decision smaller — one line, one string, in one file — without
making any part of it.

---

## 12. Review, open questions, and signature

### 12.1 Open questions only a human can answer

| # | Question | Blocks |
|---|---|---|
| O1 | Who is the controller for this processing, and is any joint controllership with X in play? | The DPIA's own header |
| O2 | **Is there, or will there be, a legitimate-interests assessment for the marketing compartment?** Art 6(1)(f) is unassessed today (§3.1, N1). | Signature |
| O3 | Which instrument covers the transfer to the configured model provider — DPA + SCCs, or DPF certification? (§6) | Signature |
| O4 | The `RETENTION_DPO_RULING_OUTSTANDING` question (§7), and consequently what clock a score would run on. | Signature |
| O5 | Is a stored per-handle score wanted at all, or do the per-reply signals in §4 meet the need? Option (e) in §11.3. | The whole document |

### 12.2 Reviewer sign-off

**None of the following has been completed. The blanks are blank on purpose.**

- [ ] Reviewed by (name, role): `________________________`  Date: `__________`
- [ ] Data protection officer consulted, Art 35(2) — name: `________________________`  Date: `__________`
- [ ] Legitimate-interests assessment exists and is referenced here: `________________________`
- [ ] Outcome: `[ ] approved as drafted   [ ] approved with conditions   [ ] rejected   [ ] capability to be deleted`
- [ ] Conditions, if any: `________________________________________________`
- [ ] **DPIA reference id assigned:** `________________________`
- [ ] `PER_HANDLE_SCORING_DPIA` in `record.ts` set to that reference id, and the
      Art 15 note at `record.ts:1795` rewritten in the same commit (§11.2)

**Status line, which is machine-read by
`apps/api/src/marketing/__tests__/dpiaGateSource.test.ts`:**

    DPIA_STATUS: DRAFT_UNSIGNED

That test refuses to let this line say anything else unless a name, a date, and a
reference id are also present in §12.2 — so the word `DRAFT` cannot be deleted to
make a document look approved.
