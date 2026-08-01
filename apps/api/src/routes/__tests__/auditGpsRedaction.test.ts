import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * `/v1/audit` WAS A SECOND DOOR INTO THE GPS COMPARTMENT.
 *
 * GPS is `machineAccess: false` specifically so the shared key and the monitors cannot
 * read a third party's confidential commercial terms. But `/v1/audit` is mounted under
 * `governance`, which IS `machineAccess: true`, and `invokeAction` writes every GPS
 * action's params into `audit_log.meta` verbatim — including `checkPerformed` (the
 * conflict-check narrative on a named client) and `disclosureTextUsed` (the exact words a
 * client was given). `redactSecrets` matches neither: they are not secrets, they are
 * somebody else's confidential material.
 *
 * So `GET /v1/audit?entity=gps_engagement&limit=200` with `$OPERATOR_API_KEY` returned
 * the compartment's most sensitive strings through a compartment the key legitimately
 * holds. The boundary was drawn on `/v1/gps/*` and the data left by a different door.
 *
 * Source-level: this route is drizzle over a real pool and the api suite is
 * database-free. What is asserted is the mechanism — a capability check, applied per row,
 * that hides the PAYLOAD and not the row.
 */

const SRC = readFileSync(new URL('../audit.ts', import.meta.url), 'utf8');

describe('GPS audit rows do not carry their meta to a principal without gps:view', () => {
  it('loads the caller capabilities and gates on gps at view', () => {
    expect(SRC).toContain('loadEntitlements(');
    expect(SRC).toMatch(/capAtLeast\(\s*ents\.gps\s*,\s*'view'\s*\)/);
  });

  it('withholds meta on gps_* entities only, by prefix', () => {
    expect(SRC).toMatch(/GPS_ENTITY_RE\s*=\s*\/\^gps_\//);
    expect(SRC).toMatch(/gpsRow && !mayReadGps \? GPS_META_WITHHELD : r\.meta/);
  });

  it('still returns the ROW — the audit trail is not what is hidden', () => {
    // Filtering the row out would be its own defect: "who did what to which engagement,
    // when" is the trail, and a reader who cannot see the payload can still ask for
    // access. Only `meta` is replaced.
    const mapper = SRC.slice(SRC.indexOf('data: (rowsResult.rows'), SRC.indexOf('meta: {'));
    for (const field of ['actor', 'action', 'entity', 'entityId', 'createdAt']) {
      expect(mapper, `${field} was dropped along with meta`).toContain(field);
    }
    expect(SRC).not.toMatch(/\.filter\([^)]*gps/);
  });

  it('the refusal states why and what would clear it, rather than returning null', () => {
    expect(SRC).toMatch(/withheld: true/);
    expect(SRC).toMatch(/holding the gps compartment at view/);
    // A bare null would be indistinguishable from "this action had no params".
    expect(SRC).not.toMatch(/meta: gpsRow && !mayReadGps \? null/);
  });

  it('tells the client whether it was given the payloads at all', () => {
    // Without this a surface cannot tell "no GPS activity" from "GPS activity I may
    // not read" — the same conflation `migrated: false` exists to prevent elsewhere.
    expect(SRC).toContain('gpsMetaVisible');
  });

  it('loads the capabilities ONCE per request, not once per row', () => {
    const mapStart = SRC.indexOf('data: (rowsResult.rows');
    expect(SRC.indexOf('loadEntitlements(')).toBeLessThan(mapStart);
  });
});
