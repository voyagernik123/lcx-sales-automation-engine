/**
 * Name normalization shared by the enrichment matcher, dedupe blocking keys,
 * and label joining. Keep these stable: name_key columns are derived from them.
 */

/** Collapse to lowercase alphanumerics: "Bera Chain" → "berachain". */
export function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Corporate-entity words dropped before squashing. */
const CORP_WORDS =
  /\b(foundation|stiftung|association|labs?|inc|llc|ltd|limited|gmbh|ag|sa|sezc|pty|uab|oy|dao)\b/gi;

/** Squash after dropping corporate-entity words: "Ether.Fi Foundation" → "etherfi". */
export function squashEntity(s: string): string {
  return squash(s.replace(CORP_WORDS, ' '));
}
