import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * `/v1/audit` WAS A SECOND DOOR INTO THE MARKET-ABUSE PERIMETER.
 *
 * `marketing/abuseRegister.ts` records three governed actions on subject type
 * `marketing_asset`, so `invokeAction` writes `entity='marketing_asset'` with
 * `entity_id=<asset symbol>`. `/v1/audit` is mounted under `governance`
 * (`machineAccess: true`) and was gated at `requireOperator` with no compartment
 * check, so `GET /v1/audit?entity=marketing_asset` returned:
 *
 *   - `action:marketing_embargo_enter` on `entity_id:SOL` — which states that LCX
 *     holds unpublished price-significant information about SOL. That is inside
 *     information, and MiCA Art 90(1) prohibits disclosing it onward.
 *   - `action:marketing_holdings_declare` — a named colleague's financial position,
 *     the subject of Art 91(3)(c) personal fines from EUR 700,000.
 *
 * The phase that found this could not reach `routes/audit.ts` and recorded it at
 * `marketing/abuseRegister.ts:1060` instead.
 *
 * WHY THIS IS NOT JUST THE GPS FIX AGAIN. GPS withholds `meta` and prints the row,
 * because a GPS engagement id is an opaque internal key. Marketing's subject is the
 * secret: withholding `meta` while printing `SOL` would close nothing. So `entity_id`
 * is withheld with it.
 *
 * ══ WHAT THIS FILE DOES AND DOES NOT VERIFY ══
 * These are SOURCE-LEVEL assertions over the text of `routes/audit.ts`, the same
 * technique as `auditGpsRedaction.test.ts` and for the same reason: the route is
 * drizzle over a real pool and the api suite is database-free. They prove the
 * mechanism is present and wired to the marketing capability — a per-row capability
 * check that hides the subject and the payload and keeps the actor. They do NOT
 * execute the route, so they cannot prove the emitted JSON for a given database row.
 * The name of every test below is scoped to that.
 */

const SRC = readFileSync(new URL('../audit.ts', import.meta.url), 'utf8');

/** The row mapper, sliced out so an assertion cannot pass on a docblock mention. */
const MAPPER = SRC.slice(SRC.indexOf('data: (rowsResult.rows'), SRC.indexOf('meta: {'));

describe('routes/audit.ts gates the marketing subject on the marketing capability', () => {
  it('reads the caller capability for marketing at view, not just requireOperator', () => {
    expect(SRC).toMatch(/capAtLeast\(\s*ents\.marketing\s*,\s*'view'\s*\)/);
    // requireOperator alone was the whole defect: every operator on every workspace
    // holds it, and `marketing` is machineAccess:true so the shared key holds the
    // compartment too. The capability read is what makes the gate mean anything.
    expect(SRC).toContain('loadEntitlements(');
  });

  it('selects marketing rows by entity prefix, matching what invokeAction writes', () => {
    // `subjectTypes: [MARKETING_ASSET_SUBJECT]` where MARKETING_ASSET_SUBJECT =
    // 'marketing_asset', and registry.ts writes entity from the subject type.
    expect(SRC).toMatch(/MARKETING_ENTITY_RE\s*=\s*\/\^marketing_\//);
  });

  it('withholds entity_id as well as meta in the mapper', () => {
    // The marketing-specific limb. If a later edit reverts entityId to r.entity_id
    // unconditionally, the asset symbol is public to every operator again.
    expect(MAPPER).toMatch(/entityId:\s*hideMarketing\s*\?\s*MARKETING_ENTITY_ID_WITHHELD/);
    expect(MAPPER).toContain('MARKETING_META_WITHHELD');
  });

  it('binds both withholdings to the same capability check', () => {
    // Two independent conditions could drift apart, leaving one field open.
    expect(SRC).toMatch(/hideMarketing\s*=\s*marketingRow\s*&&\s*!mayReadMarketing/);
  });

  it('replaces the symbol with a constant, not a digest', () => {
    // A stable hash would still let a reader without the compartment correlate rows
    // and count embargo decisions per asset, which is most of the disclosure.
    expect(SRC).toMatch(/MARKETING_ENTITY_ID_WITHHELD\s*=\s*'\[withheld:marketing\]'/);
  });

  it('keeps the actor, the action and the timestamp so the decision stays attributable', () => {
    // Deliberate, and the same judgement abuseRegister.ts:1060 reached from the other
    // side: an unattributable embargo decision is worse than a widely-readable one.
    for (const field of ['actor', 'action', 'createdAt']) {
      expect(MAPPER, `${field} was dropped along with the subject`).toContain(field);
    }
    // Dropping the rows entirely would destroy the trail rather than compartment it.
    expect(SRC).not.toMatch(/\.filter\([^)]*marketing/);
  });

  it('states why the field is withheld and what would clear it', () => {
    expect(SRC).toMatch(/holding the marketing compartment at view/);
    // A bare null is indistinguishable from "this action had no params".
    expect(SRC).not.toMatch(/entityId: hideMarketing \? null/);
    expect(SRC).toMatch(/withheld: true/);
  });

  it('cites the two rules that make the subject sensitive', () => {
    // The refusal a colleague reads should name the rule, per doctrine rule 1.
    expect(SRC).toContain('Art 90(1)');
    expect(SRC).toContain('Art 91(3)(c)');
  });

  it('tells the client whether the subjects were withheld at all', () => {
    // Without this a surface cannot tell "no marketing activity" from "marketing
    // activity I may not read".
    expect(SRC).toContain('marketingSubjectVisible');
  });

  it('loads the capabilities once per request, not once per row', () => {
    expect(SRC.indexOf('loadEntitlements(')).toBeLessThan(SRC.indexOf('data: (rowsResult.rows'));
  });

  it('leaves the GPS redaction intact', () => {
    // The two prefixes are disjoint and must not have been collapsed into one branch
    // that applies marketing's stricter rule to GPS or GPS's looser rule to marketing.
    expect(MAPPER).toMatch(/gpsRow && !mayReadGps \? GPS_META_WITHHELD : r\.meta/);
  });
});
