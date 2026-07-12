import { useState } from 'react';
import { Bot, MessageSquare, Shield, Sparkles } from 'lucide-react';
import { request } from '@/lib/apiClient';

interface SentimentData {
  sentiment: 'positive' | 'neutral' | 'negative' | 'objection';
  confidence: number;
  matched: string[];
  usedLlm: boolean;
}

interface ObjectionData {
  category: string;
  response: string;
  matched: string[];
  usedLlm: boolean;
}

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  negative: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  objection: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

function LlmBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
      <Sparkles size={9} /> LLM
    </span>
  );
}

function SentimentBox() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: SentimentData }>('/v1/ai/sentiment', { body: { text } });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <MessageSquare size={15} /> Sentiment
      </h2>
      <p className="mb-2 text-[11px] text-grey">Classify an inbound reply as positive / neutral / negative / objection.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste a prospect's reply…"
        className="w-full rounded border border-line bg-transparent p-2 text-xs"
      />
      <button
        onClick={() => void run()}
        disabled={loading || !text.trim()}
        className="mt-2 inline-flex items-center gap-1 rounded border border-line px-3 py-1 text-[11px] font-semibold hover:bg-ice-soft disabled:opacity-50 dark:hover:bg-ice-soft/10"
      >
        <Bot size={12} /> {loading ? 'Analyzing…' : 'Classify'}
      </button>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${SENTIMENT_STYLE[result.sentiment]}`}>
              {result.sentiment}
            </span>
            <span className="text-[11px] text-grey font-mono">conf {Math.round(result.confidence * 100)}%</span>
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

function ObjectionBox() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ObjectionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: ObjectionData }>('/v1/ai/objection-response', { body: { text } });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Shield size={15} /> Objection response
      </h2>
      <p className="mb-2 text-[11px] text-grey">Get a suggested reply to a pushback (price, timing, competitor, compliance…).</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. Your listing fee is too expensive for us right now"
        className="w-full rounded border border-line bg-transparent p-2 text-xs"
      />
      <button
        onClick={() => void run()}
        disabled={loading || !text.trim()}
        className="mt-2 inline-flex items-center gap-1 rounded border border-line px-3 py-1 text-[11px] font-semibold hover:bg-ice-soft disabled:opacity-50 dark:hover:bg-ice-soft/10"
      >
        <Bot size={12} /> {loading ? 'Thinking…' : 'Suggest reply'}
      </button>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold">{result.category}</span>
            {result.usedLlm && <LlmBadge />}
          </div>
          <p className="rounded border border-line p-2 text-[12px] leading-relaxed">{result.response}</p>
        </div>
      )}
    </div>
  );
}

export function AiTools() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Bot size={18} /> AI Console
        </h1>
        <p className="mt-1 text-[11px] text-grey">
          Deterministic by default — every tool works with no API key. When an ANTHROPIC_API_KEY is configured,
          results are refined by the LLM and tagged <LlmBadge />.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SentimentBox />
        <ObjectionBox />
      </div>
    </div>
  );
}
