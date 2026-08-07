import { Fragment, useMemo, useState } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { SectionLabel } from '@/components/ui';
import { AiProse } from '@/components/ai/AiProse';
import type { MarketingReply, MarketingSummary } from '@/lib/api/marketing';
import { LowerBoundTile, Nothing, Th, Td } from './DeskAtoms';
import { PostTimeMark } from './PostTimePanel';
import { TriageAssessment } from './TriageAssessment';
import {
  ATTRIBUTION_MIN_CONCURRING,
  MARKETING_INBOUND_RETENTION_DAYS as RETENTION_DAYS,
  PRIORITY_MEANING,
  REACH_RANK,
  notificationCensusFrame,
  type PriorityTier,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE TRIAGE BOARD — RESIST 2 made operable
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Today's `status` (`new | triaged | drafted | answered | ignored`) is a WORKFLOW, not
 * a decision, and `ignored` collapses three unrelated judgements — "not about us",
 * "deliberately not engaging", "this is a scam account" — into one word that destroys
 * the record. This board is the decision, and it is organised the way the UK
 * Government Communication Service's RESIST 2 toolkit organises one, because that
 * toolkit exists precisely to replace gut feeling with a shared vocabulary.
 *
 * THREE THINGS THE LAYOUT ARGUES FOR, and they are arguments, not decoration:
 *
 *  1. THE OPINION GATE COMES FIRST and it empties the queue. "If the message is simply
 *     a statement of opinion, you should not treat it as disinformation." A desk that
 *     starts with a Draft button has already decided to answer.
 *  2. LOW PRIORITY IS A DECISION, NOT NEGLECT. RESIST's own worked example ends
 *     "Insight and press lines are prepared, but no response is made for the time
 *     being." So the LOW column is rendered at the same weight as HIGH, with its
 *     meaning printed in full — never greyed, never collapsed, never sorted to the
 *     bottom of a list of things nobody got round to.
 *  3. THE CLOCK REFUSES RATHER THAN FLATTERS. `posted_at` is nullable and is written
 *     from the notification email's Date header, so a latency computed from
 *     `received_at` measures mail-forwarding delay and is better than reality by an
 *     unknown margin — on the exact number the desk would be judged by. Rows with no
 *     true post time are counted in a SEPARATE population and never averaged in.
 */

/* ── The clock ──────────────────────────────────────────────────────────────── */

export interface SuppressibleWait {
  readonly hours: number | null;
  readonly suppressedBecause: 'posted_at_unknown' | null;
  readonly observedFrom: 'posted_at' | 'received_at';
}

/**
 * How long this item has been waiting, or a refusal to say.
 *
 * `posted_at` is the only clock that answers the question an operator thinks they are
 * asking ("how long since they said it"). Where it is absent this returns `null` with
 * the reason, and the board prints the coverage fraction beside every aggregate. It
 * never silently falls back to `received_at`.
 */
export function waitOn(reply: MarketingReply, now: number): SuppressibleWait {
  if (!reply.posted_at) {
    return { hours: null, suppressedBecause: 'posted_at_unknown', observedFrom: 'received_at' };
  }
  const t = Date.parse(reply.posted_at);
  if (Number.isNaN(t)) {
    return { hours: null, suppressedBecause: 'posted_at_unknown', observedFrom: 'received_at' };
  }
  return { hours: (now - t) / 3_600_000, suppressedBecause: null, observedFrom: 'posted_at' };
}

const TIERS: readonly PriorityTier[] = ['high', 'medium', 'low'];

/**
 * Which tier an UNASSESSED item sits in: none of them.
 *
 * A board that guesses a tier from the text is the thing RESIST warns against ("do not
 * take on the role of arbiter"), and a board that defaults everything to `medium`
 * teaches the operator to ignore the field. So an item with no recorded assessment
 * sits in its own column and the column says what it is.
 */
export function TriageBoard({ queue, now, onChanged, summary = null }: {
  queue: readonly MarketingReply[];
  now: number;
  onChanged: () => void;
  /**
   * The population figures. Optional so the board still renders with the summary read
   * failing, and when it is absent the coverage sentence REFUSES rather than quietly
   * measuring over the page — which is what it used to do unconditionally.
   */
  summary?: MarketingSummary | null;
}) {
  const [open, setOpen] = useState<number | null>(null);

  /*
   * THE FIGURE IS OVER THE PAGE; THE COVERAGE SENTENCE MUST NOT PRETEND OTHERWISE.
   *
   * `queue` is capped (50 by default, 200 at most), so "Measured over 50 of 50 open items …
   * Every open item carries one" was printed for a desk where 70 of 120 open replies had no
   * post date. The DENOMINATOR is now the population figure from the summary, and the
   * sentence says which of the two each number is. (The FIGURE was fixed separately, and
   * is no longer always computed from the loaded rows — see immediately below.)
   */
  /*
   * ══ AND THE FIGURE WAS STILL A LOWER BOUND WORN AS A MAXIMUM ══
   *
   * Fixing the SENTENCE left the NUMBER lying. `Math.max` over the loaded page was
   * rendered bare as "Longest wait since it was posted — 30h", with no `≥` and no frame,
   * while `summary.oldestSincePostedHours` — computed in SQL over the whole open
   * population, and REFUSING with `MKT_CLOCK_POST_TIME_UNKNOWN` unless every open row has
   * a post date — was transported in the same response and read by no component in the
   * app. 120 open rows, a page of 50, the true oldest on page 3: the tile stated a number
   * lower than reality, as a measurement.
   *
   * So the server's field decides which of three things the figure IS, and the figure says
   * which one on its face:
   *   · a number   → the API computed it over every open row. EXACT.
   *   · a refusal  → the page maximum is a floor and is prefixed `≥`, with the API's own
   *                  sentence beneath it. Never substituted for the exact figure.
   *   · null       → no open rows. Nothing to time.
   * A `summary` that never arrived is the same floor, with the share unknown.
   */
  const clock = useMemo(() => {
    const withTrue = queue
      .map((r) => waitOn(r, now).hours)
      .filter((h): h is number => h !== null);
    const pageMax = withTrue.length > 0 ? Math.max(...withTrue) : null;
    const population = summary?.postTimeCoverage ?? null;
    const server = summary === null ? undefined : summary.oldestSincePostedHours;
    const exact = typeof server === 'number' ? server : null;
    const refused = server !== null && server !== undefined && typeof server === 'object' ? server : null;
    return {
      covered: withTrue.length,
      loaded: queue.length,
      population,
      /** Set only when the API measured it over the whole open population. */
      exactHours: exact,
      /** A floor from the loaded page. Rendered with `≥`, and only when `exactHours` is null. */
      atLeastHours: exact === null ? pageMax : null,
      /** The API's refusal, shown verbatim rather than paraphrased. */
      refusal: refused,
      /** `null` from the API means there are no open rows at all. */
      noOpenRows: server === null,
    };
  }, [queue, now, summary]);

  /*
   * TWO SENTENCES, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS, and collapsing them is how
   * one of them gets lost. The first says what KIND of number is above it — the figure
   * itself, or a floor. The second says what POPULATION it was drawn from. An earlier pass
   * of this fix made the refusal replace the coverage prose, which silently deleted the
   * denominator disclosure that four tests in `deskHonesty.test.tsx` exist to hold.
   */
  const clockStatusSentence =
    clock.refusal !== null
      ? `${clock.refusal.message} The figure above is the longest wait among the ${String(clock.covered)} of `
        + `${String(clock.loaded)} loaded rows that do carry a post date, so it is a FLOOR and is shown with ≥: `
        + `the true longest wait cannot be lower than it, and may be higher. Needs: ${clock.refusal.needs}`
      : clock.exactHours !== null
        ? `Computed by the API over all ${String(clock.population?.openRows ?? clock.loaded)} open replies, every `
          + 'one of which carries a post date, so this is the longest wait itself rather than the longest one '
          + 'visible from this page.'
        : 'This environment reported no post-time clock over the open population, so the figure above is a FLOOR '
          + 'over the loaded page and is shown with ≥.';

  /* The denominator, unchanged in wording and in the three cases it distinguishes. */
  const clockCoverageSentence =
    clock.population === null
      ? `Measured over ${clock.covered} of the ${clock.loaded} items loaded on this page. `
        + 'How many open items exist in total is not being reported by this environment, so what '
        + 'share of the desk this covers is unknown — and it is not assumed to be all of it.'
      : `Measured over ${clock.covered} of the ${clock.loaded} items loaded here, out of `
        + `${clock.population.openRows} open in total, of which ${clock.population.withPostTime} carry a true post time. `
        + (clock.population.withPostTime < clock.population.openRows
          ? `The other ${clock.population.openRows - clock.population.withPostTime} are excluded rather than timed from when the email arrived, which would measure mail delay and read better than reality.`
          : 'Every open item carries one.');

  return (
    <section aria-label="Triage board" className="space-y-3">
      {/* ── THE CLOCK, WITH ITS COVERAGE. Two populations, stated separately. */}
      <div className="grid gap-1.5 sm:grid-cols-3">
        <div className="border-l-2 border-line px-2 py-1.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-grey">
            Longest wait since it was posted
          </div>
          <div
            className={clsx('mt-0.5 text-[20px] font-bold tabular-nums',
              clock.exactHours === null && clock.atLeastHours === null
                ? 'text-grey'
                : (clock.exactHours ?? clock.atLeastHours ?? 0) > 2 ? 'text-status-conditional' : 'text-navy')}
            data-testid="mkt-clock-figure"
          >
            {clock.exactHours !== null
              ? `${String(Math.round(clock.exactHours))}h`
              : clock.atLeastHours !== null
                ? `≥ ${String(Math.round(clock.atLeastHours))}h`
                : 'not measurable'}
          </div>
          <p className="text-[10px] leading-snug text-grey" data-testid="mkt-clock-coverage">
            {clock.noOpenRows || clock.loaded === 0
              ? 'No open items, so there is nothing to time.'
              : `${clockStatusSentence} ${clockCoverageSentence}`}
          </p>
        </div>
        <LowerBoundTile
          label="Items in the queue (observed)"
          value={queue.length}
          /* The retention boundary, not an arbitrary seven days. The queue query has no
             time bound, so an item received 40 days ago and still open is inside this
             count — framing it as a weekly window made a standing backlog read as a
             burst of new work, and `checkFrame` only verifies the window runs forwards. */
          frame={notificationCensusFrame(
            new Date(now - RETENTION_DAYS * 86_400_000).toISOString(), new Date(now).toISOString(), null,
          )}
        />
        <div className="border-l-2 border-line px-2 py-1.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-grey">Attribution</div>
          <div className="mt-0.5 text-micro font-semibold leading-snug text-status-blocked">
            unavailable by design
          </div>
          <p className="text-[10px] leading-snug text-grey">
            RESIST 2: &ldquo;there needs to be collective agreement before any attribution is made.&rdquo;
            At least {ATTRIBUTION_MIN_CONCURRING} named humans have to concur, and this workspace signs in with one shared desk passcode —
            so no row here can name who is behind anything. The instrument says so rather than letting one
            operator label an account a coordinated adversary.
          </p>
        </div>
      </div>

      {/* ── THE THREE TIERS. Low is not a lesser column. */}
      <div className="grid gap-2 lg:grid-cols-3">
        {TIERS.map((tier) => (
          <div key={tier} className="border border-line bg-card p-2">
            <SectionLabel as="h3" className={tier === 'low' ? 'text-navy' : undefined}>
              {tier === 'low' ? 'LOW — a decision, not neglect' : `${tier} priority`}
            </SectionLabel>
            <p className="mt-1 text-[10px] leading-snug text-grey">{PRIORITY_MEANING[tier]}</p>
            <p className="mt-1 border-l-2 border-line px-1.5 py-1 text-[10px] leading-snug text-grey">
              {tier === 'low'
                ? 'Work happens in this tier: the line is written and cleared, and then not used. That prepared, unused line is the artefact of triage and it is what makes the next crisis survivable.'
                : tier === 'medium'
                  ? 'It requires a response. Not a fast one — a recorded one.'
                  : 'Immediate attention and escalation. Much of the evidence is high confidence.'}
            </p>
            <p className="mt-1 font-mono text-[10px] text-grey">
              {/* No count. A tier count needs recorded assessments, and there is no
                  read that returns them yet — a 0 here would be a claim that nothing
                  is high priority. */}
              tier counts need recorded assessments; no read returns them on this environment
            </p>
          </div>
        ))}
      </div>

      {/* ── THE ITEMS ─────────────────────────────────────────────────────────── */}
      {queue.length === 0 ? (
        <Nothing>
          No open item is in the queue. That is a statement about this mailbox and this table, not about
          what is being said: posts that do not mention the account, posts X did not email us about, and
          anything on another platform are all invisible here and always will be.
        </Nothing>
      ) : (
        <table className="w-full border-collapse">
          <caption className="sr-only">Open inbound items awaiting a triage decision.</caption>
          <thead>
            <tr>
              <Th>Author / what they said</Th>
              <Th className="w-24">Provenance</Th>
              <Th className="w-32">Waiting</Th>
              <Th className="w-28">Recorded state</Th>
              <Th className="w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {queue.map((r) => {
              const wait = waitOn(r, now);
              return (
                <Fragment key={r.id}>
                  <tr data-testid={`mkt-triage-row-${r.id}`}>
                    <Td>
                      <span className="font-mono text-[10px] font-semibold text-navy">@{r.author_handle}</span>
                      {r.parse_failed && (
                        <span className="ml-1.5 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-status-conditional">
                          <ShieldAlert size={9} /> unreadable — a human must look
                        </span>
                      )}
                      {/* Untrusted third-party text. AiProse emits React nodes and
                          never HTML, so hostile markup is inert by construction. */}
                      <div className="mt-1 border-l-2 border-line px-1.5 py-1">
                        <AiProse text={r.body} validIds={[]} />
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-[10px] text-navy">{r.source_grade}</span>
                      <p className="text-[10px] leading-snug text-grey">
                        {/* The grade is NOT a trust score. The mailbox has no sender
                            check, so a fabricated reply arrives graded the same as a
                            real one until an independent channel corroborates it. */}
                        Admiralty grade as recorded. It is not corroboration on its own.
                      </p>
                      {/* AND THIS IS WHERE THE ROW STOPS LOOKING THE SAME. The sentence
                          above used to end "nothing on this row proves the email came from
                          X", which was true of every row and therefore invisible: an
                          identical caveat under every grade is read once and then never
                          again. `PostTimeMark` renders three visually different states, so a
                          row X's own oEmbed endpoint has confirmed does not look like a row
                          that arrived only through an unauthenticated mailbox — which is the
                          anti-forgery signal for defect 1, on the surface where an operator
                          decides whether to answer. */}
                      <PostTimeMark reply={r} />
                    </Td>
                    <Td>
                      {wait.hours === null ? (
                        <span className="text-[10px] leading-snug text-grey">
                          <span className="block font-semibold text-status-conditional">not measurable</span>
                          No true post time on this row, so the wait is unknown. It is not zero and it is not
                          the time since the email arrived.
                        </span>
                      ) : (
                        <span className="font-mono tabular-nums text-navy">
                          <Clock size={9} className="mr-1 inline align-baseline" />
                          {Math.round(wait.hours)}h
                          <span className="block text-[10px] font-normal text-grey">from the post time</span>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="font-mono text-[10px] text-grey">{r.status}</span>
                      <p className="text-[10px] leading-snug text-grey">
                        a workflow position, not a decision — the decision is below
                      </p>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        className="rounded border border-line px-2 py-1 text-micro font-semibold text-navy hover:bg-ice-soft focus-ring dark:hover:bg-ice-soft/10"
                        aria-expanded={open === r.id}
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                      >
                        {open === r.id ? 'Close' : 'Assess'}
                      </button>
                    </Td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={5} className="px-2 pb-3">
                        <TriageAssessment reply={r} onRecorded={onChanged} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * The escalation note. Exported because the measurement panel prints the same sentence
 * and the wording must not drift between the two.
 *
 * RESIST asks for an ESTIMATE of reach, and the trigger is movement between levels
 * rather than the level itself — so a first estimate has nothing to compare against and
 * must say so instead of implying stability.
 */
export function reachTrajectory(current: string | null, previous: string | null): string {
  if (!current) return 'No reach estimate has been recorded, so there is nothing to compare.';
  if (!previous) {
    return 'First estimate for this item. Escalation between levels is the real trigger, and one reading cannot show movement.';
  }
  const a = REACH_RANK[previous as keyof typeof REACH_RANK];
  const b = REACH_RANK[current as keyof typeof REACH_RANK];
  if (a === undefined || b === undefined) return 'A recorded level is not one this ladder knows.';
  if (b > a) return `Escalating: ${previous} → ${current}. That movement is the trigger, not the level.`;
  if (b < a) return `Receding: ${previous} → ${current}.`;
  return `Unchanged at ${current} since the previous estimate.`;
}
