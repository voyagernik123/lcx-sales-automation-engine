-- ──────────────────────────────────────────────
--  0058 — GPS ARTIFACT CUSTODY: where the bytes actually are, and the download grant
--
--  ══ WHY THIS FILE EXISTS AT ALL, STATED BEFORE ANYTHING ELSE ════════════════
--  0057 answered decision D2 (LCX DPO — controller vs processor for a third party's
--  confidential material) in the affirmative and created `gps_artifact`: one row per
--  stored client document, with a `storage_key` pointing into a private Supabase
--  Storage bucket that the same file creates and closes. That is the RIGHT design and
--  it is not the design that ships today, for one reason that no amount of SQL can
--  argue with:
--
--    REACHING A SUPABASE STORAGE BUCKET FROM THIS API NEEDS A SERVICE CREDENTIAL.
--    `lib/env.ts` has no Supabase URL and no service-role key, and the owner has
--    twice refused to be handed a new environment variable to set. A credential with
--    a committed fallback is not a credential. So the bucket exists, is private, and
--    NOTHING WRITES TO IT — which means `gps_artifact` alone is a table full of keys
--    to objects that were never put anywhere, i.e. an intake surface that accepts a
--    document and loses it.
--
--  The choice was therefore between shipping no intake at all and keeping byte
--  custody in Postgres. Client files are allowed as of 2026-08-02; an intake surface
--  that silently drops them is worse than either option. So the bytes live here, in
--  ONE dedicated table, with the cost of that stated plainly below rather than
--  discovered later.
--
--  ══ THE COST, HONESTLY. THIS IS THE PARAGRAPH TO ARGUE WITH. ════════════════
--  0057:38-44 gives three reasons a byte column is wrong. Two of them are answered
--  here; one is NOT, and pretending otherwise is how a known cost becomes a surprise.
--
--    "every logical backup and every pg_dump a developer takes"  — NOT ANSWERED.
--      A `pg_dump` of this database now contains client documents. That is true, it
--      is the price of having no storage credential, and the mitigation is
--      procedural rather than schematic: `gps_artifact_blob` is a separate table
--      from `gps_artifact` precisely so that `pg_dump --exclude-table=
--      gps_artifact_blob` is a complete answer for anyone taking a working copy,
--      and so that a mis-scoped `SELECT *` on the table everything reads cannot
--      drag a confidential document into a response.
--    "a large object has no row level security"                   — ANSWERED.
--      This is an ordinary table in `public`, RLS is enabled below, and there is no
--      policy — which is deny-all. `pg_largeobject` could not have been protected
--      at all; this can, and is.
--    "Supabase exposes public tables through its auto-generated REST API"
--                                                                 — ANSWERED.
--      That exposure is mediated by RLS. With RLS on and no policy, the anon and
--      authenticated roles read nothing from either table below, exactly as for
--      `gps_artifact` itself (0057:320) and every other gps_ table since 0047.
--      The API connects as the database owner and bypasses RLS, which is the
--      arrangement production has proven daily since 0042.
--
--  ══ WHAT MUST HAPPEN TO MOVE TO THE BUCKET LATER ═══════════════════════════
--  Nothing in this file is load-bearing for that migration path, and it is worth
--  writing down while it is cheap:
--    1. A Supabase service credential reaches `lib/env.ts` (an owner decision).
--    2. `gps/artifact.ts` writes the object under the `storage_key` this row
--       already carries — the key is derived from ids, not from the custody model,
--       so it does not change.
--    3. A one-time job copies `gps_artifact_blob.bytes` to the bucket per key,
--       verifies the sha256 already stored on `gps_artifact`, and only then deletes
--       the blob row. Verify before delete, in that order.
--    4. That deletion is a separate migration, reviewed on its own, because it is
--       the only destructive act in this whole feature.
--  Until step 1 happens the bucket is an empty, private, closed destination — the
--  right state for it to be in on the day someone does write to it.
--
--  IDEMPOTENT, FORWARD-ONLY, SAFE TO PASTE. Every object is IF NOT EXISTS. No
--  statement removes, truncates or retypes anything. There is no policy, in either
--  table, on purpose.
--
--  APPLIED BY HAND in the Supabase SQL editor, AFTER 0057 — `gps_artifact_blob`
--  references `gps_artifact(id)`, so 0057 first or this file raises 42P01.
-- ──────────────────────────────────────────────


-- ── The bytes, alone, reached only by primary key ─────────────────────────────
--  ONE ROW PER ARTIFACT AND NOTHING ELSE IN IT. No filename, no client id, no mime
--  type: every fact about the document is on `gps_artifact`, so a question about
--  what we hold is answered without this table being read at all, and this table is
--  touched by exactly one query — the download, by primary key.
--
--  THE PRIMARY KEY IS THE FOREIGN KEY. There is no separate id, so a second blob row
--  for one artifact is unrepresentable rather than merely unlikely: two rows would
--  mean two different sets of bytes claiming one sha256, and the digest on
--  `gps_artifact` is what a handover dispute is settled with.
--
--  ON DELETE CASCADE, and read that in the direction it actually runs: removing a
--  `gps_artifact` row removes the bytes. Ordinary erasure does NOT take that path —
--  it sets `deleted_at` and leaves both rows standing, because the record that we
--  held the material is the fact a regulator asks about (0057:197-202). The cascade
--  is for the case where the client row itself is removed and the whole chain goes
--  with it, and it is the one place in this feature where bytes disappear with no
--  `purged_at` to show for it. Whoever wires client removal owes that a look.
CREATE TABLE IF NOT EXISTS gps_artifact_blob (
  artifact_id uuid PRIMARY KEY REFERENCES gps_artifact(id) ON DELETE CASCADE,

  -- THE ONLY BYTE-BEARING COLUMN IN THE WHOLE GPS COMPARTMENT, and
  -- `gps/__tests__/intakeLockout.test.ts` fails the build if a second one appears
  -- anywhere. The bounds restate the bucket's `file_size_limit` and
  -- `gps_artifact.byte_size`'s CHECK (0057:127), so three independent enforcement
  -- points agree on what an acceptable object is and none of them can drift alone.
  -- > 0 because zero bytes is a failed upload wearing a success's clothes.
  bytes       bytea NOT NULL
                CONSTRAINT gps_artifact_blob_is_a_real_object
                CHECK (octet_length(bytes) > 0 AND octet_length(bytes) <= 26214400),

  stored_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gps_artifact_blob ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gps_artifact_blob IS
  'The bytes of a client document, one row per gps_artifact, reached only by primary '
  'key. Deny-all under RLS with no policy. EXCLUDE THIS TABLE FROM ANY WORKING-COPY '
  'DUMP: pg_dump --exclude-table=gps_artifact_blob. Custody is in Postgres and not in '
  'the gps-artifacts bucket only because the API has no Supabase service credential; '
  'see the header of 0058 for the cost and the migration path.';


-- ── One download link, single use, actor-bound ────────────────────────────────
--  WHY A TABLE AND NOT A SIGNED URL. An HMAC URL needs a signing secret, which needs
--  an environment variable the owner has refused twice; reusing the sign-in secret
--  for URL signing couples two unrelated blast radii, and a secret with a committed
--  fallback is not a secret. A capability ROW is strictly stronger than the URL it
--  replaces — revocable, single-use, auditable, and expiring by a clock the client
--  cannot influence — and it needs nothing from the environment.
--
--  THE TOKEN IS NOT IN HERE. `token_sha256` is stored; the token itself is returned
--  once and is not recoverable from this table, so a dump of it yields no usable
--  link. Fixed shape (64 lowercase hex) so a truncated digest cannot become a second
--  identity for one token.
CREATE TABLE IF NOT EXISTS gps_artifact_grant (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id  uuid NOT NULL REFERENCES gps_artifact(id) ON DELETE CASCADE,

  token_sha256 text NOT NULL
                 CONSTRAINT gps_artifact_grant_token_is_a_digest
                 CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),

  -- WHO THE LINK WAS ISSUED TO, and redemption compares against it. Without this a
  -- leaked link is a bearer token for a client's confidential file; with it, the
  -- link is useless to anyone but the principal who asked for it. Same roster
  -- posture as gps_artifact.uploaded_by (0057:172) and the same honest limit:
  -- attribution is only as strong as the shared DESK_PASSCODE until per-person
  -- credentials exist.
  actor        text NOT NULL
                 CONSTRAINT gps_artifact_grant_is_attributed
                 CHECK (length(btrim(actor)) > 0 AND length(actor) <= 120),

  -- A GRANT WITH NO EXPIRY IS NOT A GRANT. NOT NULL and capped: the API mints these
  -- at 60 seconds, and this CHECK means no route, batch update or hand-written SQL
  -- can create a link that outlives the day it was issued.
  expires_at   timestamptz NOT NULL,

  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gps_artifact_grant_expiry_is_bounded
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 day'),

  CONSTRAINT gps_artifact_grant_use_follows_issue
    CHECK (used_at IS NULL OR used_at >= created_at)
);

-- SINGLE USE IS ENFORCED BY THIS INDEX PLUS THE REDEEMING UPDATE'S OWN WHERE CLAUSE
-- (`used_at IS NULL AND expires_at > now()`, checked and set in one statement, so two
-- concurrent redemptions of one token cannot both win). Unique so a token cannot be
-- registered twice and turned back into a multi-use link.
CREATE UNIQUE INDEX IF NOT EXISTS gps_artifact_grant_token_key
  ON gps_artifact_grant (token_sha256);

-- "WHAT LINKS ARE OUTSTANDING FOR THIS ARTIFACT" — the read a soft delete performs
-- to burn them, so removing a document cannot leave a live link to it.
CREATE INDEX IF NOT EXISTS gps_artifact_grant_outstanding_idx
  ON gps_artifact_grant (artifact_id)
  WHERE used_at IS NULL;

ALTER TABLE gps_artifact_grant ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gps_artifact_grant IS
  'One row per download link for a gps_artifact: single use, actor-bound, short TTL. '
  'Only the token digest is stored, so no usable link can be read out of this table. '
  'Deny-all under RLS with no policy.';


-- ── What this file deliberately does NOT do ───────────────────────────────────
--  No purge worker and no retention job, for the reason 0057:470-475 gives: nothing
--  writes `gps_artifact.purged_at`, so every erasure claim stays "settled, bytes
--  still held", which is the truth. When a purge worker is written, the statement it
--  issues against this table is a DELETE and it belongs in its own reviewed
--  migration alongside the code that runs it.
--  No expired-grant cleanup. A used or expired row is inert — the redeeming UPDATE
--  refuses both — and the row is the record that a link was issued, which is worth
--  more than the bytes it costs.
--  No trigger, and no `updated_at`. Neither table is ever updated except by the one
--  statement that burns a grant.
