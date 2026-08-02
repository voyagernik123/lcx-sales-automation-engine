import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGAGEMENT_STATUSES, isTerminalEngagementStatus } from '@lcx/shared';
import { REQUIRES_CONFLICT_CLEARANCE } from '../service.js';
import { GPS_ACTIONS } from '../actions.js';

/**
 * THE FOUR PROPERTIES THAT MAKE THIS COMPARTMENT SAFE TO POINT AT A CLIENT.
 *
 *  1. ATTRIBUTION comes from the authenticated principal, never from the request
 *     body. On a conflict check that is the difference between a compliance record
 *     and a claim about who decided.
 *  2. SQL IS PARAMETERISED, with no request-derived value ever reaching the
 *     statement text.
 *  3. MARGIN IS DERIVED, NEVER STORED — and never leaks into the client-facing
 *     half of a proposal.
 *  4. NOTHING REACHES A CLIENT WITHOUT A RECORDED CONFLICT POSITION.
 *
 * Where these can be tested behaviourally they are. Where they cannot — the
 * database-touching paths need a live Postgres that CI does not provide for this
 * compartment — they are asserted at source level, which is still a ratchet: it
 * fails when someone later removes the property, which is the actual risk.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const read = (rel: string) => strip(readFileSync(resolve(SRC, rel), 'utf8'));
const routes = read('routes/gps.ts');
const service = read('gps/service.ts');

describe('attribution comes from the session, never the request body', () => {
  it('the conflict check names the authenticated principal', () => {
    // Verified by reading the call site rather than the whole handler: the handler
    // validates and returns early several times, so a naive slice to the first
    // `c.json` stops before the attribution being asserted about. (The marketing
    // ratchet documents the same trap at its line 108.)
    const handler = routes.slice(routes.indexOf("gpsRoutes.post('/engagements/:id/conflict-check'"));
    const call = handler.slice(0, handler.indexOf('recordConflictCheck('));
    expect(call).toContain("c.get('operator')");
    expect(call).not.toMatch(/body\.\s*decided_?[Bb]y/);
  });

  it('the proposal names the authenticated principal', () => {
    const handler = routes.slice(routes.indexOf("gpsRoutes.post('/engagements/:id/proposal'"));
    const call = handler.slice(0, handler.indexOf('issueProposal('));
    expect(call).toContain("c.get('operator')");
    expect(call).not.toMatch(/body\.\s*issued_?[Bb]y/);
  });

  it('no handler anywhere reads an attribution field off the body', () => {
    expect(routes).not.toMatch(/body\.(decidedBy|issuedBy|approvedBy|operator|actor|memberId)\b/);
  });

  /**
   * The conflict check demands `approver`, and that is a machine-key exclusion as
   * much as a role gate.
   *
   * `access/entitlements.ts:39` `machineMap()` loops `WORKSPACE_IDS` granting
   * `operate`, so the shared `OPERATOR_API_KEY` now holds `gps` — plan §1.5 calls
   * this out as "isolation from the shared machine key: ABSENT". That key resolves
   * to `{ id: 'operator', role: 'operator' }` (`middleware/auth.ts:58`) while the
   * desk email path resolves the roster member's real role (`auth.ts:73`). So
   * `requireApprover` on this one route means no cron job, integration or script
   * can author a compliance decision, which is what `0047_gps.sql:278` means by
   * "a named human, never a service account".
   */
  it('the conflict check is approver-only, so a machine key cannot author one', () => {
    const line = routes.split('\n').find((l) => l.includes("'/engagements/:id/conflict-check'"));
    expect(line).toBeDefined();
    expect(line, 'the conflict check must be approver-gated').toContain('requireApprover');
  });

  it('demands the disclosure WORDING when the decision is a disclosure', () => {
    // The whole value of the row is the text the client was actually given on the
    // day (0047_gps.sql:288). A `cleared_with_disclosure` with no wording is an
    // empty gesture, so it is a 400 — and it is checked before the migration probe.
    const handler = routes.slice(routes.indexOf("gpsRoutes.post('/engagements/:id/conflict-check'"));
    const body = handler.slice(0, handler.indexOf('isMigrated('));
    expect(body).toContain('cleared_with_disclosure');
    expect(body).toContain('disclosureTextUsed');
    expect(body).toContain('checkPerformed');
  });
});

describe('SQL is parameterised, and no request value reaches the statement text', () => {
  /**
   * Every `${...}` in the service file, innermost-first so a nested template
   * (`listEngagements` composes its WHERE clause from one) is still visible.
   */
  const interpolations = [...service.matchAll(/\$\{([^{}]*)\}/g)].map((m) => m[1].trim());

  it('finds the interpolations at all', () => {
    // Guard against the regex silently matching nothing, which would make the
    // assertions below pass vacuously forever.
    expect(interpolations.length).toBeGreaterThan(5);
  });

  it('never interpolates a caller-supplied value', () => {
    for (const expr of interpolations) {
      expect(
        expr,
        `"${expr}" interpolates caller data into a string. Every value must be bound ` +
          'as a $n parameter — RT-A made that a standing rule, and these rows are a ' +
          "third party's commercial terms.",
      ).not.toMatch(/\b(input|body|opts|req|filter)\s*\./);
    }
  });

  /**
   * The ONLY expressions permitted to build SQL text. Each is a compile-time
   * constant or a count of already-bound parameters — never a value.
   */
  it('builds SQL text only from constants and placeholder indices', () => {
    const ALLOWED = new Set([
      'CLIENT_COLS', 'ENGAGEMENT_COLS', 'CONFLICT_COLS', 'TERMINAL_SQL_LIST',
      'params.length', "where.join(' AND ')",
    ]);
    const sqlish = interpolations.filter((e) => /COLS|SQL_LIST|params|where/.test(e));
    for (const expr of sqlish) {
      expect(ALLOWED.has(expr), `"${expr}" builds SQL text and is not on the allow-list`)
        .toBe(true);
    }
    // And the constants really are constants, not reassigned later.
    for (const name of ['ENGAGEMENT_COLS', 'CLIENT_COLS', 'CONFLICT_COLS', 'TERMINAL_SQL_LIST']) {
      expect(service).toMatch(new RegExp(`const ${name} = \``));
    }
  });

  it('concatenates no strings at all in the data layer', () => {
    // Crude on purpose: the cheapest reliable way to keep `'... ' + value` out of
    // a file whose every statement is a query.
    expect(service).not.toMatch(/['"]\s*\+\s*\w/);
  });

  it('reads every money column through the bigint normaliser', () => {
    // `pg` returns bigint as a STRING. `"1200000" + 0` is "12000000" — a quote a
    // hundred times too large, silently. One normaliser, used everywhere.
    const mapper = service.slice(
      service.indexOf('function toEngagement'),
      service.indexOf('interface ConflictRow'),
    );
    for (const field of ['price_cents', 'vendor_cost_cents', 'deposit_required_cents']) {
      expect(mapper).toMatch(new RegExp(`cents\\(r\\.${field}\\)`));
    }
  });
});

describe('margin is derived, never stored, and never client-facing', () => {
  it('writes no margin column', () => {
    // There is no margin column in 47 migrations by design (0047_gps.sql:163):
    // a stored margin goes stale the first time someone edits a price.
    const statements = service.match(/(INSERT INTO|UPDATE) gps_\w+[\s\S]{0,600}/g) ?? [];
    expect(statements.length).toBeGreaterThan(2);
    for (const s of statements) {
      expect(s, 'a write statement mentions margin — margin must stay derived').not.toMatch(/margin/i);
    }
  });

  it('keeps vendor cost and margin out of the client-facing half of a proposal', () => {
    // Structural, not conventional: if the proposal were one flat object, the first
    // web surface in a hurry would render what we pay our partner on a page a
    // client is reading, and nobody would notice until a client did.
    const marks = [...service.matchAll(/clientFacing:\s*\{/g)].map((m) => m.index ?? 0);
    expect(marks.length, 'the proposal must have a clientFacing half').toBeGreaterThanOrEqual(2);
    for (const start of marks) {
      const region = service.slice(start, service.indexOf('internal:', start));
      expect(region.length).toBeGreaterThan(20);
      expect(region, 'vendor cost leaked into the client-facing proposal')
        .not.toMatch(/vendorCost/i);
      expect(region, 'margin leaked into the client-facing proposal').not.toMatch(/margin/i);
    }
  });

  it('totals money per currency and never across currencies', () => {
    // `currency` is per engagement (0047_gps.sql:172) because a partner may invoice
    // EUR against a USD price. There is no FX source in this repo; one confident
    // wrong total is worse than several honest ones.
    const sums = service.match(/sum\(price_cents\)[\s\S]{0,300}?GROUP BY currency/g) ?? [];
    expect(sums.length).toBeGreaterThanOrEqual(2);
    expect(service).not.toMatch(/totalPriceCents|pipelineCents|grandTotal/);
  });
});

describe('nothing reaches a client without a recorded conflict position', () => {
  it('gates every status from `proposed` onward', () => {
    for (const s of ['proposed', 'accepted', 'deposit_paid', 'in_delivery', 'delivered', 'invoiced', 'collected'] as const) {
      expect(REQUIRES_CONFLICT_CLEARANCE, `${s} must require conflict clearance`).toContain(s);
    }
  });

  it('does NOT gate the internal statuses or the two exits', () => {
    // You must always be able to walk away from an engagement: requiring a
    // compliance artifact in order to ABANDON one is an incentive to leave it open.
    for (const s of ['draft', 'conflict_pending', 'closed_lost', 'cancelled'] as const) {
      expect(REQUIRES_CONFLICT_CLEARANCE, `${s} must not require clearance`).not.toContain(s);
    }
  });

  it('derives the gate from the shared lifecycle, so a new status cannot slip past it', () => {
    // The failure mode is a tenth status added to ENGAGEMENT_STATUSES in shared and
    // forgotten here. Derivation means it is gated by default.
    expect(service).toContain('ENGAGEMENT_STATUSES.filter');
    const gated = new Set<string>(REQUIRES_CONFLICT_CLEARANCE);
    const ungated = ENGAGEMENT_STATUSES.filter((s) => !gated.has(s));
    expect(ungated).toEqual(['draft', 'conflict_pending', 'closed_lost', 'cancelled']);
  });

  it('creates engagements in conflict_pending, not draft', () => {
    // So a missing check is visible in a list view from the moment the engagement
    // exists, rather than discoverable in an audit (0047_gps.sql:175).
    const fn = service.slice(service.indexOf('export async function createEngagement'));
    const insert = fn.slice(0, fn.indexOf('RETURNING'));
    expect(insert).toContain("'conflict_pending'");
  });

  it('parks the engagement in conflict_pending when it refuses, rather than only replying', () => {
    // A refusal that leaves no artifact is a warning, not a control.
    const fn = service.slice(service.indexOf('export async function setEngagementStatus'));
    const gate = fn.slice(0, fn.indexOf('conflict_check_declined'));
    expect(gate).toMatch(/SET status = 'conflict_pending'/);
    expect(routes).toContain('CONFLICT_CHECK_MISSING');
  });

  it('routes the proposal through the SAME gate as a manual status change', () => {
    // Two paths to `proposed` would mean two chances for one of them to be laxer.
    // Sliced to the point the document is assembled, not to the first `return {` —
    // the function refuses `not_found` and `no_price` on one line each, so the
    // naive slice ended before the status move it is asserting about.
    const fn = service.slice(service.indexOf('export async function issueProposal'));
    expect(fn.slice(0, fn.indexOf('proposal: {'))).toContain('setEngagementStatus(');
  });

  it('treats terminal statuses as terminal', () => {
    const fn = service.slice(service.indexOf('export async function setEngagementStatus'));
    expect(fn).toContain('isTerminalEngagementStatus(');
    // The shared helper is the single definition of "over".
    expect(ENGAGEMENT_STATUSES.filter(isTerminalEngagementStatus))
      .toEqual(['collected', 'closed_lost', 'cancelled']);
  });

  it('refuses to replace a recorded conflict check without an explicit amend', () => {
    // `engagement_id` is UNIQUE (0047_gps.sql:263) and the table is append-correct.
    // A default upsert would silently lose the disclosure a client was given.
    const fn = service.slice(service.indexOf('export async function recordConflictCheck'));
    expect(fn).toContain('already_recorded');
    expect(fn).toContain('input.amend');
    expect(fn).not.toMatch(/ON CONFLICT[\s\S]{0,40}DO UPDATE/);
  });

  it('derives the check\'s client from the engagement, not from the body', () => {
    // A body-supplied client_id would let the check and the engagement disagree
    // about whose conflict position was assessed.
    const fn = service.slice(service.indexOf('export async function recordConflictCheck'));
    expect(fn).toMatch(/SELECT id, client_id, status FROM gps_engagement/);
    expect(fn).toContain('row.client_id');
    expect(routes).not.toMatch(/body\.clientId[\s\S]{0,200}recordConflictCheck/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE GATES ARE ON THE WRITE PATHS, NOT BESIDE THEM                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `gateService` existed from Phase 9 and was called from six places, every one a
 * READ: the grid, the wall, the disclosure view, and an advisory
 * `POST /conflict/quote-gate` with no caller. `POST /quote` took no jurisdiction
 * argument at all; `POST /engagements` and both paths to `proposed` never consulted
 * it. So a `prohibited` position refused on a screen and permitted every act the
 * screen was describing — and `0050_gps_perimeter.sql:338` told an auditor reading
 * `\d+` that "the system enforces it".
 *
 * ── THIS BLOCK USED TO BE THE SAME KIND OF LIE, ONE LEVEL UP ─────────────────
 * It was titled "the perimeter is consulted before every GPS write" and asserted
 * FOUR paths. The compartment had seventeen route writes and five actions, so an
 * auditor reading the test name learned something false from a suite that was
 * green — and the six delivery writers, `POST /loop/outcome`, the four origination
 * writers and `gps_engagement_accept` (client acceptance: the act that makes work
 * invoiceable) were all outside it. The enumeration below is the fix: EVERY write
 * in the compartment is listed, each one either CONSULTED or an argued EXEMPTION, and
 * the list is asserted EXHAUSTIVE against the source. A write path added without a
 * decision recorded here turns this suite red, which is the only property that makes
 * the block's title true.
 *
 * ── AND THE BLOCK CHANGED MEANING AGAIN ON 2026-08-02 ────────────────────────
 * The owner made the gate ADVISORY where the perimeter is empty: with no position
 * entered anywhere, it refused every quote in every jurisdiction, so a refusal whose
 * code reports the ABSENCE of a position now lets the write proceed and is WRITTEN
 * DOWN instead. So this block no longer asserts "these paths refuse" — that would be
 * the third version of the same lie. It asserts what is now true and is the property
 * worth ratcheting: every write in the compartment either CONSULTS the perimeter and
 * records its verdict, or carries an argued exemption; a prohibition and an unreadable
 * perimeter still refuse; and the pass is never silent.
 *
 * These read source text because the installations are Hono mounts and a pool-backed
 * gate, neither of which this database-free suite can execute. The behavioural half
 * lives in `proposalGuards.test.ts`, which runs the real engines against a stub pool.
 */
describe('the perimeter is consulted on the enumerated GPS writes, and the enumeration is exhaustive', () => {
  const handler = (path: string): string => {
    const at = routes.indexOf(`gpsRoutes.post('${path}'`);
    expect(at, `no POST ${path} in routes/gps.ts`).toBeGreaterThan(-1);
    const rest = routes.slice(at);
    const next = rest.slice(1).search(/gpsRoutes\.(get|post|patch|put|delete)\(/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  };

  it('POST /quote gates on a jurisdiction it did not used to take at all', () => {
    const h = handler('/quote');
    expect(h).toContain('perimeterClearanceFor(');
    // The jurisdiction comes from the client ROW when a clientId is given. A caller
    // who could override it could name a permitted one.
    expect(h).toContain('clientJurisdiction(');
    expect(h, 'a quote with no jurisdiction must be refused, not gated against nothing')
      .toMatch(/clientId or jurisdiction/);
  });

  it('POST /engagements gates before the INSERT, on the client row', () => {
    const h = handler('/engagements');
    expect(h).toContain('perimeterClearanceFor(');
    expect(h.indexOf('perimeterClearanceFor(')).toBeLessThan(h.indexOf('createEngagement('));
    expect(h).toContain('clientJurisdiction(');
  });

  it('POST /engagements/:id/proposal carries BOTH guards as middleware', () => {
    const mount = routes.match(/gpsRoutes\.post\('\/engagements\/:id\/proposal'[^\n]*/)?.[0] ?? '';
    expect(mount).toContain('requirePerimeterClearance');
    expect(mount).toContain('requireUnderwritingClearance');
    // In FRONT of the handler: `issueProposal` moves the status before it assembles
    // anything, so a check inside the handler would have to be textually first.
    expect(mount.indexOf('requirePerimeterClearance')).toBeLessThan(mount.indexOf('async (c)'));
  });

  /* ── THE LEDGER OF WRITES, AND THE PROOF THAT IT IS COMPLETE ─────────────── */

  const ROUTERS = {
    'routes/gps.ts': ['gpsRoutes', routes],
    'routes/gpsDelivery.ts': ['gpsDeliveryRoutes', read('routes/gpsDelivery.ts')],
    'routes/gpsLoop.ts': ['gpsLoopRoutes', read('routes/gpsLoop.ts')],
    'routes/gpsOrigination.ts': ['gpsOriginationRoutes', read('routes/gpsOrigination.ts')],
  } as const satisfies Record<string, readonly [string, string]>;

  /** The perimeter's entry points. A consulted write must name one of them. */
  const GUARD_CALLS = [
    'perimeterClearanceFor(',
    'requirePerimeterClearance',
    'assertPerimeterCleared(',
    'guardEngagementPerimeter(',
    'guardDeliverablePerimeter(',
  ] as const;

  /**
   * CONSULTED, not GUARDED. The rename is the honest one: since the advisory
   * decision, reaching one of these entry points means the perimeter is asked and its
   * answer is recorded — it does not mean the act is refused when the answer is bad.
   * What it still means, and what these tests pin, is that no write in the compartment
   * reaches a client without the perimeter having been asked and answered on the record.
   */
  const CONSULTED = { consulted: true } as const;
  const exempt = (why: string) => ({ consulted: false, why }) as const;
  type Decision = typeof CONSULTED | ReturnType<typeof exempt>;

  /**
   * A GATED ENGAGEMENT WAS CLEARED AT CREATION AND AGAIN AT ISSUE, so the question
   * for each write below is not "is this GPS" but "would a jurisdictional refusal
   * genuinely apply to THIS act". Three answers recur:
   *   - it prices, opens, issues, or makes work invoiceable → CONSULTED;
   *   - it records what already happened, or records the refusal itself → exempt,
   *     because a gate there suppresses a record instead of preventing an act;
   *   - it has no honest jurisdiction to read (no `gps_client` row, or only a
   *     caller-typed string) → exempt, because a gate reading its verdict from the
   *     request is theatre.
   */
  const WRITES: Record<keyof typeof ROUTERS, Record<string, Decision>> = {
    'routes/gps.ts': {
      'POST /quote': CONSULTED,
      'POST /clients': exempt(
        'Creates the very row the perimeter reads a jurisdiction FROM. Gating it would mean gating on the'
        + ' body field being stored, and refusing to write down who a prospect is prevents no sale.',
      ),
      'POST /engagements': CONSULTED,
      'POST /engagements/:id/conflict-check': exempt(
        'This IS the compliance record, approver-only. A declined or disclosure-bearing position must be'
        + ' recordable in every jurisdiction — most of all a refused one — so a perimeter gate here would'
        + ' remove the only way to write the refusal down.',
      ),
      'POST /engagements/:id/proposal': CONSULTED,
      'POST /engagements/:id/status': exempt(
        'MANUAL_ENGAGEMENT_TARGETS excludes proposed and accepted, so every status it can reach is either'
        + ' downstream of an acceptance the perimeter gated, a bookkeeping fact about cash already received,'
        + ' or a withdrawal (cancelled/closed_lost). Refusing a withdrawal on jurisdictional grounds is the'
        + ' inverse of the control.',
      ),
    },
    'routes/gpsDelivery.ts': {
      'POST /engagements/:id/milestones/:key/state': exempt(
        'Internal delivery record on an already-cleared engagement: no money moves and no client is told'
        + ' anything. The client-facing event downstream of it is acceptance, which is consulted.',
      ),
      'POST /engagements/:id/deliverables': exempt(
        'Declares what the client will receive — an internal plan row, not an issue to the client. The'
        + ' commercial event on it is acceptance, which is consulted.',
      ),
      'POST /engagements/:id/evidence': exempt(
        'Records that LCX needs an input, on the desk chase list. Nothing is sent, fetched or received —'
        + ' there is no intake path in this compartment at all.',
      ),
      'POST /evidence/:id/status': exempt(
        'Settles a chase-list row. Recording that an input arrived or lapsed is a record of the past, and'
        + ' refusing it would only hide the state of the engagement.',
      ),
      'POST /deliverables/:id/review': exempt(
        'The LCX-internal quality sign-off, approver-only. It is the PRECONDITION of acceptance, and'
        + ' acceptance is where the perimeter stands; gating both would refuse twice for one act.',
      ),
      'POST /deliverables/:id/accept': CONSULTED,
    },
    'routes/gpsLoop.ts': {
      'POST /outcome': CONSULTED,
    },
    'routes/gpsOrigination.ts': {
      'POST /origination/targets': exempt(
        'A target may have no gps_client row at all, and its jurisdiction is free text an operator typed'
        + ' into the request body — nothing parses it. A gate here would read its verdict from the caller,'
        + ' and would also refuse to record that a prospect sits in a prohibited jurisdiction.',
      ),
      'POST /origination/:targetId/facts': exempt(
        'Research about a prospect, evidence-graded. Same two reasons as the target write: no client row to'
        + ' read a jurisdiction from, and refusing research is how a target gets called without one.',
      ),
      'POST /origination/:targetId/why-now': exempt(
        'A dated claim about a prospect deadline. Pre-engagement research, no client row, nothing sold.',
      ),
      'POST /origination/:targetId/opening': exempt(
        'Generates and stores draft outreach text. Nothing is sent from this compartment, and the priced'
        + ' act it may lead to is POST /quote, which is consulted on the client row.',
      ),
    },
  };

  const mountRe = (router: string, methods: string) =>
    new RegExp(`${router}\\.(${methods})\\('([^']+)'`, 'g');

  /** Text from one mount to the next, so an assertion cannot read a neighbour's guard. */
  const mountBody = (router: string, src: string, key: string): string => {
    const [method, path] = key.split(' ');
    const at = src.indexOf(`${router}.${method.toLowerCase()}('${path}'`);
    expect(at, `no ${key} mount on ${router}`).toBeGreaterThan(-1);
    const rest = src.slice(at);
    const next = rest.slice(1).search(mountRe(router, 'get|post|patch|put|delete'));
    return next === -1 ? rest : rest.slice(0, next + 1);
  };

  for (const [file, [router, src]] of Object.entries(ROUTERS)) {
    it(`${file}: every write is enumerated and every enumerated write exists`, () => {
      const found = [...src.matchAll(mountRe(router, 'post|patch|put|delete'))]
        .map(([, m, p]) => `${m.toUpperCase()} ${p}`)
        .sort();
      // Set equality in BOTH directions: a new write turns this red until someone
      // records whether the perimeter applies to it, and a decision about a write
      // that no longer exists cannot rot here unnoticed.
      expect(found).toEqual(Object.keys(WRITES[file as keyof typeof ROUTERS]).sort());
    });

    it(`${file}: every write marked CONSULTED reaches a perimeter entry point`, () => {
      for (const [key, d] of Object.entries(WRITES[file as keyof typeof ROUTERS])) {
        if (!d.consulted) continue;
        const body = mountBody(router, src, key);
        expect(
          GUARD_CALLS.some((call) => body.includes(call)),
          `${file} ${key} is enumerated CONSULTED but names no perimeter entry point`,
        ).toBe(true);
      }
    });
  }

  it('every exemption is argued, not merely asserted', () => {
    for (const [file, table] of Object.entries(WRITES)) {
      for (const [key, d] of Object.entries(table)) {
        if (d.consulted) continue;
        // An exemption is a decision someone has to be able to disagree with. A bare
        // "internal" would let the next reader re-derive nothing.
        expect(d.why.length, `${file} ${key} exemption is too thin to review`).toBeGreaterThan(80);
      }
    }
  });

  /**
   * THE ACTION HALF. `/v1/actions/:id/invoke` sits behind `requireOperator` and no
   * GPS router middleware, so an action executor is a door beside every route guard —
   * measured once already on `gps_proposal_issue`.
   */
  const actionsSrc = read('gps/actions.ts');

  const ACTIONS: Record<string, Decision> = {
    gps_conflict_declare: exempt(
      'Records the conflict position itself and cancels the engagement on a decline. Approver-only, and a'
      + ' refusal must be recordable in every jurisdiction, so a gate here would suppress the refusal.',
    ),
    gps_proposal_issue: CONSULTED,
    gps_discount_approve: exempt(
      'Writes no row — auditWrites is empty and the authorisation lives in object_actions. The price it'
      + ' authorises can only be issued through gps_proposal_issue, which is consulted.',
    ),
    gps_engagement_accept: CONSULTED,
    gps_status_change: exempt(
      'Cannot reach proposed or accepted. Its reachable targets are downstream of a gated acceptance,'
      + ' bookkeeping about cash already received, or a withdrawal — and refusing a withdrawal on'
      + ' jurisdictional grounds is the inverse of the control.',
    ),
  };

  it('every GPS action is enumerated, and the consulted ones call assertPerimeterCleared', () => {
    expect(GPS_ACTIONS.map((a) => a.id).sort()).toEqual(Object.keys(ACTIONS).sort());
    for (const [id, d] of Object.entries(ACTIONS)) {
      if (!d.consulted) continue;
      const at = actionsSrc.indexOf(`const ${id}: GpsAction`);
      expect(at, `no declaration for ${id}`).toBeGreaterThan(-1);
      const rest = actionsSrc.slice(at);
      const next = rest.slice(1).search(/\nconst gps_|\nexport const GPS_ACTIONS/);
      const body = next === -1 ? rest : rest.slice(0, next + 1);
      expect(body, `${id} is enumerated CONSULTED but never calls the perimeter`)
        .toContain('assertPerimeterCleared(');
      // Attribution for the refusal is the principal the registry passed, never a param.
      expect(body).toMatch(/assertPerimeterCleared\(pool, subjectId, \{\s*evaluatedBy: actor,/);
    }
  });

  it('no route takes an override that could clear a perimeter refusal', () => {
    for (const word of ['force', 'acceptRisk', 'skipPerimeter', 'assumePermitted', 'founderApproved']) {
      expect(routes, word).not.toContain(word);
    }
  });

  /* ── CONSULTED MEANS RECORDED. THE ADVISORY PASS IS NOT SILENT ────────────── */

  /**
   * The advisory decision put one new failure mode into this compartment: a gate that
   * runs, refuses, and lets the act through leaves NO trace unless something writes
   * one — and a gate whose refusals are discarded is indistinguishable from a deleted
   * gate. Everything in this block is that property, plus the two refusals that
   * survive the decision (a recorded prohibition, and a perimeter nobody could read).
   */
  describe('the verdict is recorded rather than discarded, and the pass funnels through one place', () => {
    const guard = read('gps/perimeterGuard.ts');

    it('writes the refusal it did not enforce to the audit log, parameterised', () => {
      expect(guard).toContain('INSERT INTO audit_log');
      expect(guard).toContain("PERIMETER_ADVISORY_ACTION = 'gps_perimeter.advisory_pass'");
      // Same standing rule as the data layer: no caller value in the statement text.
      const insert = guard.slice(guard.indexOf('INSERT INTO audit_log'));
      expect(insert.slice(0, insert.indexOf(');'))).not.toMatch(/\$\{/);
    });

    it('records the four things a refusal is unanswerable without', () => {
      const fn = guard.slice(guard.indexOf('async function recordAdvisoryPass'));
      const body = fn.slice(0, fn.indexOf('return true;'));
      for (const field of ['gateCode', 'gateReason', 'jurisdictionInput', 'offerKey', 'evaluatedBy']) {
        expect(body, `the advisory record omits ${field}`).toContain(field);
      }
      // Attribution is the session's, exactly as everywhere else in this compartment.
      expect(body).toContain('input.evaluatedBy');
      expect(body).not.toMatch(/body\./);
    });

    it('REFUSES when the record cannot be written — an unrecorded pass is no gate', () => {
      expect(guard).toContain('PERIMETER_ADVISORY_UNRECORDED');
      const branch = guard.slice(guard.indexOf('const recorded = await recordAdvisoryPass('));
      const upTo = branch.slice(0, branch.indexOf('console.warn'));
      expect(upTo).toContain('if (!recorded)');
      expect(upTo).toContain('allowed: false');
      expect(upTo).toContain('PERIMETER_ADVISORY_UNRECORDED');
    });

    it('decides whether to refuse from the disposition, never from a setting', () => {
      // The advisory branch keys off `disposition.blocked` — which `gateService`
      // derives from the record — and not off `allowed`, which is now a different
      // question. `!d.allowed && !d.disposition.blocked` is the whole switch.
      expect(guard).toContain('!d.allowed && !d.disposition.blocked');
      // NO FLAG, NO ENVIRONMENT VARIABLE, NOWHERE ON THIS PATH. This is the property
      // the owner asked for twice: nothing for a human to set, and nothing to unset.
      expect(guard, 'the perimeter path reads an environment variable').not.toContain('process.env');
      for (const word of ['ADVISORY_MODE', 'advisoryMode', 'featureFlag', 'GPS_ADVISORY']) {
        expect(guard, `${word} is a setting, and advisory mode must be derived`).not.toContain(word);
      }
    });

    it('funnels every entry point through the one function that records', () => {
      // Five entry points, one recorder. A second path to a pass would be a second
      // path to an UNRECORDED pass, which is the original defect wearing a new hat.
      const fn = (name: string) => {
        const at = guard.indexOf(`export async function ${name}`);
        expect(at, `no ${name} in perimeterGuard.ts`).toBeGreaterThan(-1);
        const rest = guard.slice(at);
        const next = rest.slice(1).search(/\nexport (async function|const|function)/);
        return next === -1 ? rest : rest.slice(0, next + 1);
      };
      expect(fn('guardEngagementPerimeter')).toContain('perimeterClearanceFor(');
      expect(fn('guardDeliverablePerimeter')).toContain('guardEngagementPerimeter(');
      expect(fn('assertPerimeterCleared')).toContain('guardEngagementPerimeter(');
      const middleware = guard.slice(guard.indexOf('export const requirePerimeterClearance'));
      expect(middleware).toContain('guardEngagementPerimeter(');
      // And only that one function may write the pass.
      expect(guard.match(/recordAdvisoryPass\(/g)?.length).toBe(2); // declaration + one call
    });

    /**
     * ══ THE STAMP REACHES THE ALLOWED ANSWER, NOT ONLY THE REFUSAL. ═══════════
     *
     * The half of the decision that is easiest to ship incompletely, and the half that
     * matters to a client. While every absent position refused, a success implied a
     * position existed — the refusal body carried the reason and the success carried
     * nothing, which was safe precisely because there were no successes without a
     * position. There are now: in production, EVERY success is one.
     *
     * So a caller that consults the perimeter and then answers 200 must put the three
     * flat stamp keys on that answer. Asserted by DISCOVERY over every file that
     * consults the perimeter at all, so a seventh caller written next month is covered
     * on the day it appears rather than when someone remembers this rule.
     *
     * `perimeterGuard.ts` itself is excluded: it DEFINES `perimeterStamp` and is where
     * the refusal bodies are built. The behavioural half — that the keys actually reach
     * the wire with the right values — is `routes/__tests__/gpsQuotePerimeter.test.ts`,
     * `proposalGuards.test.ts` and `acceptancePerimeter.test.ts`.
     */
    it('every caller that consults the perimeter stamps its ALLOWED answer too', () => {
      const CONSULTERS = [
        'routes/gps.ts',
        'routes/gpsDelivery.ts',
        'routes/gpsLoop.ts',
        'gps/actions.ts',
      ] as const;
      for (const rel of CONSULTERS) {
        const code = read(rel);
        // Non-vacuity: this file must actually consult the perimeter, or the assertion
        // below is a requirement placed on a file that has nothing to stamp.
        expect(
          /perimeterClearanceFor\(|guardEngagementPerimeter\(|guardDeliverablePerimeter\(|assertPerimeterCleared\(/.test(code),
          `${rel} no longer consults the perimeter at all — either the gate was removed from a `
            + 'client-facing write, or this list is stale',
        ).toBe(true);
        expect(
          code,
          `${rel} consults the perimeter but never spreads perimeterStamp(...) — so the act it `
            + 'permits comes back looking cleared. In production nothing has a legal position on '
            + 'file, so this is not an edge case: it is every quote, proposal, engagement, '
            + 'acceptance and recorded outcome the desk produces.',
        ).toMatch(/\.\.\.perimeterStamp\(/);
        expect(code, `${rel} does not import perimeterStamp`).toMatch(/perimeterStamp/);
      }
    });

    it('publishes the stamp on every clearance, refused or allowed', () => {
      for (const field of ['legalPositionOnFile', 'legalPositionGateCode', 'legalPositionNotice']) {
        expect(guard, `the clearance does not publish ${field}`).toContain(field);
      }
      // The refusal body and the action error both carry it, so a client-facing
      // surface cannot render either one without the sentence available to it.
      const refusalBody = guard.slice(guard.indexOf('export function perimeterRefusalBody'));
      expect(refusalBody.slice(0, refusalBody.indexOf('};'))).toContain('perimeterStamp(cl)');
      const assertFn = guard.slice(guard.indexOf('export async function assertPerimeterCleared'));
      expect(assertFn).toContain('perimeterStamp(cl)');
    });

    it('keeps the two refusals the advisory decision did not touch', () => {
      // A prohibition is a human saying no, and an unreadable perimeter is a check
      // that did not happen. Both still refuse; the shared engine decides the first
      // (`perimeterDisposition`) and this file the second.
      expect(guard).toContain('PERIMETER_UNAVAILABLE');
      expect(guard).toMatch(/PERIMETER_GATE_DISCIPLINE\s*=/);
      // The notice on the wire must describe what the gate ACTUALLY does now — the
      // previous text claimed a missing position refuses the act, which it no longer
      // does, and that string is published to every refused caller.
      const notice = guard.slice(guard.indexOf('PERIMETER_GATE_DISCIPLINE ='));
      const text = notice.slice(0, notice.indexOf(';'));
      expect(text).toMatch(/PROHIBITED/);
      expect(text).toMatch(/could not be read/);
      expect(text).toMatch(/no legal position on file/);
    });
  });
});

/**
 * The generic status setter. `gps/actions.ts` wrote down that this would happen —
 * "every gate in this file would be one `gps_status_change` call away from being
 * bypassed … and it would look like a convenience feature" — and kept the rule
 * private to itself while this route validated against all of ENGAGEMENT_STATUSES.
 */
describe('POST /engagements/:id/status cannot reach a gated status or skip an edge', () => {
  const h = routes.slice(routes.indexOf("gpsRoutes.post('/engagements/:id/status'"));

  it('refuses the two statuses the guards stand in front of', () => {
    expect(h).toContain('isGatedEngagementStatus(');
    expect(h.indexOf('isGatedEngagementStatus(')).toBeLessThan(h.indexOf('setEngagementStatus('));
  });

  it('enforces the lifecycle edges against the CURRENT row, not just the target', () => {
    expect(h).toContain('checkManualTransition(');
    expect(h).toContain('getEngagement(');
    expect(h.indexOf('checkManualTransition(')).toBeLessThan(h.indexOf('setEngagementStatus('));
  });

  it('reads the map from the shared package, so both write paths cannot drift', () => {
    // The whole fix is that the rule has ONE home. A local copy here would be the
    // original defect with an extra file.
    expect(routes).toMatch(/MANUAL_ENGAGEMENT_TARGETS|MANUAL_ENGAGEMENT_TRANSITIONS/);
    expect(routes, 'a private transition map has reappeared in the route file')
      .not.toMatch(/const\s+MANUAL_TRANSITIONS\s*[:=]/);
  });
});
