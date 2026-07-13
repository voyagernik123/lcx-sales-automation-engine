import { useState } from 'react';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import type { IntegrationService } from '@/lib/api/bd';

/**
 * Header chip showing whether the Anthropic LLM is live or the app is running
 * on deterministic fallbacks, with a collapsible setup box.
 */
export function LlmStatusIndicator({ service }: { service: IntegrationService | null }) {
  const [open, setOpen] = useState(false);

  if (!service) return null;
  const live = service.mode === 'live';

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2 rounded-full border border-line px-3 py-1">
        <span
          className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'}`}
          aria-hidden="true"
        />
        <span className="text-[11px] font-semibold">
          {live ? 'LLM active' : 'Deterministic fallback mode'}
        </span>
        {live && service.maskedKey && (
          <span className="font-mono text-[10px] text-grey">{service.maskedKey}</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-grey hover:text-navy"
        >
          <Settings2 size={11} /> Configure LLM
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      </div>
      {open && (
        <div className="max-w-md rounded border border-line bg-card p-2.5 text-left text-[11px] text-grey">
          <p className="mb-1 font-bold text-navy">{service.name}</p>
          <p>{service.setup}</p>
        </div>
      )}
    </div>
  );
}
