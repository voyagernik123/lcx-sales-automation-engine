import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Purely decorative — the old sidebar footer was a Status/Phase/Domain
 * filter panel wired to the legacy regulatory-toolkit pages, rendered on
 * every screen even where it did nothing (BD Engine, Deal Board, etc).
 * This replaces it with something that actually belongs to a sales
 * engine: a rotating strip of one-liners about the product itself.
 */
const NOTES = [
  'Every closed deal makes tomorrow’s queue smarter.',
  '7,850 tokens tracked, refreshed nightly — for free.',
  'A reply is a full stop. Automation pauses. You take over.',
  'LinkedIn & Telegram: the system drafts, you send.',
  'Chain fit predicts who pays 5.6× better than average.',
  'Not legal advice — but pretty good business advice.',
  'Somewhere, a Send Queue is waiting for its 15 minutes.',
  'Built to watch the whole market so you don’t have to.',
];

const ROTATE_MS = 6000;

export function SidebarFieldNotes() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % NOTES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-lg border border-cyan-100 dark:border-cyan-900/40 bg-cyan-50/50 dark:bg-cyan-950/10 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles size={11} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
        <span className="text-micro font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
          LCX Field Notes
        </span>
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse-beacon" />
      </div>
      <p
        key={index}
        className="min-h-[2.6rem] text-label text-navy dark:text-ice leading-relaxed animate-fadeIn"
      >
        {NOTES[index]}
      </p>
      <div className="flex items-center gap-1 mt-2">
        {NOTES.map((_, i) => (
          <span
            key={i}
            className={
              i === index
                ? 'h-1 w-3 rounded-full bg-cyan-500 transition-all'
                : 'h-1 w-1 rounded-full bg-cyan-500/25 transition-all'
            }
          />
        ))}
      </div>
    </div>
  );
}
