-- ──────────────────────────────────────────────
--  0057 — GPS ARTIFACT: the intake surface nine migrations refused to build
--
--  ══ D2 IS ANSWERED. THAT IS WHAT THIS FILE IS. ══════════════════════════════
--  Every GPS migration from 0047 to 0056 carries the same paragraph: no artifact,
--  attachment or byte-bearing column exists anywhere in the compartment, because
--  decision D2 — is LCX controller or processor for a third party's confidential
--  material, what is the subprocessor chain, what is the retention, what is the
--  erasure path — was UNANSWERED by LCX legal/the DPO, and a system that cannot
--  accept a document cannot mishandle one (0047_gps.sql:26-36).
--
--  On 2026-08-02 the owner answered it: GPS MAY STORE CLIENT DOCUMENTS. So the
--  lockout ends here, in the one place it was always designed to end — its own
--  migration, with the four questions answered IN THE SCHEMA rather than in a
--  policy document:
--    controller/processor  — not a column. Recorded per engagement in the
--                            contracting entity (0047_gps.sql:150) and in the
--                            disclosure record (0050); this file does not restate
--                            it, because a second copy of a legal position is a
--                            second position.
--    subprocessor chain    — ONE processor, named: Supabase Storage, the same
--                            database vendor already holding the commercial
--                            terms. Not S3, not R2, not Render's disk. The chain
--                            does not lengthen by one row of intake.
--    retention             — `retention_until` is NOT NULL with a default and a
--                            hard ceiling. "Stored forever, no policy" is
--                            unrepresentable, not discouraged.
--    erasure               — `deleted_at` (the record is settled) and
--                            `purged_at` (the bytes are actually gone) are two
--                            columns because they are two facts, and only the
--                            second one answers a client's erasure request.
--
--  ══ SUPABASE STORAGE. NOT bytea, NOT A LARGE OBJECT. ════════════════════════
--  The bytes never enter a table. This file stores a KEY into a private bucket and
--  the metadata needed to reason about the object without fetching it — size,
--  type, digest, who put it there, when it may be removed. Three reasons that is
--  the only acceptable shape:
--    A bytea column puts client documents in every logical backup, every
--    `pg_dump` a developer takes, and every row a mis-scoped SELECT * returns.
--    A large object (`lo`/`oid`) puts them in a server-side namespace with NO row
--    level security at all — pg_largeobject is not an RLS-protected table — which
--    would silently undo the posture 0047 established for the whole compartment.
--    And Supabase exposes `public` tables through its auto-generated REST API, so
--    a byte column is one leaked anon key away from being a document download.
--
--  THE BUCKET AND ITS POLICIES ARE CREATED HERE, NOT CLICKED. `storage.buckets`
--  and `storage.objects` are ordinary tables in the `storage` schema, so the
--  bucket, its private flag, its size cap, its type allow-list and its deny-all
--  posture for the anon and authenticated roles are all declared in this file.
--  A bucket created in a dashboard is a security posture that lives in a click
--  nobody records, and a database restored from these migrations alone would come
--  up with no bucket and no policy while the API kept writing keys.
--
--  IDEMPOTENT, FORWARD-ONLY, AND SAFE TO PASTE. No statement here removes,
--  truncates or retypes anything: every table and index is IF NOT EXISTS, the
--  bucket is an upsert, and each policy is created only when `pg_policies` says it
--  is absent. That last one is why this file contains the repository's first
--  plpgsql block: `CREATE POLICY` has no IF NOT EXISTS form, and the only other
--  way to re-run it is to remove the policy first — which raises the Supabase SQL
--  editor's destructive-operation warning and costs the person applying it a round
--  trip. A guarded block costs nothing and re-runs cleanly.
--
--  THE SAME BLOCK MAKES THE FILE PORTABLE. On a plain Postgres (a developer's
--  local database) the `storage` schema does not exist; the block notices, raises
--  a NOTICE, and leaves `gps_artifact` created and correct. The table is the part
--  that has to exist everywhere; the bucket only has to exist where Supabase is.
--
--  ══ AMENDMENT, SAME DAY, BEFORE EITHER FILE WAS APPLIED ════════════════════
--  The section above is the intended design and it is not the one that ships. The
--  API cannot reach a Supabase Storage bucket without a service credential, and no
--  new environment variable is available to carry one, so nothing writes to the
--  bucket this file creates — leaving `storage_key` a pointer to an object that was
--  never put anywhere. Byte custody therefore lives in `gps_artifact_blob`, created
--  by 0058_gps_artifact_custody.sql, which states the cost of that (client documents
--  are in a `pg_dump`) and the path back to the bucket. READ 0058's HEADER BEFORE
--  ARGUING WITH THIS ONE. What stays true here: the bucket is created private and
--  closed, so the day a credential exists the destination already exists and is
--  already shut, and `storage_key` is derived from ids rather than the custody model
--  and so does not change when custody moves.
--
--  APPLIED BY HAND in the Supabase SQL editor, BEFORE 0058. Nothing wires
--  `db/migrate.ts` into the deploy, and this file is not applied by shipping code.
-- ──────────────────────────────────────────────


-- ── The artifact ──────────────────────────────────────────────────────────────
--  ONE ROW PER STORED OBJECT, and the row is the thing GPS reasons about — the
--  object is opaque to it. Nothing in the API reads, parses, renders, indexes or
--  extracts text from the bytes: the compartment gained an intake surface, not a
--  document-understanding pipeline, and every capability the bytes would unlock is
--  a separate decision with its own review.
--
--  WHY NOT COLUMNS ON gps_deliverable (0049_gps_delivery.sql:230). That table's
--  `external_location` is a HUMAN-TYPED REFERENCE to material living somewhere
--  else, deliberately unresolvable (0049:283). It stays exactly that. An uploaded
--  object is the opposite fact — material on LCX infrastructure, with a size, a
--  digest and a retention clock — and folding the two into one column would make
--  "do we hold this?" unanswerable, which is the single question an erasure
--  request asks. `external_location` is untouched by this file.
CREATE TABLE IF NOT EXISTS gps_artifact (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Carried directly, and held true by the composite foreign key at the bottom of
  -- this table rather than by application discipline — the rule 0047_gps.sql:38
  -- set for every GPS table and 0049_gps_delivery.sql:95 made enforceable. It
  -- matters more here than anywhere else in the compartment: "every document we
  -- hold for this client" must be a scan, not a join somebody has to write
  -- correctly, because that read IS the erasure response and the breach-
  -- notification scope.
  client_id      uuid NOT NULL REFERENCES gps_client(id) ON DELETE CASCADE,
  engagement_id  uuid NOT NULL,

  -- What the client called the file. NOT a path: a filename carrying a separator
  -- is either an accident or an attempt to escape a prefix, and both are rejected
  -- here so no later code has to remember to sanitise it. chr(92) is a backslash,
  -- spelled that way because a literal one inside a LIKE pattern is escape-
  -- sensitive and this constraint has to be obviously correct.
  filename       text NOT NULL
                   CONSTRAINT gps_artifact_filename_is_a_name
                   CHECK (length(btrim(filename)) > 0
                          AND length(filename) <= 255
                          AND strpos(filename, '/') = 0
                          AND strpos(filename, chr(92)) = 0),

  -- WHAT THE UPLOAD CLAIMED IT WAS, well-formed but not believed. The regex
  -- rejects a parameterised or upper-cased type so two rows cannot describe one
  -- format two ways; it does NOT inspect the bytes, and nothing here does. The
  -- ALLOW-LIST lives on the bucket (`allowed_mime_types` below), where the storage
  -- service enforces it at upload time on the real content type — a CHECK in this
  -- table could only police the string the API chose to write.
  mime_type      text NOT NULL
                   CONSTRAINT gps_artifact_mime_type_is_well_formed
                   CHECK (mime_type ~ '^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$'
                          AND length(mime_type) <= 200),

  -- Bytes, as the storage service reported them. The upper bound is the bucket's
  -- `file_size_limit` restated: two independent enforcement points that agree, so
  -- a row can never claim an object the bucket would have refused. > 0 because a
  -- zero-byte artifact is a failed upload wearing a success's clothes.
  byte_size      bigint NOT NULL
                   CONSTRAINT gps_artifact_byte_size_is_a_real_object
                   CHECK (byte_size > 0 AND byte_size <= 26214400),

  -- LOWERCASE HEX, EXACTLY 64. This is the identity of the content, and it is what
  -- makes "the same file twice is one row" enforceable rather than aspirational
  -- (see the unique index below). Fixed shape so a truncated or upper-cased digest
  -- cannot create a second identity for identical bytes.
  sha256         text NOT NULL
                   CONSTRAINT gps_artifact_sha256_is_a_digest
                   CHECK (sha256 ~ '^[0-9a-f]{64}$'),

  -- THE KEY INTO THE PRIVATE BUCKET, and the one place this schema touches
  -- storage at all. Two constraints earn their keep:
  --   It must CONTAIN THE CLIENT UUID. The keyspace is per client, so a row
  --   pointing at another client's object is unrepresentable rather than merely
  --   unlikely — the confidentiality failure this compartment exists to prevent,
  --   closed in the database instead of in whichever handler happens to run.
  --   ANY key layout that scopes by client satisfies it; it constrains the
  --   property, not the format.
  --   No '..' segment, because a key is a name and not a traversal.
  storage_key    text NOT NULL
                   CONSTRAINT gps_artifact_storage_key_is_client_scoped
                   CHECK (length(btrim(storage_key)) > 0
                          AND length(storage_key) <= 400
                          AND strpos(storage_key, client_id::text) > 0
                          AND strpos(storage_key, '..') = 0),

  -- WHAT THIS DOCUMENT IS TO US, as a closed set with a default so a writer that
  -- does not care need not choose. It is not decoration: 'client_input' is a third
  -- party's confidential material and 'deliverable_draft' is our own work product,
  -- and only the first one is what D2 was ever about.
  kind           text NOT NULL DEFAULT 'client_input'
                   CHECK (kind IN (
                     'client_input', 'deliverable_draft', 'signed_document',
                     'correspondence', 'other'
                   )),

  -- A NAMED HUMAN from the desk roster, same posture as
  -- gps_conflict_check.decided_by (0047_gps.sql:286): text because the roster is
  -- compiled code (packages/shared/src/operators.ts), NOT NULL because an
  -- unattributed receipt of a third party's confidential file is the record a
  -- regulator would find missing. Same HONEST LIMIT as everywhere else in GPS —
  -- attribution is only as strong as the shared DESK_PASSCODE until per-person
  -- credentials exist, so this is self-asserted today.
  uploaded_by    text NOT NULL
                   CONSTRAINT gps_artifact_upload_is_attributed
                   CHECK (length(btrim(uploaded_by)) > 0
                          AND length(uploaded_by) <= 120),

  uploaded_at    timestamptz NOT NULL DEFAULT now(),

  -- ══ RETENTION, NOT NULL, AND CAPPED AT BOTH ENDS ══════════════════════════
  -- The default is two years from receipt: long enough to cover an engagement plus
  -- a plausible dispute window, short enough that the answer to "why do you still
  -- have this?" is a date rather than a shrug. It is NOT the ten-year books-and-
  -- records clock — that clock is about the ENGAGEMENT (its price, its invoice,
  -- its conflict check, all in other tables with no such limit), never about a
  -- client's confidential draft, and conflating the two is how minimisation dies.
  --
  -- The CHECK is the load-bearing half. A retention date at or before receipt is
  -- nonsense, and a date beyond ten years is "forever" spelled with digits; both
  -- fail here, so no route, batch update or hand-written SQL can create an
  -- artifact with no real expiry. Extending an individual row inside the ceiling
  -- is a deliberate, visible act.
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '2 years')
                   CONSTRAINT gps_artifact_retention_is_bounded
                   CHECK (retention_until > uploaded_at
                          AND retention_until <= uploaded_at + interval '10 years'),

  -- ══ ERASURE IS TWO FACTS, SO IT IS TWO COLUMNS ════════════════════════════
  -- `deleted_at` says the desk has settled that we should not hold this any more.
  -- `purged_at` says the object is actually gone from the bucket. Only the second
  -- one is an answer to a client or a supervisor, and a single flag would let the
  -- system report an erasure it had not performed — the exact failure mode that
  -- makes an erasure log worse than none.
  deleted_at     timestamptz,
  deleted_by     text
                   CONSTRAINT gps_artifact_removal_is_attributed
                   CHECK (deleted_by IS NULL
                          OR (length(btrim(deleted_by)) > 0
                              AND length(deleted_by) <= 120)),

  -- Why it was settled, in the operator's words ("client withdrew", "retention
  -- reached", "uploaded in error"). Free text, because the useful sentence is
  -- always about the client and no enum would have held it.
  deleted_reason text
                   CONSTRAINT gps_artifact_removal_reason_is_a_note
                   CHECK (deleted_reason IS NULL OR length(deleted_reason) <= 1000),

  purged_at      timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- A removal with no named human is not a removal, for the same reason
  -- gps_deliverable_review_is_attributed (0049_gps_delivery.sql:319) exists: an
  -- unattributed decision looks like assurance and is not.
  CONSTRAINT gps_artifact_removal_names_someone
    CHECK (deleted_at IS NULL OR deleted_by IS NOT NULL),

  -- Bytes cannot be gone before the desk settled that they should be. Without
  -- this, a purge job that ran ahead of the record would leave a row claiming we
  -- hold an object that no longer exists.
  CONSTRAINT gps_artifact_purge_follows_removal
    CHECK (purged_at IS NULL OR (deleted_at IS NOT NULL AND purged_at >= deleted_at)),

  -- Nothing can be settled or purged before it arrived.
  CONSTRAINT gps_artifact_removal_follows_upload
    CHECK (deleted_at IS NULL OR deleted_at >= uploaded_at),

  -- The drift guard 0049_gps_delivery.sql:191 established, against the unique
  -- index `gps_engagement_id_client_key` that migration created. ON UPDATE CASCADE
  -- so re-parenting an engagement to the correct client carries its documents
  -- instead of being blocked by them; ON DELETE CASCADE so no orphaned pointer to
  -- a live object survives its engagement.
  --
  -- STATED PLAINLY: a cascade removes the ROW, never the OBJECT. Bytes in a bucket
  -- have no foreign keys, so a cascaded row is exactly how an object becomes
  -- unreferenced and invisible to the purge worklist below. Whoever wires the
  -- client-removal path owes a sweep of the bucket prefix; the database cannot do
  -- it and this file does not pretend otherwise.
  CONSTRAINT gps_artifact_engagement_client_fk
    FOREIGN KEY (engagement_id, client_id)
    REFERENCES gps_engagement (id, client_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);


-- ── The indexes the real reads need, and only those ───────────────────────────

-- THE SAME FILE TWICE IS ONE ROW. Per client, not per engagement: a client who
-- sends the same signed document with two engagements should not be stored twice,
-- and the digest is what makes that decidable. An intake route upserts on this
-- (`ON CONFLICT (client_id, sha256) WHERE deleted_at IS NULL`), which is also why
-- a re-upload is idempotent rather than a duplicate.
--
-- PARTIAL, on live rows only, and that is the honest version. If the index covered
-- settled rows too, a document removed at the client's request could never be
-- accepted again — the retention decision would silently become a permanent
-- refusal, and the operator would see a constraint violation with no explanation.
-- One LIVE row per (client, digest) is the invariant that is actually true.
CREATE UNIQUE INDEX IF NOT EXISTS gps_artifact_client_sha256_key
  ON gps_artifact (client_id, sha256)
  WHERE deleted_at IS NULL;

-- ONE ROW PER OBJECT, ALWAYS — not partial, unlike the digest above. Two rows
-- pointing at one key would let a settled row's purge remove the bytes out from
-- under a live row, which is a document disappearing with no record of why.
CREATE UNIQUE INDEX IF NOT EXISTS gps_artifact_storage_key_key
  ON gps_artifact (storage_key);

-- The engagement's file list, newest first — the intake screen. Partial: a settled
-- artifact is never in that answer.
CREATE INDEX IF NOT EXISTS gps_artifact_engagement_idx
  ON gps_artifact (engagement_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

-- "EVERYTHING WE HOLD FOR THIS CLIENT" — the erasure response and the breach-
-- notification scope, and the reason client_id is carried at all. NOT partial:
-- this read must see settled and purged rows too, because "we held it and removed
-- it on this date" is the answer, not an omission.
CREATE INDEX IF NOT EXISTS gps_artifact_client_idx
  ON gps_artifact (client_id, uploaded_at DESC);

-- THE RETENTION SWEEP. Without this index the retention column is a promise
-- nobody can afford to check; with it, "what is past its date" is one range scan.
-- The column is only trustworthy because this read is cheap enough to run daily.
CREATE INDEX IF NOT EXISTS gps_artifact_retention_idx
  ON gps_artifact (retention_until)
  WHERE deleted_at IS NULL;

-- BYTES STILL ON DISK AFTER THE DESK SETTLED THEY SHOULD NOT BE. Small by
-- definition and the only list that answers an erasure request truthfully; if it
-- is not empty, the system has not finished erasing.
CREATE INDEX IF NOT EXISTS gps_artifact_purge_pending_idx
  ON gps_artifact (deleted_at)
  WHERE deleted_at IS NOT NULL AND purged_at IS NULL;


-- ── Row Level Security ────────────────────────────────────────────────────────
--  DECLARED HERE, not left to a dashboard button, for the reason 0047_gps.sql:334
--  gives: Supabase's SQL editor offers "Run and enable RLS" when it sees a
--  CREATE TABLE in `public` without it, and taking that option leaves the security
--  posture living in a click nobody records.
--
--  NO POLICY, because no non-owner role should reach this table at all: RLS with no
--  policy is deny-all, which is exactly the intent. The API connects as the
--  database owner and bypasses RLS — the arrangement 0042 relies on and production
--  proves daily. What this closes is the anon-key path to a list of every
--  confidential document a named client has sent an exchange employee, which is a
--  worse disclosure than the commercial terms 0047 was protecting: the row names
--  the client, the filename and the exact key needed to ask storage for the bytes.
ALTER TABLE gps_artifact ENABLE ROW LEVEL SECURITY;


-- Read by anyone who opens this table in a client and wonders where the bytes are.
COMMENT ON TABLE gps_artifact IS
  'Metadata for client documents. The bytes are NOT in this table: they are in '
  'gps_artifact_blob (created by 0058), because the API has no Supabase service '
  'credential and so cannot write to the private gps-artifacts bucket that '
  'storage_key names. That bucket exists and is closed; nothing writes to it yet. '
  'Retention is enforced by retention_until (NOT NULL, '
  'capped at 10 years); erasure is deleted_at (settled) plus purged_at (bytes '
  'actually gone). Created by 0057, which is where GPS decision D2 was answered.';

COMMENT ON COLUMN gps_artifact.storage_key IS
  'The object name for this artifact, unique across the table and derived from ids '
  'this server trusts — never from the uploaded filename. It is the key in the '
  'private bucket gps-artifacts, which nothing writes to yet (see 0058); today the '
  'bytes for this row are gps_artifact_blob.bytes, found by id. MUST contain the '
  'row''s client_id as a substring — enforced by '
  'gps_artifact_storage_key_is_client_scoped, so a row can never point at another '
  'client''s object.';

COMMENT ON COLUMN gps_artifact.purged_at IS
  'When the OBJECT was removed from the bucket, not when the row was settled. A '
  'row with deleted_at set and purged_at null means we still hold the bytes.';


-- ── The bucket and its policies ───────────────────────────────────────────────
--  ONE GUARDED BLOCK, and every line of it is here rather than in a dashboard.
--
--  WHY A BLOCK AT ALL — the two reasons, stated so nobody unpicks it later:
--    1. `CREATE POLICY` has no IF NOT EXISTS form. The alternative to a guard is a
--       statement that removes the policy first, which trips the Supabase SQL
--       editor's destructive-operation warning on a file a human pastes by hand.
--       A `pg_policies` test costs nothing and re-runs cleanly.
--    2. PORTABILITY. On a plain Postgres there is no `storage` schema and no `anon`
--       role, and a bare INSERT would make this migration unrunnable outside
--       Supabase — leaving `gps_artifact` unreachable in local development for no
--       benefit. The block notices and says so out loud.
--
--  PRIVATE, AND THAT IS ENFORCED TWICE INDEPENDENTLY. `public = false` makes the
--  /object/public/ route return nothing for this bucket, and the restrictive policy
--  below makes the anon and authenticated roles unable to see the objects at all.
--  Either alone would be enough on a good day; both together mean a dashboard
--  click that flips one does not open the bucket.
--
--  ON CONFLICT DO UPDATE, not DO NOTHING, and only for the three fields that ARE
--  the security posture. If the bucket already exists — created by an earlier run,
--  or by hand — re-running this file re-asserts private, re-asserts the size cap
--  and re-asserts the type allow-list. A DO NOTHING would let a bucket someone had
--  made public stay public while this file claimed otherwise, which is the same
--  class of lie as a migration edited after it was applied.
DO $gps_artifact_storage$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'storage' AND table_name = 'objects'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon'
  ) THEN
    RAISE NOTICE '0057: no storage schema or no anon role — not a Supabase database. '
      'gps_artifact exists and is correct; the bucket and its policies were skipped. '
      'Run this file in the Supabase SQL editor to create them.';
    RETURN;
  END IF;

  -- The bucket. 25 MiB (26214400 bytes) is the cap `byte_size` restates, so the
  -- table and the bucket cannot disagree about what an acceptable object is.
  --
  -- THE TYPE ALLOW-LIST IS THE ONLY CONTENT CONTROL IN THE SYSTEM, so it is
  -- deliberately short. No archive types: a zip is a container that can hold
  -- anything, so allowing one would make the list decorative. No macro-enabled
  -- office formats, for the same reason in a more pointed form. If a client needs
  -- to send something not on this list, that is a conversation and then a new
  -- migration — not a widened list nobody reviewed.
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'gps-artifacts',
    'gps-artifacts',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
      'text/csv',
      'image/png',
      'image/jpeg'
    ]
  )
  ON CONFLICT (id) DO UPDATE
    SET public             = false,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- RLS on storage.objects is on in every Supabase project; this only re-asserts it
  -- when it is not, because a restrictive policy on a table with RLS off is a
  -- security posture that does nothing while looking like something. Guarded so the
  -- statement is never issued needlessly.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'storage' AND c.relname = 'objects' AND c.relrowsecurity
  ) THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE '0057: row level security was OFF on storage.objects and is now on.';
  END IF;

  -- ══ NO PUBLIC READ, EVER ═══════════════════════════════════════════════════
  -- AS RESTRICTIVE is the whole point and not a stylistic choice. A permissive
  -- policy grants; a restrictive one is AND-ed into every other policy, so no
  -- future permissive policy — including one added with two clicks in the Storage
  -- dashboard by someone who meant well — can open this bucket to the anon or
  -- authenticated roles. It is the only shape of policy that survives the next
  -- person.
  --
  -- SCOPED BY bucket_id, so it constrains exactly one bucket. `USING (bucket_id <>
  -- 'gps-artifacts')` means rows in every OTHER bucket are untouched by this file;
  -- a blanket USING (false) would have silently broken every other bucket in the
  -- project, which is how a security tightening becomes an outage.
  --
  -- WHAT IT DOES NOT CONSTRAIN, said plainly rather than implied: the API connects
  -- as the database owner, and Supabase's `service_role` carries BYPASSRLS. Neither
  -- is affected by any policy, restrictive or not, and that is what keeps intake
  -- working — the desk reaches these objects through the API, never with an anon
  -- key. Server-signed download URLs are authorised when they are signed and served
  -- by the storage service's own role, so they keep working too; if a future storage
  -- version re-evaluates policies at retrieval time, THIS is the line to revisit.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND policyname = 'gps_artifacts_never_reachable_without_the_api'
  ) THEN
    CREATE POLICY gps_artifacts_never_reachable_without_the_api
      ON storage.objects
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (bucket_id <> 'gps-artifacts')
      WITH CHECK (bucket_id <> 'gps-artifacts');
    RAISE NOTICE '0057: bucket gps-artifacts is private and closed to anon/authenticated.';
  END IF;
END
$gps_artifact_storage$;


-- ── What this file deliberately does NOT do ───────────────────────────────────
--  No route, handler or client code exists here — a migration cannot upload
--  anything, and the intake surface is a separate change in separate files.
--  No retention JOB. `retention_until` and the sweep index make the worklist
--  computable; nothing yet runs it, so an artifact past its date sits there and is
--  VISIBLE rather than quietly erased. A schedule that removed client documents
--  with no operator in the loop would be the more dangerous half to ship first.
--  No purge worker, for the same reason: `purged_at` is the column that will
--  record it, and until something writes it every erasure claim stays "settled,
--  bytes still held", which is the truth.
--  No virus or content scanning of any kind, and the type allow-list on the bucket
--  is not one. Nothing in GPS opens these bytes.
