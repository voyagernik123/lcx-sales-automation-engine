import { useEffect, useMemo, useState, useRef } from 'react';
import { X, FileText, Radar as RadarIcon, Coins } from 'lucide-react';
import { rfiEconomics } from '@lcx/shared';
import { fetchCommandDeep, recordRfi, extractRfiText, type CommandDeep, type CommandPartner } from '@/lib/api/command';
import { SourceChip } from './SourceChip';
import { toast } from '@/components/shared/Toast';
import { Button } from '@/components/ui';
import { useDismissible } from '@/hooks/useDismissible';

/**
 * Partner Dossier (100X Phase 3) — the dossier room: a partner's 10-dimension
 * radar vs the Tier-1 average, the capability facts with provenance, the
 * 20-field RFI form (governed write; provenance auto-upgrades C3→B2→A1), and
 * the effective-cost readout the moment spreads exist.
 */
export function PartnerDossier({ partner, onClose }: { partner: CommandPartner; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  // A refutation attempt failed here, which is why it is worth a comment: this LOOKS
  // like it sits inside the command palette (its file lives under components/command),
  // and the palette does register. It does not — `pages/CommandPartners.tsx` renders it
  // at page level, so Escape did nothing on it.
  useDismissible(true, onClose, `${partner.name} dossier`, panelRef);
  const [deep, setDeep] = useState<CommandDeep | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'issued' | 'returned' | 'signed'>('returned');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [paste, setPaste] = useState('');
  const [extracting, setExtracting] = useState(false);

  useEffect(() => { fetchCommandDeep().then(setDeep).catch(() => setDeep(null)); }, [refresh]);

  const lp = deep?.reference.scorecards.lp;
  const row = lp?.rows.find((r) => r.subjectId === partner.id);
  const tier1Avg = useMemo(() => {
    if (!lp) return null;
    const t1 = lp.rows.filter((r) => (r.tier ?? '').includes('Tier 1'));
    if (t1.length === 0) return null;
    const avg: Record<string, number> = {};
    for (const d of lp.dimensions) avg[d.key] = t1.reduce((s, r) => s + (r.scores[d.key] ?? 0), 0) / t1.length;
    return avg;
  }, [lp]);

  const capability = deep?.reference.capabilityDetail.find((c) => c.partnerId === partner.id) as Record<string, unknown> | undefined;
  const rfiRow = deep?.rfi.find((r) => r.partner_id === partner.id);
  // Memoised so `econ` below doesn't recompute on every keystroke in the form:
  // the `?? {}` fallback minted a fresh object each render.
  const savedValues = useMemo(
    () => (rfiRow?.values ?? {}) as Record<string, string>,
    [rfiRow],
  );

  const econ = useMemo(() => {
    const vals = { ...savedValues, ...form };
    const find = (frag: string) => {
      const k = Object.keys(vals).find((key) => key.includes(frag));
      return k ? vals[k] : null;
    };
    const btc = find('btc'); const majors = find('majors'); const alt = find('alt');
    if (!btc && !majors && !alt) return null;
    return rfiEconomics(
      {
        partnerId: partner.id, label: partner.name,
        btcEthSpreadBps: btc, majorsSpreadBps: majors, altSpreadBps: alt,
        credit: find('credit'), settlementCycle: find('settlement'), oes: find('oes'),
      },
      { btcEthPct: 60, majorsPct: 30, altsPct: 10, monthlyVolumeUsd: 10_000_000 },
    );
  }, [savedValues, form, partner]);

  const save = async () => {
    const changed = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''));
    setBusy(true);
    try {
      await recordRfi(partner.id, status, changed);
      toast('success', `RFI ${status} recorded — provenance ${status === 'signed' ? 'A1' : status === 'returned' ? 'B2' : 'logged'}`);
      setForm({});
      setRefresh((n) => n + 1);
    } catch (e) { toast('error', e instanceof Error ? e.message : 'RFI save failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`Partner dossier: ${partner.name}`}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-line bg-card p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-h3 font-bold text-navy">{partner.name}</h2>
          {rfiRow?.grade && <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-micro font-bold text-cyan-700 dark:text-cyan-300">{rfiRow.grade}</span>}
          <button onClick={onClose} className="text-grey hover:text-navy" aria-label="Close"><X size={16} /></button>
        </div>
        <p className="mb-3 text-micro text-grey">{partner.type}{partner.subtype ? ` · ${partner.subtype}` : ''}{partner.tier ? ` · ${partner.tier}` : ''}</p>

        {row && lp && tier1Avg && (
          <section className="mb-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey"><RadarIcon size={11} /> Capability radar vs Tier-1 average</div>
            <Radar dims={lp.dimensions.map((d) => d.label)} a={lp.dimensions.map((d) => row.scores[d.key] ?? 0)} b={lp.dimensions.map((d) => tier1Avg[d.key] ?? 0)} />
          </section>
        )}

        {capability && (
          <section className="mb-4">
            <div className="mb-1.5 text-micro font-bold uppercase tracking-wider text-grey">Capability detail</div>
            <div className="space-y-0.5 text-micro">
              {([['Model', 'model'], ['US entity', 'usEntity'], ['Assets', 'assetBreadth'], ['OTC', 'otcDesk'], ['RFQ', 'rfq'], ['Options', 'optionsFlow'], ['Settlement', 'settlement'], ['Serves exchanges', 'servesExchanges'], ['Backing', 'backing']] as const).map(([label, key]) => (
                capability[key] ? <p key={key} className="text-grey-dark"><span className="font-semibold text-navy">{label}:</span> {String(capability[key])}</p> : null
              ))}
              {deep && Array.isArray(capability.sourceRefs) && (
                <SourceChip refs={(capability.sourceRefs as string[])} sources={deep.reference.sources} grade={rfiRow?.grade ?? 'C3'} />
              )}
            </div>
          </section>
        )}

        {econ && (
          <section className="mb-4 rounded border border-cyan-500/30 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey"><Coins size={11} /> Effective cost (60/30/10 mix · $10M/mo illustrative)</div>
            <p className="text-label text-navy">
              Blended: <span className="font-mono font-bold">{econ.blendedBps != null ? `${econ.blendedBps} bps` : '—'}</span>
              {econ.monthlyCostUsd != null && <> · ≈ <span className="font-mono font-bold">${econ.monthlyCostUsd.toLocaleString()}</span>/mo</>}
              {' '}· quality <span className="font-mono font-bold">{econ.qualityScore}/5</span>
            </p>
            {econ.missing.length > 0 && <p className="mt-0.5 text-micro text-amber-600 dark:text-amber-400">Missing for mix: {econ.missing.join(', ')}</p>}
          </section>
        )}

        {deep && (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <FileText size={11} /> RFI — commercial terms ({rfiRow ? rfiRow.status : 'not issued'})
            </div>
            {/* RFI extractor (100X Phase 5.3): paste the LP's reply → AI prefills
                the form as a DIFF; nothing is written until Record RFI. */}
            <div className="mb-2">
              <textarea
                value={paste} onChange={(e) => setPaste(e.target.value)} rows={2}
                placeholder="Paste the LP's RFI reply email here → Extract prefills the fields for your review…"
                className="w-full rounded border border-line bg-card px-2 py-1 text-micro text-navy outline-none focus:border-cyan-500"
              />
              <Button size="xs" variant="secondary" disabled={!paste.trim() || extracting} onClick={() => {
                setExtracting(true);
                extractRfiText(paste).then((r) => {
                  /*
                   * WAS: 'No AI key — fill manually'. `extractRfiText` returns only
                   * `{ fields, usedLlm }`, so this screen genuinely does NOT know why no
                   * model answered — a missing key, a rate limit, a refusal and a network
                   * failure are one value here. Naming a key was an inference laundered
                   * into a certainty. Until this engine carries the outcome the operator
                   * engines now do, it says what it observed and no more.
                   */
                  if (!r.usedLlm) { toast('error', 'No AI extraction — fill manually (cause not reported by this engine)'); return; }
                  const n = Object.keys(r.fields).length;
                  setForm((f) => ({ ...f, ...r.fields }));
                  toast(n ? 'success' : 'info', n ? `Extracted ${n} fields — review, then Record RFI` : 'Nothing extractable found');
                }).catch(() => toast('error', 'Extraction failed')).finally(() => setExtracting(false));
              }}>{extracting ? 'Extracting…' : '🤖 Extract fields'}</Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {deep.reference.rfi.fields.map((f) => (
                <label key={f.key} className="text-[10px] text-grey">
                  <span className="block truncate" title={f.label}>{f.label}</span>
                  <input
                    value={form[f.key] ?? savedValues[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder="—"
                    className="mt-0.5 w-full rounded border border-line bg-card px-1.5 py-1 text-micro text-navy outline-none focus:border-cyan-500"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
                className="rounded border border-line bg-card px-1.5 py-1 text-micro text-navy">
                <option value="issued">issued</option>
                <option value="returned">returned (→ B2)</option>
                <option value="signed">signed (→ A1)</option>
              </select>
              <Button size="xs" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Record RFI'}</Button>
              <span className="text-[10px] text-grey">Governed write — audited, attributed, grade-laddered.</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Two-series SVG radar over N axes (0–5 scale). */
function Radar({ dims, a, b }: { dims: string[]; a: number[]; b: number[] }) {
  const N = dims.length;
  const cx = 110, cy = 95, R = 70;
  const pt = (i: number, v: number) => {
    const ang = (Math.PI * 2 * i) / N - Math.PI / 2;
    const r = (Math.min(v, 5) / 5) * R;
    return `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
  };
  const ring = (v: number) => Array.from({ length: N }, (_, i) => pt(i, v)).join(' ');
  return (
    <svg viewBox="0 0 220 190" className="w-full max-w-sm">
      {[1.25, 2.5, 3.75, 5].map((v) => <polygon key={v} points={ring(v)} fill="none" strokeWidth="0.5" className="stroke-line" />)}
      {dims.map((d, i) => {
        const ang = (Math.PI * 2 * i) / N - Math.PI / 2;
        return (
          <text key={d} x={cx + (R + 14) * Math.cos(ang)} y={cy + (R + 14) * Math.sin(ang)}
            textAnchor="middle" dominantBaseline="middle" className="fill-current text-grey" fontSize="5.5">
            {d.length > 14 ? d.slice(0, 13) + '…' : d}
          </text>
        );
      })}
      <polygon points={Array.from({ length: N }, (_, i) => pt(i, b[i] ?? 0)).join(' ')} className="fill-slate-400/15 stroke-slate-400" strokeWidth="1" />
      <polygon points={Array.from({ length: N }, (_, i) => pt(i, a[i] ?? 0)).join(' ')} className="fill-cyan-500/20 stroke-cyan-500" strokeWidth="1.5" />
    </svg>
  );
}
