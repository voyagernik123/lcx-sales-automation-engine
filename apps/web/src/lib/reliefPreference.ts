/**
 * WHO DECIDES WHETHER A PAGE OPENS ON ITS RELIEF OR ITS FLAT SURFACE — one module, so the
 * answer cannot drift per page.
 *
 * ── THE HISTORY, BECAUSE THE DEFAULT USED TO BE A DOCTRINE AND IS NOW A DECISION ─────
 * For the whole of the 3-D programme, all seven opt-in reliefs shipped as `useState(false)`:
 * hardcoded off, not even persisted, behind a toggle whose caption said "nobody has yet timed
 * whether it answers faster than this grid." That was §7(b) — the anti-showreel clause — acting
 * as the gate: an unproven surface defaults off.
 *
 * §7(b) was then REFUSED AS UNMEASURABLE on these surfaces (docs/3d/e9/TRIAL_REFUSED.md): every
 * relief prints its dataset in a callout layer and the flat view is a table of the same data, so
 * a one-operator answering race discloses its own answers whichever surface goes first. Two
 * instruments were built; both were refuted on measurement. There is no round 3.
 *
 * A gate that can never be satisfied is not a gate, it is a wall pretending to be one. What
 * remained was a product decision, and the owner made it on 2026-08-20: the reliefs are the
 * point of the product — default ON wherever the evidence shows the surface renders honestly,
 * with the flat view one keypress away and the operator's choice REMEMBERED.
 *
 * ── WHY EACH DEFAULT IS WHAT IT IS ───────────────────────────────────────────────────
 * ON  deck, globe, pipeline, orrery, surface, vault — every §6 hygiene gate green in both
 *     themes (FINAL_SCORECARD.md), every refusal path lands on the flat surface, and the three
 *     print-reachable ones print their flat form even while the relief is open
 *     (reliefPrintPath.test.tsx). "Proven better" was never measurable; "proven honest" was,
 *     and is what a default can stand on.
 * OFF storm — not a rendering verdict. Its feed (forward marketing risk by day/channel/band)
 *     is produced nowhere in the system, so the surface draws nothing real; defaulting it on
 *     would present an absence as a reading. It stays opt-in until the owner decides the desk
 *     reports forward risk (OWNER_ACTIONS.md item 4). Flip it here when that day comes.
 *
 * ── WHY A PERSISTED PREFERENCE AND NOT JUST A BETTER CONSTANT ────────────────────────
 * A default is a statement about first contact; the operator's choice outranks it forever
 * after. `storage` is operator-scoped (persistence.ts), so one desk's choice does not leak
 * into another sign-in, and its in-memory tier means private browsing still remembers within
 * the tab. A stored value always wins over the table below — including a stored `false` over a
 * default `true`, which is the case a naive `?? default` gets right and `||` gets wrong.
 */
import { useCallback, useEffect, useState } from 'react';
import { storage } from './persistence';

export type ReliefSurface =
  | 'deck' | 'globe' | 'pipeline' | 'orrery' | 'surface' | 'vault' | 'storm';

/** The decision table. Owner decision 2026-08-20 — change values HERE, nowhere else. */
export const RELIEF_DEFAULT_ON: Record<ReliefSurface, boolean> = {
  deck: true,
  globe: true,
  pipeline: true,
  orrery: true,
  surface: true,
  vault: true,
  /* No feed exists — an empty storm presented by default is an absence rendering as a
     reading, the exact failure docs/phases/ABSENCES.md exists to prevent. */
  storm: false,
};

const keyFor = (s: ReliefSurface) => `relief:${s}`;

/** The stored choice if the operator ever made one, else the decision table. */
export function reliefInitiallyOn(s: ReliefSurface): boolean {
  return storage.get<boolean>(keyFor(s), RELIEF_DEFAULT_ON[s]);
}

/**
 * TWO WAYS OFF, AND ONLY ONE OF THEM IS A CHOICE — the distinction this hook exists to enforce.
 *
 * Every wrapper turns its relief off in two places: the operator's toggle, and `onRefused`,
 * which fires when the GL stage refuses (context lost, no WebGL2, over budget). Persisting the
 * second would record a MACHINE FAILURE as the operator's preference: one lost context on one
 * bad afternoon and the surface is off forever, silently, on a desk whose operator never chose
 * that. So:
 *
 *   `choose(v)`  — the operator acted. Update state AND remember it.
 *   `revoke()`   — the machine refused. Update state, remember NOTHING; next visit retries
 *                  from the operator's real preference.
 */
export function useReliefPreference(s: ReliefSurface): {
  on: boolean;
  choose: (v: boolean) => void;
  revoke: () => void;
} {
  const [want, setWant] = useState<boolean>(() => reliefInitiallyOn(s));
  /*
   * THE DEFAULT ENGAGES ONLY AFTER HYDRATION — this is what keeps §6 rule 1 true now that the
   * default is ON. `renderToStaticMarkup` runs no effects, so a server render sees `on: false`
   * and resolves to the flat surface; the first client paint is the flat surface too, and the
   * canvas mounts one effect later. Flipping the constant without this gate put a <canvas> into
   * server markup on six surfaces at once — caught by reliefFallback.test.tsx's SSR census, the
   * assertion written when the rule was cheap to keep. An operator's explicit `choose(true)`
   * is unaffected: clicks only happen after hydration.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const choose = useCallback((v: boolean) => {
    setWant(v);
    storage.set(keyFor(s), v);
  }, [s]);
  const revoke = useCallback(() => { setWant(false); }, []);
  return { on: want && hydrated, choose, revoke };
}
