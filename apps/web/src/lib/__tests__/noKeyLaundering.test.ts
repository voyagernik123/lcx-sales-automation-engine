import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * NO SCREEN MAY NAME "no AI key" AS THE CAUSE OF A MISSING AI ANSWER.
 *
 * `llm.ts` returned an identical `{ text: '', usedLlm: false }` for four unrelated
 * conditions — no provider configured, a non-ok response (a 429 or a model-shape 400), an
 * HTTP 200 carrying `stop_reason: 'refusal'`, and a transport throw. Five screens then
 * rendered ONE cause: "no AI key". In three of the four cases that sentence is simply false,
 * and it is false in the most misleading direction — it tells an operator to go configure
 * something that is already configured, while a rate limit or a model refusal goes unnoticed.
 *
 * That is two doctrine breaches at once: four states collapsed into one, and an inference
 * ("usedLlm is false") laundered into a certainty ("therefore there is no key").
 *
 * The mechanism is fixed — the operator engines return `status`, `code` and `detail` — but
 * the mechanism being right is not what keeps the screens right. Five call sites had to be
 * changed by hand, and the sixth would have been added by hand too. So this walks the source.
 *
 * WHAT IS ALLOWED. A screen may say a model did not answer. It may render a `detail` the API
 * supplied. What it may not do is assert WHY when it was told four things at once.
 */

const WEB_SRC = resolve(process.cwd(), 'src');

/**
 * Phrases that assert a specific cause. Deliberately narrow: this must catch the real
 * regression without failing on honest sentences like "no AI answer" or a rendered
 * `{r.detail}`. Each is matched case-insensitively.
 */
const CAUSE_CLAIMS: ReadonlyArray<{ re: RegExp; why: string }> = [
  { re: /no\s+ai\s+key/i, why: 'asserts a missing key as the cause' },
  { re: /no\s+key\s+set/i, why: 'asserts a missing key as the cause' },
  { re: /\(no\s+key\)/i, why: 'asserts a missing key as the cause' },
  { re: /set\s+an\s+ai\s+key\s+for/i, why: 'tells the operator to fix a cause that may not be the cause' },
  { re: /missing\s+ai\s+key/i, why: 'asserts a missing key as the cause' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

describe('a missing AI answer is never explained by a cause the screen cannot know', () => {
  const files = walk(WEB_SRC);

  it('walks a real tree — anti-vacuity', () => {
    // Without this the assertion below passes forever if the walk breaks or the path moves.
    expect(files.length, 'the source walk found almost nothing — the path is wrong').toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith('pages/Monitors.tsx'))).toBe(true);
  });

  it('detects the phrasing it is meant to detect — the regexes are not dead', () => {
    // Guards the opposite failure: a typo in a pattern would make this suite green forever.
    const sample = "toast('error', 'No AI key — fill manually')";
    expect(CAUSE_CLAIMS.some((c) => c.re.test(sample))).toBe(true);
  });

  it('no screen names a cause for usedLlm === false', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        // Comments are where the history is explained, and explaining the old string
        // requires quoting it. Only live code is checked.
        const code = line.trim();
        if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) return;
        for (const { re, why } of CAUSE_CLAIMS) {
          if (re.test(line)) offenders.push(`${relative(WEB_SRC, file)}:${i + 1} — ${why}\n    ${code.slice(0, 120)}`);
        }
      });
    }
    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([]);
  });
});
