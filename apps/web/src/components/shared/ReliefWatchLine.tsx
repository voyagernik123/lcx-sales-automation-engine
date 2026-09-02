import { useArrivalStore } from '@/lib/useArrival';
import { useAccessStore } from '@/stores/useAccessStore';

/**
 * THE WATCH'S MARK ON AN ENVIRONMENT — S5 of INSTRUMENT_100X_PLAN, "bind".
 *
 * Every kept relief now says, beside its toggle, what the watch found in THIS room since the operator
 * last looked: the count of ranked changes and the top-ranked one, read from the one arrival store S4
 * built (no fetch of its own, no timer, no motion). It is DOM, not a GL mark, on purpose: a mark drawn
 * into six renderers would be six shader programmes for a sentence, invisible to the no-API capture that
 * measures this programme, and unreadable to a screen reader. The room is the ACTIVE workspace — the one
 * the operator is in — so the same wrapper says the right thing on every desk it is mounted on, and a
 * room the operator does not hold has no key in the store and therefore no line.
 *
 * Still by construction: this renders text and a state-coloured dot, and re-renders only when the store
 * changes. Absence is said in words ("nothing recorded since you last looked"), never as an empty gap.
 */
export function ReliefWatchLine() {
  const ws = useAccessStore((s) => s.activeWorkspace);
  const watch = useArrivalStore((s) => s.watch);
  const since = useArrivalStore((s) => s.since);
  if (!watch || !ws) return null;
  const room = watch.byWorkspace[ws];
  if (!room) return null; // not held — no key, no line; the switcher already says why
  const stamp = since ? `${since.slice(0, 16).replace('T', ' ')} UTC` : 'your first arrival';
  return (
    <span className="font-mono text-micro leading-snug text-grey-dark" data-testid="relief-watch-line" data-room={ws}>
      {room.changed === 0 ? (
        <>Watch · nothing recorded in this room since {stamp}.</>
      ) : (
        <>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-status-conditional align-middle" aria-hidden="true" />
          Watch · {room.changed} change{room.changed === 1 ? '' : 's'} in this room since {stamp}
          {room.top ? <> · first: <span className="font-bold uppercase">{room.top.kind}</span> {room.top.title}</> : null}
        </>
      )}
    </span>
  );
}
