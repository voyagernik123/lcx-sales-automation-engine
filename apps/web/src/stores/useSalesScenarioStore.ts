import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';

/**
 * The sales-side scenario engine — the analog of the toolkit's legislative
 * what-if toggles. Dialing an assumption here must reflow every surface that
 * prices or forecasts the pipeline (Deal Desk, Deal Board rollups, KPI
 * forecast, Home brief). When any dial differs from baseline the UI shows
 * the cyan "SIM" treatment, same signal color the toolkit uses.
 */
export interface SalesScenario {
  /** Relative close-rate adjustment, -0.5..+0.5 (e.g. +0.1 = +10%). */
  closeRateDelta: number;
  /** Relative package-value adjustment (discount policy), -0.5..0. */
  valueDelta: number;
  /** Days pulled in (-) / pushed out (+) on expected closes. */
  timelineShiftDays: number;
}

export const BASELINE_SCENARIO: SalesScenario = {
  closeRateDelta: 0,
  valueDelta: 0,
  timelineShiftDays: 0,
};

interface SalesScenarioStore extends SalesScenario {
  setDial: <K extends keyof SalesScenario>(key: K, value: SalesScenario[K]) => void;
  reset: () => void;
}

export const useSalesScenarioStore = create<SalesScenarioStore>()(
  persist(
    set => ({
      ...BASELINE_SCENARIO,
      setDial: (key, value) => set({ [key]: value }),
      reset: () => set({ ...BASELINE_SCENARIO }),
    }),
    {
      name: STORAGE_KEYS.SCENARIO,
      storage: createJSONStorage(() => ({
        getItem: n => JSON.stringify(storage.get(n, null)),
        setItem: (n, v) => storage.set(n, JSON.parse(v)),
        removeItem: n => storage.remove(n),
      })),
    },
  ),
);

/** True when any dial is off baseline — drives the global SIM indicator. */
export function useScenarioActive(): boolean {
  return useSalesScenarioStore(
    s => s.closeRateDelta !== 0 || s.valueDelta !== 0 || s.timelineShiftDays !== 0,
  );
}

/** Apply the scenario to a win probability (clamped 0..1 domain in percent). */
export function applyScenarioToWinProb(pct: number, scenario: SalesScenario): number {
  return Math.max(0, Math.min(100, pct * (1 + scenario.closeRateDelta)));
}

/** Apply the scenario to a package value (cents). */
export function applyScenarioToValue(cents: number, scenario: SalesScenario): number {
  return Math.round(cents * (1 + scenario.valueDelta));
}
