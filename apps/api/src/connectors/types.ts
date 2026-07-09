import type { RawProject } from '../import/types.js';

/** One staged source record — raw payload plus a stable natural key. */
export interface StagedRecord {
  externalId: string;
  payload: Record<string, unknown>;
  contentHash: string;
}

export interface ConnectorContext {
  /** Incremental sync position from the previous successful run (job_runs.cursor). */
  cursor: Record<string, unknown> | null;
  log: (message: string) => void;
}

/**
 * A data source. `fetch` yields batches of raw records (paged for APIs, one
 * batch for files); `normalize` maps one staged record to a canonical project
 * shape, or null to quality-gate it out (row stays staged as 'ignored').
 */
export interface Connector {
  /** project_sources.source value. */
  name: string;
  fetch(ctx: ConnectorContext): AsyncIterable<StagedRecord[]>;
  normalize(record: StagedRecord): RawProject | null;
}

export interface ConnectorRunReport {
  connector: string;
  fetched: number;
  staged: number;
  changed: number;
  ignored: number;
  attached: number;
  inserted: number;
  errors: string[];
  /** externalId → canonical projectId for every mapped record in this run. */
  projectIdByExternalId: Map<string, string>;
}

/** Stable content hash for change detection (order-independent for objects). */
export function contentHash(payload: Record<string, unknown>): string {
  const stable = JSON.stringify(payload, Object.keys(payload).sort());
  // FNV-1a 32-bit ×2 (offset variants) — cheap and adequate for change gating
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < stable.length; i++) {
    h1 ^= stable.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= stable.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193 + 2) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}
