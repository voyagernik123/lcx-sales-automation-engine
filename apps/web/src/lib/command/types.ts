/**
 * The client's view of the action manifest.
 *
 * Deliberately a hand-written mirror of apps/api/src/actions/grammar.ts rather
 * than an import: apps/web has no dependency on apps/api (they build and deploy
 * separately), and pulling the API in would drag zod and the whole registry into
 * the web bundle, which has 12KB of headroom. The drift test on the API side
 * compares the generated artifact byte-for-byte against the registry, so a
 * mismatch fails CI — the mirror cannot silently rot.
 */

export type ParamKind = 'value' | 'reason' | 'override' | 'secret' | 'record';

export type OmitSemantics = 'null' | 'preserve' | 'merge';

export interface ActionGrammar {
  paramKinds?: Record<string, ParamKind>;
  omitSemantics?: Record<string, OmitSemantics>;
  /** At least one field from each inner group must be present. */
  atLeastOneOf?: string[][];
  enumFrom?: Record<string, 'roster' | 'rfi_fields'>;
  /** Subject state that makes this action legal at all. */
  precondition?: { field: string; in: string[] };
  nounIdShape?: 'uuid' | 'slug' | 'int' | 'member' | 'pseudo';
}

/**
 * A JSON Schema object as emitted by z.toJSONSchema.
 *
 * The fields the grammar actually reads are named; everything else is permitted
 * through an index signature rather than enumerated. JSON Schema is open-ended
 * and the emitter adds keys we do not consume (`$schema`, and `propertyNames` on
 * the one open record param) — a closed type would make the generated artifact
 * fail to typecheck every time zod widened its output, which is a build break for
 * no safety gain on fields nothing reads.
 */
export interface ParamSchema {
  type?: string;
  properties?: Record<string, ParamProperty>;
  required?: string[];
  additionalProperties?: boolean | ParamProperty;
  propertyNames?: ParamProperty;
  [key: string]: unknown;
}

export interface ParamProperty {
  type?: string;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
  [key: string]: unknown;
}

export interface ManifestAction {
  id: string;
  label: string;
  description: string;
  /** ['*'] means every noun. */
  subjectTypes: string[];
  minRole: 'operator' | 'approver';
  workspace: string | null;
  params: ParamSchema;
  grammar: ActionGrammar;
}

export interface ActionManifest {
  actions: ManifestAction[];
  valueSets: Record<string, string[]>;
  manifestHash: string;
}
