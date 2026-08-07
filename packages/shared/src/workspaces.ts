import type { TeamRole } from './operators.js';

/**
 * LCX OS — the workspace constitution (LCX ONE Phase 1).
 *
 * The grand platform is a multi-platform: each workspace is a
 * platform-within-the-platform with its own mission, surfaces, and need-to-know
 * boundary. This registry is COMPILED and git-versioned (zero-drift): the web
 * shell renders nav from it, the API guards namespaces from it, and the two can
 * never disagree. Postgres holds only the mutable side (who is entitled to
 * what — see migration 0042); this file holds what exists.
 *
 * Doctrine: need-to-know (CIA) — access is given, never assumed; one coherent
 * deck per person (Apple) — you see your workspaces, not everyone's.
 */

export type WorkspaceId =
  | 'command'
  | 'sales'
  | 'intel'
  | 'regulatory'
  | 'distribution'
  | 'governance'
  | 'marketing'
  | 'gps';

/** Capability ladder within a workspace. approve ⊃ operate ⊃ view. */
export type Capability = 'view' | 'operate' | 'approve';

const CAP_ORDER: Record<Capability, number> = { view: 0, operate: 1, approve: 2 };

/** True when `have` meets or exceeds `need` on the capability ladder. */
export function capAtLeast(have: Capability | undefined, need: Capability): boolean {
  if (!have) return false;
  return CAP_ORDER[have] >= CAP_ORDER[need];
}

/** member → workspace → capability. Absence of a key = no access. */
export type EntitlementMap = Partial<Record<WorkspaceId, Capability>>;

export interface WorkspaceDef {
  id: WorkspaceId;
  name: string;
  /** One-line mission shown on the switcher and the request-access surface. */
  mission: string;
  /** lucide icon name rendered by the shell (kept as a string — shared stays UI-free). */
  icon: string;
  /**
   * Web route path segments owned by this workspace (first path segment,
   * without leading slash; ':id'-style children inherit their parent segment).
   */
  webPaths: readonly string[];
  /** /v1 API namespaces guarded at 'view' capability for this workspace. */
  apiPrefixes: readonly string[];
  /** Where the shell lands when you switch here. */
  defaultLanding: string;
  /** Elevated workspaces get purpose-prompts on sensitive reads (Phase 2). */
  sensitivity: 'standard' | 'elevated';
  /** New compartments are default-deny (only approvers seeded); legacy ones are backfilled. */
  legacy: boolean;
  /**
   * May the SHARED MACHINE PRINCIPAL hold this compartment?
   *
   * `machineMap()` (`apps/api/src/access/entitlements.ts:36`) grants any non-roster
   * actor — the shared `OPERATOR_API_KEY`, `monitor:<id>`, `ai` — blanket `operate`,
   * and it used to loop EVERY workspace. That is deliberate for the compartments
   * with cron: the 15-minute marketing tick posts to `/v1/marketing/tick`
   * (`routes/marketing.ts:149`) with the shared key, and jobs across command,
   * sales, intel, regulatory, distribution and governance rely on the same thing.
   * Breaking that would break automation, which is why this is opt-OUT per
   * compartment rather than a blanket rule keyed off `legacy`.
   *
   * But a machine has no need-to-know for a compartment holding a THIRD PARTY's
   * confidential commercial terms. `gps` is the first of those, it has no cron, and
   * a shared key that every integration and monitor already carries is the least
   * attributable principal in the system — `gps_conflict_check.decided_by` written
   * by "operator" would be an audit row naming nobody. So `gps` opts out, and the
   * plan's §1.5 "isolation from the shared machine key: ABSENT" stops being true
   * for the one compartment where it mattered most.
   *
   * Set this `false` for any future compartment that holds client material and does
   * not need automation. If it needs BOTH, that wants a scoped machine identity
   * rather than the shared key — do not just flip this to `true`.
   */
  machineAccess: boolean;
}

export const WORKSPACES: readonly WorkspaceDef[] = [
  {
    id: 'command',
    name: 'US COMMAND',
    mission: 'The CEO’s US-launch command deck — partners, readiness, governed decisions.',
    icon: 'Command',
    webPaths: ['command-deck', 'command-partners', 'command-ops'],
    apiPrefixes: ['/v1/command'],
    defaultLanding: '/command-deck',
    sensitivity: 'elevated',
    legacy: true,
    machineAccess: true,
  },
  {
    id: 'sales',
    name: 'SALES ENGINE',
    mission: 'The BD desk — pipeline, deals, outreach, and the revenue loop.',
    icon: 'Target',
    webPaths: [
      'bd-pipeline', 'contacts', 'deal-board', 'deal-desk', 'outreach',
      'send-queue', 'outreach-ops', 'exchange-gaps', 'customer', 'targets',
      'coverage', 'claim-library',
    ],
    apiPrefixes: [
      '/v1/projects', '/v1/outreach', '/v1/outreach-ops', '/v1/handoffs',
      '/v1/deals', '/v1/dealdesk', '/v1/discovery',
    ],
    defaultLanding: '/bd-pipeline',
    sensitivity: 'standard',
    legacy: true,
    machineAccess: true,
  },
  {
    id: 'intel',
    name: 'INTELLIGENCE',
    mission: 'The analyst layer — ontology, monitors, forecasts, AI console, market picture.',
    icon: 'Radar',
    webPaths: [
      'command', 'brief', 'ai-tools', 'win-loss', 'forecast', 'scorecard',
      'market-news', 'market-map', 'graph', 'monitors', 'bd-kpis',
      'board-report', 'report-builder',
    ],
    apiPrefixes: [
      '/v1/intel', '/v1/graph', '/v1/ai', '/v1/kpis', '/v1/analytics',
      '/v1/monitors', '/v1/scenarios', '/v1/pirs',
    ],
    defaultLanding: '/command',
    sensitivity: 'standard',
    legacy: true,
    machineAccess: true,
  },
  {
    id: 'regulatory',
    name: 'REGULATORY TOOLKIT',
    mission: 'The compliance instrument set — state map, simulators, readiness, red flags.',
    icon: 'Scale',
    webPaths: [
      'regulatory-dashboard', 'ontology', 'states', 'products', 'simulator',
      'howey', 'scenario', 'readiness', 'brief-generator', 'capital-estimator',
      'roadmap', 'red-flags', 'competition', 'product-intel',
    ],
    apiPrefixes: [],
    defaultLanding: '/regulatory-dashboard',
    sensitivity: 'standard',
    legacy: true,
    machineAccess: true,
  },
  {
    id: 'distribution',
    name: 'DISTRIBUTION',
    mission: 'PayAgent DISTRIBUTION COMMAND — rails, listings, campaigns, growth engines.',
    icon: 'Rocket',
    webPaths: ['distribution'],
    apiPrefixes: ['/v1/distribution'],
    defaultLanding: '/distribution',
    sensitivity: 'elevated',
    legacy: false,
    machineAccess: true,
  },
  {
    /**
     * The seventh compartment (2026-07-31). Opened for the marketing team, whose
     * first instrument is X reply triage — the desk currently loses replies under
     * @lcx posts because nobody owns watching them.
     *
     * Deliberately a COMPARTMENT rather than a page on an existing one. Marketing
     * is a different team with a different need-to-know from the BD desk: they
     * should see their own surfaces and not the deal pipeline, and future
     * marketing tools (content calendar, campaign performance, brand mentions,
     * competitor social) should inherit gating and audit by adding a `webPath`
     * here rather than by another architecture conversation.
     *
     * `sensitivity: 'standard'` — the content is public tweets. Purpose-prompting
     * an operator for reading a reply that anyone on the internet can read would
     * be friction with no protective value, and cheapening the purpose-prompt is
     * how the elevated tiers stop meaning anything.
     *
     * `legacy: false` — default-deny, matching `distribution`. A new compartment
     * is granted, never assumed.
     */
    id: 'marketing',
    name: 'LCX MARKETING',
    mission: 'The marketing desk — X reply triage, drafted answers, brand watch.',
    icon: 'Megaphone',
    webPaths: ['marketing'],
    apiPrefixes: ['/v1/marketing'],
    defaultLanding: '/marketing',
    sensitivity: 'standard',
    legacy: false,
    machineAccess: true,
  },
  {
    /**
     * The eighth compartment (2026-07-31) — GLOBAL SERVICES, the services
     * business: MiCA white papers, legal-opinion coordination, GTM/TGE sprints,
     * marketing activation. Sold manually today (~$250k, four offers); this
     * compartment is where the offer→proposal→deposit loop lives.
     *
     * WHY A COMPARTMENT AND NOT A PAGE ON `sales`. `sales` is the LCX BD desk —
     * it pursues projects to list on LCX's own venue. GPS holds THIRD-PARTY
     * CLIENT material: a client's engagement scope, their price, their conflict
     * check. Those two need-to-knows must not be the same one, because a client
     * of the services business is not automatically a listing prospect and their
     * commercial terms are not LCX desk information.
     *
     * `sensitivity: 'elevated'` — the highest the type allows, and the only
     * defensible setting: these rows are a third party's confidential commercial
     * terms held on a regulated exchange's infrastructure. Purpose-prompting a
     * read here has real protective value (contrast `marketing`, where the
     * content is public tweets and prompting would cheapen the tier).
     *
     * `legacy: false` — and as of today (commit d62b965) that flag is
     * LOAD-BEARING, not documentation. `legacyEntitlements` below now filters on
     * it, so a `legacy: false` compartment is unreachable through the fail-open
     * path and unreachable by a freshly-added roster member: the ONLY way in is
     * an explicit, audited grant row. That property is why GPS may hold client
     * data at all. Before d62b965 the loop was `for (const w of WORKSPACES)` and
     * every zero-row member held every compartment — shipping GPS on top of that
     * would have produced a visible boundary the data plane did not honour.
     */
    id: 'gps',
    name: 'GLOBAL SERVICES',
    mission: 'The services business — scoped offers, priced proposals, engagements, margin.',
    icon: 'Globe',
    webPaths: ['gps'],
    apiPrefixes: ['/v1/gps'],
    defaultLanding: '/gps',
    sensitivity: 'elevated',
    legacy: false,
    // No cron, and it holds a third party's confidential terms — see machineAccess.
    machineAccess: false,
  },
  {
    id: 'governance',
    name: 'GOVERNANCE',
    mission: 'The Directorate — audit, decisions, weekly review, ops health, access control.',
    icon: 'Shield',
    webPaths: ['audit-log', 'ops', 'wbr', 'decisions', 'access', 'governance/controls'],
    apiPrefixes: ['/v1/audit', '/v1/wbr', '/v1/decisions', '/v1/governance'],
    defaultLanding: '/wbr',
    sensitivity: 'elevated',
    legacy: true,
    machineAccess: true,
  },
] as const;

export const WORKSPACE_IDS = WORKSPACES.map((w) => w.id) as readonly WorkspaceId[];

export function getWorkspace(id: WorkspaceId): WorkspaceDef {
  const ws = WORKSPACES.find((w) => w.id === id);
  if (!ws) throw new Error(`unknown workspace: ${id}`);
  return ws;
}

const PATH_TO_WORKSPACE: ReadonlyMap<string, WorkspaceId> = new Map(
  WORKSPACES.flatMap((w) => w.webPaths.map((p) => [p, w.id] as const)),
);

/**
 * Which workspace owns a web path — null for desk-level surfaces (home, tasks,
 * notes, integrations, settings, select) which every member always has.
 */
export function workspaceForPath(pathname: string): WorkspaceId | null {
  const seg = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  return PATH_TO_WORKSPACE.get(seg) ?? null;
}

/** Which workspace guards an API path — null means the namespace is ungated (desk/cross-cutting). */
export function workspaceForApiPath(path: string): WorkspaceId | null {
  for (const w of WORKSPACES) {
    for (const prefix of w.apiPrefixes) {
      if (path === prefix || path.startsWith(prefix + '/')) return w.id;
    }
  }
  return null;
}

/**
 * The FOUNDING desk — the three members migration 0042's backfill enumerated.
 *
 * This list exists so the no-lockout covenant below can apply to the people it
 * was actually written for, and to nobody else. It is deliberately a literal:
 * deriving it from OPERATORS would silently re-open the hole the moment someone
 * is added to the roster, which is exactly the failure this closes.
 */
export const FOUNDING_MEMBER_IDS: readonly string[] = ['nik', 'monty', 'sam'];

/**
 * The no-lockout covenant (Phase 1 backfill, desk decision 2026-07-24): the
 * three-person founding desk — Nik, Monty (approvers), Sam (operator) — keeps
 * access to the compartments that predate LCX OS if the grant table cannot be
 * read or has no rows for them. Grants remain governed, revocable and audited;
 * this is the floor, not the model.
 *
 * WHY THIS NOW FILTERS ON `legacy`, AND WHY THAT IS THE WHOLE POINT.
 *
 * This function's contract is "exactly the access everyone had before LCX OS
 * existed" (`apps/api/src/access/entitlements.ts:18`). A compartment created
 * AFTER LCX OS existed is, by definition, not in that set. But the loop used to
 * be `for (const w of WORKSPACES)` — every workspace, including the two declared
 * `legacy: false` precisely to mean default-deny (`distribution`, `marketing`).
 * So the fail-open path granted the two compartments that exist to be withheld.
 *
 * Worse, `legacy` was read by NO code anywhere: a grep across packages/shared,
 * apps/api and apps/web found only this type's declaration, the literal values
 * and two comments. A flag that documents a guarantee it does not enforce is
 * worse than no flag, because it is quoted in review as though it were a
 * control. Filtering here is what makes `legacy: false` mean something.
 *
 * CONSEQUENCE FOR NEW COMPARTMENTS. `marketing` (0046) and `gps` are reachable
 * only through an explicit, audited grant row — never through fail-open, never
 * through a fresh roster addition. That matters most for `gps`, which will hold
 * third-party client material.
 */
export function legacyEntitlements(role: TeamRole): EntitlementMap {
  const cap: Capability = role === 'approver' ? 'approve' : role === 'operator' ? 'operate' : 'view';
  const map: EntitlementMap = {};
  for (const w of WORKSPACES) {
    if (w.legacy) map[w.id] = cap;
  }
  return map;
}
