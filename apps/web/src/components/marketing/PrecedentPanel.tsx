import { useCallback, useEffect, useState } from 'react';
import { SectionLabel } from '@/components/ui';
import { AiProse } from '@/components/ai/AiProse';
import { Absent, Nothing, Refused, apiReadRefusal } from './DeskAtoms';
import { findPrecedent, type PrecedentEntry } from './deskApi';
import type { Refusal } from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PRECEDENT — what did we say about this before, and does it still hold
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The desk's failure mode is not saying something wrong once. It is saying two
 * different things three weeks apart, both defensible on their own, and having no idea
 * it happened. So the prior answers appear BEFORE the operator reads a model's
 * suggestion — after it, they are being asked to agree with something instead of
 * recalling something.
 *
 * WHAT EACH ROW CLAIMS, EXACTLY: this text was approved by this person on this date,
 * citing these claims, of which some may since have changed. It does not claim the
 * prior answer was correct, or that compliance saw it, or that it is still current.
 *
 * TWO REFUSALS:
 *  · Below the retriever's threshold it says there is no precedent and shows nothing.
 *    The tempting failure is to show the best-scoring row anyway; a loosely similar
 *    answer presented as precedent is worse than silence, because the operator will
 *    align to it.
 *  · It reports a POSSIBLE contradiction and never adjudicates one. `possible` is not
 *    hedging — the axes it can check (a different claim id in the same category, a
 *    different polarity, a different named timeframe) are not the axes on which two
 *    statements actually conflict.
 *
 * WHY THIS NEEDS ITS OWN TABLE, in case it is ever proposed as an index on the existing
 * one: `marketing_reply_draft` cascades from `marketing_reply`, and replies are swept on
 * a 90-day retention cycle — so precedent built on that table erases itself every
 * ninety days, which defeats the entire idea. A table holding only LCX's own text, its
 * own claim ids and its own approver carries no third-party personal data and can be
 * retained for the five-to-seven years the record actually requires.
 */

export function PrecedentPanel({ query }: { query: string }) {
  const [rows, setRows] = useState<PrecedentEntry[] | null>(null);
  const [routeAbsent, setRouteAbsent] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const load = useCallback(() => {
    const q = query.trim();
    setRefusal(null);
    if (q === '') { setRows([]); setRouteAbsent(false); return; }
    void findPrecedent(q)
      .then((r) => { setRouteAbsent(r === null); setRows(r); })
      .catch((e: unknown) => {
        setRows(null);
        setRefusal(apiReadRefusal(e,
          'This is no ANSWER, not no precedent. Check by hand what the desk has said about this before writing anything new — the failure mode is saying two different things three weeks apart.'));
      });
  }, [query]);
  useEffect(() => { load(); }, [load]);

  return (
    <section aria-label="Precedent" className="space-y-2">
      <div>
        <SectionLabel as="h3">What we said before</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          Prior answers the desk actually approved, nearest first, with how the retriever matched. Read these
          before writing — the point is to notice a contradiction now rather than to have it noticed for you.
        </p>
      </div>

      {refusal && <Refused r={refusal} />}

      {routeAbsent ? (
        <Absent title="There is no precedent index on this environment.">
          The route is not deployed here, so this screen cannot tell you whether the desk has answered this
          before. It has not searched and found nothing; it has not searched. Anything you write now is written
          without the desk&apos;s memory.
        </Absent>
      ) : rows === null ? (
        !refusal && <p className="text-micro text-grey">Searching…</p>
      ) : query.trim() === '' ? (
        <Nothing>Nothing to search for yet — precedent is looked up against the item you are working on.</Nothing>
      ) : rows.length === 0 ? (
        <Nothing>
          No precedent. Nothing the desk has approved is close enough to this to be worth reading, and the
          nearest non-match is deliberately not shown: a loosely similar prior answer presented as precedent is
          worse than silence, because it is what you would align to.
        </Nothing>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((p) => (
            <li key={p.id} data-testid={`mkt-precedent-${p.id}`} className="border-l-2 border-line px-2 py-1.5">
              <AiProse text={p.body} />
              <p className="mt-1 font-mono text-[10px] leading-snug text-grey">
                approved by {p.approvedBy || 'not stated'} · {p.approvedAt || 'date not stated'} · {p.matchBasis}
              </p>
              {p.claimIds.length > 0 && (
                <p className="font-mono text-[10px] leading-snug text-grey">
                  claims cited · {p.claimIds.join(', ')}
                </p>
              )}
              {p.staleClaimIds.length > 0 && (
                <p className="mt-1 text-[10px] font-semibold leading-snug text-status-conditional">
                  {p.staleClaimIds.length === 1
                    ? `The claim ${p.staleClaimIds[0]} has changed since this was approved.`
                    : `${p.staleClaimIds.length} of the claims this cited have changed since it was approved: ${p.staleClaimIds.join(', ')}.`}
                  {' '}This text was true when it was approved and may not be true now — that is a reason to
                  re-check it, not a reason to repeat it.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
