/**
 * Grammar annotations — what a JSON Schema cannot say about an action.
 *
 * The command line in Phase 3 is GENERATED from ACTION_REGISTRY so it can never
 * drift from what the server allows. `z.toJSONSchema()` carries most of that
 * faithfully, but it loses or misstates three things, each measured:
 *
 * 1. `.refine()` is SILENTLY DROPPED. `command_set_partner_details` requires at
 *    least one of two fields via a refinement; the emitted schema accepts `{}`
 *    and the server then rejects it. A false accept.
 * 2. The emitted schema says `additionalProperties: false`, but zod v4 STRIPS
 *    unknown keys instead of rejecting them. A literal JSON-Schema validator is
 *    therefore STRICTER than the server. A false reject.
 * 3. Some legal value sets are not in the schema at all — they are resolved at
 *    execute time from the roster or from compiled seed data.
 *
 * So these annotations live here, beside the registry rather than in the client,
 * and travel to the client inside the generated manifest. Client-side validation
 * is advisory in both directions; `invokeAction` remains the only authority.
 *
 * Every entry below cites the line in registry.ts it compensates for.
 */

import type { WorkspaceId } from '@lcx/shared';

/** How a param should be treated by a generated prompt. */
export type ParamKind =
  /** An ordinary value to ask for. */
  | 'value'
  /** Free-text justification. Prompted last, never pre-filled. */
  | 'reason'
  /** A deliberate risk acceptance. Never offered casually; requires a reason. */
  | 'override'
  /** A credential. Never stored, never logged, never pre-filled, masked on entry. */
  | 'secret'
  /** An open key/value map rather than a fixed field set. */
  | 'record';

/** What omitting an optional field MEANS on the server. */
export type OmitSemantics =
  /** Omitted writes NULL over the existing value. */
  | 'null'
  /** Omitted leaves the existing value (COALESCE). */
  | 'preserve'
  /** Omitted merges into the existing object rather than replacing it. */
  | 'merge';

export interface ActionGrammar {
  paramKinds?: Record<string, ParamKind>;
  omitSemantics?: Record<string, OmitSemantics>;
  /** At least one field from each inner group must be present (lost `.refine()`). */
  atLeastOneOf?: string[][];
  /** Value sets resolved at runtime, not declared in the schema. */
  enumFrom?: Record<string, 'roster' | 'rfi_fields'>;
  /** Subject state that makes this action legal at all. */
  precondition?: { field: string; in: string[] };
  /** Shape of a valid subject id, so the command line can reject early. */
  nounIdShape?: 'uuid' | 'slug' | 'int' | 'member' | 'pseudo';
}

/**
 * Annotations by action id. Absent means "the JSON Schema is the whole truth".
 */
export const ACTION_GRAMMAR: Record<string, ActionGrammar> = {
  command_set_partner_details: {
    // registry.ts .refine(): at least one of primaryContact / terms.
    atLeastOneOf: [['primaryContact', 'terms']],
  },
  set_member_profile: {
    // `{}` is schema-valid and writes NULL over both fields.
    atLeastOneOf: [['unit', 'title']],
    omitSemantics: { unit: 'null', title: 'null' },
  },
  dist_listing_set_status: {
    // COALESCE($n, col) — omitting keeps the existing value.
    omitSemantics: { rankNote: 'preserve', usageNote: 'preserve', url: 'preserve' },
  },
  command_rfi_record: {
    // jsonb `values = command_rfi.values || EXCLUDED.values`, and the legal keys
    // are whitelisted from the seed at execute time, not by the schema.
    omitSemantics: { values: 'merge' },
    enumFrom: { values: 'rfi_fields' },
  },
  assign: {
    // The owner is validated against the desk roster, not a z.enum.
    enumFrom: { owner: 'roster' },
    nounIdShape: 'member',
  },
  command_set_requirement_status: { nounIdShape: 'int' },
  command_set_blocker_status: { nounIdShape: 'int' },
  command_decide: {
    paramKinds: { overrideSat: 'override', overrideReason: 'reason' },
    precondition: { field: 'status', in: ['open'] },
  },
  command_reopen_decision: {
    precondition: { field: 'status', in: ['decided'] },
  },
  decide_access_request: {
    precondition: { field: 'status', in: ['pending'] },
  },
  dist_campaign_set_status: {
    paramKinds: { overrideGate: 'override', overrideReason: 'reason' },
  },
  revoke_entitlement: {
    paramKinds: { stepUpPasscode: 'secret', justification: 'reason' },
  },
  track: {
    // `AND tier<>'tracked'` — returns promoted:false silently otherwise, so the
    // command line should not offer it on an already-tracked project.
    precondition: { field: 'tier', in: ['catalog'] },
  },
  dist_campaign_create: {
    // subjectTypes is ['distribution'] and the executor ignores subjectId; the
    // client passes a placeholder. There is no real noun to resolve.
    nounIdShape: 'pseudo',
  },
};

/** One action as the client sees it. Shapes the generated manifest. */
export interface ManifestAction {
  id: string;
  label: string;
  description: string;
  subjectTypes: string[];
  minRole: 'operator' | 'approver';
  workspace: WorkspaceId | null;
  /** JSON Schema from z.toJSONSchema(paramsSchema). Advisory — see the header. */
  params: unknown;
  grammar: ActionGrammar;
}

export interface ActionManifest {
  actions: ManifestAction[];
  /** Set of legal values for the enumFrom sources, resolved at generation time. */
  valueSets: Record<string, string[]>;
  /** sha256 of the canonical actions+valueSets, for deploy-skew detection. */
  manifestHash: string;
}
