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

  /**
   * EVERY handler, DISCOVERED — not the four this test used to name.
   *
   * The first version of this test asserted "gates ALL FOUR handlers" and listed them by
   * verb and path. There were FIVE. `POST /suggest` — a copilot that composes a brief over
   * a subject's whole dossier and, with `?llm=true`, feeds that dossier to a model — was
   * registered thirty lines below the four and carried only `requireOperator`, which is
   * authentication and not authorisation. The suite written to prevent exactly that
   * omission could not see it, because the enumeration WAS the blind spot: a hand-listed
   * set cannot fail on a member nobody thought of.
   *
   * So this now parses the registrations out of the source and asserts over all of them.
   * A sixth handler added tomorrow fails this test until it is gated.
   */
  it('gates EVERY registered handler — the list is discovered, never hand-written', async () => {
    const src = await reviewsSource();
    const lines = src.split('\n');

    const REGISTRATION = /^reviewRoutes\.(get|post|patch|delete|put|all)\((['"`])([^'"`]*)\2/;
    const handlers = lines
      .map((line, i) => {
        const m = REGISTRATION.exec(line);
        return m ? { verb: m[1]!, path: m[3]!, line: i } : null;
      })
      .filter((h): h is { verb: string; path: string; line: number } => h !== null);

    // Anti-vacuity: if the parse breaks, this test must fail loudly rather than assert
    // over an empty set and pass forever.
    expect(handlers.length, 'no handler registrations parsed — the regex is stale').toBeGreaterThanOrEqual(5);

    // Each handler's body runs until the next registration.
    const starts = handlers.map((h) => h.line);
    const bodyOf = (start: number) => {
      const next = starts.filter((n) => n > start).sort((a, b) => a - b)[0] ?? lines.length;
      return lines.slice(start, next).join('\n');
    };

    /*
     * READS gate at `view`, WRITES at `operate`. `/suggest` is a POST but it FILES NOTHING —
     * the handler's own comment says "AI never files — this is only a richer prefill" — so
     * it is a read of the dossier and gates at `view`. Requiring `operate` there would deny
     * an analyst entitled to read the very dossier the brief is composed from.
     */
    const READS = new Set(['get /', 'post /suggest']);

    for (const h of handlers) {
      const body = bodyOf(h.line);
      const id = `${h.verb} ${h.path}`;
      const need = READS.has(id) ? 'view' : 'operate';

      expect(body, `${id} is UNGATED — only requireOperator, which is authentication`)
        .toContain('refuseUnlessHolds(');
      expect(body, `${id} must gate at '${need}'`).toContain(`'${need}'`);
    }

    // The two id-only handlers must resolve the compartment from the ROW, since the
    // caller supplies no subject type on those paths.
    for (const h of handlers.filter((x) => x.path.includes(':id'))) {
      expect(bodyOf(h.line), `${h.verb} ${h.path} does not resolve the row's subject type`)
        .toContain('subjectTypeOf(');
    }
  });

  it('gates /suggest BEFORE it resolves a deal or reads observations', async () => {
    const src = await reviewsSource();
    const suggest = src.slice(src.indexOf("reviewRoutes.post('/suggest'"));
    const gate = suggest.indexOf('refuseUnlessHolds');
    const dealLookup = suggest.indexOf('FROM deals');
    const obsRead = suggest.indexOf('FROM observations');

    expect(gate, '/suggest has no gate at all').toBeGreaterThan(-1);
    expect(dealLookup, 'the deals lookup moved — this ordering check is stale').toBeGreaterThan(-1);
    expect(obsRead, 'the observations read moved — this ordering check is stale').toBeGreaterThan(-1);

    // Both reads are disclosure: whether a deal id resolves to a project is itself a fact
    // about a compartment the caller may not hold.
    expect(gate, 'the deals lookup runs before the gate').toBeLessThan(dealLookup);
    expect(gate, 'the observations read runs before the gate').toBeLessThan(obsRead);
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
