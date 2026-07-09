/**
 * Reply drafts for handoffs — when a lead responds, the operator picks one of
 * three deterministic angles (meeting / telegram / info). Every draft ends
 * with the Telegram pull: deals close in DMs, not inboxes.
 */
import type { Channel, Jurisdiction, DraftOutput } from './types.js';
import { getClaimsForJurisdictionAndCategory } from './claims.js';

export type ReplyAngle = 'meeting' | 'telegram' | 'info';

export interface ReplyDraftInput {
  projectName: string;
  projectTicker: string | null;
  projectBand: string;
  contactName: string;
  /** Channel the reply arrived on. */
  channel: Channel;
  repliedToTouchIndex: number | null;
  jurisdiction: Jurisdiction;
  /** LCX/operator handle WITHOUT @ or t.me prefix. Injected by the API from env. */
  lcxTelegramHandle: string;
  senderName?: string;
}

export interface ReplyDraftCandidate extends DraftOutput {
  angle: ReplyAngle;
}

function telegramPull(handle: string): string {
  return `Quickest way to sort specifics is Telegram — t.me/${handle}. Ping me there any time.`;
}

export function generateReplyDrafts(input: ReplyDraftInput): {
  drafts: ReplyDraftCandidate[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const sender = input.senderName ?? 'Nik';
  const handle = (input.lcxTelegramHandle || '').replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  if (!handle) warnings.push('LCX_TELEGRAM_HANDLE not configured — drafts contain a placeholder');
  const tg = telegramPull(handle || 'YOUR_TELEGRAM_HANDLE');

  // Claims are tagged per-jurisdiction OR 'global' — accept both
  const forCategory = (category: Parameters<typeof getClaimsForJurisdictionAndCategory>[1]) => {
    const specific = getClaimsForJurisdictionAndCategory(input.jurisdiction, category);
    return specific.length > 0 ? specific : getClaimsForJurisdictionAndCategory('global' as Jurisdiction, category);
  };
  const claims = forCategory('listing_package');
  const claim = claims[0]?.text ?? '';
  const liquidityClaims = forCategory('liquidity');
  const liquidityClaim = liquidityClaims[0]?.text ?? claim;

  const sig = input.channel === 'email' ? `\n\nBest,\n${sender}` : `\n\n— ${sender}`;

  const meeting: ReplyDraftCandidate = {
    angle: 'meeting',
    subject: input.channel === 'email' ? `Re: ${input.projectName} × LCX` : '',
    body:
      `Great to hear from you, ${input.contactName}!\n\n` +
      `Happy to walk you through exactly how a ${input.projectName} listing would work — process, timeline, and what we'd need from your side. ` +
      `${claim}\n\n` +
      `Do you have 20 minutes this week for a quick call? ` +
      `${tg}${sig}`,
    channel: input.channel,
    touchIndex: input.repliedToTouchIndex ?? 0,
    claimsUsed: claims[0] ? [claims[0].id] : [],
    requiresHumanReview: true,
    templateId: 'reply-meeting',
    operatorEdited: false,
  };

  const telegram: ReplyDraftCandidate = {
    angle: 'telegram',
    subject: input.channel === 'email' ? `Re: ${input.projectName} × LCX` : '',
    body:
      `Thanks for getting back to me, ${input.contactName}!\n\n` +
      `Rather than trade emails, let's keep this simple — I'd love to get ${input.projectName} moving. ${claim}\n\n` +
      `What's the best way to reach you on Telegram? Or just message me directly — ${tg}${sig}`,
    channel: input.channel,
    touchIndex: input.repliedToTouchIndex ?? 0,
    claimsUsed: claims[0] ? [claims[0].id] : [],
    requiresHumanReview: true,
    templateId: 'reply-telegram',
    operatorEdited: false,
  };

  const info: ReplyDraftCandidate = {
    angle: 'info',
    subject: input.channel === 'email' ? `Re: ${input.projectName} × LCX — details` : '',
    body:
      `Of course, ${input.contactName} — here's the short version for ${input.projectName}.\n\n` +
      `${claim} ${liquidityClaim}\n\n` +
      `I can send the full listing overview and fee structure wherever suits you. ` +
      `Want me to put together numbers specific to ${input.projectTicker ?? input.projectName}? ` +
      `${tg}${sig}`,
    channel: input.channel,
    touchIndex: input.repliedToTouchIndex ?? 0,
    claimsUsed: [
      ...(claims[0] ? [claims[0].id] : []),
      ...(liquidityClaims[0] && liquidityClaims[0].id !== claims[0]?.id ? [liquidityClaims[0].id] : []),
    ],
    requiresHumanReview: true,
    templateId: 'reply-info',
    operatorEdited: false,
  };

  return { drafts: [meeting, telegram, info], warnings };
}
