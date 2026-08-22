import type { OfferKey } from './types.js';

/**
 * G2 — THE RESEARCH DOSSIER: what the register shows, what the model adds, and a
 * wall between the two (GPS_REVENUE_100X_PLAN.md §G2, doctrine D10: an AI draft is
 * PROVENANCE, never authority).
 *
 * The whole design is one move: the model is handed the register's facts as a
 * NUMBERED LIST, and the only part of its answer that may make factual claims about
 * the target is the section where every line cites those numbers back. Everything
 * the model knows on its own goes in a second section that opens by grading itself
 * C3 — assistant knowledge, verify before use — in words this module owns, not words
 * the model chose. A response that breaks the shape is REFUSED by `dossierDefects`
 * and never stored; there is no "mostly cited" disposition, because the difference
 * between a cited dossier and a plausible essay is precisely the part you cannot see.
 *
 * ── WHAT NEVER ENTERS THE PROMPT ─────────────────────────────────────────────
 * No person's name. The register holds decision-maker names; the fact list carries
 * the ROLE and the budget-holder flag only. Sending a named individual to a
 * third-party model provider is a data-protection decision (D2's sibling) that
 * nobody has made, so the prompt is built to be incapable of it — the fact builder
 * takes a view type that has no name field to forget to strip. The same rule the
 * Telegram sieve applies to senders, applied to our own records.
 *
 * ── OUTREACH IS DRAFTED HERE AND SENT NOWHERE ────────────────────────────────
 * `outreachDefects` is a pre-flight courtesy (length, promise language). The wall
 * is the marketing outbound gate — every draft is submitted to `gateOutboundText`
 * by the API and stored WITH its verdict — and the send itself stays a human act
 * outside this system (the one-mouth rule). Nothing in this module or its callers
 * transmits a message to a prospect.
 */

/* ── The fact list ──────────────────────────────────────────────────────────── */

/** One register fact, numbered so the model can cite it and a reader can check it. */
export interface DossierFact {
  /** 'F1', 'F2', … — the token the dossier must cite. */
  readonly ref: string;
  /** Which register field this is, e.g. 'target.jurisdiction'. */
  readonly field: string;
  /** The value as the prompt shows it — already rendered, already minimised. */
  readonly value: string;
}

/**
 * The slice of a target the dossier may know. Built by the API from its target
 * record; deliberately NOT the whole record. There is no field here for a person's
 * name — that is the design, not an omission.
 */
export interface DossierTargetView {
  readonly id: string;
  readonly name: string;
  readonly jurisdiction: string | null;
  readonly offerKey: OfferKey | null;
  readonly identifiedNeeds: readonly OfferKey[] | null;
  readonly introPath: string | null;
  readonly statedBudgetCents: number | null;
  /** Admiralty grade of the strongest evidence row, e.g. 'B2'. */
  readonly evidenceGrade: string | null;
  readonly evidenceAgeDays: number | null;
  readonly screening: string | null;
  readonly perimeter: string | null;
  readonly conflict: string | null;
  readonly deadlineIso: string | null;
  readonly deadlineKind: string | null;
  /** Role only. Never a name — see the module docblock. */
  readonly decisionMakerRole: string | null;
  readonly decisionMakerIsBudgetHolder: boolean | null;
}

const dollars = (cents: number): string =>
  `$${Math.round(cents / 100).toLocaleString('en-US')} (register figure, cents-precise internally)`;

/**
 * View → numbered facts. Nulls contribute NOTHING — an absent field is absent, not
 * "unknown" prose the model might riff on. Refs are assigned in declaration order
 * and are stable for a given view, which is what lets a stored dossier's citations
 * be re-checked later against the same view.
 */
export function dossierFacts(view: DossierTargetView): readonly DossierFact[] {
  const raw: ReadonlyArray<readonly [string, string | null]> = [
    ['target.name', view.name],
    ['target.jurisdiction', view.jurisdiction],
    ['target.offerKey', view.offerKey],
    ['target.identifiedNeeds', view.identifiedNeeds && view.identifiedNeeds.length > 0 ? view.identifiedNeeds.join(', ') : null],
    ['target.introPath', view.introPath],
    ['target.statedBudget', view.statedBudgetCents !== null ? dollars(view.statedBudgetCents) : null],
    ['target.evidenceGrade', view.evidenceGrade],
    ['target.evidenceAgeDays', view.evidenceAgeDays !== null ? `${view.evidenceAgeDays} day(s) old` : null],
    ['target.screening', view.screening],
    ['target.perimeter', view.perimeter],
    ['target.conflict', view.conflict],
    ['target.deadline', view.deadlineIso ? `${view.deadlineIso}${view.deadlineKind ? ` (${view.deadlineKind})` : ''}` : null],
    ['target.decisionMakerRole', view.decisionMakerRole],
    [
      'target.decisionMakerIsBudgetHolder',
      view.decisionMakerIsBudgetHolder === null ? null : view.decisionMakerIsBudgetHolder ? 'yes' : 'no',
    ],
  ];
  const facts: DossierFact[] = [];
  for (const [field, value] of raw) {
    if (value === null || value.trim() === '') continue;
    facts.push({ ref: `F${facts.length + 1}`, field, value });
  }
  return facts;
}

/* ── The dossier shape ──────────────────────────────────────────────────────── */

/** The four headings, exactly as the model must reproduce them, in this order. */
export const DOSSIER_HEADINGS = [
  '## WHAT THE REGISTER SHOWS',
  '## WHAT THE MODEL ADDS (UNVERIFIED, C3)',
  '## THE ANGLE',
  '## WHAT WOULD CHANGE THIS',
] as const;

/**
 * The first line of the model-knowledge section, verbatim. OUR words, not the
 * model's: a caveat the model is free to phrase is a caveat that erodes one
 * paraphrase at a time.
 */
export const MODEL_SECTION_CAVEAT =
  'Everything below this line is model knowledge with no register grounding: grade C3 — verify independently before acting on any of it.';

export const DOSSIER_MAX_CHARS = 20_000;

export interface DossierPrompt {
  readonly system: string;
  readonly task: string;
  /** The refs handed out, for the validator: `dossierDefects(text, refs)`. */
  readonly refs: readonly string[];
}

/**
 * Build the prompt pair. Everything the validator later demands is stated here as
 * an instruction — the contract is written once and enforced once, on the way out.
 */
export function buildDossierPrompt(view: DossierTargetView): DossierPrompt {
  const facts = dossierFacts(view);
  const factBlock = facts.map((f) => `[${f.ref}] ${f.field} = ${f.value}`).join('\n');
  const system = [
    'You draft internal research dossiers for the LCX services desk (a regulated EU crypto exchange group).',
    'Hard rules, all of them checked mechanically after you answer:',
    '1. In the section "WHAT THE REGISTER SHOWS" you may state ONLY what the numbered facts support. One claim per line, and every line ends with its citations in square brackets, e.g. [F1] or [F1, F3]. No line without a citation. Cite no reference you were not given.',
    '2. General knowledge, market context and anything you believe about this project beyond the facts goes ONLY in "WHAT THE MODEL ADDS (UNVERIFIED, C3)", and that section must begin with this exact line: ' + MODEL_SECTION_CAVEAT,
    '3. Use the four section headings exactly as given, in the given order, and no others.',
    '4. You were given no personal names. Do not introduce, guess or recall any.',
    '5. Never assert or imply that LCX guarantees a listing, an approval or any regulatory outcome.',
    '6. No hyperlinks, no images, no tables — short markdown lines under the four headings only.',
  ].join('\n');
  const task = [
    `Prepare a services-desk dossier on the target "${view.name}".`,
    '',
    'THE REGISTER FACTS (the only citable material):',
    factBlock === '' ? '(the register shows nothing beyond the name)' : factBlock,
    '',
    'Required structure:',
    ...DOSSIER_HEADINGS.map((h) => h),
    '',
    'Keep each section under 250 words. In "THE ANGLE", argue which LCX service offer fits and why now. In "WHAT WOULD CHANGE THIS", list what evidence would strengthen or kill the thesis, one item per line.',
  ].join('\n');
  return { system, task, refs: facts.map((f) => f.ref) };
}

/* ── The validator — one bar, applied to every model response ───────────────── */

export type DossierDefectCode =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'MISSING_SECTION'
  | 'SECTIONS_OUT_OF_ORDER'
  | 'UNKNOWN_FACT_REF'
  | 'UNCITED_REGISTER_LINE'
  | 'REGISTER_SECTION_EMPTY'
  | 'MISSING_MODEL_CAVEAT';

export interface DossierDefect {
  readonly code: DossierDefectCode;
  readonly detail: string;
}

const CITATION_RE = /\[\s*F\d+(?:\s*,\s*F\d+)*\s*\]/;

/**
 * Refuse-or-accept for a model dossier. Returns EVERY defect, not the first: the
 * operator retrying a generation deserves the whole bill at once.
 *
 * Line rule, not sentence rule: within "WHAT THE REGISTER SHOWS", every non-empty
 * line (the heading aside) must carry a citation. The prompt demands one claim per
 * line, so the mechanical check and the instruction are the same shape — no NLP,
 * nothing to argue with.
 */
export function dossierDefects(text: string, knownRefs: readonly string[]): readonly DossierDefect[] {
  const defects: DossierDefect[] = [];
  const t = text.trim();
  if (t === '') return [{ code: 'EMPTY', detail: 'The response is empty.' }];
  if (t.length > DOSSIER_MAX_CHARS) {
    defects.push({ code: 'TOO_LONG', detail: `${t.length} chars exceeds the ${DOSSIER_MAX_CHARS} cap.` });
  }

  const positions = DOSSIER_HEADINGS.map((h) => ({ heading: h, at: t.indexOf(h) }));
  for (const p of positions) {
    if (p.at === -1) defects.push({ code: 'MISSING_SECTION', detail: `Missing heading: ${p.heading}` });
  }
  const present = positions.filter((p) => p.at !== -1);
  for (let i = 1; i < present.length; i++) {
    if (present[i].at < present[i - 1].at) {
      defects.push({
        code: 'SECTIONS_OUT_OF_ORDER',
        detail: `${present[i].heading} appears before ${present[i - 1].heading}.`,
      });
      break;
    }
  }

  // Every citation anywhere in the text must be a ref that was actually handed out.
  const known = new Set(knownRefs);
  const cited = new Set<string>();
  for (const bracket of t.matchAll(/\[([^\]]*)\]/g)) {
    for (const ref of bracket[1].match(/F\d+/g) ?? []) {
      cited.add(ref);
      if (!known.has(ref)) {
        defects.push({ code: 'UNKNOWN_FACT_REF', detail: `Cites ${ref}, which was never provided.` });
      }
    }
  }

  // The register section: every line cited, and at least one line exists.
  const regAt = t.indexOf(DOSSIER_HEADINGS[0]);
  const modelAt = t.indexOf(DOSSIER_HEADINGS[1]);
  if (regAt !== -1) {
    const sectionEnd = modelAt > regAt ? modelAt : t.length;
    const lines = t
      .slice(regAt + DOSSIER_HEADINGS[0].length, sectionEnd)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (lines.length === 0) {
      defects.push({
        code: 'REGISTER_SECTION_EMPTY',
        detail: 'The register section contains no claims — a dossier that shows nothing from the register is an essay.',
      });
    }
    for (const line of lines) {
      if (!CITATION_RE.test(line)) {
        defects.push({
          code: 'UNCITED_REGISTER_LINE',
          detail: `Uncited register claim: "${line.slice(0, 120)}"`,
        });
      }
    }
  }

  if (modelAt !== -1 && !t.includes(MODEL_SECTION_CAVEAT)) {
    defects.push({
      code: 'MISSING_MODEL_CAVEAT',
      detail: 'The model-knowledge section does not open with the exact C3 caveat line.',
    });
  }

  return defects;
}

/* ── Outreach drafts ────────────────────────────────────────────────────────── */

/** Where a human might carry the draft. Matches the outbound gate's channel set. */
export const OUTREACH_CHANNELS = ['email', 'telegram', 'linkedin', 'x_public'] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_MAX_CHARS = 900;

/**
 * Promise language that dies before the draft even reaches the gate. A courtesy
 * check, deliberately narrow: THE WALL IS `gateOutboundText`, which runs the full
 * claim-safety and market-abuse engines on every draft. This list exists so the
 * obvious refusals cost one function call instead of a database round trip.
 */
const PROMISE_RE: ReadonlyArray<readonly [RegExp, string]> = [
  [/guarante\w*/i, 'guarantee language'],
  [/assured\s+(listing|outcome|approval)/i, 'an assured outcome'],
  [/will\s+(be\s+)?list/i, 'a listing promised as fact'],
  [/risk[- ]free|no\s+risk/i, 'a risk-free claim'],
  [/100%\s*(certain|sure|success)/i, 'certainty language'],
];

export function buildOutreachPrompt(
  view: DossierTargetView,
  channel: OutreachChannel,
  angle: string | null,
): { readonly system: string; readonly task: string } {
  const facts = dossierFacts(view);
  const system = [
    'You draft FIRST-CONTACT outreach for the LCX services desk. The draft will be reviewed by a compliance gate and a human before anyone sees it; write as if every word will be quoted back to you.',
    'Hard rules:',
    '1. Plain text only, no markdown, no links, no subject line unless the channel is email (then exactly one line starting "Subject: ").',
    `2. At most 120 words. The channel is ${channel}.`,
    '3. Identify the sender as the LCX services desk, honestly. No flattery scripts.',
    '4. Never promise, guarantee or imply a listing, an approval or any regulatory outcome.',
    '5. You were given no personal names — open without one.',
    '6. One concrete, low-commitment next step at the end.',
  ].join('\n');
  const task = [
    `Draft the ${channel} outreach to the project "${view.name}".`,
    '',
    'What the desk knows (context only — do NOT cite refs in the draft):',
    facts.map((f) => `- ${f.field}: ${f.value}`).join('\n'),
    angle ? `\nThe accepted dossier's angle, to build on:\n${angle}` : '',
  ].join('\n');
  return { system, task };
}

export type OutreachDefectCode = 'EMPTY' | 'TOO_LONG' | 'PROMISE_LANGUAGE';

export interface OutreachDefect {
  readonly code: OutreachDefectCode;
  readonly detail: string;
}

export function outreachDefects(text: string): readonly OutreachDefect[] {
  const t = text.trim();
  if (t === '') return [{ code: 'EMPTY', detail: 'The draft is empty.' }];
  const defects: OutreachDefect[] = [];
  if (t.length > OUTREACH_MAX_CHARS) {
    defects.push({ code: 'TOO_LONG', detail: `${t.length} chars exceeds the ${OUTREACH_MAX_CHARS} cap.` });
  }
  for (const [re, what] of PROMISE_RE) {
    const m = t.match(re);
    if (m) defects.push({ code: 'PROMISE_LANGUAGE', detail: `Contains ${what}: "${m[0]}"` });
  }
  return defects;
}
