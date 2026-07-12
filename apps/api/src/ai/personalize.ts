/**
 * 3-4 Personalized content.
 *
 * Takes a base draft and known project facts and produces a personalized draft.
 * Deterministic path does token substitution + prepends a fact-based opener.
 * LLM (if keyed) weaves the facts in naturally. Facts are only ever *added* —
 * the base draft body is preserved deterministically so claims stay intact.
 */
import { llm } from './llm.js';

export interface ProjectFacts {
  projectName?: string;
  ticker?: string | null;
  category?: string | null;
  exchangeCount?: number | null;
  marketCapUsd?: number | null;
  recentNews?: string | null;
  contactName?: string | null;
}

export interface PersonalizeResult {
  draft: string;
  insertedFacts: string[];
  usedLlm: boolean;
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

/** Build the deterministic personalization opener from available facts. */
function buildOpener(facts: ProjectFacts): { opener: string; used: string[] } {
  const used: string[] = [];
  const bits: string[] = [];
  if (facts.exchangeCount && facts.exchangeCount >= 2) {
    bits.push(`already live on ${facts.exchangeCount} exchanges`);
    used.push('exchangeCount');
  }
  if (facts.marketCapUsd) {
    bits.push(`a ${fmtUsd(facts.marketCapUsd)} market cap`);
    used.push('marketCapUsd');
  }
  if (facts.category) {
    bits.push(`the ${facts.category} space`);
    used.push('category');
  }
  if (facts.recentNews) {
    bits.push(`your recent ${facts.recentNews}`);
    used.push('recentNews');
  }
  if (bits.length === 0) return { opener: '', used };
  const name = facts.projectName ?? 'your project';
  return { opener: `I've been following ${name} — ${bits.join(', ')}. `, used };
}

export function personalizeDraftDeterministic(baseDraft: string, facts: ProjectFacts): PersonalizeResult {
  let draft = baseDraft || '';
  // Simple token substitution for any {{tokens}} the base may carry.
  draft = draft
    .replace(/\{\{\s*projectName\s*\}\}/g, facts.projectName ?? 'your project')
    .replace(/\{\{\s*ticker\s*\}\}/g, facts.ticker ?? '')
    .replace(/\{\{\s*contactName\s*\}\}/g, facts.contactName ?? 'there');

  const { opener, used } = buildOpener(facts);
  if (opener) draft = `${opener}\n\n${draft}`;
  return { draft, insertedFacts: used, usedLlm: false };
}

export async function personalizeDraft(baseDraft: string, facts: ProjectFacts): Promise<PersonalizeResult> {
  const base = personalizeDraftDeterministic(baseDraft, facts);
  if (!llm.available || !baseDraft?.trim()) return base;

  const { text, usedLlm } = await llm.complete(
    `Personalize this outreach draft using the project facts. Weave facts in naturally, keep it concise, ` +
      `do NOT invent facts beyond those given, and keep any call-to-action intact. Return only the message.\n\n` +
      `Facts: ${JSON.stringify(facts)}\n\nDraft:\n${baseDraft}`,
    {
      feature: 'personalize',
      system: 'You personalize crypto-exchange BD outreach. Never fabricate metrics or news.',
      maxTokens: 512,
      temperature: 0.5,
    },
  );

  if (usedLlm && text) {
    return { draft: text, insertedFacts: base.insertedFacts, usedLlm: true };
  }
  return base;
}
