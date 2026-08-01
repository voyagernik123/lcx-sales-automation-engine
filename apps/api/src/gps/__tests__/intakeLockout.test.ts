import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE ARTIFACT LOCK — Phase 0 / S0.4, enforced across Phase 3 (delivery).
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * IF YOU ARE HERE BECAUSE THIS TEST JUST FAILED, READ THIS PARAGRAPH FIRST. You
 * have not tripped a lint rule and you cannot fix this by adjusting a regex. You
 * have added a way for a third party's document to enter LCX infrastructure, and
 * the question of whether LCX may hold one is UNANSWERED — not "unlikely to be a
 * problem", not "probably fine under the MSA": nobody has asked the LCX DPO, and
 * nobody in this repository can answer on their behalf.
 *
 * THE UNANSWERED QUESTION, precisely (GPS_IMPLEMENTATION_PLAN.md §3 D2, §4 S0.4).
 * GLOBAL SERVICES sells MiCA white-paper drafting, legal-opinion coordination, GTM
 * and marketing work to token projects. The material those offers need is a
 * client's unpublished offering document, their counsel's memoranda, cap-table and
 * treasury detail, unreleased tokenomics. The moment any of it lands on LCX
 * infrastructure, an EU/Liechtenstein regulated exchange is processing another
 * company's confidential — and in the legal-opinion case, privileged-adjacent —
 * material, and all of these are open:
 *
 *   · Is LCX controller or processor for it? The two answers carry different duties
 *     and different contracts, and the engagement paperwork names neither today.
 *   · What is the subprocessor chain? Supabase, Render, Cloudflare and OpenRouter
 *     each hold or transit platform data. A client must be told, and the DPA that
 *     tells them does not exist.
 *   · What is the retention period, and how is erasure honoured — including from
 *     backups, and including material a partner also holds?
 *   · Has the DPO agreed to any of it, in writing, with a date?
 *
 * WHAT PHASE 3 DID INSTEAD, so this test has something positive to assert. The
 * whole delivery layer is built AROUND the artifact: the request for it
 * (`gps_evidence_request`), the state of the work (`gps_milestone`), the
 * acceptance of it (`gps_deliverable`), and the audit of who asked and when. The
 * artifact itself stays wherever the client and their counsel already keep it, and
 * GPS holds one human-entered reference — a description an operator types and an
 * `external_location` an operator types. Nothing fetches it. Nothing copies it.
 * Nothing previews it. It is inert text in a row, and the tests below prove that
 * rather than asserting it.
 *
 * HOW THE LOCK COMES OFF — in this order, and not in any other:
 *   1. Ask the DPO the four questions above and get a written, dated answer.
 *   2. Record that answer in the plan against D2, naming who gave it.
 *   3. Design the storage — bucket, region, encryption, retention, erasure path,
 *      subprocessor disclosure — in its own migration and its own review.
 *   4. In THAT commit, delete the assertions here that the design contradicts, and
 *      state in the commit message which of the four questions each deletion rests
 *      on.
 * Deleting this file first, or loosening a pattern to get CI green, inverts the
 * order and is the failure mode this exists to catch.
 *
 * WHY SOURCE-LEVEL AND NOT BEHAVIOURAL. A behavioural test can only probe routes
 * that exist; this must fail for a route that does not exist yet. The technique is
 * borrowed from apps/api/src/marketing/__tests__/deploySafety.test.ts, which
 * asserts at source level for the same reason: the property is about what CANNOT
 * be added, and the only place that is visible is the tree.
 *
 * RELATIONSHIP TO ITS PHASE 1 SIBLING. gps/__tests__/noIntake.test.ts pins three
 * named files (routes/gps.ts, gps/service.ts, 0047_gps.sql) and the shared types.
 * It is kept, not merged: it is cheap and it names the files a reader expects.
 * THIS file is the tree-walking version — it discovers the GPS surface instead of
 * listing it, so a file nobody has written yet (gps/delivery.ts, routes/gps2.ts,
 * migration 0061_gps_whatever.sql) is covered on the day it appears. That is the
 * difference that matters: the Phase 1 test protects the files it knows about, and
 * an intake feature will not be added to those files.
 *
 * WHAT IS NOT CLAIMED, because a ratchet quoted as more than it is gets deleted
 * when someone finds the gap:
 *   · It does not stop a client emailing a document to a human being. Nothing in
 *     software can, and the DPO answer is what makes that human's inbox lawful or
 *     not — not this test.
 *   · It does not stop someone pasting confidential text into a free-text field.
 *     `check_performed` and `description` accept prose by design.
 *   · apps/api ALREADY contains file-capable code, and this test does not remove
 *     it: apps/api/src/import/csv.ts:71 calls `XLSX.read(buf, { type: 'buffer' })`
 *     over a path from disk for the seed CLI, and apps/api/src/marketing/xMail.ts:1
 *     opens an IMAP mailbox (`imapflow`) for the marketing compartment — a mailbox
 *     is a place attachments arrive. Neither is an HTTP intake route and neither is
 *     reachable from GPS. The claim this file makes is therefore deliberately
 *     narrow and exactly checkable: NO GPS FILE IMPORTS EITHER, and no new storage
 *     SDK joins apps/api's dependencies. A test that failed the whole suite over
 *     `xlsx` would be making a false claim about the repo and would be deleted
 *     within a week.
 *   · It cannot see inside a jsonb column. Someone determined to break this can
 *     base64 a PDF into `scope_snapshot`. What is checkable is that the jsonb
 *     surface does not GROW without review, so that is what is frozen below.
 *
 * VERIFIED BY MUTATION, not by reasoning. A ratchet nobody has watched fail is a
 * ratchet nobody knows works. Each of these was applied to a throwaway copy of the
 * tree and the named test went red; the tree was restored and the suite green
 * between every one:
 *
 *   1  a `/engagements/:id/upload` route added to routes/gps.ts     → route-path check
 *   2  `ALTER TABLE gps_deliverable ADD COLUMN file_blob bytea`     → byte-type + name
 *   3  the same as `draft_content text` (the base64 dodge)          → name check
 *   4  a new `review_meta jsonb` column                            → jsonb freeze
 *   5  `0061_delivery_files.sql` — a gps_attachment table in a file
 *      whose NAME never says gps                                    → content discovery
 *   6  `multer` added to apps/api/package.json                      → dependency check
 *   7  a brand-new `gps/intake.ts` calling `c.req.parseBody()`      → byte doors
 *   8  `app.route('/v1/gps/files', filesRoutes)` from a non-GPS file → prefix fence
 *   9  `new URL(r.externalLocation)` in the shared domain           → inertness
 *  10  passing the lock by DELETING the evidence-request table and
 *      renaming external_location away                              → positive path
 *  11  the DPO rationale stripped from a migration header           → rationale check
 *  12  external_location retyped from text to jsonb                 → type + freeze
 *
 * ONE INTEGRATION NOTE. This file asserts that the Phase 3 delivery schema and the
 * shared delivery domain EXIST (external_location, gps_evidence_request,
 * externalLocation). It therefore fails against a tree that has Phase 1 only, by
 * design — it ships in the same commit as 0049_gps_delivery.sql and
 * packages/shared/src/gps/delivery.ts, and a green run without them would mean the
 * positive half had been removed.
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
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Every mechanism by which bytes could arrive, grouped by the door they come
 * through, so a failure names the door instead of just saying "no".
 */
const BYTE_DOORS: ReadonlyArray<{ what: string; pattern: RegExp }> = [
  { what: 'multipart / form-data parsing', pattern: /multipart|form-?data/i },
  { what: 'a Hono body reader other than JSON', pattern: /\.(parseBody|arrayBuffer|blob|formData)\s*\(/ },
  { what: 'raw request stream access', pattern: /\breq\.raw\.body\b|getReader\s*\(|pipeTo\s*\(|pipeline\s*\(/ },
  { what: 'binary buffers', pattern: /\bBuffer\b|\bBlob\b|ArrayBuffer|Uint8Array|\bDataView\b/ },
  { what: 'base64 encoding or decoding', pattern: /base64|\batob\b|\bbtoa\b/i },
  { what: 'filesystem access', pattern: /node:fs|from\s+'fs'|readFileSync|writeFile|createWriteStream|createReadStream|\bmkdtemp/ },
  { what: 'object storage', pattern: /presign|getSignedUrl|createBucket|PutObject|\.bucket\b|storage\s*\.\s*from\s*\(/i },
  { what: 'an outbound fetch (nothing in GPS dereferences anything)', pattern: /\bfetch\s*\(|\baxios\b|\bundici\b|node:https?\b/ },
  { what: 'a file-upload middleware', pattern: /\bmulter\b|\bbusboy\b|\bformidable\b/i },
  { what: 'a content field that would carry client material', pattern: /\b(?:body|params|input)\s*\.\s*(?:document|file|attachment|upload|content|payload|bytes|draft|deck|whitepaper)\b/i },
];

describe('no GPS code can receive bytes', () => {
  /**
   * Run over the DISCOVERED set, one assertion per file per door, so the message
   * says which file and which door. Sixty cheap regexes beat one clever one that
   * nobody can read when it fires.
   */
  it('opens none of the byte doors, in any GPS file', () => {
    expect(GPS_SOURCES.length).toBeGreaterThanOrEqual(4);
    for (const file of GPS_SOURCES) {
      for (const door of BYTE_DOORS) {
        expect(
          file.code,
          `${file.path} appears to add ${door.what}.\n` +
            'GPS accepts NO client material: decision D2 (LCX DPO — controller vs ' +
            'processor for a third party\'s confidential documents) is UNANSWERED. ' +
            'Read the docblock at the top of this file before changing anything here.',
        ).not.toMatch(door.pattern);
      }
    }
  });

  it('reads request bodies as JSON and by no other means', () => {
    // The positive half of the same property: one reader, and `c.req.json` cannot
    // return a file. Absence of the alternatives is what makes it structural.
    const readers = GPS_ROUTE_FILES.flatMap((f) => f.code.match(/c\.req\.[a-zA-Z]+/g) ?? []);
    expect(readers, 'no GPS route reads a request at all — discovery is probably broken').not.toHaveLength(0);
    const allowed = new Set(['c.req.json', 'c.req.param', 'c.req.query', 'c.req.header', 'c.req.path', 'c.req.method']);
    for (const reader of readers) {
      expect(
        allowed.has(reader),
        `a GPS route uses ${reader}. Only json/param/query/header may be read — every ` +
          'other accessor can carry bytes, and this is the line where a document would enter.',
      ).toBe(true);
    }
  });

  it('declares no route path that names a file, a document or a blob', () => {
    /**
     * Extracted rather than grepped: the assertion is about the PATHS mounted under
     * /v1/gps, and a path is the honest surface a client-side upload would need.
     * The extraction is asserted non-empty first — an extractor that matches
     * nothing is a test that proves nothing.
     */
    const paths = GPS_ROUTE_FILES.flatMap(
      (f) => [...f.code.matchAll(/\.\s*(?:get|post|put|patch|delete|all|on)\s*\(\s*'([^']*)'/g)].map((m) => m[1]),
    );
    expect(paths.length, 'no route paths extracted — the regex no longer matches how routes are declared here').toBeGreaterThanOrEqual(10);
    // Deliberately NOT including "import" or "ingest": a route that ingests a text
    // payload is not an artifact intake, and a false positive here trains the next
    // engineer to edit the pattern — which is how a ratchet stops ratcheting.
    const forbidden = /upload|attach|\bfiles?\b|document|blob|artifact|media|\basset/i;
    for (const path of paths) {
      expect(
        path,
        `route path '${path}' names an artifact intake shape. Under /v1/gps there is ` +
          'nowhere for a document to go, so a path that promises one is either dead or ' +
          'a lock breach. See GPS_IMPLEMENTATION_PLAN.md §4 S0.4.',
      ).not.toMatch(forbidden);
    }
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
function columnsOf(sql: string): ReadonlyArray<{ name: string; type: string }> {
  const out: { name: string; type: string }[] = [];
  const TYPE = 'bytea|blob|text|jsonb|json|xml|bit|varbit|varchar|char|uuid|bigint|integer|int|smallint|serial|boolean|bool|numeric|decimal|real|double|date|timestamptz|timestamp|time|interval|oid|lo|citext|inet|bigserial';
  for (const m of sql.matchAll(new RegExp(`^\\s*([a-z_][a-z0-9_]*)\\s+(${TYPE})\\b`, 'gim'))) {
    out.push({ name: m[1].toLowerCase(), type: m[2].toLowerCase() });
  }
  for (const m of sql.matchAll(new RegExp(`ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([a-z_][a-z0-9_]*)\\s+(${TYPE})\\b`, 'gi'))) {
    out.push({ name: m[1].toLowerCase(), type: m[2].toLowerCase() });
  }
  return out;
}

/** Types that exist to hold bytes. None of them may appear in a GPS table. */
const BYTE_TYPES = /^(bytea|blob|bit|varbit|xml|oid|lo)$/;

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

describe('no gps_* migration has anywhere to write bytes', () => {
  it('declares no column of a type that holds bytes', () => {
    for (const file of GPS_MIGRATIONS) {
      for (const col of columnsOf(file.code)) {
        expect(
          BYTE_TYPES.test(col.type),
          `${file.path} declares ${col.name} ${col.type}. A GPS table has no byte-bearing ` +
            'column, and that is the load-bearing half of the lock: an upload route is only ' +
            'worth writing when a column exists to write into. D2 is unanswered — see the ' +
            'docblock in this file and the header of 0047_gps.sql.',
        ).toBe(false);
      }
    }
  });

  it('declares no text column shaped like an encoded document', () => {
    for (const file of GPS_MIGRATIONS) {
      for (const col of columnsOf(file.code)) {
        const hit = BYTE_NAMES.find((p) => p.test(col.name));
        expect(
          hit,
          `${file.path} declares '${col.name} ${col.type}' — the name says the artifact ` +
            'itself lives there. text is still storage: a base64 PDF in a text column is a ' +
            'document held on LCX infrastructure, with the same unanswered DPO question and ' +
            'none of the encryption or retention a real design would have.',
        ).toBeUndefined();
      }
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
    const jsonColumns = GPS_MIGRATIONS.flatMap((f) =>
      columnsOf(f.code).filter((c) => c.type === 'json' || c.type === 'jsonb').map((c) => c.name),
    ).sort();
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

describe('the intended path exists: a human-entered reference, and nothing more', () => {
  /**
   * WHY THIS DESCRIBE BLOCK EXISTS. Every assertion above is satisfiable by deleting
   * the delivery layer entirely, and a ratchet that rewards deletion is a ratchet
   * that will one day be "fixed" by deleting the feature. These assert that the
   * around-the-artifact design is actually present: we ask for the material, we
   * record where it lives in the client's own systems, we never hold it.
   */
  it('records what we asked the client for, without a column for what they send', () => {
    const all = GPS_MIGRATIONS.map((f) => f.code).join('\n');
    expect(
      all,
      'no gps_evidence_request table — the delivery layer must still record WHAT was ' +
        'asked of the client, or the lock has been satisfied by removing the feature ' +
        'instead of by designing around it (0049_gps_delivery.sql).',
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
     */
    for (const file of GPS_SOURCES) {
      for (const m of file.code.matchAll(/external_?[Ll]ocation/g)) {
        const window = file.code.slice(m.index ?? 0, (m.index ?? 0) + 220);
        for (const pattern of [/\.url\s*\(/, /new URL\s*\(/, /\bfetch\b/, /\bhref\b/, /redirect/i, /\bopen\s*\(/]) {
          expect(
            window,
            `${file.path} appears to dereference external_location (matched ${pattern}). ` +
              'It is a note about where a document lives in the CLIENT\'s systems. The ' +
              'moment the server follows it, LCX is retrieving third-party confidential ' +
              'material — the exact act D2 has not authorised.',
          ).not.toMatch(pattern);
        }
      }
    }
  });
});

describe('the lock carries its own reason, wherever GPS grows', () => {
  /**
   * A future migration that adds gps_ tables must also carry the rationale. This is
   * the assertion most likely to annoy someone, and it is deliberate: the only
   * reliable way to make a lock survive is to make the person extending the schema
   * read why it is there. Copying the header is a thirty-second cost; discovering
   * the reason after a client's filing is on LCX infrastructure is not.
   */
  it('every migration touching a gps_ table names the unanswered DPO question', () => {
    for (const file of GPS_MIGRATIONS) {
      expect(
        /\bD2\b|\bDPO\b|controller vs processor|controller-vs-processor/i.test(file.raw),
        `${file.path} adds or alters a gps_ table without naming D2 / the DPO question. ` +
          'Every GPS migration states why there is no artifact column, so that the next ' +
          'person to add a column knows what they are deciding. See 0047_gps.sql:26-36 ' +
          'for the shape.',
      ).toBe(true);
    }
  });

  it('the GPS source files still say it too', () => {
    // routes/gps.ts:22 and gps/service.ts:33 carry the banner today. Asserted so that
    // a rewrite of either file cannot quietly drop the only warning a reader gets.
    const banner = /no (artifact|upload|attachment)|artifact intake|no client (document|material)/i;
    const saying = GPS_API_SOURCES.filter((f) => banner.test(f.raw));
    expect(
      saying.map((f) => f.path),
      'no GPS API source states the no-artifact posture in prose. The tests enforce it; ' +
        'the comments are how a human learns it exists before tripping over it.',
    ).not.toHaveLength(0);
  });
});
