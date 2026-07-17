import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The ratchet that keeps the dark-mode bug class extinct (plan D1).
 *
 * Dark is a designed parallel palette: plain tokens (text-navy, text-grey,
 * text-grey-dark, bg-card…) theme themselves. The historical footguns were
 * dark:* overrides written against the old value-swap palette — they turned
 * text invisible. They are now forbidden, permanently.
 */

const SRC = join(__dirname, '..', '..');

const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /dark:text-ice(?![-/\w])/, why: '--ice is a dark surface tone in dark mode — dark:text-ice renders invisible text; plain text-navy self-themes' },
  { pattern: /dark:text-grey-light(?![-/\w])/, why: '--grey-light is a border role in dark mode — use plain text-grey/text-grey-dark' },
  { pattern: /dark:text-grey-dark(?![-/\w])/, why: 'plain text-grey-dark already self-themes; the override double-inverts' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(name) && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

describe('dark palette guard', () => {
  const files = walk(SRC);

  it('scans a real tree', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  for (const { pattern, why } of FORBIDDEN) {
    it(`forbids ${pattern.source}`, () => {
      const offenders = files
        .map(f => ({ f, src: readFileSync(f, 'utf8') }))
        .filter(({ src }) => pattern.test(src))
        .map(({ f }) => f.replace(SRC, 'src'));
      expect(offenders, `${why}\nOffenders:\n${offenders.join('\n')}`).toEqual([]);
    });
  }
});
