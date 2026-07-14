import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { fetchIntegrationStatus, type IntegrationService } from '@/lib/api/bd';
import { PageTitle } from '@/components/ui';
import { LlmBadge } from '@/components/ai/common';
import { LlmStatusIndicator } from '@/components/ai/LlmStatusIndicator';
import { SentimentPanel } from '@/components/ai/SentimentPanel';
import { ObjectionPanel } from '@/components/ai/ObjectionPanel';
import { ReplyDrafterPanel } from '@/components/ai/ReplyDrafterPanel';
import { PersonalizerPanel } from '@/components/ai/PersonalizerPanel';

type TabId = 'sentiment' | 'objection' | 'drafter' | 'personalizer';

const TABS: { id: TabId; label: string }[] = [
  { id: 'sentiment', label: 'Sentiment Analyzer' },
  { id: 'objection', label: 'Objection Handler' },
  { id: 'drafter', label: 'Reply Drafter' },
  { id: 'personalizer', label: 'Personalizer' },
];

export function AiTools() {
  const [tab, setTab] = useState<TabId>('sentiment');
  const [llmService, setLlmService] = useState<IntegrationService | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchIntegrationStatus()
      .then((services) => {
        if (!cancelled) setLlmService(services.find((s) => s.id === 'anthropic') ?? null);
      })
      .catch(() => {
        /* header indicator is best-effort; tools still work without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <PageTitle
        icon={<Bot size={20} />}
        actions={<LlmStatusIndicator service={llmService} />}
        subtitle={
          <>
            Deterministic by default — every tool works with no API key. When an ANTHROPIC_API_KEY is
            configured, results are refined by the LLM and tagged <LlmBadge />.
          </>
        }
      >
        AI Console
      </PageTitle>

      <div className="flex gap-1 border-b border-line" role="tablist" aria-label="AI tools">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'border-cyan-600 text-navy'
                : 'border-transparent text-grey hover:text-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panels stay mounted so inputs/results survive tab switches. */}
      <div className={tab === 'sentiment' ? '' : 'hidden'}>
        <SentimentPanel />
      </div>
      <div className={tab === 'objection' ? '' : 'hidden'}>
        <ObjectionPanel />
      </div>
      <div className={tab === 'drafter' ? '' : 'hidden'}>
        <ReplyDrafterPanel />
      </div>
      <div className={tab === 'personalizer' ? '' : 'hidden'}>
        <PersonalizerPanel />
      </div>
    </div>
  );
}
