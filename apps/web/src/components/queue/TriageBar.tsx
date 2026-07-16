const KEYS: { k: string; label: string }[] = [
  { k: 'J/K', label: 'move' },
  { k: 'Space', label: 'peek' },
  { k: '↵', label: 'open' },
  { k: 'S', label: 'snooze' },
  { k: 'D', label: 'disqualify' },
  { k: 'E', label: 'enroll' },
  { k: '1–4', label: 'splits' },
];

/**
 * The visible triage-grammar legend (Linear pattern): always-on strip at the
 * bottom of the queue so the keyboard contract is discoverable, not tribal.
 */
export function TriageBar({ position }: { position?: string | null }) {
  return (
    <div className="shrink-0 flex items-center gap-4 px-4 py-1.5 border-t border-line bg-card overflow-x-auto">
      {KEYS.map(({ k, label }) => (
        <span key={k} className="flex items-center gap-1.5 text-micro text-grey whitespace-nowrap">
          <kbd className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-1.5 font-mono text-micro font-medium text-navy leading-4">
            {k}
          </kbd>
          {label}
        </span>
      ))}
      {position && (
        <span className="ml-auto text-micro font-mono num-tabular text-grey whitespace-nowrap">{position}</span>
      )}
    </div>
  );
}
