import { useEffect, useRef, useState } from 'react';
import { Sunrise } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, PageTitle, Select } from '@/components/ui';
import { PageSkeleton } from '@/components/shared';
import { ApiError } from '@/lib/apiClient';
import { safeHref } from '@/lib/safeHref';
import {
  fetchReadout,
  type Readout as Brief,
  type ReadoutItem,
  type ReadoutRefusal,
} from '@/lib/api/readout';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE 07:00 READOUT — one ranked brief per reader, where the redaction is VISIBLE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS SCREEN EXISTS. Every other surface here waits to be asked: the operator has
 * to remember to go and look, across eight compartments and a hundred and sixty-odd
 * pages. This one is told, not asked — a single ranked list of what changed in a stated
 * window, computed for whoever is reading.
 *
 * AND IT SAYS WHAT IT IS NOT SHOWING. "3 items withheld" sits at the TOP of the list,
 * not in a footer, because a compartmented system that hides the fact that it is hiding
 * something is indistinguishable — from this chair — from a system with nothing in it.
 * The count is the reader's; the content is not.
 *
 * AND IT NAMES THE CHANNEL THAT COUNT OPENS. The number is information leaving
 * compartments the reader does not hold, so the server's `redaction.channelStatement`
 * says what it does and does not reveal — an aggregate with no time bound, which becomes
 * one compartment's own counter when only one compartment is unheld, and which moves as
 * other desks work — and this screen renders it in ALL THREE limbs of the banner,
 * including the quiet one. `withheld: 0` is a statement about other compartments too.
 *
 * ── ONE COLUMN, ONE FILTER, ONE RANK ─────────────────────────────────────────
 * There is one list. Not a dashboard, not tiles of tiles. The filter is the reader's
 * compartments plus the window; the rank is RECENCY and the screen SAYS SO next to
 * every position number, because a bare "#1" beside an alert reads as "most important"
 * and the server has no basis for that claim. `ranking.notRankedBy` is rendered in full,
 * so a reader can see which orderings were refused and why.
 *
 * ── THE FOUR STATES, WHICH ARE THE POINT ─────────────────────────────────────
 *   not_loaded       the ledger could not be read. A FAULT, not a quiet night.
 *   withheld_only    nothing readable here AND material exists you may not see.
 *   genuinely_empty  read, and empty — rendered as a CLAIM ABOUT THIS WINDOW, with the
 *                    window on screen. Never "All clear". And it says that the sweep
 *                    which writes these rows is itself unscheduled, so an unevaluated
 *                    rule and a quiet platform are indistinguishable from here.
 *   ranked           the list.
 *
 * PLUS TWO MORE THINGS THAT ARE NOT STATES OF THE LEDGER AND MUST NOT BORROW ONE:
 *   no brief at all  the fetch failed. Its own panel, with a STABLE CODE and the rule it
 *                    cites, saying the window was never examined.
 *   contradictory    `state` and `items` disagree. Refused, with anything the server did
 *                    send still rendered — never resolved by guessing.
 * THE DISCRIMINATOR IS `state`, NOT the shape of `items`; see the branch itself for what
 * went wrong when it was the other way round.
 *
 * ── THIS PAGE COMPUTES NOTHING ───────────────────────────────────────────────
 * The order, the ranks, the ages, the counts and every refusal are the server's,
 * rendered as sent. There is no browser-side re-sort: a second opinion about which item
 * a reader should see first is exactly the copy that drifts, and the one on the screen
 * would be the drifted one.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 * It does not mark anything read. Opening the brief changes nothing about the bell, so
 * the same brief can be read twice — and there is only one write path for "handled",
 * which lives with the notification, not with the report about it.
 */

const WINDOWS = [6, 12, 24, 72, 168] as const;

/**
 * THE ONE CODE THIS FILE OWNS, AND WHY IT IS NOT IN `READOUT_CODES`.
 *
 * Every other code on this screen was minted by the composer and travels on the
 * payload. This one names the case where NO PAYLOAD ARRIVED — the request never
 * reached the route, or the response was not a brief — so by construction the server
 * cannot have sent it. It is declared here rather than added to the mirrored contract
 * because putting it there would assert that the API can emit it, and it cannot.
 *
 * It exists because the doctrine is that a refusal carries a STABLE CODE and CITES A
 * RULE, and the first version of this panel did neither: it printed the raw transport
 * message under the words NOT LOADED, which is unfindable in a log, unmatchable by a
 * test, and indistinguishable from any other failure on any other screen. When the
 * response WAS a refusal — the route's own `READOUT_ERROR` 500 — `ApiError.code`
 * carries it and the server's code is shown instead of this one.
 */
const TRANSPORT_FAULT_CODE = 'READOUT_NOT_LOADED_TRANSPORT';

/** The rule the fault panel cites, worded as the composer words its own. */
const RULE_ABSENT_REFUSES = {
  instrument: 'house_doctrine',
  provision: 'Absent data refuses',
  text:
    'Absent data refuses. A brief that could not be fetched is NOT a brief saying the night was quiet, '
    + 'and it is not a statement that nothing is being withheld.',
} as const;

/** What the screen knows when it has no brief: a code, a rule, and the raw fault. */
interface LoadFault {
  readonly code: string;
  readonly message: string;
}

/** One component, so a refusal always looks like a refusal and always cites its rule. */
function RefusalPanel({ refusal }: { refusal: ReadoutRefusal }) {
  return (
    <div
      data-testid={`refusal-${refusal.code}`}
      className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label"
    >
      <p className="font-mono text-xs font-semibold text-status-blocked">REFUSED · {refusal.code}</p>
      <p className="mt-1 text-navy">{refusal.sentence}</p>
      <p className="mt-1.5 text-micro text-grey-dark">
        Rule: <span className="font-mono">{refusal.rule.instrument} · {refusal.rule.provision}</span>
        {' — '}{refusal.rule.text}
      </p>
    </div>
  );
}

/**
 * THE REDACTION BANNER. It renders whenever anything is being withheld, ABOVE the list,
 * and it states the frame of its own counts: they are ledger-wide, not window-scoped, so
 * the reader is not invited to subtract one number from another.
 *
 * AND IT STATES THE CHANNEL IN ALL THREE LIMBS, INCLUDING THE QUIET ONE. The withheld
 * count is information flowing out of compartments the reader does not hold; `withheld: 0`
 * is such information too, and a sharper piece of it — it says no compartment you lack has
 * ever recorded an alert. The server composes that sentence
 * (`redaction.channelStatement`); this renders it unconditionally, because a channel only
 * shown when the number is interesting is a channel the reader learns about too late.
 */
function ChannelNote({ statement }: { statement: string }) {
  return (
    <p className="mt-1.5 text-micro text-grey-dark" data-testid="redaction-channel">
      WHAT THIS TELLS YOU ABOUT COMPARTMENTS YOU DO NOT HOLD: {statement}
    </p>
  );
}

function RedactionBanner({ data }: { data: Brief }) {
  const { withheld, unattributed } = data.redaction;
  if (withheld === null || unattributed === null) {
    return (
      <div
        data-testid="redaction-unknown"
        className="rounded-lg border border-status-unverified/50 bg-status-unverified-bg/30 p-3 text-label"
      >
        <p className="font-mono text-xs font-semibold text-status-unverified">WITHHELD COUNT · NOT READ</p>
        <p className="mt-1 text-navy">{data.redaction.statement}</p>
        <ChannelNote statement={data.redaction.channelStatement} />
      </div>
    );
  }
  if (withheld === 0 && unattributed === 0) {
    return (
      <div data-testid="redaction-none" className="rounded-lg border border-line bg-card p-3 text-micro text-grey-dark">
        {data.redaction.statement}
        <ChannelNote statement={data.redaction.channelStatement} />
      </div>
    );
  }
  return (
    <div
      data-testid="redaction-banner"
      className="rounded-lg border border-status-conditional/50 bg-status-conditional-bg/30 p-3 text-label"
    >
      <p className="font-mono text-xs font-semibold text-status-conditional">
        {withheld} ITEM(S) WITHHELD · {unattributed} UNATTRIBUTED
      </p>
      <p className="mt-1 text-navy">{data.redaction.statement}</p>
      <p className="mt-1.5 text-micro text-grey-dark">
        You hold <span className="font-mono">{data.redaction.scopesHeld.join(', ') || 'no compartment'}</span>. You do not
        hold{' '}
        <span className="font-mono">{data.redaction.compartmentsNotHeld.join(', ') || 'nothing — every compartment'}</span>.
        These two counts are over the whole ledger, not this window.
      </p>
      <ChannelNote statement={data.redaction.channelStatement} />
    </div>
  );
}

function ItemRow({ item }: { item: ReadoutItem }) {
  return (
    <li data-testid={`readout-item-${item.id}`} className="rounded-lg border border-line bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          THE POSITION CARRIES ITS BASIS. "#1" alone is read as "worst"; the server's
          only honest ordering is the clock, so the word travels with the number
          everywhere it appears rather than once in a caption a reader scrolls past.
        */}
        <span className="font-mono text-xs text-grey" title="Position in a recency order — not a severity order">
          #{item.rank} · most recent
        </span>
        <span className="font-mono text-label font-semibold text-navy">{item.title}</span>
        {item.unread ? <Badge status="conditional">UNREAD</Badge> : <Badge status="ready">READ</Badge>}
        <span className="ml-auto font-mono text-micro text-grey">{item.workspace}</span>
      </div>
      {item.detail !== null && <p className="mt-1.5 text-label text-navy">{item.detail}</p>}
      <p className="mt-1.5 text-micro text-grey-dark">
        <span className="font-mono">{item.rule}</span> · observed{' '}
        <span className="font-mono">{item.createdAt}</span> ({item.ageHours}h ago)
        {item.href !== null && (
          <>
            {' · '}
            {/* The href is SERVER-STORED (notifications.href) and this is the desktop
                webview, so an unguarded anchor here is script execution in the app
                origin, not a bad link. `safeHref` returning undefined renders the text
                of the href without making it navigable — the reader still sees exactly
                what was stored, which is what makes a hostile value legible instead of
                silently dropped. The registry refuses these on write now too; this is
                the second layer, for rows written before that landed. */}
            <a className="font-mono underline" href={safeHref(item.href)}>{item.href}</a>
          </>
        )}
      </p>
    </li>
  );
}

export function Readout() {
  const [data, setData] = useState<Brief | null>(null);
  const [fault, setFault] = useState<LoadFault | null>(null);
  const [windowHours, setWindowHours] = useState<number>(24);

  /**
   * THE LAST REQUEST WINS, AND ONLY THE LAST REQUEST.
   *
   * The window control re-fetches, and two briefs for two windows are in flight at once
   * the moment a reader changes it twice. The first version had no guard, so whichever
   * response arrived LAST was rendered — the 6-hour brief could land under a control
   * reading "Last 168 hours". The frame panel would still state the window it actually
   * describes, so the payload was never a lie; the CONTROL was, and a reader trusts the
   * control they just moved. Nothing on the screen would have told them.
   *
   * Two mechanisms, because they cover different halves: the AbortController stops the
   * abandoned request (and `fetchReadout` has always taken a signal — the page simply
   * never passed one), and the token discards a response that resolved before the abort
   * could take effect. An aborted request is NOT a fault and must not render as one.
   */
  const token = useRef(0);
  useEffect(() => {
    const mine = ++token.current;
    const ctl = new AbortController();
    setFault(null);
    setData(null);
    fetchReadout({ windowHours, signal: ctl.signal })
      .then((brief) => {
        if (token.current === mine) setData(brief);
      })
      .catch((e: unknown) => {
        /*
         * AN ABORT IS THE PAGE'S OWN DOING AND IS NOT A FINDING ABOUT ANYTHING. Three
         * ways of recognising one, because any of them can be the first to be true:
         * the token has already moved on, the controller says it aborted, or the
         * rejection is itself an AbortError (which is what arrives when the abort
         * lands between the fetch starting and the cleanup running). Relying on the
         * token alone made this depend on which microtask won.
         */
        const aborted = ctl.signal.aborted || (e instanceof Error && e.name === 'AbortError');
        if (aborted || token.current !== mine) return;
        setFault({
          // The route's own refusal already carries a code; use it rather than
          // relabelling a stated server refusal as a transport fault.
          code: e instanceof ApiError && e.code ? e.code : TRANSPORT_FAULT_CODE,
          message: e instanceof Error ? e.message : 'Failed to load',
        });
      });
    return () => ctl.abort();
  }, [windowHours]);

  /*
   * WHETHER THE WINDOW MAY BE INCOMPLETE IS THE SERVER'S FINDING, READ — NOT RE-DERIVED.
   * The page does not compare `fetched` to a cap it does not know; it reads whether the
   * composer refused. Two distinct causes block the completeness claim, so they are kept
   * apart: the fetch cap (READOUT_TRUNCATED, which now also covers the case where the
   * cap was hit and no instant was readable, so the reach is UNKNOWN rather than short),
   * and a scoped read that handed back rows belonging to someone else — those consumed
   * cap slots, so even a short page cannot be called the reader's whole window.
   */
  const truncationRefused = data?.refusals.some((r) => r.code === 'READOUT_TRUNCATED') ?? false;
  const scopeLeak = (data?.redaction.droppedOutOfScope ?? 0) > 0;

  return (
    <div className="p-5">
      <PageTitle
        icon={<Sunrise size={20} />}
        subtitle="One ranked brief for you — what changed in a stated window, in recency order, with the redaction shown rather than hidden. Nothing fires this at 07:00, and nothing fires the rule sweep that writes these rows on a schedule either."
        actions={(
          <Select
            value={String(windowHours)}
            onChange={(e) => setWindowHours(Number(e.target.value))}
            aria-label="Window"
            options={WINDOWS.map((h) => ({ value: String(h), label: `Last ${h} hours` }))}
          />
        )}
      >
        The 07:00 Readout
      </PageTitle>

      {fault !== null ? (
        /*
          A FAULT PANEL SHAPED LIKE EVERY OTHER REFUSAL ON THIS SCREEN: a stable code, the
          rule it applies, and the sentence. It also names the window that was ASKED FOR and
          says that window was never examined — an empty screen beside a control reading
          "Last 24 hours" is otherwise read as a claim about those 24 hours, which is the
          one thing a failed fetch cannot support.
        */
        <div data-testid="readout-error" className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label">
          <p className="font-mono text-xs font-semibold text-status-blocked">NOT LOADED · {fault.code}</p>
          <p className="mt-1 text-navy">{fault.message}</p>
          <p className="mt-1.5 text-navy">
            No brief was computed, so the last <span className="font-mono">{windowHours}</span> hours were NOT examined.
            This is a fault, not a finding. It does not mean nothing needs your attention, and it does not mean
            nothing is being withheld from you — how much material sits in compartments you do not hold is unknown
            here, and unknown is not zero.
          </p>
          <p className="mt-1.5 text-micro text-grey-dark">
            Rule:{' '}
            <span className="font-mono">
              {RULE_ABSENT_REFUSES.instrument} · {RULE_ABSENT_REFUSES.provision}
            </span>
            {' — '}{RULE_ABSENT_REFUSES.text}
          </p>
        </div>
      ) : data === null ? (
        <PageSkeleton />
      ) : (
        <div className="space-y-4">
          {/*
            THE OBSERVATION FRAME IS FIRST AND UNCONDITIONAL. Every figure below is only
            readable beside it: what was observed, when, over what window, and out of
            WHICH database. A reader must never have to guess whether an empty brief
            means the window was quiet or the query never ran.
          */}
          <div
            data-testid="readout-frame"
            className="rounded-lg border border-line bg-ice-soft/40 p-3 text-micro text-grey-dark dark:bg-navy-deep/40"
          >
            <p>
              Observed <span className="font-mono">{data.frame.observedAt}</span> over{' '}
              <span className="font-mono">{data.frame.windowFrom}</span> →{' '}
              <span className="font-mono">{data.frame.windowTo}</span> ({data.frame.windowHours} hours).
            </p>
            <p className="mt-1">
              Source <span className="font-mono">{data.frame.source}</span> · compartments{' '}
              <span className="font-mono">{data.frame.scopes.join(', ')}</span> · environment{' '}
              {data.frame.environment === null ? (
                <span className="font-mono text-status-unverified">NOT NAMED — see the refusal below</span>
              ) : (
                <span className="font-mono">{data.frame.environment}</span>
              )}
              .
            </p>
            {/* The 07:00 that is not true, on the screen and not only in the payload. */}
            <p className="mt-1 text-status-conditional" data-testid="frame-schedule">
              {data.frame.scheduleStatement}
            </p>
          </div>

          {/*
            THE RANKING BASIS, STATED WHERE THE LIST IS READ. Not a tooltip and not a
            footnote: the one thing a reader will take from a ranked list is that the top
            of it matters most, and that is the claim this data cannot support.
          */}
          <Card>
            <CardHeader>How this list is ordered</CardHeader>
            <CardBody>
              <p data-testid="ranking-statement" className="text-label text-navy">{data.ranking.statement}</p>
              <p className="mt-2 text-micro font-semibold text-grey">
                BASIS <span className="font-mono">{data.ranking.basis}</span> ·{' '}
                <span className="font-mono">{data.ranking.direction}</span> ·{' '}
                <span className="font-mono">{data.ranking.field}</span>
              </p>
              <div className="mt-2" data-testid="ranking-rejected">
                <p className="text-micro font-semibold text-status-blocked">NOT RANKED BY</p>
                <ul className="mt-1 space-y-0.5">
                  {data.ranking.notRankedBy.map((b) => (
                    <li key={b.key} className="text-micro text-grey-dark">
                      <span className="font-mono">{b.key}</span> — {b.why}
                    </li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>

          {/* Every refusal, not the first one found. */}
          {data.refusals.length > 0 && (
            <div className="space-y-2" data-testid="readout-refusals">
              {data.refusals.map((r) => <RefusalPanel key={r.code} refusal={r} />)}
            </div>
          )}

          <RedactionBanner data={data} />

          {/* THE COUNTS. Every one of them can be null, and null is never printed as 0. */}
          <div className="grid gap-2 sm:grid-cols-3" data-testid="readout-counts">
            <Count
              label="In this window"
              value={data.counts.inWindow}
              note="Items in your compartments with a readable instant inside the window above. This is the only count here that is window-scoped."
            />
            {/*
              THE TILE STATES WHICH IT IS, RATHER THAN TEACHING THE READER TO INFER IT.
              The first version's note read "Equal to the fetch cap means the window may
              hold more — the server says so as READOUT_TRUNCATED" on EVERY brief, which
              made the tile useless twice over: the reader had to compare the number to a
              cap the screen never shows, and a test asserting the tile mentions
              READOUT_TRUNCATED passed whether the server had refused or not. The server
              has already decided — the refusal is either present or it is not — so the
              tile says the answer.
            */}
            <Count
              label="Fetched from the ledger"
              value={data.counts.fetched}
              note={data.counts.fetched === null
                /*
                  NOT READ FIRST, BEFORE ANY CLAIM ABOUT COMPLETENESS. Written while
                  fixing the note above and caught by the same reasoning: the branches
                  below reason from "the cap was not reached", and on a not-loaded brief
                  the cap was not reached because NOTHING WAS FETCHED. The completeness
                  sentence would then have said every item the ledger holds is below, of
                  a read that never happened — a worse lie than the one being replaced.
                */
                ? 'The ledger was not read, so nothing is known about how much it holds for you or whether this window was covered. Not read is not zero and not complete.'
                : truncationRefused
                  ? 'THIS IS A SUBSET. The server refused to present the window as complete — see READOUT_TRUNCATED above. There may be further items in this window that are not below.'
                  : scopeLeak
                    ? 'THIS COUNT INCLUDES ROWS THAT ARE NOT YOURS. The ledger handed back items outside your compartments; they were dropped and reported as READOUT_SCOPE_MISMATCH above, but they filled fetch slots, so this window cannot be called complete.'
                    : 'Your most recent items considered before the window filter. The cap was not reached inside this window, so every item the ledger holds for you in it is below or in the unrankable bucket.'}
            />
            <Count
              label="Unread in your compartments"
              value={data.counts.unreadInScopeAllTime}
              note="LEDGER-WIDE, not this window: it is the bell's own count over the whole table. Do not read it against the window count."
            />
          </div>

          {/*
            THE LIST — one column, and four states that never collapse into one.

            THE DISCRIMINATOR IS `state`, NOT `items`. The first version branched on
            `items === null` for NOT LOADED and then fell through to `items.length === 0`,
            so a payload carrying `state: 'not_loaded'` with `items: []` — a stale client
            against a newer API, a proxy that rewrote a null, any future composer that
            returns `[]` on a fault — rendered the GENUINELY-EMPTY panel, whose text
            asserts "the ledger was read" and "nothing is being withheld from you". That
            is the exact collapse this screen exists to prevent, made over a FAULT, and
            it is the state field's whole job to prevent it. `items === null` is still
            honoured as not-loaded (a null list cannot be rendered either way), and a
            combination this screen does not recognise REFUSES rather than picking the
            most cheerful branch that happens to typecheck.
          */}
          {data.state === 'not_loaded' || data.items === null ? (
            <div data-testid="items-not-loaded" className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label">
              <p className="font-mono text-xs font-semibold text-status-blocked">NOT LOADED</p>
              <p className="mt-1 text-navy">
                The notifications ledger could not be read on this environment, so nothing was examined. This brief is
                short because nothing was looked at — not because nothing happened.
              </p>
            </div>
          ) : data.state === 'withheld_only' ? (
            <div data-testid="items-withheld-only" className="rounded-lg border border-status-conditional/50 bg-status-conditional-bg/30 p-3 text-label">
              <p className="font-mono text-xs font-semibold text-status-conditional">NOTHING YOU MAY READ IN THIS WINDOW</p>
              <p className="mt-1 text-navy">
                No item in your compartments falls between <span className="font-mono">{data.frame.windowFrom}</span> and{' '}
                <span className="font-mono">{data.frame.windowTo}</span>, and the ledger holds{' '}
                <span className="font-mono font-semibold">{data.redaction.withheld}</span> item(s) in compartments you do
                not hold plus <span className="font-mono font-semibold">{data.redaction.unattributed}</span> with no
                compartment recorded. This is PRESENT-BUT-WITHHELD, not empty.
              </p>
              <p className="mt-1.5 text-micro text-grey-dark">
                Those two counts are over the whole ledger, so this does not claim the withheld material is inside this
                window — only that it exists and that you are not being shown it.
              </p>
            </div>
          ) : data.state === 'ranked' && data.items.length > 0 ? (
            <ul className="space-y-2.5" data-testid="readout-items">
              {data.items.map((i) => <ItemRow key={i.id} item={i} />)}
            </ul>
          ) : data.state === 'genuinely_empty' && data.items.length === 0 ? (
            <div data-testid="items-empty" className="rounded-lg border border-line bg-card p-3 text-label">
              <p className="font-mono text-xs font-semibold text-grey">NO ITEMS IN THIS WINDOW</p>
              <p className="mt-1 text-navy">
                The ledger was read and holds no item for{' '}
                <span className="font-mono">{data.frame.scopes.join(', ') || 'no compartment — you hold none'}</span>{' '}
                between <span className="font-mono">{data.frame.windowFrom}</span> and{' '}
                <span className="font-mono">{data.frame.windowTo}</span>. Nothing is being withheld from you and no row
                lacks a compartment.
              </p>
              <p className="mt-1.5 text-micro text-grey-dark">
                That is a claim about this window and about nothing else. It is not a statement that the platform is
                healthy, that nothing needs you, or that anything outside this window is quiet.
              </p>
              {/*
                AND IT IS A CLAIM ABOUT THE LEDGER, NOT ABOUT THE PLATFORM. Nothing runs the
                alert sweep on a cadence — the payload says so under READOUT_NOT_SCHEDULED —
                so "no row was written" and "no rule was evaluated" look identical from here.
                Without this line the emptiest state on the screen is the one most likely to
                be over-read, and it was the one saying least.
              */}
              <p className="mt-1.5 text-micro text-status-conditional" data-testid="empty-cadence-caveat">
                No alert was RECORDED for you in this window. That is not the same as no condition arising: nothing
                fires the rule sweep that writes these rows on a schedule, so an unevaluated rule and a quiet
                platform are indistinguishable from this screen.
              </p>
            </div>
          ) : (
            /*
              THE PAYLOAD CONTRADICTS ITSELF, AND THAT IS ITS OWN OUTCOME — not a reason to
              pick whichever branch renders. `state: 'ranked'` with an empty list, or
              `genuinely_empty` with items in it, means the client and the server disagree
              about what was found. Guessing would mean either hiding items that exist or
              printing a quiet-window claim over them. Anything the server did send is still
              rendered below the refusal, because dropping it would make the list shorter for
              a reason the reader cannot see.
            */
            <div className="space-y-2.5">
              <div
                data-testid="items-state-contradictory"
                className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label"
              >
                <p className="font-mono text-xs font-semibold text-status-blocked">
                  REFUSED · READOUT_STATE_CONTRADICTORY
                </p>
                <p className="mt-1 text-navy">
                  This brief reports <span className="font-mono">{data.state}</span> while carrying{' '}
                  <span className="font-mono">{data.items.length}</span> item(s), which cannot both be true. This screen
                  will not characterise the window from a payload that disagrees with itself: it is neither a report
                  that the window was quiet nor a report that it was not.
                </p>
              </div>
              {data.items.length > 0 && (
                <ul className="space-y-2.5" data-testid="readout-items">
                  {data.items.map((i) => <ItemRow key={i.id} item={i} />)}
                </ul>
              )}
            </div>
          )}

          {/*
            THE UNPLACEABLE BUCKET — items that exist, are yours, and have no honest
            position in a recency order. Its own panel, never merged into the list and
            never dropped: a shorter list for a reason the reader cannot see is the
            failure this whole surface exists to prevent.
          */}
          {data.unplaceable.length > 0 && (
            <Card>
              <CardHeader>Yours, but not rankable</CardHeader>
              <CardBody>
                <p data-testid="unplaceable-bucket" className="text-label text-navy">
                  <span className="font-mono font-semibold">{data.unplaceable.length}</span> item(s) in your compartments
                  carry a timestamp that could not be read as an instant. This list IS a recency order, so they have no
                  position in it. They are shown here unranked rather than dropped or placed somewhere plausible.
                </p>
                <ul className="mt-2 space-y-1">
                  {data.unplaceable.map((u) => (
                    <li key={u.id} className="text-micro text-grey-dark" data-testid={`unplaceable-${u.id}`}>
                      <span className="font-mono">{u.workspace}</span> · {u.title} ·{' '}
                      <span className="font-mono">{u.rule}</span> · raw timestamp{' '}
                      <span className="font-mono">{u.rawCreatedAt}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A count that refuses. `null` from the API means the read did not happen, and the one
 * thing a figure a human acts on may never do is render that as `0`.
 */
function Count({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3" data-testid={`count-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <p className="text-micro font-semibold text-grey">{label.toUpperCase()}</p>
      {value === null ? (
        <p className="mt-0.5 font-mono text-label font-semibold text-status-unverified">NOT READ</p>
      ) : (
        <p className="mt-0.5 font-mono text-xl font-semibold text-navy">{value}</p>
      )}
      {note && <p className="mt-1 text-micro text-grey-dark">{note}</p>}
    </div>
  );
}
