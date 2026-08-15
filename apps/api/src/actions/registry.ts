/**
 * Governed action registry (Palantir-grade Phase 3.2). Each action declares its
 * subject types, permission, and a typed parameter schema; invokeAction
 * validates, enforces the role and the workspace entitlement, executes, and
 * writes BOTH the object_actions ledger and the hash-chained audit_log.
 *
 * THIS IS NOT THE ONLY WRITE PATH, and this comment used to say it was — "the ONE
 * path every server-side mutation takes". That was false for the whole of Phases
 * 3-7. `POST /v1/intel/actions` → intel/actions.ts `executeAction` is a second
 * path, reached by the object inspector, with its own object_actions and
 * audit_log inserts. Of the five ids it serves, `unflag` and `note_add` have no
 * entry here at all, so they are unreachable through invokeAction and absent from
 * the generated command grammar.
 *
 * That path has been brought up to this one's floor in place — it now validates
 * params with zod, enforces subject type and role via the same `actionsFor` the
 * read side uses, and redacts with the same `redactSecrets` — but it is still a
 * second door. Converging them means adding `unflag` and `note_add` here,
 * delegating executeAction to invokeAction, and regenerating the manifest
 * (`npm run gen:actions`, which rewrites actions/generated/manifest.canonical.json
 * and apps/web/src/lib/command/generated/actionManifest.ts). Until that lands,
 * "one audit spine" is true — both paths write the same two tables — and "one
 * permission gate" is not.
 *
 * Executors reuse existing domain services (notify, createManualTask, …) rather
 * than re-implement them — the registry is the governed front door, not a fork.
 */
import { z } from 'zod';
import type pg from 'pg';
import {
  findMemberById, WORKSPACE_IDS, capAtLeast,
  type Capability, type WorkspaceId,
  workspaceForPath,
} from '@lcx/shared';
import { notify } from '../notifications/service.js';
import { createManualTask } from '../tasks/service.js';
import { DEFAULT_ORG_ID } from '../intel/observations.js';
import {
  loadEntitlements,
  invalidateEntitlements,
  isSecondTierPrincipal,
  secondTierMayHold,
} from '../access/entitlements.js';
import { recordRevocation } from '../access/asOf.js';
import { env } from '../lib/env.js';
import { ActionError } from './types.js';
import type { ActorRole, RegistryAction } from './types.js';
import { GPS_ACTIONS } from '../gps/actions.js';
import { MARKETING_ABUSE_ACTIONS } from '../marketing/abuseRegister.js';
import { evaluateEmissionWarrant, mayReachStatus } from '../marketing/emissionWarrant.js';
import { observeAndRecordOneMouth, oneMouthCampaignSubject } from '../marketing/oneMouth.js';

/**
 * The action contract moved to ./types.js so an action module can live outside
 * this file without a cycle (see the docblock there). Re-exported here because
 * every existing importer names it from this module, and a rename with no
 * behaviour change is churn a reviewer has to read past.
 */
export { ActionError } from './types.js';
export type { ActorRole, ActionContext, RegistryAction } from './types.js';

/** Timing-safe string compare (constant-time when lengths match). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/* ══════════════════ WHAT MAY BE STORED IN AN href ══════════════════
 *
 * A LENGTH BOUND IS NOT A SCHEME CHECK, and `href: z.string().max(300)` was only
 * ever the first. `notify` writes its `href` straight through to
 * `notifications.href` (notifications/service.ts), so the value SURVIVES the
 * request that carried it and is replayed, later, to every reader of the readout.
 *
 * The readout is rendered inside the LCXOS webview. A `javascript:` href there is
 * not a phishing link — it is code executing in the app origin, next to six
 * `#[tauri::command]`s, one of which reads the desk credential out of the
 * Keychain. So the operator who clicks it is not the operator who stored it.
 *
 * THE CHECK BELONGS HERE, not only at the anchor, for one reason: there is exactly
 * one write path for this value and there are many read paths. A renderer fixed
 * today is a renderer someone adds tomorrow. Closing it server-side means the
 * dangerous value never reaches the database at all, and the ratchet on the web
 * side (apps/web/src/lib/__tests__/hrefSinks.test.ts) is the second layer rather
 * than the only one.
 *
 * WHY CONTROL CHARACTERS ARE REFUSED OUTRIGHT rather than stripped: a browser
 * removes ASCII whitespace and C0 controls BEFORE it reads the scheme, so
 * `java\tscript:alert(1)` navigates exactly as `javascript:alert(1)` does. Any
 * version of this that sanitises has to reproduce that stripping identically, and
 * a near-miss is a bypass. Refusing the character is the only form that does not
 * depend on getting someone else's parser right.
 *
 * A REFUSAL, not a coercion. The action fails with VALIDATION and the message
 * names the rule; nothing is silently rewritten into something adjacent that the
 * caller did not ask for.
 */
const NAVIGABLE_HREF_REFUSAL =
  'must be a site-relative path (starting "/") or an absolute http(s) URL — a stored href is '
  + 'replayed as a navigation inside the desktop webview, where any other scheme executes in '
  + 'the app origin';

export function isNavigableHref(raw: string): boolean {
  // C0 controls, DEL, and every ASCII space: stripped by the URL parser before the
  // scheme is read, so they are how `javascript:` gets past a naive prefix test.
  if (/[\u0000-\u0020\u007f]/.test(raw)) return false;
  if (raw.startsWith('//')) return false; // protocol-relative — that is someone else's origin
  if (raw.startsWith('/')) return true; // site-relative path
  return /^https?:\/\/[^/\\]/i.test(raw);
}

/**
 * A length-bounded href that must also be navigable.
 *
 * `.refine` deliberately, not a `.regex`: `z.toJSONSchema` does not emit refinements
 * (the same property `command_reopen_decision.reason` relies on, documented there), so
 * `manifest.canonical.json` and its hash are BYTE-IDENTICAL after this change and the
 * generated command grammar does not move. The server is simply stricter than the
 * advisory client schema — which is the right way round.
 */
const navigableHref = (max: number) =>
  z.string().max(max).refine(isNavigableHref, { message: NAVIGABLE_HREF_REFUSAL });

/**
 * A missing table is a DEPLOY-ORDER FACT. Every other database error is a FAULT.
 *
 * Migrations here land by hand in the Supabase SQL editor after the API deploys,
 * so a gate whose table does not exist yet must not dead-lock the desk — that is
 * the whole reason these gates have a fallback. But the fallback used to be
 * reached by a bare `catch`, which meant it also fired for faults. Measured
 * against a stub pool (see __tests__/gateFailOpen.test.ts): `57014` statement
 * timeout, `42501` permission denied, `40001` serialization failure and a bare
 * `ECONNRESET` ALL let a gated action through, on both gates. A statement timeout
 * on a busy Postgres therefore silently converted a gated write into an ungated
 * one — the most likely of the four to happen in production, and the least
 * visible, because nothing in the ledger said the gate had been skipped.
 *
 * This is the same rule access/entitlements.ts:69-76 already applies to the
 * entitlement loader, for the same reason it documents at :17-18. Deliberately
 * NOT a list of "safe" codes: the set of faults is open-ended, so the allowlist
 * has exactly one member.
 */
function isMissingTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

/** The campaign columns the launch gate reads. All `unknown` except where 0043
 *  constrains the shape: `token_incentivized` is typed `unknown` deliberately so
 *  the three-state check on it cannot be short-circuited by the type. */
interface CampaignGateRow {
  token_incentivized: unknown;
  budget_lcx: string | null;
  name: unknown;
  detail: string | null;
  created_by: string | null;
}

/**
 * The shape `marketing_holdings_declaration.member_id` will accept
 * (0060_marketing_abuse.sql:308). Mirrored rather than imported because it is a
 * SQL CHECK and there is no exported constant for it; the test in
 * `__tests__/emissionWarrantGate.test.ts` reads the migration and asserts the two
 * still agree, so a drift is loud instead of silent.
 */
const HOLDINGS_MEMBER_ID_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

type LauncherOfRecord =
  | { ok: true; memberId: string }
  | { ok: false; code: string; message: string };

/**
 * WHO THE ART 91(3)(c) QUESTION IS ABOUT — resolved from the campaign row, never
 * from the request and never from the principal pressing the button.
 *
 * ══ THE THING THIS FUNCTION EXISTS TO REFUSE TO DO ══
 * It never answers on a human's behalf. There is no fallback to `actor`, no
 * default, no empty-register-means-no-holding. Every branch that cannot identify
 * a named human REFUSES, because the alternative — quietly nominating somebody
 * as the launcher of record — attaches a personal liability to a person who was
 * never asked a question.
 *
 * ══ THREE ABSENCES, THREE CODES, AND THEY ARE NOT THE SAME FACT ══
 *  · `created_by` NULL — the campaign records no author. NOT-LOADED. The row
 *    predates the column being populated, or an insert path skipped it. Nobody
 *    is being accused of anything; there is simply no one to ask.
 *  · present but not slug-shaped — a display name, an email, a padded string.
 *    `marketing_holdings_declaration.member_id` has a CHECK that this value can
 *    never satisfy, so NO DECLARATION FOR IT CAN EVER EXIST. Passing it to the
 *    engine would return EMISSION_LAUNCHER_POSITION_UNDECLARED, which is true
 *    and useless: it sends a human off to make a declaration the database will
 *    reject. This is a data defect on the campaign row and says so.
 *  · slug-shaped but not on the roster — a machine principal (`operator`, the
 *    shared desk key; `monitor:*`; `ai`) or an `ext:` second-tier sign-in.
 *    Art 91(3)(c) attaches to a natural person. A service account cannot hold a
 *    position, cannot declare one, and cannot carry the liability, so a campaign
 *    authored by one has no launcher of record at all. This is the same rule
 *    `abuseRegister.ts assertNamedHuman` applies to declaring holdings, applied
 *    to relying on them.
 *
 * WHAT IS DELIBERATELY NOT CHECKED HERE: whether that human holds LCX. This
 * function establishes only that there IS a human to ask. The answer belongs to
 * `evaluateEmissionWarrant`, which resolves it against the register and refuses
 * on its own codes.
 */
function launcherOfRecord(createdBy: string | null | undefined): LauncherOfRecord {
  const raw = typeof createdBy === 'string' ? createdBy.trim() : '';
  if (raw === '') {
    return {
      ok: false,
      code: 'CAMPAIGN_LAUNCHER_NOT_RECORDED',
      message:
        'This campaign records no created_by, so there is no human whose LCX position the Art 91(3)(c) limb can be resolved against. That is an unanswered question, NOT a finding that nobody holds LCX, and it is not something this system may answer on anyone\'s behalf. Set dist_campaigns.created_by to the desk member who is launching this campaign — a person, named — and have them declare their LCX position in the marketing holdings register.',
    };
  }
  if (!HOLDINGS_MEMBER_ID_RE.test(raw)) {
    return {
      ok: false,
      code: 'CAMPAIGN_LAUNCHER_NOT_JOINABLE',
      message:
        `This campaign's created_by is ${JSON.stringify(raw)}, which cannot be a member_id in the marketing holdings register: that column has a CHECK constraint this value does not satisfy, so no declaration for it can exist and none ever could. The Art 91(3)(c) limb is therefore unanswerable rather than unanswered. Correct dist_campaigns.created_by to the launcher's roster id.`,
    };
  }
  if (!findMemberById(raw)) {
    return {
      ok: false,
      code: 'CAMPAIGN_LAUNCHER_NOT_A_NAMED_HUMAN',
      message:
        `This campaign's created_by is '${raw}', which is not a named desk member — the shared machine key ('operator'), monitors, 'ai' and ext: second-tier sign-ins all reach the distribution compartment and can author a campaign. MiCA Art 91(3)(c) attaches personal liability to a natural person, so a service account cannot be the launcher of record and cannot declare a position. Re-author this campaign under the roster id of the human launching it.`,
    };
  }
  return { ok: true, memberId: raw };
}

/**
 * WHICH COMPARTMENT A SUBJECT BELONGS TO — the gate `action.workspace` cannot make.
 *
 * `action.workspace` tags the verb. Three verbs are cross-cutting and carry no tag
 * (`notify`, `watchlist_add`, `flag_review`, all `subjectTypes: ['*']`), so the
 * compartment gate below was skipped for them entirely — and any of them accepts
 * `subjectType: 'gps_engagement'`. A principal holding no GPS grant could therefore
 * write `object_actions` and an `audit_log` row stamped `entity='gps_engagement'`
 * with free text in `meta`, on the audit trail of a client's compliance file.
 *
 * A PREFIX MAP, deliberately: an unlisted subject type keeps its existing
 * behaviour, so this cannot silently start refusing the four compartments that have
 * always worked this way. Both prefixes here hold material that is somebody else's:
 * a third party's confidential terms, or inside information and a colleague's
 * financial position.
 *
 * `marketing_` CARRIES THE SAME EXPOSURE ONE STEP SHARPER. `marketing/abuseRegister.ts`
 * declares three actions on subject type `marketing_asset`, and the subject id is an
 * ASSET SYMBOL. Untagged, `notify` or `note_add` with
 * `subjectType: 'marketing_asset'` would let any operator stamp free text onto the
 * audit trail of an embargo decision — and, worse, would let them assert an asset into
 * that trail at all. An embargo row states that LCX holds unpublished price-significant
 * information about a named token (MiCA Art 90(1)); a holdings row states a named
 * colleague's position (Art 91(3)(c), personal fines from EUR 700,000). Neither is
 * writable, or readable, on a `notify` grant.
 */
const SUBJECT_TYPE_WORKSPACES: ReadonlyArray<[RegExp, WorkspaceId]> = [
  [/^gps_/, 'gps'],
  [/^marketing_/, 'marketing'],
];

export function subjectTypeWorkspace(subjectType: string): WorkspaceId | null {
  for (const [re, ws] of SUBJECT_TYPE_WORKSPACES) if (re.test(subjectType)) return ws;
  return null;
}

const projectOnly = ['project'];

export const ACTION_REGISTRY: Record<string, RegistryAction> = {
  notify: {
    id: 'notify',
    label: 'Send notification',
    description: 'Raise an in-app notification on the subject.',
    subjectTypes: ['*'],
    minRole: 'operator',
    paramsSchema: z.object({ title: z.string().min(1).max(200), detail: z.string().max(500).optional(), href: navigableHref(300).optional() }),
    execute: async ({ subjectType, subjectId, params }) => {
      // Monitor-fired alert. Scope from the surface it points at when that
      // resolves; otherwise the monitor feature's OWN compartment ('monitors' is
      // an intel webPath), and never DESK_SCOPE — an unattributable alert shown
      // to every member is precisely the leak 0067 closed, reintroduced as a
      // default. Falling back narrow can hide an alert; falling back wide leaks.
      const monitorHref = params.href as string | undefined;
      const monitorScope: WorkspaceId =
        (monitorHref ? workspaceForPath(monitorHref) : null) ?? 'intel';
      await notify({
        rule: 'monitor',
        workspace: monitorScope,
        title: String(params.title),
        detail: params.detail as string | undefined,
        projectId: subjectType === 'project' ? subjectId : undefined,
        href: params.href as string | undefined,
        dedupKey: `monitor:${subjectId}:${String(params.title).slice(0, 40)}`,
      });
      return { notified: true };
    },
  },
  create_task: {
    id: 'create_task',
    label: 'Create follow-up task',
    description: 'Queue a task on the project.',
    subjectTypes: projectOnly,
    minRole: 'operator',
    paramsSchema: z.object({ title: z.string().min(1).max(200), detail: z.string().max(500).optional() }),
    execute: async ({ subjectId, params }) => {
      const id = await createManualTask({ title: String(params.title), detail: params.detail as string | undefined, projectId: subjectId });
      return { taskId: id };
    },
  },
  watchlist_add: {
    id: 'watchlist_add',
    label: 'Add to watchlist',
    description: 'Pin the object to the desk watchlist.',
    subjectTypes: ['*'],
    minRole: 'operator',
    paramsSchema: z.object({ note: z.string().max(300).optional() }),
    execute: async ({ pool, subjectType, subjectId, params, actor }) => {
      await pool.query(
        `INSERT INTO watchlist (org_id, subject_type, subject_id, note, added_by)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (org_id, subject_type, subject_id) DO NOTHING`,
        [DEFAULT_ORG_ID, subjectType, subjectId, (params.note as string) ?? null, actor],
      );
      return { watchlisted: true };
    },
  },
  watchlist_remove: {
    id: 'watchlist_remove',
    label: 'Remove from watchlist',
    description: 'Take the object off your watchlist, so it stops appearing on your desk.',
    subjectTypes: ['*'],
    minRole: 'operator',
    paramsSchema: z.object({}),
    execute: async ({ pool, subjectType, subjectId }) => {
      await pool.query(
        `DELETE FROM watchlist WHERE org_id=$1 AND subject_type=$2 AND subject_id=$3`,
        [DEFAULT_ORG_ID, subjectType, subjectId],
      );
      return { watchlisted: false };
    },
  },
  track: {
    id: 'track',
    label: 'Track token',
    description: 'Promote a catalog token into the tracked (deep-intel) tier.',
    subjectTypes: projectOnly,
    minRole: 'operator',
    paramsSchema: z.object({}),
    execute: async ({ pool, subjectId }) => {
      const { rowCount } = await pool.query(`UPDATE projects SET tier='tracked', updated_at=now() WHERE id=$1 AND tier<>'tracked'`, [subjectId]);
      return { tier: 'tracked', promoted: (rowCount ?? 0) > 0 };
    },
  },
  flag_review: {
    id: 'flag_review',
    label: 'Flag for review',
    description: 'Mark the object for analyst review (logged only).',
    subjectTypes: ['*'],
    minRole: 'operator',
    paramsSchema: z.object({ reason: z.string().max(300).optional() }),
    execute: async () => ({ flagged: true }),
  },
  /* ── LCX COMMAND (Wave 2) — the CEO acts through the deck, governed. ──
   * Human-confirmed only: none of these are in AI_PROPOSABLE. Every enum is
   * whitelisted here so a crafted payload can't write arbitrary state. */
  command_set_task_status: {
    id: 'command_set_task_status',
    label: 'Set program task status',
    description: 'Advance a US-launch program task (LCX COMMAND).',
    subjectTypes: ['command_task'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      status: z.enum(['not_started', 'pending', 'open', 'in_progress', 'blocked', 'tentative', 'future', 'done']),
    }),
    execute: async ({ pool, subjectId, params }) => {
      const { rowCount } = await pool.query(
        `UPDATE command_tasks SET status=$1, updated_at=now() WHERE id=$2`,
        [String(params.status), subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Program task not found', 404);
      return { status: params.status };
    },
  },
  command_decide: {
    id: 'command_decide',
    label: 'Record program decision',
    description: 'Close an open US-launch decision with the chosen option (LCX COMMAND).',
    subjectTypes: ['command_decision'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      chosen: z.string().min(1).max(500),
      rationale: z.string().max(2000).optional(),
      overrideSat: z.boolean().optional(),
      overrideReason: z.string().max(500).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor, markGateDegraded }) => {
      // SAT gate (100X Phase 4.2): the two program-critical decisions — exchange
      // model (dec_01) and listing path (dec_19) — cannot be decided without an
      // active premortem AND devil's advocate on file. Soft-block with an
      // audited override (the $25k-deal gate pattern, program-grade). Fail-open
      // ONLY when the reviews table does not exist yet (42P01) — governance must
      // not dead-lock ops on a migration that lands by hand. Any other database
      // error propagates: see isMissingTable for what a bare catch here cost.
      const CRITICAL = new Set(['dec_01', 'dec_19']);
      if (CRITICAL.has(subjectId)) {
        let kinds: string[] = [];
        try {
          const r = await pool.query(
            `SELECT DISTINCT kind FROM analytic_reviews
              WHERE subject_type='command_decision' AND subject_id=$1 AND status='active'
                AND kind IN ('premortem','devils_advocate')`, [subjectId]);
          kinds = r.rows.map((x: { kind: string }) => x.kind);
        } catch (err) {
          if (!isMissingTable(err)) throw err;
          kinds = ['premortem', 'devils_advocate'];
          markGateDegraded('analytic_reviews does not exist (42P01) — the SAT gate on this program-critical decision was NOT evaluated');
        }
        const missing = ['premortem', 'devils_advocate'].filter((k) => !kinds.includes(k));
        if (missing.length > 0) {
          if (!params.overrideSat) {
            throw new ActionError('SAT_REQUIRED',
              `Program-critical decision: run the missing tradecraft first (${missing.join(' + ')}) — or override with a reason.`, 409,
              { missing, subjectType: 'command_decision' });
          }
          if (!String(params.overrideReason ?? '').trim()) {
            throw new ActionError('OVERRIDE_REASON_REQUIRED', 'SAT override requires a reason.', 400);
          }
          // The override + reason land in the audit meta via invokeAction's params log.
        }
      }
      const { rows } = await pool.query(
        `UPDATE command_decisions
            SET status='decided', chosen=$1, decided_by=$2, decided_at=now(), updated_at=now()
          WHERE id=$3 AND status='open'
          RETURNING decision, phase`,
        [String(params.chosen), actor, subjectId],
      );
      if (rows.length === 0) throw new ActionError('NOT_FOUND', 'Decision not found or already decided', 404);
      // Institutional memory: mirror into the Phase-4 decision log. Best-effort —
      // a lagging decisions table must never block the program decision itself.
      try {
        await pool.query(
          `INSERT INTO decisions (title, context, decision, rationale, owner, subject_type, subject_id, source)
           VALUES ($1,$2,$3,$4,$5,'command_decision',$6,'command')`,
          [
            `US launch: ${String(rows[0].decision).slice(0, 150)}`,
            `LCX COMMAND ${rows[0].phase ?? ''} decision register.`,
            String(params.chosen).slice(0, 2000),
            String(params.rationale ?? '').slice(0, 4000),
            actor,
            subjectId,
          ],
        );
      } catch (err) {
        console.warn('[command] decision-log mirror skipped:', err instanceof Error ? err.message : err);
      }
      return { decided: true, chosen: params.chosen };
    },
  },
  command_reopen_decision: {
    id: 'command_reopen_decision',
    label: 'Reopen program decision',
    description: 'Reopen a wrongly-recorded US-launch decision (approver only; fully audited).',
    subjectTypes: ['command_decision'],
    minRole: 'approver',
    workspace: 'command',
    // `reason` is REQUIRED, not optional: this un-records a decision, and
    // invokeAction writes the params into object_actions.params AND audit_log.meta,
    // so requiring it here is what makes "who reopened dec_01, and why" answerable
    // afterwards. An optional reason would have made it answerable only sometimes.
    //
    // `.min(1)` alone was not enough: it accepts a single space, so the API would
    // take `{ reason: " " }` and record a justification that says nothing — which is
    // "no recorded justification" wearing a character. The UI trims, but the UI is
    // not the authority. The refine is invisible to z.toJSONSchema (see the note in
    // web grammar.ts on advisory validation), so the emitted manifest — and its hash
    // — are unchanged; the server is simply stricter than the generated client.
    paramsSchema: z.object({
      reason: z.string().min(1).max(500).refine((s) => s.trim().length > 0, {
        message: 'reason cannot be blank — a reopen has to say why',
      }),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const { rowCount } = await pool.query(
        `UPDATE command_decisions SET status='open', chosen=NULL, decided_by=NULL, decided_at=NULL, updated_at=now()
          WHERE id=$1 AND status='decided'`, [subjectId]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Decision not found or not decided', 404);
      // Retract the mirror, or the inverse is only half an inverse.
      //
      // `command_decide` above INSERTs a row into `decisions` — the Phase-4
      // institutional memory, which /decisions presents un-outcomed rows from as
      // live calls ("Open"). Reopening used to clear `command_decisions` and leave
      // that row asserting a choice that no longer exists, so the log that exists
      // to say "why we made the calls we made" kept a call nobody had made.
      //
      // Annotated rather than deleted: "on this date nik recorded choice X" stays
      // TRUE and is the audit trail. What changes is that the row now says it was
      // superseded, and by whom, for what stated reason. Written into `rationale`
      // and not `outcome` deliberately — /decisions renders `outcome` as a green
      // check ("Outcome: …"), which would present a retraction as a success.
      //
      // Best-effort, exactly like the mirror insert it undoes: a lagging decisions
      // table must not block the governance action itself. The reopen HAS happened
      // and is in both ledgers by the time this runs.
      try {
        await pool.query(
          `UPDATE decisions
              SET rationale = left(btrim(rationale || $1), 4000), updated_at = now()
            WHERE subject_type='command_decision' AND subject_id=$2 AND source='command'
              AND rationale NOT LIKE '%[REOPENED%'`,
          [`\n\n[REOPENED by ${actor}] This decision was reopened — the choice above no longer stands. Stated reason: ${String(params.reason).slice(0, 500)}`, subjectId],
        );
      } catch (err) {
        console.warn('[command] decision-log retraction skipped:', err instanceof Error ? err.message : err);
      }
      return { reopened: true };
    },
  },
  command_set_partner_stage: {
    id: 'command_set_partner_stage',
    label: 'Set partner pipeline stage',
    description: 'Move a US-launch partner through the pipeline (LCX COMMAND).',
    subjectTypes: ['command_partner'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      stage: z.enum([
        'evaluate', 'recommended_rfi', 'recommended', 'incumbent_onboarding', 'in_progress',
        'select', 'support', 'alternate', 'specialist', 'hold_geoblock', 'exclude_pending_counsel',
        'signed', 'passed',
      ]),
    }),
    execute: async ({ pool, subjectId, params }) => {
      const { rowCount } = await pool.query(
        `UPDATE command_partners SET pipeline_stage=$1, updated_at=now() WHERE id=$2`,
        [String(params.stage), subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Partner not found', 404);
      return { stage: params.stage };
    },
  },
  command_set_partner_details: {
    id: 'command_set_partner_details',
    label: 'Set partner contact/terms',
    description: 'Fill a partner\'s primary contact or commercial terms as the RFIs land (LCX COMMAND).',
    subjectTypes: ['command_partner'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      primaryContact: z.string().max(300).optional(),
      terms: z.string().max(1000).optional(),
    }).refine((v) => v.primaryContact !== undefined || v.terms !== undefined, { message: 'Nothing to update' }),
    execute: async ({ pool, subjectId, params }) => {
      const sets: string[] = []; const vals: unknown[] = []; let i = 1;
      if (params.primaryContact !== undefined) { sets.push(`primary_contact=$${i++}`); vals.push(String(params.primaryContact).slice(0, 300) || null); }
      if (params.terms !== undefined) { sets.push(`terms=$${i++}`); vals.push(String(params.terms).slice(0, 1000) || null); }
      sets.push('updated_at=now()');
      vals.push(subjectId);
      const { rowCount } = await pool.query(`UPDATE command_partners SET ${sets.join(', ')} WHERE id=$${i}`, vals);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Partner not found', 404);
      return { updated: true };
    },
  },
  command_set_requirement_status: {
    id: 'command_set_requirement_status',
    label: 'Set listing-requirement status',
    description: 'Update one of the 14 listing requirements (LCX COMMAND) — moves the readiness dial.',
    subjectTypes: ['command_requirement'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({ status: z.enum(['Not started', 'In progress', 'Done']) }),
    execute: async ({ pool, subjectId, params }) => {
      const num = Number(subjectId);
      if (!Number.isInteger(num) || num < 1 || num > 99) throw new ActionError('VALIDATION', 'Bad requirement id');
      const { rowCount } = await pool.query(
        `UPDATE command_requirements SET status=$1, updated_at=now() WHERE num=$2`, [String(params.status), num]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Requirement not found', 404);
      return { status: params.status };
    },
  },
  command_set_blocker_status: {
    id: 'command_set_blocker_status',
    label: 'Set launch-blocker status',
    description: 'Track resolution of one of the 12 launch blockers (LCX COMMAND).',
    subjectTypes: ['command_blocker'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({ status: z.enum(['open', 'mitigating', 'resolved']) }),
    execute: async ({ pool, subjectId, params }) => {
      const num = Number(subjectId);
      if (!Number.isInteger(num) || num < 1 || num > 99) throw new ActionError('VALIDATION', 'Bad blocker id');
      const { rowCount } = await pool.query(
        `UPDATE command_blockers SET status=$1, updated_at=now() WHERE num=$2`, [String(params.status), num]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Blocker not found', 404);
      return { status: params.status };
    },
  },
  command_rfi_record: {
    id: 'command_rfi_record',
    label: 'Record RFI terms',
    description: 'Record a partner\'s returned RFI commercial terms (LCX COMMAND). Provenance auto-upgrades: returned=B2, signed=A1.',
    subjectTypes: ['command_partner'],
    minRole: 'operator',
    workspace: 'command',
    paramsSchema: z.object({
      status: z.enum(['issued', 'returned', 'signed']),
      values: z.record(z.string().max(60), z.string().max(300)).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      // Whitelist value keys against the compiled RFI schema — a crafted payload
      // can't smuggle arbitrary keys into the jsonb.
      const { COMMAND_DEEP_SEED } = await import('../seed/command/data2.js');
      const valid = new Set(((COMMAND_DEEP_SEED as unknown as { rfi: { fields: Array<{ key: string }> } }).rfi.fields).map((f) => f.key));
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries((params.values as Record<string, string>) ?? {})) {
        if (valid.has(k) && String(v).trim()) values[k] = String(v).trim();
      }
      const status = String(params.status);
      const grade = status === 'signed' ? 'A1' : status === 'returned' ? 'B2' : null;
      const { rowCount } = await pool.query(
        `INSERT INTO command_rfi (partner_id, status, owner, grade, values, issued_at, returned_at)
         VALUES ($1,$2,$3,$4,$5::jsonb, CASE WHEN $2='issued' THEN now() END, CASE WHEN $2 IN ('returned','signed') THEN now() END)
         ON CONFLICT (partner_id) DO UPDATE SET
           status=EXCLUDED.status, owner=EXCLUDED.owner,
           grade=COALESCE(EXCLUDED.grade, command_rfi.grade),
           values=command_rfi.values || EXCLUDED.values,
           returned_at=COALESCE(EXCLUDED.returned_at, command_rfi.returned_at),
           updated_at=now()`,
        [subjectId, status, actor, grade, JSON.stringify(values)],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('CONFLICT', 'RFI write failed');
      return { status, grade, fields: Object.keys(values).length };
    },
  },
  assign: {
    id: 'assign',
    label: 'Assign owner',
    description: 'Give a deal, monitor, or PIR a real desk owner (a lane, not the shared catch-all).',
    subjectTypes: ['deal', 'monitor', 'pir'],
    minRole: 'operator',
    paramsSchema: z.object({ owner: z.string().min(1).max(64) }),
    execute: async ({ pool, subjectType, subjectId, params }) => {
      const owner = String(params.owner);
      // The target must be a real desk member (or the shared 'operator' lane) —
      // never let ownership point at a principal that can't hold it.
      if (owner !== 'operator' && !findMemberById(owner)) {
        throw new ActionError('VALIDATION', `Unknown owner: ${owner}`);
      }
      const table = subjectType === 'deal' ? 'deals' : subjectType === 'monitor' ? 'monitors' : 'pirs';
      const { rowCount } = await pool.query(`UPDATE ${table} SET owner = $1 WHERE id = $2`, [owner, subjectId]);
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', `${subjectType} not found`, 404);
      return { owner, subjectType };
    },
  },
  /* ── LCX OS (LCX ONE Phase 1) — the governed access lifecycle. ──
   * Access is given, never assumed: every grant/revoke/decision is an audited
   * object action carrying who, what, and why. Approver-only, human-only
   * (none of these are AI_PROPOSABLE). */
  grant_entitlement: {
    id: 'grant_entitlement',
    label: 'Grant workspace access',
    description: 'Entitle a roster member to a workspace at a capability tier (LCX OS).',
    subjectTypes: ['member'],
    minRole: 'approver',
    workspace: 'governance',
    paramsSchema: z.object({
      workspace: z.enum(WORKSPACE_IDS as unknown as [string, ...string[]]),
      capability: z.enum(['view', 'operate', 'approve']),
      justification: z.string().min(1).max(500),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      /*
       * WHO MAY BE GRANTED TO — a roster member, or a second-tier `ext:` colleague.
       *
       * This was roster-only, which left the second-tier sign-in half-built. An `ext:`
       * principal can file a request (`routes/access.ts:76`), an approver can approve
       * it, `decide_access_request` writes the row by `req.member_id` with no roster
       * check, and `loadEntitlements` reads it — so the REQUEST path worked end to end
       * while the DIRECT grant an approver would reach for first answered 404 "No
       * roster member". One door open and one shut, for the same decision.
       *
       * THE CEILING IS ENFORCED HERE TOO, and refuses rather than silently clamps.
       * `loadEntitlements` caps an `ext:` map after reading it (`entitlements.ts:146`),
       * so a row granting `gps` or `approve` to a second-tier principal would be
       * stored and then ignored — an approver reading the matrix would believe they
       * had granted something that does nothing. Both bounds come from
       * `secondTierMayHold` / the capability clamp in `access/entitlements.ts`, the
       * same functions the request surface asks, so the three cannot disagree.
       */
      const secondTier = isSecondTierPrincipal(subjectId);
      if (!findMemberById(subjectId) && !secondTier) {
        throw new ActionError('NOT_FOUND', `No roster member '${subjectId}'`, 404);
      }
      if (secondTier && !secondTierMayHold(params.workspace as WorkspaceId)) {
        throw new ActionError(
          'SECOND_TIER_FORBIDDEN',
          `${String(params.workspace)} holds elevated material and is not grantable to a `
          + 'second-tier sign-in. That colleague needs a named roster account; a shared '
          + 'passcode does not reach this compartment even with an approval.',
          403,
          { subjectId, workspace: params.workspace },
        );
      }
      if (secondTier && params.capability === 'approve') {
        throw new ActionError(
          'SECOND_TIER_FORBIDDEN',
          'A second-tier sign-in is pinned to the operator role by middleware/auth.ts, so an '
          + 'approve-tier grant would be stored and then ignored. Grant operate, or put them '
          + 'on the roster.',
          403,
          { subjectId, capability: params.capability },
        );
      }
      await pool.query(
        `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (member_id, workspace)
         DO UPDATE SET capability=EXCLUDED.capability, granted_by=EXCLUDED.granted_by,
                       justification=EXCLUDED.justification, granted_at=now()`,
        [subjectId, params.workspace, params.capability, actor, params.justification],
      );
      invalidateEntitlements(subjectId);
      await notify({
        rule: 'access',
        // this action declares workspace: 'governance' on its own def
        workspace: 'governance',
        title: `Access granted: ${String(params.workspace)} (${String(params.capability)})`,
        detail: `${actor} entitled ${subjectId} — ${String(params.justification)}`,
        dedupKey: `access-grant:${subjectId}:${String(params.workspace)}:${Date.now()}`,
      });
      return { memberId: subjectId, workspace: params.workspace, capability: params.capability };
    },
  },
  revoke_entitlement: {
    id: 'revoke_entitlement',
    label: 'Revoke workspace access',
    description: 'Remove a roster member’s entitlement to a workspace (LCX OS).',
    subjectTypes: ['member'],
    minRole: 'approver',
    workspace: 'governance',
    paramsSchema: z.object({
      workspace: z.enum(WORKSPACE_IDS as unknown as [string, ...string[]]),
      justification: z.string().min(1).max(500),
      /** Step-up: the desk passcode, re-entered at action time (Phase 2). */
      stepUpPasscode: z.string().min(1).max(200),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      // Step-up re-auth (LCX ONE Phase 2): revocation is destructive, so it
      // demands a fresh passcode at action time — a live human deliberately
      // re-authorizing, not a cached session firing. Timing-safe.
      //
      // ── THE FRONT DOOR'S GUARD HAS TO BE REPEATED HERE, AND IT WAS NOT ──────────────────
      // `auth.ts:270` refuses the roster desk passcode when `deskPasscodeIsPublicDefault` is
      // set — i.e. when `DESK_PASSCODE` is absent or is the value committed to this repository.
      // This comparison had no such guard, and it is the SECOND door to the same secret.
      //
      // Found while closing that first hole, and proved live afterwards: with the front door
      // correctly refusing, a principal obtained through the SECONDARY passcode then called
      // `revoke_entitlement` with the committed public literal as `stepUpPasscode` and got
      // `{"revoked":true,"historyRecorded":true}` back with HTTP 200. The control that a wrong
      // step-up returns `STEP_UP_REQUIRED` was verified in the same run, so that was the public
      // passcode being ACCEPTED, not a bypass of the check.
      //
      // The lesson worth keeping is not "add a guard here". It is that a secret with two
      // comparison sites needs its refusal at the value, not at each call: fixing one door on a
      // shared secret leaves the other one open, and nothing in the type system says there is
      // another one. The census that would catch a third is a grep for `env.deskPasscode`.
      if (env.deskPasscodeIsPublicDefault
        || !safeEqual(String(params.stepUpPasscode), env.deskPasscode)) {
        throw new ActionError('STEP_UP_REQUIRED', 'Revocation requires re-entering the desk passcode.', 401);
      }
      // Lockout protection: an approver cannot saw off the branch they sit on.
      // Revoking your own governance access would strand the access system
      // itself; another approver must do it.
      if (subjectId === actor && params.workspace === 'governance') {
        throw new ActionError('SELF_LOCKOUT', 'You cannot revoke your own governance access — another approver must.', 400);
      }
      /*
       * THIS USED TO BE A BARE DELETE, AND THE DELETE WAS THE ONLY RECORD.
       *
       * `entitlements` holds one row per (member, workspace) and nothing else
       * recorded the grant, so revoking destroyed the evidence it had ever
       * existed. "Who could read this compartment on 12 July" was unanswerable,
       * and — worse — indistinguishable from "nobody could".
       *
       * `recordRevocation` (access/asOf.ts) APPENDS the revocation to
       * `entitlement_events` (migration 0071) and then deletes the live row, in
       * one transaction. The live behaviour is unchanged on purpose: the row still
       * leaves `entitlements`, which is what `loadEntitlements` reads, so the
       * request path and every cron principal behave exactly as before. What is
       * new is that the history survives the deletion.
       *
       * `historyRecorded: false` means 0071 has not been applied yet: the access
       * really was revoked and the trail really was not written. It is returned
       * rather than swallowed, because a silent version of that is the defect 0071
       * exists to close.
       */
      const outcome = await recordRevocation(pool, {
        memberId: subjectId,
        workspace: String(params.workspace),
        actor,
        justification: String(params.justification),
      });
      if (outcome.kind === 'not_found') throw new ActionError('NOT_FOUND', 'No such entitlement', 404);
      invalidateEntitlements(subjectId);
      return {
        memberId: subjectId,
        workspace: params.workspace,
        revoked: true,
        historyRecorded: outcome.historyRecorded,
        refusal: outcome.code,
      };
    },
  },
  set_member_profile: {
    id: 'set_member_profile',
    label: 'Set member profile',
    description: 'Record a roster member’s unit and title (LCX OS Directorate).',
    subjectTypes: ['member'],
    minRole: 'approver',
    workspace: 'governance',
    paramsSchema: z.object({
      unit: z.string().max(80).optional(),
      title: z.string().max(120).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      if (!findMemberById(subjectId)) throw new ActionError('NOT_FOUND', `No roster member '${subjectId}'`, 404);
      await pool.query(
        `INSERT INTO member_profiles (member_id, unit, title, updated_by, updated_at)
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT (member_id)
         DO UPDATE SET unit=EXCLUDED.unit, title=EXCLUDED.title, updated_by=EXCLUDED.updated_by, updated_at=now()`,
        [subjectId, (params.unit as string) ?? null, (params.title as string) ?? null, actor],
      );
      return { memberId: subjectId, unit: params.unit ?? null, title: params.title ?? null };
    },
  },
  decide_access_request: {
    id: 'decide_access_request',
    label: 'Decide access request',
    description: 'Approve or deny a pending workspace access request (LCX OS).',
    subjectTypes: ['access_request'],
    minRole: 'approver',
    workspace: 'governance',
    paramsSchema: z.object({
      decision: z.enum(['approved', 'denied']),
      note: z.string().max(500).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const { rows } = await pool.query<{ member_id: string; workspace: string; capability: string; status: string }>(
        `SELECT member_id, workspace, capability, status FROM access_requests WHERE id=$1`,
        [subjectId],
      );
      const req = rows[0];
      if (!req) throw new ActionError('NOT_FOUND', 'Access request not found', 404);
      if (req.status !== 'pending') throw new ActionError('ALREADY_DECIDED', `Request is already ${req.status}`, 409);
      await pool.query(
        `UPDATE access_requests SET status=$1, decided_by=$2, decided_at=now(), decision_note=$3 WHERE id=$4`,
        [params.decision, actor, (params.note as string) ?? null, subjectId],
      );
      if (params.decision === 'approved') {
        await pool.query(
          `INSERT INTO entitlements (member_id, workspace, capability, granted_by, justification)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (member_id, workspace)
           DO UPDATE SET capability=EXCLUDED.capability, granted_by=EXCLUDED.granted_by,
                         justification=EXCLUDED.justification, granted_at=now()`,
          [req.member_id, req.workspace, req.capability, actor, `access_request:${subjectId}`],
        );
        invalidateEntitlements(req.member_id);
      }
      await notify({
        rule: 'access',
        // this action declares workspace: 'governance' on its own def
        workspace: 'governance',
        title: `Access request ${String(params.decision)}: ${req.workspace}`,
        detail: `${actor} ${String(params.decision)} ${req.member_id}'s request for ${req.capability} on ${req.workspace}`,
        dedupKey: `access-decide:${subjectId}`,
      });
      return { requestId: subjectId, decision: params.decision, workspace: req.workspace, memberId: req.member_id };
    },
  },
  /* ── DISTRIBUTION COMMAND (LCX ONE Phase 5) — the governed surface loop. ──
   * Listing status + campaign lifecycle. The Phase-6 compliance gate and the
   * emission warrant both hang off dist_campaign_set_status (launch
   * transitions); see the comments inside it. */
  dist_listing_set_status: {
    id: 'dist_listing_set_status',
    label: 'Set listing status',
    description: 'Advance a distribution surface through the listing pipeline.',
    subjectTypes: ['dist_listing'],
    minRole: 'operator',
    workspace: 'distribution',
    paramsSchema: z.object({
      status: z.enum(['not_started', 'submitted', 'live', 'ranked']),
      rankNote: z.string().max(200).optional(),
      usageNote: z.string().max(200).optional(),
      // The SECOND stored navigation in this registry, found by grepping this file
      // for URL-shaped params rather than by fixing only the one that was reported.
      // `dist_listings.url` is written here and served to the client by
      // `GET /v1/distribution/listings` (routes/distribution.ts does `SELECT *`).
      //
      // STATED PRECISELY, because the difference matters: unlike `notify.href`, NO
      // surface renders it as an anchor today — `DistributionPanels.tsx` reads the
      // listing's status and surface, never its url. So this is not a live sink; it
      // is a stored value one JSX line away from being one, in a column whose name
      // tells the next person it is a link. It gets the same rule for that reason,
      // not because a click path exists right now.
      url: navigableHref(300).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor }) => {
      const { rowCount } = await pool.query(
        `UPDATE dist_listings
           SET status=$1,
               rank_note=COALESCE($2, rank_note),
               usage_note=COALESCE($3, usage_note),
               url=COALESCE($4, url),
               updated_by=$5, updated_at=now()
         WHERE surface_id=$6`,
        [params.status, (params.rankNote as string) ?? null, (params.usageNote as string) ?? null, (params.url as string) ?? null, actor, subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Listing not found', 404);
      return { surfaceId: subjectId, status: params.status };
    },
  },
  dist_campaign_create: {
    id: 'dist_campaign_create',
    label: 'Create distribution campaign',
    description: 'Draft a quest/incentive/content/outreach campaign (starts in draft).',
    subjectTypes: ['distribution'],
    minRole: 'operator',
    workspace: 'distribution',
    paramsSchema: z.object({
      name: z.string().min(1).max(160),
      surfaceId: z.string().max(60).optional(),
      kind: z.enum(['quest', 'incentive', 'content', 'outreach']),
      tokenIncentivized: z.boolean().optional(),
      budgetLcx: z.number().nonnegative().optional(),
      detail: z.string().max(1000).optional(),
    }),
    execute: async ({ pool, params, actor }) => {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO dist_campaigns (name, surface_id, kind, token_incentivized, budget_lcx, detail, owner, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
        [params.name, (params.surfaceId as string) ?? null, params.kind, params.tokenIncentivized ?? false, (params.budgetLcx as number) ?? null, (params.detail as string) ?? null, actor],
      );
      return { campaignId: rows[0]!.id, status: 'draft' };
    },
  },
  dist_campaign_set_status: {
    id: 'dist_campaign_set_status',
    label: 'Set campaign status',
    description: 'Advance a campaign through its lifecycle (launch is compliance-gated).',
    subjectTypes: ['dist_campaign'],
    minRole: 'operator',
    workspace: 'distribution',
    paramsSchema: z.object({
      status: z.enum(['draft', 'compliance_review', 'approved', 'live', 'measured']),
      overrideGate: z.boolean().optional(),
      overrideReason: z.string().max(500).optional(),
    }),
    execute: async ({ pool, subjectId, params, actor, role, markGateDegraded }) => {
      const LAUNCH = new Set(['approved', 'live']);
      const target = String(params.status);

      // The COMPLIANCE GATE (LCX ONE Phase 6): launching a token-incentivized
      // campaign requires (a) approver authority, (b) an active premortem AND
      // legal_check review on file, and (c) AN EMISSION WARRANT. Soft-blockable
      // only with an audited override + reason — EXCEPT the warrant, which is
      // not overridable at all; see the block that evaluates it. Fail-open ONLY
      // on 42P01 (the reviews table has not been created yet) so governance
      // never dead-locks ops; every other database error propagates.
      let camp: CampaignGateRow | undefined;
      if (LAUNCH.has(target)) {
        const { rows: crows } = await pool.query<CampaignGateRow>(
          // `name`, `detail` and `created_by` are read here and NOT taken from
          // the request: they are the three inputs to the emission warrant (the
          // bytes it digests, and the human whose Art 91(3)(c) position it
          // resolves). A drafter who could supply them could suppress the check.
          `SELECT token_incentivized, budget_lcx, name, detail, created_by FROM dist_campaigns WHERE id=$1`,
          [subjectId],
        );
        camp = crows[0];
        if (!camp) throw new ActionError('NOT_FOUND', 'Campaign not found', 404);

        /*
         * THREE STATES ON THE TRIGGER, AND THIS USED TO HAVE TWO.
         *
         * `if (camp.token_incentivized)` is a truthiness test, so NULL, the
         * string 'true', undefined from a renamed column, and anything a driver
         * shape change produced all took the ELSE branch — which advances the
         * campaign with no gate at all. Reading an UNKNOWN trigger as "not a
         * token campaign" is the one direction that cannot be recovered from:
         * the campaign is live before anybody notices the column is wrong.
         *
         * Only the literal `false` may mean "this gate does not apply".
         * `evaluateEmissionWarrant` makes the identical distinction one level
         * down (EMISSION_TRIGGER_NOT_STATED) and for the identical reason.
         */
        const trigger = camp.token_incentivized;
        const tokenIncentivized = typeof trigger === 'boolean' ? trigger : null;
        if (tokenIncentivized === null) {
          throw new ActionError(
            'CAMPAIGN_TRIGGER_NOT_STATED',
            `dist_campaigns.token_incentivized for this campaign is ${JSON.stringify(trigger)}, which is not a boolean. Whether this campaign emits LCX is UNKNOWN, and unknown is not no: advancing it to ${target} would put a possibly token-incentivized campaign in front of the public with no emission warrant and no Art 91(3)(c) check on its launcher.`,
            409,
            { campaignId: subjectId, tokenIncentivized: null, observed: trigger === null ? 'null' : typeof trigger },
          );
        }

        if (tokenIncentivized) {
          // (a) approver-only launch. AUTHORITY IS NOT OVERRIDABLE.
          //
          // This check used to read `role !== 'approver' && !params.overrideGate`,
          // which let any operator launch a token-incentivized campaign simply by
          // sending `overrideGate: true` — a client-supplied boolean defeating an
          // authority requirement. And because the reason is only demanded when
          // there are review/budget blockers, an operator could take that path
          // with no approver and no recorded justification at all.
          //
          // `overrideGate` exists to accept a documented risk on the REVIEW and
          // BUDGET blockers below (with a reason, recorded). It has never been a
          // way to grant yourself authority you do not hold.
          if (role !== 'approver') {
            throw new ActionError('APPROVER_REQUIRED', 'Launching a token-incentivized campaign requires approver authority.', 403);
          }
          // (b) active premortem + legal_check on this campaign.
          let kinds: string[] = [];
          try {
            const r = await pool.query(
              `SELECT DISTINCT kind FROM analytic_reviews
                WHERE subject_type='dist_campaign' AND subject_id=$1 AND status='active'
                  AND kind IN ('premortem','legal_check')`, [subjectId]);
            kinds = r.rows.map((x: { kind: string }) => x.kind);
          } catch (err) {
            if (!isMissingTable(err)) throw err;
            kinds = ['premortem', 'legal_check'];
            markGateDegraded('analytic_reviews does not exist (42P01) — the compliance review half of the launch gate was NOT evaluated');
          }
          const missing = ['premortem', 'legal_check'].filter((k) => !kinds.includes(k));

          /* ── (c) THE EMISSION WARRANT. NOT OVERRIDABLE. ───────────────────
           *
           * WHAT THIS REPLACED, because it shipped and it read as a control:
           *
           *   const budget = camp.budget_lcx != null ? Number(camp.budget_lcx) : 0;
           *   const projectedPaidLinks = budget;
           *   const em = emissionBudget({ projectedPaidLinks, creatorRewardLcx: 1,
           *     serviceFeeLcx: 1, treasuryBudgetLcx: Math.max(budget, 1) });
           *   const overBudget = !em.withinBudget;
           *
           * `emissionBudget` computes `withinBudget: emitted <= treasuryBudgetLcx`
           * where `emitted = round(projectedPaidLinks * 1)` — so this asked
           * `budget <= Math.max(budget, 1)`, which is TRUE for every input that
           * exists. The limb was arithmetically incapable of failing. It could not
           * be repaired in place either, because the honest input is LCX's treasury
           * envelope and nothing in this repository knows it; `Math.max(budget, 1)`
           * WAS the fabrication, standing in for a number no human had supplied.
           *
           * AND THE NULL BRANCH WAS THE SAME DEFECT IN DATA: `budget_lcx` NULL
           * became `0`, so a token campaign that states no budget at all was
           * measured as emitting nothing and passed. Absent is not zero.
           *
           * `evaluateEmissionWarrant` is what a budget limb has to be: it refuses
           * with EMISSION_CAP_NOT_DECLARED until an owner declares a cap, refuses
           * with EMISSION_AMOUNT_NOT_STATED when budget_lcx is NULL, aggregates the
           * OTHER in-flight campaigns rather than comparing this one to itself, and
           * ledgers the whole picture to the append-only audit log either way.
           *
           * ══ WHY `overrideGate` CANNOT REACH THIS ══
           * The review blockers below are a DESK judgement and an approver may
           * accept that risk in writing. Art 91(3)(c) is not a desk judgement: it
           * attaches personally, at roughly EUR 700,000, to the human whose name is
           * on the launch. One approver cannot waive another person's personal
           * declaration, and an override flag that could would be a button for
           * signing a colleague up to a liability they never answered a question
           * about. So the warrant is checked in the same place authority is, and is
           * refused in the same way: with no flag that turns it off.
           */
          const launcher = launcherOfRecord(camp.created_by);
          if (!launcher.ok) {
            throw new ActionError(launcher.code, launcher.message, 409, {
              campaignId: subjectId, createdBy: camp.created_by ?? null, actingPrincipal: actor,
            });
          }
          const decision = await evaluateEmissionWarrant(pool, {
            campaignId: subjectId,
            targetStatus: target,
            launcher: launcher.memberId,
          });
          if (!mayReachStatus(decision)) {
            const refusals = decision.outcome === 'refused' ? decision.refusals : [];
            throw new ActionError(
              'EMISSION_WARRANT_REFUSED',
              `Cannot launch: the emission warrant was refused (${refusals.map((r) => r.code).join(', ') || 'no code'}). ${refusals.map((r) => r.sentence).join(' ')} This gate is NOT overridable${missing.length > 0 ? `, and separately the compliance reviews are incomplete (${missing.join(' + ')})` : ''}.`,
              409,
              {
                campaignId: subjectId,
                launcher: launcher.memberId,
                actingPrincipal: actor,
                refusals: refusals.map((r) => ({ code: r.code, rule: r.rule, remedy: r.remedy })),
                refusalCodes: refusals.map((r) => r.code),
                overridable: false,
                // REPORTED TOGETHER, NOT ONE AT A TIME. A refusal that names only
                // the warrant while the reviews are also missing sends the approver
                // back twice; `emissionWarrant.ts` returns every refusal for the
                // same reason and this carries them across the boundary.
                missing,
                warrantAuditRowId: decision.outcome === 'refused'
                  ? decision.warrant?.auditRowId ?? null
                  : null,
              },
            );
          }

          const blockers: string[] = [];
          if (missing.length > 0) blockers.push(`compliance review missing (${missing.join(' + ')})`);

          if (blockers.length > 0) {
            if (!params.overrideGate) {
              throw new ActionError('COMPLIANCE_GATE',
                `Cannot launch: ${blockers.join('; ')}. File the reviews (subject_type=dist_campaign) or override with a reason.`, 409,
                { blockers, missing });
            }
            if (!String(params.overrideReason ?? '').trim()) {
              throw new ActionError('OVERRIDE_REASON_REQUIRED', 'Compliance-gate override requires a reason.', 400);
            }
          }
        }
      }

      const { rowCount } = await pool.query(
        `UPDATE dist_campaigns SET status=$1, updated_at=now() WHERE id=$2`,
        [params.status, subjectId],
      );
      if ((rowCount ?? 0) === 0) throw new ActionError('NOT_FOUND', 'Campaign not found', 404);

      /* ── THE ONE MOUTH SHADOW LEDGER (Title VI, measuring only) ────────────
       *
       * This is the first caller `marketing/oneMouth.ts` has ever had. Before
       * this line, `observeOneMouth` and `sweepOneMouth` appeared seven times in
       * the repository and every one of them was inside that file — so the
       * shadow report read `recording_nothing_observed` forever, which on a
       * screen is indistinguishable from a desk whose copy is clean. An
       * unevaluated path and a genuinely clean one must not produce the same
       * number.
       *
       * ══ EVERY CAMPAIGN, NOT ONLY THE TOKEN ONES ══
       * The warrant above gates token-incentivised campaigns. This observes ALL
       * of them, because the point of a shadow count is the BASE RATE over
       * everything the desk publishes — a content campaign's copy is outbound
       * text about a crypto-asset exchange too, and excluding it would bias the
       * only number that will ever justify enforcement.
       *
       * ══ AFTER THE UPDATE, ON PURPOSE ══
       * The population is "campaign copy that actually reached approved/live".
       * Observing before the gates would ledger text that was refused and never
       * published, and the base rate would then describe drafts rather than
       * sends. Observing after a `rowCount` of 0 would ledger a campaign that
       * does not exist.
       *
       * ══ IT CANNOT BLOCK AND IT CANNOT THROW ══
       * `observeAndRecordOneMouth` swallows everything, including a contract
       * violation by the engine itself. The status transition has already
       * happened and been ledgered; a measurement failing afterwards must not
       * turn a completed governed write into a 500. The state below is how the
       * caller learns what actually happened, and the report on the other side
       * never reads an empty ledger as "clean".
       */
      let shadowObservation:
        | 'not_a_publication_point'
        | 'no_text_to_observe'
        | 'engine_failed'
        | 'observed_not_recorded'
        | 'recorded' = 'not_a_publication_point';
      if (camp !== undefined) {
        const subject = oneMouthCampaignSubject({
          id: subjectId,
          name: String(camp.name ?? ''),
          detail: camp.detail ?? null,
          createdBy: camp.created_by ?? null,
        });
        const shadow = await observeAndRecordOneMouth(pool, subject);
        /*
         * FIVE STATES, NOT A BOOLEAN AND NOT THREE, because `null` from
         * `observeAndRecordOneMouth` means TWO different things and the first
         * version of this block reported both of them — plus the transitions
         * that are not publication points — as one token, `not_observed`,
         * documented as "there was nothing to observe". A swallowed contract
         * violation by the engine is not "nothing to observe": it is the
         * control blowing up on a campaign that DID reach the public, reported
         * to the caller as though the observation had been skipped on purpose.
         * An unevaluated path and a deliberately-skipped one must not produce
         * the same token, which is the same defect one level up that wiring the
         * engine at all was supposed to close.
         *
         *  · not_a_publication_point — draft/compliance_review/measured. The
         *    observation is about text becoming public; nothing became public.
         *  · no_text_to_observe — the composed bytes were blank, so ledgering
         *    would record a digest of nothing as if the desk had published it.
         *  · engine_failed — `observeOneMouth` or `recordOneMouthObservation`
         *    threw despite documenting that they never do. The copy reached the
         *    public and met NO check, and the shadow count will not know.
         *  · observed_not_recorded — the engine ran and the ledger refused the
         *    row, so the count under-reports by an amount nothing can recover.
         *  · recorded — measured and ledgered.
         */
        shadowObservation = shadow === null
          ? (subject.text.trim() === '' ? 'no_text_to_observe' : 'engine_failed')
          : shadow.recorded ? 'recorded' : 'observed_not_recorded';
      }

      return {
        campaignId: subjectId,
        status: params.status,
        shadowObservation,
      };
    },
  },

};

/**
 * GLOBAL SERVICES (GPS Phase 1). Declared in `../gps/actions.ts` and merged in
 * here rather than written inline like everything above, because these five are
 * the only write paths that touch a third party's commercial terms while the
 * operator is an employee of a regulated exchange — the reasoning for each refusal
 * is long enough that inlining it would bury the other 22 actions.
 *
 * Keyed by `a.id` rather than by repeated literals: every entry above states its
 * id twice (once as the key, once as `id:`), and a mismatch makes the action
 * unreachable through `invokeAction` while leaving it visible in `listActions`.
 * `gps/__tests__/actions.test.ts:657` asserts key === id for all five.
 *
 * WRITTEN AS A LOOP, NOT A SPREAD, and that is the whole point of it. `{ ...desk,
 * ...gps }` is last-wins and silent: a GPS id colliding with a desk id would
 * REPLACE the desk action, so `assign` or `notify` would quietly start demanding
 * the `gps` compartment and refusing every operator who lacks it. No type check
 * catches that (both sides are `RegistryAction`) and no test that merely looks an
 * id up catches it either, because the lookup still succeeds. Refusing at import
 * time means the API fails to boot instead of serving a re-permissioned verb.
 */
for (const a of GPS_ACTIONS) {
  if (ACTION_REGISTRY[a.id]) {
    throw new Error(
      `[actions] GPS action '${a.id}' collides with an existing registry entry — ` +
        'merging it would silently re-permission the desk action it shadows.',
    );
  }
  ACTION_REGISTRY[a.id] = a;
}

/**
 * LCX MARKETING's market-abuse perimeter (M2). Three write paths, declared in
 * `../marketing/abuseRegister.ts` and merged here on exactly the terms above.
 *
 * WITHOUT THIS LOOP THE ENGINE WAS DECORATION. `MARKETING_ABUSE_ACTIONS` was exported
 * and imported by nothing, so `enterEmbargo`, `liftEmbargo` and `declareHoldings` were
 * unreachable through `invokeAction` — meaning the embargo register that
 * `claimSafety`/`abuse` refuse against had no governed way to be populated, and the
 * whole "the dangerous axis is the invisible one" doctrine rested on a table nobody
 * could write. This is the same defect the GPS perimeter had last week: a gate existed
 * and no write path consulted it.
 *
 * A LOOP, NOT A SPREAD, for the reason recorded above: `{ ...desk, ...marketing }` is
 * last-wins and silent, so a marketing id colliding with a desk id would REPLACE the
 * desk action — and these three demand `approver` plus a named human, so `notify` or
 * `assign` would quietly start refusing every operator who is neither. No type check
 * catches it (both sides are `RegistryAction`) and an id lookup still succeeds.
 * Refusing at import time means the API fails to boot rather than serving a
 * re-permissioned verb.
 *
 * The subject-compartment map above is the other half: these carry
 * `workspace: 'marketing'` so the VERB is gated, and `/^marketing_/` gates the SUBJECT
 * so an untagged cross-cutting verb cannot reach it either.
 */
for (const a of MARKETING_ABUSE_ACTIONS) {
  if (ACTION_REGISTRY[a.id]) {
    throw new Error(
      `[actions] marketing action '${a.id}' collides with an existing registry entry — ` +
        'merging it would silently re-permission the desk action it shadows.',
    );
  }
  ACTION_REGISTRY[a.id] = a;
}

export function listActions(): Array<Pick<RegistryAction, 'id' | 'label' | 'description' | 'subjectTypes' | 'minRole'>> {
  return Object.values(ACTION_REGISTRY).map((a) => ({
    id: a.id, label: a.label, description: a.description, subjectTypes: a.subjectTypes, minRole: a.minRole,
  }));
}

/**
 * Invoke a governed action. Validates params, enforces the role, executes, and
 * writes the object_actions ledger + audit_log. `actor`/`role` come from the
 * authenticated principal (or 'monitor:<id>' when a monitor fires it).
 */
/**
 * Parameter names that must never reach the ledger, the audit log, or any log
 * line. Matched case-insensitively on a substring so a future
 * `newStepUpPasscode` or `apiSecret` is caught without anyone remembering to
 * extend this list — the failure mode of an allowlist here is a credential in a
 * queryable table, so the bias is deliberately toward over-redacting.
 */
const SECRET_PARAM_PATTERN = /passcode|password|secret|token|apikey|api_key|credential/i;

/** The recordable form of an action's params: same shape, secrets replaced. */
export function redactSecrets(params: Record<string, unknown>): Record<string, unknown> {
  let touched = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    // Name AND type. Matching on the name alone is deliberately over-broad — the
    // tradeoff is documented in authority.test.ts and it is the right way round: a
    // less informative audit row beats a credential in a queryable table. But a
    // BOOLEAN cannot BE a credential, so redacting one buys no safety and does cost
    // information. The case that surfaced it: `dist_campaign_create.tokenIncentivized`
    // matches `token`, so the audit row for creating a token-incentivized campaign did
    // not record that it was token-incentivized — the exact flag that makes the action
    // require an approver, missing from the trail that records the approval.
    //
    // Restricting the exemption to booleans, rather than adding `(?!Incentivized)` to
    // the pattern, keeps the deny-by-default posture intact for every string and
    // generalises: a future `tokenEnabled` or `secretBallot: true` is safe by the same
    // reasoning, and a `token: "eyJ..."` is still destroyed.
    if (SECRET_PARAM_PATTERN.test(k) && typeof v !== 'boolean') {
      // Kept as a present-but-empty marker rather than dropped, so the record
      // still shows that step-up was performed.
      out[k] = '[redacted]';
      touched = true;
    } else {
      out[k] = v;
    }
  }
  return touched ? out : params;
}

/* ══════════════════════ IDEMPOTENCY (Phase 3.3) ══════════════════════
 *
 * THE DEFECT: a transport failure means the RESPONSE was lost, not that the
 * request was. `watchlist_add` is safe to retry (ON CONFLICT DO NOTHING) but
 * `dist_campaign_create` is not — it INSERTs — and every action writes an
 * object_actions row and an audit_log row unconditionally, so a blind retry of
 * ANY action forges a second entry in the ledger the whole programme is audited
 * against. Until this existed the client's only remedy for a dropped connection
 * was "re-open the subject and check by eye" (see the NETWORK branch of
 * apps/web/src/components/command/invoke.ts).
 *
 * THE CONTRACT: the caller supplies a key it generates ONCE per user intent and
 * reuses across transport retries of that same intent. Dedupe is keyed on
 * (action, subjectType, subjectId, key) — not on the params — because two
 * different param sets under one key is a client bug, and silently executing the
 * second one would be the worse failure.
 *
 * WHY A RESERVATION ROW AND NOT "SELECT THEN INSERT": the race that matters is
 * two concurrent retries, not a sequential replay. The reservation is claimed
 * with a single INSERT .. ON CONFLICT DO NOTHING, so exactly one caller can win;
 * the loser either returns the stored result or is told the original is still
 * running. A read-then-write check would let both through.
 *
 * WHAT IS NOT PROVEN: the three writes (ledger, audit, completion) are not in one
 * transaction — neither were the two ledger writes before this. So a process
 * death between `execute` and the completion UPDATE leaves a reservation that
 * looks abandoned, and a retry inside the takeover window below can re-execute.
 * That window is narrower than the pre-existing one (which was unbounded) but it
 * is not zero, and calling it "exactly once" would be false.
 */

const IDEMPOTENCY_KEY_MAX = 200;

/**
 * How long a reservation may sit un-finalised before a retry may take it over.
 * Without a takeover window an API process that died mid-execute would make that
 * key answer 409 forever. Chosen above the 5s connection timeout in db/index.ts
 * and the platform's own request ceiling — NOT measured against real action
 * latencies, because no action here does bounded external work. If a legitimate
 * action ever exceeds this, a concurrent retry can double-execute it.
 */
const IDEMPOTENCY_STALE_MS = 60_000;

type Reservation =
  /** No key supplied — behaves exactly as it did before Phase 3.3. */
  | { mode: 'off' }
  /** The dedupe table does not exist yet (42P01); proceeding unprotected. */
  | { mode: 'degraded'; reason: string }
  /** We own the reservation and must finalise or release it. */
  | { mode: 'held' }
  /** A completed original exists; return its result without re-executing. */
  | { mode: 'replay'; result: Record<string, unknown> };

interface IdemKey { action: string; subjectType: string; subjectId: string; key: string; actor: string }

/** An absent or blank header means "no key", which is not an error. */
function normalizeIdempotencyKey(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const key = raw.trim();
  if (!key) return null;
  if (key.length > IDEMPOTENCY_KEY_MAX) {
    throw new ActionError('VALIDATION', `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX} characters`);
  }
  return key;
}

const IDEM_BINDS = (k: IdemKey) => [k.action, k.subjectType, k.subjectId, k.key];

async function reserveIdempotency(pool: pg.Pool, k: IdemKey): Promise<Reservation> {
  try {
    // Two attempts, because a losing INSERT followed by a SELECT that finds
    // nothing means the original released its reservation (it failed) in between.
    // That is a real, if narrow, interleaving and the second attempt claims it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const claimed = await pool.query(
        `INSERT INTO action_idempotency (action, subject_type, subject_id, idem_key, actor)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (action, subject_type, subject_id, idem_key) DO NOTHING`,
        [...IDEM_BINDS(k), k.actor],
      );
      if ((claimed.rowCount ?? 0) === 1) return { mode: 'held' };

      const { rows } = await pool.query<{ result: Record<string, unknown> | null; age_ms: string }>(
        `SELECT result, (EXTRACT(EPOCH FROM (now() - created_at)) * 1000)::bigint AS age_ms
           FROM action_idempotency
          WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4`,
        IDEM_BINDS(k),
      );
      const row = rows[0];
      if (!row) continue;
      if (row.result !== null) return { mode: 'replay', result: row.result };

      if (Number(row.age_ms) < IDEMPOTENCY_STALE_MS) {
        // The original is still running. Answering 409 rather than executing is
        // the entire point: a second execution is exactly what the caller was
        // trying to avoid by sending a key.
        throw new ActionError('IDEMPOTENT_IN_FLIGHT',
          'An identical request is still being processed. Wait for it rather than retrying.', 409,
          { idempotencyKey: k.key });
      }
      const taken = await pool.query(
        `UPDATE action_idempotency SET actor=$5, created_at=now()
          WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4 AND result IS NULL`,
        [...IDEM_BINDS(k), k.actor],
      );
      if ((taken.rowCount ?? 0) === 1) return { mode: 'held' };
    }
    // Lost both races without ever seeing a row. Fall through unprotected rather
    // than refuse a legitimate write — and say so in the ledger.
    return { mode: 'degraded', reason: 'idempotency reservation could not be resolved (contended); replay protection was NOT in force' };
  } catch (err) {
    if (err instanceof ActionError) throw err;
    // Same 42P01 discipline as the gates: migration 0045 lands by hand, so a
    // missing table must not take the write path down. Every other error is a
    // fault and propagates — a broken dedupe table must not quietly become no
    // dedupe at all, which is how the gates above got into trouble.
    if (!isMissingTable(err)) throw err;
    return { mode: 'degraded', reason: 'action_idempotency does not exist (42P01) — replay protection was NOT in force' };
  }
}

/** Publish the result so a later retry replays instead of re-executing. */
async function completeIdempotency(pool: pg.Pool, k: IdemKey, result: Record<string, unknown>): Promise<void> {
  try {
    await pool.query(
      `UPDATE action_idempotency SET result=$5::jsonb, completed_at=now()
        WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4`,
      [...IDEM_BINDS(k), JSON.stringify(result)],
    );
  } catch (err) {
    // The action HAS happened and is recorded. Failing the response now would
    // tell the caller it did not, which is the one answer that is certainly
    // wrong — it invites the retry this whole mechanism exists to absorb.
    console.warn('[actions] idempotency completion failed; a retry of this key may re-execute:', err instanceof Error ? err.message : err);
  }
}

/** Drop the reservation so a failed action can be genuinely retried. */
async function releaseIdempotency(pool: pg.Pool, k: IdemKey): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM action_idempotency
        WHERE action=$1 AND subject_type=$2 AND subject_id=$3 AND idem_key=$4 AND result IS NULL`,
      IDEM_BINDS(k),
    );
  } catch (err) {
    // Swallowed on purpose: the caller is about to receive the real failure and
    // that must not be replaced by a bookkeeping error. Worst case the key stays
    // reserved until the takeover window expires.
    console.warn('[actions] idempotency release failed:', err instanceof Error ? err.message : err);
  }
}

export async function invokeAction(
  pool: pg.Pool,
  id: string,
  input: {
    subjectType: string; subjectId: string; params?: Record<string, unknown>;
    actor: string; role: ActorRole; confirmedBy?: string;
    /** The `Idempotency-Key` request header, verbatim. Absent = no dedupe. */
    idempotencyKey?: string;
  },
): Promise<Record<string, unknown>> {
  const action = ACTION_REGISTRY[id];
  if (!action) throw new ActionError('UNKNOWN_ACTION', `No such action: ${id}`, 404);
  if (!action.subjectTypes.includes('*') && !action.subjectTypes.includes(input.subjectType)) {
    throw new ActionError('WRONG_SUBJECT', `${id} does not apply to ${input.subjectType}`);
  }
  if (action.minRole === 'approver' && input.role !== 'approver') {
    throw new ActionError('FORBIDDEN', `${id} requires approver`, 403);
  }
  // LCX OS compartment gate (Phase 1): workspace-tagged actions require the
  // actor to hold the workspace at operate-tier (approve-tier when the action
  // itself is approver-only). Machines (shared key, monitor:<id>, ai) hold
  // blanket operate; the fail-open loader keeps pre-0042 deploys safe.
  /*
   * THE SUBJECT'S COMPARTMENT, NOT ONLY THE ACTION'S.
   *
   * `action.workspace` is the compartment the ACTION belongs to. Three actions carry
   * no tag at all because they are cross-cutting — `watchlist_add`, `flag_review`,
   * `notify` (`subjectTypes: ['*']`) — so the gate below was skipped entirely for
   * them. `POST /v1/actions/watchlist_add/invoke {"subjectType":"gps_engagement"}`
   * therefore let a principal with NO gps grant write `object_actions` and an
   * `audit_log` row with `entity='gps_engagement'` and free text in `meta`, against
   * an engagement id it never had to prove exists. The audit trail of a client's
   * compliance file was writable from outside the compartment.
   *
   * So the subject type is mapped to a compartment too, and BOTH gates run. This is
   * a prefix map rather than an exhaustive registry on purpose: an untagged subject
   * type keeps today's behaviour, and the one prefix that matters — anything
   * `gps_` — is the one holding a third party's material.
   */
  const subjectWorkspace = subjectTypeWorkspace(input.subjectType);
  const gates: Array<{ workspace: WorkspaceId; needed: Capability }> = [];
  if (action.workspace) {
    gates.push({ workspace: action.workspace, needed: action.minRole === 'approver' ? 'approve' : 'operate' });
  }
  if (subjectWorkspace && subjectWorkspace !== action.workspace) {
    gates.push({ workspace: subjectWorkspace, needed: 'operate' });
  }
  if (gates.length > 0) {
    const entitlements = await loadEntitlements(pool, input.actor);
    for (const g of gates) {
      if (!capAtLeast(entitlements[g.workspace], g.needed)) {
        throw new ActionError(
          'WORKSPACE_FORBIDDEN',
          `${id} requires '${g.needed}' on workspace '${g.workspace}'`,
          403,
          { workspace: g.workspace, needed: g.needed },
        );
      }
    }
  }
  const parsed = action.paramsSchema.safeParse(input.params ?? {});
  if (!parsed.success) {
    throw new ActionError(
      'VALIDATION',
      parsed.error.issues.map((i) => i.message).join('; '),
      400,
      // Per-field detail so a param prompt can highlight the field that failed
      // instead of showing one concatenated sentence.
      { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    );
  }
  const params = parsed.data as Record<string, unknown>;

  // Replay protection comes AFTER validation and the permission gates: a request
  // that would be refused anyway must not consume a key, or a client that fixed
  // its params and retried under the same key would get the stale refusal.
  const idemKey = normalizeIdempotencyKey(input.idempotencyKey);
  const k: IdemKey | null = idemKey
    ? { action: id, subjectType: input.subjectType, subjectId: input.subjectId, key: idemKey, actor: input.actor }
    : null;
  const reservation: Reservation = k ? await reserveIdempotency(pool, k) : { mode: 'off' };
  if (reservation.mode === 'replay') return reservation.result;

  /**
   * Degradations that occurred while serving THIS request: a gate that could not
   * be evaluated, or replay protection that was not in force. Collected rather
   * than logged so they land in the ledger — a fail-open path that leaves no
   * trace is indistinguishable from the path where everything worked, which is
   * the property that let the bare catches survive seven phases.
   */
  const degradations: string[] = [];
  const markGateDegraded = (reason: string) => {
    if (!degradations.includes(reason)) degradations.push(reason);
  };
  const idempotencyDegraded = reservation.mode === 'degraded' ? reservation.reason : null;

  let result: Record<string, unknown>;
  try {
    result = await action.execute({
      pool, subjectType: input.subjectType, subjectId: input.subjectId,
      params, actor: input.actor, role: input.role, markGateDegraded,
    });
  } catch (err) {
    // The action did not happen, so the key must not be spent — otherwise a
    // client correcting a transient failure would replay a result that never
    // existed.
    if (k && reservation.mode === 'held') await releaseIdempotency(pool, k);
    throw err;
  }

  // The spine — the action ledger and the audit log, both, always.
  //
  // Recorded with the secrets stripped. `revoke_entitlement` takes a
  // `stepUpPasscode` for step-up re-auth, and writing `params` verbatim put the
  // shared desk passcode in plaintext into TWO tables on every revoke, where it
  // would then be readable by anyone with the audit surface. The credential has
  // already served its purpose by this point — it was verified before execute —
  // so the record needs to show only that step-up happened, not what was typed.
  //
  // The degradation markers are stamped on AFTER redaction, deliberately: every
  // paramsSchema is a z.object(), which strips unknown keys, so a client cannot
  // supply `gateDegraded` itself — but building the record in this order means
  // that even if some future schema passed one through, the server's own finding
  // wins rather than being overwritten by the client's.
  const recorded: Record<string, unknown> = { ...redactSecrets(params) };
  if (degradations.length > 0) {
    recorded.gateDegraded = true;
    recorded.gateDegradedReason = degradations.join(' | ');
  }
  if (idempotencyDegraded) {
    recorded.idempotencyDegraded = true;
    recorded.idempotencyDegradedReason = idempotencyDegraded;
  }
  await pool.query(
    `INSERT INTO object_actions (org_id, subject_type, subject_id, action, params, result, actor)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [DEFAULT_ORG_ID, input.subjectType, input.subjectId, id, JSON.stringify(recorded), JSON.stringify(result), input.actor],
  );
  // When an AI proposal was confirmed by a human, actor stays 'ai' (the origin)
  // while the audit records who signed off — accountability without pretending
  // the machine acted alone.
  const auditMeta = input.confirmedBy ? { ...recorded, _confirmedBy: input.confirmedBy } : recorded;
  await pool.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [input.actor, `action:${id}`, input.subjectType, input.subjectId, JSON.stringify(auditMeta)],
  );
  // Published only once the ledger and audit rows exist, so a replay can never
  // return a result for an action that was never recorded.
  if (k && reservation.mode === 'held') await completeIdempotency(pool, k, result);
  return result;
}
