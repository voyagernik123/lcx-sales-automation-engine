import { describe, expect, it } from 'vitest';
import { WORKSPACES, workspaceForApiPath } from '@lcx/shared';

/**
 * `/v1/reviews` HAD NO COMPARTMENT GATE AT ALL, ON READ OR WRITE.
 *
 * Found by an adversarial pass over the need-to-know boundary and demonstrated against a real
 * database: a principal with ZERO grant rows read the full `content` of DISTRIBUTION and COMMAND
 * analytic reviews, and could overwrite them.
 *
 * The mechanism, verified here and by reading the file:
 *   · `/v1/reviews` appears in NO workspace's `apiPrefixes`, so `app.ts` mounts NO
 *     `requireWorkspace` on it.
 *   · The only middleware was `requireOperator` — AUTHENTICATION, not authorisation.
 *   · The GET filtered on `subject_type` and `subject_id` and nothing else.
 *   · The PATCH was a bare `WHERE id = $N`, with no author check either.
 *
 * ── WHY THE WRITE HALF IS WORSE THAN THE READ HALF ────────────────────────────────
 * `actions/registry.ts` requires an ACTIVE `premortem` AND `legal_check` on a campaign before a
 * token-incentivised launch may proceed. With no gate here, anyone authenticated could POST
 * exactly those two rows and satisfy that gate without a review happening — or PATCH a BLOCKED
 * legal_check to CLEARED so the approver reads a false clearance. That is the record carrying an
 * Art 91(3)(c) decision, which attaches PERSONALLY.
 *
 * A NOTE ON THE ORIGINAL REPORT, because it matters for how findings are read here: its "proof"
 * quoted confidential-looking MiCA text as ACTUAL output. One of its own skeptics caught that the
 * text was the reporter's OWN inserted fixture, not observed data. The missing gate is real and
 * demonstrated; that sentence was not evidence, and it is not repeated as such.
 *
 * These assertions are about the ROUTE TABLE and the SUBJECT→COMPARTMENT MAP, not one request,
 * because that is the level the defect lived at: a fifth subject type added without a map entry
 * is how it would come back.
 */

const SUBJECT_TO_WORKSPACE = {
  deal: 'sales',
  project: 'sales',
  command_decision: 'command',
  dist_campaign: 'distribution',
} as const;

async function reviewsSource(): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL('../reviews.ts', import.meta.url), 'utf8');
}

describe('/v1/reviews gates on the compartment that owns the subject', () => {
  it('confirms the path itself is ungated, which is why the gate must be in the handler', () => {
    // If this ever becomes non-null, someone put /v1/reviews into a workspace's prefixes — and
    // that would be WRONG, because one path serves three compartments. The in-handler gate is
    // not a workaround; it is the only thing that can express a per-row compartment.
    expect(workspaceForApiPath('/v1/reviews')).toBeNull();
  });

  it('maps every declared subject type to a real workspace — an unmapped one must DENY', async () => {
    const src = await reviewsSource();

    // The SUBJECTS list the route validates against.
    const declared = src.match(/const SUBJECTS = \[([^\]]+)\]/)?.[1] ?? '';
    const subjects = [...declared.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(subjects.length, 'SUBJECTS not found — the parse is stale').toBeGreaterThan(0);

    for (const subj of subjects) {
      const ws = (SUBJECT_TO_WORKSPACE as Record<string, string>)[subj];
      expect(ws, `subject type '${subj}' has no compartment in SUBJECT_WORKSPACE`).toBeTruthy();
      expect(WORKSPACES.some((w) => w.id === ws), `${ws} is not a real workspace`).toBe(true);
      // And the map in the source must agree with this test's copy.
      expect(src).toContain(`${subj}: '${ws}'`);
    }
  });

  it('resolves the compartment by ownership, not with the `in` operator', async () => {
    const src = await reviewsSource();
    // `'constructor' in SUBJECT_WORKSPACE` is true. The same mistake was found in
    // intel/monitors.ts in this review round, where it let a monitor validate and never fire.
    expect(src).toContain('hasOwnProperty.call(SUBJECT_WORKSPACE');
  });

  it('gates ALL FOUR handlers, and the three write paths at operate', async () => {
    const src = await reviewsSource();
    const lines = src.split('\n');

    const handlerAt = (re: RegExp) => lines.findIndex((l) => re.test(l));
    const gets = handlerAt(/reviewRoutes\.get\('\/'/);
    const posts = handlerAt(/reviewRoutes\.post\('\/'/);
    const patches = handlerAt(/reviewRoutes\.patch\('\/:id'/);
    const deletes = handlerAt(/reviewRoutes\.delete\('\/:id'/);
    for (const [name, i] of [['get', gets], ['post', posts], ['patch', patches], ['delete', deletes]] as const) {
      expect(i, `${name} handler not found`).toBeGreaterThan(-1);
    }

    // Each handler's body runs until the next handler registration.
    const bodyOf = (start: number) => {
      const nexts = [gets, posts, patches, deletes, lines.length]
        .filter((n) => n > start)
        .sort((a, b) => a - b);
      return lines.slice(start, nexts[0]).join('\n');
    };

    expect(bodyOf(gets), 'GET is ungated').toContain("refuseUnlessHolds(c, subjectType, 'view')");
    expect(bodyOf(posts), 'POST is ungated').toContain("'operate'");
    expect(bodyOf(patches), 'PATCH is ungated').toContain("'operate'");
    expect(bodyOf(deletes), 'DELETE is ungated').toContain("'operate'");

    // The two id-only handlers must resolve the compartment from the ROW.
    expect(bodyOf(patches)).toContain('subjectTypeOf(');
    expect(bodyOf(deletes)).toContain('subjectTypeOf(');
  });

  it('gates the GET BEFORE it queries, so an unentitled caller cannot learn the row exists', async () => {
    const src = await reviewsSource();
    const get = src.slice(src.indexOf("reviewRoutes.get('/'"));
    const gate = get.indexOf('refuseUnlessHolds');
    const query = get.indexOf('FROM analytic_reviews');
    expect(gate).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(-1);
    // Existence is itself disclosure: a 403 and a 404 must not be distinguishable by whether
    // the row is there.
    expect(gate, 'the gate runs after the query').toBeLessThan(query);
  });
});
