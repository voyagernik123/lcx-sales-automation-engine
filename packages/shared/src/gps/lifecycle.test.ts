import { describe, expect, it } from 'vitest';
import { ENGAGEMENT_STATUSES, type EngagementStatus } from './types.js';
import {
  GATED_ENGAGEMENT_STATUSES,
  MANUAL_ENGAGEMENT_TARGETS,
  MANUAL_ENGAGEMENT_TRANSITIONS,
  checkManualTransition,
  isGatedEngagementStatus,
} from './lifecycle.js';

/**
 * THE RULE THAT WAS CORRECT AND LIVED NEXT TO ONE OF ITS TWO ENFORCEMENT POINTS.
 *
 * `apps/api/src/gps/actions.ts` held this map privately, with a comment predicting the
 * exact defect: "If a generic status setter could write [proposed/accepted], every
 * gate in this file would be one `gps_status_change` call away from being bypassed."
 * `POST /v1/gps/engagements/:id/status` was that generic status setter — it validated
 * against all of `ENGAGEMENT_STATUSES` — so `{"status":"proposed"}` reached the state
 * the perimeter guard and the underwriting guard sit in front of, on an engagement
 * both had refused, and `{"status":"collected"}` then took it to cash in one hop.
 */

describe('the two gated statuses cannot be set by hand', () => {
  it('excludes exactly proposed and accepted from the manual targets', () => {
    expect([...GATED_ENGAGEMENT_STATUSES].sort()).toEqual(['accepted', 'proposed']);
    expect(MANUAL_ENGAGEMENT_TARGETS).not.toContain('proposed');
    expect(MANUAL_ENGAGEMENT_TARGETS).not.toContain('accepted');
    // Nothing else was dropped: the ONLY difference from the full list is the two.
    expect([...MANUAL_ENGAGEMENT_TARGETS].sort()).toEqual(
      ENGAGEMENT_STATUSES.filter((s) => s !== 'proposed' && s !== 'accepted').slice().sort(),
    );
  });

  it('refuses proposed and accepted from EVERY origin status', () => {
    for (const from of ENGAGEMENT_STATUSES) {
      for (const to of GATED_ENGAGEMENT_STATUSES) {
        const r = checkManualTransition(from, to);
        expect(r.ok, `${from} → ${to} was allowed`).toBe(false);
        if (!r.ok) expect(r.code).toBe('STATUS_IS_GATED');
      }
    }
  });

  it('names the guarded operation in the refusal rather than saying "invalid"', () => {
    const r = checkManualTransition('conflict_pending', 'proposed');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/issue the proposal/);
      expect(r.reason).toMatch(/perimeter/);
      expect(r.reason).toMatch(/underwriting/);
    }
  });
});

describe('the money edges are edges, not prose', () => {
  it('deposit_paid is reachable only from accepted — a deposit against nothing signed is not a deposit', () => {
    const origins = ENGAGEMENT_STATUSES.filter((s) => checkManualTransition(s, 'deposit_paid').ok);
    expect(origins).toEqual(['accepted', 'deposit_paid']); // the no-op is allowed
  });

  it('in_delivery is reachable only from deposit_paid — a signature is not cash', () => {
    const origins = ENGAGEMENT_STATUSES.filter((s) => checkManualTransition(s, 'in_delivery').ok);
    expect(origins).toEqual(['deposit_paid', 'in_delivery']);
  });

  it('refuses draft → collected, the one-hop-to-cash the old route accepted', () => {
    const r = checkManualTransition('draft', 'collected');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('work that was delivered cannot be closed as LOST', () => {
    for (const from of ['in_delivery', 'delivered', 'invoiced'] as EngagementStatus[]) {
      expect(checkManualTransition(from, 'closed_lost').ok, from).toBe(false);
    }
  });

  it('cancelled is reachable from every live state — a desk must be able to stop', () => {
    for (const from of ENGAGEMENT_STATUSES) {
      // `cancelled → cancelled` is the idempotent no-op, allowed everywhere.
      const expected = from === 'cancelled' || MANUAL_ENGAGEMENT_TRANSITIONS[from].length > 0;
      expect(checkManualTransition(from, 'cancelled').ok, from).toBe(expected);
    }
  });

  it('terminal states accept nothing, and the map says so explicitly', () => {
    for (const t of ['collected', 'closed_lost', 'cancelled'] as EngagementStatus[]) {
      expect(MANUAL_ENGAGEMENT_TRANSITIONS[t]).toEqual([]);
      for (const to of MANUAL_ENGAGEMENT_TARGETS) {
        if (to === t) continue; // the idempotent no-op
        expect(checkManualTransition(t, to).ok, `${t} → ${to}`).toBe(false);
      }
    }
  });
});

describe('the map is total', () => {
  it('every status has an entry, so a new one cannot be added without deciding its edges', () => {
    for (const s of ENGAGEMENT_STATUSES) {
      expect(Array.isArray(MANUAL_ENGAGEMENT_TRANSITIONS[s]), s).toBe(true);
    }
    expect(Object.keys(MANUAL_ENGAGEMENT_TRANSITIONS).sort()).toEqual([...ENGAGEMENT_STATUSES].sort());
  });

  it('every edge target is a real status, and none is a gated one', () => {
    for (const [from, tos] of Object.entries(MANUAL_ENGAGEMENT_TRANSITIONS)) {
      for (const to of tos) {
        expect(ENGAGEMENT_STATUSES, `${from} → ${to}`).toContain(to);
        expect(isGatedEngagementStatus(to), `${from} → ${to} is a gated status`).toBe(false);
      }
    }
  });

  it('a no-op is allowed rather than refused', () => {
    // Refusing it would push callers into "compare, then set", which is the race the
    // edge map exists to avoid.
    for (const s of MANUAL_ENGAGEMENT_TARGETS) expect(checkManualTransition(s, s).ok, s).toBe(true);
  });
});
