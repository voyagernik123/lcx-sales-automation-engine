import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EVERY `<AiProse>` MUST DECLARE WHAT IT CAN BACK.
 *
 * `AiProse` renders `[[id]]` as a superscript source marker. Without `validIds` it renders
 * EVERY marker that way — including one the model invented — so a hallucinated id arrives
 * on screen wearing the same clothes as a real citation. That is confirmed finding #5 in
 * `docs/SECURITY_FINDINGS_2026-08-07.md` ("forged `[[id]]` citations rendered as
 * attribution"); the component gained `validIds` in `8102304`, and the call sites were
 * left owed.
 *
 * `validIds={[]}` is not a placeholder and not a default. It is the true statement "this
 * surface resolves no source ids", which is the case for every drafting and reply surface
 * here — their API responses carry no citation set at all. Where a set DOES exist it is
 * passed for real (`DistributionGeo` threads the server's `citations`), because inventing
 * a set would be the same lie in the other direction.
 *
 * WHY A SWEEP AND NOT TWELVE ASSERTIONS. The pentest's own lesson, from the fifth
 * `/v1/reviews` handler that four gated tests missed: "a hand-listed set cannot fail on a
 * member nobody thought of". A per-site test proves the sites somebody remembered. This
 * derives the sites from the source, so the thirteenth one fails on arrival.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../../..');

/**
 * Call sites still owed `validIds`, each in a file this lane was told not to touch.
 *
 * This is not a suppression list — it is the exact remaining debt, and the test fails BOTH
 * ways: a new bare site anywhere fails, and fixing one of these without deleting its line
 * here also fails. It cannot quietly rot into a list of things nobody intends to do.
 *
 * What each one owes (the response shapes were read, not guessed):
 *   AskDistribution.tsx  — `DistAskAnswer.citations`      → (ans.citations ?? []).map(c => c.id)
 *   CommandDeck.tsx:788  — `ProgramAnswer.citations`      → (res.citations ?? []).map(c => c.id)
 *   CommandDeck.tsx:567  — `draftDecisionMemo` returns    → []   (no citation set exists)
 *                          `{ memo, usedLlm }` only
 */
const OWED_ELSEWHERE = [
  'apps/web/src/components/distribution/AskDistribution.tsx',
  'apps/web/src/pages/CommandDeck.tsx',
];

/** Every `<AiProse …/>` tag in the app, as `path` + the tag text. */
function aiProseTags(): Array<{ file: string; tag: string }> {
  const found: Array<{ file: string; tag: string }> = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full);
      } else if (/\.tsx$/.test(e.name)) {
        // Strip comments FIRST. `components/ai/common.tsx` discusses `<AiProse>` in a
        // doc comment, and the first draft of this sweep reported that prose as an
        // unguarded call site — a false positive that would have taught the next reader
        // to distrust the test. Same strip as the sibling sweep in aiProse.test.tsx.
        const src = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        let i = src.indexOf('<AiProse');
        while (i !== -1) {
          // Props sit on one line at every current site; cap the window anyway so a
          // malformed file cannot make this scan swallow the rest of the module.
          const close = src.indexOf('/>', i);
          const tag = close === -1 ? src.slice(i, i + 400) : src.slice(i, close + 2);
          found.push({ file: full.slice(REPO.length + 1), tag: tag.replace(/\s+/g, ' ') });
          i = src.indexOf('<AiProse', i + 1);
        }
      }
    }
  };
  walk(resolve(REPO, 'apps/web/src'));
  return found;
}

describe('AiProse call sites declare their resolvable citation set', () => {
  it('finds the call sites at all', () => {
    // Guards the sweep itself. A scan that silently matches nothing passes every
    // assertion below while proving absolutely nothing.
    const tags = aiProseTags();
    expect(tags.length).toBeGreaterThanOrEqual(12);
  });

  it('no surface renders model prose without saying what it can back', () => {
    const bare = aiProseTags()
      .filter((t) => !t.tag.includes('validIds'))
      .filter((t) => !OWED_ELSEWHERE.includes(t.file));
    expect(
      bare.map((t) => `${t.file} :: ${t.tag.slice(0, 90)}`),
      'Without validIds, AiProse renders every [[id]] as a source marker — including one ' +
        'the model invented. Pass the resolved set where the response carries one, or [] ' +
        'where it carries none. Do not guess a set into existence.',
    ).toEqual([]);
  });

  it('the owed list is exactly the debt that is left', () => {
    const stillBare = new Set(
      aiProseTags().filter((t) => !t.tag.includes('validIds')).map((t) => t.file),
    );
    const stale = OWED_ELSEWHERE.filter((f) => !stillBare.has(f));
    expect(
      stale,
      `these files now pass validIds everywhere — delete them from OWED_ELSEWHERE so the ` +
        `list keeps meaning "still owed" rather than decaying into a permanent exemption: ` +
        `${stale.join(', ')}`,
    ).toEqual([]);
  });

  it('the one surface with a real citation set passes the real set, not []', () => {
    // DistributionGeo was DISCARDING the server's `citations` in its own state shape, so
    // even a correct backend answer rendered every marker unverifiable. [] there would
    // have passed the sweep above while still throwing the evidence away.
    const geo = readFileSync(resolve(REPO, 'apps/web/src/pages/DistributionGeo.tsx'), 'utf8');
    expect(geo).toMatch(/validIds=\{draft\.validIds\}/);
    expect(geo).toMatch(/r\.citations/);
  });
});
