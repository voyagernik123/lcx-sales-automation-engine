import { describe, expect, it } from 'vitest';
import {
  AUDITED_REFUSAL_PATTERNS,
  WORKSPACE_REFUSAL_ACTION,
  refusalIsAudited,
} from '../workspace.js';

/**
 * `requireWorkspace` returns 403 BEFORE any handler runs, so a refused read of a
 * client's stored document could not be recorded by the handler — it left no trace at
 * all. Once GPS gained a client-file intake surface (2026-08-02) that silence became
 * the defect: "who tried to read our file" is the first question a client asks, and
 * "we do not log that" is not an answer.
 *
 * These tests pin the COVERAGE of the allowlist rather than the SQL. Two properties
 * matter and both have already been wrong once:
 *   1. every artifact route is matched — a prefix-only matcher missed the mounted
 *      `/v1/gps/engagements/:id/artifacts` pair entirely;
 *   2. the list stays narrow — auditing all 403s across eight compartments is an
 *      unbounded-INSERT vector an outsider could aim.
 */
describe('audited refusals — coverage of the artifact surface', () => {
  // Mirrors routes/gpsArtifact.ts. If a route is added there and not here, the
  // exhaustiveness test below is what should make somebody look.
  const ARTIFACT_ROUTES = [
    '/v1/gps/engagements/eng_01H/artifacts',        // POST upload, GET list
    '/v1/gps/artifacts/art_01H/download-url',      // GET signed link
    '/v1/gps/artifacts/art_01H/content',           // GET bytes
    '/v1/gps/artifacts/art_01H',                   // DELETE
  ] as const;

  it.each(ARTIFACT_ROUTES)('records a refusal for %s', (path) => {
    expect(refusalIsAudited(path)).toBe(true);
  });

  it('records the engagement-scoped artifact route, which a prefix matcher missed', () => {
    // The regression that nearly shipped: startsWith('/v1/gps/artifacts') is false
    // here, because the dynamic segment sits in the middle of the path.
    const path = '/v1/gps/engagements/eng_01H/artifacts';
    expect(path.startsWith('/v1/gps/artifacts')).toBe(false);
    expect(refusalIsAudited(path)).toBe(true);
  });

  it('is not defeated by a trailing segment or a query-shaped id', () => {
    expect(refusalIsAudited('/v1/gps/artifacts/art_1/content')).toBe(true);
    expect(refusalIsAudited('/v1/gps/engagements/e-1/artifacts/x')).toBe(true);
  });
});

describe('audited refusals — the list stays narrow', () => {
  // Every one of these 403s is ordinary and must stay cheap. If auditing every
  // refusal ever looks attractive, read the write-amplification note in workspace.ts.
  const NOT_AUDITED = [
    '/v1/gps/book',
    '/v1/gps/underwriting',
    '/v1/gps/clients',
    '/v1/marketing/queue',
    '/v1/command/overview',
    '/v1/distribution/quests',
    '/v1/deals/board',
    '/v1/audit',
    '/v1/health',
  ] as const;

  it.each(NOT_AUDITED)('does not record a refusal for %s', (path) => {
    expect(refusalIsAudited(path)).toBe(false);
  });

  it('does not match a path that merely mentions artifacts elsewhere', () => {
    expect(refusalIsAudited('/v1/command/artifacts')).toBe(false);
    expect(refusalIsAudited('/v1/gpsx/artifacts')).toBe(false);
    // Anchoring matters: a caller must not be able to prepend their way in.
    expect(refusalIsAudited('/evil/v1/gps/artifacts/1/content')).toBe(false);
  });

  it('keeps the allowlist small enough to read, so growth is a deliberate act', () => {
    expect(AUDITED_REFUSAL_PATTERNS.length).toBeLessThanOrEqual(4);
    expect(AUDITED_REFUSAL_PATTERNS.length).toBeGreaterThan(0);
  });

  it('every pattern is anchored at the start of the path', () => {
    for (const p of AUDITED_REFUSAL_PATTERNS) {
      expect(p.source.startsWith('^')).toBe(true);
    }
  });
});

describe('the recorded action is one queryable string', () => {
  it('names the event rather than describing it', () => {
    // One constant, so "every attempt to read a client file that was turned away" is
    // a single audit_log filter and not a guess at free text.
    expect(WORKSPACE_REFUSAL_ACTION).toBe('workspace.access_refused');
  });
});
