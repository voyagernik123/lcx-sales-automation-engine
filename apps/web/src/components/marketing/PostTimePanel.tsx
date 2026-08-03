import type { ReactNode } from 'react';
import { CalendarClock, ShieldCheck } from 'lucide-react';
import { CardSkeleton } from '@/components/shared';
import { fetchCorroborationCoverage } from '@/lib/api/marketing';
import type { MarketingReply } from '@/lib/api/marketing';
import {
  Absent, NotPermitted, ObservationFrameNote, Refused, WireRefusals, apiReadRefusal,
} from './DeskAtoms';
import { str } from './narrow';
import { useDeskRead } from './useDeskRead';
import type { PostTimeCoverageCounts, PostTimeCoverageReport } from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  POST-TIME COVERAGE — the fraction that is also the anti-forgery rate
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GET /v1/marketing/post-time` had NO BROWSER CALLER. Its own docblock said so and
 * explained the choice: a fetcher with no component is decoration. The engine behind it
 * (`apps/api/src/marketing/postTime.ts`) had had no caller either until the sweep was
 * scheduled on `POST /tick`, so the number was 0 on every live environment by construction
 * while nothing at all reported that fact. This panel is the first reader.
 *
 * ── WHY THIS FRACTION IS NOT A COVERAGE STATISTIC ─────────────────────────────
 * Two clocks run over an inbound reply and only one of them is the customer's:
 *
 *   `received_at`           when the DESK learned of it. Always known, and always flatters —
 *                           it measures mail-forwarding latency, which is defect 5.
 *   `posted_on_displayed`   the DATE X itself printed on the embed. Known only where the
 *                           public oEmbed endpoint answered.
 *
 * Every surface that needs the second refuses rather than substituting the first, so this
 * fraction is the exact size of the honest-refusal surface: at 0, every "how long have they
 * waited" question in the compartment refuses forever, and the desk has no SLA at all.
 *
 * AND IT IS SIMULTANEOUSLY THE ANTI-FORGERY RATE. `fetchNotificationEmails` searches
 * `{seen:false}` with no sender filter and `RawEmail` carries no `from` field
 * (`xMail.ts:81`), so anybody who learns the polled address can inject a fabricated reply
 * that arrives graded `C3` — "fairly reliable" — identically to a real one. oEmbed is an
 * INDEPENDENT channel: a row it confirms exists on X, and a row it has not confirmed rests
 * on the mailbox alone. That is why `PostTimeMark` below is a visual distinction on every
 * row and not a footnote on this panel.
 *
 * ── A FRACTION, NEVER A PERCENTAGE, AND THE TEST ENFORCES IT ──────────────────
 * `numerator` and `denominator` are rendered separately and no ratio is computed anywhere
 * in this file. 3 of 4 and 750 of 1 000 are both "75%" and a desk must not act on them
 * alike. `postTime.test.tsx` fails if a `%` sign appears in the measured branch.
 *
 * ── THE THREE POPULATIONS, WHICH IS THE WHOLE POINT OF `lookupEligible` ───────
 * "Unconfirmed" is two completely different facts and the report carries enough to separate
 * them:
 *
 *   confirmed            `numerator` — X's own endpoint answered for this row.
 *   not tried            `lookupEligible - numerator` while `evidenceTablePresent` is
 *                        false: the sweep REFUSES before performing a single lookup,
 *                        because it has nowhere to record what it observed. Nobody has
 *                        looked, and the fraction is frozen rather than low.
 *   tried, not confirmed the same subtraction once the evidence table exists: the sweep can
 *                        run, so a row still without a date is one oEmbed did not answer
 *                        for — deleted, protected, or never real.
 *   never fillable       `notLookupEligible` — `arc`-authenticated mail and operator pastes
 *                        cannot have their ladder inputs rebuilt from the columns the store
 *                        keeps, so this path can never fill their post date. Without this
 *                        number a reader watching coverage stall cannot tell a broken
 *                        channel from a schema limit.
 *
 * Nothing here recomputes the desk's own figure. `GET /summary` carries `postTimeCoverage`
 * over OPEN rows and `TriageBoard` renders it; this is over EVERY non-quarantined row still
 * held. Two populations, two numbers, and they will differ — which is why `ofWhat` travels
 * with this one and is printed verbatim.
 */

/* ════════ THE PER-ROW SIGNAL ════════ */

/**
 * WHETHER THIS ONE ROW HAS BEEN CONFIRMED BY A CHANNEL THAT IS NOT THE MAILBOX.
 *
 * Three states, three tones, and the middle one is the one that must not be quiet:
 *
 *   confirmed      `posted_at` is set and `posted_at_source` names the channel. Ready tone,
 *                  a shield, and the DATE — never a time of day, because X prints no time
 *                  on an embed and inventing one would be a fabricated observation.
 *   unconfirmed    `posted_at` is null. Blocked tone: this row's existence rests entirely
 *                  on an email nothing authenticated, or on a paste. It is NOT "posted at
 *                  an unknown time" — it is "nothing independent says this post exists".
 *   set, unsourced `posted_at` is present and `posted_at_source` is null. A defect in the
 *                  row rather than in the channel, and named as one: a date with no stated
 *                  provenance is the shape defect 5 had, where the email `Date:` header was
 *                  written into the column and read as X's timestamp.
 *
 * IT NEVER PRINTS A DURATION. The wait belongs to `TriageBoard.waitOn`, which refuses when
 * the post time is unknown; a second clock here would be a second chance to substitute
 * `received_at`.
 */
export function PostTimeMark({ reply }: { reply: MarketingReply }) {
  /*
   * NARROWED WITH `str`, NOT COMPARED WITH `!== null`, AND THIS IS NOT PEDANTRY.
   *
   * The first version wrote `reply.posted_at !== null`, and `undefined` passes that test —
   * so a row whose payload simply omitted the column rendered as CORROBORATED BY AN
   * INDEPENDENT CHANNEL, which is the single most dangerous wrong answer this component can
   * give. It was caught immediately, by an existing test whose fixture happened to be a
   * partial row, and that is the whole argument for `narrow.ts`: the compiler says
   * `string | null` and a payload says whatever it says.
   *
   * `str` also rejects the empty string, because `posted_at_source: ''` would otherwise name
   * a channel with no name.
   */
  const source = str(reply.posted_at_source);
  const displayed = str(reply.posted_on_displayed);

  if (str(reply.posted_at) === null) {
    return (
      <p
        data-testid={`mkt-posttime-unconfirmed-${reply.id}`}
        className="mt-1 flex items-start gap-1 border-l-2 border-status-blocked/50 bg-status-blocked-bg px-1.5 py-1 text-[10px] font-semibold leading-snug text-status-blocked"
      >
        <CalendarClock size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Post time unconfirmed — no independent channel has said this post exists. The grade beside it was
          assigned to the email, and the mailbox has no sender check, so a fabricated row looks exactly like
          this one. Corroborate it before quoting anything on it.
        </span>
      </p>
    );
  }

  if (source === null) {
    return (
      <p
        data-testid={`mkt-posttime-unsourced-${reply.id}`}
        className="mt-1 flex items-start gap-1 border-l-2 border-status-conditional/60 bg-status-conditional-bg px-1.5 py-1 text-[10px] font-semibold leading-snug text-status-conditional"
      >
        <CalendarClock size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          This row carries a post date and does not say which channel supplied it. Read it as unconfirmed: a
          date with no stated provenance is the shape the old defect had, where the email header was written
          into this column and then read as X&apos;s own timestamp.
        </span>
      </p>
    );
  }

  return (
    <p
      data-testid={`mkt-posttime-confirmed-${reply.id}`}
      className="mt-1 flex items-start gap-1 border-l-2 border-status-ready/40 bg-status-ready-bg px-1.5 py-1 text-[10px] leading-snug text-status-ready"
    >
      <ShieldCheck size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">
          Corroborated by <span className="font-mono">{source}</span>
        </span>{' '}
        — a channel independent of the mailbox, so this post is known to exist.
        {displayed !== null && (
          <span className="block font-mono">
            posted on {displayed.slice(0, 10)} — the date X printed. There is no time of day on an embed and
            none is shown.
          </span>
        )}
      </span>
    </p>
  );
}

/* ════════ THE FRACTION ════════ */

/**
 * One population, as a count and a sentence. No bar, no ratio, no percentage.
 *
 * A share is deliberately unavailable to the eye here. The three populations do not sum to
 * a meaningful whole for a reader to eyeball — `numerator` is a subset of `lookupEligible`,
 * which is a complement of `notLookupEligible` — and a stacked bar would invite exactly the
 * arithmetic the contract removed the `percent` field to prevent.
 */
function Population({ label, n, meaning, tone }: {
  label: string; n: number; meaning: string; tone: 'good' | 'bad' | 'plain';
}) {
  const cls = tone === 'good' ? 'text-status-ready' : tone === 'bad' ? 'text-status-blocked' : 'text-navy';
  return (
    <div className="border-l-2 border-line px-2 py-1.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-grey">{label}</div>
      <div className={`mt-0.5 text-[20px] font-bold tabular-nums ${cls}`}>{n}</div>
      <p className="text-[10px] leading-snug text-grey">{meaning}</p>
    </div>
  );
}

/**
 * The measured figure and its frame.
 *
 * `sweepHasRun` is what turns one subtraction into two different sentences, and it is read
 * off `evidenceTablePresent` rather than guessed: the sweep refuses before performing a
 * single lookup when it has nowhere to write its evidence, so on an environment without
 * 0062 the unconfirmed rows are ones NOBODY LOOKED AT. Reporting them as "oEmbed could not
 * confirm" would blame a channel that was never called.
 */
function Measured({ c, frameOwner, sweepHasRun }: {
  c: PostTimeCoverageCounts;
  frameOwner: ReactNode;
  sweepHasRun: boolean;
}) {
  const pendingEligible = c.lookupEligible - c.numerator;
  return (
    <div className="space-y-2" data-testid="mkt-posttime-measured">
      {/* THE FRACTION, AS TWO NUMBERS. Read as a sentence rather than shown as a ratio. */}
      <p className="text-micro leading-snug text-navy">
        <span className="font-mono text-[20px] font-bold tabular-nums">{c.numerator}</span>
        <span className="mx-1 font-mono text-grey">of</span>
        <span className="font-mono text-[20px] font-bold tabular-nums">{c.denominator}</span>
        <span className="ml-1.5 text-grey">{c.ofWhat}</span>
      </p>
      {/* The engine's own sentence about its own figure, verbatim. It knows what it counted
          and this screen does not, so it is printed rather than paraphrased. */}
      <p className="text-[10px] leading-snug text-grey">{c.statement}</p>

      <div className="grid gap-1.5 sm:grid-cols-3">
        <Population
          label="confirmed by oEmbed"
          n={c.numerator}
          tone="good"
          meaning="X's own public endpoint answered for these rows, so each one is known to exist independently of the mailbox that delivered it."
        />
        <Population
          label={sweepHasRun ? 'tried, not confirmed' : 'nobody has looked'}
          n={pendingEligible}
          tone="bad"
          meaning={sweepHasRun
            ? 'The sweep can run here and these rows still carry no date, so oEmbed did not answer for them — deleted, protected, or never real. Treat each as uncorroborated.'
            : 'These rows are eligible for a lookup and no lookup has been attempted: the sweep refuses before the first request because it has nowhere to record what it observed. The fraction is frozen, not low.'}
        />
        <Population
          label="never fillable this way"
          n={c.notLookupEligible}
          tone="plain"
          meaning="ARC-authenticated mail and operator pastes cannot have their ladder inputs rebuilt from the columns the store keeps, so no lookup is attempted and this path can never confirm them. A plateau here is a schema limit, not a broken channel."
        />
      </div>
      {frameOwner}
    </div>
  );
}

/**
 * THE PANEL. Five read states, then three payload states, and every one of them says what
 * must not be concluded from it.
 */
export function PostTimePanel() {
  const read = useDeskRead<PostTimeCoverageReport>(
    'marketing:post-time', () => fetchCorroborationCoverage(),
  );

  return (
    <section aria-label="Post-time coverage" className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy">
        <CalendarClock size={12} aria-hidden="true" /> Post-time coverage, and what it corroborates
      </h3>
      <p className="text-[10px] leading-snug text-grey">
        How many held replies carry the date X itself published, rather than the date our mailbox received a
        forward. It is the size of the desk&apos;s honest-refusal surface and, because the channel is
        independent of the mailbox, the only corroboration rate this compartment has.
      </p>

      {read.result.state === 'loading' && <CardSkeleton />}

      {read.result.state === 'absent' && (
        <Absent title="The coverage read is not on this environment, so the fraction is unknown.">
          <span className="font-mono">GET /v1/marketing/post-time</span> answered 404. Do not read this as zero
          coverage: nothing measured. Every clock in this compartment still refuses where a post time is
          missing, so the desk is behaving correctly and cannot report how often it is doing so.
        </Absent>
      )}

      {read.result.state === 'forbidden' && (
        <NotPermitted what="Reading post-time coverage" sentence={read.result.sentence} />
      )}

      {read.result.state === 'failed' && (
        <Refused r={apiReadRefusal(new Error(read.result.sentence),
          'A failed read is not a corroboration rate of zero, and it is not a full one. Nothing below distinguishes "no row is corroborated" from "we could not count", so neither may be relied on when deciding whether to quote an inbound item.')} />
      )}

      {read.result.state === 'ok' && (() => {
        const d = read.result.value;
        return (
          <div className="space-y-2">
            {/* WHY THE NUMBER IS WHAT IT IS, BEFORE THE NUMBER. Two migration facts, kept
                apart deliberately by the route: 0046 absent means there is no queue to
                measure at all; 0062 absent means the corpus is measurable and the sweep
                cannot write its evidence, so the fraction is real and frozen. */}
            <WireRefusals list={d.refusals} />

            {d.coverage === null ? (
              <Absent title="There is no corpus to measure on this environment.">
                Migration 0046 has not been applied, so the reply table does not exist. This is an absent
                population and not zero coverage — there are no rows to be uncorroborated.
              </Absent>
            ) : d.coverage.kind === 'absent' ? (
              /* `Figure` has no third variant on purpose: an empty corpus arrives as a
                 refusal rather than as `0 of 0`, which on a panel is indistinguishable
                 from full coverage. */
              <Refused r={d.coverage.refusal} />
            ) : (
              <Measured
                c={d.coverage.value}
                sweepHasRun={d.evidenceTablePresent}
                frameOwner={<ObservationFrameNote frame={d.coverage.frame} />}
              />
            )}

            {/* WHAT RAISES IT, NAMED. A reader who sees a low number needs the route to run,
                not a bug report against this panel. And this read runs nothing: a GET that
                quietly performed outbound HTTP would make refreshing a screen a rate-limit
                event against X, and the breaker's state would then depend on who happened
                to be looking at it.

                `readPerformsNoLookup` IS NOT RENDERED, and the omission is deliberate rather
                than an oversight. The contract types it as literal `false` while its docblock
                says it means the read performs no lookup — the name and the value assert
                opposite things, so a screen that printed it would be repeating whichever one
                the reader guessed. The claim below rests on the route's code, which imports
                `measurePostTimeCoverage` (SQL only) and no fetcher at all. Fixing the field
                is the API lane's; misreporting it is not available to this one. */}
            <p className="border-l-2 border-line px-2 py-1.5 text-[10px] leading-snug text-grey">
              <span className="font-semibold">Raised by</span> <span className="font-mono">{d.raisedBy}</span>.
              {' '}Channel: <span className="font-mono">{d.channel}</span>. Opening this panel performed no
              lookup and stored nothing — the measurement is SQL over rows already held.
            </p>
          </div>
        );
      })()}
    </section>
  );
}
