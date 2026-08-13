import { useState, useMemo, useEffect } from 'react';
import { states, products, requirements, redFlags } from '@/data';
import {
  NarrativeGap,
  useStateNarrativeTable,
  type StateNarrativeTableRead,
} from '@/data/stateNarrative';
import { useAuditStore } from '@/stores/useAuditStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { FileText, Printer, Sliders, CheckSquare, ShieldAlert, Award, FileCode, Check } from 'lucide-react';
import { PageTitle, SectionLabel, Button } from '@/components/ui';
import { clsx } from 'clsx';
import {
  aggregateRefusalLine,
  bandDisplay,
  maxMoneyBand,
  moneyDisplay,
  parseMoney,
  sourceLabel,
  sumMoneyBand,
  type MoneyAggregateRefusalCode,
  type MoneyBandTotal,
} from '@/lib/money';
import {
  cohortTimelineBand,
  parseTimeline,
  timelineBandCell,
  type ParsedTimeline,
} from '@/lib/formatting';
import { computeSelectionDigest, type DigestResult } from '@/lib/compliance';

/**
 * This page had three separate money parsers and a fabricated cryptographic
 * digest. What it printed, to the addressees named in memoHeader below (the
 * board, state regulators, the SEC):
 *
 *   - '$100,000-$500,000' as $100,000,500,000 — the two ends concatenated.
 *   - a $100,000 statutory minimum net worth for the eight states whose
 *     recorded minimum is '$0', because `parseInt(...) || 100000` treats a real
 *     zero as absent.
 *   - a default $15,000 licence fee for any state with no recorded cost.
 *   - 'Signature Digest: sha256_…' over a djb2 hash, beside a hardcoded
 *     'Verification Authority: sha256_e8d21b37' that was identical on every
 *     brief ever printed.
 *
 * All of it is gone. Parsing lives in lib/money.ts, the digest is real or
 * absent, and a figure that cannot be valued prints as the string somebody
 * actually recorded.
 */

/** One state's row in the ledger. Figures are parse results, not numbers. */
interface LedgerMember {
  abbr: string;
  name: string;
  regulator: string;
  nmlsRequired: boolean;
  /** The effective source strings after preemption — the row and the cohort
   *  aggregate read the same string, so they can never disagree. */
  feeSource: string;
  bondSource: string;
  netWorthSource: string;
  timeline: ParsedTimeline;
  clarityPreempted: boolean;
}

/** A band prints as a band; a refusal prints its codes. Never a bare number. */
function bandCell(total: MoneyBandTotal): string {
  return total.kind === 'band'
    ? bandDisplay(total.lowCents, total.highCents)
    : aggregateRefusalLine(total.refusals);
}

/**
 * One refusal as the ledger reports it, merged across the three money columns.
 *
 * The two counts are SEPARATE and that is the whole point. The previous version
 * merged refusals from the fee, bond and net-worth columns into one bucket keyed
 * by code, then printed the merged `unvaluedCount` — a count of FIGURES — with
 * the label "of N jurisdictions". Selecting New York alone, whose estCost
 * '$500K+' and suretyBond '$150,000+' are both open-ended, printed
 * "(2 of 1 jurisdictions)" on a memo whose default addressees are the Board,
 * state regulators and the SEC. A ratio that cannot exist tells the reader the
 * ledger does not know what it is counting.
 */
interface LedgerRefusal {
  code: MoneyAggregateRefusalCode;
  rule: string;
  /** Figures across all three money columns that carry this refusal. */
  figureCount: number;
  /** Distinct jurisdictions contributing at least one such figure. */
  memberAbbrs: string[];
  /** The recorded strings, deduped, with an absent field labelled. */
  sources: string[];
}

/**
 * FOUR OUTCOMES IN ONE TABLE CELL, and the three that are not the note itself are different
 * sentences. The one this exists to prevent is the cheapest: printing `NOT RECORDED` — a
 * statement about the dataset — because a network fetch had not finished. `NOT RECORDED` is a
 * true claim for 5 of the 50 jurisdictions and a false one for the other 45.
 */
function sandboxCell(read: StateNarrativeTableRead, abbreviation: string): string {
  if (read.state !== 'ready') return 'NOT LOADED';
  const entry = read.table[abbreviation];
  if (entry === undefined) return 'NARRATIVE MISSING FOR THIS JURISDICTION';
  return entry.sandboxNotes || 'NOT RECORDED';
}

export function BriefGenerator() {
  const { committedArchitecture, addAuditLog, auditLogs } = useAuditStore();
  const { clarityEnacted, spdiEquivalence } = useFilterStore();
  /* The memo's exemption column is prose and no longer rides in the entry chunk. */
  const narrativeTable = useStateNarrativeTable();

  // Control Panel Options
  const [selectedTemplate, setSelectedTemplate] = useState<'exec' | 'state' | 'sec'>('exec');
  const [selectedStates, setSelectedStates] = useState<string[]>(['MT', 'WY', 'TX', 'CA']);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(['CUSTODY', 'LCX_TOKEN']);

  // Document Customization Overrides
  const [subjectOverride, setSubjectOverride] = useState('');
  const [toOverride, setToOverride] = useState('');
  const [fromOverride, setFromOverride] = useState('');
  const [dateOverride, setDateOverride] = useState('');
  
  // Signatory & Stamp configurations
  const [signatoryName, setSignatoryName] = useState('Chief Compliance Officer, LCX USA');
  const [signatoryTitle, setSignatoryTitle] = useState('Chief Compliance Officer, LCX USA');
  const [coSignerName, setCoSignerName] = useState('');
  const [coSignerTitle, setCoSignerTitle] = useState('');

  // Visibility Toggles
  const [showWatermark, setShowWatermark] = useState(true);
  const [showRequirementsTable, setShowRequirementsTable] = useState(true);
  const [showRisksTable, setShowRisksTable] = useState(true);
  const [showHoweyMatrix, setShowHoweyMatrix] = useState(true);
  const [showAuditLogsAnnex, setShowAuditLogsAnnex] = useState(true);

  // Bulk selectors
  const handleSelectPhase1 = () => {
    const p1 = states.filter(s => s.phase === 'Phase 1' && s.tier !== 'Unresearched').map(s => s.abbreviation);
    setSelectedStates(p1);
    addAuditLog('Brief Generator: CCO selected all Phase 1 jurisdictions.', 'System');
  };

  const handleSelectNmls = () => {
    const nmls = states.filter(s => s.nmlsRequired && s.tier !== 'Unresearched').map(s => s.abbreviation);
    setSelectedStates(nmls);
    addAuditLog('Brief Generator: CCO selected all NMLS-regulated jurisdictions.', 'System');
  };

  const handleClearStates = () => {
    setSelectedStates([]);
    addAuditLog('Brief Generator: CCO cleared state cohort selection.', 'System');
  };

  const handleToggleState = (abbr: string) => {
    setSelectedStates(prev => {
      const next = prev.includes(abbr) ? prev.filter(x => x !== abbr) : [...prev, abbr];
      addAuditLog(`Brief Generator: CCO toggled state cohort: ${abbr}`, 'System');
      return next;
    });
  };

  const handleToggleProduct = (id: string) => {
    setSelectedProducts(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      addAuditLog(`Brief Generator: CCO toggled listed asset scope: ${id}`, 'System');
      return next;
    });
  };

  const activeStates = useMemo(() => {
    return states.filter(s => selectedStates.includes(s.abbreviation));
  }, [selectedStates]);

  const activeProducts = useMemo(() => {
    return products.filter(p => selectedProducts.includes(p.id));
  }, [selectedProducts]);

  // Dynamic Gating Requirements based on active selections
  const activeRequirements = useMemo(() => {
    const reqIds = new Set<string>();
    activeProducts.forEach(p => {
      if (p.requirements) {
        p.requirements.forEach(r => reqIds.add(r));
      }
    });

    if (activeStates.some(s => s.nmlsRequired)) {
      reqIds.add('STATE_MTL');
    }
    if (activeStates.some(s => s.abbreviation === 'NY')) {
      reqIds.add('NY_BITLICENSE_REQ');
    }
    if (activeStates.some(s => s.abbreviation === 'CA')) {
      reqIds.add('CA_DFAL_REQ');
    }

    // Baseline requirements
    reqIds.add('MSB_REG');
    reqIds.add('SANCTIONS_SCREENING');

    return requirements.filter(r => reqIds.has(r.id));
  }, [activeProducts, activeStates]);

  // Dynamic Red Flags warnings based on active selections
  const activeRedFlags = useMemo(() => {
    const flags = new Set<string>();
    activeProducts.forEach(p => {
      if (p.id === 'LCX_TOKEN') flags.add('lcx_token_securities');
      if (p.id === 'STABLECOIN_RAILS') flags.add('stablecoin_issuance');
      if (p.id === 'NONCUSTODIAL_WALLET') flags.add('custody_control');
    });

    if (activeStates.some(s => s.abbreviation === 'NY')) {
      flags.add('ny_premature_entry');
    }

    // Default baseline flags
    flags.add('entity_status');
    flags.add('mica_conflation');

    return redFlags.filter(rf => flags.has(rf.id));
  }, [activeProducts, activeStates]);

  // Dynamic budget comparison ledger. Every figure is a parse result carried
  // whole; nothing here reduces a range or an open-ended floor to a number.
  const ledger = useMemo(() => {
    // A preemption sets a figure to zero as a matter of law, so it is a real
    // '$0' and is written as one. It is not a missing figure.
    const PREEMPTED = '$0';

    const members: LedgerMember[] = activeStates.map(s => {
      const clarityPreempted = clarityEnacted && s.nmlsRequired;
      const spdiPreempted = s.abbreviation === 'NY' && spdiEquivalence;
      const preempted = clarityPreempted || spdiPreempted;
      return {
        abbr: s.abbreviation,
        name: s.name,
        regulator: s.regulator || 'NOT RECORDED',
        nmlsRequired: s.nmlsRequired,
        feeSource: preempted ? PREEMPTED : s.estCost ?? '',
        bondSource: preempted ? PREEMPTED : s.suretyBond ?? '',
        // CLARITY preempts the licence, not the capital requirement, so only
        // SPDI reciprocity clears a net worth figure here. That asymmetry is
        // inherited from the original and is deliberate.
        netWorthSource: spdiPreempted ? PREEMPTED : s.minNetWorth ?? '',
        timeline: clarityPreempted
          ? { kind: 'noStateProcess', source: 'Preempted' }
          : parseTimeline(s.estTimeline),
        clarityPreempted,
      };
    });

    // Fees and bonds are BANDS: the caller (this page) states that it means
    // "low end summed to high end", which is the only way to aggregate a range
    // without picking an end nobody in this repo is entitled to pick.
    const feeTotal = sumMoneyBand(members.map(m => m.feeSource));
    const bondTotal = sumMoneyBand(members.map(m => m.bondSource));
    // Net worth is a ceiling, not a sum — the reserve covering several states is
    // the highest single requirement.
    const netWorthCeiling = maxMoneyBand(members.map(m => m.netWorthSource));
    const timelineBand = cohortTimelineBand(members.map(m => m.timeline));

    // Every refusal on the page, deduped by code, so the surface can cite the
    // rule behind each one instead of just printing a token. Figures and
    // jurisdictions are counted separately — see LedgerRefusal above.
    const byCode = new Map<MoneyAggregateRefusalCode, LedgerRefusal>();
    for (const total of [feeTotal, bondTotal, netWorthCeiling]) {
      if (total.kind !== 'refused') continue;
      for (const r of total.refusals) {
        const entry: LedgerRefusal =
          byCode.get(r.code) ??
          { code: r.code, rule: r.rule, figureCount: 0, memberAbbrs: [], sources: [] };
        entry.figureCount += r.unvaluedCount;
        for (const index of r.memberIndexes) {
          const abbr = members[index]?.abbr;
          if (abbr && !entry.memberAbbrs.includes(abbr)) entry.memberAbbrs.push(abbr);
        }
        for (const src of r.sources) {
          // An absent field has no source string, and printing '' put a bare
          // comma in the list of values the reader is told were not summed.
          const label = sourceLabel(src);
          if (!entry.sources.includes(label)) entry.sources.push(label);
        }
        byCode.set(r.code, entry);
      }
    }
    const timelineRefusals = timelineBand.kind === 'refused' ? timelineBand.refusals : [];

    return {
      members,
      feeTotal,
      bondTotal,
      netWorthCeiling,
      timelineBand,
      moneyRefusals: [...byCode.values()],
      timelineRefusals,
      preemptedCount: members.filter(m => m.clarityPreempted).length,
    };
  }, [activeStates, clarityEnacted, spdiEquivalence]);

  const handlePrint = () => {
    addAuditLog(`CCO printed compliance brief: [Template: ${selectedTemplate}]`, 'System');
    window.print();
  };

  const memoHeader = useMemo(() => {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return {
      to: toOverride || (selectedTemplate === 'sec' ? 'U.S. Securities & Exchange Commission (SEC)' : 'Board of Directors, LCX AG'),
      from: fromOverride || 'Chief Compliance Officer, LCX USA',
      date: dateOverride || today,
      subject: subjectOverride || (selectedTemplate === 'sec'
        ? 'Response Outline: Token Securities and Commodity Assets Classifications'
        : selectedTemplate === 'state'
        ? 'Multi-State Money Transmitter License Submission Portfolio'
        : 'U.S. Operational Readiness and Compliance Feasibility Brief'),
    };
  }, [selectedTemplate, toOverride, fromOverride, dateOverride, subjectOverride]);

  // Three states, never collapsed: not computed yet / computed / cannot be
  // computed here. SubtleCrypto needs a secure origin, so 'unavailable' is a
  // real outcome and prints as a refusal rather than as a plausible hex string.
  const [digest, setDigest] = useState<DigestResult | 'computing'>('computing');

  useEffect(() => {
    let live = true;
    setDigest('computing');
    computeSelectionDigest({
      template: selectedTemplate,
      signatory: signatoryName,
      states: selectedStates,
      products: selectedProducts,
    }).then(result => {
      if (live) setDigest(result);
    });
    return () => {
      live = false;
    };
  }, [selectedTemplate, signatoryName, selectedStates, selectedProducts]);

  return (
    <div className="space-y-4 text-navy h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0 print:p-0 print:bg-white print:text-black">
      
      {/* Top Header Controls (hidden on print) */}
      <PageTitle
        className="shrink-0 print:hidden"
        icon={<FileText size={20} />}
        subtitle="Compile watermarked, legal compliance briefings directly for counsel, banks, or the board."
        actions={
          <Button variant="primary" size="sm" onClick={handlePrint}>
            <Printer size={14} />
            <span>Print Brief / Save PDF</span>
          </Button>
        }
      >
        Executive Memo &amp; Brief Publisher
      </PageTitle>

      {/* Main split work view container */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden print:overflow-visible print:block print:h-auto">
        
        {/* Left Side: Parameters panel (hidden on print) */}
        <div className="w-full lg:w-96 bg-card border border-line rounded-lg p-4 overflow-y-auto space-y-4 shrink-0 shadow-sm print:hidden">
          
          {/* Choose Template */}
          <div className="space-y-2">
            <SectionLabel className="flex items-center gap-1">
              <Sliders size={12} /> 1. Choose Template
            </SectionLabel>
            <div className="space-y-1">
              {[
                { id: 'exec', label: 'Executive Board Briefing' },
                { id: 'state', label: 'State Regulators Memo' },
                { id: 'sec', label: 'SEC Regulatory Response' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTemplate(t.id as any);
                    setSubjectOverride('');
                    setToOverride('');
                  }}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded text-xs font-semibold border t-surface',
                    selectedTemplate === t.id
                      ? 'border-navy bg-navy/5 text-navy dark:border-ice dark:bg-ice-soft/5 shadow-sm'
                      : 'border-line hover:bg-ice-soft/10 text-grey-dark'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Document Header Text Customization */}
          <div className="space-y-2 pt-3 border-t border-line">
            <SectionLabel className="flex items-center gap-1">
              <FileCode size={12} /> 2. Custom Header Overrides
            </SectionLabel>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="To (Default: Board / SEC)"
                value={toOverride}
                onChange={e => setToOverride(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus-ring"
              />
              <input
                type="text"
                placeholder="From (Default: CCO)"
                value={fromOverride}
                onChange={e => setFromOverride(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus-ring"
              />
              <input
                type="text"
                placeholder="Subject Line"
                value={subjectOverride}
                onChange={e => setSubjectOverride(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus-ring"
              />
              <input
                type="text"
                placeholder="Date Override (e.g. July 4, 2026)"
                value={dateOverride}
                onChange={e => setDateOverride(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus-ring"
              />
            </div>
          </div>

          {/* Select Target Launch States */}
          <div className="space-y-2 pt-3 border-t border-line">
            <div className="flex justify-between items-center">
              <SectionLabel>3. Target Jurisdictions</SectionLabel>
              <div className="flex gap-1.5">
                <button onClick={handleSelectPhase1} className="text-[9px] font-bold text-cyan-500 hover:underline">Phase 1</button>
                <span className="text-grey text-[9px]">•</span>
                <button onClick={handleSelectNmls} className="text-[9px] font-bold text-cyan-500 hover:underline">NMLS</button>
                <span className="text-grey text-[9px]">•</span>
                <button onClick={handleClearStates} className="text-[9px] font-bold text-grey-dark hover:underline">Clear</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {states.filter(s => s.tier !== 'Unresearched').map(s => {
                const active = selectedStates.includes(s.abbreviation);
                return (
                  <button
                    key={s.id}
                    onClick={() => handleToggleState(s.abbreviation)}
                    className={clsx(
                      'py-1 rounded text-micro font-mono border text-center font-bold t-hover',
                      active
                        ? 'bg-navy border-navy text-card dark:bg-ice dark:border-ice dark:text-navy'
                        : 'border-line bg-card text-grey-dark hover:bg-ice-soft dark:hover:bg-ice-soft/10'
                    )}
                  >
                    {s.abbreviation}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select listed assets */}
          <div className="space-y-2 pt-3 border-t border-line">
            <SectionLabel>4. Listed Asset Scope</SectionLabel>
            <div className="space-y-1.5">
              {products.map(p => {
                const active = selectedProducts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => handleToggleProduct(p.id)}
                    className={clsx(
                      'flex items-center gap-2 w-full text-left p-1.5 rounded border text-micro font-semibold t-hover',
                      active
                        ? 'border-navy bg-navy/5 text-navy dark:border-ice dark:bg-ice-soft/5'
                        : 'border-line hover:bg-ice-soft/10 text-grey-dark'
                    )}
                  >
                    <input type="checkbox" checked={active} readOnly className="rounded h-3.5 w-3.5 pointer-events-none" />
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Signatory Configurations */}
          <div className="space-y-2 pt-3 border-t border-line">
            <SectionLabel className="flex items-center gap-1">
              <CheckSquare size={12} /> 5. Signatories
            </SectionLabel>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Signatory Name"
                value={signatoryName}
                onChange={e => setSignatoryName(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus-ring"
              />
              <input
                type="text"
                placeholder="Signatory Title"
                value={signatoryTitle}
                onChange={e => setSignatoryTitle(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus-ring"
              />
              <input
                type="text"
                placeholder="Co-Signer Name (Optional)"
                value={coSignerName}
                onChange={e => setCoSignerName(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus-ring"
              />
              <input
                type="text"
                placeholder="Co-Signer Title"
                value={coSignerTitle}
                onChange={e => setCoSignerTitle(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus-ring"
              />
            </div>
          </div>

          {/* Visibility Controls */}
          <div className="space-y-2 pt-3 border-t border-line">
            <SectionLabel>6. Template Visibility Flags</SectionLabel>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showWatermark} onChange={e => setShowWatermark(e.target.checked)} />
                <span>Watermark</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showRequirementsTable} onChange={e => setShowRequirementsTable(e.target.checked)} />
                <span>Requirements Table</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showRisksTable} onChange={e => setShowRisksTable(e.target.checked)} />
                <span>Risks Table</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showHoweyMatrix} onChange={e => setShowHoweyMatrix(e.target.checked)} />
                <span>Howey Matrix</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showAuditLogsAnnex} onChange={e => setShowAuditLogsAnnex(e.target.checked)} />
                <span>Logs Appendix</span>
              </label>
            </div>
          </div>

        </div>

        {/* Right Side: A4 Preview panel */}
        <div className="flex-1 bg-grey-light/30 dark:bg-navy-deep/20 border border-line rounded-lg p-6 shadow-sm overflow-y-auto flex justify-center print:border-0 print:p-0 print:bg-white print:shadow-none print:overflow-visible">
          
          {/* A4 Sheet layout container */}
          <div
            className="w-[210mm] bg-white text-slate-900 px-[15mm] py-[20mm] shadow-lg rounded border border-slate-200 relative overflow-hidden font-sans print:shadow-none print:border-0 print:w-full print:p-0 print:m-0 printable-brief-sheet"
            style={{ boxSizing: 'border-box' }}
          >
            {/* Rotating Confidential Watermark */}
            {showWatermark && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none z-0">
                <span className="text-[64px] font-extrabold rotate-45 uppercase font-mono tracking-widest text-red-600 border-[10px] border-red-600 p-6">
                  Confidential - CCO Audit
                </span>
              </div>
            )}

            {/* Document Body (z-index to stay above watermark) */}
            <div className="relative z-10 space-y-6 text-slate-800">
              
              {/* CCO Memorandum Header block */}
              <div className="border-b-[3px] border-slate-900 pb-4">
                <h2 className="text-3xl font-extrabold tracking-tight text-center uppercase font-mono mb-6">Memorandum</h2>
                
                <div className="grid grid-cols-4 gap-y-2 text-xs font-mono">
                  <span className="font-bold uppercase text-slate-500">To:</span>
                  <span className="col-span-3 font-semibold text-slate-950">{memoHeader.to}</span>
                  
                  <span className="font-bold uppercase text-slate-500">From:</span>
                  <span className="col-span-3 font-semibold text-slate-950">{memoHeader.from}</span>
                  
                  <span className="font-bold uppercase text-slate-500">Date:</span>
                  <span className="col-span-3 font-semibold text-slate-950">{memoHeader.date}</span>
                  
                  <span className="font-bold uppercase text-slate-500">Subject:</span>
                  <span className="col-span-3 font-bold text-slate-950 uppercase">{memoHeader.subject}</span>
                </div>
              </div>

              {/* Template Content: EXECUTIVE BOARD BRIEFING */}
              {selectedTemplate === 'exec' && (
                <div className="space-y-5 text-xs leading-relaxed text-slate-800 font-sans">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1 flex items-center gap-1.5">
                      1. Scope and Rollout Architecture
                    </h3>
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus-ring transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
                    >
                      This memorandum provides an operational analysis of the U.S. launch strategy. The active committed rollout model is set to <strong>{committedArchitecture ? committedArchitecture.toUpperCase() : 'NOT COMMITTED (defaulting to Option C Custodial)'}</strong>. Using a phased jurisdiction deployment, LCX USA aims to coordinate banking connections and licensing.
                    </div>
                  </div>

                  {/* Dynamic Financial Ledger Table */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1">
                      2. State Budget &amp; Capital Projections Ledger
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded">
                      <table className="w-full text-left border-collapse text-micro">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                            <th className="p-2">State</th>
                            <th className="p-2">Regulator</th>
                            <th className="p-2">NMLS?</th>
                            <th className="p-2 text-right">Min Net Worth</th>
                            <th className="p-2 text-right">Surety Bond</th>
                            <th className="p-2 text-right">Est. Fee</th>
                            <th className="p-2 text-right">Timeline</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.members.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-2 text-center text-slate-500">No states selected. Use target selectors to populate.</td>
                            </tr>
                          ) : (
                            ledger.members.map(m => (
                              <tr key={m.abbr} className="border-b border-slate-100 hover:bg-slate-50/50">
                                <td className="p-2 font-bold font-mono">{m.abbr}</td>
                                <td className="p-2 truncate max-w-[120px]" title={m.regulator}>{m.regulator}</td>
                                <td className="p-2">{m.nmlsRequired ? 'Yes' : 'No'}</td>
                                {/* moneyDisplay prints the recorded string for anything that is not
                                    a single exact figure — a range, an open-ended floor and prose
                                    all reach the reader as written. */}
                                <td className="p-2 text-right font-mono" data-testid={`brief-row-${m.abbr}-networth`}>
                                  {moneyDisplay(parseMoney(m.netWorthSource))}
                                </td>
                                <td className="p-2 text-right font-mono" data-testid={`brief-row-${m.abbr}-bond`}>
                                  {moneyDisplay(parseMoney(m.bondSource))}
                                </td>
                                <td className="p-2 text-right font-mono" data-testid={`brief-row-${m.abbr}-fee`}>
                                  {moneyDisplay(parseMoney(m.feeSource))}
                                </td>
                                <td className="p-2 text-right font-mono" data-testid={`brief-row-${m.abbr}-timeline`}>
                                  {m.clarityPreempted ? 'Preempted' : m.timeline.source || 'NOT RECORDED'}
                                </td>
                              </tr>
                            ))
                          )}
                          <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900">
                            <td className="p-2" colSpan={3}>Aggregate Cohort Projections</td>
                            <td className="p-2 text-right font-mono" data-testid="brief-networth-ceiling">
                              {bandCell(ledger.netWorthCeiling)}
                            </td>
                            <td className="p-2 text-right font-mono" data-testid="brief-bond-total">
                              {bandCell(ledger.bondTotal)}
                            </td>
                            <td className="p-2 text-right font-mono" data-testid="brief-fee-total">
                              {bandCell(ledger.feeTotal)}
                            </td>
                            {/* Never a duration for a cohort that has none: with
                                every member on 'no state MTL requirement' this
                                printed "0m", which reads as "instant". */}
                            <td className="p-2 text-right font-mono" data-testid="brief-timeline-band">
                              {timelineBandCell(ledger.timelineBand)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Every refusal, with the rule it applies and the strings it
                        could not value. A code with no rule beside it is an error
                        message, not a refusal. */}
                    <div className="text-[9px] text-slate-600 leading-tight space-y-1" data-testid="brief-refusal-notes">
                      {ledger.moneyRefusals.length === 0 && ledger.timelineRefusals.length === 0 ? (
                        <div>* Every figure in this cohort was read as recorded; no aggregate was refused.</div>
                      ) : (
                        <>
                          {ledger.moneyRefusals.map(r => (
                            <div key={r.code}>
                              <span className="font-bold font-mono">REFUSED [{r.code}]</span>{' '}
                              {r.figureCount > 0 && (
                                <>
                                  ({r.figureCount} {r.figureCount === 1 ? 'figure' : 'figures'} across{' '}
                                  {r.memberAbbrs.length} of {ledger.members.length}{' '}
                                  {ledger.members.length === 1 ? 'jurisdiction' : 'jurisdictions'}
                                  {r.memberAbbrs.length > 0 && <> — {r.memberAbbrs.join(', ')}</>}){' '}
                                </>
                              )}
                              {r.rule}
                              {r.sources.length > 0 && (
                                <> Values not summed: <span className="font-mono">{r.sources.join(', ')}</span>.</>
                              )}
                            </div>
                          ))}
                          {ledger.timelineRefusals.map(r => (
                            <div key={r.code}>
                              <span className="font-bold font-mono">REFUSED [{r.code}]</span>{' '}
                              {r.unvaluedCount > 0 && (
                                <>
                                  ({r.unvaluedCount} of {ledger.members.length}{' '}
                                  {ledger.members.length === 1 ? 'jurisdiction' : 'jurisdictions'}
                                  {r.memberIndexes.length > 0 && (
                                    <> — {r.memberIndexes.map(i => ledger.members[i]?.abbr).filter(Boolean).join(', ')}</>
                                  )}){' '}
                                </>
                              )}
                              {r.rule}
                              {r.sources.length > 0 && (
                                <>
                                  {' '}Timelines not banded:{' '}
                                  <span className="font-mono">{r.sources.map(sourceLabel).join(', ')}</span>.
                                </>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* The previous version of this note told the reader the band
                        was "the slowest jurisdiction's range". It is not: it is
                        max-of-lows to max-of-highs, and for the default cohort
                        (WY 8-14, TX 6-12, CA 9-12) it prints 9–14m — a range no
                        selected jurisdiction has. The same sentence asserted
                        "applications run in parallel" as fact; that is an
                        assumption about how LCX would file, and it is labelled
                        as one now. */}
                    <div className="text-[9px] text-slate-500 leading-tight" data-testid="brief-timeline-note">
                      * Fee and bond aggregates are BANDS (low ends summed to high ends), not
                      single figures: which end of a recorded range applies depends on projected
                      transmission volume, which this system does not hold. Net worth is the cohort
                      ceiling, not a sum. The timeline band is not any one jurisdiction's range: it
                      is the latest low end to the latest high end across the cohort, so read it as
                      "no earlier than the low figure, no later than the high figure". It rests on
                      an ASSUMPTION, not on anything in the dataset — that applications are filed in
                      parallel rather than in sequence. Filed sequentially the cohort would take
                      longer than the band shows, and this system holds no filing plan either way
                      {ledger.timelineBand.kind === 'band' && ledger.timelineBand.noProcessCount > 0 && (
                        <> — {ledger.timelineBand.noProcessCount} of {ledger.members.length} selected
                        jurisdictions have no state licensing process at all and wait on nothing</>
                      )}
                      {ledger.timelineBand.kind === 'noProcess' && (
                        <> — and no band is shown at all here, because all {ledger.timelineBand.memberCount}{' '}
                        selected jurisdictions record no state licensing process. That is a
                        statement, not a duration of zero</>
                      )}
                      . Preemption values reflect the CLARITY Act or SPDI Trust Reciprocity toggles
                      in the systems console.
                    </div>

                    {/* Doctrine: a figure carries an ObservationFrame or says it has none. */}
                    <div className="text-[9px] text-slate-500 leading-tight border border-slate-300 rounded p-2" data-testid="brief-frame-caveat">
                      <span className="font-bold uppercase">Observation frame: missing.</span>{' '}
                      The jurisdiction dataset records one source-authority rating per state and
                      carries no per-figure source, no as-of date and no observation window. No
                      figure in this ledger can therefore state when it was observed or from which
                      authority it was taken, and none should be relied on as a current statutory
                      quotation without counsel confirming it against the state's own schedule.
                    </div>
                  </div>

                  {/* Gating Requirements Table */}
                  {showRequirementsTable && activeRequirements.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1 flex items-center gap-1">
                        <Award size={13} className="text-slate-950" /> 3. Triggered Regulatory Gating Controls
                      </h3>
                      <div className="overflow-x-auto border border-slate-200 rounded">
                        <table className="w-full text-left border-collapse text-micro">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                              <th className="p-2">Requirement</th>
                              <th className="p-2">Domain</th>
                              <th className="p-2">Target Triggers</th>
                              <th className="p-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeRequirements.map((r, idx) => (
                              <tr key={idx} className="border-b border-slate-100">
                                <td className="p-2 font-bold text-slate-950">{r.name}</td>
                                <td className="p-2 text-slate-500">{r.domain}</td>
                                <td className="p-2 text-slate-500 italic max-w-[200px] truncate" title={r.trigger}>{r.trigger}</td>
                                <td className="p-2 text-right font-semibold">
                                  <span className={clsx(
                                    'px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider',
                                    r.status === 'Ready' ? 'bg-emerald-100 text-emerald-800' :
                                    r.status === 'Blocked' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                  )}>
                                    {r.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Risks & Mitigation Table */}
                  {showRisksTable && activeRedFlags.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1 flex items-center gap-1">
                        <ShieldAlert size={13} className="text-slate-950" /> 4. Risk Assessment &amp; Remediation Plan
                      </h3>
                      <div className="overflow-x-auto border border-slate-200 rounded">
                        <table className="w-full text-left border-collapse text-micro">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                              <th className="p-2">Risk Coordinate</th>
                              <th className="p-2">Risk Level</th>
                              <th className="p-2">Regulatory Consequence</th>
                              <th className="p-2">Remediation Action Items</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeRedFlags.map((rf, idx) => (
                              <tr key={idx} className="border-b border-slate-100 align-top">
                                <td className="p-2 font-bold text-slate-950 max-w-[120px]">{rf.title}</td>
                                <td className="p-2">
                                  <span className={clsx(
                                    'px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider',
                                    rf.risk === 'Critical' ? 'bg-red-100 text-red-800' :
                                    rf.risk === 'High' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'
                                  )}>
                                    {rf.risk}
                                  </span>
                                </td>
                                <td className="p-2 text-slate-500 max-w-[200px] text-[9px] leading-tight">{rf.consequences}</td>
                                <td className="p-2 max-w-[220px]">
                                  <ul className="list-disc list-inside space-y-1 text-[9px] text-slate-700">
                                    {rf.remediations.map(rem => (
                                      <li key={rem.id} className="leading-tight">
                                        {rem.label}
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1">
                      5. Final Regulatory Action Plan
                    </h3>
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus-ring transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
                    >
                      The compliance office recommends proceeding immediately with Delaware good standing verifications while monitoring congressional progress on the CLARITY preemption sandbox. Action items under federal MSB requirements remain priority one.
                    </div>
                  </div>
                </div>
              )}

              {/* Template Content: STATE REGULATORS MEMO */}
              {selectedTemplate === 'state' && (
                <div className="space-y-5 text-xs leading-relaxed text-slate-800 font-sans">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1">
                      1. Executive Summary &amp; Corporate Registration
                    </h3>
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus-ring transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
                    >
                      This brief outlines the license registration structures submitted under NMLS guidelines for the following states: {activeStates.map(s => s.name).join(', ') || 'None selected'}. Intercompany transfer pricing agreements and Delaware formations have been organized for state bank inspections.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1">
                      2. State Regulatory Sandbox &amp; Exemptions Overview
                    </h3>
                    {/* THIS IS A MEMO THAT GETS PRINTED, so the refusal has to sit in the memo
                        body and not only in the cells. The exemption details are prose and now
                        arrive with `stateNarrative.json`; a printed page whose last column is
                        blank or dashed is read by a regulator as "no exemption applies". */}
                    {narrativeTable.state !== 'ready' && (
                      <NarrativeGap read={narrativeTable} subject="The exemption details for every jurisdiction in this memo" />
                    )}
                    <div className="overflow-x-auto border border-slate-200 rounded">
                      <table className="w-full text-left border-collapse text-micro">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                            <th className="p-2">Jurisdiction</th>
                            <th className="p-2">Regulating Agency</th>
                            <th className="p-2">Sandbox Available?</th>
                            <th className="p-2">Applicable Exemption Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeStates.map((s, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="p-2 font-bold">{s.name}</td>
                              {/* Was `|| 'Division of Banking'` — a memo sent TO a
                                  state regulator cannot invent that regulator's
                                  name when the dataset has none. */}
                              <td className="p-2 text-slate-600" data-testid={`brief-state-${s.abbreviation}-regulator`}>
                                {s.regulator || 'NOT RECORDED'}
                              </td>
                              <td className="p-2 font-semibold">
                                <span className={clsx(
                                  'px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider',
                                  s.sandboxAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                                )}>
                                  {s.sandboxAvailable ? 'Exempt Sandbox' : 'Standard'}
                                </span>
                              </td>
                              {/* Was a sentence asserting that no sandbox exists and
                                  that a standard MTL is required — a legal claim
                                  manufactured out of an empty field. `NOT LOADED` and
                                  `NOT RECORDED` are kept apart for the same reason: one
                                  says the asset never arrived, the other says this
                                  jurisdiction genuinely has no note (5 of 50 do not). */}
                              <td className="p-2 text-slate-500 italic max-w-[200px] truncate" title={sandboxCell(narrativeTable, s.abbreviation)}>
                                {sandboxCell(narrativeTable, s.abbreviation)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1">
                      3. Operational Covenants and Audit Disclosures
                    </h3>
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus-ring transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
                    >
                      Under state-by-state guidelines, LCX USA commits to maintaining physical residency of the Chief Compliance Officer in the United States and posting the required surety bonds prior to initial customer transaction matching.
                    </div>
                  </div>
                </div>
              )}

              {/* Template Content: SEC REGULATORY RESPONSE */}
              {selectedTemplate === 'sec' && (
                <div className="space-y-5 text-xs leading-relaxed text-slate-800 font-sans">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1">
                      1. Statement of Interest &amp; Listing Standards
                    </h3>
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus-ring transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
                    >
                      This outline represents the legal classifications of digital assets listed for retail spot trading by LCX USA. We maintain strict segregation rules, utilizing qualified custodians and prohibiting internal trade counterparty operations to avoid securities exposures.
                    </div>
                  </div>

                  {/* Howey Test Prong-by-Prong Comparison Matrix */}
                  {showHoweyMatrix && activeProducts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1 flex items-center gap-1.5">
                        <Check size={13} className="text-emerald-600" /> 2. Supreme Court Howey Test Prong Analysis
                      </h3>
                      <div className="overflow-x-auto border border-slate-200 rounded">
                        <table className="w-full text-left border-collapse text-[9px] leading-snug">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                              <th className="p-2">Asset / Product</th>
                              <th className="p-2 text-right">Howey Index</th>
                              <th className="p-2">Prong 1: Money</th>
                              <th className="p-2">Prong 2: Common Ent.</th>
                              <th className="p-2">Prong 3: Profit Exp.</th>
                              <th className="p-2">Prong 4: Others' Efforts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeProducts.map((p, idx) => (
                              <tr key={idx} className="border-b border-slate-100 align-top hover:bg-slate-50/50">
                                <td className="p-2 font-mono font-bold text-slate-950">{p.name}</td>
                                {/* An absent score printed '—%'. An absent prong printed
                                    'N/A', which on an SEC filing reads as an assertion that
                                    the prong does not apply. Both branches are unreachable
                                    with the current catalogue (all 8 products carry a score
                                    and a full analysis) and are written so that adding a
                                    ninth cannot quietly make a legal claim. */}
                                <td className="p-2 text-right font-mono font-bold text-cyan-700">{p.howeyScore === undefined ? 'NOT SCORED' : `${p.howeyScore}%`}</td>
                                <td className="p-2 text-slate-500 max-w-[120px] text-[8.5px]">{p.howeyAnalysis?.investmentOfMoney || 'NOT RECORDED'}</td>
                                <td className="p-2 text-slate-500 max-w-[120px] text-[8.5px]">{p.howeyAnalysis?.commonEnterprise || 'NOT RECORDED'}</td>
                                <td className="p-2 text-slate-500 max-w-[120px] text-[8.5px]">{p.howeyAnalysis?.profitExpectation || 'NOT RECORDED'}</td>
                                <td className="p-2 text-slate-500 max-w-[120px] text-[8.5px]">{p.howeyAnalysis?.effortsOfOthers || 'NOT RECORDED'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="text-[8.5px] text-slate-500 leading-tight">
                        * Howey Index represents the aggregated securities exposure risk. An index $\ge 75\%$ indicates a high likelihood of investment contract classification demanding SEC utility registration.
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1">
                      3. Surveillance Sharing &amp; Anti-Manipulation Program
                    </h3>
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus-ring transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
                    >
                      To satisfy requirements under the SEC exchange guidelines, LCX USA integrates real-time block screening protocols and transaction logs reporting directly via Elliptic/Chainalysis API interfaces, mitigating wash-trading and market manipulations.
                    </div>
                  </div>
                </div>
              )}

              {/* CCO signature block.
                  It used to read '[Digitally Certified Stamp]' over a djb2 hash
                  labelled 'sha256_', beside a 'Verification Authority' constant
                  that never changed. Nothing digitally certifies this document:
                  the body is contentEditable and no signature is applied. The
                  block now says exactly that. */}
              <div className="pt-6 border-t border-slate-300 flex justify-between items-start text-micro font-mono mt-8 select-none" data-testid="brief-signature-block">
                <div>
                  <span className="font-bold text-slate-500 uppercase block">Published &amp; Approved by:</span>
                  <span className="font-bold text-slate-950 block">{signatoryName}</span>
                  <span className="text-slate-500 text-[9px]">{signatoryTitle}</span>
                  {coSignerName && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <span className="font-bold text-slate-950 block">{coSignerName}</span>
                      <span className="text-slate-500 text-[9px]">{coSignerTitle}</span>
                    </div>
                  )}
                </div>
                <div className="border-2 border-slate-900 rounded p-2 text-[9px] uppercase tracking-wider text-slate-950 font-bold border-double bg-slate-50 max-w-[280px]">
                  Unsigned draft — no seal applied
                  <span className="block text-[8px] text-slate-700 font-normal mt-0.5 break-all normal-case" data-testid="brief-digest">
                    {digest === 'computing'
                      ? 'Selection digest: computing…'
                      : digest.kind === 'digest'
                      ? `Selection digest: ${digest.algorithm} ${digest.hex}`
                      : `Selection digest: REFUSED [${digest.code}]`}
                  </span>
                  <span className="block text-[8px] text-slate-500 font-normal mt-0.5 normal-case" data-testid="brief-digest-scope">
                    {digest !== 'computing' && digest.kind === 'unavailable'
                      ? digest.rule
                      : 'Covers the selection parameters only (template, signatory, jurisdictions, assets) — not the body text, which is editable in place. It is not a signature, a seal, or evidence of approval.'}
                  </span>
                </div>
              </div>

              {/* Annex A: CCO Session Audit Trail */}
              {showAuditLogsAnnex && auditLogs.length > 0 && (
                <div className="pt-10 border-t border-slate-300 mt-12 space-y-3 page-break-before-always section-break">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-mono">
                      Annex A: CCO Compliance Session Audit Trail
                    </h3>
                    <p className="text-[9px] text-slate-500 leading-normal font-sans mt-0.5">
                      This annex represents the immutable, block-chained audit logs compiled by the LCX USA OS cockpit. It records all regulatory simulations, safe harbor toggles, and checklist selections completed during the session.
                    </p>
                  </div>

                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="w-full text-left border-collapse font-mono text-[9px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                          <th className="p-1.5 w-16">Time</th>
                          <th className="p-1.5 w-20">Category</th>
                          <th className="p-1.5">Action / Audit Record Message</th>
                          <th className="p-1.5 w-24 text-right">Block Hash (Digest)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.slice(0, 10).map((log, idx) => (
                          <tr key={idx} className="border-b border-slate-100 align-top">
                            <td className="p-1.5 text-slate-500">{log.timestamp}</td>
                            <td className="p-1.5 font-sans font-bold">
                              <span className={clsx(
                                'px-1 rounded text-[8px] uppercase tracking-wider',
                                log.category === 'Audit' ? 'bg-emerald-100 text-emerald-800' :
                                log.category === 'Architecture' ? 'bg-blue-100 text-blue-800' :
                                log.category === 'Scenario' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                              )}>
                                {log.category}
                              </span>
                            </td>
                            <td className="p-1.5 text-slate-800">{log.message}</td>
                            <td className="p-1.5 text-right text-slate-500 text-[8px]">{log.hash || '0000000000000000'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>

      {/* Stylesheet injector for print margins overriding dashboard headers */}
      <style>{`
        @media print {
          /* Hide all non-printable wrappers */
          header, aside, .print\\:hidden, button, input, select {
            display: none !important;
          }
          
          /* Override layout constraints to allow natural multi-page scrolling */
          html, body, #root, #root > div, main, .flex-1, .flex-col, .overflow-hidden {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            display: block !important;
            background: white !important;
          }

          /* Reset padding and margins */
          body {
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Expand printable brief sheet to fill the canvas */
          .printable-brief-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
            visibility: visible !important;
            display: block !important;
          }

          /* Force text color and visibility */
          .printable-brief-sheet * {
            visibility: visible !important;
            color: black !important;
            text-shadow: none !important;
          }

          /* Prevent table rows and blocks from splitting awkwardly */
          tr, td, th, h3, .border {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .page-break-before-always {
            page-break-before: always !important;
            break-before: page !important;
          }
        }
      `}</style>
    </div>
  );
}
export default BriefGenerator;
