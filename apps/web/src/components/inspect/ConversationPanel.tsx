import { useEffect, useState } from 'react';
import { MessageSquare, CheckCircle2, ArrowRight, AlertTriangle, ShieldQuestion } from 'lucide-react';
import { fetchConversation, type ConversationInsights } from '@/lib/api/intel';

/**
 * Conversation intelligence panel (Wave 4b) — the extracted read of a project's
 * threads: sentiment, commitments made, next steps, risks and objections.
 * Deterministic (see @lcx/shared analyzeConversation); grows sharper as real
 * threads land.
 */

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300',
  neutral: 'border-line text-grey',
  negative: 'border-red-500/50 text-red-700 dark:text-red-300',
};

function List({ icon, label, items, tone }: { icon: React.ReactNode; label: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>
        {icon} {label}
      </div>
      <ul className="space-y-0.5">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-1.5 text-micro text-navy">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-grey/50" />
            <span className="leading-snug">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConversationPanel({ subjectId }: { subjectId: string }) {
  const [c, setC] = useState<ConversationInsights | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    setC('loading');
    fetchConversation(subjectId)
      .then((d) => !cancelled && setC(d))
      .catch(() => !cancelled && setC(null));
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  if (c === 'loading') {
    return <div className="mt-5 h-16 animate-pulse rounded-lg bg-ice-soft/60 dark:bg-ice-soft/10" />;
  }
  if (!c) return null;

  const totalSources = c.sources.handoffs + c.sources.messages + c.sources.notes;
  const nothing = totalSources === 0 || (c.commitments.length + c.nextSteps.length + c.risks.length + c.objections.length === 0);

  return (
    <section className="mt-5 border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
          <MessageSquare size={12} /> Conversation
        </div>
        <span className={`rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-wider ${SENTIMENT_STYLE[c.sentiment]}`}>
          {c.sentiment} {c.sentimentScore > 0 ? '+' : ''}{c.sentimentScore}
        </span>
      </div>

      {nothing ? (
        <p className="text-micro text-grey">No captured conversation yet — threads flow in from handoffs, sent messages and notes.</p>
      ) : (
        <>
          <List icon={<CheckCircle2 size={11} />} label="Commitments" items={c.commitments} tone="text-emerald-600 dark:text-emerald-400" />
          <List icon={<ArrowRight size={11} />} label="Next steps" items={c.nextSteps} tone="text-cyan-700 dark:text-cyan-400" />
          <List icon={<AlertTriangle size={11} />} label="Risks" items={c.risks} tone="text-amber-600 dark:text-amber-400" />
          <List icon={<ShieldQuestion size={11} />} label="Objections" items={c.objections} tone="text-red-600 dark:text-red-400" />
          <div className="mt-2 font-mono text-[9px] text-grey/70">
            {c.sources.handoffs} handoffs · {c.sources.messages} messages{c.sources.notes ? ` · ${c.sources.notes} notes` : ''}
          </div>
        </>
      )}
    </section>
  );
}
