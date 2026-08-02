/**
 * Unified object search (Palantir-grade Phase 1.4).
 *   GET /v1/search?q=  — one query, every object type, ranked, pushable.
 *
 * Backed by pg_trgm indexes (migration 0035) so ILIKE over the 54k-row projects
 * table is fast. Returns the SAME group shape as search-around (RelatedGroup),
 * so the frontend renders it with the existing component. Powers Cmd-K.
 *
 * ── WHY EACH GROUP NOW CARRIES `subjectType` ─────────────────────────────────
 *
 * ⌘K reached 7 of 22 governed actions (measured in a browser, Phase C). Not
 * because anything was broken: because two type systems that never met were
 * being compared literally. The command line resolved a noun's type through
 * `INSPECTOR_TO_OBJECT`, which only ever yields the eleven web `ObjectType`
 * names (`project`, `contact`, `signal`, …), while ACTION_REGISTRY addresses
 * subjects as `command_decision`, `command_partner`, `dist_listing`, `member`, …
 * `grammar.ts:matchesSubject` was correctly reporting that the two vocabularies
 * have almost nothing in common.
 *
 * The fix is NOT a mapping table from ObjectType → subject type. A hand-kept map
 * is the artefact that drifts; it would reproduce this defect somewhere else in
 * six months. Instead this route — the only place in the system that knows which
 * ROW it just selected — states the registry's own subject type on the group, so
 * a noun arrives already speaking the language the actions are written in. The
 * client uses it verbatim and translates nothing.
 *
 * Two things keep that honest, because a declared string can still be misspelled:
 *   - `SEARCH_GROUPS` is the single source for both the response and the exported
 *     `SEARCHABLE_SUBJECT_TYPES`, so a group cannot exist without appearing in
 *     the surface a test can see;
 *   - `__tests__/searchActionBoundary.test.ts` crosses the boundary in BOTH
 *     directions against the real ACTION_REGISTRY: every action must have a
 *     searchable subject (or an explicit exemption), and every subject type this
 *     route emits must be one the registry actually addresses. A typo
 *     (`command_partners`) fails there rather than silently emptying a menu.
 *
 * A compile-time union would be better still, but `RegistryAction.subjectTypes`
 * is `string[]`, so no literal type exists to import; see the test's header.
 */
import { Hono } from 'hono';
import { TEAM, capAtLeast, type WorkspaceId } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { loadEntitlements } from '../access/entitlements.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });
const PER_GROUP = 8;

export const searchRoutes = new Hono<{ Variables: AuthVariables }>();

interface Item { id: string; label: string; sublabel?: string; seed?: Record<string, unknown> }

interface Group {
  key: string;
  label: string;
  /**
   * Singular type name for the row's chip. Only consulted when there is no
   * `inspector` to derive the label from — see objectRegistry.searchTypeLabel.
   */
  typeLabel: string;
  /** The ACTION_REGISTRY subject type. The command line uses this verbatim. */
  subjectType: string;
  /**
   * The L3 drawer for this object, when one exists. ABSENT is meaningful: a
   * program task or a launch blocker is fully ACTIONABLE from ⌘K but has no
   * reader, so Shift-Enter has nothing to open and the client must not pretend
   * otherwise.
   */
  inspector?: string;
  count: number;
  items: Item[];
}

/** What every source gets: the raw query, the escaped ILIKE pattern, who asks. */
interface SearchCtx { q: string; like: string; actor: string; isApprover: boolean }

type Row = Record<string, unknown>;
type Source = (ctx: SearchCtx) => Promise<{ items: Item[]; count: number } | null>;

interface GroupSpec {
  key: string;
  label: string;
  typeLabel: string;
  subjectType: string;
  inspector?: string;
  source: Source;
  /**
   * The compartment that owns these rows, or omitted for genuinely desk-level
   * objects (projects, people, notes, news) that every operator may read.
   *
   * WHY THIS EXISTS. `/v1/search` is mounted desk-level — it is deliberately not
   * behind `requireWorkspace`, because ⌘K has to work everywhere. But it queries
   * `command_*`, `dist_*` and `access_requests`, so it read across three
   * compartments for anyone with an operator credential, whatever their grants
   * said. The compartment gate on `/v1/command/*` was walked straight around by
   * typing the same words into ⌘K.
   *
   * That was survivable while the roster was three people who hold everything.
   * It stops being survivable the moment a compartment holds a third party's
   * confidential material, which is what `gps` is for — so the fix lands before
   * that data exists rather than after.
   */
  workspace?: WorkspaceId;
}

/**
 * A SQL-backed source. The query MUST select `COUNT(*) OVER() AS total`.
 *
 * Errors are swallowed to `null` deliberately and unchanged from the original
 * `grp()`: half the tables below arrive with a migration that may not have been
 * applied yet, and ⌘K going blank is a far worse failure than one group being
 * absent from a search.
 */
function sqlSource(
  build: (ctx: SearchCtx) => { sql: string; params: unknown[] } | null,
  map: (r: Row) => Item,
): Source {
  return async (ctx) => {
    try {
      const q = build(ctx);
      if (!q) return null;
      const { rows } = await getPool().query(q.sql, q.params);
      if (rows.length === 0) return null;
      const count = Number((rows[0] as Row).total ?? rows.length);
      return { items: (rows as Row[]).map(map), count };
    } catch {
      return null;
    }
  };
}

/** The common case: one `$1` bound to the ILIKE pattern. */
const onLike = (sql: string) => (ctx: SearchCtx) => ({ sql, params: [ctx.like] as unknown[] });

/**
 * Which groups this principal may be shown — applied BEFORE any query runs.
 *
 * Filtering results afterwards would still execute every query and still pull
 * other compartments' rows into this process; filtering the specs means an
 * unentitled compartment is never read. Exported so the rule is testable without
 * a database, because the interesting cases are about absence.
 *
 * An untagged group is desk-level by declaration (projects, contacts, notes,
 * news, members) and always visible. `capAtLeast(undefined, 'view')` is false, so
 * a missing grant denies rather than defaulting open.
 */
export function visibleGroups(
  specs: readonly GroupSpec[],
  ents: Partial<Record<WorkspaceId, string>>,
): readonly GroupSpec[] {
  return specs.filter(
    (spec) => !spec.workspace || capAtLeast(ents[spec.workspace] as never, 'view'),
  );
}

/**
 * Every group GET /v1/search can emit, and the ONLY place they are declared.
 *
 * Order is result priority: the client shows one row from each matched group
 * before filling remaining slots in this order, so a small precise group is
 * never buried under eight projects.
 */
export const SEARCH_GROUPS: readonly GroupSpec[] = [
  /* ── the objects with readers (unchanged behaviour, plus a subject type) ── */
  {
    key: 'projects', label: 'Projects', typeLabel: 'Project',
    subjectType: 'project', inspector: 'project',
    // Tracked first, then by priority. Trigram-accelerated.
    source: sqlSource(
      onLike(
        `SELECT p.id, p.name, p.ticker, p.tier, s.band, COUNT(*) OVER() AS total
           FROM projects p LEFT JOIN scores s ON s.project_id = p.id
          WHERE p.name ILIKE $1 OR p.ticker ILIKE $1
          ORDER BY (p.tier = 'tracked') DESC, s.priority_score DESC NULLS LAST
          LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        id: String(r.id),
        label: String(r.name ?? 'Project'),
        sublabel: [r.ticker, r.tier === 'catalog' ? 'catalog' : (r.band as string)]
          .filter(Boolean).join(' · ') || undefined,
        // `tier` is here for the GRAMMAR, not for the drawer (ProjectInspector
        // ignores its seed). `track` declares `precondition: tier in [catalog]`,
        // and without the field the client treated the state as unknown — which
        // counts as satisfied — so ⌘K offered "Track token" on an already-tracked
        // project. That call returns HTTP 200 with `promoted: false`: the silent
        // no-op the precondition rule exists to prevent.
        seed: { tier: r.tier },
      }),
    ),
  },
  {
    key: 'contacts', label: 'Contacts', typeLabel: 'Contact',
    subjectType: 'contact', inspector: 'contact',
    source: sqlSource(
      onLike(
        `SELECT id, project_id, name, title, email, COUNT(*) OVER() AS total
           FROM people WHERE name ILIKE $1 OR email ILIKE $1
          ORDER BY verified DESC, contactability_score DESC NULLS LAST LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        id: `${String(r.project_id)}:${String(r.id)}`,
        label: String(r.name ?? 'Contact'),
        sublabel: (r.title as string) || (r.email as string) || undefined,
      }),
    ),
  },
  {
    key: 'deals', workspace: 'sales', label: 'Deals', typeLabel: 'Deal',
    subjectType: 'deal', inspector: 'deal',
    source: sqlSource(
      onLike(
        `SELECT d.id, d.stage, p.name, COUNT(*) OVER() AS total
           FROM deals d JOIN projects p ON p.id = d.project_id
          WHERE p.name ILIKE $1 ORDER BY d.updated_at DESC LIMIT ${PER_GROUP}`,
      ),
      (r) => ({ id: String(r.id), label: String(r.name ?? 'Deal'), sublabel: `deal · ${String(r.stage ?? '')}` }),
    ),
  },
  {
    key: 'notes', label: 'Notes', typeLabel: 'Document',
    subjectType: 'document', inspector: 'document',
    source: sqlSource(
      onLike(
        `SELECT id, title, body, COUNT(*) OVER() AS total
           FROM project_notes WHERE title ILIKE $1 ORDER BY updated_at DESC LIMIT ${PER_GROUP}`,
      ),
      (r) => ({ id: String(r.id), label: (r.title as string) || 'Note', seed: { title: r.title, body: r.body, kind: 'note' } }),
    ),
  },
  {
    key: 'news', label: 'News', typeLabel: 'Signal',
    subjectType: 'signal', inspector: 'signal',
    source: sqlSource(
      onLike(
        `SELECT id, title, url, source, COUNT(*) OVER() AS total
           FROM market_news WHERE title ILIKE $1 ORDER BY published_at DESC NULLS LAST LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        id: String(r.id), label: String(r.title ?? 'Headline'), sublabel: (r.source as string) || undefined,
        seed: { kind: 'news', title: r.title, url: r.url, detail: `via ${String(r.source ?? '')}` },
      }),
    ),
  },

  /* ── LCX COMMAND: actionable, no reader ───────────────────────────────────
   * Read authority matches the existing program read routes exactly — GET
   * /v1/command/tasks|decisions|partners are `requireOperator` with no
   * workspace gate, so surfacing the same rows in search grants nothing new.
   * The governed WRITES stay gated: an operator without `command` sees these
   * verbs SHOWN AND BLOCKED with the remedy, which is the Phase 3 doctrine —
   * hiding a capability teaches that it does not exist.
   *
   * Each item states its own state field in `seed`. `grammar.preconditionMet`
   * treats state it does not know as SATISFIED — the right default, because the
   * alternative is hiding a legal verb — but that default is only safe if the
   * state is usually there. Sending it is what stops the menu offering a verb
   * whose only possible outcome is a 404 or a silent no-op. */
  {
    key: 'command_tasks', workspace: 'command', label: 'Program tasks', typeLabel: 'Program task',
    subjectType: 'command_task',
    source: sqlSource(
      onLike(
        `SELECT id, title, workstream, status, owner, COUNT(*) OVER() AS total
           FROM command_tasks WHERE title ILIKE $1 OR id ILIKE $1 OR workstream ILIKE $1
          ORDER BY updated_at DESC NULLS LAST LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        id: String(r.id),
        label: String(r.title ?? r.id),
        sublabel: [r.workstream, r.status].filter(Boolean).join(' · ') || undefined,
        seed: { status: r.status },
      }),
    ),
  },
  {
    key: 'command_decisions', workspace: 'command', label: 'Program decisions', typeLabel: 'Program decision',
    subjectType: 'command_decision',
    source: sqlSource(
      onLike(
        `SELECT id, phase, decision, status, chosen, COUNT(*) OVER() AS total
           FROM command_decisions WHERE decision ILIKE $1 OR id ILIKE $1
          ORDER BY (status='open') DESC, id LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        id: String(r.id),
        label: String(r.decision ?? r.id),
        sublabel: [r.phase, r.status].filter(Boolean).join(' · ') || undefined,
        // `status` decides between `command_decide` (open) and
        // `command_reopen_decision` (decided). Stating it means the menu never
        // offers the one that would 404.
        seed: { status: r.status },
      }),
    ),
  },
  {
    key: 'command_partners', workspace: 'command', label: 'Program partners', typeLabel: 'Partner',
    subjectType: 'command_partner',
    source: sqlSource(
      onLike(
        `SELECT id, name, type, pipeline_stage, tier, COUNT(*) OVER() AS total
           FROM command_partners WHERE name ILIKE $1 OR type ILIKE $1 OR id ILIKE $1
          ORDER BY capability_score DESC NULLS LAST LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        id: String(r.id),
        label: String(r.name ?? r.id),
        sublabel: [r.type, r.pipeline_stage].filter(Boolean).join(' · ') || undefined,
        seed: { pipeline_stage: r.pipeline_stage },
      }),
    ),
  },
  {
    key: 'command_requirements', workspace: 'command', label: 'Listing requirements', typeLabel: 'Listing requirement',
    subjectType: 'command_requirement',
    source: sqlSource(
      onLike(
        `SELECT num, requirement, status, path, COUNT(*) OVER() AS total
           FROM command_requirements WHERE requirement ILIKE $1 OR status ILIKE $1
          ORDER BY num LIMIT ${PER_GROUP}`,
      ),
      // The action addresses the requirement by `num`, not by a surrogate id
      // (`UPDATE command_requirements … WHERE num=$2`), so that is the noun id.
      (r) => ({
        id: String(r.num),
        label: String(r.requirement ?? `Requirement ${String(r.num)}`),
        sublabel: [`#${String(r.num)}`, r.path, r.status].filter(Boolean).join(' · '),
        seed: { status: r.status },
      }),
    ),
  },
  {
    key: 'command_blockers', workspace: 'command', label: 'Launch blockers', typeLabel: 'Launch blocker',
    subjectType: 'command_blocker',
    source: sqlSource(
      onLike(
        `SELECT num, blocker, category, severity, status, COUNT(*) OVER() AS total
           FROM command_blockers WHERE blocker ILIKE $1 OR category ILIKE $1
          ORDER BY num LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        id: String(r.num),
        label: String(r.blocker ?? `Blocker ${String(r.num)}`),
        sublabel: [`#${String(r.num)}`, r.category, r.status].filter(Boolean).join(' · '),
        seed: { status: r.status },
      }),
    ),
  },

  /* ── DISTRIBUTION COMMAND ─────────────────────────────────────────────── */
  {
    key: 'dist_listings', workspace: 'distribution', label: 'Distribution surfaces', typeLabel: 'Distribution surface',
    subjectType: 'dist_listing',
    source: sqlSource(
      onLike(
        `SELECT surface_id, status, owner, url, COUNT(*) OVER() AS total
           FROM dist_listings WHERE surface_id ILIKE $1 OR status ILIKE $1
          ORDER BY surface_id LIMIT ${PER_GROUP}`,
      ),
      // dist_listings has no display name; the surface id IS the name, and it is
      // also what `dist_listing_set_status` matches on (WHERE surface_id=$6).
      (r) => ({
        id: String(r.surface_id),
        label: String(r.surface_id),
        sublabel: String(r.status ?? ''),
        seed: { status: r.status },
      }),
    ),
  },
  {
    key: 'dist_campaigns', workspace: 'distribution', label: 'Campaigns', typeLabel: 'Campaign',
    subjectType: 'dist_campaign',
    source: sqlSource(
      onLike(
        `SELECT id, name, kind, status, token_incentivized, COUNT(*) OVER() AS total
           FROM dist_campaigns WHERE name ILIKE $1 OR kind ILIKE $1
          ORDER BY updated_at DESC NULLS LAST LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        id: String(r.id),
        label: String(r.name ?? 'Campaign'),
        sublabel: [r.kind, r.status].filter(Boolean).join(' · ') || undefined,
        seed: { status: r.status },
      }),
    ),
  },

  /* ── LCX OS governance ────────────────────────────────────────────────── */
  {
    key: 'access_requests', workspace: 'governance', label: 'Access requests', typeLabel: 'Access request',
    subjectType: 'access_request',
    // Read scope MIRRORS GET /v1/access/requests, which shows a non-approver
    // only their OWN requests. Search must not become the wide read that route
    // deliberately is not.
    source: sqlSource(
      (ctx) => ({
        sql: `SELECT id, member_id, workspace, capability, status, COUNT(*) OVER() AS total
                FROM access_requests
               WHERE (member_id ILIKE $1 OR workspace ILIKE $1)
                 AND ($2::boolean OR member_id = $3)
               ORDER BY (status='pending') DESC, created_at DESC LIMIT ${PER_GROUP}`,
        params: [ctx.like, ctx.isApprover, ctx.actor],
      }),
      (r) => ({
        id: String(r.id),
        label: `${String(r.member_id)} → ${String(r.workspace)} (${String(r.capability)})`,
        sublabel: String(r.status ?? ''),
        seed: { status: r.status },
      }),
    ),
  },
  {
    key: 'members', label: 'Desk members', typeLabel: 'Desk member',
    subjectType: 'member',
    // The roster is code, not a table (@lcx/shared TEAM) — the same list
    // `findMemberById` validates every grant against, so this cannot drift from
    // what grant_entitlement will accept.
    source: async (ctx) => {
      const needle = ctx.q.toLowerCase();
      const hits = TEAM.filter(
        (m) => m.id.includes(needle) || m.name.toLowerCase().includes(needle) || m.email.includes(needle),
      );
      if (hits.length === 0) return null;
      return {
        count: hits.length,
        items: hits.slice(0, PER_GROUP).map((m) => ({
          id: m.id,
          label: m.name,
          sublabel: `${m.email} · ${m.role}`,
        })),
      };
    },
  },
  /**
   * THE MARKET-ABUSE PERIMETER'S SUBJECT — an asset symbol the desk has an opinion about.
   *
   * `workspace: 'marketing'` IS LOAD-BEARING HERE IN A WAY IT IS NOT FOR MOST GROUPS.
   * `visibleGroups()` filters the SPECS before any query runs, so an operator without
   * `marketing` at view never causes this SELECT to execute. That matters more than
   * usual because the rows ARE the inside information: a hit on `SOL` in this group says
   * LCX holds unpublished price-significant information about SOL (MiCA Art 90(1)). A
   * result-side filter would have run the query and pulled the symbols into this process
   * first, which is why the compartment check is on the spec and not on the output.
   *
   * WHY IT EXISTS AT ALL. `marketing_embargo_enter`, `marketing_embargo_lift` and
   * `marketing_holdings_declare` address `subjectType: 'marketing_asset'`, and
   * `searchActionBoundary.test.ts` refuses a governed action whose subject no ⌘K noun can
   * ever match — a verb an operator cannot aim is not a capability. Without this group
   * the three actions were reachable only by typing an id nobody could look up.
   *
   * LIVE ROWS ONLY (`lifted_at IS NULL`). A lifted embargo is public history, not a
   * perimeter, and offering it as a target for `marketing_embargo_lift` would invite
   * lifting something already lifted.
   *
   * NO `sublabel` CARRYING THE STATE, deliberately: `mnpi_pending` next to a symbol in a
   * result list is the disclosure in three words, and ⌘K results are the one surface that
   * shows up over a shared screen. The state is on the desk page, behind the compartment.
   */
  {
    key: 'marketing_assets', workspace: 'marketing',
    label: 'Assets under embargo', typeLabel: 'Asset',
    subjectType: 'marketing_asset',
    source: sqlSource(
      onLike(
        `SELECT asset_symbol, event_ref, review_by, COUNT(*) OVER() AS total
           FROM marketing_asset_embargo
          WHERE lifted_at IS NULL AND asset_symbol ILIKE $1
          ORDER BY review_by ASC
          LIMIT ${PER_GROUP}`,
      ),
      (r) => ({
        // The action's subjectId IS the symbol (abuseRegister.ts MARKETING_ASSET_SUBJECT).
        id: String(r.asset_symbol),
        label: String(r.asset_symbol),
        // The opaque event slug, which the 0060 CHECK constraint guarantees carries no
        // prose — so it cannot leak the substance of the event into a result row.
        sublabel: String(r.event_ref),
      }),
    ),
  },
];

/**
 * Every subject type GET /v1/search can put in front of an operator, derived
 * from the group table rather than restated — the coverage test asserts against
 * this, and a list it could drift from would be worthless.
 */
export const SEARCHABLE_SUBJECT_TYPES: readonly string[] =
  SEARCH_GROUPS.map((g) => g.subjectType);

searchRoutes.get('/', requireOperator, async (c) => {
  const raw = (c.req.query('q') ?? '').trim();
  if (raw.length < 2) {
    return c.json({ data: { q: raw, groups: [] }, meta: meta() });
  }
  if (raw.length > 64) {
    return c.json({ error: 'Query too long', code: 'VALIDATION' }, 400);
  }
  // Escape ILIKE wildcards so they match literally; default escape char is '\'.
  const like = `%${raw.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const operator = c.get('operator');
  const ctx: SearchCtx = { q: raw, like, actor: operator.id, isApprover: operator.role === 'approver' };

  /**
   * COMPARTMENT SCOPING, APPLIED BEFORE THE QUERIES RUN.
   *
   * Filtering the RESULTS would still have executed every query and still have
   * put other compartments' rows in this process's memory; filtering the SPECS
   * means an unentitled compartment is never read at all. It is also cheaper.
   *
   * `loadEntitlements` is called directly rather than read off the context: the
   * grant map is only attached inside `requireWorkspace`, and this route is
   * deliberately not behind it. The loader caches per member for 60s, so on the
   * ⌘K path this is a map lookup, not a query. A machine principal (shared key,
   * monitor, ai) holds blanket `operate` and is unaffected — cron keeps working.
   */
  const ents = await loadEntitlements(getPool(), operator.id);
  const visible = visibleGroups(SEARCH_GROUPS, ents);

  const found = await Promise.all(visible.map((spec) => spec.source(ctx)));
  const groups: Group[] = [];
  visible.forEach((spec, i) => {
    const hit = found[i];
    if (!hit) return;
    groups.push({
      key: spec.key,
      label: spec.label,
      typeLabel: spec.typeLabel,
      subjectType: spec.subjectType,
      ...(spec.inspector ? { inspector: spec.inspector } : {}),
      count: hit.count,
      items: hit.items,
    });
  });

  return c.json({ data: { q: raw, groups }, meta: meta() });
});
