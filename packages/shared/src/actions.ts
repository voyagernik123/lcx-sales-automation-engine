/**
 * The Actions framework — Palantir's "act on the object" doctrine.
 *
 * Every ontology object exposes a set of governed Actions. Server actions write
 * back through the API (recorded in object_actions + the hash-chained audit_log
 * with attribution); client actions are pure navigation and never hit the API.
 * A single registry keeps the frontend action bar and the backend executor in
 * lockstep so they can't drift.
 */

import type { TeamRole } from './operators.js';

export type ActionId =
  | 'watchlist_add'
  | 'watchlist_remove'
  | 'flag_review'
  | 'unflag'
  | 'note_add'
  | 'start_deal'
  | 'open_workspace';

export interface ActionDef {
  id: ActionId;
  label: string;
  description: string;
  /** Ontology object types this applies to; ['*'] = any object. */
  appliesTo: string[];
  /** Minimum role required to see/run the action. */
  minRole: TeamRole;
  /** client:true → handled by the frontend (navigation); never sent to the action API. */
  client?: boolean;
  /** The action this one reverses, for building a single toggle control. */
  toggleOf?: ActionId;
  /** Visual intent hint for the UI. */
  intent?: 'default' | 'primary' | 'warn';
}

export const ACTION_DEFS: ActionDef[] = [
  { id: 'watchlist_add', label: 'Add to watchlist', description: 'Pin this object to the desk watchlist.', appliesTo: ['*'], minRole: 'operator', intent: 'primary' },
  { id: 'watchlist_remove', label: 'On watchlist', description: 'Remove from the watchlist.', appliesTo: ['*'], minRole: 'operator', toggleOf: 'watchlist_add' },
  { id: 'flag_review', label: 'Flag for review', description: 'Raise this object for approver review.', appliesTo: ['*'], minRole: 'operator', intent: 'warn' },
  { id: 'unflag', label: 'Flagged', description: 'Clear the review flag.', appliesTo: ['*'], minRole: 'operator', toggleOf: 'flag_review' },
  { id: 'note_add', label: 'Add note', description: 'Attach a quick note to this object.', appliesTo: ['*'], minRole: 'operator' },
  { id: 'start_deal', label: 'Start a deal', description: 'Open the deal flow for this project.', appliesTo: ['project'], minRole: 'operator', client: true, intent: 'primary' },
  { id: 'open_workspace', label: 'Open workspace', description: 'Jump to the full workspace for this object.', appliesTo: ['*'], minRole: 'viewer', client: true },
];

const RANK: Record<TeamRole, number> = { viewer: 0, operator: 1, approver: 2 };

/** Actions available for an object type to an operator of a given role. */
export function actionsFor(objectType: string, role: TeamRole): ActionDef[] {
  return ACTION_DEFS.filter(
    (a) => (a.appliesTo.includes('*') || a.appliesTo.includes(objectType)) && RANK[role] >= RANK[a.minRole],
  );
}

export function getAction(id: string): ActionDef | undefined {
  return ACTION_DEFS.find((a) => a.id === id);
}

/** Actions the API executes with write-back (everything not client-only). */
export const SERVER_ACTIONS: ActionId[] = ['watchlist_add', 'watchlist_remove', 'flag_review', 'unflag', 'note_add'];

export function isServerAction(id: string): id is ActionId {
  return (SERVER_ACTIONS as string[]).includes(id);
}
