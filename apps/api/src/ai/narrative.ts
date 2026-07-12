/**
 * 3-3 Narrative scoring.
 *
 * Scores how strong/fundable a project's story is (0-100) from its category,
 * website and whitepaper text. Deterministic keyword-bucket scorer always runs;
 * when a key is set the LLM re-reads the rationale and may nudge the score
 * within a bounded window (never a blind overwrite).
 */
import { llm } from './llm.js';

export interface NarrativeInput {
  name?: string;
  category?: string | null;
  website?: string | null;
  whitepaperText?: string | null;
}

export interface NarrativeResult {
  score: number; // 0..100
  rationale: string;
  signals: string[];
  usedLlm: boolean;
}

// Hot narratives that sell in the current crypto cycle → weighted buckets.
const NARRATIVE_BUCKETS: Array<{ label: string; weight: number; terms: string[] }> = [
  { label: 'AI / DePIN', weight: 20, terms: ['ai', 'artificial intelligence', 'agent', 'depin', 'gpu', 'compute', 'inference'] },
  { label: 'RWA / tokenization', weight: 20, terms: ['rwa', 'real world asset', 'tokeniz', 'treasury', 'bond', 'stablecoin'] },
  { label: 'Layer-2 / scaling', weight: 15, terms: ['layer 2', 'l2', 'rollup', 'zk', 'zero knowledge', 'scaling', 'modular'] },
  { label: 'DeFi', weight: 12, terms: ['defi', 'lending', 'perp', 'dex', 'yield', 'liquidity', 'amm'] },
  { label: 'Gaming / consumer', weight: 10, terms: ['game', 'gaming', 'gamefi', 'social', 'consumer', 'nft'] },
  { label: 'Infrastructure', weight: 10, terms: ['oracle', 'bridge', 'wallet', 'infrastructure', 'interoperab', 'data availability'] },
];

// Signals of a credible, fundable team/product.
const CREDIBILITY = [
  'backed by', 'raised', 'series a', 'series b', 'seed round', 'audit', 'audited',
  'mainnet', 'partnership', 'grant', 'testnet live', 'tvl', 'daily active',
];

export function scoreNarrativeDeterministic(input: NarrativeInput): NarrativeResult {
  const corpus = [input.category, input.website, input.whitepaperText, input.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const signals: string[] = [];
  let score = 30; // baseline for having any presence

  if (!corpus.trim()) {
    return { score: 0, rationale: 'No website, whitepaper, or category on file — narrative unknown.', signals: [], usedLlm: false };
  }

  let bucketBonus = 0;
  for (const b of NARRATIVE_BUCKETS) {
    if (b.terms.some((t) => corpus.includes(t))) {
      bucketBonus = Math.max(bucketBonus, b.weight); // dominant narrative, not additive spam
      signals.push(`narrative: ${b.label}`);
    }
  }
  score += bucketBonus;

  const cred = CREDIBILITY.filter((c) => corpus.includes(c));
  score += Math.min(30, cred.length * 8);
  signals.push(...cred.map((c) => `credibility: ${c}`));

  // Depth bonus — a real whitepaper vs a one-liner.
  const wp = (input.whitepaperText ?? '').length;
  if (wp > 4000) { score += 15; signals.push('depth: substantial whitepaper'); }
  else if (wp > 800) { score += 8; signals.push('depth: whitepaper present'); }

  if (input.website) { score += 5; signals.push('has website'); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const top = signals.find((s) => s.startsWith('narrative:'))?.replace('narrative: ', '') ?? 'undifferentiated';
  const rationale =
    `Narrative score ${score}/100 — primary story: ${top}. ` +
    (cred.length ? `Credibility markers: ${cred.slice(0, 4).join(', ')}. ` : 'Few credibility markers found. ') +
    (wp > 800 ? 'Whitepaper provides substance.' : 'Thin documentation.');

  return { score, rationale, signals, usedLlm: false };
}

export async function scoreNarrative(input: NarrativeInput): Promise<NarrativeResult> {
  const base = scoreNarrativeDeterministic(input);
  if (!llm.available || base.score === 0) return base;

  const { text, usedLlm } = await llm.complete(
    `You are scoring a crypto project's narrative strength for an exchange-listing pitch. ` +
      `Deterministic baseline score is ${base.score}/100. ` +
      `Return a JSON object {"score": <0-100 integer within 15 of the baseline>, "rationale": "<one sentence>"}.\n\n` +
      `Project: ${input.name ?? 'unknown'}\nCategory: ${input.category ?? 'n/a'}\n` +
      `Website: ${input.website ?? 'n/a'}\nWhitepaper excerpt: ${(input.whitepaperText ?? '').slice(0, 2000)}`,
    { feature: 'narrative', maxTokens: 256, temperature: 0.3 },
  );

  if (usedLlm && text) {
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as { score?: number; rationale?: string };
      if (typeof parsed.score === 'number') {
        // Clamp within ±15 of baseline so the LLM can't wildly overwrite.
        const clamped = Math.max(base.score - 15, Math.min(base.score + 15, Math.round(parsed.score)));
        return {
          score: Math.max(0, Math.min(100, clamped)),
          rationale: parsed.rationale?.trim() || base.rationale,
          signals: base.signals,
          usedLlm: true,
        };
      }
    } catch {
      // fall through to deterministic
    }
  }
  return base;
}
