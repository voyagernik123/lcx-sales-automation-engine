import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { WATCH_RANK, type WatchItem, type WatchKind } from '@lcx/shared';
import { useArrival } from '@/lib/useArrival';
import { safeHref } from '@/lib/safeHref';

/**
 * THE WATCH STRIP — S4 of INSTRUMENT_100X_PLAN.md. The arriving officer's board.
 *
 * Sits in the TopNav beside the bell and shows the watch's ranked items — money first, then liability,
 * deadline, activity — revealed one per heartbeat step on arrival (`useArrival`) and then STILL. Every
 * item is a real change from a real register with its instant beside it; nothing here is a summary
 * or a prediction. The kind is carried as a WORD and a state colour together, so the ordering
 * survives a colourblind reader and a black-and-white print.
 *
 * WHAT IT SAYS WHEN IT HAS NOTHING TO SAY. `absent` sentences are rendered verbatim — "nothing recorded
 * since 09:41 UTC — a statement about the record, not about the world", or the register that does not
 * exist, or the API that did not answer. An empty strip is never silent, because silence reads as calm.
 *
 * This is the ONE mount of `useArrival()` — the driver. Other readers (workspace rooms, ticker) read
 * `useArrivalStore` and never fetch.
 */

const KIND_TONE: Record<WatchKind, string> = {
  money: 'text-status-ready',
  liability: 'text-status-blocked',
  deadline: 'text-status-conditional',
  activity: 'text-grey-dark',
};

const stamp = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

export function WatchStrip() {
  const navigate = useNavigate();
  const { watch, revealed, since, unavailable, sweeping } = useArrival();

  if (unavailable !== null) {
    return (
      <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-grey" data-testid="watch-unavailable">
        <span className="shrink-0 font-bold uppercase tracking-wider">watch</span>
        <span className="truncate" title={unavailable}>{unavailable}</span>
      </div>
    );
  }
  if (watch === null) {
    // Reading. Still — no pulse, no spinner; the arrival is the motion, not the wait.
    return <div className="font-mono text-[10px] text-grey" data-testid="watch-reading">watch · reading the record…</div>;
  }

  const shown: WatchItem[] = watch.items.slice(0, revealed);
  const complete = revealed >= watch.items.length;
  const kinds = WATCH_RANK.filter((k) => watch.items.some((it) => it.kind === k));

  return (
    <div className="flex min-w-0 items-center gap-3 font-mono text-[10px]" data-testid="watch-strip" data-sweeping={sweeping ? '1' : '0'}>
      <span
        className="shrink-0 font-bold uppercase tracking-wider text-grey"
        title={since ? `Since you last looked, ${stamp(since)}` : 'First arrival — the last 24 hours'}
      >
        watch{since ? '' : ' · first arrival'}
      </span>
      {watch.items.length === 0 ? (
        <span className="truncate text-grey-dark" data-testid="watch-absent" title={watch.absent.join(' ')}>
          {watch.absent[0] ?? 'Nothing recorded.'}
        </span>
      ) : (
        <ol className="flex min-w-0 items-center gap-3 overflow-hidden" aria-label={`${watch.items.length} changes since you last looked, ranked by consequence`}>
          {shown.map((it) => (
            <li key={it.id} className="flex shrink-0 items-baseline gap-1.5" data-testid={`watch-item-${it.rank}`}>
              <span className={clsx('font-bold uppercase tracking-wider', KIND_TONE[it.kind])}>{it.kind}</span>
              {it.href ? (
                <button
                  type="button"
                  onClick={() => navigate(safeHref(it.href) ?? '/')}
                  className="max-w-[28ch] truncate text-navy hover:underline"
                  title={`${it.detail} · ${stamp(it.at)}`}
                >
                  {it.title}
                </button>
              ) : (
                <span className="max-w-[28ch] truncate text-navy" title={`${it.detail} · ${stamp(it.at)}`}>{it.title}</span>
              )}
            </li>
          ))}
          {complete && watch.unranked > 0 && (
            <li className="shrink-0 text-grey" data-testid="watch-unranked">and {watch.unranked} more, unranked</li>
          )}
        </ol>
      )}
      {kinds.length > 0 && complete && (
        <span className="shrink-0 text-grey" title="Ranking is a stated prior — money, liability, deadline, activity — not learned from outcomes">
          · {watch.rankingBasis === 'stated_prior' ? 'stated prior' : watch.rankingBasis}
        </span>
      )}
    </div>
  );
}
