import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PHASE 0 / S0.4 — THERE IS NO CLIENT ARTIFACT INTAKE, AND THERE CANNOT BE ONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS PROTECTS, in one paragraph. GLOBAL SERVICES sells MiCA white paper
 * drafting, legal-opinion coordination and GTM work. Every one of those offers
 * NAMES the material a client must provide — unpublished offering documents,
 * counsel's memoranda, cap-table and treasury detail, unreleased tokenomics. The
 * moment any of it can be POSTed to this API, LCX — an EU/Liechtenstein regulated
 * exchange — is holding a third party's confidential material on its own
 * infrastructure, and decision D2 in `GPS_IMPLEMENTATION_PLAN.md` §3 is UNANSWERED:
 * is LCX controller or processor for it, what is the subprocessor chain through
 * Supabase/Render/Cloudflare/OpenRouter, what is the retention period, how is
 * erasure honoured, and has the LCX DPO agreed to any of it. Nobody in this repo
 * can answer those questions, so the correct posture is not "be careful" — it is
 * that the system must be PHYSICALLY INCAPABLE of accepting a client document
 * (plan §2, §4 S0.4).
 *
 * WHY A TEST AND NOT A COMMENT. `0047_gps.sql` creates no artifact column and
 * `packages/shared/src/gps/types.ts` declares no artifact type, so today there is
 * nowhere for bytes to land. But the failure mode is a reasonable-looking future
 * commit — "just let them attach the draft, it is easier than email" — and by the
 * time anyone notices, client material is in a Supabase bucket with no legal basis
 * and no erasure story. This test is the thing that stops that commit at CI.
 *
 * WHAT IS NOT CLAIMED. This does not stop a client emailing a document to a human,
 * and it does not stop someone pasting confidential text into a free-text field
 * (`checkPerformed` accepts 4000 characters). It closes the SYSTEMATISED path —
 * the one that turns an occasional human judgement into infrastructure. That
 * limit is real and is stated so nobody quotes this test as more than it is.
 *
 * WHEN D2 IS ANSWERED, the correct way to remove this test is: answer it in
 * writing with the DPO, record the answer in the plan, add the storage design in
 * its own migration and its own review, and then delete these assertions in that
 * same commit. Deleting them first is the failure.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const REPO = resolve(SRC, '../../..');

const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, '');

const routesRaw = readFileSync(resolve(SRC, 'routes/gps.ts'), 'utf8');
const routes = stripTs(routesRaw);
const service = stripTs(readFileSync(resolve(SRC, 'gps/service.ts'), 'utf8'));
const migration = stripSql(
  readFileSync(resolve(SRC, 'db/migrations/0047_gps.sql'), 'utf8'),
);
const sharedTypes = stripTs(
  readFileSync(resolve(REPO, 'packages/shared/src/gps/types.ts'), 'utf8'),
);

/**
 * Every mechanism by which bytes could enter. Grouped by how they would arrive so
 * a failure message says which door was opened, not just that one was.
 *
 * Comments are stripped before matching — the files DISCUSS uploads at length in
 * order to explain why there are none, and a ratchet that failed on its own
 * rationale would be deleted within a week.
 */
const BYTE_DOORS: ReadonlyArray<{ what: string; pattern: RegExp }> = [
  { what: 'multipart / form upload', pattern: /multipart|form-?data|parseBody/i },
  { what: 'raw body reader', pattern: /\.(arrayBuffer|blob|formData)\s*\(/ },
  { what: 'binary payload handling', pattern: /\bBuffer\b|\bBlob\b|ArrayBuffer|Uint8Array|base64/ },
  { what: 'filesystem write', pattern: /writeFile|createWriteStream|\bfs\b|node:fs/ },
  { what: 'object storage', pattern: /\bs3\b|presign|createBucket|\.bucket\b|storage\.from/i },
  { what: 'a route that names files or attachments', pattern: /upload|attachment|['"`][^'"`]*\/files?\b/i },
];

describe('no client artifact intake exists in the GPS API', () => {
  it('routes/gps.ts opens no door for bytes', () => {
    for (const door of BYTE_DOORS) {
      expect(
        routes,
        `routes/gps.ts appears to add ${door.what}. Phase 1 accepts NO client ` +
          'material: decision D2 (LCX DPO, controller vs processor for third-party ' +
          'confidential data) is unanswered. See GPS_IMPLEMENTATION_PLAN.md §4 S0.4.',
      ).not.toMatch(door.pattern);
    }
  });

  it('gps/service.ts opens no door for bytes either', () => {
    // The route file is the obvious place to look, which makes the service file
    // the place a shortcut actually lands ("just a helper that saves the draft").
    for (const door of BYTE_DOORS) {
      expect(service, `gps/service.ts appears to add ${door.what}`).not.toMatch(door.pattern);
    }
  });

  it('reads request bodies as JSON only', () => {
    // One reader, one shape. `c.req.json` cannot receive a file, so the absence of
    // every other reader is what makes the property structural rather than polite.
    expect(routes).toContain('c.req.json');
    expect(routes).not.toMatch(/c\.req\.(parseBody|arrayBuffer|blob|formData|raw\.body)/);
  });

  it('0047_gps.sql has no column bytes could be written to', () => {
    // Belt and braces with the route check: a column is the thing that makes an
    // upload route worth writing, so its absence is the load-bearing half.
    for (const pattern of [
      /\bbytea\b/i, /\battachment/i, /\bdocument_/i, /\bfile_(name|path|url|size)/i,
      /\bupload/i, /\bstorage_(path|key|bucket)/i, /\bartifact/i,
    ]) {
      expect(
        migration,
        `0047_gps.sql declares something matching ${pattern} — no artifact column ` +
          'may exist while D2 is unanswered (0047_gps.sql header, plan §2).',
      ).not.toMatch(pattern);
    }
  });

  it('the shared domain types declare no artifact type', () => {
    // Asserted here because the type is where an intake feature starts: someone
    // adds `attachments: Attachment[]` to GpsEngagement, and the route follows.
    for (const pattern of [/attachment/i, /\bupload/i, /\bartifact/i, /\bdocumentUrl/i]) {
      expect(sharedTypes, `packages/shared/src/gps/types.ts declares ${pattern}`)
        .not.toMatch(pattern);
    }
  });

  it('names the client inputs it needs WITHOUT creating anywhere to put them', () => {
    // The catalogue lists `requiredClientInputs` per offer — that is the honest
    // version of "delays were on their side". This asserts the pair: the API knows
    // what it needs and still has no intake for it, which is the whole design.
    const catalogue = stripTs(
      readFileSync(resolve(REPO, 'packages/shared/src/gps/catalogue.ts'), 'utf8'),
    );
    expect(catalogue).toContain('requiredClientInputs');
    // The snapshot carries the LIST of what the client must supply, because it is
    // part of the agreed scope. It carries no field for the material itself.
    expect(service).toContain('requiredClientInputs');
    // And no handler reads a body field that would carry client content.
    expect(routes).not.toMatch(/body\.(document|file|attachment|content|draft|deck|whitepaper)\b/i);
  });
});
