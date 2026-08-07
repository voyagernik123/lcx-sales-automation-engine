import { useEffect, useState } from 'react';
import { Database, ChevronDown } from 'lucide-react';
import { fetchCommandDeep, type CommandDeep } from '@/lib/api/command';
import { SourceChip } from './SourceChip';
/*
 * IMPORTED FROM THE SIBLING PANEL rather than restated here, and the duplication it avoids is
 * the point: two copies of a three-state read are two things that drift, and the state this one
 * decides is which cells the LP surface next door draws as holes. One predicate, one answer.
 * (A shared module would be the tidier home; this lane may create no new source file, and the
 * two files sit in the same directory.)
 */
import { scorecardCellState } from './CockpitPanels';
import { clsx } from 'clsx';

/**
 * Deep Ontology & Provenance panel (100X Phase 1) — the window into the
 * full-fidelity strategy: the four weighted scorecards (with their real
 * dimensions and weights), the token-DD framework with its legal GATE, the
 * GENIUS stablecoin policy, and the 100-source provenance registry behind
 * every figure. Phase 3 turns these into full working instruments; this panel
 * proves the machinery is live and traceable end to end.
 */
export function DeepOntologyPanel() {
  const [deep, setDeep] = useState<CommandDeep | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<'lp' | 'channel' | 'arch' | 'twoPath' | 'dd' | 'genius'>('lp');
  const [open, setOpen] = useState(true);

  useEffect(() => { fetchCommandDeep().then(setDeep).catch(() => setErr(true)); }, []);

  if (err) return null;

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <Database size={13} /> Deep ontology — the strategy's own models
        {deep && <span className="rounded bg-ice-soft px-1.5 py-0.5 text-[10px] font-bold text-grey-dark dark:bg-ice-soft/10">{deep.reference.sources.length} graded sources</span>}
        <ChevronDown size={13} className={clsx('ml-auto transition-transform', !open && '-rotate-90')} />
      </button>

      {open && !deep && <p className="mt-2 text-label text-grey">Loading the deep extract…</p>}
      {open && deep && (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {([['lp', 'LP scorecard'], ['channel', 'Growth channels'], ['arch', 'Rails architecture'], ['twoPath', 'Listing paths'], ['dd', 'Token DD'], ['genius', 'GENIUS policy']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={clsx('rounded-md border px-2 py-0.5 text-micro font-medium',
                  tab === k ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-line text-grey hover:text-navy')}>
                {label}
              </button>
            ))}
          </div>

          {(tab === 'lp' || tab === 'channel' || tab === 'arch' || tab === 'twoPath') && (
            <ScorecardTable deep={deep} kind={tab} />
          )}

          {tab === 'dd' && (
            <div className="space-y-1.5">
              {deep.reference.ddDimensions.map((d) => (
                <div key={d.dimension} className={clsx('flex items-center gap-2 rounded border p-2', d.gate ? 'border-red-500/40 bg-red-500/5' : 'border-line/70')}>
                  <span className="w-14 shrink-0 text-right font-mono text-label font-bold text-navy">{d.weightPct}%</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-label font-semibold text-navy">{d.dimension}</span>
                      {d.gate && <span className="shrink-0 rounded bg-red-500/10 px-1 text-[10px] font-bold text-red-600 dark:text-red-400">HARD GATE</span>}
                      <SourceChip refs={d.sourceRefs.map(String)} sources={deep.reference.sources} />
                    </div>
                    {d.criteria && <p className="truncate text-micro text-grey" title={d.criteria}>{d.criteria}</p>}
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-grey">The token due-diligence model: no listing without counsel opinion — the 30% legal dimension is a gate, not a score.</p>
            </div>
          )}

          {tab === 'genius' && (
            <div className="space-y-1">
              {deep.reference.stablecoinPolicy.map((s) => (
                <div key={s.coin} className="flex items-center gap-2 rounded border border-line/70 p-2 text-label">
                  <span className="w-14 shrink-0 font-mono font-bold text-navy">{s.coin}</span>
                  <span className="w-40 shrink-0 truncate text-micro text-grey">{s.issuer}</span>
                  <span className="min-w-0 flex-1 truncate text-micro text-grey-dark" title={s.action}>{s.action}</span>
                  <SourceChip refs={s.sourceRefs.map(String)} sources={deep.reference.sources} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * ONE SCORECARD CELL, WITH ITS FOUR STATES KEPT APART.
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────────────
 * The cell was `const v = r.scores[d.key]` rendered as
 * `v >= 5 ? emerald : v >= 4 ? cyan : v >= 3 ? grey : red`. `scores` is typed
 * `Record<string, number>` and `noUncheckedIndexedAccess` is off, so `v` types as `number`
 * while at runtime it is whatever the JSON held. Every comparison against `undefined` is
 * false, so a dimension NOBODY ASSESSED fell through to the last branch and rendered as an
 * EMPTY RED BOX — visually a failing score. A `null` recorded as "there is no value here"
 * rendered identically. That is precisely the absent-is-not-zero collapse that was taken out
 * of the ranking engine this week (`commandEngines.ts:105`), still live on the table that
 * displays the same rows.
 *
 * ── WHAT IT DOES NOW ──────────────────────────────────────────────────────────────
 * Four states, four renderings, and none of them is a number:
 *   scored    the value, bucketed exactly as before — no shipped cell changes appearance.
 *   absent    an em-dash on the neutral ground. Nobody assessed it. It is not a low score.
 *   withheld  a lock glyph. Somebody recorded that there is no value to show.
 *   malformed a "?" in amber. Something is there and it is not a measurement.
 * `data-cell-state` carries the decision so a test can assert it without reading colours,
 * which is the only part of this jsdom can see.
 */
function ScoreCell({ scores, dimKey }: { scores: Readonly<Record<string, unknown>>; dimKey: string }) {
  const state = scorecardCellState(scores, dimKey);
  if (state !== 'scored') {
    const { glyph, tone, title } = state === 'absent'
      ? { glyph: '—', tone: 'text-grey/60', title: 'Not scored — nobody assessed this subject on this dimension. This is an absence, not a zero and not a low score.' }
      : state === 'withheld'
        ? { glyph: '⊘', tone: 'text-grey-dark', title: 'Withheld — recorded as having no value to show here. Measured or classified, but not displayable.' }
        : { glyph: '?', tone: 'text-amber-600 dark:text-amber-400', title: 'Malformed — a value is present and it is not a finite number, so it is not a measurement.' };
    return (
      <span
        data-cell-state={state}
        title={title}
        className={clsx('inline-block w-6 rounded border border-dashed border-line font-mono font-bold', tone)}
      >
        {glyph}
      </span>
    );
  }
  const v = (scores as Record<string, number>)[dimKey]!;
  return (
    <span
      data-cell-state="scored"
      className={clsx('inline-block w-6 rounded font-mono font-bold',
        v >= 5 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
        : v >= 4 ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
        : v >= 3 ? 'bg-ice-soft text-grey-dark dark:bg-ice-soft/10'
        : 'bg-red-500/10 text-red-600 dark:text-red-400')}
    >
      {v}
    </span>
  );
}

/**
 * NO SURFACE ON THIS PANEL, AND THAT IS A JUDGEMENT RATHER THAN AN OMISSION.
 *
 * The lane's brief invited the same treatment here and set the test: does the third dimension
 * carry information the flat version loses? For these four tabs the answer is NO, and the reason
 * is structural rather than a matter of taste.
 *
 * `LpOptimizerPanel`'s ranked list COLLAPSES the matrix — nine partners × ten dimensions reduced
 * to one weighted average each — so ninety cells are genuinely not on the screen and a surface is
 * the only way to put them there. This table collapses NOTHING. Every cell of every scorecard is
 * already rendered, with its own value, in its own column. A surface over it would show the same
 * numbers as heights: better SHAPE PERCEPTION, no additional information. That is the definition
 * of decoration, and decoration on a decision surface reads as authority.
 *
 * The size test points the same way for three of the four. `lp` is 10×9, `channel` 6×12, `arch`
 * 8×4 and `twoPath` 6×3 (dimensions × subjects, counted from the shipped seed). At three and four
 * subjects, `twoPath` and `arch` are read whole at a glance — a surface over three rows is a
 * ribbon. `channel` at 12 subjects is the one arguable case, and it loses on the first test.
 *
 * WHAT WAS FIXED HERE INSTEAD is the defect that actually cost a reader something: an unscored
 * cell rendering as a failing one. `buildScorecardSurface` in `CockpitPanels.tsx` is already
 * generic over `{ dimensions, rows }`, so if the owner disagrees with this judgement any tab
 * becomes a surface in one JSX line and one `readsAs` sentence — the sentence being the part
 * that has to be true.
 */
function ScorecardTable({ deep, kind }: { deep: CommandDeep; kind: 'lp' | 'channel' | 'arch' | 'twoPath' }) {
  const sc = deep.reference.scorecards[kind];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-micro">
        <thead>
          <tr className="text-left text-grey">
            <th className="py-1 pr-2 font-semibold">Subject</th>
            {sc.dimensions.map((d) => (
              <th key={d.key} className="px-1 py-1 text-center font-semibold" title={d.label}>
                <div className="max-w-16 truncate">{d.label}</div>
                <div className="font-mono text-[9px] text-grey/70">×{d.weight}</div>
              </th>
            ))}
            <th className="px-1 py-1 text-center font-semibold">Wtd</th>
            <th className="px-1 py-1 text-center font-semibold">Tier</th>
          </tr>
        </thead>
        <tbody>
          {sc.rows.map((r) => (
            <tr key={r.subjectId} className="border-t border-line/50">
              <td className="max-w-44 truncate py-1 pr-2 font-medium text-navy" title={r.note ?? r.subjectLabel}>{r.subjectLabel}</td>
              {sc.dimensions.map((d) => (
                <td key={d.key} className="px-1 py-1 text-center">
                  <ScoreCell scores={r.scores} dimKey={d.key} />
                </td>
              ))}
              <td className="px-1 py-1 text-center font-mono font-bold text-navy">{r.weighted ?? '—'}</td>
              <td className="max-w-20 truncate px-1 py-1 text-center text-grey-dark">{r.tier ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-grey">
        Weights and scores exactly as authored in the strategy workbook (grade C3 · public research). Phase 2 makes the weights live-editable with sensitivity analysis.
        {' '}A cell reading <span className="font-mono font-bold">—</span> was never scored, <span className="font-mono font-bold">⊘</span> is recorded as withheld,
        {' '}and <span className="font-mono font-bold">?</span> holds something that is not a number. None of the three is a zero, and none is averaged into the weighted column.
      </p>
    </div>
  );
}
