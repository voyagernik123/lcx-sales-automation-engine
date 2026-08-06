-- ──────────────────────────────────────────────
--  0072 — THE VERDICT BROKER'S JOIN, MADE AUDITABLE (LCX OS 100x, F4)
--
--  WHY. `access/verdictBroker.ts` lets one compartment learn THAT another holds
--  something, and its verdict, without reading it. Its first real question is the
--  largest uninsured liability on this platform: is an asset inside the listing
--  perimeter? MiCA Art 88 requires the disclosure of inside information to be its own
--  artefact, Art 90(1) prohibits onward disclosure, and Art 91(3)(c) attaches PERSONAL
--  liability — from roughly EUR 700,000, on the named human, not on the company.
--  Today the control between "sales is negotiating a listing" and "marketing names the
--  asset in public" is a free-text paragraph in a policy.
--
--  THE JOIN IS  projects.ticker_norm  ↔  marketing_asset_embargo.asset_symbol.
--
--  ══ WHAT WAS VERIFIED BEFORE ANYTHING WAS RELIED ON ═════════════════════════
--  THE CHECK ON `asset_symbol` IS ALREADY THERE, so this migration does not add it.
--  0060_marketing_abuse.sql declares, on the column:
--        CHECK (asset_symbol = upper(btrim(asset_symbol))
--               AND length(asset_symbol) BETWEEN 1 AND 20)
--  That was checked in 0060 itself rather than assumed from a comment, because the
--  whole read path depends on it: `access/otherLedger.ts` normalises its subject and
--  then queries for equality, which is only sound if the stored side cannot hold
--  ' SOL' or 'sol'.
--
--  ══ THE HALF THAT IS NOT ENFORCED, AND WHAT THIS FILE DOES ABOUT IT ═════════
--  `projects.ticker_norm` IS DOCUMENTED AS cleanTicker(ticker) AND NOTHING ENFORCES
--  IT. There is no CHECK. A row holding 'sol' or ' SOL' is legal, can never equal any
--  CHECK-normalised asset_symbol, and makes the join return ZERO ROWS — which on a
--  conflict check reads as "this asset is clear". A silent false negative on a
--  personal-liability control is the worst shape a defect can take here: it looks
--  like an answer.
--
--  AND THE GENERATOR ITSELF CAN PRODUCE SUCH A VALUE. `cleanTicker` in
--  apps/api/src/import/types.ts is  trim → strip a leading '$' → toUpperCase, IN THAT
--  ORDER, so cleanTicker('$ sol') is ' SOL': the '$' is removed after the trim and the
--  space it was hiding is never trimmed again. Every writer of ticker_norm
--  (import/resolve.ts, connectors/catalog.ts, connectors/runner.ts,
--  seed/backfill-keys.ts) goes through that function, so every writer can emit it.
--
--  SO THIS MIGRATION DOES NOT ADD A CHECK TO `projects`, DELIBERATELY. A CHECK — even
--  NOT VALID, which skips existing rows — would start REJECTING the catalog and runner
--  inserts the moment one feed carries '$ sol'. Breaking the importer to enforce a
--  join is the wrong trade: the read path already REFUSES a denormalised value under
--  OTHER_LEDGER_TICKER_NOT_NORMALISED and OTHER_LEDGER_TICKER_UNUSABLE rather than
--  querying with it, so the false negative is already closed in code. What was missing
--  is the ability to ask HOW MANY such rows exist, which is the index below. Making
--  `cleanTicker` correct is a change to import/types.ts and is a separate, reviewable
--  edit — not something to smuggle in behind a constraint.
--
--  NO NEW TABLE. NO NEW COLUMN. One partial index and three COMMENTs. Everything the
--  broker needs was already recorded; what was missing was a way to see it.
--
--  ZERO DROP / DELETE / TRUNCATE / UPDATE. Nothing here can lose a row, so no
--  Supabase destructive-operations warning applies.
--
--  NOT `CONCURRENTLY`, for the reason 0069 states: `db/migrate.ts` applies a file as
--  one `client.query(sql)`, which Postgres wraps in an implicit transaction, and
--  CREATE INDEX CONCURRENTLY cannot run inside one. It would fail at apply time rather
--  than degrade. The predicate below is false for every well-formed row, so on a
--  healthy `projects` the index is empty and the build is a single sequential pass.
--
--  WHAT IT COSTS, STATED HONESTLY. Not "one boolean": every INSERT and every UPDATE of
--  `projects` evaluates the predicate, which is a btrim, a regexp_replace, an upper, a
--  length and two comparisons. That is microseconds on a table this size and nothing is
--  written to the index for a well-formed row — but it is more than one boolean, and an
--  earlier draft of this comment said one boolean.
-- ──────────────────────────────────────────────

-- ── The detector: every projects row whose ticker_norm cannot join ────────────
--
-- A PARTIAL INDEX WHOSE PREDICATE IS THE CODE'S REFUSAL SET. It indexes nothing on a
-- database where every ticker_norm is normalised, and it turns "are there rows that
-- would silently miss the embargo join?" from a full sequential scan with a function
-- call per row into an index-only scan that is usually empty.
--
-- ══ THE PREDICATE MIRRORS WHAT THE CODE REFUSES, AND THE FIRST VERSION DID NOT ══
-- The point of this index is that its count answers "how many rows would silently miss
-- this join?", i.e. how many rows `access/otherLedger.ts assetSymbolForProject` REFUSES.
-- If the two disagree, the index under-reports and the number is worse than no number.
-- The first version was `ticker_norm <> upper(btrim(ticker_norm))` and it disagreed in
-- three ways, all in the direction of under-reporting:
--
--   1. btrim VS .trim(). Postgres `btrim(string)` WITH NO SECOND ARGUMENT STRIPS SPACES
--      ONLY. JS `.trim()` strips all whitespace. So a stored 'SOL' || chr(9) (tab) is
--      REFUSED by the code (cleanTicker trims the tab, giving 'SOL' <> the stored value)
--      and the old predicate was FALSE for it — because btrim left the tab alone and
--      upper() of the result equalled the stored value. The set is now explicit.
--      (The same asymmetry means 'SOL'||chr(9) is a LEGAL asset_symbol under 0060's
--      btrim-based CHECK, and no subject this read path can produce will ever equal it,
--      so a genuine embargo on such a symbol reads as `empty`. THAT one is not fixable
--      from here — it is 0060's CHECK — and it is named rather than papered over.)
--
--      AND THE SET ITSELF HAD THE SAME CLASS OF BUG, VERIFIED AGAINST A REAL SERVER.
--      It was written E' \t\n\r\f\v'. Postgres' escape-string syntax defines \b \f \n \r
--      \t and the numeric forms AND NOTHING ELSE: "any other character following a
--      backslash is taken literally", so E'\v' IS THE LETTER v, not U+000B.
--        select length(E' \t\n\r\f\v'), ascii(right(E' \t\n\r\f\v',1));  →  6 | 118
--      That set therefore trimmed a lowercase 'v' and did NOT trim a vertical tab, so a
--      stored 'SOL' || chr(11) — refused by the code, because JS .trim() strips U+000B —
--      was still invisible to this index, which is the exact under-report this section
--      claims to have closed. \x0B is the documented hex form and is 11:
--        select ascii(right(E' \t\n\r\f\x0B',1));                        →  11
--      (No well-formed row was falsely indexed by the old set: a normalised ticker_norm
--      is uppercase, so it cannot contain a lowercase 'v'. The fault was one-directional
--      — under-reporting — which is the direction that matters here.)
--   2. THE LEADING '$'. cleanTicker strips it, so a stored '$SOL' is refused by the code
--      (cleanTicker('$SOL') = 'SOL' <> '$SOL'), while '$SOL' IS its own upper(btrim(...))
--      and was invisible to the old predicate. regexp_replace now mirrors the strip.
--   3. THE LENGTH BOUND. 0060 caps asset_symbol at 20 and the code refuses a longer
--      stored value under OTHER_LEDGER_TICKER_UNUSABLE. The old predicate ignored length.
--
-- So the predicate below is cleanTicker's own definition, in SQL, in cleanTicker's own
-- order (trim → strip a leading '$' → upper), plus 0060's length bound. btrim, upper and
-- regexp_replace are all IMMUTABLE, which is what makes them legal in an index predicate.
--
-- STILL NOT CLOSED, and stated rather than implied: JS `.trim()` also strips non-ASCII
-- whitespace (U+00A0, U+2028, …) and JS `toUpperCase()` and Postgres `upper()` differ for
-- some non-ASCII input (German ß among them). A ticker containing either would be refused
-- by the code and invisible here. No ticker in this book is non-ASCII, so the residual is
-- named and not chased.
--
-- The blank case is EXCLUDED: a ticker_norm that is empty or all whitespace is not a
-- normalisation fault, it is an ABSENT ticker, which `otherLedger.ts` reports as
-- `no_ticker` under OTHER_LEDGER_TICKER_ABSENT — a different state and a different job.
-- Excluded explicitly rather than leaving a reader to wonder which bucket it fell in.
CREATE INDEX IF NOT EXISTS idx_projects_ticker_norm_unjoinable
  ON projects (id)
  WHERE ticker_norm IS NOT NULL
    AND btrim(ticker_norm, E' \t\n\r\f\x0B') <> ''
    AND (length(ticker_norm) > 20
         OR ticker_norm <> upper(regexp_replace(btrim(ticker_norm, E' \t\n\r\f\x0B'), '^\$', '')));

COMMENT ON INDEX idx_projects_ticker_norm_unjoinable IS
  'Rows whose ticker_norm is not its own cleanTicker() output, or is longer than the 20 '
  'characters 0060 allows, and therefore CANNOT equal any '
  'marketing_asset_embargo.asset_symbol. Each such row makes the listing-perimeter join '
  'return zero rows for that project, and zero rows on a conflict check reads as "clear" '
  '— a false negative on a MiCA Art 91(3)(c) personal liability control. THE PREDICATE IS '
  'DELIBERATELY THE SET access/otherLedger.ts REFUSES (codes '
  'OTHER_LEDGER_TICKER_NOT_NORMALISED and OTHER_LEDGER_TICKER_UNUSABLE), so this count '
  'answers "how many rows does the read path refuse?" and not a looser question. Created '
  'by 0072 because nothing could ask. Expected to be EMPTY: if it is not, the listed '
  'projects need re-normalising and the read path refuses them in the meantime rather '
  'than answering. Known producer: cleanTicker(''$ sol'') returns '' SOL'' '
  '(apps/api/src/import/types.ts strips the ''$'' after the trim). NOT covered: non-ASCII '
  'whitespace and non-ASCII case, where JS trim/toUpperCase and Postgres btrim/upper '
  'disagree — refused by code, invisible here.';

COMMENT ON COLUMN projects.ticker_norm IS
  'cleanTicker(ticker). ALSO THE JOIN KEY INTO LCX MARKETING''s market-abuse register: '
  'access/otherLedger.ts joins it to marketing_asset_embargo.asset_symbol to answer, '
  'VERDICT-ONLY, whether an asset sits inside the listing perimeter. That column is '
  'CHECK-enforced to upper(btrim(...)), 1-20 chars (0060); this one is NOT enforced, so '
  'a denormalised value here is a SILENT join miss and not a cosmetic problem. See '
  'idx_projects_ticker_norm_unjoinable.';

COMMENT ON COLUMN marketing_asset_embargo.asset_symbol IS
  'The asset symbol, uppercase-asserted by CHECK (0060). READ CROSS-COMPARTMENT, '
  'VERDICT-ONLY: access/verdictBroker.ts answers whether an entry exists for a symbol, '
  'what it means for the asker, and how many entries are being withheld. It never returns '
  'state, event_ref, source_ref, entered_by or any window — those are the onward '
  'disclosure MiCA Art 90(1) prohibits, and routes/audit.ts withholds this same column '
  'from readers without the marketing compartment for exactly that reason. THE VERDICT '
  'DOES READ `state`: a live in-window entry recording ''clear'', ''announced'' or '
  '''exempt_offer'' is NOT reported as restricted, because three of the four states 0060 '
  'allows are not a block and deriving the verdict from row existence alone published an '
  'inference as a certainty. Whether GPS may ask the question at all is the owner''s '
  'decision and ships DEFAULT-DENY behind GPS_MAY_READ_LISTING_VERDICT; with it unset the '
  'broker returns VERDICT_BROKER_CROSS_READ_NOT_AUTHORISED, never an empty, and an '
  'UNPOPULATED register is NOT-LOADED rather than a genuine absence. Written by two '
  'paths: the governed marketing_embargo_enter action (approver-gated), and '
  'access/otherLedger.ts when a deal reaches ''proposal'' (state ''mnpi_pending'', '
  'event_ref ''deal-proposal:<dealId>''). That second path uses NO ON CONFLICT clause: a '
  '23505 raises and is branched on, per the prohibition in '
  'apps/api/src/marketing/abuseRegister.ts, and a collision with a lifted or a foreign '
  'live entry is a REFUSAL, never a signal reported as in force.';
