/**
 * The grammar: noun → verb → params (TERMINAL Phase 3).
 *
 * Pure functions over the generated manifest, deliberately DOM-free so the rules
 * that decide what an operator may do are testable directly. The UI in
 * CommandBody renders what these return; it does not decide anything itself.
 *
 * The governing principle is that the client filters for HONESTY, never for
 * security. `invokeAction` re-checks subject type, role, workspace entitlement and
 * params on every call, and it remains the only authority. What the client owes
 * the operator is a menu that does not offer things that cannot work — and, when
 * something is blocked, a reason rather than silence.
 *
 * Filtered out vs shown-as-blocked is a deliberate distinction:
 *   - WRONG SUBJECT TYPE → absent. Offering "set campaign status" on a project is
 *     noise, not information.
 *   - UNMET PRECONDITION → absent. `track` on an already-tracked project returns
 *     `promoted: false` with HTTP 200 — a silent no-op the operator would read as
 *     success, so it must not be offered.
 *   - INSUFFICIENT ROLE / MISSING ENTITLEMENT → shown, blocked, with the reason.
 *     Hiding these teaches the operator the capability does not exist; showing
 *     them teaches what to request. That is also the honest answer to "why can't
 *     I do this?"
 */

import type { ActionManifest, ManifestAction, ParamKind, ParamProperty } from '@/lib/command/types';
import { INSPECTOR_TO_OBJECT, type SearchGroup } from '@/lib/objectRegistry';

export type Capability = 'view' | 'operate' | 'approve';

export interface Principal {
  role: 'operator' | 'approver';
  /** workspace id → capability held. Absent means none. */
  entitlements: Record<string, Capability | undefined>;
}

export interface Noun {
  /** Must match a registry `subjectTypes` value exactly. */
  type: string;
  id: string;
  label: string;
  /** Whatever state fields are known, for precondition checks. */
  state?: Record<string, unknown>;
}

/**
 * The subject a search result denotes.
 *
 * ONE LINE, and it used to be the whole defect: the noun's type was resolved by
 * mapping the result's INSPECTOR through `INSPECTOR_TO_OBJECT`, which yields the
 * web reading vocabulary (`project`, `contact`, `signal`, …) and never the
 * registry's addressing vocabulary (`command_decision`, `dist_listing`,
 * `member`, …). `matchesSubject` compared them literally and was right to: they
 * are different languages. 15 of 22 governed actions had no reachable noun.
 *
 * Now GET /v1/search states the registry's own subject type and this function
 * passes it through untouched. There is no table to keep in step.
 *
 * THE FALLBACK IS FOR DEPLOY SKEW, not for convenience. Web and API deploy
 * separately; a bundle that requires `subjectType` against an API that predates
 * it would build nouns with `type: undefined` and offer NO verbs on ANY object —
 * turning a 7-of-22 gap into 0 of 22. Falling back to the old mapping degrades to
 * exactly the previous behaviour instead, which is the honest failure mode. It is
 * dead code against a current API, and the boundary test in `apps/api` measures
 * the real thing, so it cannot mask a regression.
 */
export function nounFromSearchResult(
  group: Pick<SearchGroup, 'subjectType' | 'inspector'>,
  item: { id: string; label: string; seed?: Record<string, unknown> },
): Noun | null {
  const type = group.subjectType
    ?? (group.inspector ? INSPECTOR_TO_OBJECT[group.inspector] : undefined);
  if (!type) return null;
  return { type, id: item.id, label: item.label, state: item.seed };
}

export type BlockedReason =
  | { kind: 'role'; needed: 'approver' }
  | { kind: 'entitlement'; workspace: string; needed: Capability; held: Capability | 'none' };

export interface Verb {
  action: ManifestAction;
  /** null when the operator may run it now. */
  blocked: BlockedReason | null;
}

const CAP_ORDER: Capability[] = ['view', 'operate', 'approve'];

function capAtLeast(held: Capability | undefined, needed: Capability): boolean {
  if (!held) return false;
  return CAP_ORDER.indexOf(held) >= CAP_ORDER.indexOf(needed);
}

/** The capability an action needs on its workspace, derived from its minRole. */
export function neededCapability(action: ManifestAction): Capability {
  return action.minRole === 'approver' ? 'approve' : 'operate';
}

function matchesSubject(action: ManifestAction, noun: Noun): boolean {
  return action.subjectTypes.includes('*') || action.subjectTypes.includes(noun.type);
}

/**
 * Is the subject in a state where this action can do anything?
 *
 * Unknown state is treated as SATISFIED rather than blocked: the alternative is
 * hiding a legal verb because the client happened not to have loaded a field,
 * which would make the command line's completeness depend on which page you
 * happened to be on.
 */
function preconditionMet(action: ManifestAction, noun: Noun): boolean {
  const pre = action.grammar.precondition;
  if (!pre) return true;
  const value = noun.state?.[pre.field];
  if (value === undefined || value === null) return true;
  return pre.in.includes(String(value));
}

/**
 * Every verb legal on this noun for this principal, blocked ones included with
 * their reason. Sorted so unblocked verbs come first, then alphabetically — a
 * stable order matters for muscle memory.
 */
export function verbsFor(
  manifest: ActionManifest,
  noun: Noun,
  principal: Principal,
): Verb[] {
  return manifest.actions
    .filter((a) => matchesSubject(a, noun) && preconditionMet(a, noun))
    .map((action): Verb => {
      if (action.minRole === 'approver' && principal.role !== 'approver') {
        return { action, blocked: { kind: 'role', needed: 'approver' } };
      }
      if (action.workspace) {
        const needed = neededCapability(action);
        const held = principal.entitlements[action.workspace];
        if (!capAtLeast(held, needed)) {
          return {
            action,
            blocked: { kind: 'entitlement', workspace: action.workspace, needed, held: held ?? 'none' },
          };
        }
      }
      return { action, blocked: null };
    })
    .sort((x, y) => {
      if (!x.blocked !== !y.blocked) return x.blocked ? 1 : -1;
      return x.action.label.localeCompare(y.action.label);
    });
}

/** Human sentence for a blocked verb. Says what to do, not just what failed. */
export function blockedExplanation(blocked: BlockedReason): string {
  if (blocked.kind === 'role') {
    return 'Needs approver authority. Ask an approver to run it, or request the role.';
  }
  const held = blocked.held === 'none' ? 'no access' : `only '${blocked.held}'`;
  return `Needs '${blocked.needed}' on ${blocked.workspace}; you have ${held}. Request access from the workspace switcher.`;
}

/* ── params ───────────────────────────────────────────────────────────────── */

export interface Prompt {
  name: string;
  /**
   * What the operator reads, derived from `name`.
   *
   * The command line used to render the raw JSON key, uppercased by CSS, so a
   * governed write asked for `SUBJECTID` and `OVERRIDEGATE`. That is documentation
   * dependence by definition — it requires knowing the API to answer the prompt — and
   * the Phase 7 operability audit is what surfaced it across all 44 parameters at
   * once. Derived rather than hand-authored per param so a new action cannot ship
   * without one, and computed HERE rather than in the view so the command line and the
   * `?` manual cannot describe the same field differently.
   */
  label: string;
  required: boolean;
  kind: ParamKind;
  /** Fixed choices, from the schema enum or a runtime value set. */
  choices?: string[];
  type: 'string' | 'number' | 'boolean' | 'record';
  maxLength?: number;
  minimum?: number;
}

/** Acronyms that must not be title-cased into "Id" or "Url". */
const ACRONYMS = new Set(['id', 'url', 'sla', 'usd', 'kyc', 'aml', 'rfi', 'pir', 'api']);

/**
 * `overrideGate` → "Override gate", `subjectId` → "Subject ID", `due_at` → "Due at".
 *
 * Deliberately mechanical. A per-parameter label table in the registry would be the
 * nicer copy and the worse system: it is another thing to forget, and the failure is
 * silent — the prompt just falls back to a key the operator cannot interpret.
 */
export function humaniseParam(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/);
  return words
    .map((w, i) => (ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function kindOf(action: ManifestAction, name: string, prop: ParamProperty): ParamKind {
  const declared = action.grammar.paramKinds?.[name];
  if (declared) return declared;
  if (prop.type === 'object') return 'record';
  return 'value';
}

function typeOf(prop: ParamProperty): Prompt['type'] {
  if (prop.type === 'number' || prop.type === 'integer') return 'number';
  if (prop.type === 'boolean') return 'boolean';
  if (prop.type === 'object') return 'record';
  return 'string';
}

/**
 * The prompts for an action, in the order they should be asked.
 *
 * Ordering is a governance decision, not cosmetics:
 *   1. required values first — the operator's actual intent;
 *   2. optional values;
 *   3. overrides LAST and never pre-selected. An override accepts risk on the
 *      operator's authority, so it must be a deliberate extra step rather than
 *      something you tab through;
 *   4. reasons after the override they justify, so the prompt reads as
 *      "override … because …";
 *   5. secrets last of all, never pre-filled, never retained.
 */
export function promptsFor(action: ManifestAction, valueSets: Record<string, string[]>): Prompt[] {
  const props = action.params.properties ?? {};
  const required = new Set(action.params.required ?? []);

  const prompts: Prompt[] = Object.entries(props).map(([name, prop]) => {
    const kind = kindOf(action, name, prop);
    const source = action.grammar.enumFrom?.[name];
    return {
      name,
      label: humaniseParam(name),
      required: required.has(name),
      kind,
      // A runtime value set wins over the schema: the schema has no enum for
      // these at all (the server resolves them from the roster or the seed).
      choices: source ? valueSets[source] : prop.enum,
      type: typeOf(prop),
      maxLength: typeof prop.maxLength === 'number' ? prop.maxLength : undefined,
      minimum: typeof prop.minimum === 'number' ? prop.minimum : undefined,
    };
  });

  const rank = (p: Prompt): number => {
    if (p.kind === 'secret') return 4;
    if (p.kind === 'reason') return 3;
    if (p.kind === 'override') return 2;
    return p.required ? 0 : 1;
  };

  return prompts.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/* ── validation ───────────────────────────────────────────────────────────── */

export interface Problem {
  field: string | null;
  message: string;
}

/**
 * Advisory client-side validation. ADVISORY IN BOTH DIRECTIONS, by measurement:
 *
 *  - zod's `.refine()` is silently dropped by z.toJSONSchema, so some invalid
 *    input passes here and the server rejects it. Compensated where it matters by
 *    `grammar.atLeastOneOf`, which carries the lost refinements explicitly.
 *  - the emitted schema says `additionalProperties: false` while zod v4 STRIPS
 *    unknown keys, making a literal validator stricter than the server. So unknown
 *    keys are deliberately NOT an error here.
 *
 * The point is to stop an operator wasting a round trip on an obviously incomplete
 * command — never to decide whether the command is allowed.
 */
export function validate(
  action: ManifestAction,
  values: Record<string, unknown>,
): Problem[] {
  const problems: Problem[] = [];
  const props = action.params.properties ?? {};

  for (const name of action.params.required ?? []) {
    const v = values[name];
    if (v === undefined || v === null || v === '') {
      problems.push({ field: name, message: `${name} is required` });
    }
  }

  for (const [name, raw] of Object.entries(values)) {
    if (raw === undefined || raw === '') continue;
    const prop = props[name];
    if (!prop) continue; // unknown key: the server strips it, so not an error here

    if (prop.enum && !prop.enum.includes(String(raw))) {
      problems.push({ field: name, message: `${name} must be one of: ${prop.enum.join(', ')}` });
    }
    if (typeof prop.maxLength === 'number' && String(raw).length > prop.maxLength) {
      problems.push({ field: name, message: `${name} is longer than ${prop.maxLength} characters` });
    }
    if (prop.type === 'number' && Number.isNaN(Number(raw))) {
      problems.push({ field: name, message: `${name} must be a number` });
    }
    if (typeof prop.minimum === 'number' && Number(raw) < prop.minimum) {
      problems.push({ field: name, message: `${name} must be at least ${prop.minimum}` });
    }
  }

  // The refinements JSON Schema lost.
  for (const group of action.grammar.atLeastOneOf ?? []) {
    const anyPresent = group.some((f) => {
      const v = values[f];
      return v !== undefined && v !== null && v !== '';
    });
    if (!anyPresent) {
      problems.push({ field: group[0], message: `Set at least one of: ${group.join(', ')}` });
    }
  }

  // An override without its reason. registry.ts enforces this server-side; saying
  // it here saves a round trip on a mistake that is easy to make.
  const kinds = action.grammar.paramKinds ?? {};
  const overrideOn = Object.entries(kinds).some(([n, k]) => k === 'override' && values[n] === true);
  if (overrideOn) {
    const reasonField = Object.entries(kinds).find(([, k]) => k === 'reason')?.[0];
    const reason = reasonField ? values[reasonField] : undefined;
    if (!String(reason ?? '').trim()) {
      problems.push({
        field: reasonField ?? null,
        message: 'An override has to be justified — the reason is recorded in the audit.',
      });
    }
  }

  return problems;
}

/**
 * Strip values the server would reject or that must never leave the machine in a
 * log. Secrets are PASSED (the server needs them to verify step-up) but callers
 * must never persist the returned object.
 */
export function buildParams(action: ManifestAction, values: Record<string, unknown>): Record<string, unknown> {
  const props = action.params.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(values)) {
    if (!props[name]) continue;
    if (raw === undefined || raw === '') continue;
    const prop = props[name];
    out[name] = prop.type === 'number' ? Number(raw) : raw;
  }
  return out;
}
