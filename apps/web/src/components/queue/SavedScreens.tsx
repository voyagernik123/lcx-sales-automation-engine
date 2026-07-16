import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { BookmarkPlus, Check, Pencil, Trash2 } from 'lucide-react';
import { fetchBdPipeline } from '@/lib/api/bd';
import type { BdFilters } from '@/types/bd';
import { SCREENS_KEY, countNewSince, readJson, writeJson, type SavedScreen } from './logic';

interface SavedScreensProps {
  /** The live filter set (used when saving a new screen). */
  filters: BdFilters;
  /** Apply a screen's filter set to the working set. */
  onApply: (filters: BdFilters) => void;
}

/** Probe depth for the Δ badge — beyond this we show "N+". */
const DELTA_PROBE = 100;

/**
 * Saved screens (radar-lite, Linear custom-views pattern): named filter sets
 * over the project universe. Each chip carries a Δ badge — how many matching
 * projects are NEW (created/updated) since you last visited that screen.
 */
export function SavedScreens({ filters, onApply }: SavedScreensProps) {
  const [screens, setScreens] = useState<SavedScreen[]>(() => readJson<SavedScreen[]>(SCREENS_KEY, []));
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const probed = useRef(false);

  const persist = useCallback((next: SavedScreen[]) => {
    setScreens(next);
    writeJson(SCREENS_KEY, next);
  }, []);

  /* Δ probe — newest-first page per screen, count rows newer than lastVisited. */
  useEffect(() => {
    if (probed.current || screens.length === 0) return;
    probed.current = true;
    let cancelled = false;
    (async () => {
      for (const screen of screens) {
        try {
          const res = await fetchBdPipeline(
            { ...screen.filters, sort: 'created', order: 'desc' },
            { limit: DELTA_PROBE },
          );
          if (cancelled) return;
          const n = countNewSince(res.data, screen.lastVisited);
          setDeltas(d => ({ ...d, [screen.id]: n }));
        } catch {
          /* Δ stays unknown — chip still works */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screens]);

  const saveCurrent = () => {
    const name = draftName.trim();
    if (!name) return;
    const screen: SavedScreen = {
      id: `scr-${Date.now().toString(36)}`,
      name,
      filters: { ...filters },
      lastVisited: new Date().toISOString(),
    };
    persist([...screens, screen]);
    setDraftName('');
    setSaving(false);
  };

  const apply = (screen: SavedScreen) => {
    onApply(screen.filters);
    persist(screens.map(s => (s.id === screen.id ? { ...s, lastVisited: new Date().toISOString() } : s)));
    setDeltas(d => ({ ...d, [screen.id]: 0 }));
  };

  const rename = (id: string) => {
    const name = editName.trim();
    if (name) persist(screens.map(s => (s.id === id ? { ...s, name } : s)));
    setEditingId(null);
  };

  if (screens.length === 0 && !saving) {
    return (
      <button
        onClick={() => setSaving(true)}
        className="flex items-center gap-1 text-micro font-bold text-grey hover:text-navy transition-colors"
        title="Save the current filter set as a named screen — its chip will show how many matches are new since your last visit"
      >
        <BookmarkPlus size={11} /> Save screen
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {screens.map(screen => {
        const delta = deltas[screen.id];
        const editing = editingId === screen.id;
        return (
          <span
            key={screen.id}
            className="group inline-flex items-center gap-1 rounded-full border border-line pl-2 pr-1 py-0.5 text-micro font-bold text-navy hover:border-cyan-500 transition-colors"
          >
            {editing ? (
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') rename(screen.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={() => rename(screen.id)}
                className="w-24 bg-transparent outline-none border-b border-cyan-500 text-micro font-bold"
                aria-label="Rename screen"
              />
            ) : (
              <button onClick={() => apply(screen)} title={`Apply "${screen.name}"`} className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                {screen.name}
              </button>
            )}
            {delta !== undefined && delta > 0 && (
              <span
                className="rounded-full bg-cyan-500/10 px-1.5 font-mono text-cyan-600 dark:text-cyan-400"
                title={`${delta}${delta >= DELTA_PROBE ? '+' : ''} new since your last visit`}
              >
                Δ{delta}{delta >= DELTA_PROBE ? '+' : ''}
              </span>
            )}
            {!editing && (
              <span className="hidden group-hover:inline-flex items-center">
                <button
                  onClick={() => {
                    setEditingId(screen.id);
                    setEditName(screen.name);
                  }}
                  className="p-0.5 text-grey hover:text-navy transition-colors"
                  aria-label={`Rename ${screen.name}`}
                >
                  <Pencil size={9} />
                </button>
                <button
                  onClick={() => persist(screens.filter(s => s.id !== screen.id))}
                  className="p-0.5 text-grey hover:text-red-500 transition-colors"
                  aria-label={`Delete ${screen.name}`}
                >
                  <Trash2 size={9} />
                </button>
              </span>
            )}
          </span>
        );
      })}
      {saving ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveCurrent();
              if (e.key === 'Escape') setSaving(false);
            }}
            placeholder="Screen name…"
            className="w-28 rounded border border-line bg-ice-soft dark:bg-navy-deep px-1.5 py-0.5 text-micro outline-none focus:border-cyan-500"
            aria-label="New screen name"
          />
          <button onClick={saveCurrent} disabled={!draftName.trim()} className="p-0.5 text-cyan-600 dark:text-cyan-400 disabled:opacity-40" aria-label="Save screen">
            <Check size={11} />
          </button>
        </span>
      ) : (
        <button
          onClick={() => setSaving(true)}
          className={clsx('flex items-center gap-1 text-micro font-bold text-grey hover:text-navy transition-colors')}
          title="Save the current filter set as a named screen"
        >
          <BookmarkPlus size={11} /> Save
        </button>
      )}
    </div>
  );
}
