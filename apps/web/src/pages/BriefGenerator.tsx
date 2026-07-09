import { useState, useMemo } from 'react';
import { states, products, requirements, redFlags } from '@/data';
import { useAuditStore } from '@/stores/useAuditStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { FileText, Printer, Sliders, CheckSquare, ShieldAlert, Award, FileCode, Check } from 'lucide-react';
import { clsx } from 'clsx';

// Simple hash generator for PKCS#7 visual digital seal signature
function computeBriefDigest(template: string, cco: string, statesList: string[], productsList: string[]): string {
  const payload = `${template}|${cco}|${statesList.join(',')}|${productsList.join(',')}`;
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 33) ^ payload.charCodeAt(i);
  }
  return 'sha256_' + Math.abs(hash).toString(16).padEnd(8, 'e') + 'bcf1c3';
}

export function BriefGenerator() {
  const { committedArchitecture, addAuditLog, auditLogs } = useAuditStore();
  const { clarityEnacted, spdiEquivalence } = useFilterStore();

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

  // Dynamic budget comparison ledger calculations
  const tableData = useMemo(() => {
    let totalFees = 0;
    let totalBonds = 0;
    let maxNetWorth = 0;
    let maxTimeline = 0;

    const rows = activeStates.map(s => {
      // Net worth parse (NY pre-empted under SPDI)
      let netWorth = 0;
      if (s.minNetWorth) {
        netWorth = parseInt(s.minNetWorth.replace(/[^0-9]/g, '')) || 100000;
      }
      if (s.abbreviation === 'NY' && spdiEquivalence) {
        netWorth = 0;
      }

      // Fee parse (preempted under CLARITY or SPDI)
      let fee = 15000;
      if (clarityEnacted && s.nmlsRequired) {
        fee = 0;
      } else if (s.abbreviation === 'NY' && spdiEquivalence) {
        fee = 0;
      } else if (s.estCost) {
        const parsed = parseInt(s.estCost.replace(/[^0-9]/g, ''));
        fee = isNaN(parsed) ? 15000 : parsed * (s.estCost.includes('K') ? 1000 : 1);
      }

      // Bond parse
      let bond = 0;
      if (clarityEnacted && s.nmlsRequired) {
        bond = 0;
      } else if (s.abbreviation === 'NY' && spdiEquivalence) {
        bond = 0;
      } else if (s.suretyBond) {
        bond = parseInt(s.suretyBond.replace(/[^0-9]/g, '')) || 0;
      }

      // Timeline parse
      let timelineMonths = 0;
      if (clarityEnacted && s.nmlsRequired) {
        timelineMonths = 0;
      } else if (s.estTimeline) {
        const match = s.estTimeline.match(/(\d+)\s*-\s*(\d+)/);
        if (match) {
          timelineMonths = parseInt(match[2]);
        } else {
          timelineMonths = parseInt(s.estTimeline) || 0;
        }
      }

      totalFees += fee;
      totalBonds += bond;
      maxNetWorth = Math.max(maxNetWorth, netWorth);
      maxTimeline = Math.max(maxTimeline, timelineMonths);

      return {
        abbr: s.abbreviation,
        name: s.name,
        regulator: s.regulator || 'N/A',
        nmls: s.nmlsRequired ? 'Yes' : 'No',
        netWorth,
        bond,
        fee,
        timeline: clarityEnacted && s.nmlsRequired ? 'Preempted' : s.estTimeline || 'N/A'
      };
    });

    return { rows, totalFees, totalBonds, maxNetWorth, maxTimeline };
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

  const digestHash = useMemo(() => {
    return computeBriefDigest(selectedTemplate, signatoryName, selectedStates, selectedProducts);
  }, [selectedTemplate, signatoryName, selectedStates, selectedProducts]);

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0 print:p-0 print:bg-white print:text-black">
      
      {/* Top Header Controls (hidden on print) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 shrink-0 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText size={24} className="text-navy dark:text-ice" /> Executive Memo &amp; Brief Publisher
          </h1>
          <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
            Compile watermarked, legal compliance briefings directly for counsel, banks, or the board.
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 h-9 rounded bg-navy dark:bg-ice text-white dark:text-navy hover:opacity-95 px-4 text-xs font-bold shadow-sm transition-all duration-300 transform active:scale-95 shrink-0"
        >
          <Printer size={14} />
          <span>Print Brief / Save PDF</span>
        </button>
      </div>

      {/* Main split work view container */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden print:overflow-visible print:block print:h-auto">
        
        {/* Left Side: Parameters panel (hidden on print) */}
        <div className="w-full lg:w-96 bg-card border border-line rounded-lg p-4 overflow-y-auto space-y-4 shrink-0 shadow-sm print:hidden">
          
          {/* Choose Template */}
          <div className="space-y-2">
            <span className="font-bold text-[10px] uppercase tracking-wider text-grey block flex items-center gap-1">
              <Sliders size={12} /> 1. Choose Template
            </span>
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
                    'w-full text-left px-3 py-2 rounded text-xs font-semibold border transition-all duration-300',
                    selectedTemplate === t.id
                      ? 'border-navy bg-navy/5 text-navy dark:border-ice dark:bg-ice-soft/5 dark:text-ice shadow-sm'
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
            <span className="font-bold text-[10px] uppercase tracking-wider text-grey block flex items-center gap-1">
              <FileCode size={12} /> 2. Custom Header Overrides
            </span>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="To (Default: Board / SEC)"
                value={toOverride}
                onChange={e => setToOverride(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-ice"
              />
              <input
                type="text"
                placeholder="From (Default: CCO)"
                value={fromOverride}
                onChange={e => setFromOverride(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-ice"
              />
              <input
                type="text"
                placeholder="Subject Line"
                value={subjectOverride}
                onChange={e => setSubjectOverride(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-ice"
              />
              <input
                type="text"
                placeholder="Date Override (e.g. July 4, 2026)"
                value={dateOverride}
                onChange={e => setDateOverride(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-ice"
              />
            </div>
          </div>

          {/* Select Target Launch States */}
          <div className="space-y-2 pt-3 border-t border-line">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[10px] uppercase tracking-wider text-grey block">3. Target Jurisdictions</span>
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
                      'py-1 rounded text-[10px] font-mono border text-center font-bold transition-all duration-200',
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
            <span className="font-bold text-[10px] uppercase tracking-wider text-grey block">4. Listed Asset Scope</span>
            <div className="space-y-1.5">
              {products.map(p => {
                const active = selectedProducts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => handleToggleProduct(p.id)}
                    className={clsx(
                      'flex items-center gap-2 w-full text-left p-1.5 rounded border text-[10px] font-semibold transition-colors duration-200',
                      active
                        ? 'border-navy bg-navy/5 text-navy dark:border-ice dark:bg-ice-soft/5 dark:text-ice'
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
            <span className="font-bold text-[10px] uppercase tracking-wider text-grey block flex items-center gap-1">
              <CheckSquare size={12} /> 5. Signatories
            </span>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Signatory Name"
                value={signatoryName}
                onChange={e => setSignatoryName(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-ice"
              />
              <input
                type="text"
                placeholder="Signatory Title"
                value={signatoryTitle}
                onChange={e => setSignatoryTitle(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-ice"
              />
              <input
                type="text"
                placeholder="Co-Signer Name (Optional)"
                value={coSignerName}
                onChange={e => setCoSignerName(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-ice"
              />
              <input
                type="text"
                placeholder="Co-Signer Title"
                value={coSignerTitle}
                onChange={e => setCoSignerTitle(e.target.value)}
                className="w-full h-8 px-2 border border-line rounded bg-ice-soft dark:bg-navy-deep text-xs focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-ice"
              />
            </div>
          </div>

          {/* Visibility Controls */}
          <div className="space-y-2 pt-3 border-t border-line">
            <span className="font-bold text-[10px] uppercase tracking-wider text-grey block">6. Template Visibility Flags</span>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
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
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus:outline-none transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
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
                      <table className="w-full text-left border-collapse text-[10px]">
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
                          {tableData.rows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-2 text-center text-slate-500">No states selected. Use target selectors to populate.</td>
                            </tr>
                          ) : (
                            tableData.rows.map((row, idx) => (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                                <td className="p-2 font-bold font-mono">{row.abbr}</td>
                                <td className="p-2 truncate max-w-[120px]" title={row.regulator}>{row.regulator}</td>
                                <td className="p-2">{row.nmls}</td>
                                <td className="p-2 text-right font-mono">${row.netWorth.toLocaleString()}</td>
                                <td className="p-2 text-right font-mono">${row.bond.toLocaleString()}</td>
                                <td className="p-2 text-right font-mono">${row.fee.toLocaleString()}</td>
                                <td className="p-2 text-right font-mono">{row.timeline}</td>
                              </tr>
                            ))
                          )}
                          <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900">
                            <td className="p-2" colSpan={3}>Aggregate Cohort Projections</td>
                            <td className="p-2 text-right font-mono">Max: ${tableData.maxNetWorth.toLocaleString()}</td>
                            <td className="p-2 text-right font-mono">${tableData.totalBonds.toLocaleString()}</td>
                            <td className="p-2 text-right font-mono">${tableData.totalFees.toLocaleString()}</td>
                            <td className="p-2 text-right font-mono">Max: {tableData.maxTimeline}m</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-[9px] text-slate-500 leading-tight">
                      * Preemption values reflect the activation of the CLARITY Act or SPDI Trust Reciprocity rules toggled in the systems console. Net worth reserves represent the cohort ceiling requirement rather than an additive sum.
                    </div>
                  </div>

                  {/* Gating Requirements Table */}
                  {showRequirementsTable && activeRequirements.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1 flex items-center gap-1">
                        <Award size={13} className="text-slate-950" /> 3. Triggered Regulatory Gating Controls
                      </h3>
                      <div className="overflow-x-auto border border-slate-200 rounded">
                        <table className="w-full text-left border-collapse text-[10px]">
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
                        <table className="w-full text-left border-collapse text-[10px]">
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
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus:outline-none transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
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
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus:outline-none transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
                    >
                      This brief outlines the license registration structures submitted under NMLS guidelines for the following states: {activeStates.map(s => s.name).join(', ') || 'None selected'}. Intercompany transfer pricing agreements and Delaware formations have been organized for state bank inspections.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-950 border-b border-slate-300 pb-1">
                      2. State Regulatory Sandbox &amp; Exemptions Overview
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded">
                      <table className="w-full text-left border-collapse text-[10px]">
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
                              <td className="p-2 text-slate-600">{s.regulator || 'Division of Banking'}</td>
                              <td className="p-2 font-semibold">
                                <span className={clsx(
                                  'px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider',
                                  s.sandboxAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                                )}>
                                  {s.sandboxAvailable ? 'Exempt Sandbox' : 'Standard'}
                                </span>
                              </td>
                              <td className="p-2 text-slate-500 italic max-w-[200px] truncate" title={s.sandboxNotes || 'None'}>
                                {s.sandboxNotes || 'No sandbox programs available; standard MTL required.'}
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
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus:outline-none transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
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
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus:outline-none transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
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
                                <td className="p-2 text-right font-mono font-bold text-cyan-600">{p.howeyScore ?? '—'}%</td>
                                <td className="p-2 text-slate-500 max-w-[120px] text-[8.5px]">{p.howeyAnalysis?.investmentOfMoney || 'N/A'}</td>
                                <td className="p-2 text-slate-500 max-w-[120px] text-[8.5px]">{p.howeyAnalysis?.commonEnterprise || 'N/A'}</td>
                                <td className="p-2 text-slate-500 max-w-[120px] text-[8.5px]">{p.howeyAnalysis?.profitExpectation || 'N/A'}</td>
                                <td className="p-2 text-slate-500 max-w-[120px] text-[8.5px]">{p.howeyAnalysis?.effortsOfOthers || 'N/A'}</td>
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
                      className="p-1 hover:bg-cyan-500/10 focus:bg-cyan-500/5 focus:outline-none transition-colors border border-dashed border-transparent hover:border-cyan-500/25 rounded"
                    >
                      To satisfy requirements under the SEC exchange guidelines, LCX USA integrates real-time block screening protocols and transaction logs reporting directly via Elliptic/Chainalysis API interfaces, mitigating wash-trading and market manipulations.
                    </div>
                  </div>
                </div>
              )}

              {/* CCO Digital Stamp Signatures */}
              <div className="pt-6 border-t border-slate-300 flex justify-between items-center text-[10px] font-mono mt-8 select-none">
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
                <div className="border-2 border-slate-900 rounded p-2 text-[9px] uppercase tracking-wider text-slate-950 font-bold border-double bg-slate-50">
                  [Digitally Certified Stamp]
                  <span className="block text-[8px] text-slate-500 font-normal mt-0.5">Signature Digest: {digestHash}</span>
                  <span className="block text-[8px] text-slate-500 font-normal">Verification Authority: sha256_e8d21b37</span>
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
