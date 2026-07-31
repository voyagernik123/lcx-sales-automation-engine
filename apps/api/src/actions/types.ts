/**
 * The action *contract* — the four names an action module needs in order to
 * declare itself, extracted from registry.ts so that a module of actions can
 * live outside registry.ts without an import cycle.
 *
 * WHY THIS FILE EXISTS AT ALL. Every action up to Phase 7 was declared inline in
 * `ACTION_REGISTRY` (registry.ts:125), so the contract could live beside the
 * registry with nothing to break. GPS is the first feature to declare its actions
 * in its own file (`../gps/actions.ts`), which makes the dependency mutual:
 * registry.ts needs `GPS_ACTIONS` to build `ACTION_REGISTRY`, and gps/actions.ts
 * needs `ActionError` to refuse.
 *
 * That cycle is not merely untidy, it is a crash, and only from one direction —
 * the worst kind. ESM evaluates the first-imported module's dependencies first,
 * so entering through `gps/actions.ts` (which is what `gps/__tests__/actions.test.ts:29`
 * does) starts registry.ts while `GPS_ACTIONS` is still in its temporal dead
 * zone, and registry.ts reads it at module-body time to build the record:
 * `ReferenceError: Cannot access 'GPS_ACTIONS' before initialization`. Entering
 * through registry.ts or app.ts happens to work, because by then GPS_ACTIONS has
 * been initialised. So the API would boot, serve, and pass most of its suite,
 * and fail only in whichever files import the action module first.
 *
 * The fix is the ordinary one: the shared contract has no dependency on either
 * side, so nothing is circular. registry.ts re-exports all four names, so the
 * ~6 existing importers (`routes/actions.ts:11`, `routes/aiOperator.ts:16`,
 * `intel/actions.ts:5`, `routes/intel.ts:6`, …) are untouched and there is one
 * `ActionError` class in the process — `instanceof` (registry.ts:949,
 * routes/actions.ts) still holds.
 *
 * Nothing executable belongs here beyond `ActionError` itself. In particular the
 * gates, the ledger writes and `invokeAction` stay in registry.ts: this file is
 * imported by action modules, and a module they all import is the wrong place to
 * put anything that could be reached without passing through the front door.
 */
import type { z } from 'zod';
import type pg from 'pg';
import type { WorkspaceId } from '@lcx/shared';

export type ActorRole = 'operator' | 'approver';

export interface ActionContext {
  pool: pg.Pool;
  subjectType: string;
  subjectId: string;
  params: Record<string, unknown>;
  actor: string;
  /** The principal's role — some gates (e.g. campaign launch) require approver. */
  role: ActorRole;
  /**
   * Declare that a gate could not be evaluated and was skipped. invokeAction
   * stamps `gateDegraded: true` plus this reason into BOTH the object_actions
   * ledger and the audit_log row, so a skipped gate is distinguishable after the
   * fact from a satisfied one. Without it the fail-open path is invisible: the
   * audit row for an ungated write looks exactly like the row for a cleared one.
   */
  markGateDegraded: (reason: string) => void;
}

export interface RegistryAction {
  id: string;
  label: string;
  description: string;
  subjectTypes: string[]; // ['project'] or ['*']
  minRole: ActorRole;
  /**
   * LCX OS compartment (Phase 1): when set, invokeAction additionally requires
   * the actor to hold this workspace at 'operate' (or 'approve' when minRole
   * is approver). Untagged actions rely on minRole alone — cross-cutting desk
   * actions stay workspace-free by design.
   */
  workspace?: WorkspaceId;
  paramsSchema: z.ZodType<Record<string, unknown>>;
  execute: (ctx: ActionContext) => Promise<Record<string, unknown>>;
}

export class ActionError extends Error {
  code: string;
  status: number;
  /**
   * Machine-readable detail carried alongside the code, spread into the response
   * body by the invoke route. A refusal has to be actionable without parsing
   * prose: the command line decides which remedy to offer from `code`, and needs
   * this to say WHICH reviews are missing or WHICH workspace is required.
   */
  data?: Record<string, unknown>;
  constructor(code: string, message: string, status = 400, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}
