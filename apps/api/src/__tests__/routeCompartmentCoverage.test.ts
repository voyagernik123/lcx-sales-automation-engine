import { describe, expect, it } from 'vitest';
import { WORKSPACES } from '@lcx/shared';

/**
 * EVERY MOUNTED PATH IS EITHER COMPARTMENT-GATED OR DECLARED DESK-LEVEL, WITH A REASON.
 *
 * `app.ts` mounts `requireWorkspace` by looping over `WORKSPACES[].apiPrefixes`. A path that
 * appears in no workspace's prefixes gets NO compartment gate — only whatever the route file
 * does for itself. That is a reasonable design; what was missing is that the set of such
 * paths was IMPLICIT. It existed as a sentence in a comment, so a new `app.route(...)` joined
 * it silently, and two live defects were found sitting in it:
 *
 *   · `/v1/reviews` had no gate on any of its five handlers — a copilot composing the whole
 *     sales dossier into prose, and with `?llm=true` feeding it to a model.
 *   · `/v1/tasks` returned `'Unstick deal: ' || p.name` with each deal's stage and staleness
 *     to any authenticated principal, including the shared machine key.
 *
 * Both were fixed. THIS test is the thing that stops the third one. It asserts the uncovered
 * set is EXACTLY the list below, so adding a route without deciding its compartment fails
 * here rather than in a pen-test six months later.
 *
 * The list is not an allowlist of things that are fine. It is a register of decisions, and
 * two of its entries are explicitly recorded as OPEN.
 */

/**
 * Paths deliberately outside the workspace mount, each with the reason it is desk-level and
 * the mechanism that keeps it honest. `status` is the verdict, not a hope.
 */
const DESK_LEVEL: ReadonlyArray<{
  path: string;
  status: 'no-compartmented-data' | 'filters-per-reader' | 'gated-elsewhere' | 'OPEN';
  why: string;
}> = [
  { path: '/health', status: 'no-compartmented-data', why: 'liveness only, unauthenticated by design' },
  { path: '/v1/me', status: 'no-compartmented-data', why: 'the caller\'s own principal and grants' },
  { path: '/v1/perf', status: 'no-compartmented-data', why: 'latency percentiles about the service, not about any subject' },
  { path: '/v1/access', status: 'filters-per-reader', why: 'the grant machinery itself; approvals carry their own approver check' },
  { path: '/v1/actions', status: 'gated-elsewhere', why: 'gated per action inside the registry, which is finer than a compartment' },
  { path: '/v1/notifications', status: 'filters-per-reader', why: 'scopesFor(), after 0067 leaked every compartment to every reader' },
  { path: '/v1/readout', status: 'filters-per-reader', why: 'scopeList() per reader; one brief spanning the compartments that reader holds, so a single workspace gate would be wrong in both directions' },
  { path: '/v1/search', status: 'filters-per-reader', why: 'scopes its own object search to held compartments' },
  { path: '/v1/reviews', status: 'filters-per-reader', why: 'per-subject compartment gate on all five handlers (see reviewsCompartment.test.ts)' },
  { path: '/v1/tasks', status: 'filters-per-reader', why: 'mayReadSales excludes deal- and project-linked rows (see tasksCompartment.test.ts)' },
  { path: '/v1/x402', status: 'gated-elsewhere', why: 'x402Guard per endpoint; the catalog is public by design' },
  {
    path: '/v1/services',
    status: 'gated-elsewhere',
    why: 'public BY DECISION (G1, 2026-08-21): the services intake is the one unauthenticated '
      + 'GPS-adjacent write, hardened in its own file — strict six-field schema, per-IP bucket '
      + 'behind the global limiter, honeypot answered indistinguishably from success, no '
      + 'reflection, and its writes land in gps_demand_candidate as proposed rows a gps '
      + 'operator must promote before anything downstream sees them.',
  },

  /*
   * ── OPEN, AND SAID SO RATHER THAN ASSUMED SAFE ──────────────────────────────────────
   * These two read rows that plausibly belong to a compartment. They are NOT known-good;
   * they are known-undecided, and they are written down here so the decision is owed rather
   * than forgotten. Listing them keeps this test honest: a register that quietly recorded
   * them as fine would be exactly the implicit-list failure it exists to prevent.
   */
  {
    path: '/v1/integrations',
    status: 'OPEN',
    why: 'GET /email-threads/:projectId and /social-mentions/:projectId return per-project counterparty communications with no per-reader filter. Needs the same treatment as tasks, or a stated reason it is desk-level.',
  },
  {
    path: '/v1/users',
    status: 'OPEN',
    why: 'GET /:id/assignments joins project_assignments to projects, so it names which projects a person works. The roster itself (id/email/name/role) is desk-level; the assignment join is the open part.',
  },
];

function mountedPaths(src: string): string[] {
  return [...new Set([...src.matchAll(/app\.route\('([^']+)'/g)].map((m) => m[1]!))];
}

function coveredByAWorkspace(path: string): boolean {
  return WORKSPACES.some((w) => w.apiPrefixes.some((p) => path === p || path.startsWith(`${p}/`)));
}

async function appSource(): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL('../app.ts', import.meta.url), 'utf8');
}

describe('every mounted route has a compartment decision', () => {
  it('parses the mount table — anti-vacuity', async () => {
    const mounted = mountedPaths(await appSource());
    // If the parse breaks, every assertion below would pass over an empty set forever.
    expect(mounted.length, 'no app.route() mounts parsed — the regex is stale').toBeGreaterThan(25);
    expect(mounted).toContain('/v1/reviews');
  });

  it('has at least one workspace-covered path, so "covered" is not vacuously false', async () => {
    const mounted = mountedPaths(await appSource());
    const covered = mounted.filter(coveredByAWorkspace);
    expect(covered.length).toBeGreaterThan(10);
  });

  it('the ungated set is EXACTLY the declared register — a new one fails here', async () => {
    const mounted = mountedPaths(await appSource());
    const uncovered = mounted.filter((p) => !coveredByAWorkspace(p)).sort();
    const declared = DESK_LEVEL.map((d) => d.path).sort();

    /*
     * Two directions, both of which matter:
     *   · a NEW uncovered path means someone mounted a route without deciding its
     *     compartment — the `/v1/reviews` failure, exactly;
     *   · a REMOVED one means this register has drifted from the code and its reasons can
     *     no longer be trusted.
     */
    expect(uncovered, 'an undeclared ungated path was mounted — decide its compartment and add it here').toEqual(declared);
  });

  it('every declared entry carries a real reason', () => {
    for (const d of DESK_LEVEL) {
      expect(d.why.length, `${d.path} has no stated reason`).toBeGreaterThan(30);
    }
  });

  it('names the OPEN ones out loud instead of recording them as safe', () => {
    const open = DESK_LEVEL.filter((d) => d.status === 'OPEN').map((d) => d.path);
    /*
     * This assertion is deliberately a pin, not a ceiling. If someone closes one of these,
     * this test fails and forces the register to be updated in the same commit — which is
     * the point, because the register is the thing a reader trusts.
     */
    expect(open.sort()).toEqual(['/v1/integrations', '/v1/users']);
  });
});
