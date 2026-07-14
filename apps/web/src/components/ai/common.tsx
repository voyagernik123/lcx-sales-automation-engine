import type { ReactNode } from 'react';
import { Bot, Copy, Loader2, Sparkles } from 'lucide-react';
import { toast } from '@/components/shared';

export function LlmBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
      <Sparkles size={9} /> LLM
    </span>
  );
}

/** Copies `text` to the clipboard and confirms with a toast. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('success', 'Copied to clipboard');
    } catch {
      toast('error', 'Copy failed');
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs font-semibold text-grey hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
    >
      <Copy size={10} /> {label}
    </button>
  );
}

/** Run button with disabled + spinner while an AI call is in flight. */
export function RunButton({
  running,
  disabled,
  onClick,
  children,
  runningLabel = 'Running…',
}: {
  running: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  runningLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={running || disabled}
      className="mt-2 inline-flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-label font-semibold hover:bg-ice-soft disabled:opacity-50 dark:hover:bg-ice-soft/10"
    >
      {running ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
      {running ? runningLabel : children}
    </button>
  );
}

export const panelClass = 'rounded-lg border border-line bg-card p-4';
export const inputClass =
  'w-full rounded border border-line bg-transparent p-2 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500';
export const labelClass = 'text-micro font-bold uppercase tracking-wider text-grey';
export const resultBoxClass =
  'whitespace-pre-wrap rounded border border-line bg-ice-soft/40 dark:bg-ice-soft/5 p-2.5 text-label leading-relaxed';
