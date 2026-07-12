/**
 * 3-2 Sentiment classification.
 *
 * Deterministic keyword heuristic always returns a label; when a key is set the
 * LLM refines it (constrained to the same four labels, so the result type never
 * changes). Used to tag inbound replies so the queue can surface objections and
 * hot leads first.
 */
import { llm } from './llm.js';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'objection';

export interface SentimentResult {
  sentiment: Sentiment;
  confidence: number; // 0..1 heuristic strength
  matched: string[]; // keywords that drove the call
  usedLlm: boolean;
}

const POSITIVE = [
  'interested', 'keen', 'love', 'great', 'sounds good', 'happy to', 'let\'s do',
  'lets do', 'yes', 'sure', 'perfect', 'excited', 'looking forward', 'book',
  'schedule a call', 'set up a call', 'go ahead', 'sign', 'onboard',
];
const NEGATIVE = [
  'not interested', 'no thanks', 'unsubscribe', 'stop', 'remove me', 'do not',
  'don\'t contact', 'spam', 'never', 'waste of time', 'annoyed', 'leave me alone',
];
// Objections = engaged-but-resistant. These outrank plain negative because they
// are a sales opportunity, not a dead end.
const OBJECTION = [
  'too expensive', 'expensive', 'cost', 'price', 'budget', 'fee', 'fees',
  'already listed', 'already on', 'why lcx', 'why should', 'competitor',
  'volume', 'liquidity concern', 'not sure', 'need to think', 'later', 'not now',
  'q1', 'q2', 'q3', 'q4', 'next quarter', 'no volume', 'small exchange',
  'regulation', 'compliance', 'legal', 'concern',
];

function countHits(haystack: string, needles: string[]): string[] {
  const hits: string[] = [];
  for (const n of needles) {
    if (haystack.includes(n)) hits.push(n);
  }
  return hits;
}

/** Deterministic label — always available, no key required. */
export function classifySentimentDeterministic(text: string): SentimentResult {
  const t = (text || '').toLowerCase();
  const pos = countHits(t, POSITIVE);
  const neg = countHits(t, NEGATIVE);
  const obj = countHits(t, OBJECTION);

  // Objection wins when present AND there's no hard negative rejection.
  if (obj.length > 0 && neg.length === 0) {
    return { sentiment: 'objection', confidence: Math.min(1, 0.4 + obj.length * 0.2), matched: obj, usedLlm: false };
  }
  if (neg.length > pos.length) {
    return { sentiment: 'negative', confidence: Math.min(1, 0.4 + neg.length * 0.2), matched: neg, usedLlm: false };
  }
  if (pos.length > 0) {
    return { sentiment: 'positive', confidence: Math.min(1, 0.4 + pos.length * 0.2), matched: pos, usedLlm: false };
  }
  if (obj.length > 0) {
    return { sentiment: 'objection', confidence: 0.4, matched: obj, usedLlm: false };
  }
  return { sentiment: 'neutral', confidence: 0.3, matched: [], usedLlm: false };
}

const VALID: Sentiment[] = ['positive', 'neutral', 'negative', 'objection'];

/** LLM-refined when keyed; otherwise identical to the deterministic result. */
export async function classifySentiment(text: string): Promise<SentimentResult> {
  const base = classifySentimentDeterministic(text);
  if (!llm.available || !text?.trim()) return base;

  const { text: out, usedLlm } = await llm.complete(
    `Classify the sentiment of this sales-reply message as exactly one of: positive, neutral, negative, objection. ` +
      `"objection" means engaged but pushing back (price, timing, competitor, compliance). ` +
      `Reply with ONLY the single word.\n\nMessage:\n${text}`,
    { feature: 'sentiment', maxTokens: 8, temperature: 0 },
  );

  if (usedLlm) {
    const label = out.toLowerCase().replace(/[^a-z]/g, '') as Sentiment;
    if (VALID.includes(label)) {
      return { ...base, sentiment: label, usedLlm: true };
    }
  }
  return base;
}
