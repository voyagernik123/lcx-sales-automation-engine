/**
 * 3-5 Objection handling.
 *
 * Matches an inbound objection against a static library of objection→response
 * pairs (deterministic, keyed on category keywords). Returns the best-matching
 * canned response plus the category. When a key is set the LLM tailors the
 * canned response to the exact wording — but the deterministic response is
 * always the fallback so reps never get a blank.
 */
import { llm } from './llm.js';

export type ObjectionCategory =
  | 'price'
  | 'timing'
  | 'competitor'
  | 'liquidity'
  | 'compliance'
  | 'authority'
  | 'unknown';

export interface ObjectionPair {
  category: ObjectionCategory;
  triggers: string[];
  response: string;
}

export interface ObjectionResult {
  category: ObjectionCategory;
  response: string;
  matched: string[];
  usedLlm: boolean;
}

/** Static objection library — the deterministic backbone. */
export const OBJECTION_LIBRARY: ObjectionPair[] = [
  {
    category: 'price',
    triggers: ['expensive', 'cost', 'price', 'fee', 'fees', 'budget', 'cheaper', 'too much'],
    response:
      'Totally fair to weigh the cost. LCX listing is priced against the liquidity and regulated-EU access it unlocks — most projects recover the fee through the market-making and visibility that come bundled. Happy to break down the ROI for your specific numbers on a quick call.',
  },
  {
    category: 'timing',
    triggers: ['not now', 'later', 'next quarter', 'q1', 'q2', 'q3', 'q4', 'busy', 'need to think', 'timing'],
    response:
      'No pressure on timing. Listings do take a few weeks of prep, so even if you\'re targeting next quarter it\'s worth starting the paperwork now so you\'re ready to go live the moment you are. Want me to send the checklist so it\'s ready when you are?',
  },
  {
    category: 'competitor',
    triggers: ['already listed', 'already on', 'competitor', 'other exchange', 'binance', 'coinbase', 'why lcx'],
    response:
      'Being on other exchanges is exactly why LCX adds value — we give you regulated EU/MiCA access and a compliance-first venue that complements your existing listings rather than duplicating them. It\'s additive liquidity, not a swap.',
  },
  {
    category: 'liquidity',
    triggers: ['volume', 'liquidity', 'no volume', 'small exchange', 'thin', 'depth'],
    response:
      'Volume is the right thing to focus on. LCX bundles active market-making with every listing, so your pair launches with real depth rather than an empty book. I can share depth stats from comparable recent listings.',
  },
  {
    category: 'compliance',
    triggers: ['regulation', 'compliance', 'legal', 'mica', 'license', 'kyc', 'risk'],
    response:
      'Compliance is our whole thesis — LCX is a fully regulated, MiCA-aligned exchange based in Liechtenstein. Listing with us is a signal to institutions that your token cleared a real regulatory bar. Our legal team can walk yours through the requirements.',
  },
  {
    category: 'authority',
    triggers: ['not my decision', 'team', 'ceo', 'founder', 'check with', 'board'],
    response:
      'Makes sense to loop in the team. I\'m happy to put together a one-pager you can forward, or hop on a call with whoever owns the listing decision — whatever makes it easiest to move forward internally.',
  },
];

export function suggestObjectionResponseDeterministic(objectionText: string): ObjectionResult {
  const t = (objectionText || '').toLowerCase();
  let best: ObjectionPair | null = null;
  let bestHits: string[] = [];

  for (const pair of OBJECTION_LIBRARY) {
    const hits = pair.triggers.filter((tr) => t.includes(tr));
    if (hits.length > bestHits.length) {
      best = pair;
      bestHits = hits;
    }
  }

  if (!best) {
    return {
      category: 'unknown',
      response:
        'Good question — let me make sure I give you a straight answer. What matters most to you here: cost, liquidity, timing, or the regulatory side? I\'ll tailor the details to that.',
      matched: [],
      usedLlm: false,
    };
  }
  return { category: best.category, response: best.response, matched: bestHits, usedLlm: false };
}

export async function suggestObjectionResponse(objectionText: string): Promise<ObjectionResult> {
  const base = suggestObjectionResponseDeterministic(objectionText);
  if (!llm.available || !objectionText?.trim()) return base;

  const { text, usedLlm } = await llm.complete(
    `A prospect raised this objection to an LCX exchange-listing pitch:\n"${objectionText}"\n\n` +
      `Here is our approved response for the "${base.category}" objection category:\n"${base.response}"\n\n` +
      `Tailor it to their exact wording. Keep the same substance and claims, stay concise and warm. Return only the reply.`,
    {
      feature: 'objection-response',
      system: 'You are an LCX BD rep. Never invent facts, fees, or metrics beyond the approved response.',
      maxTokens: 400,
      temperature: 0.5,
    },
  );

  if (usedLlm && text) {
    return { ...base, response: text, usedLlm: true };
  }
  return base;
}
