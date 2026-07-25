import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListNavigation } from '@/hooks/useListNavigation';
import { Badge, PageTitle, SectionLabel, Button } from '@/components/ui';
import { products } from '@/data';
import { useAuditStore } from '@/stores/useAuditStore';
import { toBadgeStatus } from '@/lib/status';
import { Coins, ChevronDown, ChevronUp, Copy, Check, ExternalLink, Scale } from 'lucide-react';
import { clsx } from 'clsx';

export function ProductMatrix() {
  const navigate = useNavigate();
  const { addAuditLog, safeHarborToggles } = useAuditStore();
  const commodityExempt = safeHarborToggles?.commodityExempt ?? false;
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      return categoryFilter === 'all' || p.category === categoryFilter;
    });
  }, [categoryFilter]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
    addAuditLog(`CCO toggled registry details for product: [${id}]`, 'Audit');
  };

  // One tab stop for the registry, arrows within it (TERMINAL Phase 4's hook).
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const nav = useListNavigation({
    container: bodyRef,
    count: filteredProducts.length,
    onActivate: (i) => {
      const p = filteredProducts[i];
      if (p) toggleRow(p.id);
    },
  });

  /**
   * The hook's container handler, minus Enter/Space from anything that is not a row.
   *
   * This table is the one of the three that is not a flat list: an expanded row adds a
   * SIBLING <tr> drawer inside the same <tbody>, holding two real buttons. Two
   * consequences, and only the second needs code.
   *
   * 1. Those buttons are not descendants of `[data-list-row]`, so `parkRowControls`
   *    leaves them alone and they stay ordinary Tab stops. That is correct — a
   *    disclosure panel's controls belong in the tab ring — and it is why this table is
   *    "one stop, plus the drawer you opened" rather than flatly one.
   * 2. Their keystrokes bubble to this <tbody>, and the hook answers ⏎ with
   *    `preventDefault()`. MEASURED in Chromium with this guard removed: ⏎ on "Inspect
   *    Registry connections" logged the row toggle TWICE and never redirected at all —
   *    the preventDefault cancelled the button's own activation click, so the button was
   *    dead AND the drawer collapsed under it. Both halves are worse than the traversal
   *    this change fixes. The per-row handler this replaced was never an ancestor of the
   *    drawer, so that risk is one the move creates and this guard is what stops it
   *    being a regression. Arrows are NOT guarded: moving the row cursor from inside the
   *    drawer is how you get back out to the rows.
   */
  const onBodyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return nav.containerProps.onKeyDown(e);
    const target = e.target as HTMLElement | null;
    if (!target?.hasAttribute?.('data-list-row')) return;
    nav.containerProps.onKeyDown(e);
  };

  const handleExportYAML = () => {
    // Generate clean YAML structure
    const yamlLines = filteredProducts.map(p => {
      return `- id: ${p.id}
  name: "${p.name}"
  category: ${p.category}
  status: "${p.status}"
  phase: "${p.phase}"
  howeyScore: ${p.howeyScore !== undefined ? p.howeyScore : 'null'}
  requirementsCount: ${p.requirements.length}
  risksCount: ${p.risks.length}`;
    }).join('\n');

    const yamlPayload = `# LCX USA OS — Product & Asset Registry Ledger\n# Generated: ${new Date().toLocaleString()}\n---\n${yamlLines}`;
    
    navigator.clipboard.writeText(yamlPayload);
    setCopySuccess(true);
    addAuditLog('CCO exported asset registry ledger as YAML payload to clipboard.', 'System');
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleLinkToOntology = (id: string) => {
    addAuditLog(`CCO redirected to Ontology focusing on: [${id}]`, 'Audit');
    navigate('/ontology?focus=' + id);
  };

  return (
    <div className="space-y-4 text-navy h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      {/* Header */}
      <PageTitle
        icon={<Coins size={20} />}
        subtitle="Verify securities classification scores and active compliance requirement mappings for products."
        className="shrink-0 !mb-0"
        actions={
          <Button variant="secondary" size="sm" onClick={handleExportYAML}>
            {copySuccess ? (
              <>
                <Check size={14} className="text-status-ready" />
                <span>Copied YAML!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Export Ledger (YAML)</span>
              </>
            )}
          </Button>
        }
      >
        Product &amp; Asset Registry Ledger
      </PageTitle>

      {/* Category Toolbar Filter */}
      <div className="flex gap-2 border-b border-line pb-2.5 shrink-0 overflow-x-auto">
        {['all', 'Exchange', 'Custody', 'Fiat', 'Stablecoin', 'DeFi', 'Token'].map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={clsx(
              'px-3 py-1 rounded text-xs font-semibold border transition-all',
              categoryFilter === cat
                ? 'bg-navy border-navy text-white dark:bg-ice dark:border-ice dark:text-navy'
                : 'border-line bg-card text-grey-dark hover:bg-ice-soft dark:hover:bg-ice-soft/10'
            )}
          >
            {cat === 'all' ? 'All Registry Categories' : cat}
          </button>
        ))}
      </div>

      {/* Registry Table List Grid */}
      <div className="flex-1 bg-card border border-line rounded-lg overflow-y-auto shadow-sm min-h-0">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-ice-soft/40 dark:bg-navy-deep/20 border-b border-line text-micro uppercase font-bold text-grey select-none" role="row">
              <th className="py-2.5 px-4 w-8"></th>
              <th className="py-2.5 px-3">Product / Asset</th>
              <th className="py-2.5 px-3">Category</th>
              <th className="py-2.5 px-3">Milestone Phase</th>
              <th className="py-2.5 px-3">Securities Howey Score</th>
              <th className="py-2.5 px-3">Rules Gated</th>
              <th className="py-2.5 px-3">Status</th>
            </tr>
          </thead>
          {/* No `role` from containerProps on purpose: role="grid" here would replace
              the <tbody>'s implicit rowgroup and break the table. */}
          <tbody ref={bodyRef} className="divide-y divide-line" onKeyDown={onBodyKeyDown}>
            {filteredProducts.map((p, i) => {
              const isExpanded = !!expandedRows[p.id];
              return (
                <React.Fragment key={p.id}>
                  <tr
                    onClick={() => toggleRow(p.id)}
                    aria-expanded={isExpanded}
                    // Stays a table row (role="button" would strip the row semantics
                    // and aria-expanded with it), so movement comes from the shared
                    // roving-tabindex hook rather than tabIndex={0} on every row.
                    // Enter/Space still toggle the drawer, via onBodyKeyDown.
                    {...nav.rowProps(i)}
                    className={clsx(
                      'hover:bg-ice-soft/30 dark:hover:bg-ice-soft/5 cursor-pointer transition-colors focus-ring',
                      isExpanded && 'bg-ice-soft/20 dark:bg-ice-soft/2'
                    )}
                  >
                    <td className="py-3 px-4 text-center text-grey">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                    <td className="py-3 px-3 font-bold font-mono text-navy">{p.name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-micro font-bold border border-line bg-ice-soft/30 dark:bg-ice-soft/10 text-grey-dark">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono">{p.phase}</td>
                    <td className="py-3 px-3">
                      {p.howeyScore !== undefined ? (() => {
                        const effectiveHowey = commodityExempt ? Math.max(0, Math.round(p.howeyScore * 0.75)) : p.howeyScore;
                        return (
                          <div className="flex items-center gap-2 max-w-[120px]">
                            <div className="flex-1 h-1.5 bg-line rounded overflow-hidden">
                              <div
                                className={clsx(
                                  'h-full rounded transition-all',
                                  effectiveHowey >= 70
                                    ? 'bg-status-blocked'
                                    : effectiveHowey >= 40
                                    ? 'bg-status-conditional'
                                    : 'bg-status-ready'
                                )}
                                style={{ width: `${effectiveHowey}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-micro w-12 shrink-0 flex items-center gap-0.5">
                              {effectiveHowey}%
                              {commodityExempt && <span className="text-[7px] text-cyan-500 font-extrabold" title="Safe Harbor Applied">*</span>}
                            </span>
                          </div>
                        );
                      })() : (
                        <span className="text-grey font-mono">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold">{p.requirements.length} requirements</td>
                    <td className="py-3 px-3">
                      <Badge status={toBadgeStatus(p.status)}>{p.status}</Badge>
                    </td>
                  </tr>

                  {/* Expanded Row Drawer */}
                  {isExpanded && (
                    <tr className="bg-ice-soft/10 dark:bg-navy-deep/5">
                      <td colSpan={7} className="p-4 border-t border-line">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed">
                          {/* Column 1: Details */}
                          <div className="space-y-3">
                            <div>
                              <SectionLabel className="block">Description</SectionLabel>
                              <p className="mt-0.5 text-grey-dark">{p.description}</p>
                            </div>

                            {p.howeyAnalysis && (
                              <div className="bg-card border border-line rounded-lg p-3 space-y-1.5 font-mono text-micro">
                                <SectionLabel className="font-sans block mb-1">Pronged Howey Sec Analysis</SectionLabel>
                                <p><strong>1. Capital Investment:</strong> {p.howeyAnalysis.investmentOfMoney}</p>
                                <p><strong>2. Common Venture:</strong> {p.howeyAnalysis.commonEnterprise}</p>
                                <p><strong>3. Profit Projection:</strong> {p.howeyAnalysis.profitExpectation}</p>
                                <p><strong>4. Promoting Labors:</strong> {p.howeyAnalysis.effortsOfOthers}</p>
                              </div>
                            )}
                          </div>

                          {/* Column 2: Risks & Actions */}
                          <div className="space-y-3 flex flex-col justify-between">
                            <div>
                              <SectionLabel className="block">Gated Compliance Friction Points</SectionLabel>
                              {p.risks.length > 0 ? (
                                <ul className="list-disc list-inside mt-1 space-y-1 text-grey-dark pl-1.5">
                                  {p.risks.map((risk, idx) => (
                                    <li key={idx}>{risk}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-status-ready font-semibold flex items-center gap-1">No active compliance blocks detected.</p>
                              )}
                            </div>

                            <div className="pt-4 border-t border-line/60 mt-auto flex flex-col sm:flex-row sm:items-center gap-4">
                              <button
                                onClick={() => handleLinkToOntology(p.id)}
                                className="flex items-center gap-1.5 text-xs font-bold text-navy hover:text-grey dark:hover:text-grey underline transition-colors"
                              >
                                <ExternalLink size={13} />
                                <span>Inspect Registry connections on Ontology Graph</span>
                              </button>
                              <button
                                onClick={() => navigate('/howey?asset=' + p.id)}
                                className="flex items-center gap-1.5 text-xs font-bold text-cyan-700 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300 underline transition-colors"
                              >
                                <Scale size={13} />
                                <span>Simulate in Howey Calculator</span>
                              </button>
                            </div>

                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default ProductMatrix;
