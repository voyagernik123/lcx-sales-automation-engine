import { useState } from 'react';
import { analyzeSentiment, type SentimentResult } from '@/lib/api/bd';
import { LlmBadge, RunButton, inputClass, panelClass } from './common';

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  negative: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  objection: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

export function SentimentPanel() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!text.trim()) return;
    setRunning(true);
    setError('');
    try {
      setResult(await analyzeSentiment(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to classify sentiment');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={panelClass}>
      <p className="mb-2 text-[11px] text-grey">
        Classify an inbound reply as positive / neutral / negative / objection.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Paste a prospect's reply…"
        className={inputClass}
      />
      <RunButton running={running} disabled={!text.trim()} onClick={() => void run()} runningLabel="Analyzing…">
        Classify
      </RunButton>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${SENTIMENT_STYLE[result.sentiment]}`}>
              {result.sentiment}
            </span>
            <span className="font-mono text-[11px] text-grey">conf {Math.round(result.confidence * 100)}%</span>
            {result.usedLlm && <LlmBadge />}
          </div>
          {result.matched.length > 0 && (
            <p className="text-[10px] text-grey">Signals: {result.matched.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
