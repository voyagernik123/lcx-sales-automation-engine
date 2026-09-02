import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_REVISED_AT } from '@/data';

/**
 * THE RECORD'S DATE MOVES WHEN THE RECORD MOVES.
 *
 * `DATA_REVISED_AT` dates every regulatory figure. It is a hand-set day, so this test holds it to
 * the day of the last commit that touched `apps/web/src/data` — the one fact git already knows.
 * On a shallow checkout (CI fetches depth 1) there is no history to compare against, so the
 * assertion is skipped there and enforced by the root gate, which runs on a full clone.
 */
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: WEB, encoding: 'utf8' }).trim();
}

describe('DATA_REVISED_AT', () => {
  it('is a valid instant at day granularity', () => {
    expect(Number.isNaN(Date.parse(DATA_REVISED_AT))).toBe(false);
    expect(DATA_REVISED_AT.endsWith('T00:00:00.000Z')).toBe(true);
  });

  it('equals the day of the last commit that touched src/data (full clones only)', () => {
    let shallow = 'true';
    try { shallow = git(['rev-parse', '--is-shallow-repository']); } catch { return; }
    if (shallow === 'true') return;
    const last = git(['log', '-1', '--format=%cI', '--', 'src/data']);
    if (!last) return; // no committed revision yet — the constant is the only statement
    const committedDay = new Date(last).toISOString().slice(0, 10);
    const staged = git(['status', '--porcelain', '--', 'src/data']).length > 0;
    const declaredDay = DATA_REVISED_AT.slice(0, 10);
    // An uncommitted edit to the data is allowed to carry today's date ahead of its commit.
    if (staged) { expect(declaredDay >= committedDay, `declared ${declaredDay} is before the last committed revision ${committedDay}`).toBe(true); return; }
    expect(declaredDay, `apps/web/src/data was last revised ${committedDay}; DATA_REVISED_AT says ${declaredDay} — bump it in the commit that changed the data`).toBe(committedDay);
  });
});
