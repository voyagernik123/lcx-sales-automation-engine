import { describe, expect, it } from 'vitest';
import {
  BOOK_MONITOR_SPECS, MONITOR_INPUT_KEYS, MONITOR_INPUT_LABEL,
  monitorRegistrability, registerableBookMonitors,
  type MonitorInputAvailability, type MonitorInputKey,
} from './loop.js';

/**
 * G7 — THE THREE MONITORS LIGHT UP BY MEASUREMENT, NOT BY ASSERTION.
 *
 * The plan says the three placeholder-blocked monitors (margin floor, bench,
 * perimeter review) become real after G0. The tempting implementation was to flip
 * `blockedOnPlaceholders` to false and declare victory — which is the defect this
 * program has paid for repeatedly: the check passes while the property it stands for
 * is still false, because the owner has not approved a packet yet.
 *
 * So these tests assert the DERIVATION, in both directions: nothing supplied means
 * nothing new registers, and each monitor turns on exactly when its own inputs
 * arrive — never on someone else's.
 */

const NONE: MonitorInputAvailability = {
  price_bands: false, effort_triples: false, pricing_policy: false,
  partner_bench: false, perimeter_reviewed: false,
};
const ALL: MonitorInputAvailability = {
  price_bands: true, effort_triples: true, pricing_policy: true,
  partner_bench: true, perimeter_reviewed: true,
};
const with_ = (...keys: MonitorInputKey[]): MonitorInputAvailability =>
  keys.reduce((acc, k) => ({ ...acc, [k]: true }), NONE);

describe('the spec data itself', () => {
  it('declares required inputs for every monitor, drawn from the closed key set', () => {
    for (const spec of BOOK_MONITOR_SPECS) {
      expect(Array.isArray(spec.requiresInputs), `${spec.key} has no requiresInputs`).toBe(true);
      for (const k of spec.requiresInputs) {
        expect(MONITOR_INPUT_KEYS).toContain(k);
        expect(MONITOR_INPUT_LABEL[k]).toBeTruthy();
      }
    }
  });

  it('agrees with the shipped constant: exactly the placeholder-blocked three need inputs', () => {
    // The two statements are independent — one is a 2026-08 constant, the other is
    // this pass's dependency list — so their agreement is worth asserting rather
    // than assuming. If they ever disagree, one of them is lying.
    const needInputs = BOOK_MONITOR_SPECS.filter((s) => s.requiresInputs.length > 0).map((s) => s.key).sort();
    const blocked = BOOK_MONITOR_SPECS.filter((s) => s.blockedOnPlaceholders).map((s) => s.key).sort();
    expect(needInputs).toEqual(blocked);
    expect(needInputs).toEqual(['bench_headroom_zero', 'margin_below_floor', 'perimeter_stale']);
  });
});

describe('monitorRegistrability', () => {
  it('with nothing supplied, registers only the two that stand on dates already in the register', () => {
    const registerable = monitorRegistrability(NONE).filter((r) => r.registerable).map((r) => r.spec.key).sort();
    expect(registerable).toEqual(['conflict_missing', 'deposit_overdue']);
    // And it says exactly what each blocked one is waiting for.
    const margin = monitorRegistrability(NONE).find((r) => r.spec.key === 'margin_below_floor')!;
    expect(margin.missingInputs).toEqual(['effort_triples', 'partner_bench', 'pricing_policy']);
  });

  it('with everything supplied, ALL FIVE register — the G7 promise, measured', () => {
    const all = monitorRegistrability(ALL);
    expect(all.every((r) => r.registerable)).toBe(true);
    expect(all.every((r) => r.missingInputs.length === 0)).toBe(true);
    expect(all).toHaveLength(BOOK_MONITOR_SPECS.length);
  });

  it('turns each monitor on only for ITS OWN inputs', () => {
    // The bench monitor needs the bench and nothing else.
    const bench = monitorRegistrability(with_('partner_bench')).find((r) => r.spec.key === 'bench_headroom_zero')!;
    expect(bench.registerable).toBe(true);
    // The perimeter monitor is untouched by the bench arriving.
    const perimeter = monitorRegistrability(with_('partner_bench')).find((r) => r.spec.key === 'perimeter_stale')!;
    expect(perimeter.registerable).toBe(false);
    expect(perimeter.missingInputs).toEqual(['perimeter_reviewed']);
    // The margin floor needs all three of its inputs — two is not enough.
    const partial = monitorRegistrability(with_('effort_triples', 'partner_bench'))
      .find((r) => r.spec.key === 'margin_below_floor')!;
    expect(partial.registerable).toBe(false);
    expect(partial.missingInputs).toEqual(['pricing_policy']);
  });

  it('treats a missing or non-true availability value as NOT supplied', () => {
    // A key read as truthy-by-absence is how a monitor lights up on inputs nobody
    // supplied. Undefined and false must behave identically.
    const sparse = { ...NONE, partner_bench: undefined } as unknown as MonitorInputAvailability;
    const bench = monitorRegistrability(sparse).find((r) => r.spec.key === 'bench_headroom_zero')!;
    expect(bench.registerable).toBe(false);
  });

  it('leaves the legacy no-argument function answering exactly as before', () => {
    // Existing callers (loopResponse) must not change behaviour in this pass.
    expect(registerableBookMonitors().map((s) => s.key).sort()).toEqual(['conflict_missing', 'deposit_overdue']);
  });
});
