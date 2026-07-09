# LCX Sales Automation Engine — Scale-Up Roadmap

*Drafted 2026-07-10. Goal: evolve the current system (1,875 CSV-imported projects, manual everything) into LCX's production BD engine: a continuously-refreshed ~20–30k token universe from free APIs, scoring that predicts who will actually pay for a listing, free DIY contact discovery, a ban-proof assisted LinkedIn engine, and reply handling that pulls leads to Telegram for personal closing.*

**Locked decisions:** LinkedIn = assisted one-click (no auto-send, zero ToS risk) · Universe = quality ~20–30k (not 100k noise) · Reply drafting = smart templates (no LLM) · Everything on free tiers.

---

## Bugs found during design exploration (fix in Phase 1–2)

1. **Enrichment→scoring disconnect** — CoinGecko market data lands in `signals`/`raw._enrichment` but every score factor reads the stale `projects.market_cap` CSV string. Live market data never affects scores.
2. **Won-deal labels unusable** — `normalizers/closed.ts` reads the wrong CSV columns (`Name`/`Project` don't exist; real headers are `Record`/`Token`), so all 36 won deals import with ticker-strings as names and can't join to anything. The fee columns (Listing/Marketing/Liquidity) — the ground truth for "who pays" — survive only as unparsed JSON.
3. **Pipeline mislabeled** — `normalizers/pipeline.ts` sets `listedOnLcx: true` for all ~950 prospects, feeding a false "+8 already-on-LCX" into willingness scoring.
4. **Suppression not enforced at send time** — a suppressed contact with an active sequence still gets emailed on the next tick.
5. **Telegram-touch sends as email** — scheduler routes on `sequence.channel` only; the mixed cadence's telegram touch would go out via Resend.
6. **CLI scorer drops fields** — doesn't persist `recommendedMarket`/`usIntelSignals` (API route does).
7. **Fake LinkedIn reply detection** — `pollLinkedInReplies` assumes any message >48h old got a reply.
8. **Dead code**: `buildMatchIndex` (O(1) matcher lookup) unused; delta detection always compares against frozen seed values; `project_sources` table never populated.

---

## Phase 1 — Foundations & correctness (ships alone; makes today's app fast and honest)

**Data side** (migration `0009_market_columns.sql`):
- Typed market columns on `projects`: `market_cap_usd, market_cap_rank, volume_24h_usd, price_usd, price_change_30d, token_age_days, last_enriched_at, region, name_key, domain, ticker_norm, people_count, verified_contact_count`.
- Indexes: `created_at`, `region`, `market_cap_rank`, pg_trgm GIN on name/ticker (fixes `ILIKE '%…%'` search), `scores.computed_at`; unique index on `scores.project_id` (dedupe rows first).
- Trigger-maintained `people_count`/`verified_contact_count` (kills the per-row COUNT subqueries and the correlated `hasContact` filter).
- `GET /v1/projects` rewrite: filter on columns, `region` instead of 37 jurisdiction ILIKEs, `count(*) OVER ()` instead of a second query.
- Fix CLI scorer to persist `recommendedMarket`/`usIntelSignals`.

**Outreach side** (migration `0010_outreach_tasks.sql`):
- `SequenceStep` gains `channel`, `scheduledAt`, `status` (JSONB — runtime fallback for legacy rows via `resolveStep()`).
- Scheduler dispatches on **step** channel: email → auto-send via Resend (inside send window, after suppression check); linkedin/telegram → materialize into new `outreach_tasks` table, never auto-send.
- `sendWindow.ts`: Tue–Thu 9–17 CET config via env (`SEND_WINDOW_*`).
- Suppression check helper enforced at send time and later at queue mark-sent.

Key files: `apps/api/src/routes/projects.ts`, `apps/api/src/outreach/scheduler.ts`, `packages/shared/src/outreach/types.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/score/index.ts`.

---

## Phase 2 — Ingestion framework, label fixes, scalable dedupe

- **Staging-first ingestion** (migration `0011_ingestion.sql`): `project_sources` becomes the staging table — `unique(source, external_id)`, `content_hash`, seen/changed timestamps, nullable `project_id`, `status new|mapped|ignored`. `job_runs` table for run tracking + incremental cursors.
- **Connector interface** (`apps/api/src/connectors/types.ts` + `runner.ts`): `fetch(): AsyncIterable<StagedRecord[]>` + `normalize(rec): RawProject|null`. Runner stages rows idempotently (hash-gated), processes only changed rows, batch-upserts canonicals (500-row `INSERT … ON CONFLICT`, replacing seed's 2-round-trips-per-project loop). Wrap the 8 existing CSV normalizers as connectors.
- **Fix the label bugs**: closed.ts reads `Record`/`Token`; pipeline.ts stops setting `listedOnLcx: true`; one-time cleanup CLI merges the old `$ZIG`-style rows.
- **Dedupe rework** (`apps/api/src/import/resolve.ts`): blocking/bucketing by `name_key`/`domain`/`ticker_norm` (indexed columns from Phase 1) — O(n) + tiny quadratic islands instead of O(n²). Match precedence: esmaTokenId → dti → domain → ticker+name-prefix → name_key. Ticker alone never merges. Full re-dedupe CLI only *proposes* merges (audit_log) except exact domain/ESMA groups.

---

## Phase 3 — Universe connectors + bulk enrichment (the 20–30k universe)

**Free-API connectors** (`apps/api/src/connectors/`), all hash-gated staging:

| Connector | Source | Cadence | Calls/run |
|---|---|---|---|
| `coinpaprika.ts` | `/v1/tickers` — all ~40k tickers in ONE call | daily | 1–2 |
| `coingecko-list.ts` | `/coins/list` + platforms | weekly | 1 |
| `defillama.ts` | `/protocols` (TVL) + `/raises` (funding rounds — top pay signal) | weekly | 2 |
| `geckoterminal.ts` | new pools on eth/base/solana/bsc/arbitrum | daily | ~15 |
| `esma-registry.ts` | ESMA MiCA register CSV download | weekly | 1 |

**Quality gate** (in normalize; junk stays staged as `ignored`): admit iff `rank ≤ 5000 OR mcap ≥ $1M OR vol24h ≥ $50k OR raised <24mo OR MiCA registry OR first-seen <90d`. Expected canonical universe: ~20–30k (Supabase 500MB safe).

**Bulk enrichment rework** (`apps/api/src/enrich/refresh.ts`, migration `0012_external_ids.sql`):
- `project_external_ids` table (provider → coingecko/coinpaprika/defillama id, unique both ways) — match once, then refresh is a join, not re-matching. Matching uses the existing-but-dead `buildMatchIndex`.
- Daily refresh: CoinGecko `/coins/markets` pages (250 coins/call → top 15k in ~60 calls, includes 30d price change) + CoinPaprika `/tickers` (1 call) for the rest + cross-check → chunked `UPDATE … FROM (VALUES …)` into typed columns.
- Delta signals only on real changes (±20% mcap, ±10 rank) vs previous column values — resurrects the dead delta path. No more unconditional signal inserts; prune job keeps signals bounded.
- **CoinGecko budget: ~4.8k/mo of the 10k demo cap** (60/day bulk + ≤100/day on-demand detail + weekly list).

---

## Phase 4 — Propensity scoring (the crux: who will pay)

Migration `0013_propensity.sql`: `listing_labels` table + `scores.propensity_score/propensity_reasons/priority_score/model_version`.

- **Label extraction** (`apps/api/src/labels/extract.ts`): parse closed CSV (36 won deals with real fees: e.g. Zignaly $10k listing/$20k marketing/$10k liquidity) + pipeline CSV (~950 records with stage trails) into `listing_labels`, joined to universe projects via the Phase-2 resolver. Deal-desk stage transitions feed new labels automatically going forward (the model improves with every closed deal).
- **Features** (`packages/shared/src/scoring/propensity/features.ts`): mcap band, volume/mcap ratio, funding recency+amount (DefiLlama raises), token age, exchange count, category/chain fit vs won-deal distribution, EU/MiCA presence, verified contact, pre-TGE flag.
- **Calibration** (`apps/api/src/labels/calibrate.ts`, offline): weight-of-evidence per feature bucket (won-rate vs base rate, Laplace-smoothed), pipeline stage-progression as soft labels, leave-one-out rank validation ("would these weights have put each won deal in the top decile?"). Human transcribes advised weights into checked-in `weights.ts` (`propensity-v1`). **No fitted logistic coefficients at n=36** — deterministic, explainable, reason-trailed like every existing factor.
- **Priority queue**: `priority = propensity × eligibility_gate` (gate 1.0/0.7/0.4 by max(EU, US-post) at 60/40 thresholds). BD queue default-sorts by priority. EU/US factors now read live `market_cap_usd` (fallback to legacy string for CSV-only rows — existing tests stay byte-identical).
- **Batch scoring rewrite**: paged set-based scoring (500/page, bulk upsert) — 30k projects in minutes, no full-table in-memory load.

---

## Phase 5 — LinkedIn assisted engine + reply→Telegram kit

**Send Queue** (new page `apps/web/src/pages/SendQueue.tsx` + `/v1/outreach/queue` routes):
- Due linkedin/telegram touches appear as cards: contact + project + band, editable message, char counter (≤300 for connect notes), **Open LinkedIn** deep link, **Copy**, **Mark sent** / **Skip** / **Snooze**.
- Mark-sent transactionally: `messages` row (`provider: manual_linkedin`), `incrementLiUsage`, advance sequence step, audit log. Caps shown as guidance ("12/20 messages today") — the human is the authority.
- Touch 1 = connection request when not yet connected; real LinkedIn templates for all 5 touches (today only touch-3 exists — the rest fall back).
- Kill the fake 48h reply poll; replace with a **Log reply** button (human sees real replies in their LinkedIn inbox).

**Reply→Telegram kit**:
- `replyEngine.ts` (shared): 3 deterministic reply drafts per handoff — meeting/telegram/info angles — every one ending with the pull: *"Quickest way to sort specifics is Telegram — t.me/<LCX_TELEGRAM_HANDLE>."* Validated by the existing message rules.
- Handoff UI: telegram handle + t.me deep links surfaced, reply-draft tabs with copy, **Moved to Telegram** button → handoff event + KPI (`reply→telegram rate` tile).

---

## Phase 6 — Contact discovery + email go-live

**Email discovery** (free DIY, migration `0014_discovery.sql`: `discovery_jobs` queue):
- Crawler (`apps/api/src/discovery/crawler.ts`): robots.txt-respecting, identified UA, ≤6 pages (`/`, `/contact`, `/about`, `/team`, `/docs`, `/legal`), 10s/page + 30s budget, 1MB cap. Extracts mailto/regex emails + twitter/telegram/linkedin links.
- Ranking: named-person > partnerships@/bd@/listings@ > hello@/info@ > rest; drop support@/press@/noreply.
- Verification: syntax → MX lookup (`dns.resolveMx`) → `email_status: valid_mx|invalid|unverified`. SMTP RCPT probe designed but **off by default** (unreliable + Render blocks port 25). Feeds people rows with provenance; enrollment gate already accepts `valid_mx`.
- Runs via `POST /v1/discovery/tick` (3 jobs/tick, cron-driven), plus a "Find contact email" button on LeadDetail.

**Email channel go-live** (config + small code):
- Resend free tier (100/day — the daily cap of 50 stays under it): dedicated subdomain, SPF/DKIM, DMARC after warm-up (start ~10/day, ramp 2–3 weeks).
- Compliance footer appended at send time: sender identity, LCX entity line, HMAC unsubscribe link + `List-Unsubscribe` one-click header → suppression + sequence pause.
- **Inbound replies**: Cloudflare Email Routing (free) → Email Worker (`workers/inbound-email/`) → `POST /v1/outreach/webhooks/inbound` → auto-handoff with reply text. Push-based, works while Render sleeps.
- GDPR: legitimate-interest basis, provenance recorded, suppression honored everywhere; jurisdiction warning badge for consent-required member states (DE/AT).

---

## Phase 7 — Scheduling + KPI automation

**Mechanism**: GitHub Actions cron for heavy batch jobs (runs CLIs against Supabase pooler URL with repo secrets — immune to Render spin-down); cron-job.org for the 10-min `/v1/outreach/tick` + `/v1/discovery/tick` (doubles as keep-alive). In-process cron rejected: Render free sleeps.

| Job | Cadence | Via |
|---|---|---|
| market_refresh | daily 05:00 | GH Actions |
| universe_sync | weekly Mon | GH Actions |
| discover_new_tokens | daily 06:00 | GH Actions |
| score_refresh | daily 07:00 | GH Actions |
| kpi_snapshot | daily 23:50 | GH Actions (finally writes `kpi_daily_snapshots`) |
| signals_prune | weekly Sun | GH Actions |
| rededupe_report | monthly/manual | GH Actions dispatch |
| outreach_tick + discovery_tick | every 10 min, 07–19 | cron-job.org |

All jobs: advisory-lock + `job_runs` row + idempotent upserts.

---

## Phase 8 — UI scale

- Server-side pagination (drop the hardcoded limit=200), priority-sorted queue, propensity chip with reason-trail tooltip, freshness dot from `last_enriched_at`, virtualization only if operators demand continuous scroll.

---

## Dependency graph & suggested order

```
P1 (foundations) → P2 (ingestion+labels+dedupe) → P3 (universe+enrichment) → P4 (propensity) → P8 (UI)
P1 → P5 (send queue + telegram kit)          [independent of P2–P4]
P5 → P6 (discovery + email live)             [discovery benefits from P2 runner but doesn't require it]
P7 (scheduling) lands piecemeal: cron-job.org tick immediately after P1; GH Actions jobs as each batch CLI exists
```

## Risk register

- **n=36 positives**: coarse buckets + hand-set monotonic weights + WoE sanity-check + LOO validation + deal-desk feedback loop. Never ship fitted coefficients at this n.
- **False merges at 30k**: ticker-alone never merges; fuzzy only within ≤50-row buckets; full-rededupe proposes, doesn't act.
- **Free-tier budgets**: CG ~4.8k/10k monthly; CoinPaprika/DefiLlama as backbone fallback; Supabase 500MB guarded by quality gate + hash-only ignored rows + signals prune.
- **LinkedIn**: assisted-only by design; caps stay as UI guidance; never reintroduce auto-send casually.
- **Deliverability**: send windows, warm-up ramp, unsubscribe compliance, suppression enforced at send time.
