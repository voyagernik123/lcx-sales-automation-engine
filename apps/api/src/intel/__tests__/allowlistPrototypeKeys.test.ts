import { describe, expect, it } from 'vitest';
import { isValidMonitor } from '../monitors.js';
import { isResolvableType } from '../../graph/links.js';

/**
 * AN ALLOWLIST CHECKED WITH `in` IS NOT AN ALLOWLIST.
 *
 * `in` walks the prototype chain, so for ANY plain object `'constructor' in obj` is true —
 * as are toString, valueOf, hasOwnProperty, isPrototypeOf, and __proto__. Three allowlists
 * in this repo were consulted that way. Found by an adversarial pass over the injection
 * angle; verified before fixing:
 *
 *     'constructor' in {a:1}                                  → true
 *     Object.prototype.hasOwnProperty.call({a:1},'constructor') → false
 *
 * ── WHY IT MATTERED MOST IN MONITORS, AND WHY IT IS NOT AN INJECTION ─────────────
 * `intel/monitors.ts` validated `condition.metric` with `metric in METRIC_SQL`, then
 * `buildQuery` interpolated `METRIC_SQL[metric]` into the WHERE clause. For 'constructor'
 * that value is the Object constructor, which coerces to
 *
 *     function Object() { [native code] } > $1
 *
 * Postgres rejects that with a syntax error, so nothing is injected — the query simply
 * cannot run. The damage is subtler and worse for this platform: the failure was caught and
 * `continue`d BEFORE `UPDATE monitors SET last_run_at = now()`, so the monitor stayed
 * `enabled = true`, never advanced, and never fired its governed action. A standing
 * compliance or BD watch that reads as live and is permanently dead is the exact
 * "refusal that looks like a fact" class this platform treats as a real vulnerability.
 *
 * These tests fail against the `in` operator, which is the only thing that makes them worth
 * having. The monitors case additionally pins the SKIP being REPORTED — fixing the
 * prototype hole alone would have moved the invisibility from the SQL error to the
 * validation branch rather than closing it.
 */

/** Every key that exists on Object.prototype and therefore answers `in` on any object. */
const PROTOTYPE_KEYS = [
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__proto__',
] as const;

describe('an allowlist is checked by ownership, not by the prototype chain', () => {
  it('states the JavaScript fact these guards turn on, so the fix is not mysterious later', () => {
    const plain: Record<string, string> = { real_key: 'x' };
    for (const k of PROTOTYPE_KEYS) {
      expect(k in plain, `${k} answers the 'in' operator on a plain object`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(plain, k), `${k} is not an own key`).toBe(false);
    }
    expect(Object.prototype.hasOwnProperty.call(plain, 'real_key')).toBe(true);
  });

  it('rejects a prototype key as a monitor METRIC', () => {
    for (const k of PROTOTYPE_KEYS) {
      const err = isValidMonitor({
        condition: { metric: k, op: 'gt', threshold: 5 },
        action: { id: 'notify' },
      });
      // A STRING is the rejection; null means "valid", which is what the `in` version returned.
      expect(err, `metric '${k}' must be rejected`).toBe(`Unknown metric: ${k}`);
    }
  });

  it('rejects a prototype key as a monitor OPERATOR', () => {
    for (const k of PROTOTYPE_KEYS) {
      const err = isValidMonitor({
        condition: { metric: 'volume_24h_usd', op: k, threshold: 5 },
        action: { id: 'notify' },
      });
      expect(err, `op '${k}' must be rejected`).toBe(`Unknown operator: ${k}`);
    }
  });

  it('still accepts a real metric and operator, so the guard is not a wall', () => {
    expect(
      isValidMonitor({
        condition: { metric: 'volume_24h_usd', op: 'gt', threshold: 1_000_000 },
        action: { id: 'notify' },
      }),
    ).toBeNull();
  });

  it('rejects a prototype key as a resolvable inspector type', () => {
    for (const k of PROTOTYPE_KEYS) {
      expect(isResolvableType(k), `'${k}' must not be resolvable`).toBe(false);
    }
    // The negative control: a type that IS declared still resolves. Without this the test
    // above would pass against `return false`.
    expect(isResolvableType('project')).toBe(true);
  });
});
