import { FlaskConical, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import {
  useSalesScenarioStore,
  useScenarioActive,
  applyScenarioToValue,
  applyScenarioToWinProb,
  type SalesScenario,
} from '@/stores';
import { fmtMoneyCents } from './dealFormat';

/**
 * Scenario engine surface for the deal pages (F3).
 *
 * `ScenarioCard` = the three assumption dials (close rate, value/discount,
 * timeline). `SimPill` = the cyan simulation indicator + reset shown near a
 * PageTitle whenever any dial is off baseline. `ScenarioValue` = the standard
 * "adjusted in cyan, baseline struck-through" money treatment.
 * Cyan is the app-wide simulation/projection accent.
 */

export function useScenario(): SalesScenario {
  const closeRateDelta = useSalesScenarioStore(s => s.closeRateDelta);
  const valueDelta = useSalesScenarioStore(s => s.valueDelta);
  const timelineShiftDays = useSalesScenarioStore(s => s.timelineShiftDays);
  return { closeRateDelta, valueDelta, timelineShiftDays };
}

/* ─────────────────────────── SIM pill ─────────────────────────── */

export function SimPill({ className }: { className?: string }) {
  const active = useScenarioActive();
  const reset = useSalesScenarioStore(s => s.reset);
  if (!active) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-micro font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400',
        className,
      )}
    >
      <FlaskConical size={10} aria-hidden="true" />
      SIM
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-0.5 rounded px-1 font-bold normal-case hover:bg-cyan-500/15"
        title="Reset scenario to baseline"
      >
        <RotateCcw size={9} aria-hidden="true" /> reset
      </button>
    </span>
  );
}

/* ──────────────────────── Value treatment ──────────────────────── */

export interface ScenarioValueProps {
  cents: number | null | undefined;
  className?: string;
  /** Baseline placement relative to the adjusted figure. */
  baseline?: 'inline' | 'stacked';
}

/**
 * Money display that reflows under the active scenario: adjusted number in
 * cyan with the baseline small/struck-through beside it. Falls back to the
 * plain baseline when no scenario is active.
 */
export function ScenarioValue({ cents, className, baseline = 'inline' }: ScenarioValueProps) {
  const active = useScenarioActive();
  const scenario = useScenario();
  if (cents == null || cents === 0 || !active || scenario.valueDelta === 0) {
    return <span className={className}>{fmtMoneyCents(cents)}</span>;
  }
  const adjusted = applyScenarioToValue(cents, scenario);
  return (
    <span className={clsx(baseline === 'stacked' ? 'inline-flex flex-col items-end' : 'inline-flex items-baseline gap-1', className)}>
      <span className="font-mono text-cyan-600 dark:text-cyan-400" title="Scenario-adjusted value">
        {fmtMoneyCents(adjusted)}
      </span>
      <span className="text-[9px] text-grey line-through" title="Baseline value">
        {fmtMoneyCents(cents)}
      </span>
    </span>
  );
}

/** Win-probability display (percent) with the same simulation treatment. */
export function ScenarioWinProb({ pct, className }: { pct: number; className?: string }) {
  const active = useScenarioActive();
  const scenario = useScenario();
  if (!active || scenario.closeRateDelta === 0) {
    return <span className={clsx('font-mono', className)}>{Math.round(pct)}%</span>;
  }
  const adjusted = applyScenarioToWinProb(pct, scenario);
  return (
    <span className={clsx('inline-flex items-baseline gap-1', className)}>
      <span className="font-mono text-cyan-600 dark:text-cyan-400" title="Scenario-adjusted win probability">
        {Math.round(adjusted)}%
      </span>
      <span className="text-[9px] text-grey line-through" title="Baseline win probability">
        {Math.round(pct)}%
      </span>
    </span>
  );
}

/* ───────────────────────── Scenario card ───────────────────────── */

interface DialProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint: string;
}

function Dial({ label, value, min, max, step, format, onChange, hint }: DialProps) {
  const off = value !== 0;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-micro font-bold uppercase tracking-wider text-grey">{label}</span>
        <span className={clsx('font-mono text-label font-bold', off ? 'text-cyan-600 dark:text-cyan-400' : 'text-navy')}>
          {format(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-cyan-500"
        aria-label={label}
      />
      <span className="block text-micro text-grey">{hint}</span>
    </label>
  );
}

const pctFmt = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const daysFmt = (v: number) => (v === 0 ? '±0d' : `${v > 0 ? '+' : ''}${v}d`);

/** The right-rail "Scenario" instrument card (Deal Desk). */
export function ScenarioCard({ className }: { className?: string }) {
  const scenario = useScenario();
  const setDial = useSalesScenarioStore(s => s.setDial);
  const reset = useSalesScenarioStore(s => s.reset);
  const active = useScenarioActive();

  return (
    <section
      className={clsx(
        'rounded-lg border p-4 transition-colors',
        active ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-line bg-card',
        className,
      )}
      aria-label="Scenario dials"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-navy">
          <FlaskConical size={14} className="text-cyan-500" aria-hidden="true" />
          Scenario
        </h2>
        {active && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-bold text-cyan-600 hover:bg-cyan-500/10 dark:text-cyan-400"
          >
            <RotateCcw size={10} aria-hidden="true" /> Reset
          </button>
        )}
      </div>

      <div className="space-y-3">
        <Dial
          label="Close rate"
          value={scenario.closeRateDelta}
          min={-0.5}
          max={0.5}
          step={0.05}
          format={pctFmt}
          onChange={v => setDial('closeRateDelta', v)}
          hint="Relative shift applied to every win probability."
        />
        <Dial
          label="Value / discount"
          value={scenario.valueDelta}
          min={-0.5}
          max={0}
          step={0.05}
          format={pctFmt}
          onChange={v => setDial('valueDelta', v)}
          hint="Discount policy applied to every package value."
        />
        <Dial
          label="Timeline shift"
          value={scenario.timelineShiftDays}
          min={-30}
          max={30}
          step={5}
          format={daysFmt}
          onChange={v => setDial('timelineShiftDays', v)}
          hint="Expected closes pulled in (−) or pushed out (+)."
        />
      </div>

      <p className="mt-3 border-t border-line/60 pt-2 text-micro text-grey">
        Dials reflow every deal value on the Desk and the Board — cyan marks simulated numbers; baseline stays visible.
      </p>
    </section>
  );
}
