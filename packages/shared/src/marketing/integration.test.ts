import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as barrel from './index.js';
import {
  REFUSAL_CODES,
  TTFS_BUDGET_MINUTES_BY_SEVERITY,
} from './index.js';
import { TTFS_BUDGET_MINUTES_BY_TIER } from './triage.js';
import { TRIAGE_ONLY_REFUSAL_CODES } from './triage.js';
import { CRISIS_ONLY_REFUSAL_CODES } from './crisis.js';
import { normaliseForMatch, type RefusalCode } from './types.js';
import { SOURCE_OBSERVATION_PROFILE, ownCorpusFrame } from './observation.js';
import { ABSENCE_REFUSAL_CODE, requiredElementsFor } from './regime.js';

/**
 * THE COMPARTMENT AS ONE THING — the defects that only existed between the lanes.
 *
 * Eleven modules were built in parallel against one shared vocabulary. Each is internally
 * exhaustively tested and each was, on its own, correct. What none of them could test is
 * the join, and the join is where the interesting failures were: fourteen names exported
 * twice, three refusal-code namespaces, two disagreeing budget ladders, and a barrel that
 * published a hand-written subset of one file out of twelve.
 *
 * This suite is deliberately structural. A behavioural test cannot see "the same rule is
 * defined in two files" — both definitions pass their own tests, which is precisely how
 * the situation survives review.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES = readdirSync(HERE).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');

/**
 * THE WIRE, which is a second directory the barrel must publish.
 *
 * `readdirSync(HERE)` is not recursive, so `contracts/` was invisible to this file: three
 * response-contract modules could land, be imported by both apps/api and apps/web, and be
 * absent from the barrel — which is the SAME defect the assertions below were written for,
 * one directory deeper. `@lcx/shared` publishes a single `"."` export, so a deep specifier
 * cannot be used as a workaround: a contract missing from the barrel is invisible to both
 * sides no matter what its own file says.
 */
const CONTRACTS = readdirSync(resolve(HERE, 'contracts'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');

describe('the barrel publishes the whole compartment, not a name list', () => {
  /**
   * THE DEFECT THIS REPLACES. `marketing/index.ts` was a hand-maintained list of names from
   * `types.ts` alone, and the eleven engine modules were reachable from nothing — which is
   * why `apps/api/src/marketing/abuseRegister.ts` failed with eight TS2305s on symbols that
   * WERE exported from their own module. The failure has no signal until an emit build in
   * Docker order fails, and by then it is expensive.
   */
  it('re-exports every module in the directory', () => {
    const src = readFileSync(resolve(HERE, 'index.ts'), 'utf8');
    for (const file of MODULES) {
      const spec = `./${file.replace(/\.ts$/, '.js')}`;
      expect(src, file).toContain(`export * from '${spec}'`);
    }
  });

  it('re-exports every response contract too', () => {
    // Non-vacuity: an empty contracts directory would make the loop pass for free, which
    // is how a directory-derived ratchet dies quietly.
    expect(CONTRACTS.length, 'no contract modules found — has the directory moved?')
      .toBeGreaterThanOrEqual(3);
    const src = readFileSync(resolve(HERE, 'index.ts'), 'utf8');
    for (const file of CONTRACTS) {
      const spec = `./contracts/${file.replace(/\.ts$/, '.js')}`;
      expect(
        src,
        `${file} declares response shapes both apps import and the barrel does not publish `
        + 'it. `@lcx/shared` has one entry point, so those names do not resolve at all.',
      ).toContain(`export * from '${spec}'`);
    }
  });

  /** A star export cannot drift from what it publishes; a name list can and did. */
  it('uses only star exports, so it cannot omit a symbol', () => {
    const src = readFileSync(resolve(HERE, 'index.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const exports = src.match(/^export .*$/gm) ?? [];
    // Engines plus contracts, and nothing else: an `export { x as y }` line here would be a
    // collision aliased in the barrel instead of resolved in the module that caused it,
    // which is the rule this file's header argues for at length.
    expect(exports.length).toBe(MODULES.length + CONTRACTS.length);
    for (const line of exports) {
      expect(line).toMatch(/^export \* from '\.\/(?:contracts\/)?[a-zA-Z]+\.js';$/);
    }
  });

  /** A sample from each lane, resolved through the barrel rather than through the module. */
  it('reaches every lane through @lcx/shared\'s marketing entry', () => {
    for (const name of [
      'classifyRegimes', 'art7Budget',            // regime
      'checkClaimSafety',                          // claim safety
      'assessAmplification', 'assessCorrection',   // adoption
      'derivePriority', 'gateOpinion',             // triage
      'findPrecedent', 'contradictionDebt',        // precedent
      'assessTimeToFirstStatement', 'ttfsBudget',  // crisis
      'gateDeskAct', 'assessAuthorityOrder',       // desk mode
      'observedRate', 'assertHonestPayload',       // observation
      'refusalCodeFrequency', 'timeToFirstStatement', // loop
      'normaliseForMatch',                         // the vocabulary
    ]) {
      expect(typeof (barrel as Record<string, unknown>)[name], name).toBe('function');
    }
  });
});

describe('ONE refusal-code namespace', () => {
  /**
   * `triage.ts` and `crisis.ts` each carried a private array widening `RefusalCode`
   * locally — 28 codes and 19. The consequence is not untidiness:
   * `loop.ts:refusalCodeFrequency` enumerates `REFUSAL_CODES` to report the gates that
   * have NEVER FIRED, which is the only honest read the desk has on whether its gates are
   * load-bearing or ornamental. Forty-seven gates were invisible to it.
   */
  it('holds every triage and crisis code inside the shared array', () => {
    const shared = new Set<string>(REFUSAL_CODES);
    for (const c of [...TRIAGE_ONLY_REFUSAL_CODES, ...CRISIS_ONLY_REFUSAL_CODES]) {
      expect(shared.has(c), c).toBe(true);
    }
  });

  /** One clock code, both rooms — it was listed in both private arrays before the fold. */
  it('does not split the suppression code between the two rooms', () => {
    expect(TRIAGE_ONLY_REFUSAL_CODES).toContain('TTFS_SUPPRESSION_UNREASONED');
    expect(CRISIS_ONLY_REFUSAL_CODES).not.toContain('TTFS_SUPPRESSION_UNREASONED');
  });

  /** The union and the array must agree, or the never-fired list is wrong in both directions. */
  it('keeps the union and the array in step, with no duplicates', () => {
    expect(new Set(REFUSAL_CODES).size).toBe(REFUSAL_CODES.length);
    const sample: RefusalCode = 'ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING';
    expect(REFUSAL_CODES).toContain(sample);
  });

  /**
   * The ratchet. No module may declare a string-literal refusal-code union of its own
   * again: the two survivors are typed `readonly RefusalCode[]`, which makes an unshared
   * string a compile error. This asserts the annotation is still there, because deleting it
   * is how the namespace splits again.
   */
  it('types the surviving arrays against the shared union', () => {
    for (const [file, name] of [['triage.ts', 'TRIAGE_ONLY_REFUSAL_CODES'], ['crisis.ts', 'CRISIS_ONLY_REFUSAL_CODES']] as const) {
      const src = readFileSync(resolve(HERE, file), 'utf8');
      expect(src, file).toContain(`export const ${name}: readonly RefusalCode[] =`);
    }
  });
});

describe('no two files defining the same rule differently', () => {
  /**
   * `normaliseForMatch` was byte-identical in `adoption.ts` and `precedent.ts`, with a
   * comment in one arguing the duplication was deliberate. It decides what "the same words"
   * means, so `adoption.ts:sharedWordRun` (which degrades a claimed correction to an
   * adoption on a six-word overlap) and the precedent index's contradiction detection
   * depend on it agreeing with itself. Split, the desk could be told a reply is a
   * correction while the precedent index read the same text as a restatement.
   */
  it('declares the lexical normaliser exactly once, in the vocabulary', () => {
    const declarers = MODULES.filter((f) =>
      /^export function normaliseForMatch/m.test(readFileSync(resolve(HERE, f), 'utf8')));
    expect(declarers).toEqual(['types.ts']);
    expect(normaliseForMatch('Fees.Now')).toBe(' fees now ');
  });

  /** Same story, same fix: one suppression record for one desk. */
  it('declares ClockSuppression exactly once', () => {
    const declarers = MODULES.filter((f) =>
      /^export interface ClockSuppression/m.test(readFileSync(resolve(HERE, f), 'utf8')));
    expect(declarers).toEqual(['types.ts']);
  });

  /**
   * The two time-to-first-statement ladders were BOTH called `TTFS_BUDGET_MINUTES` and
   * DISAGREED at `medium` — 120 against 240. They are not reconciled, because they are not
   * the same ladder: one is keyed on the severity of an incident that happened to LCX, the
   * other on the triage tier of somebody else's claim. Averaging them would have invented
   * an agreement between "our exchange is down" and "an account with 40 followers is wrong
   * about us". The names now carry the key space so a caller has to say which.
   */
  it('keeps the two budget ladders distinct, and named for their key space', () => {
    expect(TTFS_BUDGET_MINUTES_BY_SEVERITY.medium).toBe(120);
    expect(TTFS_BUDGET_MINUTES_BY_TIER.medium).toBe(240);
    // `low` has no clock in triage and always has one in a crisis. That asymmetry is the
    // clearest proof they are different ladders.
    expect(TTFS_BUDGET_MINUTES_BY_TIER.low).toBeNull();
    expect(TTFS_BUDGET_MINUTES_BY_SEVERITY.low).toBeGreaterThan(0);
    for (const f of MODULES) {
      expect(readFileSync(resolve(HERE, f), 'utf8'), f).not.toMatch(/export const TTFS_BUDGET_MINUTES\s*:/);
    }
  });

  /**
   * Ten process metrics were implemented twice, in `loop.ts` and `observation.ts`, and the
   * duplicates disagreed on absence conventions and on medians. `loop.ts` (M8) keeps the
   * arithmetic, per the plan; `observation.ts` keeps the frame, the `Figure` and the
   * definitions table. The computations were DELETED here rather than reconciled — a
   * second implementation of a threshold is how a suppressed rate becomes an expressed one.
   */
  it('computes each process metric in exactly one module', () => {
    const names = [
      'timeToFirstStatement', 'clearanceLatencyByRole', 'preclearedDerivationRate',
      'claimProvenanceRate', 'contradictionDebt', 'notKnownNonEmptyRate',
      'nextUpdateBreachCount', 'retractionCount', 'ignoreWithRationaleRate',
      'questionCoverage', 'lineStaleness', 'stalenessOf',
    ];
    for (const name of names) {
      const declarers = MODULES.filter((f) =>
        new RegExp(`^export function ${name}\\b`, 'm').test(readFileSync(resolve(HERE, f), 'utf8')));
      expect(declarers.length, `${name} declared in ${declarers.join(', ')}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('the vocabulary gaps the lanes could not close themselves', () => {
  /**
   * `ObservationFrame.source` had no member meaning "the desk's own record", so a census of
   * our own decisions was labelled `operator_paste` — which reads on a panel as "a human
   * typed this in" and understates how complete the population is.
   */
  it('labels a census of the desk as the desk\'s own record', () => {
    const frame = ownCorpusFrame(
      { from: '2026-07-27T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z', asOf: '2026-08-02T00:00:00.000Z', lastSuccessfulPollAt: null },
      'Clearances the desk recorded.',
    );
    expect(frame.source).toBe('own_record');
    expect(frame.completeness).toBe('census_of_own_corpus');
    expect(SOURCE_OBSERVATION_PROFILE.own_record.doesNotCapture.length).toBeGreaterThan(0);
    // Even the census admits a bias: an unrecorded decision cannot appear as a gap.
    expect(SOURCE_OBSERVATION_PROFILE.own_record.knownBiases.length).toBeGreaterThan(0);
  });

  /**
   * Art 29(2)/53(2) — the redemption-right statement — is mandatory on any ART or EMT
   * marketing communication and `MandatoryElement` had no member for it. The regime lane
   * recorded the gap in a constant and emitted it as a coverage note, which is the honest
   * response to not owning `types.ts`, and it is not a substitute for the element.
   */
  it('requires the redemption-right statement, with the right limb\'s citation', () => {
    const art = requiredElementsFor({
      regimes: ['art_promo'], isMarketingCommunication: true, concernsCryptoAssetTransactions: true,
      providesServiceInRelationToNamedAsset: false, whitePaperRequiredForPromotedAsset: true,
      anyDeclaredHolding: false, anyUnregulatedProductNamed: false,
    }).find((r) => r.element === 'redemption_right_statement');
    expect(art?.citation.provision).toBe('Art 29(2)');
    // Art 29(2) does NOT mention par value; asserting that keeps the two limbs apart.
    expect(art?.citation.text).not.toContain('par value');

    const emt = requiredElementsFor({
      regimes: ['emt_promo'], isMarketingCommunication: true, concernsCryptoAssetTransactions: true,
      providesServiceInRelationToNamedAsset: false, whitePaperRequiredForPromotedAsset: true,
      anyDeclaredHolding: false, anyUnregulatedProductNamed: false,
    }).find((r) => r.element === 'redemption_right_statement');
    expect(emt?.citation.provision).toBe('Art 53(2)');
    expect(emt?.citation.text).toContain('at par value');
  });

  /**
   * Four of the five element-absence gaps are closed with dedicated codes. The fifth stays
   * open on purpose: "fair, clear and not misleading" is a quality standard, not a
   * component, and an absence code would invite a check that looks for a sentence saying
   * "this is fair and clear".
   */
  it('gives every presence-checkable element its own absence code', () => {
    for (const el of ['no_authority_review_statement', 'white_paper_published_statement',
      'offeror_contact_details', 'redemption_right_statement'] as const) {
      const code = ABSENCE_REFUSAL_CODE[el];
      expect(code, el).not.toBeNull();
      expect(REFUSAL_CODES, el).toContain(code);
    }
    expect(ABSENCE_REFUSAL_CODE.fair_clear_not_misleading).toBeNull();
  });

  /**
   * `DeskMode.suspended_by_authority.expiresAt` was non-null, so an Art 94(1)(p)
   * prohibition — no time limit, and it includes PROHIBIT — was inexpressible, and
   * `deskMode.ts` had to smuggle it through by echoing `effectiveFrom` into a field every
   * surface reads as "reopens on".
   */
  it('lets an indefinite Art 94(1)(p) prohibition be recorded as having no end', () => {
    const src = readFileSync(resolve(HERE, 'types.ts'), 'utf8');
    expect(src).toContain('readonly expiresAt: Instant | null;');
    expect(src).toMatch(/readonly suspensionPower: 'cease_or_suspend_30_days' \| 'prohibit_or_suspend';/);
  });

  /**
   * EVERY NEW CODE IS EMITTED BY SOMETHING. Adding a refusal code and leaving the site that
   * needed it on `DATA_ABSENT_NOT_ZERO` would be the same defect as the one it was meant to
   * fix, self-inflicted and harder to see: the never-fired list would grow by six, the desk
   * would read six dead gates, and the bucket the codes were split out of would still be
   * carrying their traffic.
   *
   * The dedicated behavioural assertions live with each lane — `adoption.test.ts:317`
   * (speaker capacity), `:681` (sampling record), `:776` and `:787` (pre-approval),
   * `deskMode.test.ts:113` (calendar) and `:369` (unparseable instant). This is the coverage
   * check that no seventh one is added without a site.
   */
  it('emits every code it added, from a real site rather than a list', () => {
    const sources = MODULES.map((f) => readFileSync(resolve(HERE, f), 'utf8')).join('\n');
    const emitted = (code: RefusalCode): boolean =>
      new RegExp(`(refuse|refusal)\\(\\s*\\n?\\s*'${code}'|'${code}' :|\\? '${code}'|: '${code}'`).test(sources);
    for (const code of [
      'SPEAKER_CAPACITY_UNKNOWN',
      'PRE_APPROVAL_MISSING',
      'REVIEW_SAMPLING_RECORD_ABSENT',
      'REVIEW_SAMPLING_BASIS_UNFALSIFIABLE',
      'WORKING_DAY_CALENDAR_ABSENT',
      'INSTANT_UNPARSEABLE',
      'ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING',
      'ART_7_1_B_WHITE_PAPER_STATEMENT_MISSING',
      'ART_7_1_A_OFFEROR_CONTACT_MISSING',
      'ART_7_1_E_STATEMENT_MISSING',
    ] as const) {
      expect(emitted(code) || sources.includes(`: '${code}'`), `${code} is declared but nothing emits it`).toBe(true);
    }
  });
});
