import { useMemo } from 'react';
import USAMap from 'react-usa-map';
import { competitors as allCompetitors, states as allStates } from '@/data';
import { useFilterStore } from '@/stores';
import { InspectorDrawer } from '@/components/ui';
import {
  LegalSeverity,
  ClarityActPosition,
} from '@/types/competitors';
import { computeAllScores } from '@/lib/competitiveScoring';
import { clsx } from 'clsx';
import {
  Building2,
  Users,
  DollarSign,
  BarChart3,
  Shield,
  ShieldAlert,
  Scale,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Swords,
  Globe,
  Landmark,
} from 'lucide-react';

const severityColorMap: Record<LegalSeverity, string> = {
  Resolution: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/20',
  Fine: 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20',
  Settlement: 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20',
  Lawsuit: 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20',
  Criminal: 'border-red-500 bg-red-100 dark:border-red-400 dark:bg-red-900/40',
};

const severityIconMap: Record<LegalSeverity, React.ElementType> = {
  Resolution: CheckCircle2,
  Fine: DollarSign,
  Settlement: Scale,
  Lawsuit: AlertTriangle,
  Criminal: ShieldAlert,
};

const severityLabelMap: Record<LegalSeverity, string> = {
  Resolution: 'Resolution',
  Fine: 'Fine',
  Settlement: 'Settlement',
  Lawsuit: 'Lawsuit',
  Criminal: 'Criminal',
};

const statusColorMap: Record<string, string> = {
  public: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800',
  private: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800',
  blocked: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800',
  defunct: 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
};

const clarityLabelMap: Record<ClarityActPosition, string> = {
  strong_beneficiary: 'Strong Beneficiary',
  moderate: 'Moderate',
  minimal: 'Minimal',
  irrelevant: 'Irrelevant',
  blocked: 'Blocked',
};

const clarityColorMap: Record<ClarityActPosition, string> = {
  strong_beneficiary: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
  moderate: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800',
  minimal: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  irrelevant: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-500 dark:border-slate-700',
  blocked: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800',
};

function LicenseBadge({ active, label, icon: Icon }: { active: boolean; label: string; icon: React.ElementType }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors',
        active
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400'
          : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900/20 dark:border-slate-700 dark:text-slate-600'
      )}
    >
      <Icon size={12} className={active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-600'} />
      <span>{label}</span>
    </div>
  );
}

function MetricsCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-ice-soft/20 dark:bg-ice-soft/5 p-2.5 flex items-center gap-2.5 min-w-0">
      <div className="rounded p-1.5 text-navy dark:text-ice shrink-0">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold font-mono text-navy dark:text-ice truncate">{value}</div>
        <div className="text-[9px] text-grey uppercase font-bold">{label}</div>
      </div>
    </div>
  );
}

interface CompetitorInspectorProps {
  competitorId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CompetitorInspector({ competitorId, isOpen, onClose }: CompetitorInspectorProps) {
  const { clarityEnacted } = useFilterStore();
  const competitor = useMemo(
    () => allCompetitors.find(c => c.id === competitorId) ?? null,
    [competitorId],
  );

  const scores = useMemo(() => computeAllScores(allCompetitors), []);
  const score = useMemo(
    () => competitor ? scores.find(s => s.id === competitor.id) ?? null : null,
    [competitor, scores],
  );

  const mapConfig = useMemo(() => {
    const config: Record<string, { fill?: string; clickHandler?: () => void }> = {};
    const presenceSet = new Set(competitor?.statePresence || []);
    const researchedSet = new Set(allStates.filter(s => s.tier !== 'Unresearched').map(s => s.id));

    allStates.forEach(s => {
      let fill: string;
      const isPreempted = clarityEnacted && s.nmlsRequired;

      if (presenceSet.has(s.id)) {
        fill = '#1e7a4a';
      } else if (isPreempted) {
        fill = '#06b6d4';
      } else if (researchedSet.has(s.id)) {
        fill = 'rgba(160, 50, 53, 0.35)';
      } else {
        fill = 'rgba(148, 163, 184, 0.12)';
      }
      config[s.abbreviation] = { fill };
    });

    return config;
  }, [competitor, clarityEnacted]);

  const sortedLegalHistory = useMemo(() => {
    if (!competitor) return [];
    return [...competitor.legalHistory].sort((a, b) => b.year - a.year);
  }, [competitor]);

  if (!competitor) return null;

  const title = competitor.name;

  return (
    <InspectorDrawer isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-5 text-xs leading-relaxed text-navy dark:text-ice">

        {/* SECTION 0: Company Header */}
        <div className="space-y-2 pb-3 border-b border-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h3 className="font-bold text-base text-navy dark:text-ice">{competitor.name}</h3>
              {competitor.ticker && (
                <span className="text-[11px] font-mono font-bold text-grey bg-ice-soft dark:bg-navy-deep px-1.5 py-0.5 rounded">
                  {competitor.ticker}
                </span>
              )}
            </div>
            <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase', statusColorMap[competitor.status])}>
              {competitor.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-grey">
            <span className="flex items-center gap-1"><MapPin size={10} />{competitor.hq}</span>
            <span className="flex items-center gap-1"><Clock size={10} />Founded {competitor.founded}</span>
            {competitor.financials.employees && (
              <span className="flex items-center gap-1"><Users size={10} />{competitor.financials.employees.toLocaleString()} employees</span>
            )}
            {competitor.financials.valuation && (
              <span className="flex items-center gap-1"><TrendingUp size={10} />{competitor.financials.valuation}</span>
            )}
          </div>

          {competitor.notes && (
            <p className="text-[10px] text-grey-dark dark:text-grey-light leading-snug italic border-l-2 border-line pl-2.5">
              {competitor.notes}
            </p>
          )}
        </div>

        {/* SECTION 1: Key Metrics Row */}
        <div className="space-y-1.5">
          <h4 className="text-[9px] font-bold uppercase tracking-wider text-grey">Key Metrics</h4>
          <div className="grid grid-cols-2 gap-2">
            <MetricsCard icon={Users} label="Users" value={competitor.users} />
            <MetricsCard
              icon={DollarSign}
              label={`Revenue (${competitor.financials.revenueYear})`}
              value={competitor.financials.revenue}
            />
            <MetricsCard icon={BarChart3} label="Quarterly Volume" value={competitor.financials.quarterlyVolume} />
            <MetricsCard icon={Building2} label="Custody Assets" value={competitor.financials.assetsOnPlatform} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <div className="text-center bg-ice-soft/20 dark:bg-navy-deep/10 rounded p-2">
              <div className="text-sm font-bold font-mono text-cyan-600 dark:text-cyan-400">
                {competitor.marketShare > 0 ? `${competitor.marketShare}%` : '—'}
              </div>
              <div className="text-[8px] text-grey uppercase font-bold">Est. US Share</div>
            </div>
            <div className="text-center bg-ice-soft/20 dark:bg-navy-deep/10 rounded p-2">
              <div className={clsx(
                'text-sm font-bold font-mono',
                competitor.howeyProfile.avgScore >= 35 ? 'text-status-blocked' :
                competitor.howeyProfile.avgScore >= 25 ? 'text-status-conditional' :
                'text-status-ready'
              )}>
                {competitor.howeyProfile.avgScore}%
              </div>
              <div className="text-[8px] text-grey uppercase font-bold">Avg Howey Score</div>
            </div>
            <div className="text-center bg-ice-soft/20 dark:bg-navy-deep/10 rounded p-2">
              <div className="text-sm font-bold font-mono text-navy dark:text-ice">
                {score ? score.regulatoryCoverage : '—'}
              </div>
              <div className="text-[8px] text-grey uppercase font-bold">Reg. Coverage</div>
            </div>
          </div>
        </div>

        {/* SECTION 2: License Coverage Map */}
        <div className="space-y-2 pt-1 border-t border-line">
          <h4 className="text-[9px] font-bold uppercase tracking-wider text-grey">
            MTL State Coverage ({competitor.statePresence.length}/50)
          </h4>

          <div className="rounded-lg border border-line bg-ice-soft/10 dark:bg-navy-deep/5 p-3 us-state-map">
            <div className="max-w-[280px] mx-auto select-none">
              <USAMap customize={mapConfig} />
            </div>
          </div>

          <div className="flex items-center gap-3 text-[9px]">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#1e7a4a] shrink-0" />
              <span className="text-grey">MTL held</span>
            </div>
            {clarityEnacted && (
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#06b6d4] shrink-0" />
                <span className="text-grey">Preempted (CLARITY)</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[rgba(160,50,53,0.35)] shrink-0" />
              <span className="text-grey">Not held (known)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[rgba(148,163,184,0.12)] shrink-0" />
              <span className="text-grey">Unknown/unresearched</span>
            </div>
          </div>
        </div>

        {/* SECTION 3: License Portfolio */}
        <div className="space-y-2 pt-1 border-t border-line">
          <h4 className="text-[9px] font-bold uppercase tracking-wider text-grey">License Portfolio</h4>
          <div className="grid grid-cols-2 gap-1.5">
            <LicenseBadge active={competitor.licenses.fincenMSB} label="FinCEN MSB" icon={Landmark} />
            <LicenseBadge active={competitor.licenses.bitLicense} label="NY BitLicense" icon={Shield} />
            <LicenseBadge active={competitor.licenses.spdiCharter} label="WY SPDI Charter" icon={Building2} />
            <LicenseBadge active={competitor.licenses.nyTrustCharter} label="NY Trust Charter" icon={Shield} />
            <LicenseBadge active={competitor.licenses.occTrustCharter} label="OCC Trust (Federal)" icon={Landmark} />
            <LicenseBadge active={competitor.licenses.finraBD} label="FINRA Broker-Dealer" icon={TrendingUp} />
            <LicenseBadge active={competitor.licenses.cfdtcDCO} label="CFTC DCO" icon={BarChart3} />
            <LicenseBadge active={competitor.licenses.euMiCA} label="EU MiCA" icon={Globe} />
          </div>
          {competitor.licenses.otherLicenses.length > 0 && (
            <div className="space-y-1 mt-1">
              <span className="text-[9px] font-bold uppercase text-grey block">Additional Licenses</span>
              {competitor.licenses.otherLicenses.map((l, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] text-grey-dark dark:text-grey-light">
                  <span className="text-cyan-500 shrink-0 mt-0.5">+</span>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 4: Legal History Timeline */}
        <div className="space-y-2.5 pt-1 border-t border-line">
          <div className="flex items-center justify-between">
            <h4 className="text-[9px] font-bold uppercase tracking-wider text-grey">Legal History</h4>
            <span className="text-[9px] font-mono text-grey">
              {competitor.legalHistory.filter(e => e.severity === 'Criminal' || e.severity === 'Lawsuit').length > 0
                ? '⚠ Significant regulatory history'
                : competitor.legalHistory.length > 0
                ? 'Minor regulatory record'
                : 'Clean record'}
            </span>
          </div>

          {sortedLegalHistory.length === 0 ? (
            <p className="text-[10px] text-grey italic">No known regulatory actions.</p>
          ) : (
            <div className="relative pl-5 space-y-0">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-line" />
              {sortedLegalHistory.map((event, idx) => {
                const Icon = severityIconMap[event.severity];
                const colors = severityColorMap[event.severity];
                return (
                  <div key={event.id || idx} className={clsx('relative pb-4 last:pb-0', idx === sortedLegalHistory.length - 1 && 'pb-0')}>
                    <div className={clsx(
                      'absolute left-[-1.15rem] top-1 h-3.5 w-3.5 rounded-full border-2 z-10 flex items-center justify-center',
                      colors,
                    )}>
                      <div className={clsx(
                        'h-1.5 w-1.5 rounded-full',
                        event.severity === 'Criminal' ? 'bg-red-500' :
                        event.severity === 'Lawsuit' ? 'bg-red-400' :
                        event.severity === 'Settlement' ? 'bg-orange-400' :
                        event.severity === 'Fine' ? 'bg-amber-400' :
                        'bg-slate-400'
                      )} />
                    </div>

                    <div className={clsx('rounded-lg border p-2.5', colors)}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <Icon size={11} className={
                            event.severity === 'Criminal' ? 'text-red-600 dark:text-red-400' :
                            event.severity === 'Lawsuit' ? 'text-red-500 dark:text-red-400' :
                            event.severity === 'Settlement' ? 'text-orange-500 dark:text-orange-400' :
                            event.severity === 'Fine' ? 'text-amber-600 dark:text-amber-400' :
                            'text-slate-500'
                          } />
                          <span className="text-[9px] font-bold uppercase">{severityLabelMap[event.severity]}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono text-grey">{event.year}</span>
                          <span className={clsx(
                            'text-[8px] font-bold uppercase px-1 rounded',
                            event.status === 'Ongoing'
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                          )}>
                            {event.status}
                          </span>
                        </div>
                      </div>

                      <p className="text-[10px] font-semibold leading-snug mb-1">{event.event}</p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-grey">
                        <span className="font-mono font-bold">{event.regulator}</span>
                        {event.amount && (
                          <span className="font-mono text-status-blocked font-bold">{event.amount}</span>
                        )}
                      </div>

                      <p className="text-[9px] text-grey-dark dark:text-grey-light mt-1 leading-snug">
                        <strong>Outcome:</strong> {event.outcome}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 5: CLARITY Act Impact */}
        <div className="space-y-2 pt-1 border-t border-line">
          <h4 className="text-[9px] font-bold uppercase tracking-wider text-grey">CLARITY Act Assessment</h4>

          <div className={clsx('rounded-lg border p-3', clarityColorMap[competitor.clarityAct.position])}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase">
                {clarityLabelMap[competitor.clarityAct.position]}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
              <div>
                <span className="text-grey block text-[8px] uppercase font-bold">Pre-CLARITY MTLs</span>
                <span className="font-mono font-bold">{competitor.clarityAct.preClarityMTLCount}/50</span>
              </div>
              <div>
                <span className="text-grey block text-[8px] uppercase font-bold">Post-CLARITY MTLs</span>
                <span className="font-mono font-bold text-status-ready">{competitor.clarityAct.postClarityMTLCount}/50</span>
              </div>
            </div>

            <div className="text-[10px] space-y-1">
              <div className="flex items-start gap-1.5">
                <DollarSign size={11} className="text-grey shrink-0 mt-0.5" />
                <span><strong className="text-grey">Cost savings:</strong> {competitor.clarityAct.costSavingsEstimate}</span>
              </div>
              <div className="flex items-start gap-1.5">
                <Swords size={11} className="text-grey shrink-0 mt-0.5" />
                <span><strong className="text-grey">Strategic shift:</strong> {competitor.clarityAct.strategicShift}</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 6: Howey & Listing Profile */}
        <div className="space-y-2 pt-1 border-t border-line">
          <h4 className="text-[9px] font-bold uppercase tracking-wider text-grey">Token Risk Profile</h4>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-grey block text-[8px] uppercase font-bold">Avg Howey Score</span>
              <span className={clsx('font-mono font-bold',
                competitor.howeyProfile.avgScore >= 35 ? 'text-status-blocked' :
                competitor.howeyProfile.avgScore >= 25 ? 'text-status-conditional' :
                'text-status-ready'
              )}>{competitor.howeyProfile.avgScore}%</span>
            </div>
            <div>
              <span className="text-grey block text-[8px] uppercase font-bold">Listing Strategy</span>
              <span className="font-mono font-bold text-navy dark:text-ice">{competitor.howeyProfile.listingStrategy}</span>
            </div>
            <div className="col-span-2">
              <span className="text-grey block text-[8px] uppercase font-bold">Lowest / Highest Risk</span>
              <span className="text-[10px]">{competitor.howeyProfile.lowestScoreAsset} → {competitor.howeyProfile.highestScoreAsset}</span>
            </div>
          </div>
          <p className="text-[10px] text-grey-dark dark:text-grey-light leading-snug italic">
            {competitor.howeyProfile.notes}
          </p>
        </div>

        {/* SECTION 7: LCX Strategic Implications */}
        <div className="space-y-2 pt-1 border-t border-line">
          <h4 className="text-[9px] font-bold uppercase tracking-wider text-grey flex items-center gap-1.5">
            <Swords size={11} className="text-cyan-500" />
            LCX Strategic Assessment
          </h4>

          <div className="space-y-2.5">
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] dark:bg-red-500/[0.02] p-2.5">
              <h5 className="text-[9px] font-bold uppercase text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                <AlertTriangle size={10} /> Vulnerability
              </h5>
              <p className="text-[10px] leading-snug text-grey-dark dark:text-grey-light">{competitor.insights.vulnerability}</p>
            </div>

            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.03] dark:bg-cyan-500/[0.02] p-2.5">
              <h5 className="text-[9px] font-bold uppercase text-cyan-600 dark:text-cyan-400 mb-1 flex items-center gap-1">
                <Swords size={10} /> Asymmetric Advantage
              </h5>
              <p className="text-[10px] leading-snug text-grey-dark dark:text-grey-light">{competitor.insights.asymmetry}</p>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] dark:bg-amber-500/[0.02] p-2.5">
              <h5 className="text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                <Globe size={10} /> Watchlist Item
              </h5>
              <p className="text-[10px] leading-snug text-grey-dark dark:text-grey-light">{competitor.insights.watchItem}</p>
            </div>
          </div>
        </div>

      </div>
    </InspectorDrawer>
  );
}
