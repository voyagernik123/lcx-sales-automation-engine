import { Sparkles } from 'lucide-react';
import { useClock } from '@/lib/useClock';

/**
 * Purely decorative — the old sidebar footer was a Status/Phase/Domain
 * filter panel wired to the legacy regulatory-toolkit pages, rendered on
 * every screen even where it did nothing (BD Engine, Deal Board, etc).
 * This replaces it with something that actually belongs to a sales
 * engine: a rotating strip of one-liners about the product itself.
 */
const NOTES = [
  'Every closed deal makes tomorrow’s queue smarter.',
  '50,000+ tokens in the universe — the core refreshed nightly, free.',
  'Any token, one click to track — live market data on demand.',
  'A reply is a full stop. Automation pauses. You take over.',
  'LinkedIn & Telegram: the system drafts, you send.',
  'Chain fit predicts who pays 5.6× better than average.',
  'Not legal advice — but pretty good business advice.',
  'Somewhere, a Send Queue is waiting for its 15 minutes.',
  'Built to watch the whole market so you don’t have to.',
];

const ROTATE_MS = 6000;

export function SidebarFieldNotes() {
  // Rotation is a PHASE of the one clock, not a private interval: the note showing is a
  // function of the epoch, so it is the same note on every desk at the same instant, and
  // there is no timer to leak (S1).
  const index = Math.floor(useClock(ROTATE_MS) / ROTATE_MS) % NOTES.length;

  return (
    <div className="rounded-lg border border-cyan-100 dark:border-cyan-900/40 bg-cyan-50/50 dark:bg-cyan-950/10 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles size={11} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
        <span className="text-micro font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
          LCX Field Notes
        </span>
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-500" />
      </div>
      <p
        key={index}
        className="min-h-[2.6rem] text-label text-navy leading-relaxed"
      >
        {NOTES[index]}
      </p>
      <div className="flex items-center gap-1 mt-2">
        {NOTES.map((_, i) => (
          <span
            key={i}
            className={
              i === index
                ? 'h-1 w-3 rounded-full bg-cyan-500 t-metric'
                : 'h-1 w-1 rounded-full bg-cyan-500/25 t-metric'
            }
          />
        ))}
      </div>
    </div>
  );
}
