import type { DraftTemplate, Channel } from './types.js';

const TEMPLATES: DraftTemplate[] = [
  // ── Touch 1 — Introduction ──
  {
    id: 'touch-1-email',
    touchIndex: 1,
    channel: 'email',
    subjectTemplate: 'Introduction: LCX — regulated exchange for {{chain}} projects',
    bodyTemplate: `Hi {{contactName}},

I came across {{projectName}} ({{ticker}}) and was impressed by what you're building on {{chain}}.

{{jurisdictionHook}}

{{benefitClaim}}

Would you be open to a brief conversation about how we could support {{projectName}}'s growth?

Best,
{{senderName}}`,
  },

  // ── Touch 2 — Listing Package ──
  {
    id: 'touch-2-email',
    touchIndex: 2,
    channel: 'email',
    subjectTemplate: 'Listing overview for {{projectName}} on LCX',
    bodyTemplate: `Hi {{contactName}},

Following up on {{projectName}} — I wanted to share how our listing process works.

{{jurisdictionHook}}

{{benefitClaim}}

Would it make sense to walk through the listing requirements and timeline together?

Best,
{{senderName}}`,
  },

  // ── Touch 3 — Liquidity/Value Prop ──
  {
    id: 'touch-3-linkedin',
    touchIndex: 3,
    channel: 'linkedin',
    subjectTemplate: '',
    bodyTemplate: `Hi {{contactName}}, thanks for connecting.

I've been following {{projectName}}'s progress on {{chain}} and think there's a strong fit with what we're building at LCX.

{{benefitClaim}}

{{question}}

Looking forward to hearing your thoughts.`,
  },

  // ── Touch 4 — Direct CTA ──
  {
    id: 'touch-4-telegram',
    touchIndex: 4,
    channel: 'telegram',
    subjectTemplate: '',
    bodyTemplate: `Hey {{contactName}} — wanted to check in on {{projectName}}. We're onboarding {{chain}} projects and think there could be a great fit.

{{benefitClaim}}

Can I share a quick overview of what the process looks like?`,
  },

  // ── Touch 5 — Final Follow-Up ──
  {
    id: 'touch-5-email',
    touchIndex: 5,
    channel: 'email',
    subjectTemplate: 'Quick check-in: {{projectName}}',
    bodyTemplate: `Hi {{contactName}},

Just one last follow-up on {{projectName}}. We've been helping projects similar to yours navigate {{market}} access.

{{benefitClaim}}

{{question}}

If now isn't the right time, no worries at all — feel free to reach out whenever it makes sense.

Best,
{{senderName}}`,
  },
];

export function getTemplates(): DraftTemplate[] {
  return TEMPLATES;
}

export function getTemplateByTouch(
  touchIndex: number,
  channel: Channel,
): DraftTemplate | undefined {
  return TEMPLATES.find(t => t.touchIndex === touchIndex && t.channel === channel);
}

export function getTemplateById(id: string): DraftTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}
