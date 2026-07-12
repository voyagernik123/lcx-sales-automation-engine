/**
 * 3-1 LLM-refined reply drafting.
 *
 * Wraps the deterministic generateReplyDrafts from @lcx/shared. The three angle
 * drafts (meeting / telegram / info) are ALWAYS produced deterministically —
 * they are compliance-reviewed and carry claimsUsed. When a key is set the LLM
 * only smooths the *tone/body* of each draft; subject, claimsUsed, angle and the
 * Telegram pull are preserved so nothing off-script ships.
 */
import { generateReplyDrafts, type ReplyDraftInput, type ReplyDraftCandidate } from '@lcx/shared';
import { llm } from './llm.js';

export interface RefinedReplyDrafts {
  drafts: ReplyDraftCandidate[];
  warnings: string[];
  usedLlm: boolean;
}

/**
 * @param wantLlm  gate from the ?llm=true query param. Even when true, refinement
 *                 only happens if a key is actually configured.
 */
export async function generateReplyDraftsAi(
  input: ReplyDraftInput,
  wantLlm = false,
): Promise<RefinedReplyDrafts> {
  const base = generateReplyDrafts(input);

  if (!wantLlm || !llm.available) {
    return { drafts: base.drafts, warnings: base.warnings, usedLlm: false };
  }

  let anyLlm = false;
  const drafts = await Promise.all(
    base.drafts.map(async (d) => {
      const { text, usedLlm } = await llm.complete(
        `Rewrite this outreach reply so it sounds warmer and more natural, WITHOUT changing its intent, ` +
          `any factual claims, or the closing Telegram call-to-action. Keep it concise. Return only the body text.\n\n${d.body}`,
        {
          feature: 'reply-drafts',
          system: 'You are a crypto-exchange BD rep refining a sales reply. Never invent facts or numbers.',
          maxTokens: 512,
          temperature: 0.5,
        },
      );
      if (usedLlm && text) {
        anyLlm = true;
        return { ...d, body: text, operatorEdited: false };
      }
      return d;
    }),
  );

  return { drafts, warnings: base.warnings, usedLlm: anyLlm };
}
