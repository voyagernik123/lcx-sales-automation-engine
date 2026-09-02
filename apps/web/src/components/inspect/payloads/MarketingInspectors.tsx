import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, Lock } from 'lucide-react';
import type { AbusePerimeterState } from '@lcx/shared';
import { fetchAbusePerimeter } from '@/lib/api/marketing';
import { formatDate } from '@/lib/format';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui';
import { useInspectorStore } from '@/stores';
import { RelationRail } from '../RelationRail';
import type { InspectorPayloadProps } from './ProjectInspector';

/**
 * L3 payloads for the marketing compartment — S5 of INSTRUMENT_100X_PLAN (the join).
 *
 * Two objects carry the market-abuse liability (MiCA Art 90/91(3)(c)): an ASSET, whose inside-information
 * state is the embargo register, and a HOLDINGS DECLARATION, a named member's statement about an asset.
 * Both read from the ONE perimeter view the marketing desk already reads, through `fetchAbusePerimeter`
 * (behind the marketing honesty ceiling in lib/api/marketing.ts — this file makes no request of its own),
 * so the drawer can never disagree with the desk — and both carry the view's own sentence that absence is
 * not clearance, because a register with no row about an asset is a question, not a green light.
 *
 * The perimeter is entitlement-shaped on the server: `detailWithheld` arrives true for a reader below
 * marketing:view, and these payloads say so in the register's own words rather than rendering an empty
 * register as a clean one.
 */

const FACT_ROW = 'flex items-baseline justify-between gap-3 text-label';
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div className={FACT_ROW}>
      <span className="text-grey">{label}</span>
      <span className="num-tabular min-w-0 truncate text-right font-semibold text-navy">{value}</span>
    </div>
  );
}

function usePerimeter() {
  const [state, setState] = useState<AbusePerimeterState | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchAbusePerimeter()
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, []);
  return { state, failed };
}

const refused = (
  <EmptyState variant="error" title="Perimeter unavailable" description="The marketing perimeter could not be read — the API refused or did not answer. Nothing here is inferred." />
);

/* ─────────────────────────── Asset ─────────────────────────── */

/** `id` is the asset symbol — the key the embargo register uses. */
export function AssetInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const { state, failed } = usePerimeter();
  if (failed) return refused;
  if (!state) return <CardSkeleton count={2} />;
  const symbol = id.toUpperCase();
  const embargoes = state.embargo.entries.filter((e) => String(e.assetSymbol).toUpperCase() === symbol);
  const holdings = state.holdings.entries.filter((h) => String(h.assetSymbol).toUpperCase() === symbol);
  const live = embargoes[0] ?? null;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-base font-bold text-navy"><Lock size={14} className="text-grey" />{symbol}</div>
        <p className="mt-1 text-label text-grey">
          {state.embargo.detailWithheld
            ? state.embargo.withheldReason ?? 'embargo detail withheld'
            : live ? `embargo ${String(live.state).replace(/_/g, ' ')}` : state.embargo.registerPresent ? 'no embargo row — ' + state.absenceIsNotClearance : 'embargo register not present on this environment'}
        </p>
      </div>
      {live && !state.embargo.detailWithheld && (
        <div className="space-y-1.5">
          <Fact label="Entered" value={`${live.enteredBy ?? 'unattributed'} · ${formatDate(live.enteredAt)}`} />
          <Fact label="Review by" value={live.reviewBy ? formatDate(live.reviewBy) : 'no review date'} />
          <Fact label="Event" value={live.eventRef} />
          <Fact label="Source" value={live.sourceRef} />
        </div>
      )}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey"><Coins size={11} /> Holdings declared on {symbol}</div>
        {state.holdings.detailWithheld ? (
          <p className="text-label text-grey">{state.holdings.withheldReason ?? 'holdings detail withheld'}</p>
        ) : holdings.length === 0 ? (
          <p className="text-label text-grey">No declaration names this asset — {state.absenceIsNotClearance}</p>
        ) : (
          <ul className="space-y-1">
            {holdings.map((h) => (
              <li key={`${h.memberId}:${h.declaredAt}`} className={FACT_ROW}>
                <span className="text-grey-dark">{h.memberId}</span>
                <span className="num-tabular font-semibold text-navy">{h.holds ? 'holds' : 'does not hold'} · renew by {formatDate(h.renewBy)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button size="sm" variant="secondary" onClick={() => navigate('/marketing/holdings')}>Open holdings desk</Button>
    </div>
  );
}

/* ─────────────────────────── Holdings declaration ─────────────────────────── */

/**
 * The perimeter view carries no row ids, so a declaration is found by the pair the related-group seed
 * carries — member and asset — and the newest declaration for that pair is the one in force.
 */
export function HoldingInspector({ id, seed }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const push = useInspectorStore((s) => s.push);
  const { state, failed } = usePerimeter();
  const memberId = typeof seed?.memberId === 'string' ? seed.memberId : null;
  const assetSymbol = typeof seed?.assetSymbol === 'string' ? seed.assetSymbol : null;
  if (failed) return refused;
  if (!state) return <CardSkeleton count={2} />;
  if (!memberId || !assetSymbol) {
    return <EmptyState title="Declaration without its pair" description={`Declaration ${id} was opened without the member and asset it names; the perimeter view is keyed by that pair. Open it from an asset or a member's related groups.`} />;
  }
  if (state.holdings.detailWithheld) {
    return <EmptyState title="Holdings detail withheld" description={state.holdings.withheldReason ?? 'This reader is below marketing:view for the holdings register.'} />;
  }
  const entries = state.holdings.entries
    .filter((h) => h.memberId === memberId && String(h.assetSymbol).toUpperCase() === assetSymbol.toUpperCase())
    .sort((a, b) => Date.parse(b.declaredAt) - Date.parse(a.declaredAt));
  const current = entries[0] ?? null;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-base font-bold text-navy"><Coins size={14} className="text-grey" />{memberId} · {assetSymbol.toUpperCase()}</div>
        <p className="mt-1 text-label text-grey">
          {current ? `${current.holds ? 'holds' : 'does not hold'} · declared ${formatDate(current.declaredAt)}` : `no declaration in the register for this pair — ${state.absenceIsNotClearance}`}
        </p>
      </div>
      <RelationRail items={[{ label: 'asset', count: 1, icon: Lock, onClick: () => push('asset', assetSymbol.toUpperCase()) }]} />
      {current && (
        <div className="space-y-1.5">
          <Fact label="Renew by" value={`${formatDate(current.renewBy)}${Date.parse(current.renewBy) < Date.now() ? ' · OVERDUE' : ''}`} />
          <Fact label="Earlier declarations" value={entries.length > 1 ? String(entries.length - 1) : 'none'} />
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={() => navigate('/marketing/holdings')}>Open holdings desk</Button>
    </div>
  );
}
