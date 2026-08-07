import { AiProse } from './AiProse';
import { useState } from 'react';
import { fetchObjectionResponse, type ObjectionResult } from '@/lib/api/bd';
import { CopyButton, LlmBadge, RunButton, inputClass, panelClass, aiBoxClass } from './common';

export function ObjectionPanel() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ObjectionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!text.trim()) return;
    setRunning(true);
    setError('');
    try {
      setResult(await fetchObjectionResponse(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suggest a response');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={panelClass}>
      <p className="mb-2 text-label text-grey">
        Get a suggested reply to a pushback (price, timing, competitor, compliance…).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="e.g. Your listing fee is too expensive for us right now"
        className={inputClass}
      />
      <RunButton running={running} disabled={!text.trim()} onClick={() => void run()} runningLabel="Thinking…">
        Suggest reply
      </RunButton>
      {error && <p className="mt-2 text-label text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-label font-bold dark:bg-slate-800">
              {result.category}
            </span>
            {result.usedLlm && <LlmBadge />}
            <CopyButton text={result.response} label="Copy reply" />
          </div>
          <div className={aiBoxClass}>
            <AiProse text={result.response} validIds={[]} />
          </div>
        </div>
      )}
    </div>
  );
}
