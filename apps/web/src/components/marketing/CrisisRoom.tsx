import { useMemo, useState } from 'react';
import { Timer } from 'lucide-react';
import { clsx } from 'clsx';
import { SectionLabel } from '@/components/ui';
import { Absent, NoPostingPath, Nothing, Refused, Th, Td } from './DeskAtoms';
import {
  CLEARANCE_HEADLINE_TEST_QUESTION,
  CRISIS_BLOCKING_CLEARANCES,
  CRISIS_EVIDENCE,
  HOLDING_STATEMENTS,
  HOLDING_STATEMENTS_INCIDENT_AGNOSTIC_REASON,
  HOLDING_STATEMENTS_UNREVIEWED_REASON,
  assessClearance,
  contagionReadiness,
  renderStatementGuidance,
  type Clearance,
  type ClearanceRole,
  type HoldingStatement,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE CRISIS ROOM — three clears in parallel, and a sentence already written
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This is a VIEW OVER `packages/shared/src/marketing/crisis.ts`. Not one statement text,
 * not one clearance rule and not one piece of evidence is written here: the library, the
 * lane resolution (`assessClearance`), the contagion readiness board and the four
 * primary-source citations all come from the engine, so a change to the doctrine happens
 * in one file and this screen follows it.
 *
 * WHAT THE LAYOUT ARGUES, and why it is three lanes rather than four steps: CERC names
 * the tension — "the need to ensure that information is confirmed to be accurate through
 * a clearance process [and] the need to ensure that information is communicated quickly"
 * — and resolves it with three reviewers gathered SIMULTANEOUSLY. A serial chain is what
 * makes a regulated desk structurally too slow to matter, and once every interested party
 * can veto, the desk stops shipping and the vacuum is filled by whoever is fastest.
 *
 * Two consequences the engine enforces and this screen must not soften:
 *  · Legal is not in the path unless the subject has legal implications. A blocking legal
 *    clearance supplied when there are none is DOWNGRADED to advisory rather than
 *    honoured, and the surface shows that it was downgraded.
 *  · A clearance binds to bytes. Change the text and every clearance against the old hash
 *    is void — otherwise four eyes degrades into four eyes on an earlier draft.
 *
 * WHAT THIS ROOM CANNOT DO, AND SAYS SO: it cannot store a clearance. There is no
 * incident record and no clearance route on this environment, so the lanes below are a
 * checklist an operator works through and the room states plainly that ticking them
 * records nothing. Faking a stored clearance would be the worst possible thing to fake,
 * because its entire value is evidential.
 */

const LANE_WHO: Record<ClearanceRole, { who: string; asks: string }> = {
  reputation: {
    who: 'Communication lead',
    asks: 'Responsible for the organisation\'s reputation. Is this how LCX should sound, and can it stand as a headline?',
  },
  policy: {
    who: 'Policy owner',
    asks: 'Responsible for ensuring the information does not counter organisation policy.',
  },
  sme: {
    who: 'Subject-matter expert',
    asks: 'Both fast and knowledgeable. Is every factual assertion in it true, right now?',
  },
  legal: {
    who: 'Legal',
    asks: 'In the path only because this subject has specific legal implications.',
  },
};

/** A checklist tick, turned into the engine's own `Clearance` shape so the engine decides. */
function toClearance(role: ClearanceRole, headlineTest: boolean, at: string, hash: string): Clearance {
  return { role, mode: 'blocking', reviewer: `desk:${role}`, at, headlineTest, contentHash: hash, comment: null };
}

export function CrisisRoom({ now }: { now: number }) {
  const [chosen, setChosen] = useState<HoldingStatement | null>(null);
  const [cleared, setCleared] = useState<Partial<Record<ClearanceRole, boolean>>>({});
  const [headline, setHeadline] = useState<Partial<Record<ClearanceRole, boolean>>>({});
  const [legalImplications, setLegalImplications] = useState(false);
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const nowIso = new Date(now).toISOString();

  /**
   * THE ENGINE DECIDES, not the checkbox count.
   *
   * The clearance state is computed by `assessClearance` from the ticks, with a
   * placeholder content hash — there is no stored draft to bind to on this screen, and
   * that limit is printed below rather than hidden by passing a hash that looks real.
   */
  const clearance = useMemo(() => {
    const roles: ClearanceRole[] = [...CRISIS_BLOCKING_CLEARANCES, ...(legalImplications ? ['legal' as const] : [])];
    const supplied = roles
      .filter((r) => cleared[r] === true)
      .map((r) => toClearance(r, headline[r] === true, nowIso, 'not-bound-no-draft-on-this-screen'));
    return assessClearance({
      contentHash: 'not-bound-no-draft-on-this-screen',
      authoredBy: 'desk',
      authoredAt: nowIso,
      clearances: supplied,
      legalImplications,
    });
  }, [cleared, headline, legalImplications, nowIso]);

  const outstandingPreconditions = (chosen?.requiresBeforeUse ?? []).filter((p) => acked[String(p)] !== true);
  const readiness = useMemo(() => contagionReadiness(nowIso), [nowIso]);
  const svb = CRISIS_EVIDENCE.find((e) => e.key === 'svb_run_speed');

  return (
    <section aria-label="Crisis room" className="space-y-3">
      {/* ── WHY THE CLOCK. The engine's evidence, verbatim, with its locator — not a
             colourful aside but the reason the shape of this room is this shape. */}
      {svb && (
        <div className="flex items-start gap-1.5 border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5 text-status-conditional">
          <Timer size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-micro font-semibold leading-snug">{svb.headline}</p>
            <p className="mt-1 text-[10px] leading-snug text-grey">{svb.detail}</p>
            <p className="mt-1 font-mono text-[10px] leading-snug text-grey">
              {svb.authority} · {svb.locator}
            </p>
          </div>
        </div>
      )}

      {/* ── THE STANDING TRUTH ABOUT THESE TEXTS ──────────────────────────────── */}
      <div role="note" data-testid="mkt-crisis-not-reviewed" className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-status-blocked">
        <p className="text-micro font-semibold leading-snug">{HOLDING_STATEMENTS_UNREVIEWED_REASON}</p>
        <p className="mt-1 text-[10px] leading-snug text-grey">{HOLDING_STATEMENTS_INCIDENT_AGNOSTIC_REASON}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ── THE LIBRARY ────────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <SectionLabel as="h3">Prepared language</SectionLabel>
          <ul className="space-y-1">
            {HOLDING_STATEMENTS.map((s) => {
              const stale = Date.parse(s.reviewBy) < now;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    data-testid={`mkt-holding-${s.id}`}
                    onClick={() => { setChosen(s); setCleared({}); setHeadline({}); setAcked({}); }}
                    className={clsx(
                      'w-full border-l-2 px-2 py-1.5 text-left text-micro hover:bg-ice-soft focus-ring dark:hover:bg-ice-soft/10',
                      chosen?.id === s.id ? 'border-navy bg-ice-soft/60 dark:bg-ice-soft/10' : 'border-line',
                    )}
                  >
                    <span className="font-semibold text-navy">{s.title}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-grey">v{s.version}</span>
                    {/* Staleness is the engine's date, not this screen's judgement. An
                        unreviewed statement deployed confidently nine months after the
                        world changed is what turns one incident into two. */}
                    <span className={clsx('block font-mono text-[10px]', stale ? 'text-status-blocked' : 'text-grey')}>
                      {stale
                        ? `REVIEW OVERDUE since ${s.reviewBy.slice(0, 10)} — read it as out of date`
                        : `review by ${s.reviewBy.slice(0, 10)}`}
                      {s.supersededBy && ` · superseded by ${s.supersededBy}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ── CONTAGION READINESS. The panel to read on a quiet Tuesday. ────── */}
          <div className="border-t border-line pt-2">
            <SectionLabel as="h3">Peer-contagion readiness</SectionLabel>
            <p className="mt-0.5 text-[10px] leading-snug text-grey">
              In November 2022 the questions that hit every venue were about a SHARED ATTRIBUTE — are you like
              the one that just failed — rather than about anything the venue had done. The answer has to exist
              before the peer fails, because the window in which it is asked is measured in minutes.
            </p>
            <table className="mt-1 w-full border-collapse">
              <caption className="sr-only">Contagion attributes and whether an answer is prepared.</caption>
              <thead>
                <tr>
                  <Th>Attribute</Th>
                  <Th className="w-24">Applies to LCX</Th>
                  <Th className="w-20">Answer</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {readiness.map((r) => (
                  <tr key={r.attribute} data-testid={`mkt-contagion-${r.attribute}`}>
                    <Td>
                      <span className="font-mono text-[10px] text-navy">{r.attribute.replace(/_/g, ' ')}</span>
                      <p className="leading-snug text-grey">{r.sentence}</p>
                    </Td>
                    <Td className="font-mono text-[10px] text-grey">{r.applicability}</Td>
                    <Td>
                      <span className={clsx('font-mono text-[10px] font-bold',
                        r.preclear === 'ready' ? 'text-status-ready'
                          : r.preclear === 'expired' ? 'text-status-conditional' : 'text-status-blocked')}
                      >
                        {r.preclear}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── THE CHOSEN STATEMENT AND ITS LANES ─────────────────────────────── */}
        <div className="space-y-2">
          {!chosen ? (
            <Nothing>
              Nothing is chosen, and nothing is activated by choosing. This room hands over words and a
              checklist; every act after that is a human&apos;s, recorded as theirs.
            </Nothing>
          ) : (
            <>
              <div>
                <SectionLabel as="h3">{chosen.title}</SectionLabel>
                <div className="mt-1 space-y-1 border-l-2 border-line px-2 py-1.5 text-label leading-snug text-navy">
                  <p>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-grey">known · </span>
                    {chosen.standingKnown.join(' ')}
                  </p>
                  <p>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-grey">not known · </span>
                    {chosen.standingNotKnown.join(' ')}
                  </p>
                  <p>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-grey">next update · </span>
                    {chosen.nextStepAction}
                  </p>
                </div>
                {/* The middle slot is the one every instinct deletes, and it is the one
                    with case law attached. The engine holds the evidence; this prints it. */}
                {CRISIS_EVIDENCE.filter((e) => e.key === 'ftx_over_reassurance').map((e) => (
                  <p key={e.key} className="mt-1 text-[10px] leading-snug text-grey">
                    <span className="font-semibold">{e.headline}</span> {e.authority}, {e.locator}.
                  </p>
                ))}
              </div>

              <div className="border-t border-line pt-2">
                <SectionLabel as="h3">What the operator must supply</SectionLabel>
                <ul className="mt-1 space-y-0.5">
                  {chosen.operatorMustSupply.map((m) => (
                    <li key={m} className="text-micro leading-snug text-navy">· {m}</li>
                  ))}
                </ul>
              </div>

              {/* THE BRIEF IS COMPOSED BY THE ENGINE from `mustNotSay`, so a future editor
                  cannot delete a protection by rewording a paragraph. Printed as the
                  engine renders it, in a `pre` that preserves its structure. */}
              <div className="border-t border-line pt-2">
                <SectionLabel as="h3">The brief, as the engine composes it</SectionLabel>
                <pre
                  data-testid="mkt-statement-guidance"
                  className="mt-1 overflow-x-auto whitespace-pre-wrap border-l-2 border-status-blocked/40 px-2 py-1.5 text-[10px] leading-snug text-navy"
                >
                  {renderStatementGuidance(chosen)}
                </pre>
              </div>

              <div className="border-t border-line pt-2">
                <SectionLabel as="h3">Before you use it</SectionLabel>
                <p className="mt-0.5 text-[10px] leading-snug text-grey">
                  Acknowledged by you, never checked by the instrument. Nothing here can verify any of these,
                  and a precondition a system auto-satisfies is a precondition it has deleted.
                </p>
                {chosen.requiresBeforeUse.map((p) => (
                  <label key={String(p)} className="mt-1 flex cursor-pointer items-start gap-1.5 text-micro">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={acked[String(p)] === true}
                      onChange={(e) => setAcked((a) => ({ ...a, [String(p)]: e.target.checked }))}
                    />
                    <span className="leading-snug text-navy">{String(p).replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>

              {/* ── THE LANES ─────────────────────────────────────────────────── */}
              <div className="border-t border-line pt-2">
                <SectionLabel as="h3">Clears, gathered in parallel</SectionLabel>
                <p className="mt-0.5 text-[10px] leading-snug text-grey">
                  Gather them at the same time, in the same room if you can. Anyone else may read it and
                  comment; nobody else may delay it, and there is deliberately no control here that would let
                  them.
                </p>
                <div className="mt-1 grid gap-1.5 sm:grid-cols-3">
                  {clearance.lanes.map((lane) => (
                    <div key={lane.role} className="border-l-2 border-line px-2 py-1.5">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-grey">
                        {lane.role} · {lane.required ? 'blocking' : 'advisory'}
                      </div>
                      <div className="text-micro font-semibold text-navy">{LANE_WHO[lane.role].who}</div>
                      <p className="text-[10px] leading-snug text-grey">{LANE_WHO[lane.role].asks}</p>
                      {/* The lane's own sentence, from the engine. Printed rather than
                          derived from `state`, so the screen cannot disagree with the
                          rule that produced it. */}
                      <p className={clsx('text-[10px] font-semibold leading-snug',
                        lane.state === 'held' ? 'text-status-ready'
                          : lane.state === 'outstanding' ? 'text-status-conditional' : 'text-status-blocked')}
                      >
                        {lane.sentence}
                      </p>
                      {lane.latencyMinutes !== null && (
                        <p className="font-mono text-[10px] text-grey">held after {lane.latencyMinutes} min</p>
                      )}
                      <label className="mt-1 flex cursor-pointer items-center gap-1 text-[10px]">
                        <input
                          type="checkbox"
                          checked={cleared[lane.role] === true}
                          onChange={(e) => setCleared((c) => ({ ...c, [lane.role]: e.target.checked }))}
                        />
                        <span>cleared</span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-1 text-[10px]">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={headline[lane.role] === true}
                          onChange={(e) => setHeadline((h) => ({ ...h, [lane.role]: e.target.checked }))}
                        />
                        <span className="leading-snug">{CLEARANCE_HEADLINE_TEST_QUESTION}</span>
                      </label>
                    </div>
                  ))}
                </div>
                <label className="mt-1 flex cursor-pointer items-start gap-1.5 text-micro">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={legalImplications}
                    onChange={(e) => setLegalImplications(e.target.checked)}
                  />
                  <span>
                    This subject has specific legal implications
                    <span className="block text-[10px] leading-snug text-grey">
                      Only then is legal a blocking lane. CERC is explicit about keeping them out of the
                      clearance process otherwise — not because their view does not matter, but because a
                      standing legal hold is how a desk becomes structurally silent.
                    </span>
                  </span>
                </label>
                {clearance.downgradedToAdvisory.length > 0 && (
                  <p className="mt-1 text-[10px] leading-snug text-status-conditional">
                    Downgraded to advisory: {clearance.downgradedToAdvisory.join(', ')}. A blocking hold
                    supplied by a role that is not in the path is not honoured — that is the mechanism that
                    stops a clearance deadlocking.
                  </p>
                )}
                {/* DOCTRINE RULE 8, from the engine's own mouth: four eyes with two
                    approvers is not four eyes, and the surface admits it. */}
                {clearance.benchAdmission && (
                  <p data-testid="mkt-bench-admission" className="mt-1 border-l-2 border-status-conditional/60 px-2 py-1 text-[10px] font-semibold leading-snug text-status-conditional">
                    {clearance.benchAdmission}
                  </p>
                )}
              </div>

              {clearance.refusals.map((r) => <Refused key={r.code} r={r} />)}

              {outstandingPreconditions.length > 0 && (
                <p className="text-[10px] leading-snug text-status-conditional">
                  {outstandingPreconditions.length} precondition
                  {outstandingPreconditions.length === 1 ? '' : 's'} not acknowledged. Releasing nothing is
                  worse than releasing something incomplete — and this statement is already written to be
                  incomplete honestly — but the preconditions are what stop it being wrong.
                </p>
              )}

              <Absent title="Nothing on this checklist is stored, and no clearance here is bound to a draft.">
                There is no incident record and no clearance route on this environment, so the ticks above live
                in this browser tab and nowhere else. They are also not bound to any text: a real clearance
                binds to the bytes it cleared, and there is no stored draft on this screen to bind to. Write
                down who cleared what and when, by hand — a clearance whose only trace is a checkbox that
                vanished on refresh is not evidence of anything.
              </Absent>
            </>
          )}
        </div>
      </div>

      <NoPostingPath />
    </section>
  );
}
