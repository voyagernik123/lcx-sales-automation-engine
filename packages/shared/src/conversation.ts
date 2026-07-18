/**
 * Conversation intelligence (Wave 4b) — Gong-style extraction, deterministic.
 *
 * Given the text of a thread (emails/DMs/notes), pull out what a rep would
 * highlight: commitments made, risks/objections raised, the next steps, and an
 * overall sentiment. Pure keyword/pattern heuristics (free-tier, no LLM); an LLM
 * can refine later behind the seam. Precision-biased — better to surface a few
 * solid items than to hallucinate.
 */

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface ConversationInsights {
  sentiment: Sentiment;
  sentimentScore: number; // −100..100
  commitments: string[];
  nextSteps: string[];
  risks: string[];
  objections: string[];
  messageCount: number;
}

const POSITIVE = [
  'interested', 'excited', 'great', 'love', 'keen', 'makes sense', 'sounds good', 'let’s do', "let's do",
  'happy to', 'look forward', 'perfect', 'aligned', 'yes', 'agree', 'thanks', 'appreciate',
];
const NEGATIVE = [
  'not interested', 'no thanks', 'too expensive', 'concern', 'worried', 'unfortunately', 'decline',
  'hold off', 'not now', 'busy', 'pass', 'disappointed', 'problem', 'issue', 'delay', 'expensive', 'can’t', "can't",
];

const COMMIT_CUES = ['we will', 'we’ll', "we'll", 'i will', 'i’ll', "i'll", 'we can', 'happy to', 'will send', 'will share', 'will get back', 'plan to', 'we commit', 'agreed to'];
const NEXT_CUES = ['next step', 'follow up', 'follow-up', 'circle back', 'schedule', 'set up a call', 'book a', 'let’s meet', "let's meet", 'send over', 'review', 'get back to you', 'touch base'];
const RISK_CUES = ['concern', 'worried', 'risk', 'not sure', 'budget', 'legal', 'compliance', 'competitor', 'timing', 'internally', 'need approval', 'board', 'runway', 'hesitant'];
const OBJECTION_CUES = ['too expensive', 'fees', 'why lcx', 'already listed', 'not now', 'no budget', 'later', 'we use', 'happy with', 'cheaper', 'what makes you different'];

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 240);
}

function matchAny(lower: string, cues: string[]): boolean {
  return cues.some((c) => lower.includes(c));
}

function collect(sents: string[], cues: string[], cap = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sents) {
    if (matchAny(s.toLowerCase(), cues)) {
      const key = s.toLowerCase().slice(0, 60);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(s);
        if (out.length >= cap) break;
      }
    }
  }
  return out;
}

/** Extract insights from a thread's combined text. `messageCount` is informational. */
export function analyzeConversation(text: string, messageCount = 0): ConversationInsights {
  const clean = (text ?? '').trim();
  const sents = sentences(clean);
  const lower = clean.toLowerCase();

  let pos = 0;
  let neg = 0;
  for (const p of POSITIVE) if (lower.includes(p)) pos++;
  for (const nword of NEGATIVE) if (lower.includes(nword)) neg++;
  const total = pos + neg;
  const sentimentScore = total === 0 ? 0 : Math.round(((pos - neg) / total) * 100);
  const sentiment: Sentiment = sentimentScore >= 20 ? 'positive' : sentimentScore <= -20 ? 'negative' : 'neutral';

  return {
    sentiment,
    sentimentScore,
    commitments: collect(sents, COMMIT_CUES),
    nextSteps: collect(sents, NEXT_CUES),
    risks: collect(sents, RISK_CUES),
    objections: collect(sents, OBJECTION_CUES),
    messageCount,
  };
}
