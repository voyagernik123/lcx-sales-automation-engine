import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGAGEMENT_STATUSES, isTerminalEngagementStatus } from '@lcx/shared';
import { REQUIRES_CONFLICT_CLEARANCE } from '../service.js';

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

const routes = strip(readFileSync(resolve(SRC, 'routes/gps.ts'), 'utf8'));
const service = strip(readFileSync(resolve(SRC, 'gps/service.ts'), 'utf8'));

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
