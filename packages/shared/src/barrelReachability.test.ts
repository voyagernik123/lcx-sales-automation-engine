import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as barrel from './index.js';
/*
 * TYPE-ONLY REACHABILITY IS CHECKED BY THE COMPILER, HERE.
 *
 * `import * as barrel` cannot see a type: `export type` and `interface` are erased, so a
 * missing type export is invisible to every runtime assertion below. These named type
 * imports are the ratchet for that half — if a barrel line is deleted, `npm run type-check`
 * fails on this line with TS2305 before any test runs. They are `import type`, so they add
 * nothing to the bundle and nothing to the runtime.
 */
import type {
  BearishLimb, DeclaredPosition, ExpiryBucket, HoldingsCellReading, HoldingsCellsResponse,
  HoldingsChainResponse, HoldingsDeclarationRow, HoldingsRegisterResponse,
  ShortPositionAnswer, ShortQuestionPolicy,
  EffortBasis, EffortTripleRow, GpsInputRefusal, GpsInputRefusalBody, GpsInputRefusalCode,
  GpsInputsDesk, InputRegisters, PartnerOption, PartnerOptionOrigin, PriceBandRow,
  PriceBandSource, RateCardRow,
} from './index.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  IS EVERY SYMBOL IN THE TWO NEW CONTRACT MODULES ACTUALLY REACHABLE BY NAME?
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `packages/shared/package.json` publishes exactly ONE entry point (`"."` → `src/index.ts`).
 * A symbol can therefore be exported from its own module, imported correctly by a route and
 * a page, type-check clean in `apps/web`, and still be invisible to `apps/api` — because a
 * deep relative specifier out of `apps/api/src` type-checks and then fails the EMIT build
 * with TS6059 (`not under rootDir`), which happens in Docker order, after the point where it
 * is cheap. That has already happened twice in this repository:
 *   · `abuseRegister.ts` imported eight types from `@lcx/shared` and got eight TS2305s,
 *     because `marketing/index.ts` was a hand-written name list covering `types.ts` only;
 *   · `marketingGates.ts` and `apps/web` produced 18 and 19 TS2305s on symbols that WERE
 *     exported from `contracts/gates.ts`, for want of one line in the same barrel.
 *
 * Both were one missing line, and in both cases the missing line was invisible until a build
 * in the right order failed. So the two lines added in this wave —
 * `marketing/index.ts → contracts/holdings.js` and `gps/index.ts → contracts/inputs.js` — are
 * checked rather than trusted.
 *
 * ══ WHY THE EXPECTATION IS PARSED FROM THE SOURCE ══
 * The list of names is read out of each contract file, not written out here. A hand-copied
 * list is a second place to forget, with the same failure mode as the name-list barrels this
 * test exists to defend against: add an export to `holdings.ts` and forget it here, and the
 * test still passes. Parsing means a new export is checked the moment it is written.
 *
 * ══ WHAT THIS DOES NOT CLAIM ══
 * Reachability, not correctness. It shows `@lcx/shared` can name these symbols; it says
 * nothing about what `bearishLimbOf` decides or what a refusal body contains. Those live in
 * the contract modules' own tests and in the route tests.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Every `export`ed name in a module, split into the ones that survive to runtime and the
 * ones the compiler erases.
 *
 * `export type` and `interface` are erased; `const`, `function`, `class` and `enum` are not.
 * Keeping them apart is what lets the runtime half assert PRESENCE while the compile half is
 * the `import type` block at the top of this file.
 */
function exportsOf(file: string): { values: string[]; types: string[] } {
  const src = readFileSync(resolve(HERE, file), 'utf8');
  const values: string[] = [];
  const types: string[] = [];
  const re = /^export\s+(type|interface|const|function|class|enum|abstract class)\s+([A-Za-z0-9_]+)/gm;
  for (const m of src.matchAll(re)) {
    (m[1] === 'type' || m[1] === 'interface' ? types : values).push(m[2]!);
  }
  return { values, types };
}

const HOLDINGS = exportsOf('marketing/contracts/holdings.ts');
const INPUTS = exportsOf('gps/contracts/inputs.ts');

describe('the root barrel republishes marketing/contracts/holdings.ts', () => {
  it('parses a non-empty export list, or every assertion below is vacuous', () => {
    // The standard way a source-parsing test dies quietly: the regex stops matching, the
    // list is empty, and an empty loop passes forever.
    expect(HOLDINGS.values.length).toBeGreaterThanOrEqual(10);
    expect(HOLDINGS.types.length).toBeGreaterThanOrEqual(5);
  });

  it('names every runtime export of the module', () => {
    const missing = HOLDINGS.values.filter((n) => !(n in barrel));
    expect(
      missing,
      'these symbols are exported from marketing/contracts/holdings.ts and invisible through '
      + '@lcx/shared. Add `export * from \'./contracts/holdings.js\';` to '
      + 'packages/shared/src/marketing/index.ts — inside the compartment barrel, never in '
      + 'src/index.ts.',
    ).toEqual([]);
  });

  it('publishes the derivations, not only the shapes', () => {
    /*
     * NAMED EXPLICITLY, because these four are the ones whose absence is silent and
     * expensive. A page that cannot import `bearishLimbOf` does not fail — it reimplements
     * it, and the reimplementation is where 'not_asked' quietly becomes "no short position".
     * The loop above would catch their absence too; this test says WHICH loss matters.
     */
    expect(typeof barrel.bearishLimbOf).toBe('function');
    expect(typeof barrel.cellBearishLimb).toBe('function');
    expect(typeof barrel.positionOf).toBe('function');
    expect(typeof barrel.expiryBucketOf).toBe('function');
    // And the two sentences a surface must show, so no screen writes its own wording.
    expect(barrel.SHORT_NOT_ASKED_IS_NOT_NO_SHORT).toContain('NOT ASKED');
    expect(barrel.NOT_DECLARED_IS_NOT_CLEAR).toContain('NOT DECLARED');
  });
});

describe('the root barrel republishes gps/contracts/inputs.ts', () => {
  it('parses a non-empty export list, or every assertion below is vacuous', () => {
    expect(INPUTS.values.length).toBeGreaterThanOrEqual(6);
    expect(INPUTS.types.length).toBeGreaterThanOrEqual(8);
  });

  it('names every runtime export of the module', () => {
    const missing = INPUTS.values.filter((n) => !(n in barrel));
    expect(
      missing,
      'these symbols are exported from gps/contracts/inputs.ts and invisible through '
      + '@lcx/shared. Add `export * from \'./contracts/inputs.js\';` to '
      + 'packages/shared/src/gps/index.ts.',
    ).toEqual([]);
  });

  it('publishes the currency rule and the contract predicate', () => {
    // `CURRENCY_CODE_RE` is the one `apps/api/src/routes/gpsInputs.ts` imports instead of
    // holding its own literal, so its reachability is load-bearing rather than tidy.
    expect(barrel.CURRENCY_CODE_RE).toBeInstanceOf(RegExp);
    expect(typeof barrel.deskContractDefects).toBe('function');
    expect(typeof barrel.isGpsInputRefusalCode).toBe('function');
  });
});

describe('neither barrel line collided with an existing name', () => {
  it('resolves each contract symbol to the contract module, not to a same-named neighbour', () => {
    /*
     * TWO `export *` PROVIDING ONE NAME IS A TS2308 AND THE BUILD SAYS SO — but a collision
     * resolved the WRONG way is silent: `@lcx/shared`'s `RefusalCode` already resolved to
     * GPS's union while a caller meant marketing's, and the error read as though the
     * marketing vocabulary were wrong (`src/index.ts:200`). So identity is asserted against
     * the modules themselves for a value from each side.
     */
    expect(HOLDINGS.values).toContain('SHORT_POSITION_ANSWERS');
    expect(INPUTS.values).toContain('CURRENCY_CODE_RE');
    expect(barrel.SHORT_POSITION_ANSWERS).toEqual(['holds_short', 'no_short', 'declined', 'not_asked']);
    expect(barrel.CURRENCY_CODE_RE.source).toBe('^[A-Za-z]{3}$');
  });

  it('keeps GPS\'s RefusalCode as the unqualified one, unchanged by either new line', () => {
    // The precedence decision at `src/index.ts:200-201` predates this wave and neither new
    // module publishes a bare `RefusalCode`. If one ever did, this is the assertion that
    // would notice the meaning of the unqualified name had moved.
    expect(HOLDINGS.values).not.toContain('RefusalCode');
    expect(HOLDINGS.types).not.toContain('RefusalCode');
    expect(INPUTS.values).not.toContain('RefusalCode');
    expect(INPUTS.types).not.toContain('RefusalCode');
  });
});

/*
 * The type imports are referenced so `noUnusedLocals` cannot ask for their deletion — which
 * would delete the compile-time half of this file's ratchet. One alias per imported type,
 * checked for assignability to itself; nothing here runs.
 */
export type _HoldingsTypesReachable = [
  BearishLimb, DeclaredPosition, ExpiryBucket, HoldingsCellReading, HoldingsCellsResponse,
  HoldingsChainResponse, HoldingsDeclarationRow, HoldingsRegisterResponse,
  ShortPositionAnswer, ShortQuestionPolicy,
];
export type _InputTypesReachable = [
  EffortBasis, EffortTripleRow, GpsInputRefusal, GpsInputRefusalBody, GpsInputRefusalCode,
  GpsInputsDesk, InputRegisters, PartnerOption, PartnerOptionOrigin, PriceBandRow,
  PriceBandSource, RateCardRow,
];
