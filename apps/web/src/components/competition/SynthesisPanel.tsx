import { useMemo } from 'react';
import { competitors as allCompetitors, states, products } from '@/data';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  Swords,
  Eye,
  Crosshair,
  TrendingUp,
  Zap,
  ChevronRight,
} from 'lucide-react';

interface VulnerabilityItem {
  competitor: string;
  issue: string;
  severity: 'critical' | 'high' | 'medium';
}

interface StateGap {
  stateAbbr: string;
  stateName: string;
  missingCompetitors: string[];
  population: string;
  lcxPhase: string;
}

interface WatchItem {
  competitor: string;
  move: string;
  riskStatement: string;
  urgency: 'high' | 'medium' | 'low';
}

function VulnerabilityCard({ items, stateGaps }: { items: VulnerabilityItem[]; stateGaps: StateGap[] }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] dark:bg-red-500/[0.02] p-4 space-y-3.5">
      <div className="flex items-center gap-2">
        <div className="rounded bg-red-100 dark:bg-red-950/30 p-1.5">
          <Crosshair size={14} className="text-red-600 dark:text-red-400" />
        </div>
        <h3 className="font-bold text-sm text-navy dark:text-ice">Where They Are Vulnerable</h3>
      </div>

      <div className="space-y-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-grey">
          Active Legal &amp; Regulatory Risks
        </span>
        {items.map(item => (
          <div
            key={item.competitor + item.issue.slice(0, 20)}
            className={clsx(
              'flex items-start gap-2 p-2 rounded border text-[10px] leading-snug',
              item.severity === 'critical'
                ? 'border-red-500/30 bg-red-500/[0.04]'
                : item.severity === 'high'
                ? 'border-orange-500/20 bg-orange-500/[0.03]'
                : 'border-amber-500/15 bg-amber-500/[0.02]'
            )}
          >
            <AlertTriangle
              size={12}
              className={clsx(
                'shrink-0 mt-0.5',
                item.severity === 'critical' ? 'text-red-500' : item.severity === 'high' ? 'text-orange-500' : 'text-amber-500'
              )}
            />
            <div>
              <span className="font-bold">{item.competitor}</span>
              <span className="text-grey-dark dark:text-grey-light"> — {item.issue}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-[10px] text-grey italic px-2">No active legal vulnerabilities detected among monitored competitors.</p>
        )}
      </div>

      <div className="space-y-2 pt-1 border-t border-line">
        <span className="text-[9px] font-bold uppercase tracking-wider text-grey">
          State MTL Gaps — Opportunity Zones for LCX
        </span>
        <div className="grid grid-cols-1 gap-1.5">
          {stateGaps.map(gap => (
            <div
              key={gap.stateAbbr}
              className="flex items-center justify-between p-2 rounded border border-emerald-500/15 bg-emerald-500/[0.03] text-[10px]"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {gap.stateAbbr}
                </span>
                <span className="text-grey-dark dark:text-grey-light">{gap.stateName}</span>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="text-[9px] text-grey">
                  {gap.missingCompetitors.join(', ')} not present
                </span>
                <span className="text-[9px] font-mono text-grey">{gap.population}</span>
                <span className="text-[8px] bg-cyan-100 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400 px-1 py-0.5 rounded font-bold">
                  LCX {gap.lcxPhase}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AsymmetryCard({ advantages }: { advantages: string[] }) {
  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.03] dark:bg-cyan-500/[0.02] p-4 space-y-3.5">
      <div className="flex items-center gap-2">
        <div className="rounded bg-cyan-100 dark:bg-cyan-950/30 p-1.5">
          <Swords size={14} className="text-cyan-600 dark:text-cyan-400" />
        </div>
        <h3 className="font-bold text-sm text-navy dark:text-ice">Where LCX Has Asymmetric Advantage</h3>
      </div>

      <div className="space-y-2">
        {advantages.map((adv, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 p-2 rounded border border-cyan-500/15 bg-cyan-500/[0.02] text-[10px] leading-snug"
          >
            <div className="rounded-full bg-cyan-100 dark:bg-cyan-950/40 p-0.5 mt-0.5 shrink-0">
              <ChevronRight size={10} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <span className="text-grey-dark dark:text-grey-light">{adv}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WatchlistCard({ items }: { items: WatchItem[] }) {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] dark:bg-amber-500/[0.02] p-4 space-y-3.5">
      <div className="flex items-center gap-2">
        <div className="rounded bg-amber-100 dark:bg-amber-950/30 p-1.5">
          <Eye size={14} className="text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="font-bold text-sm text-navy dark:text-ice">Watchlist — Competitors to Monitor</h3>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.competitor + item.move.slice(0, 20)}
            className={clsx(
              'flex items-start gap-2.5 p-2.5 rounded border text-[10px] leading-snug',
              item.urgency === 'high'
                ? 'border-amber-500/25 bg-amber-500/[0.04]'
                : item.urgency === 'medium'
                ? 'border-amber-400/15 bg-amber-400/[0.02]'
                : 'border-slate-300/30 bg-slate-500/[0.01]'
            )}
          >
            <div className={clsx(
              'rounded p-0.5 mt-0.5 shrink-0',
              item.urgency === 'high' ? 'bg-amber-100 dark:bg-amber-950/30' :
              item.urgency === 'medium' ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-slate-100 dark:bg-slate-800'
            )}>
              {item.urgency === 'high' ? (
                <Zap size={10} className="text-amber-600 dark:text-amber-400" />
              ) : item.urgency === 'medium' ? (
                <TrendingUp size={10} className="text-amber-500 dark:text-amber-400" />
              ) : (
                <Eye size={10} className="text-slate-500" />
              )}
            </div>
            <div className="flex-1">
              <span className="font-bold text-navy dark:text-ice">{item.competitor}</span>
              <span className="text-grey-dark dark:text-grey-light"> — {item.move}</span>
              <p className="text-[9px] text-grey mt-1 leading-snug italic">{item.riskStatement}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SynthesisPanel() {
  const vulnerabilities = useMemo((): VulnerabilityItem[] => {
    const items: VulnerabilityItem[] = [];

    allCompetitors.forEach(c => {
      const activeLegal = c.legalHistory.filter(
        e => e.status === 'Ongoing' || (e.severity === 'Criminal' && e.year >= 2023)
      );
      activeLegal.forEach(e => {
        items.push({
          competitor: c.name,
          issue: `${e.event.slice(0, 90)}${e.event.length > 90 ? '…' : ''} [${e.status}]`,
          severity: e.severity === 'Criminal' ? 'critical' : e.severity === 'Lawsuit' ? 'high' : 'medium',
        });
      });
    });

    return items;
  }, []);

  const stateGaps = useMemo((): StateGap[] => {
    const gaps: StateGap[] = [];
    const researched = states.filter(s => s.tier !== 'Unresearched');
    const topCompetitors = ['coinbase', 'kraken', 'robinhood', 'gemini'];

    const populationMap: Record<string, string> = {
      NY: '19.6M', CA: '39.0M', TX: '30.5M', FL: '22.6M', IL: '12.5M',
      PA: '13.0M', MA: '7.0M', WA: '7.8M', CO: '5.8M', NV: '3.2M',
      UT: '3.4M', MT: '1.1M', NH: '1.4M', WY: '0.6M',
    };

    researched.forEach(s => {
      const missing: string[] = [];
      topCompetitors.forEach(id => {
        const c = allCompetitors.find(x => x.id === id);
        if (c && !c.statePresence.includes(s.abbreviation)) {
          missing.push(c.name);
        }
      });

      if (missing.length >= 2) {
        const lcxPhase = s.phase.includes('Phase 1') ? 'P1' :
          s.phase.includes('Phase 2') ? 'P2' :
          s.phase.includes('Phase 3') ? 'P3' : 'PL';

        gaps.push({
          stateAbbr: s.abbreviation,
          stateName: s.name,
          missingCompetitors: missing,
          population: populationMap[s.abbreviation] || '?',
          lcxPhase,
        });
      }
    });

    return gaps.slice(0, 5);
  }, []);

  const advantages = useMemo((): string[] => {
    const advs: string[] = [];
    const lcxAvgHowey = products
      .map(p => p.howeyScore ?? 0)
      .filter(s => s > 0)
      .reduce((a, b) => a + b, 0) / products.filter(p => (p.howeyScore ?? 0) > 0).length;
    const competitorAvgHowey = allCompetitors
      .filter(c => c.howeyProfile.avgScore > 0)
      .reduce((a, c) => a + c.howeyProfile.avgScore, 0) / allCompetitors.filter(c => c.howeyProfile.avgScore > 0).length;

    advs.push(
      `Liechtenstein MiCA passport (when reciprocated under SPDI equivalence or bilateral agreement) creates a unique EU+US regulatory foundation. No existing competitor — not Coinbase, not Kraken, not Gemini — holds both EU MiCA authorization AND a U.S. non-custodial model operating under federal MSB-only requirements.`,
    );

    advs.push(
      `LCX's average listed-asset Howey score (${Math.round(lcxAvgHowey)}%) sits below the competitor average (${Math.round(competitorAvgHowey)}%), driven by conservative BTC/ETH anchor positions and a deliberate exclusion of tokens with securities risk. This reduces SEC exposure during Phase 1–2 while competitors face Wells notices and enforcement actions over broader listings.`,
    );

    advs.push(
      `Non-custodial Phase 1 entry through MT, NH, CO, and UT requires zero state MTLs — only federal FinCEN MSB registration. This is the same playbook Kraken used to scale, but LCX adds the Liechtenstein MiCA backstop that Kraken lacked during its 2011–2015 growth. The combination of low-regulatory-friction entry + European regulatory credibility is unique.`,
    );

    const spdiCompetitors = allCompetitors.filter(c => c.licenses.spdiCharter);
    const euMiCACompetitors = allCompetitors.filter(c => c.licenses.euMiCA);

    if (spdiCompetitors.length <= 1) {
      advs.push(
        `Only Kraken holds a Wyoming SPDI bank charter among major U.S. exchanges. LCX's Option B (SPDI Custody) target directly competes in this nearly uncontested regulatory lane — a trust charter that enables NY service without BitLicense, custody under banking law rather than MTL law, and institutional credibility that pure-MTL competitors cannot match.`,
      );
    }

    if (euMiCACompetitors.length <= 2) {
      advs.push(
        `Only ${euMiCACompetitors.length} competitor${euMiCACompetitors.length !== 1 ? 's' : ''} among the analyzed set ${euMiCACompetitors.length === 0 ? 'hold' : 'holds'} EU MiCA authorization. LCX's Liechtenstein domicile provides native MiCA access without needing to acquire a separate EU entity — a structural cost advantage over U.S.-native exchanges that must build EU operations from scratch.`,
      );
    }

    return advs;
  }, []);

  const watchItems = useMemo((): WatchItem[] => {
    const items: WatchItem[] = [];

    const cryptoCom = allCompetitors.find(c => c.id === 'crypto_com');
    if (cryptoCom?.licenses.occTrustCharter) {
      items.push({
        competitor: 'Crypto.com',
        move: 'Conditional OCC national trust bank charter (Feb 2026) + CFTC DCO license + Washington DC office near White House.',
        riskStatement: 'If the OCC trust charter is finalized, Crypto.com becomes a federally regulated crypto custodian — a tier above state-level MTL operators. Paired with their $700M brand presence and 100M global users, this could make them the most formidable US competitor within 18 months.',
        urgency: 'high',
      });
    }

    const okx = allCompetitors.find(c => c.id === 'okx');
    if (okx) {
      items.push({
        competitor: 'OKX',
        move: `Re-launched US operations April 2025 after $500M DOJ settlement. ICE (NYSE parent) invested at $25B valuation (March 2026).`,
        riskStatement: 'OKX has institutional credibility from NYSE parent backing, a massive global liquidity pool, and is aggressively hiring US compliance talent. A CLARITY Act passage would accelerate their MTL build-out from 3-5 years to 1-2 years.',
        urgency: 'high',
      });
    }

    const kraken = allCompetitors.find(c => c.id === 'kraken');
    if (kraken) {
      items.push({
        competitor: 'Kraken',
        move: 'IPO expected early 2026. Acquired NinjaTrader ($1.5B) and Bitnomial ($550M). Now holds all three CFTC licenses (DCM/DCO/FCM).',
        riskStatement: 'Post-IPO capital will fuel aggressive US/global expansion. Kraken now offers stocks, ETFs, tokenized equities, futures, and crypto — becoming a full-service financial platform that competes with Robinhood and Coinbase simultaneously.',
        urgency: 'high',
      });
    }

    const robinhood = allCompetitors.find(c => c.id === 'robinhood');
    if (robinhood) {
      items.push({
        competitor: 'Robinhood / Bitstamp',
        move: 'Completed Bitstamp acquisition ($200M, June 2025). Now holds EU Payment Institution License + full EU passporting.',
        riskStatement: 'Robinhood\'s 27.4M funded customers + Bitstamp\'s EU license creates a transatlantic crypto platform. MiFID + MiCA licenses give them EU regulatory coverage that most US-native exchanges lack. Bitstamp\'s institutional relationships accelerate Robinhood\'s crypto business beyond retail.',
        urgency: 'medium',
      });
    }

    return items;
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-navy dark:text-ice">Threat &amp; Opportunity Synthesis</h2>
        <p className="text-xs text-grey-dark dark:text-grey-light mt-0.5">
          Executive-grade strategic assessment. Computed dynamically from competitive intelligence data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <VulnerabilityCard items={vulnerabilities} stateGaps={stateGaps} />
        <div className="md:col-span-2 space-y-4">
          <AsymmetryCard advantages={advantages} />
          <WatchlistCard items={watchItems} />
        </div>
      </div>
    </div>
  );
}
