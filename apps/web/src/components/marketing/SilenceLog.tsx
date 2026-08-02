import { useCallback, useEffect, useState } from 'react';
import { SectionLabel } from '@/components/ui';
import { Absent, Nothing, ObservationFrameNote, Refused, Th, Td, apiReadRefusal } from './DeskAtoms';
import { listSilences, type SilenceEntry } from './deskApi';
import { ownRecordsFrame, type Refusal } from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE SILENCE LOG — the half of the desk's judgement nothing else records
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A desk that only shows what it said is hiding half of what it decided. Today the
 * three completely different judgements "not about us", "deliberately not engaging"
 * and "this is a scam account" all end up as `status = 'ignored'`, which means the
 * question that actually gets asked six months later — *why didn't we say anything?* —
 * has no answer at all.
 *
 * `would_amplify` is the reason this panel earns its place. Staying quiet because a
 * reply would hand a manipulator an audience is a correct decision, and it is
 * indistinguishable from an oversight unless somebody wrote it down: "just by showing
 * up for work and doing their jobs as assigned", journalists covering the far-right
 * fringe added "rocket fuel to an already-smoldering fire" (Whitney Phillips, *The
 * Oxygen of Amplification*, Data & Society, 2018).
 *
 * TWO REFUSALS THIS PANEL KEEPS:
 *  · It never auto-closes a silence. One past its revisit date stays open and visible;
 *    a system that quietly retires them has recreated the problem it was built for.
 *  · It never claims a silence worked. There is no counterfactual, and there never will
 *    be one.
 */

/** A revisit date in the past is a live obligation, not history. */
export function overdue(entry: SilenceEntry, now: number): boolean {
  if (!entry.revisitBy) return false;
  const t = Date.parse(entry.revisitBy);
  return !Number.isNaN(t) && t < now;
}

export function SilenceLog({ now }: { now: number }) {
  const [rows, setRows] = useState<SilenceEntry[] | null>(null);
  const [routeAbsent, setRouteAbsent] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const load = useCallback(() => {
    setRefusal(null);
    void listSilences()
      .then((r) => { setRouteAbsent(r === null); setRows(r); })
      .catch((e: unknown) => {
        setRows(null);
        setRefusal(apiReadRefusal(e,
          'A failed read is not an absence of decisions. Nothing below is the record, and a blank panel here must not be read as a desk that answered everything.'));
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section aria-label="Silence log" className="space-y-2">
      <div>
        <SectionLabel as="h3">Every decision not to answer</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          Each row is a named human&apos;s reason for saying nothing, with the date they decided and the date
          they undertook to look again. This panel makes no claim that any of these decisions was right —
          there is no counterfactual for a silence.
        </p>
      </div>

      {refusal && <Refused r={refusal} />}

      {routeAbsent ? (
        <Absent title="There is no silence log on this environment.">
          The route that would hold these decisions is not deployed here, so this is not an empty log — it is
          no log. Every decision not to answer taken on this environment is recorded nowhere, and the queue&apos;s
          <span className="font-mono"> ignored </span> status cannot tell &ldquo;not about us&rdquo; from
          &ldquo;a reply would amplify this&rdquo;.
        </Absent>
      ) : rows === null ? (
        !refusal && <p className="text-micro text-grey">Reading the silence log…</p>
      ) : rows.length === 0 ? (
        <Nothing>
          No decision not to answer has been recorded. On a desk that is answering everything that is a
          finding, not a clean sheet: most inbound items should terminate in a recorded silence, and an empty
          log usually means the decisions are being taken and not written down.
        </Nothing>
      ) : (
        <table className="w-full border-collapse">
          <caption className="sr-only">Recorded decisions not to respond.</caption>
          <thead>
            <tr>
              <Th>Subject</Th>
              <Th className="w-32">Disposition / reason</Th>
              <Th>Rationale</Th>
              <Th className="w-36">Decided by / when</Th>
              <Th className="w-28">Revisit</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((s) => (
              <tr key={s.id} data-testid={`mkt-silence-${s.id}`}>
                <Td className="font-mono text-[10px] text-navy">{s.subject || '—'}</Td>
                <Td>
                  <span className="font-mono text-[10px] text-navy">{s.disposition}</span>
                  <span className="block font-mono text-[10px] text-grey">{s.reasonCode}</span>
                </Td>
                <Td className="text-grey">
                  {/* A rationale is REQUIRED by the record. A row without one is a
                      defect in the row, and it is named as such rather than shown as
                      a blank cell an eye slides over. */}
                  {s.rationale ? s.rationale : (
                    <span className="font-semibold text-status-blocked">
                      no rationale was recorded — this row does not answer why, which is the only question it
                      exists to answer
                    </span>
                  )}
                </Td>
                <Td className="text-grey">
                  <span className="block font-mono text-[10px] text-navy">{s.decidedBy || 'not stated'}</span>
                  <span className="block font-mono text-[10px]">{s.decidedAt || '—'}</span>
                </Td>
                <Td>
                  {!s.revisitBy ? (
                    <span className="text-[10px] leading-snug text-grey">none set — this silence is permanent unless somebody reopens it</span>
                  ) : overdue(s, now) ? (
                    <span className="text-[10px] font-semibold leading-snug text-status-conditional">
                      OVERDUE since {s.revisitBy.slice(0, 10)} — still open. Nothing closes it automatically.
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-grey">{s.revisitBy.slice(0, 10)}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ObservationFrameNote frame={ownRecordsFrame(new Date(now - 90 * 86_400_000).toISOString(), new Date(now).toISOString(), { truncatedByRetention: true })} />
    </section>
  );
}
