import { useCallback, useEffect, useState } from 'react';
import { Sunrise } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, PageTitle, Select } from '@/components/ui';
import { PageSkeleton } from '@/components/shared';
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
 *                    window on screen. Never "All clear".
 *   ranked           the list.
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
 */
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
      </div>
    );
  }
  if (withheld === 0 && unattributed === 0) {
    return (
      <div data-testid="redaction-none" className="rounded-lg border border-line bg-card p-3 text-micro text-grey-dark">
        {data.redaction.statement}
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
        You hold <span className="font-mono">{data.redaction.scopesHeld.join(', ')}</span>. You do not hold{' '}
        <span className="font-mono">{data.redaction.compartmentsNotHeld.join(', ') || 'nothing — every compartment'}</span>.
        These two counts are over the whole ledger, not this window.
      </p>
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
            <a className="font-mono underline" href={item.href}>{item.href}</a>
          </>
        )}
      </p>
    </li>
  );
}

export function Readout() {
  const [data, setData] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState<number>(24);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    fetchReadout({ windowHours })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [windowHours]);
  useEffect(load, [load]);

  return (
    <div className="p-5">
      <PageTitle
        icon={<Sunrise size={20} />}
        subtitle="One ranked brief for you — what changed in a stated window, in recency order, with the redaction shown rather than hidden. Nothing fires this at 07:00."
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

      {error !== null ? (
        <div data-testid="readout-error" className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label">
          <p className="font-mono text-xs font-semibold text-status-blocked">NOT LOADED</p>
          <p className="mt-1 text-navy">{error}</p>
          <p className="mt-1.5 text-micro text-grey-dark">
            This is a fault, not a finding. It does not mean nothing needs your attention, and it does not mean
            nothing is being withheld from you.
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
            <Count
              label="Fetched from the ledger"
              value={data.counts.fetched}
              note="Your most recent items considered before the window filter. Equal to the fetch cap means the window may hold more — the server says so as READOUT_TRUNCATED."
            />
            <Count
              label="Unread in your compartments"
              value={data.counts.unreadInScopeAllTime}
              note="LEDGER-WIDE, not this window: it is the bell's own count over the whole table. Do not read it against the window count."
            />
          </div>

          {/* THE LIST — one column, and four states that never collapse into one. */}
          {data.items === null ? (
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
          ) : data.items.length === 0 ? (
            <div data-testid="items-empty" className="rounded-lg border border-line bg-card p-3 text-label">
              <p className="font-mono text-xs font-semibold text-grey">NO ITEMS IN THIS WINDOW</p>
              <p className="mt-1 text-navy">
                The ledger was read and holds no item for <span className="font-mono">{data.frame.scopes.join(', ')}</span>{' '}
                between <span className="font-mono">{data.frame.windowFrom}</span> and{' '}
                <span className="font-mono">{data.frame.windowTo}</span>. Nothing is being withheld from you and no row
                lacks a compartment.
              </p>
              <p className="mt-1.5 text-micro text-grey-dark">
                That is a claim about this window and about nothing else. It is not a statement that the platform is
                healthy, that nothing needs you, or that anything outside this window is quiet.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5" data-testid="readout-items">
              {data.items.map((i) => <ItemRow key={i.id} item={i} />)}
            </ul>
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
