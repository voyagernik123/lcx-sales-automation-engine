/**
 * THE PHASE 3 GATE, ON THE RIGHT SIDE OF THE BOUNDARY.
 *
 * The gate claim was: "every governed action in the registry is invocable
 * keyboard-only, from anywhere", enforced by "a coverage test asserting every
 * action is reachable AND fully specifiable, so a new action cannot ship without
 * a command."
 *
 * It was false — 7 of 22, measured in a browser — and the coverage test passed
 * anyway, because it checked the registry against ITSELF: every action has a
 * subjectType, and every subjectType is spelled consistently. Both true. Neither
 * has anything to do with whether an operator can put such a subject in front of
 * the command line. `apps/web/src/components/command/__tests__/coverage.test.ts`
 * probed `verbsFor` with a noun it invented from `action.subjectTypes` — so it
 * was asking "does the registry agree with the registry", which it always will.
 *
 * THIS test crosses the boundary. On one side, ACTION_REGISTRY: what the server
 * will accept as a subject. On the other, SEARCH_GROUPS: what GET /v1/search can
 * actually put in front of an operator. Both are imported from the real modules,
 * not restated here, and both live in this package — which is the reason this
 * assertion is here and not in the web suite, where only half of it is visible.
 *
 * WHY NOT A COMPILE-TIME UNION, which would be better. `RegistryAction.subjectTypes`
 * is `string[]`, so there is no literal type to import and nothing for `tsc` to
 * reject; producing one means changing the registry's own types (and ideally
 * hoisting the vocabulary into `packages/shared` so neither side can add a subject
 * type alone). That is the right follow-up and it is outside this change's scope.
 * Until then this test is the enforcement, and it is written to fail loudly:
 * every assertion below has been watched failing, and the positive controls at
 * the bottom exercise the SAME function the real assertions do — not a copy of it.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { ACTION_REGISTRY } from '../../actions/registry.js';
import { ACTION_GRAMMAR } from '../../actions/grammar.js';
import { SEARCH_GROUPS, SEARCHABLE_SUBJECT_TYPES } from '../search.js';
import { createApp } from '../../app.js';
import { closeDb, getDb } from '../../db/index.js';
import { sql } from 'drizzle-orm';
import { HAS_DB, itDb } from '../../test/db.js';

/** The shape the checker needs. Deliberately minimal so a control can build one. */
interface Addressable {
  id: string;
  subjectTypes: string[];
  /** ACTION_GRAMMAR's nounIdShape — 'pseudo' is the exemption. */
  nounIdShape?: string;
}

/**
 * Subject types GET /v1/search emits that NO action names.
 *
 * They are legal and deliberate: they are reachable objects whose only verbs are
 * the `subjectTypes: ['*']` ones (notify / watchlist / flag for review). Listing
 * them is what makes a TYPO fail — `command_partners` instead of
 * `command_partner` is neither named by an action nor on this list, so it goes
 * red instead of silently producing a noun with an empty verb menu.
 */
const ONLY_STAR_VERBS = new Set([
  'contact',  // people rows: read + watchlist. No contact-specific governed write exists.
  'document', // project notes: edited through the notes routes, not the action registry.
  'signal',   // market_news headlines: nothing governed acts on a headline.
]);

/**
 * Actions with NO searchable subject, on purpose.
 *
 * Derived, not hand-written: an action claims the exemption by declaring
 * `nounIdShape: 'pseudo'` in ACTION_GRAMMAR, beside the registry, with the
 * reason in a comment. `dist_campaign_create` is the only holder today and the
 * declaration predates this test — a create action has no subject yet, and its
 * executor ignores `subjectId` entirely.
 *
 * The exemption is checked for STALENESS below: if the subject type later becomes
 * searchable, the claim is no longer true and the test says so.
 */
const EXEMPT_SHAPE = 'pseudo';

/**
 * Subject types deliberately WITHHELD from desk-level search, and therefore from
 * ⌘K — the opposite trade to EXEMPT_SHAPE above. There the action has no subject;
 * here it has a perfectly real one that must not be findable yet.
 *
 * `/v1/search` is mounted desk-level with `requireOperator` and no
 * `requireWorkspace` (search.ts:446) because ⌘K has to work everywhere. Groups
 * that own a compartment are filtered by entitlement (search.ts:154), which is
 * genuinely a fix — but `capAtLeast(ents.gps, 'view')` is satisfied by two
 * principals GPS Phase 1 has not closed off:
 *
 *  1. the shared machine key — `access/entitlements.ts:39` `machineMap()` loops
 *     `WORKSPACE_IDS` granting `operate`, so `OPERATOR_API_KEY` holds `gps`;
 *  2. any newly-added roster member with zero grant rows —
 *     `entitlements.ts:56-61` falls back to `legacyEntitlements(role)`, and
 *     `workspaces.ts` loops every workspace (the plan's S0.1, not done).
 *
 * A GPS row names a third party's client relationship and its price. Adding a
 * `gps_client`/`gps_engagement` group to SEARCH_GROUPS today would make those
 * names typeable into ⌘K by both principals above, which is precisely the
 * "visible separation the data plane does not honour" the plan calls the single
 * most dangerous move in the programme (GPS_IMPLEMENTATION_PLAN.md §1.5).
 *
 * The cost is real and is the reason this is a Map with a reason string rather
 * than a bare set: the five GPS actions are NOT reachable from the command line.
 * They are invocable only via `POST /v1/actions/:id` and the GPS surface.
 *
 * TO RETIRE THIS: close S0.1 and exclude `legacy: false` compartments from
 * `machineMap()`, then add the group and delete the entry — the staleness check
 * below fails the moment the subject type becomes searchable, so the two cannot
 * drift into both being true.
 */
const WITHHELD_FROM_DESK_SEARCH = new Map<string, string>([
  [
    'gps_engagement',
    'a third party client relationship and its price; /v1/search is reachable by the shared ' +
      'machine key and by zero-grant roster members (plan S0.1 + machineMap, both open)',
  ],
]);

function addressables(): Addressable[] {
  return Object.values(ACTION_REGISTRY).map((a) => ({
    id: a.id,
    subjectTypes: a.subjectTypes,
    nounIdShape: ACTION_GRAMMAR[a.id]?.nounIdShape,
  }));
}

/**
 * Cross the boundary. Returns what is wrong, never throws — so the real
 * assertions and the positive controls can call the identical function.
 */
function crossBoundary(actions: Addressable[], searchable: readonly string[]): {
  unreachable: string[];
  staleExemptions: string[];
  exempt: string[];
  withheld: string[];
  staleWithholdings: string[];
} {
  const searchableSet = new Set(searchable);
  const unreachable: string[] = [];
  const staleExemptions: string[] = [];
  const exempt: string[] = [];
  const withheld: string[] = [];

  // A withholding is stale once the type IS searchable — checked against the
  // search table itself, not against the actions, so it fires even if no action
  // addresses the type any more.
  const staleWithholdings = [...WITHHELD_FROM_DESK_SEARCH.keys()]
    .filter((t) => searchableSet.has(t))
    .map((t) => `${t} is now emitted by GET /v1/search — remove it from WITHHELD_FROM_DESK_SEARCH`);

  for (const a of actions) {
    // A '*' action accepts any subject, so it is reachable if search can emit
    // anything at all.
    const reachable = a.subjectTypes.includes('*')
      ? searchable.length > 0
      : a.subjectTypes.some((t) => searchableSet.has(t));
    const claimsExemption = a.nounIdShape === EXEMPT_SHAPE;

    if (claimsExemption) {
      exempt.push(a.id);
      if (reachable) {
        staleExemptions.push(`${a.id} (declares nounIdShape:'${EXEMPT_SHAPE}' but ${a.subjectTypes.join('/')} IS searchable)`);
      }
      continue;
    }
    // Withheld: EVERY subject type it names is withheld. An action that also
    // addresses a searchable type is reachable and does not qualify — otherwise
    // one withheld type would excuse an action that is genuinely unwired.
    if (a.subjectTypes.length > 0 && a.subjectTypes.every((t) => WITHHELD_FROM_DESK_SEARCH.has(t))) {
      withheld.push(a.id);
      continue;
    }
    if (!reachable) unreachable.push(`${a.id} (subjectTypes: ${a.subjectTypes.join(', ')})`);
  }
  return { unreachable, staleExemptions, exempt, withheld, staleWithholdings };
}

/** Subject types search emits that no action names, and that are not declared. */
function unaddressed(actions: Addressable[], searchable: readonly string[]): string[] {
  const named = new Set(actions.flatMap((a) => a.subjectTypes).filter((t) => t !== '*'));
  return searchable.filter((t) => !named.has(t) && !ONLY_STAR_VERBS.has(t));
}

describe('GET /v1/search × ACTION_REGISTRY — the two vocabularies are one', () => {
  it('every governed action has a subject an operator can actually search for', () => {
    const { unreachable, staleExemptions, exempt, withheld, staleWithholdings } = crossBoundary(
      addressables(),
      SEARCHABLE_SUBJECT_TYPES,
    );

    expect(
      unreachable,
      'these governed actions address a subject type GET /v1/search cannot emit, so no ⌘K noun ' +
        'will ever match them. Either add a group to SEARCH_GROUPS in routes/search.ts, or — if ' +
        `the action genuinely has no subject — declare nounIdShape: '${EXEMPT_SHAPE}' in ` +
        'actions/grammar.ts with the reason',
    ).toEqual([]);

    expect(
      staleExemptions,
      `an action claims the '${EXEMPT_SHAPE}' no-subject exemption but its subject type is now ` +
        'searchable — remove the exemption rather than leaving a false claim in the grammar',
    ).toEqual([]);

    // Pin the exemption set. Growing it is allowed; growing it SILENTLY is not.
    expect(exempt.sort()).toEqual(['dist_campaign_create']);

    expect(
      staleWithholdings,
      'a subject type is listed as withheld from desk search AND emitted by it — one of the two ' +
        'is a lie. Remove the WITHHELD_FROM_DESK_SEARCH entry',
    ).toEqual([]);

    // Pin the withheld set exactly, for the same reason as `exempt`: these actions
    // are NOT reachable from ⌘K, which is a cost the change accepted knowingly.
    // A sixth action inheriting that cost by accident must fail here.
    expect(withheld.sort()).toEqual([
      'gps_conflict_declare',
      'gps_discount_approve',
      'gps_engagement_accept',
      'gps_proposal_issue',
      'gps_status_change',
    ]);
  });

  it('every subject type search emits is one the registry addresses', () => {
    expect(
      unaddressed(addressables(), SEARCHABLE_SUBJECT_TYPES),
      'GET /v1/search emits these subject types and no registry action names any of them. If it ' +
        'is a typo, fix the spelling in SEARCH_GROUPS; if the object really only has the ' +
        "'*' verbs, add it to ONLY_STAR_VERBS with the reason",
    ).toEqual([]);
  });

  it('no two groups claim the same subject type', () => {
    // Two groups on one subject type is not illegal, but it is always a mistake
    // in practice: the same verbs on two id shapes, and the second one 404s.
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const g of SEARCH_GROUPS) {
      const prev = seen.get(g.subjectType);
      if (prev) clashes.push(`${g.subjectType}: ${prev} + ${g.key}`);
      else seen.set(g.subjectType, g.key);
    }
    expect(clashes).toEqual([]);
  });

  it('every group states a subject type, a plural label and a singular one', () => {
    for (const g of SEARCH_GROUPS) {
      expect(g.subjectType, `${g.key} has no subjectType`).toMatch(/^[a-z][a-z_]*$/);
      expect(g.label.length, `${g.key} label`).toBeGreaterThan(2);
      // The singular label is what the row's type chip shows when the object has
      // no inspector to derive a label from, so an empty one is a blank chip.
      expect(g.typeLabel.length, `${g.key} typeLabel`).toBeGreaterThan(2);
    }
  });

  /* ── the artifact, not the idea of it ─────────────────────────────────────
   * Everything above reads the group TABLE. This one calls the route and reads
   * the JSON, because a group that throws at runtime is absent from the response
   * while still present in the table — indistinguishable from the outside. */
  describe('the wire', () => {
    const TEST_KEY = 'dev-operator-key-change-me';
    const app = createApp();

    /* ── ARRANGE THE ROWS, DO NOT BORROW SOMEBODY'S SEED ──────────────────────
     *
     * These three tests used to query 'counsel' and 'bitcoin' and assert on
     * whatever came back. That made them a test of the developer's database, and
     * CI proved it: run 30172427631 on `406a8ed` went RED with
     *
     *   AssertionError: no group at all came back from three queries — is the DB
     *   seeded?: expected 0 to be greater than 1
     *
     * because CI's Postgres is migrated and EMPTY. Worse than the failure: the
     * other two tests said `if (!g) return`, so on that same empty database they
     * passed while asserting nothing at all — the exact "reads as coverage and
     * provides none" shape this programme keeps finding. (And I had reported that
     * run as green without opening it. It was not.)
     *
     * So: two rows, inserted here, matched by a token no real row can contain.
     * The floor below is then a property of THIS test rather than of the machine,
     * and the two tests after it assert on a row whose column values are known —
     * which is strictly more than "the seed happened to have one".
     *
     * Explicit ids rather than RETURNING: deterministic cleanup, and no dependence
     * on the driver's result shape. */
    const TOKEN = 'zzsearchboundaryfixture';
    const FIXTURE_PROJECT_ID = '00000000-0000-0000-0000-00000000f00d';
    const FIXTURE_DECISION_ID = 'dec_zzsearchboundaryfixture';

    beforeAll(async () => {
      process.env.OPERATOR_API_KEY = TEST_KEY;
      if (!HAS_DB) return;
      const db = getDb();
      // `source` and `name` are NOT NULL; `tier` defaults to 'catalog', and this
      // row is deliberately 'tracked' so the third test's assertion has a value it
      // could not have got by accident.
      await db.execute(sql`
        INSERT INTO projects (id, name, source, tier)
        VALUES (${FIXTURE_PROJECT_ID}::uuid, ${`${TOKEN} token`}, 'manual', 'tracked')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier
      `);
      await db.execute(sql`
        INSERT INTO command_decisions (id, phase, decision, status)
        VALUES (${FIXTURE_DECISION_ID}, 'P1', ${`${TOKEN} decision`}, 'open')
        ON CONFLICT (id) DO UPDATE SET decision = EXCLUDED.decision, status = EXCLUDED.status
      `);
    });

    afterAll(async () => {
      if (HAS_DB) {
        const db = getDb();
        // Always, even after a failure: a leaked fixture makes the NEXT run's
        // failure harder to read than this one's.
        await db.execute(sql`DELETE FROM command_decisions WHERE id = ${FIXTURE_DECISION_ID}`);
        await db.execute(sql`DELETE FROM projects WHERE id = ${FIXTURE_PROJECT_ID}::uuid`);
      }
      await closeDb();
    });

    /**
     * Why these three carry an explicit timeout when nothing else in this suite does.
     *
     * The route fans out to fourteen queries, one of them an ILIKE over the 54k-row
     * projects table, and vitest runs 35 files in parallel workers each holding its
     * own pg pool. Measured warm the whole route is 4–15ms and cold 106ms; measured
     * inside a full `vitest run` it exceeded the 5s default once in three runs. The
     * suite is already at that edge without this file — a second full run failed in
     * `intel100x.test.ts`, which this change does not touch — so the default is too
     * tight for DB-backed route tests generally. Raising it here is the part I own;
     * a suite-wide `testTimeout` belongs to whoever owns vitest.config.ts.
     *
     * This is a timeout, not a retry: a genuinely broken route still fails.
     */
    const DB_TIMEOUT = 20_000;

    async function search(q: string): Promise<{ groups: Array<{ key: string; subjectType: string; typeLabel: string; inspector?: string; items: Array<{ id: string }> }> }> {
      const res = await app.request(`/v1/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      });
      expect(res.status).toBe(200);
      return (await res.json()).data;
    }

    itDb('every group on the wire carries a registry-legal subject type', async () => {
      const legal = new Set(
        Object.values(ACTION_REGISTRY).flatMap((a) => a.subjectTypes).filter((t) => t !== '*'),
      );
      // Three unrelated queries so the assertion is not made about one table.
      const seen = new Set<string>();
      for (const q of ['a', 'counsel', 'e']) {
        for (const g of (await search(q)).groups) {
          seen.add(g.subjectType);
          expect(typeof g.subjectType, `${g.key}.subjectType`).toBe('string');
          expect(g.items.length, `${g.key} returned an empty group`).toBeGreaterThan(0);
          if (!ONLY_STAR_VERBS.has(g.subjectType)) {
            expect(legal.has(g.subjectType), `${g.key} emits '${g.subjectType}', which no action accepts`).toBe(true);
          }
        }
      }
      // THE NON-VACUITY FLOOR, moved off the seed and onto the arranged rows.
      // Two different tables match one token, so two distinct subject types must
      // come back on ANY database — empty CI included. The loop above is worthless
      // without this, which is precisely what CI demonstrated when it was a
      // question about the seed instead of an assertion about these rows.
      const arranged = (await search(TOKEN)).groups;
      const keys = new Set(arranged.map((g) => g.key));
      expect(keys.has('projects'), `the arranged project did not come back for '${TOKEN}'`).toBe(true);
      expect(keys.has('command_decisions'), `the arranged decision did not come back for '${TOKEN}'`).toBe(true);
      for (const g of arranged) {
        seen.add(g.subjectType);
        if (!ONLY_STAR_VERBS.has(g.subjectType)) {
          expect(legal.has(g.subjectType), `${g.key} emits '${g.subjectType}', which no action accepts`).toBe(true);
        }
      }
      expect(seen.size, 'two tables matched one token and produced fewer than two subject types').toBeGreaterThan(1);
    }, DB_TIMEOUT);

    itDb('a program decision arrives as a command_decision with its status', async () => {
      const { groups } = await search(TOKEN);
      const g = groups.find((x) => x.key === 'command_decisions');
      expect(g, 'the arranged decision is absent — the group is broken, not the seed').toBeDefined();
      if (!g) return; // narrowing only; the expect above is the assertion
      expect(g.subjectType).toBe('command_decision');
      // No inspector: a decision is actionable and has no drawer. The client must
      // be told that rather than left to guess.
      expect(g.inspector).toBeUndefined();
      const item = g.items[0] as unknown as { seed?: Record<string, unknown> };
      expect(item.seed?.status, 'without status, command_decide and command_reopen_decision are both offered and one must 404').toBeDefined();
      // The arranged row is 'open', so this checks the value travels — not merely
      // that the key exists, which a hardcoded null would also satisfy.
      expect(item.seed?.status, 'the status on the wire is not the status in the row').toBe('open');
    }, DB_TIMEOUT);

    itDb('a project arrives with its tier, so `track` can be precondition-filtered', async () => {
      const { groups } = await search(TOKEN);
      const g = groups.find((x) => x.key === 'projects');
      expect(g, 'the arranged project is absent — the group is broken, not the seed').toBeDefined();
      if (!g) return; // narrowing only; the expect above is the assertion
      const item = g.items.find((x) => x.id === FIXTURE_PROJECT_ID) as unknown as { seed?: Record<string, unknown> } | undefined;
      expect(item, 'the arranged project id is not among the returned items').toBeDefined();
      expect(item?.seed?.tier, 'track declares precondition tier in [catalog]; without tier the client treats it as satisfied and offers a no-op').toBeDefined();
      // 'tracked', not the column default 'catalog' — so a hardcoded default in the
      // mapper would fail here rather than look correct.
      expect(item?.seed?.tier, 'the tier on the wire is not the tier in the row').toBe('tracked');
    }, DB_TIMEOUT);
  });
});

/* ══════════════════════ the guard, proven able to fail ═══════════════════════
 *
 * Three of four agents in the previous phase shipped a brand-new guard that could
 * not fail. These controls call `crossBoundary` and `unaddressed` — the exact
 * functions the assertions above call — with a fabricated 23rd action, rather
 * than re-implementing the rule they are certifying.
 *
 * The real wiring is proven separately and by hand: deleting the `command_tasks`
 * group from SEARCH_GROUPS turns the first test red naming
 * `command_set_task_status`. That mutation is recorded in the change's report.
 */
describe('the boundary check can fail', () => {
  const real = addressables();

  it('a 23rd action with an unreachable subject type is caught', () => {
    const withGhost = [...real, { id: 'ghost_action', subjectTypes: ['ghost_object'] }];
    const { unreachable } = crossBoundary(withGhost, SEARCHABLE_SUBJECT_TYPES);
    expect(unreachable).toEqual(['ghost_action (subjectTypes: ghost_object)']);
  });

  it('the same action passes once it declares the no-subject exemption', () => {
    const withGhost = [...real, { id: 'ghost_action', subjectTypes: ['ghost_object'], nounIdShape: 'pseudo' }];
    const { unreachable, staleExemptions, exempt } = crossBoundary(withGhost, SEARCHABLE_SUBJECT_TYPES);
    expect(unreachable).toEqual([]);
    expect(staleExemptions).toEqual([]);
    // …and the exemption is DELIBERATE, not a hole: it shows up in the set the
    // first test pins, so adding one without editing that expectation is red too.
    expect(exempt).toContain('ghost_action');
  });

  it('an exemption that is no longer true is caught', () => {
    const stale = [...real, { id: 'ghost_action', subjectTypes: ['project'], nounIdShape: 'pseudo' }];
    const { staleExemptions } = crossBoundary(stale, SEARCHABLE_SUBJECT_TYPES);
    expect(staleExemptions).toHaveLength(1);
    expect(staleExemptions[0]).toContain('ghost_action');
  });

  it('a withholding stops applying the moment the type becomes searchable', () => {
    // The trade WITHHELD_FROM_DESK_SEARCH makes is only defensible while the type
    // really is absent from search. Pretend a gps_engagement group was added: the
    // withholding must go stale rather than quietly keep excusing the five
    // actions — which is how a documented exception becomes a blind spot.
    const asIf = [...SEARCHABLE_SUBJECT_TYPES, 'gps_engagement'];
    const { staleWithholdings } = crossBoundary(real, asIf);
    expect(staleWithholdings).toHaveLength(1);
    expect(staleWithholdings[0]).toContain('gps_engagement');
  });

  it('a withheld action that also names a searchable subject is not excused', () => {
    // Withholding is all-or-nothing on purpose. If it matched on `some()`, naming
    // one withheld type alongside anything else would move the action into the
    // withheld bucket and out of `unreachable` — a genuinely unwired subject
    // laundered through a documented exception. This control fails under `some()`.
    const mixed = [{ id: 'ghost_action', subjectTypes: ['gps_engagement', 'ghost_object'] }];
    const { withheld, unreachable } = crossBoundary(mixed, SEARCHABLE_SUBJECT_TYPES);
    expect(withheld).toEqual([]);
    expect(unreachable).toEqual(['ghost_action (subjectTypes: gps_engagement, ghost_object)']);
  });

  it('a real action becomes unreachable when its group leaves the search table', () => {
    // The mutation the first test is really guarding, applied to the input rather
    // than to the source file: drop command_task from what search can emit.
    const without = SEARCHABLE_SUBJECT_TYPES.filter((t) => t !== 'command_task');
    const { unreachable } = crossBoundary(real, without);
    expect(unreachable).toEqual(['command_set_task_status (subjectTypes: command_task)']);
  });

  it('a misspelled subject type in SEARCH_GROUPS is caught', () => {
    expect(unaddressed(real, [...SEARCHABLE_SUBJECT_TYPES, 'command_partners'])).toEqual(['command_partners']);
  });

  it('the reverse check does not accept a `*` action as addressing everything', () => {
    // `notify` has subjectTypes ['*']. If the reverse check counted that, every
    // typo would look addressed and the check would certify nothing.
    expect(unaddressed(real, ['ghost_object'])).toEqual(['ghost_object']);
  });
});
