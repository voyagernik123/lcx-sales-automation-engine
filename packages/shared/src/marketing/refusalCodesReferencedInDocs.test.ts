import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { REFUSAL_CODES } from './types.js';

/**
 * A DOC COMMENT MAY NOT NAME A REFUSAL CODE THAT DOES NOT EXIST.
 *
 * `types.ts` carried this sentence about the embargo register:
 *
 *   "A compartment that cannot read the register must refuse
 *    (`EMBARGO_REGISTER_EMPTY` / `MARKET_ABUSE_PERIMETER_UNKNOWN`)"
 *
 * NEITHER CODE EXISTS. The real ones are `EMBARGO_REGISTER_ABSENT` and
 * `ASSET_STATE_UNKNOWN`. Both names were invented by the prose and never by the union.
 *
 * WHY THAT IS A DEFECT AND NOT A TYPO. The codes are the vocabulary a refusal explains
 * itself in, and `loop.ts refusalCodeFrequency` enumerates `REFUSAL_CODES` to report
 * which gates have NEVER FIRED — the desk's only honest read on whether a gate is
 * load-bearing or ornamental. A comment naming a code outside that array sends the next
 * reader looking for a gate nobody built, and it is invisible to every other check in
 * the repo: prose does not type-check.
 *
 * ══ HOW THE MATCHER AVOIDS FIRING ON EVERYTHING ══
 * Screaming-snake tokens in backticks are not all refusal codes — `REFUSAL_CODES`,
 * `TTFS_BUDGET_MINUTES_BY_TIER` and `INSTRUMENTS` are constants, and a rule that
 * demanded every one of them be a code would be useless. So a token is a FINDING only
 * when it is neither a refusal code NOR an identifier the compartment exports NOR a
 * locally declared name. That leaves exactly the case this guards: a screaming-snake
 * name in prose that resolves to nothing at all.
 *
 * WHAT THIS DOES NOT CATCH, stated so a green run is not over-read:
 *   - Prose that cites a code which EXISTS but is the wrong one for the sentence. Only
 *     a human can see that.
 *   - Codes named in comments outside this directory.
 *   - A code named without backticks. Requiring backticks is what keeps English words
 *     in prose ("UNKNOWN means...") from being read as identifiers.
 */

const DIR = new URL('.', import.meta.url);

const SOURCES = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ file: f, text: readFileSync(new URL(f, DIR), 'utf8') }));

const CODES = new Set<string>(REFUSAL_CODES);

/**
 * Every screaming-snake name declared anywhere in `packages/shared/src`.
 *
 * THE WHOLE PACKAGE, NOT JUST THIS DIRECTORY, because marketing comments legitimately
 * cite the rest of it and the first draft of this test flagged all of them: `claimSafety`
 * refers to `DEAL_CLOSING_PHRASES` and `INVENTED_LICENSE_PHRASES` in `claims/
 * messageRules.ts` (and says outright that they are module-private consts over there),
 * and `loop.ts` cites `MIN_N_FOR_RATE` from `gps/calibration.ts` as the device it
 * re-derived. Those are exactly the cross-references a reader wants; flagging them
 * would have trained the next person to delete the test.
 */
const DECLARED = new Set<string>();
function collectDeclarations(dir: URL): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) { collectDeclarations(child); continue; }
    // SOURCE FILES ONLY. Test files quote code names as string literals — including
    // this one, which names the invented codes in its own assertions — so scanning them
    // put every name on the cited-as-nonexistent list straight into `DECLARED` and made
    // the staleness check above pass vacuously. A declaration lives in source.
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const text = readFileSync(child, 'utf8');
    for (const m of text.matchAll(
      /(?:export\s+)?(?:declare\s+)?(?:const|let|var|function|type|interface|enum|class)\s+([A-Z][A-Z0-9_]{2,})\b/g,
    )) DECLARED.add(m[1]);
    // Keys of the shape `SOME_KEY:` in object literals and interfaces.
    for (const m of text.matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\s*[?:]/gm)) DECLARED.add(m[1]);
    // Members of string-literal unions and arrays: 'SOME_CODE'
    for (const m of text.matchAll(/'([A-Z][A-Z0-9_]{2,})'/g)) DECLARED.add(m[1]);
    // Env vars read through process.env.
    for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)) DECLARED.add(m[1]);
  }
}
collectDeclarations(new URL('../', DIR));

/** Screaming-snake words that are English, an acronym, or a ticker — never identifiers. */
const PROSE = new Set([
  'MNPI', 'MICA', 'ESMA', 'GDPR', 'DKIM', 'ARC', 'SPF', 'RFC', 'SQL', 'API', 'URL',
  'TODO', 'NOTE', 'NOT', 'AND', 'OR', 'ONE', 'TWO', 'SEC', 'FMA', 'SVB', 'FTX',
  'LCX', 'TTFS', 'SLA', 'JSON', 'HTML', 'CSS', 'CDN', 'DNS', 'SMTP', 'RSS',
  'SOURCES', 'ETH', 'BTC', 'SOL', 'USDC',
  /*
   * DECLARED OUTSIDE `packages/shared`, so `collectDeclarations` cannot see them by
   * construction — it walks this package only, deliberately, because reaching into
   * `apps/*` would couple the shared test suite to both applications.
   *   - MARKETING_RETENTION_DAYS  — an env var read by apps/api.
   *   - MARKETING_CONTRACTS_OWED  — apps/web/src/lib/api/marketing.ts, cited by §16 of
   *     types.ts where the response contracts are declared.
   * These are real names that resolve; they are listed because the collector's reach is
   * limited, not because the reference is loose.
   */
  'MARKETING_RETENTION_DAYS',
  'MARKETING_CONTRACTS_OWED',
]);

/**
 * NAMES A COMMENT CITES *IN ORDER TO SAY THEY DO NOT EXIST.
 *
 * A governance list, not a way to quiet the test: each entry is a place where the prose
 * names a would-be identifier deliberately, and the sentence would be unwritable
 * without it. Adding an entry says "this name is absent on purpose, and here is the
 * comment that explains why".
 */
const CITED_AS_NONEXISTENT: Record<string, string> = {
  // triage.ts:104 — argues AGAINST creating a triage-specific twin of a shared code,
  // because two codes for one rule would split the refusal-frequency count in half.
  TRIAGE_TTFS_SUPPRESSION_UNREASONED:
    'triage.ts names it to explain why it was NOT created — one code, one bucket.',
  // index.ts and crisis.ts record the rename that resolved a real disagreement: the
  // two ladders differed at `medium` (120 vs 240 minutes) and were split into
  // …_BY_SEVERITY and …_BY_TIER so a caller must say which it means.
  TTFS_BUDGET_MINUTES:
    'the pre-collapse name, cited where the split into _BY_SEVERITY/_BY_TIER is recorded.',
  // types.ts names both of these to record that they were the WRONG names — the exact
  // defect this file exists to prevent. Pinned as absent by the test above.
  EMBARGO_REGISTER_EMPTY:
    'types.ts cites it as the invented name it used to carry. Real: EMBARGO_REGISTER_ABSENT.',
  MARKET_ABUSE_PERIMETER_UNKNOWN:
    'types.ts cites it as the invented name it used to carry. Real: ASSET_STATE_UNKNOWN.',
  // abuse.ts §3 records the decision NOT to create this, taken 2026-08-02: a refusal
  // names a missing fact and who can supply it, and nobody can supply a stance — the
  // fact actually missing is the holdings declaration, which HOLDINGS_DECLARATION_MISSING
  // already names. A code that only ever fired alongside that one would also double-count
  // a single refusal in `loop.ts refusalCodeFrequency`.
  STANCE_UNDETERMINED:
    'abuse.ts names it to record why it was NOT created. The uncertainty travels on '
    + 'StanceAssessment.stance as context, not as a rule.',
};

/** Every backticked screaming-snake token in a comment, with where it was found. */
function docTokens(text: string): Array<{ token: string; line: number }> {
  const out: Array<{ token: string; line: number }> = [];
  text.split('\n').forEach((line, i) => {
    if (!/^\s*(?:\*|\/\/)/.test(line)) return;
    for (const m of line.matchAll(/`([A-Z][A-Z0-9_]{2,})`/g)) {
      out.push({ token: m[1], line: i + 1 });
    }
  });
  return out;
}

describe('every refusal code named in a marketing doc comment resolves', () => {
  it('the array is populated, or the whole check is vacuous', () => {
    expect(CODES.size).toBeGreaterThan(100);
    expect(CODES.has('ASSET_STATE_UNKNOWN')).toBe(true);
    expect(CODES.has('EMBARGO_REGISTER_ABSENT')).toBe(true);
  });

  it('the two invented names are absent from the union, as the docblock claims', () => {
    // If someone "fixes" this by adding the invented codes to the union, the comment
    // in types.ts explaining the defect becomes false — so pin it.
    expect(CODES.has('EMBARGO_REGISTER_EMPTY')).toBe(false);
    expect(CODES.has('MARKET_ABUSE_PERIMETER_UNKNOWN')).toBe(false);
  });

  it('every name on the cited-as-nonexistent list really is nonexistent', () => {
    // Otherwise the list becomes a place where a real code hides from the check — the
    // allowlist would outlive the reason for it, which is how exemption lists rot.
    const nowReal = Object.keys(CITED_AS_NONEXISTENT)
      .filter((name) => CODES.has(name) || DECLARED.has(name));
    expect(
      nowReal,
      'these are on the cited-as-nonexistent list but now exist. Something was built '
      + 'with a name the prose says was rejected: reconcile the comment and drop the entry.',
    ).toEqual([]);
  });

  for (const { file, text } of SOURCES) {
    it(`${file} names no screaming-snake identifier that resolves to nothing`, () => {
      const unresolved = docTokens(text)
        .filter(({ token }) => !CODES.has(token)
          && !DECLARED.has(token)
          && !PROSE.has(token)
          && !(token in CITED_AS_NONEXISTENT))
        .map(({ token, line }) => `${file}:${line} \`${token}\``);
      expect(
        unresolved,
        'these names appear in a doc comment in backticks but are not a refusal code, '
        + 'not declared anywhere in the compartment, and not on the prose allowlist. '
        + 'Either the name is wrong (the EMBARGO_REGISTER_EMPTY case) or it describes a '
        + 'gate nobody built.',
      ).toEqual([]);
    });
  }
});
