/**
 * 3-6 LLM enrichment.
 *
 * Extracts structured facts — team, funding, competitors — from a project's
 * website copy / whitepaper text. Deterministic regex + keyword heuristics run
 * first; when a key is set the LLM extracts a richer set and the two are merged
 * (LLM values win only where the heuristic found nothing).
 */
import { llm } from './llm.js';

export interface ProjectFactsExtract {
  team: string[];
  funding: string[];
  competitors: string[];
  usedLlm: boolean;
}

// Funding phrases like "raised $12M", "$5.5 million seed", "Series A".
const FUNDING_RE =
  /(raised\s+\$?\d[\d.,]*\s*(?:k|m|b|million|billion)?|\$\d[\d.,]*\s*(?:k|m|b|million|billion)\b|series\s+[a-d]\b|seed\s+round|pre-seed)/gi;

// Team: "John Smith, CEO" / "CEO John Smith" / "founded by X".
const ROLE_RE =
  /([A-Z][a-z]+\s+[A-Z][a-z]+)\s*,?\s*\(?\s*(CEO|CTO|COO|CFO|Founder|Co-?Founder|Head of [A-Za-z ]+)\)?/g;
const FOUNDED_RE = /founded by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi;

const COMPETITOR_HINTS = [
  'competitor', 'competitors', 'unlike', 'compared to', 'alternative to', 'vs\\.', 'versus',
  'rivals', 'incumbent',
];
const KNOWN_PROTOCOLS = [
  'uniswap', 'aave', 'chainlink', 'binance', 'coinbase', 'solana', 'ethereum',
  'polygon', 'arbitrum', 'optimism', 'maker', 'compound', 'lido',
];

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

export function extractProjectFactsDeterministic(text: string): ProjectFactsExtract {
  const src = text || '';
  const lower = src.toLowerCase();

  const funding = dedupe([...src.matchAll(FUNDING_RE)].map((m) => m[0]));

  const team: string[] = [];
  for (const m of src.matchAll(ROLE_RE)) team.push(`${m[1]} (${m[2]})`);
  for (const m of src.matchAll(FOUNDED_RE)) team.push(`${m[1]} (Founder)`);

  const competitors: string[] = [];
  for (const proto of KNOWN_PROTOCOLS) {
    if (lower.includes(proto)) competitors.push(proto);
  }
  // Only keep protocol mentions when framed competitively.
  const framedCompetitively = COMPETITOR_HINTS.some((h) => new RegExp(h).test(lower));

  return {
    team: dedupe(team),
    funding,
    competitors: framedCompetitively ? dedupe(competitors) : [],
    usedLlm: false,
  };
}

export async function extractProjectFacts(text: string): Promise<ProjectFactsExtract> {
  const base = extractProjectFactsDeterministic(text);
  if (!llm.available || !text?.trim()) return base;

  const { text: out, usedLlm } = await llm.complete(
    `Extract structured facts from this crypto project's website/whitepaper text. ` +
      `Return ONLY a JSON object: {"team": [strings], "funding": [strings], "competitors": [strings]}. ` +
      `Use only facts stated in the text; empty arrays if unknown.\n\n${text.slice(0, 6000)}`,
    { feature: 'enrich', maxTokens: 512, temperature: 0.2 },
  );

  if (usedLlm && out) {
    try {
      const parsed = JSON.parse(out.replace(/```json|```/g, '').trim()) as Partial<ProjectFactsExtract>;
      return {
        // LLM values win only where the heuristic came up empty; otherwise merge.
        team: dedupe([...base.team, ...(parsed.team ?? [])]),
        funding: dedupe([...base.funding, ...(parsed.funding ?? [])]),
        competitors: dedupe([...base.competitors, ...(parsed.competitors ?? [])]),
        usedLlm: true,
      };
    } catch {
      // fall through
    }
  }
  return base;
}
