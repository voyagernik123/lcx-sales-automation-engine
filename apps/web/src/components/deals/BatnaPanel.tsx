import { useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/shared/LoadingSkeleton';
import { Scale, Save } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from '@/components/shared/Toast';
import { Button } from '@/components/ui';
import { fetchBatna, saveBatna, type Batna } from '@/lib/api/deals100x';
import { fmtMoneyCents } from './dealFormat';

/**
 * BATNA panel (Deal Desk): fetches the per-deal negotiation figures from
 * /v1/dealdesk/deals/:dealId/batna and renders them on one comparable scale —
 * our floor vs their offer vs best competitor — with the package value as
 * reference. Tracking only; POST upserts, nothing here moves money.
 */

export interface BatnaPanelProps {
  dealId: string;
  dealName: string;
  /** Package value in cents, for the reference tick. */
  packageValue: number | null;
  className?: string;
}

interface Draft {
  ourFloor: string;
  theirOffer: string;
  competitorOffer: string;
  notes: string;
}

const toUsdStr = (cents: number | null): string => (cents == null ? '' : String(Math.round(cents / 100)));
const toCents = (usd: string): number | null => {
  const t = usd.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

interface Marker {
  key: string;
  label: string;
  cents: number;
  cls: string;
}

/** Horizontal scale bar with labelled value markers + ZOPA shading. */
function BatnaBar({ floor, theirs, competitor, packageValue }: { floor: number | null; theirs: number | null; competitor: number | null; packageValue: number | null }) {
  const markers: Marker[] = [];
  if (floor != null) markers.push({ key: 'floor', label: 'Our floor', cents: floor, cls: 'bg-navy' });
  if (theirs != null) markers.push({ key: 'theirs', label: 'Their offer', cents: theirs, cls: 'bg-status-conditional' });
  if (competitor != null) markers.push({ key: 'comp', label: 'Competitor', cents: competitor, cls: 'bg-status-blocked' });
  if (packageValue != null && packageValue > 0) markers.push({ key: 'pkg', label: 'Package', cents: packageValue, cls: 'bg-grey' });

  if (markers.length === 0) {
    return <p className="text-micro text-grey">No figures tracked yet — enter them below.</p>;
  }

  const max = Math.max(...markers.map(m => m.cents)) * 1.15 || 1;
  const pct = (cents: number) => Math.min(100, (cents / max) * 100);
  const zopa = floor != null && theirs != null;
  const zopaOk = zopa && theirs! >= floor!;

  return (
    <div>
      <div className="relative mt-4 h-3 rounded-full bg-ice-soft dark:bg-ice-soft/10" role="img" aria-label="BATNA scale">
        {zopa && (
          <div
            className={clsx('absolute inset-y-0 rounded-full', zopaOk ? 'bg-status-ready-bg' : 'bg-status-blocked-bg')}
            style={{
              left: `${pct(Math.min(floor!, theirs!))}%`,
              width: `${Math.max(1, Math.abs(pct(theirs!) - pct(floor!)))}%`,
            }}
            title={zopaOk ? 'Agreement zone: their offer clears our floor' : 'Gap: their offer is below our floor'}
          />
        )}
        {markers.map(m => (
          <div
            key={m.key}
            className={clsx('absolute top-[-3px] h-[18px] w-[3px] rounded-sm', m.cls)}
            style={{ left: `calc(${pct(m.cents)}% - 1px)` }}
            title={`${m.label}: ${fmtMoneyCents(m.cents)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {markers.map(m => (
          <span key={m.key} className="inline-flex items-center gap-1 text-micro text-grey">
            <span className={clsx('h-2 w-2 rounded-sm', m.cls)} aria-hidden="true" />
            {m.label} <span className="num-tabular font-mono font-bold text-navy">{fmtMoneyCents(m.cents)}</span>
          </span>
        ))}
      </div>
      {zopa && (
        <p className={clsx('mt-1.5 text-micro font-semibold', zopaOk ? 'text-status-ready' : 'text-status-blocked')}>
          {zopaOk
            ? `Their offer clears our floor by ${fmtMoneyCents(theirs! - floor!)} — agreement zone exists.`
            : `Their offer is ${fmtMoneyCents(floor! - theirs!)} below our floor — no agreement zone yet.`}
        </p>
      )}
    </div>
  );
}

export function BatnaPanel({ dealId, dealName, packageValue, className }: BatnaPanelProps) {
  const [batna, setBatna] = useState<Batna | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({ ourFloor: '', theirOffer: '', competitorOffer: '', notes: '' });

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setError('');
    fetchBatna(dealId)
      .then(b => {
        if (!alive) return;
        setBatna(b);
        setDraft({
          ourFloor: toUsdStr(b?.ourFloorCents ?? null),
          theirOffer: toUsdStr(b?.theirOfferCents ?? null),
          competitorOffer: toUsdStr(b?.competitorOfferCents ?? null),
          notes: b?.notes ?? '',
        });
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load BATNA');
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [dealId]);

  // The draft is seeded from the stored record, so it is the single truth
  // for the bar — clearing a field clears its marker live.
  const current = useMemo(
    () => ({
      floor: toCents(draft.ourFloor),
      theirs: toCents(draft.theirOffer),
      competitor: toCents(draft.competitorOffer),
    }),
    [draft],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const next = await saveBatna(dealId, {
        ourFloorCents: toCents(draft.ourFloor),
        theirOfferCents: toCents(draft.theirOffer),
        competitorOfferCents: toCents(draft.competitorOffer),
        notes: draft.notes.trim() || null,
      });
      setBatna(next);
      toast('success', `BATNA saved — ${dealName}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save BATNA');
    } finally {
      setSaving(false);
    }
  }, [dealId, dealName, draft]);

  const fields: { key: keyof Draft; label: string }[] = [
    { key: 'ourFloor', label: 'Our floor $' },
    { key: 'theirOffer', label: 'Their offer $' },
    { key: 'competitorOffer', label: 'Competitor $' },
  ];

  return (
    <section className={clsx('rounded-xl border border-line/70 bg-card p-5 shadow-card', className)} aria-label="BATNA tracker">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold tracking-tight text-navy">
        <Scale size={14} className="text-indigo-500" aria-hidden="true" /> BATNA — {dealName}
      </h2>
      <p className="mb-2 text-micro text-grey">Negotiation figures, tracking only. One record per deal.</p>

      {!loaded && <Skeleton className="h-16" label="Loading BATNA" />}
      {loaded && error && <p className="text-label text-status-blocked">{error}</p>}

      {loaded && !error && (
        <>
          <BatnaBar floor={current.floor} theirs={current.theirs} competitor={current.competitor} packageValue={packageValue} />

          <div className="mt-3 grid grid-cols-3 gap-2">
            {fields.map(f => (
              <label key={f.key} className="block">
                <span className="block text-micro font-bold uppercase tracking-wider text-grey">{f.label}</span>
                <input
                  inputMode="numeric"
                  value={draft[f.key]}
                  onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                  placeholder="—"
                  className="num-tabular mt-1 w-full rounded border border-line bg-card px-1.5 py-1 text-right font-mono text-label text-navy focus-ring"
                />
              </label>
            ))}
          </div>
          <input
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            placeholder="Negotiation notes…"
            className="mt-2 w-full rounded border border-line bg-card px-2 py-1 text-label text-navy focus-ring"
          />
          <div className="mt-2 flex justify-end">
            <Button variant="secondary" size="xs" onClick={() => void save()} disabled={saving}>
              <Save size={10} /> {saving ? 'Saving…' : batna ? 'Update' : 'Save'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
