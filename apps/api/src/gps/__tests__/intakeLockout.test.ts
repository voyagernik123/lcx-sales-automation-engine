import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE INTAKE PERIMETER — one intake surface, at named paths, and nowhere else.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS FILE USED TO BE, AND WHY IT IS NOT THAT ANY MORE.
 *
 * From Phase 0 (S0.4) until 2026-08-02 this file was THE ARTIFACT LOCK: roughly
 * twenty assertions whose combined claim was that NO GPS code, route, column,
 * dependency or migration anywhere could receive a byte of client material. That
 * claim was correct for exactly as long as its premise was — decision D2
 * (GPS_IMPLEMENTATION_PLAN.md §3 D2), "is LCX controller or processor for a third
 * party's confidential material, what is the subprocessor chain, what is the
 * retention, what is the erasure path", was UNANSWERED, and a system that cannot
 * accept a document cannot mishandle one.
 *
 * ON 2026-08-02 THE OWNER ANSWERED D2: GPS MAY STORE CLIENT DOCUMENTS. That is his
 * decision to make and it is made. So the premise is gone and the old claim is
 * false — but the RISK it was managing is not gone, it is realised. GPS now receives
 * a token project's unpublished offering document and its counsel's memoranda onto
 * the infrastructure of an EU/Liechtenstein-regulated exchange. Every reason the
 * lock existed is now a reason the intake surface must stay exactly the shape it was
 * reviewed in.
 *
 * SO THE RATCHET WAS NOT DELETED AND WAS NOT LOOSENED. It was inverted, on the same
 * day, in the same commit as the surface it now guards. The claim changed from
 *
 *     "there is no way for a client document to enter GPS"
 * to
 *     "there is EXACTLY ONE way, it is these two files and these five paths, it
 *      carries these named controls, the bytes land in exactly one column of one
 *      table, every read of them is recorded — and anything else, anywhere in the
 *      compartment, is still a build failure."
 *
 * A second upload route, a byte door in a third file, a widened allowlist, a removed
 * ceiling, a download that stops writing its audit row, a public bucket, a bytea
 * column on any other table: each of those fails a named assertion below. That is a
 * NARROWER property than "no intake", not a weaker one — the old file could not have
 * told a reviewed intake surface from an unreviewed one, because it forbade both.
 *
 * ══ THE SURFACE, AS PINNED BELOW ══════════════════════════════════════════════
 *   apps/api/src/gps/artifact.ts        the engine: ceiling, allowlist, magic bytes,
 *                                      derived key, audit, grants, soft delete
 *   apps/api/src/routes/gpsArtifact.ts  the five paths, mounted INTO gpsRoutes
 *   POST   /engagements/:id/artifacts   upload            (operate)
 *   GET    /engagements/:id/artifacts   list              (view)
 *   GET    /artifacts/:id/download-url  mint a grant      (view)
 *   GET    /artifacts/:id/content       the bytes         (view)
 *   DELETE /artifacts/:id               soft delete       (operate)
 *   0057_gps_artifact.sql               metadata, retention, the private bucket
 *   0058_gps_artifact_custody.sql       gps_artifact_blob.bytes — the ONLY bytea
 *                                       column in the compartment — and the grants
 *
 * WHY SOURCE-LEVEL AND NOT BEHAVIOURAL, unchanged from the original. A behavioural
 * test can only probe routes that exist; half of what this file asserts is about a
 * route, column or file that does not exist YET. The technique is borrowed from
 * apps/api/src/marketing/__tests__/deploySafety.test.ts for the same reason: the
 * property is about what cannot be ADDED, and the only place that is visible is the
 * tree. `routes/__tests__/gpsArtifact.test.ts` and `gps/__tests__/artifact.test.ts`
 * are the behavioural half and they test what the surface DOES; this tests where it
 * is allowed to be.
 *
 * RELATIONSHIP TO ITS PHASE 1 SIBLING. gps/__tests__/noIntake.test.ts pins three
 * named files (routes/gps.ts, gps/service.ts, 0047_gps.sql) and the shared types —
 * and every one of those is still byte-free, so it is still true and still kept. The
 * intake lives in two files that are not among them, deliberately.
 *
 * WHAT IS NOT CLAIMED, because a ratchet quoted as more than it is gets deleted when
 * someone finds the gap:
 *   · It does not say the intake is SAFE. It says the intake is where it was
 *     reviewed. Whether 25 MiB, seven mime types and a two-year retention are the
 *     right numbers is a judgement in `artifact.ts` and `0057`, not here.
 *   · It does not stop a client emailing a document to a human being, and it never
 *     could.
 *   · It does not stop someone pasting confidential text into a free-text field.
 *     `check_performed` and `description` accept prose by design.
 *   · It cannot see inside a jsonb column. Someone determined to break this can
 *     base64 a PDF into `scope_snapshot`. What is checkable is that the jsonb
 *     surface does not GROW without review, so that is what is frozen below — and
 *     that check is UNCHANGED by D2, because a document in a jsonb column is still a
 *     document with no size ceiling, no digest, no retention date and no audit row.
 *   · apps/api ALREADY contains file-capable code and this file does not remove it:
 *     `import/csv.ts:71` calls `XLSX.read(buf, …)` for the seed CLI and
 *     `marketing/xMail.ts:1` opens an IMAP mailbox. Neither is reachable from GPS
 *     and the exactly-checkable claim below is that no GPS file imports either. That
 *     claim did not change on 2026-08-02: an intake surface with a verified
 *     allowlist is not permission to hand a client's file to a spreadsheet parser.
 *   · It says nothing about WHO may upload. `routes/__tests__/gpsArtifact.test.ts`
 *     owns that (401 unauthenticated, 403 for the shared machine key, 'view' on the
 *     reads, 'operate' on the writes).
 *
 * ══ VERIFIED BY MUTATION, on 2026-08-02, after the conversion ═════════════════
 * A ratchet nobody has watched fail is a ratchet nobody knows works — and a ratchet
 * that has just been rewritten to permit something has to be re-verified from
 * scratch, because "still green" is exactly what a broken one looks like. Each edit
 * below was applied to the tree, the named test observed RED, and the edit reverted
 * with the suite green again before the next one:
 *
 *   1  a second upload route `POST /engagements/:id/documents` added to
 *      routes/gpsDelivery.ts                    → 'exactly one GPS file may hold …'
 *                                                 + 'no OTHER GPS route file …'
 *   2  ARTIFACT_MIME_ALLOWLIST emptied to `[]`  → 'the allowlist is not empty'
 *   3  the leading-byte check deleted from
 *      verifyDeclaredMime                        → 'verifies the leading bytes …'
 *   4  ARTIFACT_MAX_BYTES raised to 25 GiB      → 'the ceiling is a real ceiling'
 *   5  readBoundedBody's `total > maxBytes`
 *      branch removed                            → 'refuses instead of truncating'
 *   6  the ceiling read from Content-Length      → 'never trusts Content-Length'
 *   7  `bytes bytea` added to gps_deliverable in
 *      a new 0059 migration                      → 'bytes live in exactly one column'
 *   8  `draft_content text` added instead (the
 *      base64 dodge)                             → 'no OTHER column is shaped like a
 *                                                   document'
 *   9  recordArtifactAudit removed from
 *      redeemDownloadGrant                       → 'every download writes its row'
 *  10  recordArtifactAudit's throw swallowed in
 *      a try/catch                               → 'and fails closed if it cannot'
 *  11  0057's bucket flipped to `public = true`  → 'the bucket is private'
 *  12  the RESTRICTIVE policy made permissive    → 'closed to anon and authenticated'
 *  13  `c.req.parseBody()` in a new gps/intake.ts → 'opens none of the doors the
 *                                                    intake deliberately does not use'
 *  14  `Buffer.from(body)` added to gps/loop.ts  → 'no OTHER GPS file touches bytes'
 *  15  the filename sanitised instead of refused → 'refuses a filename, never
 *                                                    sanitises one'
 *  16  deriveStorageKey built from the filename  → 'the storage key is derived from
 *                                                    ids'
 *  17  `multer` added to apps/api/package.json   → dependency check
 *  18  a `review_meta jsonb` column added        → jsonb freeze
 *  19  `new URL(r.externalLocation)` in shared   → inertness
 *  20  the D2 rationale stripped from 0058       → rationale check
 *  21  RLS dropped from gps_artifact_blob        → 'every table that can hold a
 *                                                   document denies by default'
 *
 * ONE INTEGRATION NOTE. This file asserts that the Phase 3 delivery schema, the
 * shared delivery domain AND the intake surface all EXIST. It therefore fails
 * against a tree without them, by design: it ships with 0049, 0057, 0058,
 * gps/artifact.ts and routes/gpsArtifact.ts, and a green run without any of them
 * would mean a positive half had been quietly removed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** apps/api/src — this file lives at apps/api/src/gps/__tests__/. */
const API_SRC = resolve(HERE, '../..');
const MIGRATIONS = resolve(API_SRC, 'db/migrations');
/** apps/api/src → apps/api → apps → repo root. */
const REPO = resolve(API_SRC, '../../..');
const SHARED_GPS = resolve(REPO, 'packages/shared/src/gps');
const API_PKG = resolve(API_SRC, '../package.json');

/**
 * Comments are stripped before every ABSENCE match. These files discuss uploads,
 * attachments and buckets at length — they have to, because the reason there are
 * none is the most important thing about them — and a ratchet that fired on its
 * own rationale would be neutered by whoever hit it first. Documentation checks
 * below deliberately read the RAW text instead.
 */
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, ' ');

type SourceFile = { readonly path: string; readonly raw: string; readonly code: string };

/** Every .ts under a directory, recursively. node_modules/dist are never sources. */
function walkTs(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTs(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

function load(paths: readonly string[], strip: (s: string) => string): SourceFile[] {
  return paths.map((path) => {
    const raw = readFileSync(path, 'utf8');
    return { path: path.slice(REPO.length + 1), raw, code: strip(raw) };
  });
}

/**
 * THE GPS SURFACE, DISCOVERED. Any .ts under apps/api/src whose path mentions gps,
 * plus the shared GPS domain. Tests are excluded — they are not served to anyone,
 * and they contain the forbidden words on purpose (this file is one of them).
 *
 * Discovery rather than a list is the whole point. A hard-coded list is a ratchet
 * that a new file walks straight past.
 */
const GPS_API_SOURCES = load(
  walkTs(API_SRC)
    // Matched on the path BELOW apps/api/src, never the absolute path: a checkout
    // living in a directory that happens to contain "gps" would otherwise select
    // every file in the API and the failure would look like nonsense.
    .filter((p) => p.slice(API_SRC.length + 1).toLowerCase().includes('gps'))
    .filter((p) => !p.includes('__tests__'))
    .sort(),
  stripTs,
);

const GPS_SHARED_SOURCES = load(
  walkTs(SHARED_GPS)
    .filter((p) => !p.includes('__tests__') && !p.endsWith('.test.ts'))
    .sort(),
  stripTs,
);

const GPS_SOURCES = [...GPS_API_SOURCES, ...GPS_SHARED_SOURCES];

/** Route files — where a path literal could name a file. */
const GPS_ROUTE_FILES = GPS_API_SOURCES.filter((f) => f.path.includes('/routes/'));

/**
 * ══ THE TWO FILES THAT ARE ALLOWED TO TOUCH BYTES, BY NAME. ═══════════════════
 *
 * This is the one hard-coded list in a file whose whole method is discovery, and
 * that is the point of it: everything else is discovered so a NEW file is covered on
 * the day it appears, and these two are named so a new file can never join them by
 * being named plausibly. `gps/intake.ts`, `gps/upload.ts`, `routes/gpsFiles.ts` are
 * all discovered (their paths contain "gps") and none of them is on this list, so
 * each one is a build failure the moment it reads a byte.
 *
 * Adding a third entry here is therefore a deliberate, reviewable act — which is
 * exactly the review trigger a second intake surface should have to pass.
 */
const INTAKE_ENGINE = 'apps/api/src/gps/artifact.ts';
const INTAKE_ROUTES = 'apps/api/src/routes/gpsArtifact.ts';
const INTAKE_FILES: readonly string[] = [INTAKE_ENGINE, INTAKE_ROUTES];

const isIntakeFile = (f: SourceFile) => INTAKE_FILES.includes(f.path);
/** Every GPS source that is NOT part of the reviewed intake surface. */
const GPS_NON_INTAKE = GPS_SOURCES.filter((f) => !isIntakeFile(f));

const sourceAt = (path: string): SourceFile => {
  const found = GPS_SOURCES.find((f) => f.path === path);
  expect(found, `${path} is not in the discovered GPS sources — the intake surface has moved or gone`).toBeTruthy();
  return found!;
};

/**
 * THE FIVE PATHS, verbatim. Not a shape, not a prefix — the literal set, so a sixth
 * path added to the intake router is as much a failure as one added elsewhere. The
 * upload path appears once even though POST and GET share it; the set is compared as
 * a set for that reason.
 */
const INTAKE_PATHS: readonly string[] = [
  '/artifacts/:id',
  '/artifacts/:id/content',
  '/artifacts/:id/download-url',
  '/engagements/:id/artifacts',
];

/**
 * Every migration that touches a gps_ table, whether or not its NAME says gps —
 * because the dangerous future file is `0061_delivery_attachments.sql`, which an
 * `endsWith('_gps.sql')` filter would never open.
 */
const GPS_MIGRATIONS = load(
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join(MIGRATIONS, f))
    .filter((p) => /\bgps_[a-z_]+/.test(readFileSync(p, 'utf8')))
    .sort(),
  stripSql,
);

/**
 * MENTIONING A GPS TABLE AND TOUCHING ONE ARE DIFFERENT THINGS, and the set above
 * cannot tell them apart — deliberately. It matches the raw text, comments included,
 * because a byte channel that arrives as `COPY gps_artifact FROM ...` must be found
 * whatever else the file does, and a file too clever to be classified should still be
 * scanned.
 *
 * That breadth is wrong for exactly two of the checks below. 0070_audit_seal.sql
 * creates and alters nothing in GPS; its single `gps_` mention is line 247, inside a
 * block comment enumerating which call sites audit inside a transaction:
 *
 *     · gps/service.ts:768          BEGIN → gps_engagement FOR UPDATE → audit.   OK
 *
 * That comment is a lock-order safety argument. It pulled the file into the GPS
 * ratchet's scope, where the frozen-jsonb-set check and the D2 naming rule then
 * asked it questions about GPS tables it does not have — and the D2 rule's own
 * failure message already said "adds or alters a gps_ table", so its intent and its
 * input set had silently diverged.
 *
 * Two claims, two sets. Byte-channel scans keep the broad set. Claims of the form
 * "every migration that adds or alters a gps_ table" get this one, which reads the
 * stripped SQL and requires an actual statement naming a gps_ table. String literals
 * survive `stripSql`, so `EXECUTE 'CREATE TABLE gps_x ...'` still classifies here.
 */
const GPS_DDL = new RegExp(
  '(?:CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?|ALTER\\s+TABLE(?:\\s+IF\\s+EXISTS)?' +
    '|DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?|TRUNCATE(?:\\s+TABLE)?|COPY|INSERT\\s+INTO' +
    '|CREATE\\s+TRIGGER[\\s\\S]{0,200}?\\bON|CREATE(?:\\s+UNIQUE)?\\s+INDEX[\\s\\S]{0,200}?\\bON)' +
    '\\s+(?:ONLY\\s+)?(?:public\\.)?gps_[a-z0-9_]*',
  'i',
);
const GPS_SCHEMA_MIGRATIONS = GPS_MIGRATIONS.filter((f) => GPS_DDL.test(f.code));

describe('the surface this ratchet covers is discovered, not listed', () => {
  /**
   * If discovery silently returns nothing, every absence assertion below passes
   * vacuously and the lock is off while CI stays green. That is the classic way a
   * source-level ratchet dies, so the discovery is asserted first, by name, and
   * with a floor.
   */
  it('finds the GPS API sources, including the ones added after this test', () => {
    const paths = GPS_API_SOURCES.map((f) => f.path);
    expect(paths, 'GPS API source discovery returned nothing — every absence check below would pass vacuously').not.toHaveLength(0);
    expect(paths).toContain('apps/api/src/routes/gps.ts');
    expect(paths).toContain('apps/api/src/gps/service.ts');
    expect(paths).toContain('apps/api/src/gps/actions.ts');
  });

  it('finds the shared GPS domain', () => {
    const paths = GPS_SHARED_SOURCES.map((f) => f.path);
    expect(paths).toContain('packages/shared/src/gps/types.ts');
    expect(paths).toContain('packages/shared/src/gps/catalogue.ts');
  });

  it('finds every migration that touches a gps_ table', () => {
    const paths = GPS_MIGRATIONS.map((f) => f.path);
    // 0047 is the Phase 1 spine; 0049 adds delivery. Found by CONTENT, so a
    // differently-named future migration that adds a gps_ column is also covered.
    expect(paths).toContain('apps/api/src/db/migrations/0047_gps.sql');
    // The two the intake surface needs. Named, because every assertion about where
    // bytes may live is read off them and a missing file would make those vacuous.
    expect(paths).toContain('apps/api/src/db/migrations/0057_gps_artifact.sql');
    expect(paths).toContain('apps/api/src/db/migrations/0058_gps_artifact_custody.sql');
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * The narrower set gets the same floor as the broad one, for the same reason. The
   * checks that read it — the frozen jsonb set and the D2 naming rule — are both
   * "every migration that adds or alters a gps_ table must …", and if this filter ever
   * returned nothing, both would pass while asserting nothing at all. A filter is a
   * more inviting place for that failure than a directory read: it is one wrong
   * character in a regex away, and it fails silently GREEN.
   */
  it('finds every migration that adds or alters a gps_ table, and is never empty', () => {
    const paths = GPS_SCHEMA_MIGRATIONS.map((f) => f.path);
    expect(
      paths,
      'GPS schema-migration discovery returned nothing — the frozen jsonb set and the D2 ' +
        'naming rule would both pass vacuously.',
    ).not.toHaveLength(0);
    expect(paths).toContain('apps/api/src/db/migrations/0047_gps.sql');
    expect(paths).toContain('apps/api/src/db/migrations/0057_gps_artifact.sql');
    expect(paths).toContain('apps/api/src/db/migrations/0058_gps_artifact_custody.sql');
    // The distinction this set exists to make, pinned by the file that forced it.
    // 0070 mentions a gps_ table in a block comment and touches none, so it belongs to
    // the broad set and not to this one. If a future edit gives 0070 real GPS DDL, this
    // fails and the D2 question gets asked of it — which is the correct outcome.
    expect(GPS_MIGRATIONS.map((f) => f.path)).toContain('apps/api/src/db/migrations/0070_audit_seal.sql');
    expect(
      paths,
      '0070_audit_seal.sql now appears to add or alter a gps_ table. Either that is real — ' +
        'in which case it must name D2 and its columns join the frozen set — or the ' +
        'classifier has started matching prose.',
    ).not.toContain('apps/api/src/db/migrations/0070_audit_seal.sql');
  });

  /**
   * THE BLIND SPOT `columnsOf` DELIBERATELY CREATES, ASSERTED SHUT.
   *
   * `columnsOf` excises PL/pgSQL routines before looking for columns, because a
   * routine's parameters and locals have a column's exact shape and are not columns.
   * The cost is that anything inside a routine is invisible to every column check in
   * this file — so a table created by dynamic DDL in a trigger function would carry no
   * column ratchet at all:
   *
   *     EXECUTE 'CREATE TABLE gps_side (doc bytea)';
   *
   * Nothing in GPS needs to build a GPS table from inside a routine, so the honest
   * position is to forbid it outright rather than to parse it.
   */
  it('no routine body builds or fills a gps_ table, which is what makes the excision safe', () => {
    for (const file of GPS_MIGRATIONS) {
      for (const body of routineBodies(file.code)) {
        expect(
          GPS_DDL.test(body),
          `${file.path} has a routine whose body contains DDL against a gps_ table. ` +
            'columnsOf() does not read routine bodies, so a table declared there would ' +
            'carry none of the byte-column checks in this file. Declare GPS tables at the ' +
            'top level of a migration where they can be read.',
        ).toBe(false);
      }
    }
  });

  /**
   * The positive half of the conversion, asserted before anything that permits
   * something. If the intake files are gone, every "only these two files may …"
   * assertion below passes for free — the same vacuity failure the discovery check
   * above exists to catch, in the other direction.
   */
  it('finds the intake surface itself, in exactly the two files that own it', () => {
    const paths = GPS_API_SOURCES.map((f) => f.path);
    for (const file of INTAKE_FILES) {
      expect(
        paths,
        `${file} is missing. Decision D2 was answered YES on 2026-08-02 and this file `
          + 'is the surface that answer produced. If it has been deleted, this ratchet has '
          + 'nothing to constrain and every permission below is vacuous — revert to the '
          + 'lockout rather than leaving a half state.',
      ).toContain(file);
    }
    expect(GPS_NON_INTAKE.length, 'the non-intake GPS surface is empty — discovery is broken').toBeGreaterThanOrEqual(10);
  });
});

/**
 * ══ DOORS THAT STAY SHUT IN EVERY GPS FILE, THE INTAKE INCLUDED. ══════════════
 *
 * These are not leftovers from the lockout. Each one is a mechanism the reviewed
 * intake surface deliberately does NOT use, and the reason it does not is the reason
 * it must never appear: the whole argument for `routes/gpsArtifact.ts` being an
 * acceptable place to receive a client's confidential document is that it does so
 * with a raw body, no parser, no disk, no outbound call and no third-party SDK.
 *
 *   multipart      Hono has no built-in multipart parser, so accepting form-data
 *                  means ADDING one — a complex, historically CVE-rich parser placed
 *                  in front of the most sensitive bytes in this repo, in exchange for
 *                  envelope syntax nothing needs. One file, its bytes as the body.
 *   parseBody etc  the alternative body readers. `readBoundedBody` exists because
 *                  every one of them buffers the whole body before anyone can refuse
 *                  it, which makes the 25 MiB ceiling unenforceable.
 *   filesystem     a client's document never touches a disk this process can write.
 *                  A temp file survives the request, misses the retention clock
 *                  entirely, and appears in no audit row.
 *   object storage the API has no Supabase service credential and does not reach the
 *                  bucket (0058's header). An SDK call here would either be dead code
 *                  or a credential arriving by some path nobody reviewed.
 *   outbound fetch nothing in GPS dereferences anything, ever. `external_location` is
 *                  a note about where a document lives in the CLIENT's systems, and
 *                  the moment the server follows it LCX is retrieving third-party
 *                  material through a path with no ceiling, no allowlist and no audit
 *                  row. D2 being answered did not authorise that; it authorised an
 *                  upload a human performs.
 *   upload mw      multer/busboy/formidable — see multipart.
 *   content field  a body field that carries the document instead of the body doing
 *                  it. That shape bypasses `readBoundedBody` and lands in a jsonb
 *                  column or a text column with neither a digest nor a retention date.
 */
const DOORS_CLOSED_EVERYWHERE: ReadonlyArray<{ what: string; pattern: RegExp }> = [
  { what: 'multipart / form-data parsing', pattern: /multipart|form-?data/i },
  { what: 'a Hono body reader other than JSON or the bounded raw stream', pattern: /\.(parseBody|arrayBuffer|blob|formData)\s*\(/ },
  { what: 'filesystem access', pattern: /node:fs|from\s+'fs'|readFileSync|writeFile|createWriteStream|createReadStream|\bmkdtemp/ },
  { what: 'object storage', pattern: /presign|getSignedUrl|createBucket|PutObject|\.bucket\b|storage\s*\.\s*from\s*\(/i },
  { what: 'an outbound fetch (nothing in GPS dereferences anything)', pattern: /\bfetch\s*\(|\baxios\b|\bundici\b|node:https?\b/ },
  { what: 'a file-upload middleware', pattern: /\bmulter\b|\bbusboy\b|\bformidable\b/i },
  // A REQUEST field carrying the document. Closed in the intake files too: the upload
  // is the raw body, and a JSON field holding a file would bypass `readBoundedBody`
  // and land in a column with neither a digest nor a retention date.
  { what: 'a request field that would carry client material', pattern: /\b(?:body|params)\s*\.\s*(?:document|file|attachment|upload|content|payload|bytes|draft|deck|whitepaper)\b/i },
];

/**
 * ══ DOORS PERMITTED ONLY IN THE TWO INTAKE FILES. ═════════════════════════════
 * The intake surface has to touch bytes — that is what it is for. Everywhere else in
 * the compartment these are still the exact patterns that mean "a document is being
 * handled here", and the compartment has exactly one place for that.
 */
const DOORS_ONLY_IN_INTAKE: ReadonlyArray<{ what: string; pattern: RegExp }> = [
  { what: 'raw request stream access', pattern: /\breq\.raw\.body\b|getReader\s*\(|pipeTo\s*\(|pipeline\s*\(/ },
  { what: 'binary buffers', pattern: /\bBuffer\b|\bBlob\b|ArrayBuffer|Uint8Array|\bDataView\b/ },
  { what: 'base64 encoding or decoding', pattern: /base64|\batob\b|\bbtoa\b/i },
  // An internal parameter carrying document content. `storeArtifact({ bytes })` is
  // what the engine is; the same shape in any other GPS file is a document being
  // passed around outside the one path that bounds, verifies, digests and records it.
  { what: 'an internal field carrying document content', pattern: /\binput\s*\.\s*(?:document|file|attachment|upload|payload|bytes|draft|deck|whitepaper)\b/i },
];

describe('one intake surface, and the rest of GPS still cannot receive bytes', () => {
  /**
   * Run over the DISCOVERED set, one assertion per file per door, so the message
   * says which file and which door. Sixty cheap regexes beat one clever one that
   * nobody can read when it fires.
   */
  it('opens none of the doors the intake deliberately does not use, in ANY GPS file', () => {
    expect(GPS_SOURCES.length).toBeGreaterThanOrEqual(4);
    for (const file of GPS_SOURCES) {
      for (const door of DOORS_CLOSED_EVERYWHERE) {
        expect(
          file.code,
          `${file.path} appears to add ${door.what}.\n`
            + 'GPS receives client documents at ONE surface (routes/gpsArtifact.ts), and it '
            + 'does so with a raw body, no parser, no disk, no outbound call and no storage '
            + 'SDK — which is the entire argument for that surface being acceptable. This '
            + 'mechanism is not on the reviewed path even inside the intake files. Read the '
            + 'docblock at the top of this file before changing anything here.',
        ).not.toMatch(door.pattern);
      }
    }
  });

  it('lets no OTHER GPS file touch bytes at all', () => {
    expect(GPS_NON_INTAKE.length).toBeGreaterThanOrEqual(10);
    for (const file of GPS_NON_INTAKE) {
      for (const door of DOORS_ONLY_IN_INTAKE) {
        expect(
          file.code,
          `${file.path} appears to add ${door.what}, and it is not part of the intake `
            + `surface (${INTAKE_FILES.join(', ')}).\n`
            + 'Client documents enter GPS in one place, with a size ceiling enforced on the '
            + 'stream, a verified MIME allowlist, a server-computed digest, a derived '
            + 'storage key, a retention date and an audit row on every read. A second place '
            + 'that handles bytes has none of that by default, and "we already store client '
            + 'files" is not an argument for a second door — it is the reason there is only '
            + 'one. If this file genuinely needs to move bytes, that is a review: add it to '
            + 'INTAKE_FILES deliberately and say in the commit which of those controls it '
            + 'carries.',
        ).not.toMatch(door.pattern);
      }
    }
  });

  it('reads request bodies as JSON, or as the one bounded raw stream, and by no other means', () => {
    /**
     * `c.req.json` cannot return a file, so JSON is unrestricted. `c.req.raw` is the
     * upload's stream and is confined to the intake router, where `readBoundedBody`
     * is the only thing that consumes it — which is what makes the ceiling
     * enforceable rather than advisory.
     */
    const allowed = new Set(['c.req.json', 'c.req.param', 'c.req.query', 'c.req.header', 'c.req.path', 'c.req.method']);
    const readers = GPS_ROUTE_FILES.flatMap((f) =>
      (f.code.match(/c\.req\.[a-zA-Z]+/g) ?? []).map((reader) => ({ file: f, reader })),
    );
    expect(readers, 'no GPS route reads a request at all — discovery is probably broken').not.toHaveLength(0);
    for (const { file, reader } of readers) {
      if (reader === 'c.req.raw' && isIntakeFile(file)) continue;
      expect(
        allowed.has(reader),
        `${file.path} uses ${reader}. Only json/param/query/header may be read outside the `
          + 'intake router, and inside it the only extra accessor is `c.req.raw` — whose body '
          + 'must reach `readBoundedBody` and nothing else. Every other accessor buffers a '
          + 'whole request before anyone can refuse it.',
      ).toBe(true);
    }
    // The raw stream, wherever it is read, is handed to the bounded reader in the
    // same expression. A `const body = c.req.raw.body` that travels elsewhere first
    // is how the ceiling stops applying.
    const routes = sourceAt(INTAKE_ROUTES);
    for (const m of routes.code.matchAll(/c\.req\.raw\.body/g)) {
      const window = routes.code.slice(Math.max(0, (m.index ?? 0) - 120), (m.index ?? 0) + 40);
      expect(
        window,
        'the raw request body is read somewhere other than a readBoundedBody call. The '
          + 'ceiling is enforced BY that reader; a body that reaches anything else first is '
          + 'an unbounded upload.',
      ).toMatch(/readBoundedBody\s*\(/);
    }
  });

  it('declares intake route paths in exactly one GPS route file', () => {
    /**
     * Extracted rather than grepped: the assertion is about the PATHS mounted under
     * /v1/gps, and a path is the honest surface a client-side upload needs. The
     * extraction is asserted non-empty first — an extractor that matches nothing is a
     * test that proves nothing.
     *
     * Deliberately NOT including "import" or "ingest": a route that ingests a text
     * payload is not an artifact intake, and a false positive here trains the next
     * engineer to edit the pattern, which is how a ratchet stops ratcheting.
     */
    const forbidden = /upload|attach|\bfiles?\b|document|blob|artifact|media|\basset/i;
    const declared = GPS_ROUTE_FILES.flatMap((f) =>
      [...f.code.matchAll(/\.\s*(?:get|post|put|patch|delete|all|on)\s*\(\s*'([^']*)'/g)]
        .map((m) => ({ file: f.path, path: m[1]! }))
        // A route path starts with '/'. Without this the same regex also collects
        // `c.get('operator')`, which would make the exact-set comparison below depend
        // on how many context keys a handler happens to read.
        .filter((d) => d.path.startsWith('/')),
    );
    expect(declared.length, 'no route paths extracted — the regex no longer matches how routes are declared here').toBeGreaterThanOrEqual(10);

    for (const { file, path } of declared) {
      if (file === INTAKE_ROUTES) continue;
      expect(
        path,
        `${file} declares route path '${path}', which names a document-shaped resource. `
          + `There is ONE intake surface in this compartment and it is ${INTAKE_ROUTES}. `
          + 'A second one is not a smaller version of the same feature: it is a path with '
          + 'its own idea of the ceiling, the allowlist, the digest, the retention date and '
          + 'the audit row, and the first four of those being wrong is invisible until a '
          + 'client asks what happened to their file.',
      ).not.toMatch(forbidden);
    }

    // And the intake router declares EXACTLY the five reviewed paths — a sixth is as
    // much a change to the surface as a path in another file.
    const intakePaths = [...new Set(declared.filter((d) => d.file === INTAKE_ROUTES).map((d) => d.path))].sort();
    expect(
      intakePaths,
      `${INTAKE_ROUTES} no longer declares exactly the reviewed path set. Every path here `
        + 'receives, lists, links to or removes a client document; adding one is a change to '
        + 'what the compartment does with third-party confidential material and belongs in a '
        + 'commit that says so.',
    ).toEqual([...INTAKE_PATHS]);
  });

  it('mounts nothing under /v1/gps except the reviewed GPS router', () => {
    /**
     * The gap the per-file checks leave: an upload route in a file whose path never
     * says "gps" (routes/uploads.ts), mounted under the GPS prefix in app.ts. The
     * prefix is the thing clients see, so the prefix is what gets fenced.
     * app.ts:165 is the single registration today.
     */
    const app = stripTs(readFileSync(resolve(API_SRC, 'app.ts'), 'utf8'));
    const mounts = [...app.matchAll(/\.route\s*\(\s*'\/v1\/gps[^']*'\s*,\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(mounts, 'app.ts no longer mounts /v1/gps in a shape this test can see').not.toHaveLength(0);
    for (const router of mounts) {
      expect(
        router,
        `app.ts mounts '${router}' under /v1/gps. Anything served there is inside the ` +
          'GPS compartment and must be inside this ratchet — which discovers files by ' +
          'path, so a router from a file not named gps* escapes it.',
      ).toBe('gpsRoutes');
    }
  });

  /**
   * THE FENCE MOVED AND THE ASSERTION DID NOT.
   *
   * The check above reads `app.ts` only, and app.ts holds ONE `/v1/gps` registration.
   * Phases 6–12 moved composition INTO `routes/gps.ts`, which now does
   * `gpsRoutes.route('/', gpsBookRoutes)` six times — and says in prose that it was done
   * that way BECAUSE six `app.route('/v1/gps/book', …)` lines "would each have turned it
   * red". So the six routers that actually serve most of the compartment are invisible to
   * the fence above; verified, its regex over app.ts yields exactly `['gpsRoutes']`.
   *
   * A future `gpsRoutes.route('/', attachmentRoutes)` from `routes/attachments.ts` would
   * defeat four mechanisms at once: the file is not discovered
   * (`'routes/attachments.ts'.includes('gps') === false`), so the byte doors never scan
   * it; its `'/engagements/:id/files'` path is never extracted; and the app.ts fence
   * never sees the mount.
   *
   * So fence the ROUTER SYMBOL, not the file: extract every inner `.route('…', Sym)`
   * from the GPS route files, resolve `Sym` to the import specifier it came from, and
   * require that specifier to contain `gps` — which is exactly the condition that puts
   * the file inside this ratchet's discovery.
   */
  it('mounts nothing INSIDE the GPS router that this ratchet does not discover', () => {
    const mounted: Array<{ file: string; symbol: string; spec: string | null }> = [];
    for (const file of GPS_ROUTE_FILES) {
      // `import { a, b as c } from '…'` → symbol → specifier.
      const bySymbol = new Map<string, string>();
      for (const im of file.code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
        for (const part of im[1]!.split(',')) {
          const name = part.trim().split(/\s+as\s+/).pop()?.trim();
          if (name) bySymbol.set(name, im[2]!);
        }
      }
      for (const m of file.code.matchAll(/\.route\s*\(\s*'[^']*'\s*,\s*([A-Za-z0-9_$]+)\s*\)/g)) {
        mounted.push({ file: file.path, symbol: m[1]!, spec: bySymbol.get(m[1]!) ?? null });
      }
    }

    // Non-vacuity: the six Phase 6–12 sub-routers are composed this way today, so an
    // empty list means the extraction broke, not that the property holds.
    expect(
      mounted.length,
      'no inner .route(…) mounts found in any GPS route file — this ratchet has gone '
        + 'vacuous; routes/gps.ts composes six sub-routers',
    ).toBeGreaterThanOrEqual(6);

    for (const { file, symbol, spec } of mounted) {
      expect(
        spec,
        `${file} mounts '${symbol}' but this test cannot find where it was imported from. `
          + 'A router whose origin cannot be established cannot be fenced.',
      ).not.toBeNull();
      expect(
        (spec ?? '').toLowerCase().includes('gps'),
        `${file} mounts '${symbol}' from '${spec}' INSIDE the GPS router. Everything served `
          + 'under /v1/gps must be in a file this ratchet discovers, and discovery is by '
          + "path substring 'gps' — so a router from a file not named gps* is served inside "
          + 'the compartment with none of the byte doors, path checks or column checks '
          + 'above ever having looked at it.',
      ).toBe(true);
    }
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE CONTROLS THAT MAKE THAT ONE SURFACE ACCEPTABLE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  The block above says WHERE bytes may be handled. This block says the reviewed
 *  surface still has the things that made it reviewable. Every one of these can be
 *  removed by a one-line edit that breaks no other test, ships green, and is
 *  invisible until a 400 MB file, a renamed executable or an unlogged download turns
 *  up — which is exactly the profile of a control worth ratcheting.
 *
 *  These are PRESENCE assertions, read off code with comments stripped, so a
 *  paragraph explaining a control can never stand in for the control.
 */
describe('the intake surface still carries every control it was reviewed with', () => {
  const engine = () => sourceAt(INTAKE_ENGINE);

  it('keeps a MIME allowlist, and the allowlist is not empty', () => {
    const code = engine().code;
    const list = /ARTIFACT_MIME_ALLOWLIST[^=]*=\s*\[([\s\S]*?)\n\]/.exec(code);
    expect(
      list,
      'ARTIFACT_MIME_ALLOWLIST is no longer an array literal in gps/artifact.ts. It is the '
        + 'only thing deciding what a client may put on LCX infrastructure; an allowlist '
        + 'assembled at runtime cannot be reviewed by reading the file.',
    ).toBeTruthy();
    const mimes = [...list![1]!.matchAll(/mime:\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(
      mimes.length,
      'the MIME allowlist is empty, so `verifyDeclaredMime` refuses everything or accepts '
        + 'everything depending on which way the loop reads — either way the list has stopped '
        + 'being the control.',
    ).toBeGreaterThanOrEqual(3);
    // An allow-list that admits a container admits everything inside it. Archives and
    // macro-enabled office formats would make the list decorative — the same
    // reasoning 0057 applies to the bucket's own allowed_mime_types.
    for (const mime of mimes) {
      expect(
        mime,
        `the allowlist admits '${mime}'. An archive is a container that can hold anything and a `
          + 'macro-enabled document is a program; either one makes every other entry on this '
          + 'list decorative.',
      ).not.toMatch(/zip|x-rar|7z|gzip|tar|macroenabled|msdownload|octet-stream|x-executable/i);
    }
  });

  it('verifies the leading bytes against the declared type, so a renamed file is refused', () => {
    const code = engine().code;
    // The %PDF- signature, spelled in bytes. Its presence is the difference between
    // trusting Content-Type and checking it.
    expect(
      code,
      'gps/artifact.ts no longer carries leading-byte signatures. Without them the declared '
        + 'Content-Type is the only thing consulted, and a 50 MB executable renamed .pdf is '
        + 'accepted, stored, and handed to whoever downloads it next.',
    ).toMatch(/0x25,\s*0x50,\s*0x44,\s*0x46/);
    expect(code, 'verifyDeclaredMime no longer compares the body against a signature').toMatch(
      /magic\.some\s*\(\s*\(?\s*sig\s*\)?\s*=>\s*startsWith\s*\(/,
    );
    // The textual types have no signature of their own, so the test for them is the
    // opposite one — and without it `text/plain` is an unverified door for any bytes.
    expect(
      code,
      'the textual MIME types are no longer checked against binary signatures. `Content-Type: '
        + 'text/plain` would then accept an ELF binary, a zip or a PDF unexamined.',
    ).toMatch(/BINARY_SIGNATURES\.some\s*\(/);
    expect(code, 'a mime_mismatch refusal no longer exists — the check has become advisory').toMatch(/'mime_mismatch'/);
  });

  it('keeps a real size ceiling, refuses instead of truncating, and never trusts Content-Length', () => {
    const code = engine().code;
    // A product of decimal literals — `25 * 1024 * 1024` — multiplied out here rather
    // than evaluated, so this test never runs a string out of the tree it is auditing.
    const ceiling = /ARTIFACT_MAX_BYTES\s*=\s*([0-9_]+(?:\s*\*\s*[0-9_]+)*)\s*;/.exec(code);
    expect(ceiling, 'ARTIFACT_MAX_BYTES is no longer a product of plain numbers — the ceiling cannot be read off the file').toBeTruthy();
    const bytes = ceiling![1]!.split('*').reduce((n, part) => n * Number(part.trim().replace(/_/g, '')), 1);
    expect(Number.isFinite(bytes)).toBe(true);
    expect(
      bytes,
      `the size ceiling is ${bytes} bytes, which is not a ceiling. It bounds how much of a `
        + 'client\'s upload this process buffers in memory before it can refuse, and it is one '
        + 'of the two numbers `gps_artifact.byte_size` and the bucket\'s file_size_limit are '
        + 'set to agree with.',
    ).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(bytes).toBeGreaterThan(0);

    // Enforced while READING, and the read keeps nothing when it trips. A truncated
    // regulatory filing that looks stored is worse than a refused upload.
    expect(code, 'readBoundedBody no longer compares a running total against the ceiling').toMatch(/total\s*>\s*maxBytes/);
    expect(code, 'readBoundedBody no longer refuses with too_large').toMatch(/refuse\(\s*'too_large'/);
    expect(
      code,
      'readBoundedBody no longer discards what it has read when the ceiling trips, or no longer '
        + 'cancels the stream. Both matter: the first is the difference between a refusal and a '
        + 'silently truncated document, the second is what stops a caller making this process '
        + 'buffer more than the ceiling.',
    ).toMatch(/chunks\.length\s*=\s*0[\s\S]{0,200}reader\.cancel\s*\(/);
    // Content-Length is a client-supplied claim. A pre-check on it lets a lying-low
    // header through and refuses a legitimate upload on a lying-high one.
    expect(
      code,
      'gps/artifact.ts now reads content-length. The ceiling must be enforced on the bytes that '
        + 'actually arrive; a header the caller writes is not evidence about the body.',
    ).not.toMatch(/content-length|contentLength/i);
  });

  it('refuses an unsafe filename and never sanitises one', () => {
    const code = engine().code;
    for (const [what, pattern] of [
      ['a path separator', /includes\('\/'\)/],
      ['a traversal', /includes\('\.\.'\)/],
      ['control bytes', /cp\s*<\s*0x20/],
      ['a refusal rather than a repair', /refuse\('filename_unsafe'/],
    ] as const) {
      expect(code, `safeFilename no longer refuses ${what}`).toMatch(pattern);
    }
    // Sanitising turns `../../etc/passwd` into a stored file called `etcpasswd`, which
    // hides the attempt; a refusal puts it in the response and in the log.
    expect(
      code,
      'gps/artifact.ts appears to strip or replace characters in a filename. A sanitised '
        + 'filename is an attempt nobody sees. Refuse it.',
    ).not.toMatch(/filename[\s\S]{0,80}\.replace\s*\(/i);
  });

  it('derives the storage key from ids and never from anything the caller sent', () => {
    const code = engine().code;
    // `\n}\n` — the closing brace of the FUNCTION, at column 0 and followed by a blank
    // line. `\n}` alone stops at the destructured parameter type's own `}): string {`.
    const fn = /export function deriveStorageKey\(([\s\S]*?)\n}\n/.exec(code);
    expect(fn, 'deriveStorageKey is gone or is no longer a top-level function').toBeTruthy();
    const body = fn![1]!;
    expect(
      body,
      'deriveStorageKey no longer requires its inputs to be uuids. The key is the only thing '
        + 'standing between one client\'s object and another\'s, and 0057 CHECKs that it '
        + 'contains the row\'s client_id.',
    ).toMatch(/isUuid\s*\(/);
    expect(
      body,
      'deriveStorageKey now accepts an extension it did not verify. The extension is the one '
        + 'part of the key that comes from the request, and it may only come from the MIME '
        + 'allowlist entry that the leading bytes already agreed with.',
    ).toMatch(/\^\\\.\[a-z0-9\]/);
    expect(
      body,
      'deriveStorageKey mentions a filename. A client-supplied name in a storage key is a '
        + 'traversal or a collision waiting for the first person who tries.',
    ).not.toMatch(/filename/i);
  });

  it('writes an audit row on every download, before the bytes, and fails closed if it cannot', () => {
    const code = engine().code;
    const redeem = /export async function redeemDownloadGrant\(([\s\S]*?)\n}\n/.exec(code);
    expect(redeem, 'redeemDownloadGrant is gone or is no longer a top-level function').toBeTruthy();
    const body = redeem![1]!;
    const audit = body.indexOf('recordArtifactAudit');
    expect(
      audit,
      'redeemDownloadGrant no longer records the download. A read of a client\'s confidential '
        + 'document with no record of who read it is the single failure this compartment exists '
        + 'to prevent, and it is the one that cannot be reconstructed afterwards.',
    ).toBeGreaterThan(-1);
    expect(
      body.indexOf('return { ok: true'),
      'the audit row is written AFTER the success is returned. The order is the control: audit, '
        + 'then bytes.',
    ).toBeGreaterThan(audit);
    expect(body, 'the download audit no longer names the download action').toMatch(/'gps\.artifact\.download'/);

    // And the recorder must still throw. `middleware/purpose.ts` swallows its audit
    // error because its job is the prompt; here the log IS the job.
    const recorder = /export async function recordArtifactAudit\(([\s\S]*?)\n}\n/.exec(code);
    expect(recorder, 'recordArtifactAudit is gone').toBeTruthy();
    expect(
      recorder![1]!,
      'recordArtifactAudit now catches its own failure. A swallowed audit error means bytes are '
        + 'served with no trace and nothing anywhere reports it — strictly worse than the 500 '
        + 'the caller would otherwise return.',
    ).not.toMatch(/catch\s*[({]/);
  });

  it('lets the bytes reach exactly one table, and no read path can drag them anywhere else', () => {
    const code = engine().code;
    expect(code, 'the blob table is no longer written by name').toMatch(new RegExp(`INSERT INTO ${BLOB_TABLE}`));

    /**
     * Traced from the BYTES, not from the statements. For every place a byte value is
     * produced — a `::bytea` cast, a `Buffer.from(…)` handed to a parameter list — the
     * nearest table named above it is the table it lands in. Asking "does this statement
     * mention bytes" would pass a CTE whose first branch writes the metadata table,
     * which is exactly the shape `storeArtifact` has.
     */
    const destinations = [...code.matchAll(/::bytea|Buffer\.from\s*\(/g)].map((m) => {
      const before = code.slice(0, m.index ?? 0);
      const owner = [...before.matchAll(/INSERT INTO (\w+)|UPDATE (\w+)/g)].pop();
      return { at: m[0], table: owner?.[1] ?? owner?.[2] ?? '(no statement)' };
    });
    expect(
      destinations.map((d) => d.table),
      'no byte value is written anywhere in gps/artifact.ts — either custody has moved out of '
        + 'this module (a review, not a refactor) or this extraction has gone blind.',
    ).toContain(BLOB_TABLE);
    for (const { at, table } of destinations) {
      expect(
        table,
        `a byte value (${at}) is written into ${table}. Bytes live in ${BLOB_TABLE} and nowhere `
          + 'else — that separation is why a mis-scoped SELECT * on the metadata table every '
          + 'screen reads cannot return a client\'s document, and why one line in a dump script '
          + 'excludes every confidential file in the system.',
      ).toBe(BLOB_TABLE);
    }
    // And the read side: the only place bytes are selected FROM is the blob table.
    for (const m of code.matchAll(/\bbytes\s+FROM\s+(\w+)/g)) {
      expect(m[1], `bytes are selected from ${m[1]} — there is one byte column and it is on ${BLOB_TABLE}`).toBe(BLOB_TABLE);
    }

    const cols = /const ARTIFACT_COLS = `([\s\S]*?)`/.exec(code);
    expect(cols, 'ARTIFACT_COLS is no longer a backtick column list — this extraction has gone blind').toBeTruthy();
    expect(
      cols![1]!,
      'the shared metadata column list now names a byte column, so every list, lookup and audit '
        + 'read in this module returns client document content.',
    ).not.toMatch(/bytes|blob|content/i);
    // The audit row is metadata about the file, never the file.
    const recorder = /export async function recordArtifactAudit\(([\s\S]*?)\n}/.exec(code)![1]!;
    expect(
      recorder,
      'the audit row now carries bytes. An audit_log row is read by every operator, exported, '
        + 'and kept far longer than the retention clock on the document itself.',
    ).not.toMatch(/\bbytes\b|Buffer/);
  });

  it('keeps the removal soft, so a settled document is still a record that we held it', () => {
    const code = engine().code;
    expect(code, 'softDeleteArtifact no longer sets deleted_at').toMatch(/SET deleted_at = now\(\)/);
    expect(
      code,
      'gps/artifact.ts now issues a DELETE. A hard delete destroys the only record that the desk '
        + 'ever held the material, which is the fact a regulator asks about — and it makes '
        + 'purged_at unwritable, so no erasure can ever be evidenced.',
    ).not.toMatch(/DELETE\s+FROM/i);
    // Outstanding grants are burned in the same statement, or a link minted a moment
    // earlier keeps serving a document the desk believes it stopped holding.
    expect(code, 'a soft delete no longer burns outstanding download grants').toMatch(
      /UPDATE gps_artifact_grant SET used_at = now\(\)/,
    );
  });
});

/**
 * Storage and upload SDKs, by package name. A dependency is the cheapest possible
 * early warning: nobody adds `@aws-sdk/client-s3` to an API that stores nothing.
 */
const STORAGE_PACKAGES: readonly RegExp[] = [
  /^aws-sdk$/, /^@aws-sdk\//, /^@google-cloud\/storage$/, /^@azure\/storage-/,
  /^@supabase\//, /^minio$/, /^multer$/, /^busboy$/, /^formidable$/,
  /^@aws-sdk\/s3-request-presigner$/, /^s3$/, /^s3-upload-stream$/,
  /^@uppy\//, /^tus-node-server$/, /^cloudinary$/, /^@vercel\/blob$/,
];

/**
 * File-capable code that ALREADY EXISTS in apps/api and is out of scope for this
 * lock. Named here rather than pattern-matched away, because a test that pretended
 * these did not exist would be making a false claim about the repo.
 *
 *   xlsx     apps/api/src/import/csv.ts:71 — `XLSX.read(buf, { type: 'buffer' })`,
 *            over a path read from disk by the seed CLI (apps/api/src/seed/index.ts).
 *            No HTTP route reaches it.
 *   imapflow apps/api/src/marketing/xMail.ts:1 — an IMAP client for the marketing
 *            compartment's reply ingest. A mailbox IS a place attachments arrive;
 *            that risk lives with 0046 and its own review, not with GPS.
 *
 * The checkable GPS claim is the one below: no GPS file imports either of them.
 */
const PREEXISTING_FILE_CAPABLE = ['xlsx', 'imapflow'] as const;

describe('no storage or file-parsing capability reaches GPS', () => {
  it('apps/api declares no storage or upload SDK', () => {
    const pkg = JSON.parse(readFileSync(API_PKG, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(declared, 'apps/api/package.json parsed to no dependencies at all').not.toHaveLength(0);
    for (const name of declared) {
      const hit = STORAGE_PACKAGES.find((p) => p.test(name));
      expect(
        hit,
        `apps/api/package.json now depends on '${name}', which exists to move bytes ` +
          'into or out of a bucket. Nothing in this API stores a file, and GPS in ' +
          'particular may not (D2 unanswered). If this dependency is genuinely for ' +
          'something else, say what in the docblock above and add it to the exception ' +
          'list DELIBERATELY — do not widen the pattern.',
      ).toBeUndefined();
    }
  });

  it('no GPS file imports the file-capable code that does exist elsewhere', () => {
    // The precise claim. `xlsx` and `imapflow` are real and stay; what must remain
    // true is that the GPS compartment cannot reach a parser or a mailbox.
    for (const file of GPS_SOURCES) {
      const imports = [...file.code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(
          PREEXISTING_FILE_CAPABLE.some((p) => spec === p),
          `${file.path} imports '${spec}'. That module can parse or receive a file; ` +
            'GPS holds a typed reference to client material and never the material.',
        ).toBe(false);
        expect(
          STORAGE_PACKAGES.some((p) => p.test(spec)),
          `${file.path} imports the storage SDK '${spec}'.`,
        ).toBe(false);
        expect(
          /\/import\/|\/seed\/|marketing\/xMail/.test(spec),
          `${file.path} imports '${spec}' — the CSV/XLSX import path or the mail ` +
            'reader. Reaching them from GPS routes a file-capable code path into the ' +
            'compartment that may not have one.',
        ).toBe(false);
      }
    }
  });
});

/**
 * Column declarations in a migration, as (name, type) pairs. Two shapes, because
 * both are how a column arrives: inside a CREATE TABLE body, and bolted on later
 * with ALTER TABLE ADD COLUMN — which is precisely how an artifact column would be
 * added to a table that already exists.
 */
type Column = { name: string; type: string; table: string };

/**
 * THE ENCLOSING TABLE IS PART OF THE ANSWER NOW, and it was not before. While the
 * claim was "no byte column anywhere" the name alone was enough; the claim is now
 * "one byte column, in one named table", which cannot be checked without knowing
 * which table a column belongs to.
 *
 * Resolved by position: the nearest CREATE TABLE / ALTER TABLE above the match. Not
 * perfect SQL parsing, and it does not need to be — every GPS migration writes one
 * statement per table in file order, and a file that did something cleverer would
 * attribute a column to the wrong table and fail LOUDLY rather than pass quietly.
 */
/**
 * A ROUTINE IS NOT A TABLE, and this function could not tell the difference until
 * 0070_audit_seal.sql arrived with PL/pgSQL in it.
 *
 * `columnsOf` recognises a column by shape — `name type` at the start of a line, or
 * `ADD COLUMN name type`. A PL/pgSQL routine has that shape twice over and neither
 * occurrence is a column:
 *
 *   CREATE OR REPLACE FUNCTION audit_seal_content(
 *     p_meta       jsonb,          ← a PARAMETER, in the signature, outside the body
 *   ) ... AS $$
 *   DECLARE
 *     el    jsonb;                 ← a LOCAL VARIABLE, inside the body
 *
 * Both were reported as jsonb columns and both failed the frozen-set ratchet below.
 * That is a false positive on a file that creates no GPS table at all, and a false
 * positive is not harmless here: the fix it invites is "add the name to the frozen
 * list", which is precisely the review this ratchet exists to force. A ratchet that
 * cries wolf gets widened until it is silent.
 *
 * So the whole routine is excised — from `CREATE FUNCTION` through the closing
 * dollar-quote — which removes the signature and the body in one cut. Excising
 * anything is a blind spot by construction, so `NO_DDL_IN_ROUTINE_BODIES` below
 * asserts that nothing excised here contains DDL against a gps_ table. Without that
 * assertion, `EXECUTE 'CREATE TABLE gps_x (doc bytea)'` inside a trigger function
 * would be invisible to every column check in this file.
 */
const ROUTINE = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)[\s\S]*?\$([a-z_]*)\$[\s\S]*?\$\1\$/gi;
/** A bare `DO $$ ... $$` block: no signature, but the body has the same shape. */
const DO_BLOCK = /\bDO\s+\$([a-z_]*)\$[\s\S]*?\$\1\$/gi;

/** The routine text this file deliberately stops reading as table definitions. */
function routineBodies(sql: string): string[] {
  return [...sql.matchAll(ROUTINE), ...sql.matchAll(DO_BLOCK)].map((m) => m[0]);
}

const withoutRoutines = (sql: string) => sql.replace(ROUTINE, ' ').replace(DO_BLOCK, ' ');

function columnsOf(rawSql: string): ReadonlyArray<Column> {
  const sql = withoutRoutines(rawSql);
  const owners = [...sql.matchAll(/(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?)\s+(?:ONLY\s+)?([a-z_][a-z0-9_.]*)/gi)]
    .map((m) => ({ at: m.index ?? 0, table: m[1]!.toLowerCase().replace(/^public\./, '') }));
  const tableAt = (at: number) => {
    let table = '(no table)';
    for (const owner of owners) {
      if (owner.at > at) break;
      table = owner.table;
    }
    return table;
  };

  const out: Column[] = [];
  const TYPE = 'bytea|blob|text|jsonb|json|xml|bit|varbit|varchar|char|uuid|bigint|integer|int|smallint|serial|boolean|bool|numeric|decimal|real|double|date|timestamptz|timestamp|time|interval|oid|lo|citext|inet|bigserial';
  for (const m of sql.matchAll(new RegExp(`^\\s*([a-z_][a-z0-9_]*)\\s+(${TYPE})\\b`, 'gim'))) {
    out.push({ name: m[1].toLowerCase(), type: m[2].toLowerCase(), table: tableAt(m.index ?? 0) });
  }
  for (const m of sql.matchAll(new RegExp(`ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([a-z_][a-z0-9_]*)\\s+(${TYPE})\\b`, 'gi'))) {
    out.push({ name: m[1].toLowerCase(), type: m[2].toLowerCase(), table: tableAt(m.index ?? 0) });
  }
  return out;
}

/** Types that exist to hold bytes. Exactly one column in the compartment may be one. */
const BYTE_TYPES = /^(bytea|blob|bit|varbit|xml|oid|lo)$/;

/**
 * THE ONE PLACE BYTES MAY BE, spelled as table.column. Changing this line is the
 * review; nothing else in the compartment may hold a document.
 */
const BLOB_TABLE = 'gps_artifact_blob';
const BLOB_COLUMN = 'bytes';

/**
 * The metadata table 0057 created. It is the only table that may carry columns whose
 * NAMES describe a document (filename, mime_type, storage_key, byte_size) — because
 * those are facts ABOUT a file, and the whole point of them living on one table is
 * that "what do we hold for this client" is a single scan.
 */
const ARTIFACT_META_TABLE = 'gps_artifact';

/**
 * Column names that mean "the artifact itself is in here", including the
 * base64-in-a-text-column dodge — which is the shape this actually arrives in,
 * because someone will reason that text is not really storage.
 *
 * NOT on this list, on purpose: `checksum`, `sha256`, `hash`. A hash an operator
 * was GIVEN and typed is a reference like any other, and firing on it would be the
 * kind of false positive that gets a ratchet weakened. If a hash ever appears
 * alongside a size and a mime type, that is three references pretending not to be
 * a file, and the reviewer — not this regex — is the control.
 */
const BYTE_NAMES: readonly RegExp[] = [
  /base64/, /(^|_)b64(_|$)/, /(^|_)bytes(_|$)/, /(^|_)binary(_|$)/, /encoded/,
  /(^|_)payload(_|$)/, /(^|_)contents?(_|$)/, /(^|_)data(_|$)/, /(^|_)body(_|$)/,
  /blob/, /attachment/, /upload/, /artifact/, /document/,
  /^file_(name|path|url|size|type|ext)$/, /filename/, /filepath/,
  /storage_(path|key|bucket|url|id)/, /(^|_)bucket(_|$)/, /mime/, /media_type/,
];

/**
 * `currency` WAS THE DOOR, AND NOTHING IN THIS FILE COULD SEE IT.
 *
 * Every string in every GPS route handler goes through `text(v, max)` — except
 * `currency`, which was read as `typeof body.currency === 'string' ? body.currency :
 * undefined` and flowed uppercased into the `scope_snapshot` jsonb and into
 * `currency text NOT NULL` (`0047_gps.sql:172`), a column with no length and no
 * CHECK. There is no `bodyLimit` anywhere in `index.ts`. Verified before the fix by
 * running `quoteOffer` with a 112,000-character payload: `q.currency.length ===
 * 112000` and the payload appeared verbatim inside `JSON.stringify(q.scopeSnapshot)`.
 * Hex and Base32 survive `.toUpperCase()` losslessly, so a client PDF encoded into
 * that field was recoverable.
 *
 * Every mechanism in this file was blind to it by construction: `currency` is not in
 * `BYTE_NAMES`, `text` is not in `BYTE_TYPES`, and the jsonb freeze compares only the
 * NAME SET of jsonb columns — which did not change. A document landed in the exact
 * column this file's docblock names as its acknowledged blind spot, with no new
 * column, route, dependency or migration.
 *
 * The ratchet is a CLOSED PATTERN, not a length cap: three bytes drawn from 26
 * letters is not a channel, whereas `text(body.currency, 3)` would be a smaller
 * version of the same hole with 1.1 bits per request. The governed action path already
 * did this (`gps/actions.ts`, `z.string().regex(/^[A-Z]{3}$/)`); this asserts the REST
 * path cannot drift back.
 */
describe('currency is a closed three-letter code on every GPS route, never a free string', () => {
  it('no GPS route reads body.currency as a bare string', () => {
    for (const file of GPS_ROUTE_FILES) {
      expect(
        /typeof\s+body\.currency\s*===\s*'string'\s*\?\s*body\.currency\s*:/.test(file.code),
        `${file.path} reads body.currency as an unbounded string. That field lands in a `
          + 'jsonb snapshot and a text column with no length and no CHECK, and there is no '
          + 'bodyLimit on the server: it is a document-sized channel into the compartment '
          + 'that must not hold documents. Validate it against /^[A-Za-z]{3}$/ first.',
      ).toBe(false);
    }
  });

  it('every route file that accepts a currency validates it against a 3-letter pattern', () => {
    const accepting = GPS_ROUTE_FILES.filter((f) => /body\.currency/.test(f.code));
    expect(
      accepting,
      'no GPS route reads body.currency at all — this ratchet has gone vacuous; either the '
        + 'field was removed (fine, delete this test) or the discovery above is broken (not fine)',
    ).not.toHaveLength(0);
    for (const file of accepting) {
      expect(
        /\[A-Za-z\]\{3\}|\[A-Z\]\{3\}/.test(file.code),
        `${file.path} reads body.currency but declares no 3-letter pattern to check it against`,
      ).toBe(true);
    }
  });
});

describe('the bytes live in exactly one column of one table, and nowhere else in the schema', () => {
  it('declares a byte-typed column in exactly one place, by name', () => {
    const byteColumns = GPS_MIGRATIONS.flatMap((f) =>
      columnsOf(f.code).filter((c) => BYTE_TYPES.test(c.type)).map((c) => ({ ...c, path: f.path })),
    );
    // Non-vacuity: custody exists, so this must find it. An empty result would mean
    // 0058 has gone and every assertion here would pass while the intake surface was
    // writing to a table nobody had created.
    expect(
      byteColumns.map((c) => `${c.table}.${c.name}`),
      'no byte-bearing column exists in any GPS migration. Client files were allowed on '
        + '2026-08-02 and the surface writes bytes to gps_artifact_blob — if that table is gone, '
        + 'every upload fails with 42P01 and this ratchet is guarding nothing.',
    ).toContain(`${BLOB_TABLE}.${BLOB_COLUMN}`);

    for (const col of byteColumns) {
      expect(
        `${col.table}.${col.name}`,
        `${col.path} declares '${col.name} ${col.type}' on ${col.table}. A client document may be `
          + `in ONE column in this compartment — ${BLOB_TABLE}.${BLOB_COLUMN} — and the reason is `
          + 'not tidiness. That separation is what makes `pg_dump --exclude-table` a complete '
          + 'answer for a developer taking a working copy, what stops a mis-scoped SELECT * on a '
          + 'table every screen reads from returning confidential material, and what makes "where '
          + 'are the bytes for this artifact" answerable by one primary-key lookup. A second byte '
          + 'column has none of those properties and inherits none of the retention, digest or '
          + 'audit machinery attached to the first.',
      ).toBe(`${BLOB_TABLE}.${BLOB_COLUMN}`);
    }
    // Exactly one, not merely "the right one exists".
    expect(byteColumns).toHaveLength(1);
  });

  it('lets no OTHER table carry a column shaped like a document', () => {
    /**
     * The base64-in-a-text-column dodge, which is the shape this actually arrives in:
     * someone reasons that text is not really storage. It is — a base64 PDF in a text
     * column is a document with no size ceiling, no verified type, no digest, no
     * retention date and no audit row, which is every control the reviewed surface has.
     *
     * `gps_artifact` is exempt BY NAME because those columns are what 0057 is: facts
     * about a file, on the one table that holds them. `gps_artifact_blob` is exempt for
     * its own column. Nothing else is.
     */
    const exempt = new Set([ARTIFACT_META_TABLE, BLOB_TABLE]);
    let checked = 0;
    for (const file of GPS_MIGRATIONS) {
      for (const col of columnsOf(file.code)) {
        if (exempt.has(col.table)) continue;
        // A uuid named `<something>_id` is a reference and cannot hold a document,
        // whatever the something is. Without this the check fires on
        // `gps_artifact_grant.artifact_id`, which is a foreign key — and a ratchet that
        // fires on a foreign key is one somebody widens the pattern to silence.
        if (col.type === 'uuid' && col.name.endsWith('_id')) continue;
        checked++;
        const hit = BYTE_NAMES.find((p) => p.test(col.name));
        expect(
          hit,
          `${file.path} declares '${col.name} ${col.type}' on ${col.table} — the name says a `
            + 'document itself lives there. Client documents go through the intake surface, which '
            + 'gives them a verified type, a server-computed digest, a size ceiling, a retention '
            + 'date, a soft-delete record and an audit row on every read. A column on another '
            + 'table gives them none of that, and nothing will ever tell you it happened.',
        ).toBeUndefined();
      }
    }
    expect(checked, 'no non-artifact GPS columns were examined — the table attribution has broken').toBeGreaterThanOrEqual(50);
  });

  it('denies by default on every table that can hold or reach a document', () => {
    /**
     * RLS with no policy is deny-all, and it is the whole reason a bytea column in
     * `public` is defensible where a large object would not have been: Supabase
     * exposes public tables through its auto-generated REST API, so a table without
     * RLS is one leaked anon key away from being a document download.
     */
    for (const file of GPS_MIGRATIONS) {
      for (const m of file.code.matchAll(/CREATE TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(gps_[a-z_]+)/gi)) {
        const table = m[1]!;
        expect(
          file.code,
          `${file.path} creates ${table} and never enables row level security. Supabase serves `
            + 'public tables over its REST API; without RLS the anon key reads this table.',
        ).toMatch(new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`, 'i'));
      }
      expect(
        file.code,
        `${file.path} defines an RLS policy on a gps_ table. Deny-all with no policy is the `
          + 'intent: the API connects as the database owner and bypasses RLS, so a policy here '
          + 'can only ever GRANT something to a role that should hold nothing.',
      ).not.toMatch(/CREATE POLICY\s+\w+\s+ON\s+gps_/i);
    }
  });

  /**
   * THE BUCKET, WHICH NOTHING WRITES TO YET AND MUST STILL BE SHUT.
   *
   * 0057 creates `gps-artifacts` private and closes it to the anon and authenticated
   * roles; 0058 explains that the API has no service credential and so keeps byte
   * custody in Postgres. Both facts at once are why this check matters MORE than it
   * would if the bucket were in use: an unused bucket is exactly the kind of object a
   * dashboard click flips to public because it "obviously has nothing in it", and it
   * is the declared destination for every one of these documents the day a credential
   * arrives. It has to already be closed on that day.
   */
  it('creates the artifact bucket private, re-asserts private on a re-run, and grants nothing', () => {
    const declaring = GPS_MIGRATIONS.filter((f) => /storage\.buckets/i.test(f.code));
    expect(
      declaring.map((f) => f.path),
      'no GPS migration declares the artifact bucket. It is created in SQL and not in a '
        + 'dashboard precisely so its private flag, its size cap and its type list are in the '
        + 'tree; a bucket made by clicking is a security posture living in a click nobody '
        + 'recorded, and a database restored from these migrations alone would come up with no '
        + 'bucket while the API kept writing keys.',
    ).not.toHaveLength(0);

    for (const file of declaring) {
      const insert = /INSERT INTO storage\.buckets[\s\S]*?;/i.exec(file.code)?.[0] ?? '';
      expect(insert, `${file.path} no longer inserts the bucket row`).not.toBe('');
      expect(
        insert,
        `${file.path} creates the bucket with public = true, or no longer says false. `
          + '`public = false` is what makes the /object/public/ route return nothing for it. '
          + 'A public bucket of client offering documents needs no leaked key and no bug: the '
          + 'URL is guessable from the storage_key this schema stores in plain text.',
      ).toMatch(/\bfalse\b/);
      expect(insert, `${file.path} marks the artifact bucket public`).not.toMatch(/\btrue\b/);
      expect(
        file.code,
        `${file.path} no longer re-asserts private when the bucket already exists. DO NOTHING `
          + 'would let a bucket someone had made public stay public while this file claimed '
          + 'otherwise — the same class of lie as a migration edited after it was applied.',
      ).toMatch(/ON CONFLICT[\s\S]{0,80}DO UPDATE[\s\S]{0,120}public\s*=\s*false/i);
      expect(
        file.code,
        `${file.path} no longer caps object size on the bucket. The cap is the bucket's half of `
          + 'the agreement with gps_artifact.byte_size and the API ceiling; a bucket with no '
          + 'limit accepts what the other two refuse.',
      ).toMatch(/file_size_limit/);
      expect(
        file.code,
        `${file.path} no longer declares an allowed_mime_types list on the bucket.`,
      ).toMatch(/allowed_mime_types/);
    }

    // Every policy this compartment creates on storage.objects is RESTRICTIVE. A
    // permissive one GRANTS; a restrictive one is AND-ed into every other policy, so no
    // future permissive policy — including two clicks in the Storage dashboard by
    // someone who meant well — can open this bucket.
    const policies = GPS_MIGRATIONS.flatMap((f) =>
      [...f.code.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map((m) => ({ path: f.path, text: m[0] })),
    );
    expect(
      policies,
      'no policy is created on storage.objects. `public = false` alone is one dashboard toggle '
        + 'from being untrue; the restrictive policy is the half that survives the next person.',
    ).not.toHaveLength(0);
    for (const { path, text } of policies) {
      expect(
        text,
        `${path} creates a policy that is not RESTRICTIVE: ${text.slice(0, 90)}… A permissive `
          + 'policy grants access. Nothing in this compartment grants a role access to a client '
          + 'document — the desk reaches these objects through the API, which connects as the '
          + 'database owner, and never with an anon key.',
      ).toMatch(/AS RESTRICTIVE/i);
      expect(
        text,
        `${path} widens its policy beyond the artifact bucket. It must be scoped by bucket_id: a `
          + 'blanket USING (false) silently breaks every other bucket in the project, which is '
          + 'how a security tightening becomes an outage.',
      ).toMatch(/bucket_id/);
    }
  });

  it('references no large-object or file-import machinery', () => {
    for (const file of GPS_MIGRATIONS) {
      for (const pattern of [/pg_largeobject/i, /\blo_(import|export)\b/i, /\bCOPY\s+gps_/i, /pg_read_binary_file/i]) {
        expect(
          file.code,
          `${file.path} matches ${pattern} — a path from the filesystem into a GPS table.`,
        ).not.toMatch(pattern);
      }
    }
  });

  it('freezes the jsonb surface, because a source test cannot see inside one', () => {
    /**
     * The honest gap, handled honestly. `scope_snapshot` (0047_gps.sql:158) is jsonb
     * and nothing here can stop someone stuffing base64 into it. What CAN be held is
     * the COUNT: the reviewed jsonb columns are enumerated, so adding another is a
     * deliberate edit to this test — which is exactly the review trigger the lock
     * needs. If you are adding one, say in your commit message why it cannot hold a
     * document.
     *
     * ── REVIEW: `factor_scores_at_quote` (0053_gps_outcome.sql) ────────────────
     * This ratchet FIRED on it, as designed, and the review it forced found a real
     * hole rather than rubber-stamping the addition.
     *
     * The column's only writer is the `factorScoresAtQuote` body field of
     * `POST /v1/gps/loop/outcome`, validated by `factorScoreMap`
     * (`routes/gpsLoop.ts:482`). That validator refused any value that was not a
     * finite number — so a base64 document could never be a VALUE — but it accepted
     * ANY KEY NAME, unbounded in length and count. A payload could therefore ride in
     * the keys, and it would survive a round trip: the read-side `factorScores`
     * (`gps/loop.ts:244`) filters values and not keys, and `calibration.ts:732`
     * republishes `Object.keys(...)` as `observedKeys`. That is a write channel and a
     * read channel, which is a document store with extra steps.
     *
     * 0053's own comment claimed the column was "keyed by the six literal factor
     * names in TARGET_FACTOR_KEYS and nothing else"; nothing enforced it. It is
     * enforced now, at the edge, and `loopFactorKeyLockout.test.ts` pins it. With
     * both halves closed the column can hold at most six finite numbers, so it is
     * admitted to the frozen set.
     *
     * `scope_snapshot` has no such bound and this is NOT a claim that it does.
     */
    const jsonAll = GPS_SCHEMA_MIGRATIONS.flatMap((f) =>
      columnsOf(f.code)
        .filter((c) => c.type === 'json' || c.type === 'jsonb')
        .map((c) => ({ ...c, path: f.path })),
    );
    // The claim is about columns ON GPS TABLES, so the enclosing table decides
    // membership. That makes a failed attribution a hole: a jsonb column whose owner
    // could not be resolved would drop out of the frozen set and never be reviewed.
    // Attribution failing is therefore its own failure, LOUDLY, before the set is
    // compared — the same reason `columnsOf` resolves an owner by position at all.
    const unattributed = jsonAll.filter((c) => !c.table.startsWith('gps_'));
    expect(
      unattributed.map((c) => `${c.path}: ${c.name} ${c.type} on ${c.table}`),
      'a json/jsonb column in a migration that alters a GPS table could not be attributed ' +
        'to a gps_ table. It is therefore outside the frozen set below and would never be ' +
        'reviewed. Either it belongs to a non-GPS table in a mixed migration — split the ' +
        'migration — or the owner resolution missed, which is the loud failure this ' +
        'attribution exists to produce.',
    ).toEqual([]);
    const jsonColumns = jsonAll.map((c) => c.name).sort();
    expect(
      [...new Set(jsonColumns)],
      'the set of jsonb columns on GPS tables changed. A jsonb column is the one shape ' +
        'this ratchet is blind to, so the set is frozen and every addition is reviewed. ' +
        'Read the review above for what that review has to establish before you extend ' +
        'this list: name the ONLY writer, and show that no byte-bearing payload can ' +
        'survive a write and a read through it.',
    ).toEqual(['factor_scores_at_quote', 'scope_snapshot']);
  });
});

/**
 * Documentation predicates, run against RAW text (comments intact). A reference is
 * only safe if the next person can tell it is a reference, so the words are part of
 * the design and are asserted like anything else.
 */
const SAYS_HUMAN_ENTERED = /human[- ]entered|human enters|operator (types|enters)|typed by (a|an|the) (operator|human)/i;
const SAYS_NEVER_DEREFERENCED = /(never|nothing|not)[^.]{0,120}(fetch|fetches|fetched|copy|copies|copied|resolve|resolves|proxy|proxies|download)/i;

describe('the reference path survives the intake, and is still inert', () => {
  /**
   * WHY THIS DESCRIBE BLOCK STILL EXISTS, NOW THAT UPLOADS ARE ALLOWED.
   *
   * `external_location` is not the intake's older, worse sibling. It is a DIFFERENT
   * FACT and the distinction is the one an erasure request turns on: an uploaded
   * artifact is material ON LCX INFRASTRUCTURE, with a size, a digest and a retention
   * clock; `external_location` is a note that the material is in the client's own data
   * room, folder 3. Fold the two together and "do we hold this?" — the only question
   * an erasure request asks — stops being answerable. 0057 says the same thing at its
   * own :80-86 and leaves the column alone.
   *
   * So the older assertions are kept unchanged and for a sharper reason than before:
   * now that GPS demonstrably CAN fetch and store a document, the temptation to make
   * this column resolve itself is real rather than theoretical. It must stay inert.
   * Nothing validates it as a URL, follows it, previews it or proxies it.
   */
  it('records what we asked the client for, alongside — not instead of — what they sent', () => {
    const all = GPS_MIGRATIONS.map((f) => f.code).join('\n');
    expect(
      all,
      'no gps_evidence_request table — the delivery layer must still record WHAT was ' +
        'asked of the client. An intake surface does not replace the chase list: most of ' +
        'what an engagement needs still lives with the client and their counsel, and the ' +
        'request is the record that we asked (0049_gps_delivery.sql).',
    ).toMatch(/CREATE TABLE IF NOT EXISTS gps_evidence_request/i);
    // The description is the artifact's stand-in: prose an operator writes about a
    // document that lives elsewhere. It is what makes the request actionable.
    const columns = GPS_MIGRATIONS.flatMap((f) => columnsOf(f.code).map((c) => c.name));
    expect(columns).toContain('description');
    expect(columns).toContain('external_location');
  });

  it('external_location is plain text, in every migration that declares it', () => {
    const declaring = GPS_MIGRATIONS.filter((f) => /\bexternal_location\b/.test(f.code));
    expect(declaring, 'external_location is declared nowhere — see the assertion above').not.toHaveLength(0);
    for (const file of declaring) {
      for (const col of columnsOf(file.code).filter((c) => c.name.startsWith('external_location'))) {
        expect(
          col.type,
          `${file.path} declares ${col.name} as ${col.type}. It must be text: any richer ` +
            'type invites the server to interpret it, and the whole property is that ' +
            'nothing interprets it.',
        ).toBe('text');
      }
    }
  });

  it('says in the file, not just in a plan, that a human types it and nothing fetches it', () => {
    // Read RAW. The comment IS the control here: the next engineer's default reading
    // of a location column is "resolve it", and only the prose next to it prevents
    // that. Both halves are required — "human-entered" without "never fetched" leaves
    // the dereference open, and vice versa.
    for (const file of GPS_MIGRATIONS.filter((f) => /\bexternal_location\b/.test(f.code))) {
      expect(
        file.raw,
        `${file.path} declares external_location without documenting that a human enters it.`,
      ).toMatch(SAYS_HUMAN_ENTERED);
      expect(
        file.raw,
        `${file.path} declares external_location without stating that nothing fetches or ` +
          'copies it. That sentence is the difference between a reference and an intake.',
      ).toMatch(SAYS_NEVER_DEREFERENCED);
    }
  });

  it('the shared domain types it as a string and documents it the same way', () => {
    const declaring = GPS_SHARED_SOURCES.filter((f) => /externalLocation/.test(f.code));
    expect(
      declaring,
      'no shared GPS type declares externalLocation — the evidence request needs a ' +
        'typed reference field (packages/shared/src/gps/delivery.ts).',
    ).not.toHaveLength(0);
    for (const file of declaring) {
      expect(
        file.code,
        `${file.path} declares externalLocation as something other than a string.`,
      ).toMatch(/externalLocation\s*\??\s*:\s*[^;\n]*\bstring\b/);
      expect(file.raw, `${file.path} does not document who enters externalLocation.`).toMatch(SAYS_HUMAN_ENTERED);
      expect(file.raw, `${file.path} does not state that externalLocation is never dereferenced.`).toMatch(SAYS_NEVER_DEREFERENCED);
    }
  });

  it('nothing anywhere dereferences it', () => {
    /**
     * The strongest single property of the design: `external_location` is inert. Not
     * validated as a URL (which would refuse "the shared folder counsel already uses"
     * and imply the server should follow it), not fetched, not previewed, not proxied.
     * Checked in a window after each mention rather than file-wide, so the message
     * points at the line that broke it.
     *
     * CASE-INSENSITIVE AND WITHOUT WORD BOUNDARIES, since 2026-08-02. Mutation-testing
     * this assertion after the intake conversion found it blind to the most natural
     * name a dereference would actually be given: `\bhref\b` does not match
     * `externalLocationHref`, because there is no word boundary before a capital H.
     * `/href/i` matches both, and the false-positive risk it adds is nil — nothing in
     * `apps/api` or the shared GPS domain has any business mentioning an href within
     * two lines of this column.
     */
    for (const file of GPS_SOURCES) {
      for (const m of file.code.matchAll(/external_?[Ll]ocation/g)) {
        const window = file.code.slice(m.index ?? 0, (m.index ?? 0) + 220);
        for (const pattern of [/\.url\s*\(/i, /new URL\s*\(/i, /fetch/i, /href/i, /redirect/i, /\bopen\s*\(/i, /presign/i, /download/i]) {
          expect(
            window,
            `${file.path} appears to dereference external_location (matched ${pattern}). ` +
              'It is a note about where a document lives in the CLIENT\'s systems. The ' +
              'moment the server follows it, LCX is retrieving third-party confidential ' +
              'material through a path with no ceiling, no verified type, no digest, no ' +
              'retention date and no audit row. D2 being answered YES authorised an upload a ' +
              'human performs at a reviewed surface; it did not authorise the server going ' +
              'and getting things.',
          ).not.toMatch(pattern);
        }
      }
    }
  });
});

describe('the compartment carries its own reason, wherever GPS grows', () => {
  /**
   * A migration that adds gps_ tables must carry the rationale. This is the assertion
   * most likely to annoy someone, and it is deliberate: the only reliable way to make
   * a posture survive is to make the person extending the schema read why it is there.
   *
   * D2 IS STILL THE THING TO NAME, AND MORE SO NOW. Before 2026-08-02 the sentence
   * every migration carried was "there is no artifact column because D2 is
   * unanswered". It is answered, and the sentence a new migration owes is now the
   * harder one: this compartment holds third-party confidential documents, the answer
   * that permitted that is dated and attributed, and the retention, erasure and
   * one-column-for-bytes design is what the answer came with. Copying the header is a
   * thirty-second cost; a fresh table that quietly becomes a second document store is
   * not.
   */
  it('every migration touching a gps_ table names D2, the decision the compartment turns on', () => {
    // GPS_SCHEMA_MIGRATIONS, not GPS_MIGRATIONS: this rule is about what a migration
    // DOES to the compartment, and a migration that merely names a gps_ table in a
    // comment has no D2 question to answer. See the set's own note for the file that
    // proved the difference.
    for (const file of GPS_SCHEMA_MIGRATIONS) {
      expect(
        /\bD2\b|\bDPO\b|controller vs processor|controller-vs-processor/i.test(file.raw),
        `${file.path} adds or alters a gps_ table without naming D2 / the DPO question. ` +
          'See 0047_gps.sql:26-36 for the shape it had while the question was open and ' +
          '0057_gps_artifact.sql:4-31 for the shape it has now that it is answered.',
      ).toBe(true);
    }
  });

  it('the migrations that created the intake say WHOSE decision it was, and WHEN', () => {
    /**
     * The attribution, in the tree, in the files that did it. An intake surface whose
     * justification is "someone decided" is one nobody can defend to a supervisor —
     * and a repository is the only place that sentence stays attached to the code.
     * RAW text: the prose IS the control here.
     */
    for (const name of ['0057_gps_artifact.sql', '0058_gps_artifact_custody.sql']) {
      const file = GPS_MIGRATIONS.find((f) => f.path.endsWith(name));
      expect(file, `${name} is not among the discovered GPS migrations`).toBeTruthy();
      expect(
        file!.raw,
        `${name} does not date the decision that permitted client documents. "D2 is answered" `
          + 'with no date and no owner is an assertion; with them it is a record.',
      ).toMatch(/2026-08-02/);
      expect(
        file!.raw,
        `${name} does not say WHO answered D2. The whole compartment now rests on that answer.`,
      ).toMatch(/\bowner\b/i);
    }
  });

  it('the GPS source files say what the posture is, in prose, in both directions', () => {
    /**
     * Two claims, and they are different files. The compartment at large still tells a
     * reader it holds no client material — because outside the intake surface that is
     * still exactly true — and the intake surface itself tells a reader that D2 was
     * answered. A tree where only one of those sentences exists is a tree where a reader
     * learns half the posture and guesses the rest.
     */
    const noMaterial = /no (artifact|upload|attachment)|artifact intake|no client (document|material)/i;
    expect(
      GPS_API_SOURCES.filter((f) => noMaterial.test(f.raw)).map((f) => f.path),
      'no GPS API source states the no-artifact posture in prose. Outside routes/gpsArtifact.ts '
        + 'it is still true, and the comments are how a human learns it before tripping over it.',
    ).not.toHaveLength(0);

    const answered = /D2 IS ANSWERED|D2 is answered|owner decision, 2026-08-02|owner, 2026-08-02/;
    for (const file of INTAKE_FILES) {
      expect(
        sourceAt(file).raw,
        `${file} does not state that decision D2 was answered, by whom and when. Every other GPS `
          + 'file says this system cannot hold a client document — correctly, for itself — so a '
          + 'reader who lands here first has to be told why this one can, or the whole '
          + 'compartment reads as inconsistent and someone "fixes" it in the wrong direction.',
      ).toMatch(answered);
    }
  });
});
