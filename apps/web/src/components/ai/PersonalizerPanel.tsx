import { useState } from 'react';
import { personalizeDraftAi, type PersonalizeFacts, type PersonalizeResult } from '@/lib/api/bd';
import { CopyButton, LlmBadge, RunButton, inputClass, labelClass, panelClass, resultBoxClass } from './common';

export function PersonalizerPanel() {
  const [baseDraft, setBaseDraft] = useState('');
  const [projectName, setProjectName] = useState('');
  const [contactName, setContactName] = useState('');
  const [ticker, setTicker] = useState('');
  const [category, setCategory] = useState('');
  const [exchangeCount, setExchangeCount] = useState('');
  const [marketCapUsd, setMarketCapUsd] = useState('');
  const [recentNews, setRecentNews] = useState('');
  const [result, setResult] = useState<PersonalizeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!baseDraft.trim()) return;
    setRunning(true);
    setError('');
    const facts: PersonalizeFacts = {};
    if (projectName.trim()) facts.projectName = projectName.trim();
    if (contactName.trim()) facts.contactName = contactName.trim();
    if (ticker.trim()) facts.ticker = ticker.trim();
    if (category.trim()) facts.category = category.trim();
    if (recentNews.trim()) facts.recentNews = recentNews.trim();
    const exchanges = Number(exchangeCount);
    if (exchangeCount.trim() && Number.isFinite(exchanges)) facts.exchangeCount = exchanges;
    const mcap = Number(marketCapUsd);
    if (marketCapUsd.trim() && Number.isFinite(mcap)) facts.marketCapUsd = mcap;
    try {
      setResult(await personalizeDraftAi(baseDraft, facts));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to personalize draft');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={panelClass}>
      <p className="mb-3 text-[11px] text-grey">
        Weave known project facts into a base draft. Facts are only ever added — claims in the base draft
        stay intact. Supports {'{{projectName}}'}, {'{{ticker}}'} and {'{{contactName}}'} tokens.
      </p>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Base draft</span>
        <textarea
          value={baseDraft}
          onChange={(e) => setBaseDraft(e.target.value)}
          rows={5}
          placeholder={'Hi {{contactName}}, quick note about {{projectName}}…'}
          className={inputClass}
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Project name</span>
          <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Contact name</span>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Ticker</span>
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Category</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. DeFi"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Exchange count</span>
          <input
            type="number"
            min={0}
            value={exchangeCount}
            onChange={(e) => setExchangeCount(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Market cap (USD)</span>
          <input
            type="number"
            min={0}
            value={marketCapUsd}
            onChange={(e) => setMarketCapUsd(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span className={labelClass}>Recent news</span>
          <input
            value={recentNews}
            onChange={(e) => setRecentNews(e.target.value)}
            placeholder="e.g. mainnet v2 launch"
            className={inputClass}
          />
        </label>
      </div>
      <RunButton running={running} disabled={!baseDraft.trim()} onClick={() => void run()} runningLabel="Personalizing…">
        Personalize
      </RunButton>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      {result && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {result.usedLlm && <LlmBadge />}
            {result.insertedFacts.length > 0 && (
              <span className="text-[10px] text-grey">Facts woven in: {result.insertedFacts.join(', ')}</span>
            )}
            <CopyButton text={result.draft} label="Copy draft" />
          </div>
          <p className={resultBoxClass}>{result.draft}</p>
        </div>
      )}
    </div>
  );
}
