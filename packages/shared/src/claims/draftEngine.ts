import type { DraftInput, DraftOutput, Claim } from './types.js';
import { getTemplateByTouch } from './templates.js';
import { getClaimsForJurisdictionAndCategory, getClaimById } from './claims.js';
import { validateDraftOutput, validateClaimsUsed } from './messageRules.js';

export interface GenerateDraftOptions {
  senderName?: string;
  claimIdOverride?: string; // force a specific claim
}

const SENDER_NAME = 'Nik';

const FALLBACK_TEMPLATE: DraftOutput = {
  subject: 'Introduction: LCX — regulated exchange',
  body: `Hi {{contactName}},

I wanted to reach out regarding {{projectName}}. At LCX, we provide regulated token listing and trading services.

Would you be open to a brief conversation?

Best,
${SENDER_NAME}`,
  channel: 'email',
  touchIndex: 1,
  claimsUsed: [],
  requiresHumanReview: true,
  templateId: 'fallback',
  operatorEdited: false,
};

function fillTemplateVariables(template: string, input: DraftInput): string {
  return template
    .replace(/\{\{contactName\}\}/g, input.contactName)
    .replace(/\{\{projectName\}\}/g, input.projectName)
    .replace(/\{\{ticker\}\}/g, input.projectTicker ?? input.projectName)
    .replace(/\{\{chain\}\}/g, input.projectChain ?? 'digital asset')
    .replace(/\{\{market\}\}/g, input.market ?? input.jurisdiction.toUpperCase())
    .replace(/\{\{senderName\}\}/g, SENDER_NAME);
}

function buildJurisdictionHook(input: DraftInput): string {
  if (input.jurisdiction === 'eu') {
    return 'At LCX, we offer regulated token listing and trading through our MiCA-compliant exchange infrastructure, providing EU-wide market access.';
  }
  if (input.clarityEnacted) {
    return 'At LCX, we provide regulated token listing and trading for US clients under the clear framework established by the CLARITY Act.';
  }
  return 'At LCX, we provide regulated token listing with compliance frameworks for both EU and US markets.';
}

function selectClaims(input: DraftInput, overrideId?: string): Claim[] {
  if (overrideId) {
    const claim = getClaimById(overrideId);
    return claim ? [claim] : [];
  }

  const categoryMap: Record<number, string | undefined> = {
    1: 'eu_access',
    2: 'listing_package',
    3: 'liquidity',
    4: 'marketing',
    5: undefined,
  };
  const category = categoryMap[input.touchIndex] as any;
  const candidates = getClaimsForJurisdictionAndCategory(input.jurisdiction, category);

  // Also include us_path for US jurisdiction
  if (input.jurisdiction === 'us') {
    const usClaims = getClaimsForJurisdictionAndCategory('us', 'us_path');
    candidates.push(...usClaims);
  }

  if (candidates.length === 0) {
    return getClaimsForJurisdictionAndCategory('global', undefined).slice(0, 1);
  }

  return [candidates[input.touchIndex % candidates.length]];
}

export function generateDraft(
  input: DraftInput,
  options?: GenerateDraftOptions,
): { draft: DraftOutput; warnings: string[] } {
  const warnings: string[] = [];
  const template = getTemplateByTouch(input.touchIndex, input.channel);

  if (!template) {
    const fallback = { ...FALLBACK_TEMPLATE };
    fallback.body = fillTemplateVariables(fallback.body, input);
    fallback.channel = input.channel;
    fallback.touchIndex = input.touchIndex;
    return { draft: fallback, warnings: ['No template found for this touch/channel combination'] };
  }

  const claims = selectClaims(input, options?.claimIdOverride);
  const claimIds = claims.map(c => c.id);
  const requiresReview = claims.some(c => c.requiresHumanReview);

  // Validate claims are from the approved library
  const claimValidation = validateClaimsUsed(claimIds);
  if (!claimValidation.valid) {
    warnings.push(...claimValidation.violations.map(v => v.message));
  }

  let jurisdictionHook = '';
  if (input.touchIndex <= 2) {
    jurisdictionHook = buildJurisdictionHook(input);
  }

  let benefitClaim = '';
  if (claims.length > 0) {
    benefitClaim = claims[0].text;
  }

  // Build subject and body from template
  let subject = fillTemplateVariables(template.subjectTemplate, input);
  let body = fillTemplateVariables(template.bodyTemplate, input);

  // Replace the template slot variables
  body = body.replace(/\{\{jurisdictionHook\}\}/g, jurisdictionHook);
  body = body.replace(/\{\{benefitClaim\}\}/g, benefitClaim);

  // Build question for touch 3+
  const question = buildQuestion(input, input.touchIndex);
  body = body.replace(/\{\{question\}\}/g, question);
  // Remove any unused template slots
  body = body.replace(/\{\{\w+\}\}/g, '').trim();
  subject = subject.replace(/\{\{\w+\}\}/g, '').trim();

  const draft: DraftOutput = {
    subject,
    body,
    channel: template.channel,
    touchIndex: template.touchIndex,
    claimsUsed: claimIds,
    requiresHumanReview: requiresReview,
    templateId: template.id,
    operatorEdited: false,
  };

  // Validate against message rules
  const validation = validateDraftOutput(draft, input);
  if (!validation.valid) {
    warnings.push(...validation.violations.map(v => `[${v.severity}] ${v.rule}: ${v.message}`));
  }

  return { draft, warnings };
}

function buildQuestion(input: DraftInput, touchIndex: number): string {
  const questions: Record<number, string> = {
    1: `Would you be open to a brief conversation about how we could support ${input.projectName}'s growth?`,
    2: `Would it make sense to walk through the listing requirements and timeline together?`,
    3: `How are you currently thinking about market access for ${input.projectName}?`,
    4: `Can I share a quick overview of what the process looks like?`,
    5: `What would make the timing right for ${input.projectName} to explore a listing?`,
  };
  return questions[touchIndex] ?? questions[1];
}
