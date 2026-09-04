import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * EVERY WATCH SOURCE BINDS EXACTLY THE PARAMETERS ITS CLAUSE REFERENCES (2026-09-04). The composer bound [since, asOf] to all ten
 * sources; seven clauses reference only $1 and Postgres refused every one of them — "bind message supplies 2 parameters, but
 * prepared statement requires 1" — so the watch answered with seven `absent` lines and the top bar carried the sentence on every
 * desk in production. The mocked pool in composeWatch's tests accepts any binding, which is why no test noticed. This reads the
 * source table and the query site and holds the rule as text: the binding is derived from the clause, never a constant pair.
 */
const src = readFileSync(resolve(__dirname, '../watch.ts'), 'utf8');

describe('watch sources bind what they reference', () => {
  it('the query site derives its parameters from the clause instead of binding [since, asOf] to every source', () => {
    expect(src).toMatch(/usesSince = \/\\\$1\\b\/\.test\(s\.where\)/);
    expect(src).toMatch(/usesAsOf && !usesSince \? s\.where\.replace\(\/\\\$2\\b\/g, '\$1'\)/);
    expect(src).not.toMatch(/LIMIT 100`, \[since, asOf\]\)/);
  });
  it('no source clause references a placeholder above $2, and each references at least one', () => {
    const clauses = [...src.matchAll(/where: (?:'([^']*)'|"([^"]*)")/g)].map((m) => m[1] ?? m[2]!);
    expect(clauses.length).toBeGreaterThanOrEqual(10);
    for (const w of clauses) {
      expect(w, `clause references $3+: ${w}`).not.toMatch(/\$[3-9]/);
      expect(w, `clause references no placeholder: ${w}`).toMatch(/\$[12]\b/);
    }
  });
});
