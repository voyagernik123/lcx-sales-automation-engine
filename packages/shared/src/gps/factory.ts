import { OFFER_KEYS, type OfferKey } from './types.js';
import { getOffer } from './catalogue.js';

/**
 * G5 — THE DELIVERY FACTORY's Stage 1: templates with typed fact slots, and the
 * refusal that makes D10 real (GPS_REVENUE_100X_PLAN.md §G5).
 *
 * A template is a section skeleton plus a SLOT LIST, and the slot list is not
 * invented here: every client-facing slot IS one of the offer's own
 * `requiredClientInputs` — the same sentences the proposal printed and the portal
 * collects (G4). Deriving instead of retyping means three surfaces (proposal,
 * portal form, draft refusal) can never disagree about what the client owes,
 * because they are reading one list.
 *
 * THE REFUSAL IS THE FEATURE. `slotGaps` names every required slot with no value,
 * and a draft is never generated over a gap — a model handed "tokenomics: (missing)"
 * writes plausible tokenomics, and a plausible invented fact inside a regulatory
 * document is the single worst artefact this system could produce. The gap list
 * doubles as the chase list: it is literally what to ask the client for.
 *
 * WHAT STAGE 1 OUTPUT IS: a first draft for INTERNAL QA (Stage 2), never a
 * deliverable. The QA acceptance is what marks the deliverable reviewed — through
 * the delivery desk's existing review gate, not a parallel one — and the client
 * accepts only after that, through the portal. Three stages, one direction, no
 * shortcut expressible.
 */

export type FactorySlotSource = 'engagement' | 'client_fact' | 'dossier';

export interface FactorySlot {
  /** Stable key: 'engagement.<field>', 'client:<verbatim catalogue input>', 'dossier:angle'. */
  readonly key: string;
  readonly label: string;
  readonly source: FactorySlotSource;
  readonly required: boolean;
}

export interface FactoryTemplate {
  readonly offerKey: OfferKey;
  readonly draftTitle: string;
  /** Exact headings the model must reproduce, in order — the same discipline as dossiers. */
  readonly sections: readonly string[];
  readonly slots: readonly FactorySlot[];
  /** One paragraph of drafting posture, template-specific. */
  readonly guidance: string;
}

const SECTIONS: Record<OfferKey, { title: string; sections: readonly string[]; guidance: string }> = {
  diagnostic: {
    title: 'Token Readiness Diagnostic — report draft',
    sections: [
      '## WHERE THE TOKEN STANDS',
      '## REGULATORY POSTURE',
      '## VENUE READINESS',
      '## THE GAPS',
      '## RECOMMENDED SEQUENCE',
    ],
    guidance:
      'A diagnostic is judged by what it refuses to gloss: every gap named with what closing it takes. No scores, no traffic lights — findings in sentences, each traceable to a supplied fact.',
  },
  mica_whitepaper: {
    title: 'MiCA white paper — first draft (Annex structure)',
    sections: [
      '## PART A — THE ISSUER',
      '## PART B — THE CRYPTO-ASSET PROJECT',
      '## PART C — THE OFFER TO THE PUBLIC',
      '## PART D — RIGHTS AND OBLIGATIONS',
      '## PART E — UNDERLYING TECHNOLOGY',
      '## PART F — RISKS',
      '## PART G — SUSTAINABILITY INDICATORS',
    ],
    guidance:
      'Annex discipline: where a supplied fact answers a disclosure item, state it; where none does, write the literal marker [FACT REQUIRED: <what>] rather than prose that sounds like an answer. Counsel reads this draft next — an honest hole beats a confident invention by the width of a sanction.',
  },
  legal_opinion_coordination: {
    title: 'Counsel fact package — draft',
    sections: [
      '## THE QUESTION FOR COUNSEL',
      '## FACTUAL RECORD',
      '## JURISDICTIONS IN PRIORITY ORDER',
      '## PRIOR CONTACTS AND DISCLOSURES',
      '## COUNSEL PACKAGE CHECKLIST',
    ],
    guidance:
      'This package exists so counsel bills for judgment, not for archaeology. Facts only, dated and sourced to what the client supplied; the one opinion in the document is the scoping of the question itself.',
  },
  gtm_sprint: {
    title: 'GTM / TGE sprint document — draft',
    sections: [
      '## WHERE WE START',
      '## TARGET STATE AND DATES',
      '## CHANNEL PLAN',
      '## VENUE AND LIQUIDITY PLAN',
      '## EXECUTION CALENDAR',
      '## NUMBERS A DESK CAN CHECK',
    ],
    guidance:
      'Every number in the final section must be checkable from a supplied metric or be marked as a target someone chose. A plan whose numbers cannot be argued with is a poster.',
  },
  marketing_activation: {
    title: 'Activation programme — internal draft',
    sections: [
      '## PROGRAMME OBJECTIVE',
      '## JURISDICTION LIMITS APPLIED',
      '## CHANNEL ACTIVATIONS',
      '## COMPLIANCE-GATED COPY PLAN',
      '## MEASUREMENT',
    ],
    guidance:
      'An INTERNAL programme document. Any public wording it sketches goes through the marketing outbound gate before a human carries it anywhere — say so in the copy plan, and never draft around a jurisdiction limit the perimeter has recorded.',
  },
};

/**
 * Template per offer, slots DERIVED from the catalogue at call time. Engagement
 * basics are the two facts every draft opens on; the client slots are the offer's
 * own required inputs, all required — the catalogue already made that judgment,
 * and softening it here would let a draft run ahead of a client who has not
 * answered. The dossier angle is the one optional slot: research helps a draft,
 * but its absence is not a gap in the CLIENT's obligations.
 */
export function factoryTemplate(offerKey: OfferKey): FactoryTemplate {
  const meta = SECTIONS[offerKey];
  const offer = getOffer(offerKey);
  const slots: FactorySlot[] = [
    { key: 'engagement.clientName', label: 'Client name', source: 'engagement', required: true },
    { key: 'engagement.offerName', label: 'Engaged offer', source: 'engagement', required: true },
    ...(offer?.requiredClientInputs ?? []).map((input) => ({
      key: `client:${input}`,
      label: input,
      source: 'client_fact' as const,
      required: true,
    })),
    { key: 'dossier:angle', label: 'Accepted research dossier — the angle', source: 'dossier', required: false },
  ];
  return { offerKey, draftTitle: meta.title, sections: meta.sections, slots, guidance: meta.guidance };
}

export const FACTORY_OFFER_KEYS: readonly OfferKey[] = OFFER_KEYS;

/** Required slots with no usable value — D10's refusal list, and the chase list. */
export function slotGaps(
  template: FactoryTemplate,
  values: Readonly<Record<string, string | null | undefined>>,
): readonly FactorySlot[] {
  return template.slots.filter((s) => {
    if (!s.required) return false;
    const v = values[s.key];
    return typeof v !== 'string' || v.trim() === '';
  });
}

export const DRAFT_MAX_CHARS = 60_000;

export interface FactoryPrompt {
  readonly system: string;
  readonly task: string;
}

/**
 * The prompt pair. Callers run `slotGaps` FIRST and never compose over a gap —
 * `composeDraftPrompt` throws on one rather than trusting the discipline, because
 * a generation path that can skip the refusal will, eventually, on a Friday.
 */
export function composeDraftPrompt(
  template: FactoryTemplate,
  values: Readonly<Record<string, string | null | undefined>>,
): FactoryPrompt {
  const gaps = slotGaps(template, values);
  if (gaps.length > 0) {
    throw new Error(`composeDraftPrompt called over ${gaps.length} required gap(s) — run slotGaps first: ${gaps.map((g) => g.label).join('; ')}`);
  }
  const supplied = template.slots
    .filter((s) => typeof values[s.key] === 'string' && (values[s.key] as string).trim() !== '')
    .map((s) => `— ${s.label}:\n${(values[s.key] as string).trim()}`)
    .join('\n\n');
  const system = [
    `You draft internal first versions for the LCX services desk. This one is: ${template.draftTitle}.`,
    'Hard rules, checked mechanically after you answer:',
    '1. Use the section headings exactly as given, in the given order, and no others.',
    '2. State ONLY what the supplied facts support. Where a disclosure or plan item has no supporting fact, write the literal marker [FACT REQUIRED: <what is needed>] — never prose that sounds like an answer.',
    '3. No personal names beyond those in the supplied facts. No hyperlinks. No invented figures.',
    '4. Never assert or imply that LCX guarantees a listing, an approval or any regulatory outcome.',
    `5. Drafting posture for this document: ${template.guidance}`,
    '6. This is a FIRST DRAFT for internal QA — write it complete, and let the markers show where the client still owes facts.',
  ].join('\n');
  const task = [
    `Draft: ${template.draftTitle}`,
    '',
    'THE SUPPLIED FACTS (the only usable material):',
    supplied,
    '',
    'Required structure:',
    ...template.sections,
  ].join('\n');
  return { system, task };
}

export type DraftDefectCode = 'EMPTY' | 'TOO_LONG' | 'MISSING_SECTION' | 'SECTIONS_OUT_OF_ORDER';

export interface DraftDefect {
  readonly code: DraftDefectCode;
  readonly detail: string;
}

/** Same shape-or-refuse discipline as `dossierDefects`; the truth check is Stage 2's job. */
export function draftDefects(text: string, template: FactoryTemplate): readonly DraftDefect[] {
  const t = text.trim();
  if (t === '') return [{ code: 'EMPTY', detail: 'The response is empty.' }];
  const defects: DraftDefect[] = [];
  if (t.length > DRAFT_MAX_CHARS) {
    defects.push({ code: 'TOO_LONG', detail: `${t.length} chars exceeds the ${DRAFT_MAX_CHARS} cap.` });
  }
  const positions = template.sections.map((h) => ({ heading: h, at: t.indexOf(h) }));
  for (const p of positions) {
    if (p.at === -1) defects.push({ code: 'MISSING_SECTION', detail: `Missing heading: ${p.heading}` });
  }
  const present = positions.filter((p) => p.at !== -1);
  for (let i = 1; i < present.length; i++) {
    if (present[i].at < present[i - 1].at) {
      defects.push({ code: 'SECTIONS_OUT_OF_ORDER', detail: `${present[i].heading} appears before ${present[i - 1].heading}.` });
      break;
    }
  }
  return defects;
}

/** The three stages, for actuals recording — the calibration loop's ground truth. */
export const FACTORY_STAGES = ['ai_draft', 'internal_qa', 'partner'] as const;
export type FactoryStage = (typeof FACTORY_STAGES)[number];
