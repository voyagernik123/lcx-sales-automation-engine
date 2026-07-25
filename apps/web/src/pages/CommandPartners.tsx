import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, RefreshCw, Link2, Pencil, Check, X } from 'lucide-react';
import {
  fetchCommandPartners, invokeCommandAction, fetchBdMatches,
  type CommandPartner, type BdMatch,
} from '@/lib/api/command';
import { EmptyState, PageSkeleton, toast } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';
import { PartnerDossier } from '@/components/command/PartnerDossier';
import { clsx } from 'clsx';

/**
 * LCX COMMAND — Partner Pipeline (Wave 2/3). The 38 US-launch partners as a
 * working surface: governed stage moves, contact/terms fill-in as the RFIs
 * land (closing the two biggest data gaps), and BD-engine cross-links so the
 * program and the desk share one graph. Every write is a registry action.
 */
const STAGES = [
  'evaluate', 'recommended_rfi', 'recommended', 'incumbent_onboarding', 'in_progress',
  'select', 'support', 'alternate', 'specialist', 'hold_geoblock', 'exclude_pending_counsel',
  'signed', 'passed',
] as const;

const STAGE_TONE: Record<string, string> = {
  signed: 'text-emerald-600 dark:text-emerald-400',
  incumbent_onboarding: 'text-cyan-700 dark:text-cyan-400',
  in_progress: 'text-cyan-700 dark:text-cyan-400',
  recommended: 'text-emerald-600 dark:text-emerald-400',
  recommended_rfi: 'text-emerald-600 dark:text-emerald-400',
  select: 'text-emerald-600 dark:text-emerald-400',
  hold_geoblock: 'text-amber-600 dark:text-amber-400',
  exclude_pending_counsel: 'text-red-500',
  passed: 'text-grey',
};

export function CommandPartners() {
  const [partners, setPartners] = useState<CommandPartner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dossier, setDossier] = useState<CommandPartner | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchCommandPartners().then(setPartners).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(load, [load]);

  const types = useMemo(() => {
    const set = new Set((partners ?? []).map((p) => p.type ?? 'Unknown'));
    return ['all', ...[...set].sort()];
  }, [partners]);

  const shown = useMemo(
    () => (partners ?? []).filter((p) => typeFilter === 'all' || (p.type ?? 'Unknown') === typeFilter),
    [partners, typeFilter],
  );

  return (
    <div className="mx-auto max-w-[1300px] p-5">
      <PageTitle
        icon={<Users size={20} />}
        subtitle="The 38 US-launch partners — governed stage moves, contact & terms fill-in, and BD-engine cross-links. Every edit is audited."
        actions={<Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>}
      >
        Partner Pipeline
      </PageTitle>

      {error ? (
        <EmptyState variant="error" title="Partners unavailable" description={error} />
      ) : partners == null ? (
        <PageSkeleton />
      ) : partners.length === 0 ? (
        <EmptyState variant="default" title="No partners yet" description="Apply migration 0040 and seed the command data first (Command Deck → Re-seed)." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {types.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={clsx('rounded-md border px-2.5 py-1 text-label font-medium',
                  typeFilter === t ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-line text-grey hover:text-navy')}>
                {t === 'all' ? `All (${partners.length})` : t}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {shown.map((p) => <PartnerRow key={p.id} p={p} onChange={load} onOpen={() => setDossier(p)} />)}
          </div>
        </>
      )}
      {dossier && <PartnerDossier partner={dossier} onClose={() => setDossier(null)} />}
    </div>
  );
}

function PartnerRow({ p, onChange, onOpen }: { p: CommandPartner; onChange: () => void; onOpen: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState(p.primary_contact ?? '');
  const [terms, setTerms] = useState(p.terms ?? '');
  const [matches, setMatches] = useState<BdMatch[] | null>(null);

  const setStage = async (stage: string) => {
    if (stage === p.pipeline_stage || busy) return;
    setBusy(true);
    try {
      await invokeCommandAction('command_set_partner_stage', 'command_partner', p.id, { stage });
      toast('success', `${p.name} → ${stage.replace(/_/g, ' ')}`);
      onChange();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Stage change failed'); }
    finally { setBusy(false); }
  };

  const saveDetails = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await invokeCommandAction('command_set_partner_details', 'command_partner', p.id, {
        primaryContact: contact, terms,
      });
      toast('success', 'Contact & terms saved — one data gap closed');
      setEditing(false);
      onChange();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  };

  const loadMatches = () => {
    if (matches !== null) { setMatches(null); return; }
    fetchBdMatches(p.id).then(setMatches).catch(() => setMatches([]));
  };

  return (
    <div className="rounded-lg border border-line bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onOpen} className="text-label font-bold text-navy hover:text-cyan-700 hover:underline dark:hover:text-cyan-400">{p.name}</button>
        {p.tier && <span className="rounded bg-ice-soft px-1.5 py-0.5 text-micro font-bold text-grey-dark dark:bg-ice-soft/10">{p.tier}</span>}
        {p.capability_score != null && <span className="font-mono text-micro text-grey">{Number(p.capability_score).toFixed(2)}</span>}
        <span className="text-micro text-grey">{p.type}{p.subtype ? ` · ${p.subtype}` : ''}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={loadMatches} title="BD-engine matches"
            className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-micro text-grey hover:border-cyan-500/50 hover:text-navy">
            <Link2 size={11} /> BD
          </button>
          <select
            value={p.pipeline_stage ?? 'evaluate'} disabled={busy}
            onChange={(e) => void setStage(e.target.value)}
            className={clsx('rounded border border-line bg-card px-1 py-0.5 font-mono text-micro outline-none focus:border-cyan-500 disabled:opacity-50', STAGE_TONE[p.pipeline_stage ?? ''] ?? 'text-grey-dark')}
            aria-label={`Stage of ${p.name}`}
          >
            {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      {p.notes && <p className="mt-1 text-micro text-grey">{p.notes}</p>}

      {/* Contact & terms — the two null-everywhere data gaps, fillable as RFIs land. */}
      <div className="mt-2 border-t border-line/60 pt-2">
        {editing ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Primary contact (name · email)"
              className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-micro text-navy outline-none focus:border-cyan-500" />
            <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Commercial terms (spread, fees, credit…)"
              className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-micro text-navy outline-none focus:border-cyan-500" />
            <Button size="xs" onClick={() => void saveDetails()} disabled={busy}><Check size={11} /> Save</Button>
            <Button size="xs" variant="secondary" onClick={() => { setEditing(false); setContact(p.primary_contact ?? ''); setTerms(p.terms ?? ''); }}><X size={11} /></Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-micro">
            <span className={p.primary_contact ? 'text-navy' : 'text-amber-600 dark:text-amber-400'}>
              {p.primary_contact ?? '⚠ contact unfilled'}
            </span>
            <span className="text-grey">·</span>
            <span className={p.terms ? 'text-navy' : 'text-amber-600 dark:text-amber-400'}>
              {p.terms ?? '⚠ terms unfilled'}
            </span>
            <button onClick={() => setEditing(true)} className="ml-auto inline-flex items-center gap-1 text-micro text-cyan-700 hover:underline dark:text-cyan-400">
              <Pencil size={10} /> edit
            </button>
          </div>
        )}
      </div>

      {matches !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
          <span className="text-micro font-bold uppercase tracking-wider text-grey">BD engine:</span>
          {matches.length === 0 ? (
            <span className="text-micro text-grey">no matching projects</span>
          ) : matches.map((m) => (
            <button key={m.id} onClick={() => navigate(`/bd-pipeline/${m.id}`)}
              className="rounded border border-cyan-500/40 bg-cyan-500/5 px-1.5 py-0.5 text-micro font-medium text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300">
              {m.name}{m.ticker ? ` (${m.ticker})` : ''}{m.tier === 'tracked' ? ' ·tracked' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
