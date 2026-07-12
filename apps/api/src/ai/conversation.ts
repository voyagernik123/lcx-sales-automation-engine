/**
 * 3-8 Conversation intelligence.
 *
 * Summarizes a message thread into { summary, actionItems, topics }.
 * Deterministic extractive approach: pick salient sentences, detect action
 * cues ("will send", "let's schedule", "?"), tag topics from a keyword map.
 * LLM (if keyed) produces a cleaner abstractive summary; the deterministic
 * result is always returned when the LLM is unavailable.
 */
import { llm } from './llm.js';

export interface ThreadMessage {
  from?: string; // 'them' | 'us' | name
  body: string;
}

export interface ThreadSummary {
  summary: string;
  actionItems: string[];
  topics: string[];
  usedLlm: boolean;
}

const TOPIC_MAP: Record<string, string[]> = {
  pricing: ['price', 'cost', 'fee', 'budget', 'expensive'],
  timing: ['when', 'timeline', 'quarter', 'schedule', 'launch date'],
  liquidity: ['volume', 'liquidity', 'market making', 'depth'],
  compliance: ['mica', 'compliance', 'regulation', 'legal', 'license', 'kyc'],
  meeting: ['call', 'meeting', 'demo', 'zoom', 'calendar'],
  competitor: ['binance', 'coinbase', 'other exchange', 'already listed'],
};

const ACTION_CUES = [
  'will send', 'i\'ll send', 'let me send', 'let\'s schedule', 'let\'s set up',
  'i\'ll follow up', 'follow up', 'get back to you', 'send over', 'share the',
  'introduce you', 'loop in', 'confirm', 'next step',
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function summarizeThreadDeterministic(messages: ThreadMessage[]): ThreadSummary {
  const all = (messages ?? []).map((m) => m.body || '').join(' ');
  const lower = all.toLowerCase();

  if (!all.trim()) {
    return { summary: 'Empty thread — no messages to summarize.', actionItems: [], topics: [], usedLlm: false };
  }

  const topics = Object.entries(TOPIC_MAP)
    .filter(([, kws]) => kws.some((k) => lower.includes(k)))
    .map(([topic]) => topic);

  const sentences = messages.flatMap((m) =>
    splitSentences(m.body || '').map((s) => ({ from: m.from ?? 'unknown', s })),
  );

  const actionItems = sentences
    .filter(({ s }) => ACTION_CUES.some((c) => s.toLowerCase().includes(c)))
    .map(({ from, s }) => `${from}: ${s}`)
    .slice(0, 8);

  // Questions are open threads worth surfacing as actions too.
  const questions = sentences.filter(({ s }) => s.endsWith('?')).map(({ from, s }) => `${from} asked: ${s}`).slice(0, 4);

  const first = messages[0]?.body ? splitSentences(messages[0].body)[0] : '';
  const last = messages[messages.length - 1]?.body ? splitSentences(messages[messages.length - 1].body).slice(-1)[0] : '';
  const summary =
    `${messages.length} message(s)${topics.length ? ` covering ${topics.join(', ')}` : ''}. ` +
    (first ? `Opened with: "${first.slice(0, 120)}". ` : '') +
    (last && last !== first ? `Latest: "${last.slice(0, 120)}".` : '');

  return {
    summary: summary.trim(),
    actionItems: dedupe([...actionItems, ...questions]),
    topics,
    usedLlm: false,
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

export async function summarizeThread(messages: ThreadMessage[]): Promise<ThreadSummary> {
  const base = summarizeThreadDeterministic(messages);
  if (!llm.available || !(messages ?? []).some((m) => m.body?.trim())) return base;

  const transcript = messages.map((m) => `${m.from ?? 'unknown'}: ${m.body}`).join('\n');
  const { text, usedLlm } = await llm.complete(
    `Summarize this sales conversation. Return ONLY JSON: ` +
      `{"summary": "<2-3 sentences>", "actionItems": [strings], "topics": [strings]}.\n\n${transcript.slice(0, 6000)}`,
    { feature: 'summarize', maxTokens: 512, temperature: 0.3 },
  );

  if (usedLlm && text) {
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as Partial<ThreadSummary>;
      return {
        summary: parsed.summary?.trim() || base.summary,
        actionItems: (parsed.actionItems ?? base.actionItems).slice(0, 12),
        topics: dedupe([...(parsed.topics ?? []), ...base.topics]),
        usedLlm: true,
      };
    } catch {
      // fall through
    }
  }
  return base;
}
