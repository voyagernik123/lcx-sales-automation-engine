# Marketing retention policy — decision of record

**Compartment:** LCX marketing / X-reply desk (`marketing_x_reply`, `marketing_record`).
**Written:** 2026-08-03.
**Status: DEFAULT IN FORCE, UNSIGNED.**
**No Data Protection Officer has ruled on this document. Nobody has signed it.**
The signature block at the end is empty and is meant to stay visibly empty until a
named person fills it in.

This document is not legal advice and it is not an opinion of counsel. It records
which behaviour the code implements, why that behaviour was chosen over the two
alternatives, and exactly which parts of the reasoning are inference rather than
citation. It is written so that a person with the authority to decide can read it in
ten minutes and either sign it or overturn it.

---

## 1. The conflict this settles

Two duties point in opposite directions over the same bytes.

| | Wants | Where it comes from |
|---|---|---|
| Record-keeping | LCX's records kept **five years**, extendable to **seven** on a competent authority's request | MiCA Art 68(9) — see §2, and read the caveat there before relying on it |
| Storage limitation and minimisation | third-party personal data kept no longer than necessary | GDPR Art 5(1)(c), Art 5(1)(e); implemented as a **ninety-day** clock by migration `0046_marketing.sql`, which sets `retention_expires_at` on every inbound row and deletes on it |

They cannot both be honoured for the same row. Before this document the resolution was
implemented but undocumented: it existed as a comment in `0064_marketing_retention.sql`,
a paragraph in `apps/api/src/marketing/record.ts`, and the order of statements in the
sweep. That is an assumption, not a policy. This document makes it the policy of record
and names what would change if it is overturned.

---

## 2. The legal reading, and the honest size of the gap

**The citation.** MiCA Art 68(9) requires a CASP to keep records of its services,
activities, orders and transactions, "sufficient to enable competent authorities to
fulfil their supervisory tasks", expressly including ascertaining compliance with
obligations owed to **clients and prospective clients** and to **market integrity**;
those records are to be kept five years, and up to seven where the competent authority
asks before the five years elapse. Source: research dossier `mkt-r1-regulatory.md` §1,
quoting the primary text at `mica.txt:1980-1981`.

**Why marketing communications are inside that net.** Art 66(2) (fair, clear, not
misleading) is an obligation owed to clients and prospective clients; Art 91 is market
integrity. A record insufficient to show what LCX published, when, and on whose
authority is insufficient for the supervisory task Art 68(9) describes. So marketing
communications are covered **by function**, not because Art 68(9) says the word
"marketing".

**THE CAVEAT, WHICH IS PART OF THE POLICY AND NOT A FOOTNOTE.** `mkt-r1-regulatory.md`
§1 flags this explicitly, and it is repeated here because a policy that overstates its
own authority is worse than no policy:

> MiCA contains **no express retention period for a CASP's marketing communications.**
> Art 29(3)/53(3) impose an availability duty on issuers, not a retention period.
> Art 8(2)/29(5)/53(5) require notification on request but set no horizon. Art 88(1)
> requires inside information to be maintained on the website for at least five years
> (`mica.txt:2334`) — the only explicit five-year duty in the disclosure space.

The dossier's conclusion — five years from publication with a legal-hold mechanism
extending to seven — is labelled there as **INFERENCE, not text**, reasoning that it is
the only number MiCA gives for CASP records and that it matches Art 88(1), and that
anything shorter than five years is indefensible. **This policy adopts that inference and
carries the label with it.** The code does the same: `RETENTION_INFERENCE_CAVEAT` is
returned with every retention figure the API emits, so no reader receives the number
without the caveat.

Two further things are unverified and could change the analysis:

- **Art 68(10)(b) delegates to ESMA an RTS** specifying which records a CASP must keep.
  The adopted RTS text was not read in the session that produced `mkt-r1`. If it
  enumerates marketing communications, the inference above becomes a citation. If it
  excludes them, this policy needs revisiting.
- **The unresolved DPO question**, stated in code as
  `RETENTION_DPO_RULING_OUTSTANDING` (`apps/api/src/marketing/record.ts`): whether LCX's
  own statements may be retained past the ninety-day sweep at all, and whether a
  minimised excerpt of the message they answer may be kept alongside them.

---

## 3. The decision

**LCX's own statements are retained long. Third-party content is minimised.**

### 3.1 What is retained, and for how long

| Data | Register | Period | Basis |
|---|---|---|---|
| LCX's own cleared statements — the text LCX drafted and approved, its hash, who approved it, when, and why | `marketing_record` (migration 0061) | **5 years** from drafting; **7** where a legal hold is set | MiCA Art 68(9), read as inference per §2; GDPR Art 6(1)(c) processing necessary for a legal obligation; retained against an Art 17 erasure request under Art 17(3)(b), and the retention is **reported to the data subject** rather than kept quiet |
| A **sha256** of the third-party message an LCX statement answered — never the text | `marketing_record.inbound_context_hash`, `marketing_x_reply.body_hash` | the life of the record it belongs to | a digest is what makes a later paste-back provable without holding a stranger's words for years |
| The retention run ledger — what each sweep deleted, held, minimised, on whose authority, under which policy | `marketing_retention_run` (migration 0064) | not swept | GDPR Art 5(2) accountability: a retention duty you cannot evidence you honoured is one you have not honoured |

The five-year floor is enforced in three places, deliberately: a CHECK constraint in
0061 at write time, the policy constant read by the sweep, and the sweep's own
`drafted_at` predicate.

### 3.2 What is minimised, and why

| Data | Disposition | Why |
|---|---|---|
| Third-party inbound message text (a stranger's words) | **deleted** when its ninety-day `retention_expires_at` passes; drafts cascade with it (0046) | GDPR Art 5(1)(c) and 5(1)(e). LCX has no supervisory duty that requires keeping a member of the public's words for years. The period is ninety days by default (`MARKETING_RETENTION_DAYS`, defaulting to 90 in `record.ts thirdPartyRetentionDays`) |
| An excerpt of a stranger's message stored inside an LCX record | NULLed and stamped `context_minimised_at` on erasure (0061) | same |
| **The collision case:** an expired inbound row carrying an LCX statement that is approved but **not yet in `marketing_record`** | **body replaced by its sha256 (`MINIMISED_BODY_MARKER`), row HELD with a stated reason, named in the jeopardy list, escalated after 30 days** | Deleting it destroys the Art 68(9) record; keeping it whole breaches minimisation; a hash breaches neither. The hold is not open-ended: past `JEOPARDY_GRACE_DAYS` the system escalates, because "retained for compliance" with no end date is the exact failure storage limitation forbids |

### 3.3 What this decision gives up

It is a trade, not a free choice. A held row keeps the stranger's *row* — not their
words — past ninety days, and its hash is then retained for years. On a strict reading
of Art 5(1)(c) that is a breach, accepted in order not to lose the record. This is the
first thing a DPO should push back on.

---

## 4. The two alternatives, reachable by changing one line

Both are implemented and tested. Neither is in force.

### 4.1 Retain everything — `RETENTION_POLICY_RETAIN_EVERYTHING`

Nothing is deleted on either clock. Expired inbound rows are held with their text intact
and a stated reason; no LCX statement is ever swept.

*Gives up:* storage limitation for third-party personal data entirely — every stranger's
message held indefinitely under a compliance label. Do not select this without a written
basis covering the third party's words specifically.

### 4.2 Minimise everything — `RETENTION_POLICY_MINIMISE_EVERYTHING`

The short clock deletes on schedule with no exception, including the collision case. LCX
statements are kept for the inferred five-year floor only.

*Gives up:* the Art 68(9) record for every approved statement nobody recorded before its
inbound row expired — unrecoverably. The jeopardy list still names the rows before they
go, so the loss is evidenced; it is still a loss.

---

## 5. Who may override this, and how

**Authority to change the ruling:** LCX's Data Protection Officer, or the accountable
management body under MiCA Art 68(4)-(6) and Art 111(4). Not an engineer, and not an
agent. An engineer may *implement* a change that one of those people has decided.

**The mechanics are one line.** In `apps/api/src/marketing/retention.ts`, §0:

```ts
export const RETENTION_POLICY: RetentionPolicy = RETENTION_POLICY_SPLIT_DEFAULT;
```

Point it at `RETENTION_POLICY_RETAIN_EVERYTHING` or
`RETENTION_POLICY_MINIMISE_EVERYTHING`. Nothing else in the codebase needs to change —
the sweep branches on `retentionPolicySweepShape(RETENTION_POLICY)` and on nothing else,
and `apps/api/src/marketing/__tests__/retentionPolicy.test.ts` derives its expectations
from the constant so that a change to the ruling cannot be silently ignored by the code.

**Two things must happen alongside the one-line change:**

1. **Update this document.** A ruling in code that contradicts the document of record is
   two rulings, and the one nobody wrote down will be the one that gets enforced.
2. **Expect the pinned test to fail.** `retentionPolicy.test.ts` asserts today's values
   on purpose. Its failure is the signal that the document needs the same edit, not a
   test to relax.

Changing the ninety-day period is separate and does not need a code change:
`MARKETING_RETENTION_DAYS`. It is a DPO number, not an engineering one. An unparseable
value produces a refusal (`RETENTION_PERIOD_UNDEFINED`) rather than an accidental
unbounded retention.

---

## 6. What is true about the implementation, and what is not

- The retention clock is scheduled independently of the mail tick, on purpose: 0046's
  sweep only ran when the poller ran, so disabling one cron silently stopped retention.
- A **second** sweep still exists on the mail tick (`service.ts sweepExpired`). It holds
  the collision rows rather than deleting them, so the record cannot be lost to whichever
  job runs first — but it cannot minimise them, so between ninety days and the next run
  of this clock a held row keeps its text. That is **late erasure, recorded rather than
  presented as done** (`RETENTION_COMPETING_SWEEP` on every posture read).
- The ninety-day cascade **cannot** reach `marketing_record`: 0061 links the register to
  the inbound row by value (`x_comment_id`), not by a foreign key, and the only
  `ON DELETE CASCADE` from `marketing_x_reply` is the draft table. This is asserted
  against the migration text, not assumed.
- Counts that could not be observed are reported as `null`, never `0`. "Nothing is
  overdue" is a claim, and an environment that cannot look is not entitled to make it.
- Migration `0064_marketing_retention.sql` must be applied by hand before any sweep will
  delete anything. Until it is, the clock **refuses**, because an unevidenced deletion is
  indistinguishable from data loss.

---

## 7. Signature

This section is intentionally blank. It is not a template to be filled in by anyone
other than the named person, and no name may be written here by an automated process.

- **Data Protection Officer:** _not signed_ — name: ______________  date: __________
- **Accountable management body (MiCA Art 68(4)-(6), Art 111(4)):** _not signed_ —
  name: ______________  date: __________

Until both lines are filled in, everything above is **the default this system
implements**, and the API says exactly that on every retention read:
`RETENTION_DPO_RULING_PENDING`.
