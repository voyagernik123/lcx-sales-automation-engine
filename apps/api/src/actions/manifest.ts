/**
 * The action manifest — the generative bridge between the server's registry and
 * the client's command line (TERMINAL Phase 3).
 *
 * The point of generating rather than hand-listing: a new governed action must
 * appear in the command line without anyone remembering to add it, and an action
 * that changes its params must not leave the client offering the old ones. The
 * drift test in __tests__/manifest.drift.test.ts turns that from a convention
 * into a CI fact.
 *
 * This module is server-side. Its output is committed into the web app as a
 * generated artifact (see scripts/gen-action-manifest.ts) so opening the command
 * line costs no round trip and works offline, and it is ALSO served by
 * GET /v1/actions with a hash so a client build older than the API can notice.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TEAM } from '@lcx/shared';
import { ACTION_REGISTRY } from './registry.js';
import { ACTION_GRAMMAR, type ActionManifest, type ManifestAction } from './grammar.js';
import { COMMAND_DEEP_SEED } from '../seed/command/data2.js';

/**
 * Stable JSON: keys sorted at every depth. The drift test compares bytes, so a
 * non-deterministic serialisation would make it flap on unrelated changes and
 * get disabled — which is the usual way a guard like this dies.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** The value sets that exist only at runtime, resolved once at generation time. */
function buildValueSets(): Record<string, string[]> {
  // `assign.owner` is checked against the desk roster, not a z.enum. 'operator'
  // is accepted as an unassigned sentinel by the executor.
  const roster = [...TEAM.map((m) => m.id), 'operator'].sort();

  // `command_rfi_record.values` keys are whitelisted at execute time from the
  // compiled RFI field list, so the schema alone cannot tell a client what is
  // legal. Degrades to an empty set rather than throwing if the seed shape moves.
  let rfiFields: string[] = [];
  try {
    const fields = (COMMAND_DEEP_SEED as { rfi?: { fields?: unknown } }).rfi?.fields;
    if (Array.isArray(fields)) {
      rfiFields = fields
        .map((f) => (typeof f === 'string' ? f : (f as { key?: string })?.key))
        .filter((k): k is string => typeof k === 'string' && k.length > 0)
        .sort();
    }
  } catch {
    rfiFields = [];
  }

  return { roster, rfi_fields: rfiFields };
}

/**
 * Convert a zod schema to JSON Schema. Never throws: an action whose schema
 * cannot be represented still appears in the manifest with an empty params
 * object, because dropping the action entirely would silently remove a verb from
 * the command line — a far worse failure than an imperfect prompt.
 */
function toJsonSchema(schema: z.ZodType<Record<string, unknown>>): unknown {
  try {
    return z.toJSONSchema(schema);
  } catch (err) {
    console.warn('[manifest] schema conversion failed:', err instanceof Error ? err.message : err);
    return { type: 'object', properties: {} };
  }
}

export function buildActionManifest(): ActionManifest {
  const actions: ManifestAction[] = Object.values(ACTION_REGISTRY)
    .map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      subjectTypes: [...a.subjectTypes],
      minRole: a.minRole,
      workspace: a.workspace ?? null,
      params: toJsonSchema(a.paramsSchema),
      grammar: ACTION_GRAMMAR[a.id] ?? {},
    }))
    .sort((x, y) => x.id.localeCompare(y.id));

  const valueSets = buildValueSets();
  const manifestHash = createHash('sha256')
    .update(canonicalJson({ actions, valueSets }))
    .digest('hex')
    .slice(0, 16);

  return { actions, valueSets, manifestHash };
}
