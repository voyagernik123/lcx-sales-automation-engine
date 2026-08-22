/**
 * GPS G0 — THE FOUNDER PACKETS. Five proposals the owner approves; never defaults he missed.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * Since 0052 landed, every price on this platform has been `TODO_PRICE_BANDS`, every margin
 * distribution `basis: 'prior'`, the partner bench an empty array and the jurisdiction
 * perimeter an empty matrix operating advisory. All five were "the owner will supply them" —
 * and eleven months of owner-supplies-them produced none of them, because a blank form is
 * work and an approval is a decision. The 2026-08-21 decision record (GPS_REVENUE_100X_PLAN.md
 * §1, answer 8) replaced the blank form: THE SYSTEM PROPOSES, THE OWNER APPROVES OR EDITS.
 *
 * ── D11: A PACKET IS A PROPOSAL WITH ITS EVIDENCE ATTACHED ───────────────────
 * Every packet carries: the proposed values in EXACTLY the shape the existing write surface
 * accepts (the same route that refuses a transposed triple refuses it here — one validator,
 * `packetProposalDefects`, exported from this file and used by the API); the evidence, each
 * item provenance-typed and graded; and the consequence of approving, in words.
 *
 * ── THE GRADES ARE THE POINT, AND NOTHING HERE GRADES ABOVE B2 ───────────────
 * `repo_measurement` (B2): read from this repository — the compiled placeholder being cited,
 * the Supabase region, the empty bench. Reliable about WHAT THE REPO SAYS, nothing more.
 * `assistant_knowledge_unverified` (C3): market ranges and regulatory postures from the
 * assistant's training knowledge, cutoff 2026-01, checked against nothing. Possibly true.
 * `design_decision` (N/A): not a fact at all — a choice, argued next to its alternatives.
 * An A1 would claim a verified primary source. There are none here; that is exactly why the
 * owner's approval is required, and why every jurisdiction row says "verify with counsel".
 *
 * ── NO CLOCK ─────────────────────────────────────────────────────────────────
 * `buildFounderPackets(asOf)` is pure and deterministic: same instant in, same packets out.
 * Perimeter rows carry `reviewMonthsAhead`, never a concrete date — a packet built in August
 * and approved in October must not arrive pre-expired, so the expiry is computed AT APPLY,
 * from the approval instant, by the API.
 */

import { OFFER_KEYS, type OfferKey } from './types.js';
import { getOffer, bandMidpointCents } from './catalogue.js';
import type { ServiceClass } from './perimeter.js';
import { pricingPolicyDefects, type PricingPolicyValues } from './pricing.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* TYPES                                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

export type PacketKind =
  | 'price_bands'
  | 'effort_triples'
  | 'rate_cards'
  | 'perimeter_seed'
  | 'dpo_memo'
  | 'pricing_policy';

export const PACKET_KINDS: readonly PacketKind[] = [
  'price_bands', 'effort_triples', 'rate_cards', 'perimeter_seed', 'dpo_memo',
  'pricing_policy',
] as const;

export type PacketProvenance =
  | 'repo_measurement'
  | 'assistant_knowledge_unverified'
  | 'design_decision';

export type PacketGrade = 'B2' | 'C3' | 'N/A';

/** The grade each provenance is ALLOWED to carry — asserted by the tests, not implied. */
export const PROVENANCE_GRADE: Record<PacketProvenance, PacketGrade> = {
  repo_measurement: 'B2',
  assistant_knowledge_unverified: 'C3',
  design_decision: 'N/A',
};

export interface PacketEvidence {
  /** The factual claim or design argument, one sentence. */
  claim: string;
  /** Where it comes from, specifically — a file:line, a regime name, a reasoning. */
  basis: string;
  provenance: PacketProvenance;
  grade: PacketGrade;
  /** What could make this wrong, when that is worth saying. Null when the basis says it. */
  caveat: string | null;
}

export interface PacketPriceBandRow {
  offerKey: OfferKey;
  lowCents: number;
  midCents: number;
  highCents: number;
  currency: 'USD';
  rationale: string;
}

export interface PacketEffortTripleRow {
  offerKey: OfferKey;
  optimisticDays: number;
  likelyDays: number;
  pessimisticDays: number;
  /**
   * The LIKELY case decomposed into the three-stage waterfall the owner chose (decision 6):
   * AI first draft → internal QA → partner remainder. The decomposition is evidence for the
   * triple, not a second triple — only the three plain day numbers are ever written anywhere.
   */
  waterfall: { aiDraftDays: number; internalQaDays: number; partnerDays: number };
  rationale: string;
}

export interface RateCardProposalRow {
  offerKey: OfferKey;
  /** A CLASS of partner, never a name. Names are the owner's alone (D5). */
  partnerClass: string;
  unit: 'per_day' | 'fixed';
  proposedRateCents: number;
  /** Days for per_day; 1 for fixed. What `rateCardCostCents` needs to derive a cost. */
  expectedUnits: number;
  rationale: string;
}

export interface PerimeterSeedRow {
  /** Free text; the API folds it with `normaliseJurisdiction` exactly as manual entry does. */
  jurisdiction: string;
  offerKey: OfferKey;
  serviceClass: ServiceClass;
  /** The citation the position rests on — honest about being an unverified proposal. */
  source: string;
  /** Never fetched by anything; null throughout — proposals cite regimes, not URLs. */
  sourceUrl: null;
  /** Client-facing refusals quote this, so it is written for a reader, not a lawyer. */
  note: string;
  /** Expiry horizon, months from the APPROVAL instant. The API computes the date. */
  reviewMonthsAhead: number;
}

export interface DpoOption {
  id: 'adopt_processor_dpa' | 'controller_only_no_uploads' | 'refuse_uploads_indefinitely';
  label: string;
  consequence: string;
}

export interface DpoMemoProposal {
  question: string;
  /** The drafted memo, markdown. Rendered, printed, and signed by a decision — not by silence. */
  memoMarkdown: string;
  options: readonly DpoOption[];
  recommendedOptionId: DpoOption['id'];
}

export type PacketProposal =
  | { kind: 'price_bands'; rows: readonly PacketPriceBandRow[] }
  | { kind: 'effort_triples'; rows: readonly PacketEffortTripleRow[] }
  | { kind: 'rate_cards'; rows: readonly RateCardProposalRow[]; applyDeferredReason: string }
  | { kind: 'perimeter_seed'; rows: readonly PerimeterSeedRow[] }
  | { kind: 'dpo_memo'; memo: DpoMemoProposal }
  /** G3: the two dials the inverse solver obeys. Bounds owned by `pricing.ts`. */
  | { kind: 'pricing_policy'; policy: PricingPolicyValues; rationale: string };

export interface FounderPacket {
  /** Stable id — `packet:<kind>`. One packet per kind; a revision replaces, never appends. */
  id: string;
  kind: PacketKind;
  title: string;
  /** What approving DOES, mechanically — which table gains which rows, what starts enforcing. */
  consequence: string;
  /** What approving does NOT do — the dependency that remains, named. */
  remainingDependency: string | null;
  proposal: PacketProposal;
  evidence: readonly PacketEvidence[];
  builtAt: string;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE ONE VALIDATOR — used by the builder's tests AND the API's decide route   */
/* ══════════════════════════════════════════════════════════════════════════ */

const CENTS_MAX = 100_000_000_00; // $100m — same ceiling spirit as the input desk's caps.
const DAYS_MAX = 365;

/*
 * ── THE PROPOSAL IS A SHAPE, NOT A BAG — keys and lengths are bounded ────────────────
 * `final_proposal` lands in a jsonb column, and the intake lockout's review standard for
 * admitting a jsonb column is explicit: name the only writer, and show no byte-bearing
 * payload survives a write and a read. The values were always bounded (integer cents,
 * finite days, enum classes); the KEYS were not — and `factor_scores_at_quote`'s review
 * (intakeLockout.test.ts) is the record of exactly that channel being found and closed
 * once before. So every level of every kind enumerates its legal keys here, an unknown
 * key is a defect, and every free-text field carries a cap. The memo is the largest
 * legitimate text in the system at 20k chars; nothing else needs a tenth of that.
 */
const TEXT_CAPS = {
  rationale: 2_000, source: 4_000, note: 4_000, jurisdiction: 200, partnerClass: 120,
  applyDeferredReason: 2_000, question: 1_000, memoMarkdown: 20_000, label: 200,
  consequence: 1_000,
} as const;

const KEYSETS: Record<PacketKind, Record<string, readonly string[]>> = {
  price_bands: {
    '': ['kind', 'rows'],
    rows: ['offerKey', 'lowCents', 'midCents', 'highCents', 'currency', 'rationale'],
  },
  effort_triples: {
    '': ['kind', 'rows'],
    rows: ['offerKey', 'optimisticDays', 'likelyDays', 'pessimisticDays', 'waterfall', 'rationale'],
    'rows.waterfall': ['aiDraftDays', 'internalQaDays', 'partnerDays'],
  },
  rate_cards: {
    '': ['kind', 'rows', 'applyDeferredReason'],
    rows: ['offerKey', 'partnerClass', 'unit', 'proposedRateCents', 'expectedUnits', 'rationale'],
  },
  perimeter_seed: {
    '': ['kind', 'rows'],
    rows: ['jurisdiction', 'offerKey', 'serviceClass', 'source', 'sourceUrl', 'note', 'reviewMonthsAhead'],
  },
  dpo_memo: {
    '': ['kind', 'memo'],
    memo: ['question', 'memoMarkdown', 'options', 'recommendedOptionId'],
    'memo.options': ['id', 'label', 'consequence'],
  },
  pricing_policy: {
    '': ['kind', 'policy', 'rationale'],
    policy: ['targetMarginPct', 'pLossCeiling'],
  },
};

function keyDefects(kind: PacketKind, node: unknown, path: string, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) keyDefects(kind, item, path, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const allowed = KEYSETS[kind][path];
  if (!allowed) return; // leaf objects with no keyset are impossible by construction; nothing to walk
  for (const k of Object.keys(node)) {
    if (!allowed.includes(k)) {
      out.push(`unknown key "${path ? `${path}.` : ''}${k}" — a proposal is a shape, not a bag, and an unlisted key is the first byte of a document store.`);
      continue;
    }
    const v = (node as Record<string, unknown>)[k];
    const cap = (TEXT_CAPS as Record<string, number>)[k];
    if (cap !== undefined && typeof v === 'string' && v.length > cap) {
      out.push(`"${path ? `${path}.` : ''}${k}" exceeds its ${cap}-character cap — long enough to be a payload, not a sentence.`);
    }
    const child = path ? `${path}.${k}` : k;
    if (KEYSETS[kind][child]) keyDefects(kind, v, child, out);
  }
}

/**
 * Defects in an (edited) proposal, as sentences. Empty array = acceptable. The API refuses a
 * decide whose proposal has defects; the tests refuse a SHIPPED packet with any — the builder
 * is held to the same bar as the owner's edits, by the same code.
 */
export function packetProposalDefects(proposal: PacketProposal): string[] {
  const out: string[] = [];
  // Shape first: unknown keys and over-cap strings are defects wherever they hide.
  keyDefects(proposal.kind, proposal, '', out);
  const badCents = (v: number) => !Number.isInteger(v) || v < 1 || v > CENTS_MAX;
  const badDays = (v: number) => !Number.isFinite(v) || v < 0 || v > DAYS_MAX;

  switch (proposal.kind) {
    case 'price_bands': {
      const seen = new Set<string>();
      for (const r of proposal.rows) {
        if (!OFFER_KEYS.includes(r.offerKey)) out.push(`price band names unknown offer "${r.offerKey}".`);
        if (seen.has(r.offerKey)) out.push(`price band repeats offer "${r.offerKey}" — one band per offer.`);
        seen.add(r.offerKey);
        if (badCents(r.lowCents) || badCents(r.midCents) || badCents(r.highCents)) {
          out.push(`price band for "${r.offerKey}" must be positive integer cents ≤ ${CENTS_MAX}.`);
        } else if (!(r.lowCents <= r.midCents && r.midCents <= r.highCents)) {
          out.push(`price band for "${r.offerKey}" must ascend low ≤ mid ≤ high.`);
        }
        if (r.currency !== 'USD') out.push(`price band for "${r.offerKey}" must be USD — one currency until the desk grows a second.`);
        if (!r.rationale.trim()) out.push(`price band for "${r.offerKey}" has no rationale — an unexplained number is not a proposal.`);
      }
      if (seen.size !== OFFER_KEYS.length) out.push(`price bands must cover every offer: ${seen.size} of ${OFFER_KEYS.length} present.`);
      break;
    }
    case 'effort_triples': {
      const seen = new Set<string>();
      for (const r of proposal.rows) {
        if (!OFFER_KEYS.includes(r.offerKey)) out.push(`effort triple names unknown offer "${r.offerKey}".`);
        if (seen.has(r.offerKey)) out.push(`effort triple repeats offer "${r.offerKey}".`);
        seen.add(r.offerKey);
        if (badDays(r.optimisticDays) || badDays(r.likelyDays) || badDays(r.pessimisticDays)) {
          out.push(`effort triple for "${r.offerKey}" must be finite person-days in [0, ${DAYS_MAX}].`);
        } else if (!(r.optimisticDays <= r.likelyDays && r.likelyDays <= r.pessimisticDays)) {
          out.push(`effort triple for "${r.offerKey}" must ascend optimistic ≤ likely ≤ pessimistic.`);
        }
        const w = r.waterfall;
        const wSum = w.aiDraftDays + w.internalQaDays + w.partnerDays;
        if (badDays(w.aiDraftDays) || badDays(w.internalQaDays) || badDays(w.partnerDays)) {
          out.push(`waterfall for "${r.offerKey}" must be finite non-negative days.`);
        } else if (Math.abs(wSum - r.likelyDays) > 0.01) {
          out.push(
            `waterfall for "${r.offerKey}" sums to ${wSum} but likely is ${r.likelyDays} — the decomposition must BE the likely case, or it is decoration.`,
          );
        }
      }
      if (seen.size !== OFFER_KEYS.length) out.push(`effort triples must cover every offer: ${seen.size} of ${OFFER_KEYS.length} present.`);
      break;
    }
    case 'rate_cards': {
      for (const r of proposal.rows) {
        if (!OFFER_KEYS.includes(r.offerKey)) out.push(`rate card names unknown offer "${r.offerKey}".`);
        if (!r.partnerClass.trim()) out.push(`rate card for "${r.offerKey}" has a blank partner class.`);
        if (/\b(gmbh|llp|llc|ltd|ag)\b/i.test(r.partnerClass)) {
          out.push(`rate card class "${r.partnerClass}" reads like a company name — classes only; names are the owner's (D5).`);
        }
        if (badCents(r.proposedRateCents)) out.push(`rate for "${r.offerKey}" must be positive integer cents.`);
        if (!Number.isFinite(r.expectedUnits) || r.expectedUnits <= 0) {
          out.push(`expectedUnits for "${r.offerKey}" must be > 0 — a card whose cost cannot be derived is useless (gpsInputs.ts).`);
        }
        if (r.unit === 'fixed' && r.expectedUnits !== 1) out.push(`fixed-rate card for "${r.offerKey}" must have expectedUnits 1.`);
      }
      if (!proposal.applyDeferredReason.trim()) out.push('rate_cards must state why apply is deferred.');
      break;
    }
    case 'perimeter_seed': {
      const seen = new Set<string>();
      for (const r of proposal.rows) {
        const k = `${r.jurisdiction.toLowerCase()}|${r.offerKey}`;
        if (seen.has(k)) out.push(`perimeter seed repeats ${k} — one position per jurisdiction × offer.`);
        seen.add(k);
        if (!OFFER_KEYS.includes(r.offerKey)) out.push(`perimeter row names unknown offer "${r.offerKey}".`);
        if (!r.jurisdiction.trim()) out.push('perimeter row has a blank jurisdiction.');
        if (!r.source.trim()) out.push(`perimeter row ${k} has no source — an unsourced position authorises nothing (perimeter.ts).`);
        if (!/unverified|verify/i.test(r.source)) {
          out.push(`perimeter row ${k}'s source does not admit it is unverified — a proposal that reads like a finding is a forgery of one.`);
        }
        if (!r.note.trim()) out.push(`perimeter row ${k} has no note — client-facing refusals quote it.`);
        if (!Number.isInteger(r.reviewMonthsAhead) || r.reviewMonthsAhead < 1 || r.reviewMonthsAhead > 24) {
          out.push(`perimeter row ${k} reviewMonthsAhead must be an integer 1–24.`);
        }
      }
      break;
    }
    case 'dpo_memo': {
      const m = proposal.memo;
      if (!m.question.trim()) out.push('dpo memo has no question.');
      if (m.memoMarkdown.trim().length < 400) out.push('dpo memo is too thin to be a memo — the decision deserves the analysis.');
      if (m.options.length < 2) out.push('dpo memo must present real options, plural.');
      if (!m.options.some((o) => o.id === m.recommendedOptionId)) out.push('dpo recommendation is not one of its own options.');
      for (const o of m.options) {
        if (!o.consequence.trim()) out.push(`dpo option "${o.id}" states no consequence.`);
      }
      break;
    }

    case 'pricing_policy': {
      // The bounds live in pricing.ts, cited by the solver's own refusals — ONE
      // definition of what a legal dial is, on both sides of the approval.
      out.push(...pricingPolicyDefects(proposal.policy));
      if (!proposal.rationale.trim()) out.push('pricing policy has no rationale — two bare numbers are a lever, not a decision.');
      break;
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE FIVE PACKETS                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

const ev = (
  claim: string,
  basis: string,
  provenance: PacketProvenance,
  caveat: string | null = null,
): PacketEvidence => ({ claim, basis, provenance, grade: PROVENANCE_GRADE[provenance], caveat });

const VERIFY = 'Assistant training knowledge, cutoff 2026-01, verified against nothing. Check 2–3 real quotes before relying on it.';

/** Proposed sell bands, integer USD cents. The placeholder is cited beside each so the owner sees the delta. */
const BAND_PROPOSALS: Record<OfferKey, { low: number; mid: number; high: number; why: string }> = {
  diagnostic: {
    low: 250_000, mid: 400_000, high: 600_000,
    why: 'Priced as a paid wedge, not a profit centre: low enough to say yes to inside one call, high enough that the reader takes its findings seriously. Placeholder was $1.5k–3k; consultancy quick-scan work commonly lands $2.5k–6k.',
  },
  mica_whitepaper: {
    low: 1_500_000, mid: 2_500_000, high: 4_000_000,
    why: 'EU law firms quote MiCA white-paper packages roughly €15k–50k+. LCX is not selling legal advice but drafting + submission craft with venue credibility, so mid sits at $25k — above the $12k–25k placeholder, below big-firm rates. High covers multi-token or contested-classification work.',
  },
  legal_opinion_coordination: {
    low: 1_000_000, mid: 1_500_000, high: 2_500_000,
    why: 'This is the COORDINATION fee only — scoping, counsel selection, fact package, review cycles. Counsel’s own fees pass through and are never inside this band; conflating them is how this offer loses money invisibly.',
  },
  gtm_sprint: {
    low: 1_200_000, mid: 1_800_000, high: 3_000_000,
    why: 'Two-to-three-week strategy sprints from boutique crypto advisories commonly land $10k–30k. Mid at $18k with the deliverable set the catalogue already defines.',
  },
  marketing_activation: {
    low: 1_200_000, mid: 2_000_000, high: 3_500_000,
    why: 'One activation programme, not a retainer. Agency equivalents run $10k–35k+ depending on channels; the perimeter packet constrains WHERE this may be sold at all, which matters more than the price.',
  },
};

/** Waterfall-decomposed effort, person-days. The decomposition IS the likely case, asserted by the validator. */
const EFFORT_PROPOSALS: Record<OfferKey, { o: number; l: number; p: number; ai: number; qa: number; partner: number; why: string }> = {
  diagnostic: {
    o: 1.5, l: 2.5, p: 4, ai: 0.5, qa: 1, partner: 1,
    why: 'Template-driven report; AI drafts the structure from intake facts in half a day, one QA day, one partner-review day where the findings touch regulated ground.',
  },
  mica_whitepaper: {
    o: 6, l: 9, p: 14, ai: 2, qa: 4, partner: 3,
    why: 'Annex I/II structure is templatable; the days live in QA against the actual token facts and the partner pass on classification language. Pessimistic covers a contested classification or a second review cycle with the venue.',
  },
  legal_opinion_coordination: {
    o: 3, l: 5, p: 8, ai: 1, qa: 2, partner: 2,
    why: 'Coordination is fact-package assembly + counsel management. Partner days here are the LIAISON share, not the opinion itself — that is counsel’s own engagement, outside this triple.',
  },
  gtm_sprint: {
    o: 4, l: 6, p: 10, ai: 1.5, qa: 3, partner: 1.5,
    why: 'Sprint structure is repeatable; QA carries the strategy judgment. Pessimistic covers a pivot mid-sprint.',
  },
  marketing_activation: {
    o: 5, l: 8, p: 13, ai: 2, qa: 3.5, partner: 2.5,
    why: 'Activation needs channel execution (partner/agency share) plus compliance-gated copy, which the marketing module already enforces on LCX’s own mouth.',
  },
};

interface SeedSpec { j: string; cls: Record<OfferKey, ServiceClass>; basis: string; notes: Partial<Record<OfferKey, string>> }

/**
 * Six jurisdictions × five offers. EVERY class below is a PROPOSAL graded C3 — the source
 * string on each row says so in words, because these rows outlive this file and must carry
 * their own honesty. Prohibitions enforce the moment they land (perimeter.ts: a prohibited
 * class blocks even unreviewed); everything else stays a draft until the second-human review.
 */
const PERIMETER_PROPOSALS: readonly SeedSpec[] = [
  {
    j: 'Liechtenstein',
    cls: { diagnostic: 'permitted', mica_whitepaper: 'permitted', legal_opinion_coordination: 'permitted', gtm_sprint: 'permitted', marketing_activation: 'counsel_required' },
    basis: 'LCX’s home establishment; TVTG/MiCA venue standing. Marketing of crypto services remains FMA-guidance territory, hence counsel on activation.',
    notes: { marketing_activation: 'Activation copy targeting Liechtenstein/EEA retail needs counsel sign-off on financial-promotion framing before any channel goes live.' },
  },
  {
    j: 'Germany',
    cls: { diagnostic: 'permitted', mica_whitepaper: 'permitted', legal_opinion_coordination: 'partner_required', gtm_sprint: 'permitted', marketing_activation: 'counsel_required' },
    basis: 'MiCA applies EU-wide for the white-paper work; German legal opinions require licensed German counsel (RDG); BaFin marketing practice makes activation counsel-gated.',
    notes: { legal_opinion_coordination: 'Coordination is permitted-shaped but the OPINION must come from licensed German counsel — the partner requirement is the honest class for the offer as sold.' },
  },
  {
    j: 'France',
    cls: { diagnostic: 'permitted', mica_whitepaper: 'permitted', legal_opinion_coordination: 'partner_required', gtm_sprint: 'permitted', marketing_activation: 'counsel_required' },
    basis: 'MiCA for the paper; French legal advice monopoly for opinions; AMF marketing rules for activation.',
    notes: {},
  },
  {
    j: 'Netherlands',
    cls: { diagnostic: 'permitted', mica_whitepaper: 'permitted', legal_opinion_coordination: 'partner_required', gtm_sprint: 'permitted', marketing_activation: 'counsel_required' },
    basis: 'MiCA for the paper; Dutch counsel for opinions; AFM marketing practice for activation.',
    notes: {},
  },
  {
    j: 'United Kingdom',
    cls: { diagnostic: 'permitted', mica_whitepaper: 'permitted', legal_opinion_coordination: 'partner_required', gtm_sprint: 'counsel_required', marketing_activation: 'prohibited' },
    basis: 'FSMA s21 financial-promotion regime extends to cryptoassets (from 2023-10): promotions to UK audiences need an authorised approver, which LCX is not.',
    notes: {
      marketing_activation: 'Prohibited as sold: LCX cannot lawfully run promotion activation aimed at UK audiences without an FCA-authorised approver. A UK client marketing EXCLUSIVELY outside the UK is a different engagement — re-enter that as counsel_required with counsel sign-off.',
      gtm_sprint: 'Strategy itself is fine; counsel gate exists because a GTM sprint for a UK launch collides with the s21 regime the moment it touches promotion planning.',
    },
  },
  {
    j: 'United States',
    cls: { diagnostic: 'permitted', mica_whitepaper: 'permitted', legal_opinion_coordination: 'partner_required', gtm_sprint: 'counsel_required', marketing_activation: 'prohibited' },
    basis: 'Securities solicitation risk and state-level regimes make promotion activation for US audiences undeliverable by LCX; the MiCA paper for a US project entering the EU is EU-facing work and fine.',
    notes: {
      marketing_activation: 'Prohibited as sold: activation aimed at US persons carries solicitation risk LCX cannot underwrite. US-client engagements marketing exclusively into the EEA are a different engagement — re-enter as counsel_required.',
    },
  },
];

const DPO_MEMO: DpoMemoProposal = {
  question:
    'When a client (or their counsel) hands LCX third-party confidential material for a GPS engagement — and when the G4 portal lets them upload it — is LCX a controller or a processor for that material, and on what terms may it be accepted?',
  memoMarkdown: [
    '## The question, precisely',
    'GPS delivery work runs on client-supplied material: token documentation, cap tables, legal memos, counterparty contracts. Some of it is confidential to THIRD parties (investors, counterparties, counsel work-product), and some contains personal data. Today the intake lockout refuses every upload surface because this question was never answered. The G4 portal cannot ship without an answer.',
    '',
    '## Roles analysis',
    '**For client-supplied engagement material: LCX is a processor.** The client determines the purpose (obtain the service) and the means (which documents to supply); LCX processes them solely on the client’s instruction to deliver the contracted work. That is the Article 28 shape, and it wants a Data Processing Agreement: documented instructions, confidentiality, security measures, sub-processor disclosure (Supabase — infrastructure already in eu-central-1, a repo-measured fact), deletion on termination.',
    '**For LCX’s own engagement records — quotes, margins, outcomes, perimeter stamps — LCX is the controller.** These exist for LCX’s own purposes (running its book) and no DPA covers them; the record distinguishes the two planes rather than blending them.',
    '**Third-party confidential material (not personal data) is a contract question, not a GDPR one:** the engagement terms need a confidentiality clause with a use-limitation matching the DPA’s instruction-limitation, so both planes point the same way.',
    '',
    '## Transfers and residence',
    'Storage is Supabase eu-central-1 (measured from this repository’s connection target, not assumed). While processing stays in the EEA no transfer mechanism is engaged; if a sub-processor outside the EEA is ever added, SCCs become the mechanism and the DPA’s sub-processor clause is where the client learns of it.',
    '',
    '## Retention',
    'Proposal: client-supplied material is retained for the engagement plus 24 months (dispute horizon), then deleted; LCX’s own records are retained indefinitely as controller. The portal states both plainly.',
    '',
    '## The options',
    'Option A — adopt the processor posture with a DPA template (recommended): unlocks uploads and the portal with the strongest client story. Option B — controller-only: never accept client files; the portal ships forms-only and delivery keeps working from typed facts and external references. Option C — refuse uploads indefinitely: today’s posture, made permanent.',
  ].join('\n'),
  options: [
    {
      id: 'adopt_processor_dpa',
      label: 'Processor posture + DPA template (recommended)',
      consequence: 'Unlocks the G4 portal’s upload surface and the delivery desk’s client-material intake, behind a DPA the client accepts at engagement start. LCX commits to instruction-limited use, EEA residence, and deletion at engagement + 24 months.',
    },
    {
      id: 'controller_only_no_uploads',
      label: 'Controller-only: forms, never files',
      consequence: 'The portal ships with typed intake forms only. Delivery continues to reference external material by location (the inert external_location field), and the intake lockout stays enforced everywhere.',
    },
    {
      id: 'refuse_uploads_indefinitely',
      label: 'Refuse uploads indefinitely',
      consequence: 'Today’s posture becomes the decided one. G4 narrows to status + approvals only. Honest, and the most limiting for delivery volume.',
    },
  ],
  recommendedOptionId: 'adopt_processor_dpa',
};

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE BUILDER                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

export function buildFounderPackets(asOf: string): FounderPacket[] {
  const bands: PacketPriceBandRow[] = OFFER_KEYS.map((k) => ({
    offerKey: k,
    lowCents: BAND_PROPOSALS[k].low,
    midCents: BAND_PROPOSALS[k].mid,
    highCents: BAND_PROPOSALS[k].high,
    currency: 'USD',
    rationale: BAND_PROPOSALS[k].why,
  }));

  const triples: PacketEffortTripleRow[] = OFFER_KEYS.map((k) => {
    const e = EFFORT_PROPOSALS[k];
    return {
      offerKey: k,
      optimisticDays: e.o,
      likelyDays: e.l,
      pessimisticDays: e.p,
      waterfall: { aiDraftDays: e.ai, internalQaDays: e.qa, partnerDays: e.partner },
      rationale: e.why,
    };
  });

  const rateCards: RateCardProposalRow[] = [
    { offerKey: 'diagnostic', partnerClass: 'analyst_support', unit: 'per_day', proposedRateCents: 60_000, expectedUnits: 1, rationale: 'One analyst day at $600 for the partner-review share of the diagnostic.' },
    { offerKey: 'mica_whitepaper', partnerClass: 'regulatory_drafting_support', unit: 'per_day', proposedRateCents: 120_000, expectedUnits: 3, rationale: 'Three days at $1,200 for classification-language review — support drafting rates, not partner-track counsel rates.' },
    { offerKey: 'legal_opinion_coordination', partnerClass: 'licensed_local_counsel_liaison', unit: 'per_day', proposedRateCents: 200_000, expectedUnits: 2, rationale: 'Two liaison days at $2,000. Counsel’s OPINION fee is the client’s own engagement with counsel and never enters this card.' },
    { offerKey: 'gtm_sprint', partnerClass: 'gtm_specialist', unit: 'per_day', proposedRateCents: 100_000, expectedUnits: 1.5, rationale: 'A day and a half of specialist input at $1,000/day on the sprint’s market-structure judgments.' },
    { offerKey: 'marketing_activation', partnerClass: 'activation_agency', unit: 'fixed', proposedRateCents: 400_000, expectedUnits: 1, rationale: 'Fixed $4,000 agency execution block per activation, channels per the engagement.' },
  ];

  const seedRows: PerimeterSeedRow[] = PERIMETER_PROPOSALS.flatMap((s) =>
    OFFER_KEYS.map((k) => ({
      jurisdiction: s.j,
      offerKey: k,
      serviceClass: s.cls[k],
      source: `System proposal, UNVERIFIED (assistant knowledge, cutoff 2026-01): ${s.basis} Verify with qualified counsel before relying on this position.`,
      sourceUrl: null,
      note: s.notes[k]
        ?? `${s.j}: proposed ${s.cls[k].replace(/_/g, ' ')} for this offer. This row was system-proposed and owner-approved; it is not a legal finding.`,
      reviewMonthsAhead: 6,
    })),
  );

  const packets: FounderPacket[] = [
    {
      id: 'packet:price_bands',
      kind: 'price_bands',
      title: 'Sell-side price bands — five offers, USD',
      consequence:
        'Approving writes one gps_price_band row per offer. Every quote and the public catalogue stop showing badged placeholders and start showing these numbers, attributed to you.',
      remainingDependency: null,
      proposal: { kind: 'price_bands', rows: bands },
      evidence: [
        ev('The compiled placeholders these replace are $1.5k–3k / $12k–25k / $8k–18k / $10k–22k / $10k–25k.', 'packages/shared/src/gps/catalogue.ts TODO_PRICE_BANDS — read, not recalled.', 'repo_measurement'),
        ev('EU law-firm MiCA white-paper packages commonly quote in the €15k–50k+ range.', 'Market context for the mica_whitepaper band.', 'assistant_knowledge_unverified', VERIFY),
        ev('Boutique advisory sprint and activation work commonly lands $10k–35k per programme.', 'Market context for gtm_sprint and marketing_activation bands.', 'assistant_knowledge_unverified', VERIFY),
        ev('The coordination band deliberately EXCLUDES counsel’s own fees; they pass through.', 'Pricing the pass-through inside the band is how this offer loses money invisibly.', 'design_decision'),
      ],
      builtAt: asOf,
    },
    {
      id: 'packet:effort_triples',
      kind: 'effort_triples',
      title: 'Effort triples — person-days under the three-stage waterfall',
      consequence:
        'Approving writes one gps_effort_triple row per offer. Underwriting moves off `basis: prior`: every new quote’s margin distribution runs on these days instead of shipped priors.',
      remainingDependency:
        'The triples assume the G5 delivery factory (AI draft → QA → partner). Until G5 ships, actuals will run above the optimistic edge — the calibration loop will show this rather than hide it.',
      proposal: { kind: 'effort_triples', rows: triples },
      evidence: [
        ev('Underwriting today labels every distribution basis:prior because gps_effort_triple is empty.', 'apps/api/src/routes/gpsInputs.ts desk output; underwrite.ts basis arithmetic.', 'repo_measurement'),
        ev('The waterfall decomposition (AI/QA/partner) is the owner’s chosen delivery model, decision 6 of the 2026-08-21 record.', 'GPS_REVENUE_100X_PLAN.md §1.', 'repo_measurement'),
        ev('Per-offer day estimates under an AI-first-draft process.', 'No measured actuals exist yet anywhere — that is what the loop will produce.', 'assistant_knowledge_unverified', 'These are estimates about a process that has not run. The loop corrects them from outcomes; approving them is approving a starting point, not a truth.'),
      ],
      builtAt: asOf,
    },
    {
      id: 'packet:rate_cards',
      kind: 'rate_cards',
      title: 'Partner rate cards — proposed values per partner CLASS',
      consequence:
        'Approving records the values you would pay per partner class. NOTHING is written to gps_rate_card yet: a card needs a NAMED partner, the bench is empty by decision D5, and the write surface refuses accordingly.',
      remainingDependency:
        'You name real partners (in the partner registry). The moment a named partner exists for a class, the approved value here is one prefilled write away from a live card.',
      proposal: {
        kind: 'rate_cards',
        rows: rateCards,
        applyDeferredReason:
          'PARTNER_BENCH is empty (D5) and gpsInputs refuses cards for unnamed partners — inventing a plausible counsel name to make this applicable would be the worst thing this packet could do.',
      },
      evidence: [
        ev('The bench is a compiled empty array and every card write refuses with PARTNER_BENCH_EMPTY.', 'packages/shared/src/gps/partners.ts PARTNER_BENCH; gpsInputs.ts refusal path.', 'repo_measurement'),
        ev('Day-rate ranges for drafting support, counsel liaison and GTM specialists.', 'Market context for the proposed values.', 'assistant_knowledge_unverified', VERIFY),
      ],
      builtAt: asOf,
    },
    {
      id: 'packet:perimeter_seed',
      kind: 'perimeter_seed',
      title: 'Jurisdiction perimeter — 30 proposed positions across 6 jurisdictions',
      consequence:
        'Approving enters each row via the same path as manual entry. The two PROHIBITED rows (UK and US marketing activation) start blocking IMMEDIATELY — a prohibition enforces even unreviewed. Every other row stays a draft that authorises nothing until a SECOND human reviews it: the system refuses self-review, so your approval cannot double as the review.',
      remainingDependency:
        'Monty (the other approver) must review each non-prohibited row before it can yield permitted/counsel_required/partner_required. Until then those pairs keep operating advisory — recorded, stamped, not enforced — exactly as today.',
      proposal: { kind: 'perimeter_seed', rows: seedRows },
      evidence: [
        ev('Prohibitions block even when stale or unreviewed; absences pass advisory with a recorded stamp; a reviewed row self-heals its pair into enforcement.', 'packages/shared/src/gps/perimeter.ts perimeterDisposition + classify — read, not recalled.', 'repo_measurement'),
        ev('UK: FSMA s21 financial-promotion regime extends to cryptoassets from October 2023; promotions to UK audiences need an authorised approver.', 'Basis for the UK marketing_activation prohibition.', 'assistant_knowledge_unverified', VERIFY),
        ev('Legal opinions in DE/FR/NL require licensed local counsel; coordination without the licensed opinion is the offer as designed.', 'Basis for partner_required on legal_opinion_coordination.', 'assistant_knowledge_unverified', VERIFY),
        ev('Six jurisdictions is a deliberate floor, not a map of the world. An absent jurisdiction stays advisory-with-stamp, which is the honest state for markets nobody has considered.', 'Scope choice for the seed.', 'design_decision'),
      ],
      builtAt: asOf,
    },
    {
      id: 'packet:dpo_memo',
      kind: 'dpo_memo',
      title: 'DPO decision — client material: controller, processor, or refuse',
      consequence:
        'Approving RECORDS the decision (which option, decided by whom, when). It does not build the upload surface: G4 reads this decision and ships what it permits. Choosing option A commits LCX to the DPA posture described in the memo.',
      remainingDependency:
        'If option A: a DPA template must exist before the first client upload — G4’s first work item, gated on this decision.',
      proposal: { kind: 'dpo_memo', memo: DPO_MEMO },
      evidence: [
        ev('Every upload surface is refused today by the intake lockout, mutation-tested against adversarial edits.', 'apps/api/src/gps/__tests__/intakeLockout.test.ts and noIntake.test.ts.', 'repo_measurement'),
        ev('Storage residence is Supabase eu-central-1.', 'The repo’s own connection target — measured, which is why the memo can speak about transfers.', 'repo_measurement'),
        ev('The processor/controller split for client-supplied vs LCX-own material follows the Article 28 shape.', 'Roles analysis in the memo.', 'assistant_knowledge_unverified', 'This memo is a drafted analysis for the owner’s decision, not legal advice, and says so.'),
      ],
      builtAt: asOf,
    },
    {
      id: 'packet:pricing_policy',
      kind: 'pricing_policy',
      title: 'Pricing policy — the two dials every proposed price obeys',
      consequence:
        'Approving writes one gps_pricing_policy row (append-only; the latest row is the live policy). '
        + 'POST /v1/gps/underwriting/propose-price stops refusing PRICING_POLICY_ABSENT and starts proposing: '
        + 'price = max(median cost ÷ (1 − target margin), the cost order statistic your loss ceiling demands), '
        + 'solved over the same seeded Monte Carlo the forward underwriting reports, then re-underwritten at the '
        + 'proposed price so the proposal never travels without its proof.',
      remainingDependency:
        'Every proposed price stays yours to edit or discard per quote (decision 4 of the 2026-08-21 record), '
        + 'and shouldBlockIssue keeps its independent veto at issue. The solver proposes; it never prices.',
      proposal: {
        kind: 'pricing_policy',
        policy: { targetMarginPct: 0.45, pLossCeiling: 0.1 },
        rationale:
          'A 45% target median margin carries the three-stage waterfall’s coordination overhead and the '
          + 'unbilled owner time every engagement absorbs; below ~35% a single pessimistic-tail engagement erases '
          + 'its neighbour’s profit. The 0.10 loss ceiling sits at HALF the issue guard’s stated block threshold '
          + '(maxPLoss 0.2), so system-proposed prices live safely inside the veto rather than testing it.',
      },
      evidence: [
        ev('The issue guard already blocks any quote whose P(loss) exceeds 0.2 — a stated prior, attributed to system:default.', 'packages/shared/src/gps/underwrite.ts DEFAULT_ISSUE_POLICY — read, not recalled.', 'repo_measurement'),
        ev('Solving the loss floor at 0.10 — half the block threshold — keeps every system proposal inside the veto with margin to spare.', 'Relationship between the proposed dial and the measured guard above.', 'design_decision'),
        ev('Boutique advisory and regulatory-drafting gross margins commonly land in the 40–60% range.', 'Market context for the 45% target.', 'assistant_knowledge_unverified', VERIFY),
        ev('Ceilings between the observed grid points (p50/p90/p95/max) are evidenced at the next stricter statistic — the snap can only raise a floor, and the basis names it whenever it happens.', 'packages/shared/src/gps/pricing.ts PRICE_PROPOSAL_METHOD; the percentile discipline is PERCENTILE_METHOD’s.', 'design_decision'),
      ],
      builtAt: asOf,
    },
  ];

  return packets;
}

/** Convenience: bands as the midpoint-anchored placeholder comparison the UI shows. */
export function placeholderBandFor(k: OfferKey): { lowCents: number; midCents: number; highCents: number } {
  const offer = getOffer(k);
  return { lowCents: offer.priceBandCents.min, midCents: bandMidpointCents(offer), highCents: offer.priceBandCents.max };
}
