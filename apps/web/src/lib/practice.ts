/**
 * The practice range's server — a simulation that cannot reach one (T1 #20).
 *
 * WHY THE SIMULATION IS THE DESIGN AND NOT A SHORTCUT
 *
 * The brief offered two isolations for a sandbox: simulate the governed action
 * path in the browser, or run the real one against a sandbox workspace with a
 * server-side refusal for practice subjects. The second is more faithful and it
 * is the wrong trade here, for a reason that has nothing to do with effort: it
 * puts practice rows in the real audit spine. `invokeAction` writes
 * `object_actions` AND the hash-chained `audit_log` on every success
 * (registry.ts:1097-1113) — so a rehearsal would become an institutional record,
 * and the thing that makes the spine worth trusting is that everything in it
 * happened. A sandbox that can be told apart from production by a flag on a row
 * is a sandbox whose isolation is a `WHERE` clause someone can forget.
 *
 * So: nothing here touches the network, and that is enforced rather than
 * asserted. This module imports TYPES ONLY — no apiClient, no fetch, no
 * `components/command/invoke.ts`. `__tests__/practice.test.ts` walks the
 * transitive import graph of this file and of the page that renders it and fails
 * if a network door appears anywhere in it, and
 * `pages/__tests__/practiceRange.test.tsx` drives all five drills with `fetch`,
 * `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` replaced by
 * throwing spies. Both were watched failing (see those files).
 *
 * WHAT THE SIMULATION COSTS, STATED PLAINLY
 *
 * A gate whose behaviour changes server-side drifts from the practice version,
 * and no test can close that in general. What CAN be closed is the part that is
 * declared rather than computed, and it is closed three ways:
 *
 *  1. `gatesFor` DERIVES the gate list from the same generated manifest the real
 *     command line reads. A 23rd action that is approver-only, workspace-tagged,
 *     precondition-bearing, override-bearing or secret-bearing gets its gate in
 *     the practice range on the day it is generated, with nobody remembering
 *     this file exists.
 *  2. `PRACTICE_REMEDIES` carries the refusal sentences VERBATIM from
 *     `components/command/invoke.ts`, and the test asserts each one still appears
 *     in that file. Reword a remedy in production and the practice range fails
 *     the build rather than teaching last month's sentence.
 *  3. The test reads `apps/api/src/actions/registry.ts` across the package
 *     boundary and fails if it can throw a refusal code this table has never
 *     heard of. That is the "a new gate cannot exist in prod and be absent from
 *     practice" property, and it covers the two gates the manifest CANNOT
 *     express (SAT and compliance live inside executor bodies).
 *
 * The manifest is passed in as an argument rather than imported, for the reason
 * `lib/fastPath.ts` documents at length: one convenient import of the 22-action
 * manifest dragged 9KB into the eager bundle in Phase 6. A module with only type
 * imports cannot cost a byte anywhere.
 */

import type { ActionManifest, ManifestAction, ParamProperty } from './command/types';
import type { Capability } from '@/components/command/grammar';

/**
 * Every refusal an operator can meet in the practice range.
 *
 * Named after the SERVER's `code`, never its prose — the same rule
 * `components/command/invoke.ts` follows, and for the same reason: prose changes
 * without warning and a message-matching client silently starts mis-classifying.
 */
export type PracticeCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'WRONG_SUBJECT'
  | 'UNKNOWN_ACTION'
  | 'WORKSPACE_FORBIDDEN'
  | 'NOT_FOUND'
  | 'ALREADY_DECIDED'
  | 'SELF_LOCKOUT'
  | 'SAT_REQUIRED'
  | 'COMPLIANCE_GATE'
  /*
   * THE EMISSION WARRANT (2026-08-07). An operator meets both of these on a real
   * token-incentivised launch, so the practice range has to teach them or it is training
   * people for a system that no longer exists — which is what this file's own ratchet
   * caught the moment the gate landed.
   */
  | 'EMISSION_WARRANT_REFUSED'
  | 'CAMPAIGN_TRIGGER_NOT_STATED'
  | 'APPROVER_REQUIRED'
  | 'OVERRIDE_REASON_REQUIRED'
  | 'STEP_UP_REQUIRED'
  | 'SECOND_TIER_FORBIDDEN';

/**
 * The remedy the real command line shows for each code.
 *
 * `fragment` is the INVARIANT part of the sentence in
 * `components/command/invoke.ts` — the half that is not interpolated — and the
 * test asserts it still occurs there. Anything shorter would pass vacuously;
 * anything longer would break on a legitimate change to the interpolated half.
 *
 * FOUR CODES SHARE THE DEFAULT SENTENCE, AND ONE OF THEM IS A REAL DEFECT.
 * `invokeAction` throws `FORBIDDEN` — not `APPROVER_REQUIRED` — for the
 * registry's own approver gate (registry.ts:1007), which is six of the
 * twenty-two actions. `classify` has no case for `FORBIDDEN`, so those six fall
 * to "The server refused this action. Nothing was changed." and the operator is
 * never told that asking an approver is the remedy. `APPROVER_REQUIRED` is
 * reached from exactly one place: the token-incentivized campaign launch gate.
 * The practice range teaches the sentence prod actually shows, because teaching
 * the better sentence would be teaching a lie — and the defect is reported
 * rather than papered over here.
 */
export interface PracticeRemedy {
  /** Verbatim from invoke.ts. Asserted present by the test. */
  fragment: string;
  /** Is re-running with an override + a recorded reason a legitimate option? */
  overridable: boolean;
}

export const PRACTICE_REMEDIES: Record<PracticeCode, PracticeRemedy> = {
  VALIDATION: { fragment: 'Fix: ', overridable: false },
  // The four that fall through classify's switch to its default.
  FORBIDDEN: { fragment: 'The server refused this action. Nothing was changed.', overridable: false },
  WRONG_SUBJECT: { fragment: 'The server refused this action. Nothing was changed.', overridable: false },
  UNKNOWN_ACTION: { fragment: 'The server refused this action. Nothing was changed.', overridable: false },
  ALREADY_DECIDED: { fragment: 'The server refused this action. Nothing was changed.', overridable: false },
  SELF_LOCKOUT: { fragment: 'The server refused this action. Nothing was changed.', overridable: false },
  WORKSPACE_FORBIDDEN: { fragment: 'Request it from the workspace switcher.', overridable: false },
  NOT_FOUND: { fragment: 'is not in the state this action needs any more', overridable: false },
  SAT_REQUIRED: {
    fragment: 'File the missing tradecraft, or override with a recorded reason.',
    overridable: true,
  },
  COMPLIANCE_GATE: { fragment: 'Clear the blockers, or override with a recorded reason.', overridable: true },
  /*
   * NEITHER IS OVERRIDABLE, and that is the lesson. A compliance blocker can be overridden
   * with a recorded reason; an emission warrant cannot, because what it is missing is a
   * figure only the owner can state (the quarterly cap) or a declaration that attaches to a
   * named person under Art 91(3)(c). There is no reason an operator can type that substitutes
   * for either, so the remedy names who must act rather than offering an override.
   */
  EMISSION_WARRANT_REFUSED: { fragment: 'Nobody can override it: the owner must declare the quarterly LCX cap, and the launcher must declare their own LCX position, before a token-incentivised campaign goes live.', overridable: false },
  CAMPAIGN_TRIGGER_NOT_STATED: { fragment: 'This campaign does not say whether it emits LCX. Unknown is not no — set token_incentivized to a real boolean before advancing it.', overridable: false },
  APPROVER_REQUIRED: {
    fragment:
      'This needs approver authority. Ask an approver to run it — an override cannot grant authority you do not hold.',
    overridable: false,
  },
  OVERRIDE_REASON_REQUIRED: {
    fragment: 'Add a reason for the override — it is recorded in the audit.',
    overridable: true,
  },
  STEP_UP_REQUIRED: {
    fragment: 'Re-enter the desk passcode to confirm this action. It is verified server-side and never stored.',
    overridable: false,
  },
  /**
   * `grant_entitlement` refusing to give a second-tier `ext:` colleague an elevated
   * compartment or the approve tier. Kept practisable rather than exempt because the
   * remedy is a real decision an approver has to make — put them on the roster, or
   * grant something they can actually hold — and because it is the one refusal where
   * reaching for the override is the wrong instinct: the ceiling exists because the
   * passcode is shared, and no recorded reason makes a shared secret attributable.
   */
  SECOND_TIER_FORBIDDEN: {
    fragment:
      'A second-tier sign-in is a shared passcode, so it cannot hold this. Put them on the roster, or grant a non-elevated compartment at operate.',
    overridable: false,
  },
};

/**
 * Codes `registry.ts` can throw that the practice range deliberately does not
 * stage, each with the reason — an unexplained exemption is a mute button.
 * The cross-boundary test in `__tests__/practice.test.ts` fails if a code turns
 * up in the registry that is in neither this set nor `PRACTICE_REMEDIES`.
 */
export const NOT_PRACTISED: Record<string, string> = {
  CONFLICT:
    'A write that reported success and changed no rows — a database fault, not a gate. There is no operator remedy to rehearse.',
  IDEMPOTENT_IN_FLIGHT:
    'Replay protection on a concurrent duplicate of the same Idempotency-Key. It is a property of the transport, and the sandbox has no transport.',
  PURPOSE_REQUIRED:
    'A READ gate, not a write gate: it comes from apps/api/src/middleware/purpose.ts and no governed action can produce it. `classify` handles it because the same client sees both kinds of response — found by the test below, which is why it is written down rather than assumed.',
};

/* ── the world ────────────────────────────────────────────────────────────── */

/**
 * Gate inputs that live inside an executor's body and therefore CANNOT be
 * derived from the manifest.
 *
 * Deliberately declared per subject rather than mirroring the server's own
 * predicates. `command_decide` gates on `subjectId ∈ {dec_01, dec_19}`
 * (registry.ts:252) and the campaign gate reads a `token_incentivized` column —
 * copying either into the browser would be a second source of truth that rots
 * silently, and neither is the lesson. The lesson is what a program-critical
 * decision DOES to you when the tradecraft is missing.
 */
export interface PracticeGateInputs {
  /** Stands in for `dec_01` / `dec_19` — the SAT gate's subject list. */
  programCritical?: boolean;
  /** Which analytic reviews are on file. Empty is the interesting case. */
  reviewsOnFile?: readonly string[];
  /** Stands in for `dist_campaigns.token_incentivized`. */
  tokenIncentivized?: boolean;
  /** Stands in for the emission-budget engine's verdict. */
  overBudget?: boolean;
}

export interface PracticeSubject {
  /** Must be a `subjectTypes` value from the manifest. Asserted by the test. */
  type: string;
  /**
   * Always `practice-…`. Not decoration: it is the one property that makes a
   * practice id incapable of colliding with a production id, so if this module
   * ever DID reach a server the subject would not exist there either. Belt and
   * braces on top of the isolation, and asserted.
   */
  id: string;
  label: string;
  /** Whatever the grammar's preconditions need to read. */
  state: Record<string, unknown>;
  gateInputs: PracticeGateInputs;
}

export interface PracticeDrill {
  id: string;
  /** The flow this rehearses, in the operator's words. */
  title: string;
  actionId: string;
  subject: PracticeSubject;
  /** The one sentence that says what this rep is for. */
  teaches: string;
  /**
   * The refusal this drill is BUILT to produce on a first honest attempt, or
   * null when the drill is a clean write. A gate that refuses is the most
   * valuable thing in here, so four of the five drills have one.
   */
  meets: PracticeCode | null;
}

/**
 * The five flows Phase C measured, because those are the real job.
 *
 * No parallel fixture set: the SUBJECT TYPES, the legal states, the required
 * params and the choice lists all come from the generated manifest at render
 * time — `practiceSubjectsAreReal` asserts every type and every seeded state
 * value against it. What is written by hand here is four labels and a name, and
 * the names are prefixed so that nobody can mistake one for a real counterparty.
 *
 * The server-side demo seed (apps/api/src/seed/demo.ts) is NOT reused and cannot
 * be: apps/web has no dependency on apps/api by design, and a client-only
 * sandbox has nowhere to load it from. That is a real cost of this isolation and
 * it is recorded here rather than glossed — what the sandbox reuses is the two
 * sources of truth that can actually drift (the action manifest and the roster),
 * not the prose of a dataset.
 */
export const DRILLS: readonly PracticeDrill[] = [
  {
    id: 'triage',
    title: 'Triage a lead',
    actionId: 'assign',
    subject: {
      type: 'deal',
      id: 'practice-deal-1',
      label: 'PRACTICE — Northwind Chain listing',
      state: { stage: 'qualified' },
      gateInputs: {},
    },
    teaches:
      'Give it a real desk owner. The choices are the desk roster — a lane, not a free-text name — and leaving it blank is refused before the request would ever leave.',
    meets: 'VALIDATION',
  },
  {
    id: 'decide',
    title: 'Decide a gated decision',
    actionId: 'command_decide',
    subject: {
      type: 'command_decision',
      id: 'practice-decision-1',
      label: 'PRACTICE — which US exchange model',
      state: { status: 'open' },
      gateInputs: { programCritical: true, reviewsOnFile: [] },
    },
    teaches:
      'The one to rehearse. A program-critical decision refuses until the tradecraft is on file; the way through is an override WITH a recorded reason, and the override alone is refused again.',
    meets: 'SAT_REQUIRED',
  },
  {
    id: 'rfi',
    title: 'Record an RFI',
    actionId: 'command_rfi_record',
    subject: {
      type: 'command_partner',
      id: 'practice-partner-1',
      label: 'PRACTICE — Copper (custody RFI)',
      state: { stage: 'diligence' },
      gateInputs: {},
    },
    teaches:
      'Setting the status to returned upgrades the partner’s provenance to B2, and signed to A1 — the write is the evidence grade. The commercial VALUES are a second verb on the same partner — Set partner contact/terms — typed inline in the verb panel; this step records the RFI’s status only (partnerTermsFromKeyboard.test.ts pins the whole keyboard path).',
    meets: null,
  },
  {
    id: 'listing',
    title: 'Advance a listing',
    actionId: 'dist_listing_set_status',
    subject: {
      type: 'dist_listing',
      id: 'practice-listing-1',
      label: 'PRACTICE — CoinGecko surface',
      state: { status: 'submitted' },
      gateInputs: {},
    },
    teaches:
      'Workspace-tagged: the same verb is refused outright if you do not hold DISTRIBUTION at operate. Turn the entitlement off below and watch the sentence you would get.',
    meets: 'WORKSPACE_FORBIDDEN',
  },
  {
    id: 'campaign',
    title: 'Launch a campaign through its gate',
    actionId: 'dist_campaign_set_status',
    subject: {
      type: 'dist_campaign',
      id: 'practice-campaign-1',
      label: 'PRACTICE — token-incentivized creator push',
      state: { status: 'compliance_review' },
      gateInputs: { tokenIncentivized: true, reviewsOnFile: ['premortem'], overBudget: true },
    },
    teaches:
      'Two refusals that look alike and are not. Authority CANNOT be overridden — no reason unlocks it. The compliance blockers can, with a reason that is recorded against your name.',
    meets: 'APPROVER_REQUIRED',
  },
];

/* ── gates, derived ───────────────────────────────────────────────────────── */

export interface DerivedGate {
  code: PracticeCode;
  /** Why this action has this gate, in the operator's words. */
  why: string;
}

/** The capability an action needs on its workspace. Mirrors grammar.neededCapability. */
function neededCap(action: ManifestAction): Capability {
  return action.minRole === 'approver' ? 'approve' : 'operate';
}

function paramKindNames(action: ManifestAction, kind: string): string[] {
  return Object.entries(action.grammar.paramKinds ?? {})
    .filter(([, k]) => k === kind)
    .map(([name]) => name);
}

/**
 * Every gate this action can refuse on that the MANIFEST knows about.
 *
 * The completeness property the brief asks for: derived, never enumerated. Add a
 * 23rd governed action with an override param and the practice range can refuse
 * it for a missing reason without anyone editing this file. The two gates the
 * manifest cannot express — SAT and compliance, which live inside executor
 * bodies — are declared on the subject instead and are named in
 * `executorGatesFor`; the cross-boundary test covers those.
 */
export function gatesFor(action: ManifestAction): DerivedGate[] {
  const gates: DerivedGate[] = [];
  if (action.minRole === 'approver') {
    gates.push({ code: 'FORBIDDEN', why: `${action.id} is approver-only` });
  }
  if (action.workspace) {
    gates.push({
      code: 'WORKSPACE_FORBIDDEN',
      why: `needs '${neededCap(action)}' on the ${action.workspace} workspace`,
    });
  }
  if ((action.params.required?.length ?? 0) > 0 || (action.grammar.atLeastOneOf?.length ?? 0) > 0) {
    gates.push({ code: 'VALIDATION', why: 'some values are not optional' });
  }
  if (action.grammar.precondition) {
    const pre = action.grammar.precondition;
    gates.push({ code: 'NOT_FOUND', why: `only legal while ${pre.field} is ${pre.in.join(' or ')}` });
  }
  if (paramKindNames(action, 'override').length > 0) {
    gates.push({ code: 'OVERRIDE_REASON_REQUIRED', why: 'an override without a reason is refused' });
  }
  if (paramKindNames(action, 'secret').length > 0) {
    gates.push({ code: 'STEP_UP_REQUIRED', why: 'step-up re-auth is required at the moment of the write' });
  }
  return gates;
}

/**
 * The gates that live inside an executor body, keyed by what the SUBJECT
 * declares. Separate from `gatesFor` so the two kinds cannot be confused: one is
 * derived and complete, the other is a hand-written mirror and is not.
 */
export function executorGatesFor(action: ManifestAction, subject: PracticeSubject): DerivedGate[] {
  const gates: DerivedGate[] = [];
  if (action.id === 'command_decide' && subject.gateInputs.programCritical) {
    gates.push({ code: 'SAT_REQUIRED', why: 'program-critical: premortem + devil’s advocate must be on file' });
  }
  if (action.id === 'dist_campaign_set_status' && subject.gateInputs.tokenIncentivized) {
    gates.push({ code: 'APPROVER_REQUIRED', why: 'a token-incentivized launch is approver-only, and not overridable' });
    gates.push({ code: 'COMPLIANCE_GATE', why: 'premortem + legal check on file, and inside the emission budget' });
  }
  return gates;
}

/* ── the simulated write path ─────────────────────────────────────────────── */

export interface PracticePrincipal {
  role: 'operator' | 'approver';
  entitlements: Record<string, Capability | undefined>;
  /** How the audit would attribute the write. */
  actor: string;
}

export interface PracticeRefusal {
  ok: false;
  code: PracticeCode;
  /** The server's own sentence. */
  message: string;
  /** The remedy the real command line would show. */
  remedy: string;
  overridable: boolean;
  /** Structured detail, as `ActionError.data` carries it. */
  detail?: Record<string, unknown>;
}

export interface PracticeLedgerRow {
  seq: number;
  actionId: string;
  actionLabel: string;
  subjectType: string;
  subjectId: string;
  actor: string;
  /** Params as `object_actions.params` would hold them — secrets redacted. */
  params: Record<string, unknown>;
  /** ms since the drill was opened. Their OWN time, and nobody else's. */
  elapsedMs: number;
}

export interface PracticeSuccess {
  ok: true;
  /** What the write returned. */
  result: Record<string, unknown>;
  /** What the two spine tables would now hold. */
  row: Omit<PracticeLedgerRow, 'seq' | 'elapsedMs'>;
}

export type PracticeOutcome = PracticeSuccess | PracticeRefusal;

const CAP_ORDER: Capability[] = ['view', 'operate', 'approve'];
function capAtLeast(held: Capability | undefined, needed: Capability): boolean {
  return held ? CAP_ORDER.indexOf(held) >= CAP_ORDER.indexOf(needed) : false;
}

function refuse(
  code: PracticeCode,
  message: string,
  remedy: string,
  detail?: Record<string, unknown>,
): PracticeRefusal {
  return { ok: false, code, message, remedy, overridable: PRACTICE_REMEDIES[code].overridable, detail };
}

/** The default sentence, for the codes `classify` has no case for. */
const DEFAULT_REMEDY = PRACTICE_REMEDIES.FORBIDDEN.fragment;

/**
 * The schema check, done HERE rather than by calling `grammar.validate`.
 *
 * Deliberate duplication of a few lines: `validate` is the client's ADVISORY
 * check and the whole lesson of a governed write is that the server does not
 * trust it. If the practice server called the client validator, a value the
 * client waves through and the server rejects — the documented case, since
 * `.refine()` does not survive JSON Schema emission — could never be
 * demonstrated. Kept narrow on purpose: required, enum, maxLength, number.
 */
function schemaRefusal(action: ManifestAction, params: Record<string, unknown>): PracticeRefusal | null {
  const props: Record<string, ParamProperty> = action.params.properties ?? {};
  const issues: Array<{ path: string; message: string }> = [];
  for (const name of action.params.required ?? []) {
    const v = params[name];
    if (v === undefined || v === null || v === '') issues.push({ path: name, message: 'Required' });
  }
  for (const [name, raw] of Object.entries(params)) {
    const prop = props[name];
    // zod v4 STRIPS unknown keys rather than refusing them, so an unknown key is
    // silently dropped here too. The emitted `additionalProperties: false` is
    // stricter than the server and following it would refuse valid input.
    if (!prop || raw === undefined || raw === '') continue;
    if (prop.enum && !prop.enum.includes(String(raw))) {
      issues.push({ path: name, message: `Invalid option: expected one of ${prop.enum.join(', ')}` });
    }
    if (typeof prop.maxLength === 'number' && String(raw).length > prop.maxLength) {
      issues.push({ path: name, message: `Too long: at most ${prop.maxLength} characters` });
    }
    if (prop.type === 'number' && Number.isNaN(Number(raw))) {
      issues.push({ path: name, message: 'Expected a number' });
    }
    if (prop.type === 'object' && (typeof raw !== 'object' || raw === null)) {
      // A DEFECT IN THE REAL COMMAND LINE, mirrored here so the sandbox does not
      // wave through what production refuses. `command_rfi_record.values` is
      // `z.record(string, string)`; `promptsFor` gives it `kind: 'record'` AND a
      // `choices` list of the RFI field names, and `VerbPanel`'s Field tests
      // `choices` before it tests anything else — so ⌘K renders a picker of field
      // NAMES and sends the chosen name as a bare string. See the finding in the
      // Phase-8 report; the practice range does not teach that path.
      issues.push({ path: name, message: 'Expected a record of field → value' });
    }
  }
  for (const group of action.grammar.atLeastOneOf ?? []) {
    const any = group.some((f) => {
      const v = params[f];
      return v !== undefined && v !== null && v !== '';
    });
    if (!any) issues.push({ path: group[0]!, message: `Set at least one of: ${group.join(', ')}` });
  }
  if (issues.length === 0) return null;
  return refuse(
    'VALIDATION',
    issues.map((i) => i.message).join('; '),
    `Fix: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}`,
    { issues },
  );
}

/** Secrets never reach a log. Mirrors registry.ts `redactSecrets`. */
export function redactForLedger(action: ManifestAction, params: Record<string, unknown>): Record<string, unknown> {
  const secrets = new Set(paramKindNames(action, 'secret'));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) out[k] = secrets.has(k) ? '[redacted]' : v;
  return out;
}

/**
 * The practice range's `invokeAction`.
 *
 * THE ORDER OF THE CHECKS IS PART OF THE LESSON, so it mirrors
 * registry.ts:1000-1035 exactly: subject type, then authority, then the
 * workspace compartment, then the params, and only then the executor's own
 * gates. An operator who has practised here should never be surprised by WHICH
 * refusal arrives first — and the test asserts the ordering behaviourally, by
 * sending a request that violates two gates at once.
 *
 * Pure. No I/O of any kind, deliberately not even a clock: `elapsedMs` is
 * supplied by the caller so this function has nothing ambient to depend on.
 */
export function practiceInvoke(
  manifest: ActionManifest,
  actionId: string,
  subject: PracticeSubject,
  params: Record<string, unknown>,
  principal: PracticePrincipal,
): PracticeOutcome {
  const action = manifest.actions.find((a) => a.id === actionId);
  if (!action) {
    return refuse('UNKNOWN_ACTION', `No such action: ${actionId}`, DEFAULT_REMEDY);
  }
  if (!action.subjectTypes.includes('*') && !action.subjectTypes.includes(subject.type)) {
    return refuse('WRONG_SUBJECT', `${actionId} does not apply to ${subject.type}`, DEFAULT_REMEDY);
  }
  if (action.minRole === 'approver' && principal.role !== 'approver') {
    // FORBIDDEN, not APPROVER_REQUIRED — see PRACTICE_REMEDIES.
    return refuse('FORBIDDEN', `${actionId} requires approver`, DEFAULT_REMEDY);
  }
  if (action.workspace) {
    const needed = neededCap(action);
    if (!capAtLeast(principal.entitlements[action.workspace], needed)) {
      return refuse(
        'WORKSPACE_FORBIDDEN',
        `${actionId} requires '${needed}' on workspace '${action.workspace}'`,
        `You need '${needed}' on ${action.workspace}. Request it from the workspace switcher.`,
        { workspace: action.workspace, needed },
      );
    }
  }
  const bad = schemaRefusal(action, params);
  if (bad) return bad;

  // The precondition. On the server this is not a gate at all — it is an UPDATE
  // that matches no row and reports NOT_FOUND — which is why the remedy talks
  // about someone else having moved the object rather than about permission.
  const pre = action.grammar.precondition;
  if (pre) {
    const value = subject.state[pre.field];
    if (value !== undefined && value !== null && !pre.in.includes(String(value))) {
      return refuse(
        'NOT_FOUND',
        `${subject.type} not found in a state this action accepts`,
        `That ${subject.type} is not in the state this action needs any more — someone may have changed it. Re-open it to see where it stands.`,
      );
    }
  }

  const executorRefusal = runExecutorGates(action, subject, params, principal);
  if (executorRefusal) return executorRefusal;

  return {
    ok: true,
    result: describeWrite(action, params),
    row: {
      actionId: action.id,
      actionLabel: action.label,
      subjectType: subject.type,
      subjectId: subject.id,
      actor: principal.actor,
      params: redactForLedger(action, params),
    },
  };
}

/**
 * The two gates that live inside executor bodies.
 *
 * Mirrored by hand from registry.ts:244-278 (SAT) and 707-775 (compliance), and
 * that is a hand-written mirror with everything that implies — the cross-boundary
 * test can prove no NEW code has appeared, not that these two still behave the
 * same. What it can and does prove is the property that made the campaign gate a
 * real escalation once already: authority is checked BEFORE the overridable
 * blockers, so `overrideGate: true` can never buy the authority half.
 */
function runExecutorGates(
  action: ManifestAction,
  subject: PracticeSubject,
  params: Record<string, unknown>,
  principal: PracticePrincipal,
): PracticeRefusal | null {
  const onFile = new Set(subject.gateInputs.reviewsOnFile ?? []);
  const reasonGiven = String(params.overrideReason ?? '').trim().length > 0;

  if (action.id === 'command_decide' && subject.gateInputs.programCritical) {
    const missing = ['premortem', 'devils_advocate'].filter((k) => !onFile.has(k));
    if (missing.length > 0) {
      if (!params.overrideSat) {
        return refuse(
          'SAT_REQUIRED',
          `Program-critical decision: run the missing tradecraft first (${missing.join(' + ')}) — or override with a reason.`,
          `This decision needs ${missing.join(' and ')} on file first. File the missing tradecraft, or override with a recorded reason.`,
          { missing, subjectType: 'command_decision' },
        );
      }
      if (!reasonGiven) {
        return refuse(
          'OVERRIDE_REASON_REQUIRED',
          'SAT override requires a reason.',
          'Add a reason for the override — it is recorded in the audit.',
        );
      }
    }
    return null;
  }

  if (action.id === 'dist_campaign_set_status' && subject.gateInputs.tokenIncentivized) {
    const LAUNCH = new Set(['approved', 'live']);
    if (!LAUNCH.has(String(params.status))) return null;
    if (principal.role !== 'approver') {
      return refuse(
        'APPROVER_REQUIRED',
        'Launching a token-incentivized campaign requires approver authority.',
        PRACTICE_REMEDIES.APPROVER_REQUIRED.fragment,
      );
    }
    const missing = ['premortem', 'legal_check'].filter((k) => !onFile.has(k));
    const blockers: string[] = [];
    if (missing.length > 0) blockers.push(`compliance review missing (${missing.join(' + ')})`);
    if (subject.gateInputs.overBudget) blockers.push('projected reward spend exceeds the budget envelope');
    if (blockers.length > 0) {
      if (!params.overrideGate) {
        return refuse(
          'COMPLIANCE_GATE',
          `Cannot launch: ${blockers.join('; ')}. File the reviews (subject_type=dist_campaign) or override with a reason.`,
          `Blocked by: ${blockers.join('; ')}. Clear the blockers, or override with a recorded reason.`,
          { blockers, missing, overBudget: Boolean(subject.gateInputs.overBudget) },
        );
      }
      if (!reasonGiven) {
        return refuse(
          'OVERRIDE_REASON_REQUIRED',
          'Compliance-gate override requires a reason.',
          'Add a reason for the override — it is recorded in the audit.',
        );
      }
    }
    return null;
  }

  return null;
}

/**
 * What the write returned, in the shape the real executor returns it.
 *
 * Only the fields the practice drills can actually produce. Inventing a richer
 * result would be teaching an API that does not exist.
 */
function describeWrite(action: ManifestAction, params: Record<string, unknown>): Record<string, unknown> {
  switch (action.id) {
    case 'assign':
      return { owner: params.owner };
    case 'command_decide':
      return { decided: true, chosen: params.chosen };
    case 'command_rfi_record':
      return { status: params.status, merged: true };
    case 'dist_listing_set_status':
      return { status: params.status };
    case 'dist_campaign_set_status':
      return { status: params.status };
    default:
      return { ok: true };
  }
}

/* ── honest, self-referential progress ────────────────────────────────────── */

/**
 * Their OWN median time to a completed write, and nothing else.
 *
 * The plan forbids dark patterns as a hard rule, and the one that would fit here
 * most naturally is the worst: a streak, or a counter that goes down. Progress
 * has to be honest and self-referential — no target, no comparison to Monty, no
 * number that decays if they stop. A median over their own completed reps is
 * measurable, means something (it is the thing that gets faster), and cannot be
 * lost by going home.
 *
 * Returns null under two reps: one data point is not a median, and showing it as
 * one would be the same overclaim this programme keeps withdrawing.
 */
export function medianMs(samples: readonly number[]): number | null {
  if (samples.length < 2) return null;
  const s = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1]! + s[mid]!) / 2) : s[mid]!;
}
