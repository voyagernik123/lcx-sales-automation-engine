import type { LucideIcon } from 'lucide-react';

/**
 * Pivot rail — the inspector's relation strip (FINAL_MASTER_PLAN 3.2 L3).
 * One compact row of "n contacts · 1 deal · 12 events" pivots; each either
 * pushes a deeper inspector onto the stack or scrolls to its section. The
 * graph is the navigation.
 */
export interface RelationRailItem {
  label: string;
  count: number;
  icon: LucideIcon;
  onClick: () => void;
  /** Render even when count is 0 (default: hidden). */
  showEmpty?: boolean;
}

export function RelationRail({ items }: { items: RelationRailItem[] }) {
  const visible = items.filter(i => i.count > 0 || i.showEmpty);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map(({ label, count, icon: Icon, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-micro font-semibold text-grey-dark transition-colors hover:border-cyan-500/50 hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
        >
          <Icon size={11} className="text-grey" />
          <span className="num-tabular">{count}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
