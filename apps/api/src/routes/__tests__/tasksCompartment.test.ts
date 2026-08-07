import { describe, expect, it } from 'vitest';

/**
 * `/v1/tasks` WAS THE LAST UNSCOPED READ IN THE DESK-LEVEL NAMESPACE.
 *
 * `app.ts` mounts `requireWorkspace` only for paths listed in a workspace's `apiPrefixes`.
 * Thirteen mounted paths are outside that set, and the file calls them "desk-level". Four
 * of them read compartmented rows, and three had already been given a per-reader filter:
 *
 *   · notifications — `scopesFor`, after `0067` leaked every compartment to every reader
 *   · readout       — `scopeList`, per reader, across the compartments that reader holds
 *   · reviews       — per-subject compartment gate, on all five handlers
 *   · tasks         — NOTHING. `requireOperator` and a `SELECT`.
 *
 * The rows are not innocuous. `generateStalledDealTasks` writes
 * `'Unstick deal: ' || p.name` with `'no movement for N days in stage ' || d.stage`, and
 * `listTasks` joins `projects.name`. An unscoped read therefore returned a named list of
 * live deals, their stage, and how badly each was stalling — the commercial pipeline — to
 * any authenticated principal, including the machine `operator` key.
 *
 * These are SOURCE assertions rather than request assertions, and deliberately so: the
 * defect is structural (which reads carry a filter at all), the same level
 * `reviewsCompartment.test.ts` asserts at, and a request test would need a populated
 * database to prove an absence.
 */

async function read(rel: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(rel, import.meta.url), 'utf8');
}

describe('/v1/tasks scopes its read to the compartments the reader holds', () => {
  it('resolves entitlements per request and passes the sales capability', async () => {
    const src = await read('../tasks.ts');

    // Per request, from the live grant table — never cached on the principal, so a revoke
    // takes effect on the next read.
    expect(src).toContain('loadEntitlements(getPool(), operator.id)');
    expect(src).toContain("mayReadSales: capAtLeast(ents.sales, 'view')");
  });

  it('makes the scope decision UNSKIPPABLE — no default, so omitting it will not compile', async () => {
    const svc = await read('../../tasks/service.ts');

    /*
     * The required-parameter trick `notify` uses for its own `workspace`, and for the same
     * stated reason: omitting it becomes a compile error, which is the only reliable way to
     * stop the next caller from reinstating the unscoped read. A `?` or a `??` default here
     * would silently restore the leak.
     */
    expect(svc).toMatch(/mayReadSales:\s*boolean;/);
    expect(svc, 'mayReadSales became optional — the leak can be reinstated by omission')
      .not.toMatch(/mayReadSales\?\s*:/);
    expect(svc, 'a default would restore the unscoped read')
      .not.toMatch(/mayReadSales\s*(\?\?|=)\s*(true|false)/);
  });

  it('excludes BOTH deal-linked and project-linked rows when sales is not held', async () => {
    const svc = await read('../../tasks/service.ts');

    // Both columns. `generateStalledDealTasks` writes both, but a task whose `project_id`
    // was later cleared would still name its deal, and a filter on one column only is the
    // exact near-miss this codebase has already paid for elsewhere.
    expect(svc).toContain('t.project_id IS NULL AND t.deal_id IS NULL');

    // And it must be reached by the NEGATIVE branch — a filter applied when the reader DOES
    // hold sales would be backwards, which is the inversion GPS Phase 0 had to fix.
    const guard = svc.indexOf('if (!filters.mayReadSales)');
    const clause = svc.indexOf('t.project_id IS NULL AND t.deal_id IS NULL');
    expect(guard, 'the negative guard is missing').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(clause);
  });

  it('still has exactly one caller, so the decision cannot be made in two places', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const root = new URL('../../', import.meta.url).pathname;

    const hits: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== '__tests__') await walk(p);
        } else if (e.name.endsWith('.ts')) {
          const s = await fs.readFile(p, 'utf8');
          if (/\blistTasks\(/.test(s) && !/export async function listTasks/.test(s)) {
            hits.push(path.relative(root, p));
          }
        }
      }
    };
    await walk(root);

    // If a second caller appears it must make the same scope decision, so this fails and
    // forces a look rather than letting a new unscoped path open quietly.
    expect(hits.sort()).toEqual(['routes/tasks.ts']);
  });
});
