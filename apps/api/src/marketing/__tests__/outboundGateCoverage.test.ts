import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EVERY ROUTE IN ALL FOUR MARKETING ROUTERS IS CLASSIFIED, AND THE OUTBOUND ONES REACH
 * THE GATE.
 *
 * `checkClaimSafety` and `assessMarketAbuse` are 148KB of engine and NOTHING CALLED EITHER
 * on a write path. `POST /:id/draft` generated reply text through the LLM and saved it;
 * `POST /draft/:id/approve` marked text approved for a human to paste into X. Neither
 * consulted a gate. The refusals existed, the rules were cited, the tests passed, and the
 * compartment produced outbound text unchecked — the same defect the GPS perimeter had a
 * week earlier, where a gate existed and no write path consulted it.
 *
 * ══ WHY IT NOW READS FOUR FILES ══
 * The compartment split into `marketing.ts` + `marketingDesk.ts` + `marketingMemory.ts` +
 * `marketingRecord.ts`, and this test read the first one alone. Twenty-six routes landed
 * outside its view — two of them composing and approving the text a human publishes during
 * an incident — and it stayed green throughout. A ratchet that watches one file of four is
 * not a weaker ratchet, it is a false one: it reports "every route is classified" while
 * most routes are invisible to it.
 *
 * A NEW ROUTER FILE MUST BE ADDED TO `ROUTER_FILES` BELOW. There is no glob, deliberately:
 * a glob turns a filename typo into silence, and the failure mode of forgetting a file is
 * precisely the one above.
 *
 * ══ WHY THIS IS A CLASSIFICATION TEST AND NOT A LIST OF THE GATED ROUTES ══
 * Asserting "these four routes call the gate" would stay green forever after someone adds
 * a fifth route that produces text. So EVERY route registration in EVERY listed file must
 * appear in exactly one of the two lists below. A new route fails this test until a human
 * decides which it is, and writes down why. That is the property that makes the next
 * unguarded path turn it red.
 *
 * ══ WHAT THIS FILE VERIFIES, PRECISELY ══
 * It reads the source of the four routers and of `marketing/outboundGate.ts` and checks:
 *   - every registered route in every listed file is classified, and no classification
 *     names a route that no longer exists;
 *   - no two registrations share a `METHOD path` key, which would mean one shadows another;
 *   - each route classified as outbound reaches `gateOutboundText` — either in its own
 *     handler body or through exactly one named helper declared in the same file, which
 *     must itself call `gateOutboundText` and `recordGateDecision`;
 *   - the gate call precedes the write, per named write, in each of those four handlers;
 *   - the gate module itself fails closed on a thrown check and on an unattested register.
 *
 * ══ WHAT IT DOES NOT VERIFY — read this before trusting a green run ══
 * These are source-level assertions. The api suite is database-free and these handlers are
 * `pg` over a real pool, so nothing here executes a request or a query. It CANNOT prove
 * that a refusal is returned for a given draft, that the ledger row is written, or that
 * the register read is correctly scoped. It proves the call is present, in the right
 * order, in the right handlers, and that no route escaped classification. The test names
 * below are scoped to that and none of them claims the word "cannot".
 *
 * The behavioural counterparts — a refused draft never reaching `marketing_reply_draft`,
 * a refused crisis statement never reaching `marketing_crisis_statement_instance` — need a
 * database and are not this file's claim.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const routeSrc = (file: string) => readFileSync(resolve(HERE, '..', '..', 'routes', file), 'utf8');

/**
 * The four routers, each with the identifier its registrations are written against. All
 * four are mounted under `/v1/marketing`: `marketing.ts` nests the other three at `'/'`.
 */
const ROUTER_FILES = [
  { file: 'marketing.ts', router: 'marketingRoutes' },
  { file: 'marketingDesk.ts', router: 'marketingDeskRoutes' },
  { file: 'marketingMemory.ts', router: 'marketingMemoryRoutes' },
  { file: 'marketingRecord.ts', router: 'marketingRecordRoutes' },
] as const;

const GATE = readFileSync(resolve(HERE, '..', 'outboundGate.ts'), 'utf8');

interface Registration {
  readonly method: string;
  readonly path: string;
  readonly file: string;
  /** Byte offset of the registration within its own file. */
  readonly at: number;
  /** Source from this registration to the next one in the SAME file, or to its end. */
  readonly body: string;
  /** The whole file, so a helper the handler calls can be resolved. */
  readonly source: string;
}

/**
 * Every registration across the four files, each carrying its own handler body.
 *
 * The body is sliced per FILE — from one registration to the next in that file — so a
 * handler at the end of one router cannot absorb the top of another.
 */
const REGISTRATIONS: readonly Registration[] = ROUTER_FILES.flatMap(({ file, router }) => {
  const source = routeSrc(file);
  const re = new RegExp(`${router}\\.(get|post|put|patch|delete)\\('([^']+)'`, 'g');
  const found = [...source.matchAll(re)].map((m) => ({
    method: m[1]!.toUpperCase(),
    path: m[2]!,
    file,
    at: m.index ?? 0,
  }));
  return found.map((r, i) => ({
    ...r,
    source,
    body: source.slice(r.at, i + 1 < found.length ? found[i + 1]!.at : source.length),
  }));
});

/** `METHOD path` for each registration. */
const key = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

const find = (k: string): Registration => {
  const hit = REGISTRATIONS.find((r) => key(r) === k);
  if (!hit) throw new Error(`${k} is not registered in any of: ${ROUTER_FILES.map((f) => f.file).join(', ')}`);
  return hit;
};

/**
 * ROUTES THAT PRODUCE OR APPROVE OUTBOUND TEXT. Each must reach the gate.
 *
 * "Produces" means text a human could copy into X comes into existence or becomes
 * approved. The approval half is NOT redundant: the STATE moves under words that have not
 * changed, so a draft cleared at 09:00 naming an asset that entered `mnpi_pending` at
 * 10:00 must not approve at 11:00.
 */
const OUTBOUND: Record<string, string> = {
  'POST /:id/draft': 'generates reply text via the LLM and stores it for a human to copy',
  'POST /draft/:id/approve': 'marks stored text approved — the act that puts it in front of a human',
  'POST /crisis/statements/:key/instance':
    'composes the incident statement a named human publishes by hand, and stores it. '
    + '`assessStatementCompleteness` reads the STRUCTURE and cannot see a regulated promise '
    + 'or an embargoed symbol, so a structurally complete statement can still be unlawful.',
  'POST /crisis/instance/:id/clearance':
    'grants a reviewer\'s clear over stored crisis text — the crisis room\'s approval act. '
    + 'The bytes are immutable and the perimeter is not, so the gate re-runs here for the '
    + 'same reason `POST /draft/:id/approve` re-runs it.',
};

/**
 * ROUTES THAT DO NOT PRODUCE OR APPROVE OUTBOUND TEXT, each with the reason.
 *
 * A governance list, not a way to quiet the test. Adding an entry is a statement that this
 * route cannot put words in front of a human to publish.
 */
const NOT_OUTBOUND: Record<string, string> = {
  /* ── marketing.ts ── */
  'GET /queue': 'reads inbound rows. No LCX text is produced.',
  'GET /summary': 'counts and SLA figures over inbound rows.',
  'GET /quarantined': 'reads the failed-authentication lane. Nothing is promoted or drafted.',
  'GET /:id/drafts': 'reads drafts that were already gated at creation.',
  'GET /perimeter': 'reads the two registers the gate consults. A read of the gate\'s inputs.',
  'POST /ingest': 'stores an INBOUND reply a colleague pasted. Somebody else\'s words, not ours.',
  'POST /tick': 'polls the mailbox and runs the two retention sweeps and the post-time '
    + 'corroboration sweep. The one outbound call in it is a credential-free GET to '
    + 'publish.twitter.com/oembed, which READS X. Nothing in this route emits LCX text.',
  'POST /:id/status': 'moves a row through triage. Produces no text.',
  'POST /draft/:id/sent': 'records a human\'s assertion that they already pasted approved text. '
    + 'The gate ran at approval; re-gating a past act could not un-publish it, and refusing '
    + 'here would only stop the desk RECORDING what it did — which is worse than the risk.',

  /* ── marketingDesk.ts: assessments and desk state. None of them emits text. ── */
  'POST /regime': 'classifies which law bites over a supplied body and projects the Art 7 '
    + 'character budget. Reads no row, writes no row, and returns no text — a POST only '
    + 'because the input does not fit in a query string.',
  'POST /triage/assess': 'scores an inbound reply against the RESIST 2 taxonomy. Judges '
    + 'somebody else\'s words; authors none.',
  'POST /:id/triage': 'writes the triage tier, the priority and a silence record for one '
    + 'inbound row. A decision NOT to speak is the opposite of outbound text.',
  'POST /adoption': 'answers what an engagement verb would adopt from a target. It does not '
    + 'perform the act and returns no draft.',
  'GET /desk': 'reads the board, the queue counts and the current desk mode.',
  'POST /desk-mode': 'appends a desk-mode declaration or an Art 94(1)(q) suspension. It '
    + 'constrains what the desk may do; it produces no words.',

  /* ── marketingMemory.ts ── */
  'GET /precedent': 'searches LCX\'s own past statements. A read of the record.',
  'GET /precedent/debt': 'computes contradiction debt over that corpus.',
  'POST /precedent/statement': 'records a statement LCX ALREADY made, with its standing — '
    + 'including `never_published`. It is the same shape of act as `POST /draft/:id/sent`: '
    + 'a record of the past, not a candidate for release. Nothing reads this index as '
    + 'publishable text; an operator drafting from it goes through `POST /:id/draft`, '
    + 'which is gated.',
  'GET /crisis/statements': 'reads the versioned holding-statement library out of code.',
  'GET /crisis/preclears': 'reads the peer-contagion preclears out of code.',
  'POST /crisis/incident': 'opens an incident and starts the time-to-first-statement clock. '
    + 'No statement text exists at this point.',
  'GET /crisis/incident/:id/clock': 'reads the clock against its budget.',
  'POST /crisis/incident/:id/first-statement': 'records TESTIMONY that a named human '
    + 'published by hand at a stated time. Re-gating a past act could not un-publish it.',
  'GET /crisis/instance/:id': 'reads one stored instance, its board and its clock. The '
    + 'payload carries `outboundGate: null`, which says no gate ran on this read rather '
    + 'than implying the text is clear.',

  /* ── marketingRecord.ts: the watch, the record and the statutory paths. ── */
  'GET /watch': 'reads the regulator and narrative watch. Somebody else\'s publications.',
  'GET /watch/claim-expiry': 'reads the claim-freshness ledger.',
  'GET /export': 'produces the Art 8(2) bundle from stored records. A print path; no text '
    + 'becomes newly publishable by being exported.',
  'GET /export/:itemId': 'the same bundle narrowed to one record uid.',
  'POST /record': 'writes the five-year record of text that was ALREADY cleared and '
    + 'published — `text` is documented as "the exact bytes as cleared". Approver-only, and '
    + 'the same shape of act as `POST /draft/:id/sent`.',
  'POST /subject-access': 'answers a GDPR Art 15 request about one handle. Returns that '
    + 'subject\'s own rows, not LCX copy.',
  'POST /erasure': 'runs Art 17 erasure and reports what Art 17(3) retains. It destroys '
    + 'reach; it creates none.',
  'GET /retention': 'reads the retention posture and the jeopardy count.',
  'POST /retention/run': 'runs the five-year clock: minimises third-party bodies and sweeps '
    + 'expired rows. Deletion and hashing only.',
  'GET /post-time': 'measures what fraction of the queue carries X\'s own post date. SQL only '
    + '— it performs no oEmbed lookup and stores nothing.',
};

describe('every route in all four marketing routers is classified as outbound or not', () => {
  it('finds the registrations in all four files, or every assertion below is vacuous', () => {
    for (const { file } of ROUTER_FILES) {
      expect(
        REGISTRATIONS.filter((r) => r.file === file).length,
        `no route registrations matched in ${file} — the router identifier in ROUTER_FILES `
        + 'is probably stale, and this whole file just stopped checking that router',
      ).toBeGreaterThan(0);
    }
    // 11 in marketing.ts + 6 desk + 11 memory + 10 record when this was written.
    expect(REGISTRATIONS.length).toBeGreaterThanOrEqual(38);
  });

  it('registers no two routes under the same METHOD and path', () => {
    // Two registrations with one key means one shadows the other in Hono, and it also
    // means the classification lists below can only speak about one of them.
    const seen = new Map<string, string[]>();
    for (const r of REGISTRATIONS) seen.set(key(r), [...(seen.get(key(r)) ?? []), r.file]);
    const shadowed = [...seen.entries()].filter(([, files]) => files.length > 1);
    expect(
      shadowed.map(([k, files]) => `${k} in ${files.join(' + ')}`),
      'the first registration wins and the second is unreachable',
    ).toEqual([]);
  });

  it('leaves no route unclassified', () => {
    const unclassified = REGISTRATIONS
      .map((r) => `${key(r)}  (${r.file})`)
      .filter((k) => {
        const bare = k.split('  (')[0]!;
        return !(bare in OUTBOUND) && !(bare in NOT_OUTBOUND);
      });
    expect(
      unclassified,
      'a new marketing route exists and nobody has said whether it produces outbound text. '
      + 'Add it to OUTBOUND (and reach gateOutboundText in the handler) or to NOT_OUTBOUND '
      + 'with the reason it cannot put words in front of a human.',
    ).toEqual([]);
  });

  it('classifies no route that no longer exists', () => {
    // Otherwise a stale entry silently excuses a route that was renamed.
    const live = new Set(REGISTRATIONS.map(key));
    const stale = [...Object.keys(OUTBOUND), ...Object.keys(NOT_OUTBOUND)].filter((k) => !live.has(k));
    expect(stale, 'these classifications name routes that are gone').toEqual([]);
  });
});

/**
 * Does this handler reach `gateOutboundText`, directly or through ONE named helper declared
 * in the same file?
 *
 * Depth is one on purpose. Following an arbitrary call graph in a regex is how a source
 * test starts passing for the wrong reason; one hop covers the real pattern (two crisis
 * handlers sharing `gateCrisisStatement` so their inputs cannot drift) and anything deeper
 * has to be made visible by naming the helper in the handler.
 */
function gateReach(r: Registration): { direct: boolean; helper: string | null; helperBody: string | null } {
  if (r.body.includes('gateOutboundText(')) return { direct: true, helper: null, helperBody: null };
  for (const m of r.body.matchAll(/\b(?:await\s+)?([a-z][A-Za-z0-9_]*)\(/g)) {
    const name = m[1]!;
    const decl = new RegExp(`(?:async function|function|const)\\s+${name}\\b`).exec(r.source);
    if (!decl) continue;
    const after = r.source.slice(decl.index);
    // The helper's own text, up to the next top-level declaration.
    const end = after.slice(1).search(/\n(?:\/\*\*|export |async function |function |const [A-Za-z])/);
    const helperBody = end < 0 ? after : after.slice(0, end + 1);
    if (helperBody.includes('gateOutboundText(')) return { direct: false, helper: name, helperBody };
  }
  return { direct: false, helper: null, helperBody: null };
}

describe('each route classified as outbound reaches the gate from its own handler', () => {
  for (const [k, why] of Object.entries(OUTBOUND)) {
    it(`${k} reaches gateOutboundText directly or via one same-file helper (${why})`, () => {
      const reach = gateReach(find(k));
      expect(
        reach.direct || reach.helper !== null,
        `${k} does not consult the gate, and calls no same-file helper that does`,
      ).toBe(true);
    });

    it(`${k} records the verdict on the same path that gates it`, () => {
      // Doctrine rule 5: nothing leaves without a record. A verdict nobody can re-read
      // afterwards is a runtime opinion, not a control. When the gate is reached through a
      // helper, the RECORD must be in that same helper — a helper that gates without
      // recording would move the ledger write somewhere this test cannot see.
      const r = find(k);
      const reach = gateReach(r);
      const where = reach.direct ? r.body : reach.helperBody ?? '';
      expect(where, `${k} does not record its gate verdict`).toContain('recordGateDecision(');
    });

    it(`${k} branches on the verdict rather than ignoring it`, () => {
      // Calling the gate and discarding the answer is the failure mode that looks gated.
      const r = find(k);
      expect(
        /if \((?:!gate\.allowed|allRefusals\.length > 0 \|\| !gate\.verdict\.allowed|!gate\.verdict\.allowed)/.test(r.body),
        `${k} never tests the verdict it obtained`,
      ).toBe(true);
    });
  }

  /**
   * THE GATE PRECEDES THE WRITE, per handler, naming the write.
   *
   * A gate that runs after the INSERT leaves refused text in a table for a read route to
   * serve, with the refusal recorded somewhere else.
   */
  const ORDER: readonly { route: string; gate: string; write: string; why: string }[] = [
    {
      route: 'POST /:id/draft',
      gate: 'gateOutboundText(',
      write: 'saveDraft(',
      why: 'saving first would leave refused text in the table for GET /:id/drafts to serve',
    },
    {
      route: 'POST /draft/:id/approve',
      gate: 'gateOutboundText(',
      write: 'approveDraft(',
      why: 'approving first would mark refused text cleared for a human to paste',
    },
    {
      route: 'POST /crisis/statements/:key/instance',
      gate: 'gateCrisisStatement(',
      write: 'INSERT INTO marketing_crisis_statement_instance',
      why: 'a refused statement left in the table is one a surface can serve while the '
        + 'refusal sits somewhere else — the route\'s own stated rule for its other refusals',
    },
    {
      route: 'POST /crisis/instance/:id/clearance',
      gate: 'gateCrisisStatement(',
      write: 'INSERT INTO marketing_crisis_clearance',
      why: 'a clear written before the check is a green lane over refused text',
    },
  ];

  for (const o of ORDER) {
    it(`${o.route} gates before ${o.write.replace(/\(/, '')}`, () => {
      const body = find(o.route).body;
      const gated = body.indexOf(o.gate);
      const wrote = body.indexOf(o.write);
      expect(gated, `${o.route} no longer calls ${o.gate}`).toBeGreaterThan(-1);
      expect(wrote, `${o.route} no longer contains ${o.write}`).toBeGreaterThan(-1);
      expect(gated, o.why).toBeLessThan(wrote);
    });
  }

  it('POST /draft/:id/approve re-reads the stored text rather than trusting the body', () => {
    /*
     * Gating text the client supplied would let approval be granted for different bytes
     * than the ones stored.
     *
     * THIS ASSERTION USED TO PIN A DEFECT. It required the literal
     * `SELECT reply_id, text FROM marketing_reply_draft`, and that column does not exist —
     * the table holds `body` (0046:99). So the one test watching the line demanded the
     * broken spelling, and approve answered 500 on every real database.
     *
     * A grep cannot tell a column name from a typo, so the column is now asserted against
     * the MIGRATION rather than restated here, and the behaviour is pinned separately by
     * `routes/__tests__/marketingApproveGate.test.ts`, which runs the route against a stub
     * pool that raises 42703 for an unknown column the way Postgres does.
     */
    const body = find('POST /draft/:id/approve').body;
    const select = /SELECT ([\w\s,]+?) FROM marketing_reply_draft/.exec(body);
    expect(select, 'approve no longer re-reads the stored draft').not.toBeNull();
    const columns = select![1]!.split(',').map((c) => c.trim());
    const schema = readFileSync(resolve(HERE, '..', '..', 'db', 'migrations', '0046_marketing.sql'), 'utf8');
    const table = /CREATE TABLE IF NOT EXISTS marketing_reply_draft \(([\s\S]+?)\n\);/.exec(schema);
    expect(table).not.toBeNull();
    for (const column of columns) {
      expect(table![1], `approve selects ${column}, which 0046 does not create`)
        .toMatch(new RegExp(`^\\s+${column}\\s`, 'm'));
    }
    expect(body).toMatch(/text: draft\.body/);
  });

  it('POST /crisis/instance/:id/clearance gates the STORED body, not a request field', () => {
    // Gating text the client supplied would let a clear be granted against bytes nobody
    // stored — the same defect as approving from the request body.
    const body = find('POST /crisis/instance/:id/clearance').body;
    expect(body).toMatch(/text: operatorWordsOf\(row\.body as StatementBody\)/);
  });

  it('gates the same derivation at compose and at clearance', () => {
    /*
     * ONE FUNCTION, TWO CALLERS. If compose gated the rendered text and clearance gated the
     * operator's lines, "cleared at compose, refused at clearance" would be information
     * about two different inputs rather than about a moving perimeter — and the ledger's two
     * `text_sha256` rows would never match for the same statement.
     *
     * This also pins the measured defect: gating `renderStatementText(body)` extracted
     * WHAT/KNOW/DO/YET/HAPPENS/NEXT from the section headers as six phantom tickers and
     * refused every statement. The derivation is named so a change to it is one edit.
     */
    const memory = routeSrc('marketingMemory.ts');
    expect(memory).toMatch(/function operatorWordsOf\(body: StatementBody\): string/);
    const gated = [...memory.matchAll(/gateCrisisStatement\(pool, \{\s*\n\s*text: ([^,\n]+),/g)]
      .map((m) => m[1]!.trim());
    expect(gated.length, 'the two crisis gate calls are no longer both matchable').toBe(2);
    for (const expr of gated) expect(expr).toMatch(/^operatorWordsOf\(/);
  });
});

describe('the gate module fails closed', () => {
  it('runs both engines, not one', () => {
    // Either alone leaves a whole class open: the words gate cannot see an embargo, and
    // the state gate cannot see a regulated promise.
    expect(GATE).toContain('checkClaimSafety(');
    expect(GATE).toContain('assessMarketAbuse(');
  });

  it('treats either engine refusing as a refusal', () => {
    // Reading only the abuse disposition would let every claim-safety refusal through
    // whenever the market-abuse limbs were clear, which is most of the time.
    expect(GATE).toMatch(/claim\.verdict\.disposition === 'refused'/);
    expect(GATE).toMatch(/abuse\.disposition === 'refused'/);
  });

  it('converts a thrown check into a refusal rather than letting it escape', () => {
    // An exception inside a check is not a pass. If the try/catch is removed, a throwing
    // gate becomes a 500 — and a caller that treats non-200 as "retry later" would retry
    // into the same hole rather than seeing a refusal.
    expect(GATE).toMatch(/catch \(err\) \{\s*return gateFailure\(/);
    expect(GATE).toMatch(/disposition: 'refused'/);
  });

  it('never hands back usable text alongside a refusal', () => {
    // Doctrine rule 1 made structural: there is no field holding a softened promise.
    expect(GATE).toMatch(/usableText: allowed \? claim\.usableText : null/);
    expect(GATE).toMatch(/usableText: null/);
  });

  it('extracts the named assets itself rather than taking them from the caller', () => {
    // `assessMarketAbuse` does not extract symbols (abuse.ts:76). Taking the list from
    // the client would put the drafter in charge of whether the embargo check runs.
    expect(GATE).toContain('extractNamedAssets(');
    expect(GATE).toMatch(/const assets = extractNamedAssets\(req\.text\)/);
    expect(GATE).not.toMatch(/namedAssets: req\.namedAssets/);
  });

  it('carries the extraction caveat on the verdict', () => {
    // A clear verdict means "clear for the symbols listed", never "clear". Hiding that
    // would make the gate more dangerous than no gate.
    expect(GATE).toContain('EXTRACTION_IS_LEXICAL');
    expect(GATE).toMatch(/assetsExtracted/);
  });

  it('carries the extraction caveat onward on the crisis clear verdict too', () => {
    // The crisis projection is a second surface for the same verdict, and dropping the
    // caveat there would undo the previous assertion one file away.
    const memory = routeSrc('marketingMemory.ts');
    expect(memory).toMatch(/extractionCaveat: gate\.extractionCaveat/);
    expect(memory).toMatch(/assetsExtracted: gate\.assetsExtracted/);
  });
});
