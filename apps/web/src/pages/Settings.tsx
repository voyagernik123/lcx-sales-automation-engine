import { useState } from 'react';
import { useAuditStore, AuditLog } from '@/stores/useAuditStore';
import { Sliders, Terminal, Trash2, Info } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared';
import { clsx } from 'clsx';

const logCategoryBadge: Record<AuditLog['category'], string> = {
  Audit: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  Architecture: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  Scenario: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  System: 'bg-slate-500/10 text-slate-500 border-slate-500/30',
};

export function Settings() {
  const { auditLogs, clearAuditLogs, safeHarborToggles, toggleSafeHarbor } = useAuditStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const { defiExempt, commodityExempt, micaExempt } = safeHarborToggles;

  const handleClearLogs = () => {
    clearAuditLogs();
    setShowClearConfirm(false);
  };

  return (
    <div className="space-y-4 text-navy dark:text-ice h-[calc(100vh-6.5rem)] flex flex-col overflow-hidden min-h-0">
      <div className="shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sliders size={24} className="text-navy dark:text-ice" /> Apollo Systems Console</h1>
          <p className="text-sm text-grey-dark dark:text-grey-light mt-0.5">
            Configure compliance session settings, toggle legislative safe harbor models, and inspect logs history.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">

        <div className="w-full lg:w-96 bg-card border border-line rounded-lg p-4 overflow-y-auto space-y-4 shrink-0 shadow-sm">
          <span className="font-bold text-[10px] uppercase tracking-wider text-grey block">
            System Feature Toggles
          </span>

          <div className="space-y-4 pt-1">
            {[
              {
                key: 'defiExempt' as const,
                title: 'DeFi Exemption Safe Harbor',
                desc: 'Applies CFTC safe harbors to non-custodial operations, automatically resolving wallet surveillance checks.',
                value: defiExempt,
              },
              {
                key: 'commodityExempt' as const,
                title: 'CFTC Commodity Designation',
                desc: 'Classifies asset listings as commodities, reducing Howey Test securities litigation index scores by 25%.',
                value: commodityExempt,
              },
              {
                key: 'micaExempt' as const,
                title: 'Liechtenstein MiCA Reciprocation',
                desc: 'Enables regulatory equivalence passport rules, removing corporate registration blockers.',
                value: micaExempt,
              },
            ].map(({ key, title, desc, value }) => (
              <div key={key} className="flex items-start justify-between gap-4 border border-line rounded p-3 bg-ice-soft/20 dark:bg-navy-deep/10">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-navy dark:text-ice block">{title}</span>
                  <p className="text-[10px] text-grey-dark dark:text-grey-light leading-relaxed">{desc}</p>
                </div>
                <button
                  onClick={() => toggleSafeHarbor(key)}
                  className={clsx(
                    'w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 outline-none',
                    value ? 'bg-cyan-500' : 'bg-line'
                  )}
                  role="switch"
                  aria-checked={value}
                  aria-label={`Toggle ${title}`}
                >
                  <div className={clsx('h-4 w-4 bg-card rounded-full shadow-sm transform transition-transform', value ? 'translate-x-4' : 'translate-x-0')} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-slate-950 text-slate-100 rounded-lg border border-slate-900 shadow-md font-mono text-[10px] overflow-hidden h-full flex flex-col">
          <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-cyan-500 animate-pulse-beacon" />
              <span className="uppercase text-[9px] font-bold text-cyan-400">Compliance Audit Trail Logger</span>
            </div>

            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={auditLogs.length === 0}
              className="text-slate-500 hover:text-red-400 disabled:opacity-30 flex items-center gap-1 font-bold font-mono transition-colors text-[9px]"
              aria-label="Clear audit history"
            >
              <Trash2 size={11} /> Clear History
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono leading-relaxed select-text">
            {auditLogs.length === 0 ? (
              <p className="text-slate-600 text-center py-12">No compliance log records registered.</p>
            ) : (
              auditLogs.map((log, idx) => (
                <div key={`log-${idx}`} className="flex items-start gap-2.5 break-words">
                  <span className="text-slate-600 select-none shrink-0 font-bold font-mono">{log.timestamp}</span>
                  <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold border font-sans uppercase shrink-0', logCategoryBadge[log.category])}>
                    {log.category}
                  </span>
                  <span className="text-slate-300 font-mono">{log.message}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-slate-900 px-3 py-2.5 border-t border-slate-800 text-[9px] text-slate-500 leading-normal flex items-start gap-1.5 select-none shrink-0">
            <Info size={10} className="shrink-0 text-slate-400 mt-0.5" />
            <span>Audit trail logs records compliance actions during the active session. Cleared logs are permanently purged from session storage.</span>
          </div>
        </div>

      </div>

      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearLogs}
        title="Clear Audit History"
        message="This action will permanently delete all audit trail log entries from this session. This action cannot be undone."
        confirmLabel="Clear All Logs"
        cancelLabel="Keep Records"
        variant="danger"
      />
    </div>
  );
}
export default Settings;
