import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { channelMix, rescore, rescoreDetailed } from './index.js';
import type { EngineDim, EngineRow } from './index.js';

/**
 * A ROW THAT CANNOT BE SCORED MUST NOT VANISH — asserted at every layer it crosses.
 *
 * `rescore` used to score an omitted dimension as a genuine ZERO and rank the subject on it.
 * That was fixed by returning only the rows it could actually score — and the fix created a
 * quieter version of the same defect: `rescore` returns `.ranked` ONLY, so a subject nobody
 * had scored simply DISAPPEARED from every response. `rescoreDetailed` was written to carry
 * the dropped rows and was then never exported from the barrel, so no caller could reach it
 * and both live call sites kept dropping.
 *
 * `RescoreResult.unrankable`'s own docblock names the failure: "A surface that shows `ranked`
 * and drops this on the floor is telling the reader that these subjects do not exist."
 *
 * Absent, zero and unrankable are three different facts. This file pins all three apart, and
 * pins the PATH — engine, then the barrel, then the two consumers — because the defect was
 * never in the engine. It was in every layer above it quietly discarding what the engine said.
 */

const DIMS: EngineDim[] = [
  { key: 'reach', label: 'Reach', weight: 0.5 },
  { key: 'cost', label: 'Cost', weight: 0.5 },
];

/** One fully scored, one partially scored, one scored on NOTHING. */
const ROWS: EngineRow[] = [
  { subjectId: 'full', subjectLabel: 'Fully scored', scores: { reach: 4, cost: 3 } },
  { subjectId: 'partial', subjectLabel: 'Partially scored', scores: { reach: 5 } },
  { subjectId: 'none', subjectLabel: 'Scored on nothing', scores: {} },
];

describe('the engine separates unrankable from zero', () => {
  it('ranks what it can and REPORTS what it cannot, never silently', () => {
    const out = rescoreDetailed(DIMS, ROWS);

    expect(out.ranked.map((r) => r.subjectId).sort()).toEqual(['full', 'partial']);
    expect(out.unrankable).toHaveLength(1);
    expect(out.unrankable[0]!.subjectId).toBe('none');

    // A refusal with no code and no reason is not a refusal.
    expect(out.unrankable[0]!.code).toBeTruthy();
    expect(out.unrankable[0]!.reason.trim()).not.toBe('');
  });

  it('does NOT rank the unscored subject at the bottom, which is the tempting wrong fix', () => {
    const out = rescoreDetailed(DIMS, ROWS);
    // Sorting it last would put an unmeasured subject on a leaderboard beside measured ones,
    // which is the original "absent scored as zero" defect wearing a different hat.
    expect(out.ranked.some((r) => r.subjectId === 'none')).toBe(false);
  });

  it('keeps `rescore` as the ranked-only convenience, so the drop is visible in the TYPE', () => {
    // Not a defect — it is why every caller must choose. `rescore` returning an array with no
    // room for the dropped rows is what made the loss invisible at the call sites.
    expect(rescore(DIMS, ROWS)).toHaveLength(2);
    expect(rescore(DIMS, ROWS)).toEqual(rescoreDetailed(DIMS, ROWS).ranked);
  });
});

describe('it survives every layer it has to cross', () => {
  it('the barrel exports the detailed form — it was unreachable for lack of one line', () => {
    const barrel = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(barrel).toContain('rescoreDetailed');
    expect(barrel, 'the result types are unreachable too').toContain('RescoreResult');
  });

  it('channelMix carries the unrankable channels instead of dropping them', () => {
    const mix = channelMix(DIMS, ROWS);
    expect(mix.rows.map((r) => r.subjectId).sort()).toEqual(['full', 'partial']);
    expect(mix.unrankable).toHaveLength(1);
    expect(mix.unrankable[0]!.subjectLabel).toBe('Scored on nothing');
  });

  it('no subject is lost between input and output — the arithmetic that proves it', () => {
    /*
     * The assertion that would have caught the whole class at once. Whatever the engine does
     * with a row, the row has to come out SOMEWHERE. Counting is how you find a silent drop;
     * inspecting the ranked list is not, because a dropped row looks exactly like a row that
     * was never sent.
     */
    const mix = channelMix(DIMS, ROWS);
    expect(mix.rows.length + mix.unrankable.length).toBe(ROWS.length);

    const seen = [...mix.rows.map((r) => r.subjectId), ...mix.unrankable.map((u) => u.subjectId)];
    expect(seen.sort()).toEqual(ROWS.map((r) => r.subjectId).sort());
  });
});

describe('the two live consumers render it', () => {
  const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('the LP route returns it, and the channel-mix panel and LP panel both show it', () => {
    /*
     * SOURCE ASSERTIONS ON PURPOSE. The defect was never that the engine was wrong — it was
     * that four layers above it discarded what the engine said, and each layer looked correct
     * on its own. Only "does the value reach a human" catches that, and that is a question
     * about the call sites, not about any unit.
     */
    expect(src('../../../apps/api/src/routes/command.ts'), 'the LP route still drops them')
      .toContain('unrankable: scored.unrankable');

    expect(src('../../../apps/web/src/components/distribution/GrowthEngines.tsx'))
      .toContain('data-testid="mix-unrankable"');

    expect(src('../../../apps/web/src/components/command/CockpitPanels.tsx'))
      .toContain('data-testid="lp-unrankable"');
  });

  it('neither panel prints a zero for an unranked subject', () => {
    // The one rendering that would re-create the original defect on screen.
    for (const f of [
      '../../../apps/web/src/components/distribution/GrowthEngines.tsx',
      '../../../apps/web/src/components/command/CockpitPanels.tsx',
    ]) {
      const body = src(f);
      const block = body.slice(body.indexOf('unrankable'));
      expect(block, `${f} renders a 0 beside an unranked subject`).not.toMatch(/unrankable[\s\S]{0,400}toFixed\(2\)/);
    }
  });
});
