# LCX MARKETING — the 100× plan

**Status:** approved end to end by the owner on 2026-08-02, before it was written
("Don't wait for approval. Just go for it.").
**Scale today:** 1,391 lines. 2 tables. 8 routes. 1 page. No `packages/shared/src/marketing/`.
**Research behind it:** six lanes, ~2,400 lines of dossier in
`scratchpad/mkt-r{1..6}-*.md`. Every legal citation below is primary text read
directly, not a summary — WebSearch was broken for the whole run and the lanes fell
back to `curl` against the source, with local copies kept for re-checking.

---

## 0. The correction that reframes everything

I told the owner this module was governed by **MiCA Article 29**. That was wrong.
Article 29 governs issuers of asset-referenced tokens. LCX's X replies live under
**Article 66(2)–(3)** — fair, clear and not misleading, breached *deliberately or
negligently*, with a risk warning and white-paper hyperlink obligation.

That correction matters less than what the research found underneath it.

### The real exposure is not marketing law. It is market abuse.

MiCA **Title VI** catches "any person", off-platform, in the Union *and third
countries*, for any asset LCX lists or has applied to list (Art 86). Three concrete
exposures, none of which is about wording:

| Rule | The act | Consequence |
|---|---|---|
| **Art 90** | A "coming soon" reply about an unannounced listing | Unlawful disclosure of inside information |
| **Art 91(3)(c)** | A bullish reply about a token the author personally holds, without *simultaneous public* disclosure of that position | Market manipulation. Personal fines from **€700,000** |
| **Art 91(2)(c)** | Repeating a rumour — the standard is "ought to have known" | Market manipulation, by negligence |
| **Art 88(1)** | Combining inside-information disclosure *with* marketing in one artefact | Prohibited outright |

**Both of the worst classes are invisible to a wording review.** No amount of reading
the prose catches them. They are resolved by *joins against state* — an asset embargo
register and a staff holdings declaration — which is exactly the state no social tool
holds.

> **This is the thesis of the whole build.** A marketing compartment that only reviews
> prose is optimising the least dangerous axis. The 100× is not a better drafting box.
> It is the compartment that knows *who is speaking, what they hold, and what is under
> embargo* at the moment they speak.

### Four more findings that are architecture, not style

1. **A listing promo cannot fit in a tweet.** Art 7(1)(d)+(e) mandate roughly 330
   characters of verbatim boilerplate on any communication promoting an offer or
   admission to trading. That is arithmetic, and the instrument can compute it and
   refuse, offering the link-to-a-compliant-page pattern instead.
2. **LCX's favourite sentence is its highest-frequency violation risk.** ESMA's
   "halo effect" statement (ESMA35-1872330276-2329) names as a DON'T: *the CASP's
   regulatory status used as a promotional tool*. LCX's brand **is** "regulated in
   Liechtenstein". The claim engine must flag LCX's own best line, or it is decoration.
3. **A regulator can switch the desk off.** Art 94 permits suspension of marketing
   communications for 30 working days. That is a `DeskMode`, and the instrument should
   already have somewhere to put it.
4. **The cushion is gone.** Liechtenstein's Art 143(3) transition ended 1 July 2026 and
   TVTG registrations expired 2 July — last month. There is no grandfathering left.

### The engagement verb is the unit of legal exposure

FINRA's entanglement/adoption doctrine (RN 17-18) is the sharpest available model and
transfers cleanly: a **like** or a plain **repost adopts the target's claims**; a
factual correction does not. So the object under review is not "the text" — it is
*(verb, target, author)*. And static content (bio, pinned post, profile) needs
pre-approval where interactive replies need risk-based review plus retention. **Two
state machines, not one.**

---

## 1. Eight live defects, found in 1,391 lines

These are not plan items. They are true right now, on production.

| # | Defect | Evidence |
|---|---|---|
| 1 | **The ingest is forgeable.** `fetchNotificationEmails` searches `{seen:false}` with **no sender filter**, and `RawEmail` has no `from` field at all. Anyone who learns the polled mailbox address can inject a fabricated customer reply — attacker-chosen handle, comment id, display name and 4,000-char body — graded `C3` "fairly reliable", identically to a real one. | `xMail.ts:81`, `:87-97` |
| 2 | **The sanitiser is inverted.** It redacts `ETH`, `SOL`, `BNB`, `ARB` as bare words, so *"ETH deposits are live"* renders *"[removed] deposits are live"* — while `DM @LCX_Support_Desk`, Telegram handles and phone numbers pass clean and unflagged. It redacts the safe thing and lets the actual scam vector through, manufacturing the alarm fatigue that makes a reviewer stop reading. | `sanitise.ts:73` |
| 3 | **Marketing is the only compartment off the audit spine.** Approve is described as "the governed act" and writes **no** `audit_log` and **no** `object_actions` row. | `service.ts:283` |
| 4 | **Nothing validates the AI's output.** `socialReply.ts` states four compliance rules *in the prompt* — no price predictions, no return promises, no financial advice, no invented facts — and not one of them is checked against what comes back. Prompting is the only layer, and the file itself says prompting is the weakest layer. | `socialReply.ts:31-55` |
| 5 | **The SLA measures the wrong clock.** `posted_at` is written from the **email Date header**, not X's timestamp, so "Oldest waiting" measures mail-forwarding latency. `posted_at` is also nullable and falls back to `received_at`, which flatters the desk by exactly the delay. | `xNotificationParse.ts:154` |
| 6 | **`answered` is set when nothing was sent.** Status flips on *approval*. There is no edit box and copy is ungated, so approved text need not equal sent text — and a flagged `proposed` draft can be pasted out with no record at all. | `service.ts:283`, `Marketing.tsx:224` |
| 7 | **Pre-claiming silently destroys a real reply.** `ON CONFLICT DO NOTHING` is reported as "duplicates", ids are attacker-chosen, and "first permalink wins". Claim a real reply's id first and the genuine one is discarded forever, silently. | `service.ts:130`, `xNotificationParse.ts:133` |
| 8 | **`raw_email` is never cleared** despite the migration comment saying it is — 20KB of a stranger's email retained for 90 days. And `migratedCache=false` is cached permanently on *any* error, so one database blip permanently fakes "awaiting migration 0046". | `0046_marketing.sql:61`, `service.ts:52-57` |

**Three comments in the code assert guarantees the code does not keep** — that there is
"no inbound surface anyone can write fabricated replies into", that `raw_email` is
"cleared once parsed", and that approve is governed. Each gets corrected, not deleted.

---

## 2. What already exists and is not wired up

- **The claim library** — `packages/shared/src/claims/`, 1,392 lines, pure, zero I/O.
  `Claim{id,category,text,jurisdiction[],riskLevel,requiresHumanReview,version,active}`,
  a `RuleViolation` validator, and an `INVENTED_LICENSE_PHRASES` blocklist already
  catching "SEC-approved" and "FDIC-insured". Imported by sales. Imported by **no
  marketing file**. `Channel` is `email|linkedin|telegram` — there is no `'x'`.
- **A keyless news spine** — `connectors/news.ts` already pulls ~20 RSS feeds with no
  API key, including `sec.gov` press and litigation and `esma.europa.eu`, persisted into
  `market_news`. Marketing reads none of it.
- **Provenance and estimative layers** — Admiralty A1–D4 and ICD-203, both shipped.
- **The governed action registry** — registering marketing actions retrofits audit,
  idempotency and the compartment gate for free.

Three integration hazards to handle rather than trip over: `validateDraftOutput`
hard-requires `contactName` and `projectName` and will emit two guaranteed false errors
on any marketing draft; `DEAL_CLOSING_PHRASES` bans the literal substring `"buy "` when
no ticker is supplied; and `claims.test.ts:79` pins `templates.length === 9` exactly.

---

## 3. What can be known without a credential — and what cannot

There is no X API key and there never will be. That constraint is the design, the way
the document lockout was for GPS.

**Verified working, keyless:**
- `publish.twitter.com/oembed?url=<post-url>` — **official and documented**. Returns
  author name, post text, language and the **true post date**. This repairs defect #5,
  repairs the author field, and — because it is an independent channel — gives the
  **anti-forgery corroboration** that defect #1 needs. Cheapest high-value win in the
  entire plan.
- `cdn.syndication.twimg.com/tweet-result?id=<id>` — undocumented, X's own embed
  backend. Yields `favorite_count`, `conversation_count`, exact `created_at`,
  verification status and final-poll flags. **Off by default, graded low, per-post pull
  only**; its ToS standing is a judgement call, not a technical one.
- **ESMA** `/rss.xml` resolves. **FMA has no RSS at all** — but publishes typed
  sitemaps including `sitemap.warning_entry.xml`, which carries investor-warning
  entries. That is a regulator warning watch for free.

**There is no keyless discovery.** Both syndication timeline endpoints return 200 with
zero bytes. `nitter.net/lcx/rss` works but public mirrors are third parties who would
control what LCX's instrument believes LCX said — so discovery-only, and every id
corroborated through oEmbed before any text is stored.

**The honesty ceiling — what must never appear on a panel:**

impressions · reach · follower delta · engagement rate · click-through ·
share of voice · audience sentiment

Reach and SOV need a denominator that does not exist. Notification emails are a
controversy-skewed census of one edge type centred on LCX, not a sample of anything.
`sentiment` is a declared column that is never written. Reply counts are **lower
bounds**, so they are named `repliesObserved`, and every chart carries an
`ObservationFrame` stating what the window could and could not see.

In their place, twelve genuinely measurable process metrics: time-to-first-statement
against budget, per-role clearance latency, precleared-derivation rate,
claim-provenance rate, contradiction debt, line staleness, `notKnown` non-empty rate,
refusal codes by frequency, retraction count, next-update breaches.

---

## 4. The doctrine

Eight rules, and the build is judged against them.

1. **Refuse, don't warn.** A regulated promise cannot be stripped into safety. Strip is
   for formatting; refusal is for substance, and it cites the rule that caused it.
2. **The dangerous axis is the invisible one.** Every draft is checked against embargo
   and holdings state, not only against its own words.
3. **Never claim a number you cannot observe.** Lower bounds are labelled as lower
   bounds. Absent data produces a refusal, never a zero.
4. **The verb is the act.** Like, repost, quote and reply carry different legal
   exposure and are modelled separately.
5. **Nothing leaves without a record.** No copy path, no export, no approval without an
   audit row that names the human.
6. **Corroborate before believing.** Inbound content arrives with a provenance grade,
   and an uncorroborated item is quarantined at a distinct grade rather than promoted.
7. **Don't speculate, and don't over-reassure.** The template is
   *known / notKnown / next-update-by*. SBF's "FTX is fine. Assets are fine" is pleaded
   in SEC v. Bankman-Fried ¶78 as fraud — over-reassurance is the charged act.
8. **Say when the instrument cannot do its job.** Four-eyes with two approvers is not
   four-eyes; the surface must admit that rather than perform it.

---

## 5. The phases

Ten. Each ships behind the workspace gate, with tests, and degrades honestly when its
table does not exist yet.

### M0 — Stop the bleeding
The eight defects in §1. Sender authentication on ingest resting on surviving X DKIM
`d=` or an ARC chain (naive `From:` checks are useless — forwarding kills SPF), with
quarantine at a distinct grade otherwise. Sanitiser inverted back: scam vectors caught,
ticker symbols left alone. Audit rows on every approve. Id-collision with differing
content raises instead of discarding. Real `posted_at` via oEmbed. `raw_email` actually
cleared. No new features in this phase.

### M1 — The engine: `packages/shared/src/marketing/`
The thing that does not exist. Pure, no I/O, exhaustively tested.
Regime classifier (Art 66 vs Art 7 vs Title VI vs UCPD). The claim-safety gate with the
strip-versus-refuse split. The boilerplate arithmetic that proves a listing promo cannot
fit. The engagement-verb adoption model. The RESIST 2 triage taxonomy — opinion gate,
FIRST indicators, L/M/H confidence, five-level reach ladder, three priority tiers where
*low* explicitly means "lines prepared, no response made". `DeskMode`, including Art 94
suspension. `ObservationFrame`.

### M2 — The market-abuse perimeter (crown jewel)
The invisible axis made load-bearing. An **asset embargo register** and a **staff
holdings declaration**, and the joins that turn Art 90, Art 91(3)(c) and Art 88(1) into
refusals a human cannot walk past. Empty registers refuse honestly and say so — the GPS
perimeter pattern, which is now the house pattern. `prohibited` always blocks.

### M3 — The provenance ladder
Admiralty grading on every inbound item. oEmbed corroboration as an independent
channel. DKIM/ARC evidence recorded per row. Quarantine lane. Nitter as
discovery-only, never as a source of text.

### M4 — The desk
Triage board with the taxonomy and a suppressible clock. Drafting room where refusals
appear live and cite their rule. **Precedent index** — "what did we say about this
before" — which needs its own table because the 90-day retention cascade destroys the
memory. Silence log, because a decision not to answer is a decision.

### M5 — The crisis room
Versioned holding statements in code, needing **zero data**. The
known/notKnown/next-update-by template. CDC CERC's three *parallel* blocking clears —
reputation, policy, SME — with advisory reviewers who "may comment but not delay", and
the reviewer's test: *comfortable seeing this as a news headline?* Peer-contagion
preclears (`are_you_like_<peer>`), because Crypto.com in November 2022 was contagion by
shared attribute and LCX is in that class. The clock, and the >$40bn-in-one-day SVB
number as the reason it exists.

### M6 — The watch
FMA `sitemap.warning_entry.xml`, ESMA RSS, and reuse of the `market_news` spine already
running. Competitor narrative tracking off public feeds. A claim-expiry ledger, because
a claim that was true in March is a liability in August.

### M7 — The record
Art 8(2) is produce-on-demand, so the **export bundle is a feature, not an afterthought**:
any communication reproducible with who wrote it, who cleared it, which claims it used,
and what the desk knew. Five years extendable to seven. GDPR: Art 14 notice, a lawful-basis
record, erasure and access paths, `author_handle` indexed, and a DPIA note — per-handle
scoring over time crosses into "evaluation or scoring".

### M8 — Honest measurement and the loop
The twelve process metrics. Contradiction debt. Refusal codes by frequency, which is the
only honest read on whether the desk is getting safer. Post-mortem loop. A WBR block.

### M9 — Instrument pass, adversarial re-test, ship
⌘K grammar for every marketing noun and verb. Print artefacts. Inspector drawers. Then
the module is attacked again from scratch — prompt injection through a stranger's reply
being the named worst case — and the full gate, and deploy.

---

## 6. Explicitly killed

Auto-posting. DM handling. Scraping and mirror-as-source. Browser-session automation.
Inbound webhooks. KOL scoring. A/B tests. A single sentiment number. An AI content
calendar. An agent graph. Fifteen ideas rejected in total, each with its reason recorded
in `mkt-r6-ideas.md`.

The first four are killed by the owner's own constraint — *"it should also not cause any
threat to lcx x account or any sort of threat to anything"* — and that constraint is
load-bearing, not a preference to be optimised around.

---

## 7. What the owner will owe, at the end and not before

- **The staff holdings declaration.** Who holds what. Until it exists, M2 refuses and
  says why. This one has personal liability attached to it (Art 91(3)(c), from €700k),
  so it is his and legal's, not mine.
- **The asset embargo list**, or the rule for deriving it from listing state.
- **One DPO ruling**: may LCX's *own* published statements be retained past the 90-day
  sweep? The regulator wants five to seven years; the current cascade deletes at ninety
  days. Those cannot both be right. Default assumption until answered: retain LCX's own
  statements for seven years, minimise third-party content.
- **LCX's authorised service list** — it decides whether a paid partner promo is
  marketing at all, or the licensable service of "placing of crypto-assets".
