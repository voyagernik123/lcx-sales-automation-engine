import type { OfferKey, PriceBandCents, ServiceOffer } from './types.js';
import { DEFAULT_CONTRACTING_ENTITY } from './types.js';

/**
 * GLOBAL SERVICES — the offer catalogue. COMPILED POLICY, not a table.
 *
 * WHY THIS IS CODE. The mandate asked for `service_catalog_item`,
 * `service_module`, `jurisdiction_profile` and `service_perimeter` as database
 * tables. All four are POLICY, and this repo already puts commercial and legal
 * policy in versioned code that goes through review: the claim library
 * (`packages/shared/src/claims/claims.ts:6`), the package catalogue
 * (`packages/shared/src/deals/index.ts:17`), the source registry
 * (`packages/shared/src/provenance.ts:48`). Policy in a table is policy that
 * changes without code review — for a licensed exchange's employee selling
 * regulated-adjacent services, that is a downgrade, not a feature. Every
 * exclusion below is a sentence that limits LCX's exposure; each one should
 * require a diff, a reviewer and a deploy to weaken.
 *
 * What is quoted to a client is FROZEN at quote time into
 * `gps_engagement.scope_snapshot`, so editing this file never rewrites history.
 *
 * FIVE OFFERS, NOT TEN. Four of these have actually been sold — MiCA white
 * paper, legal-opinion coordination, GTM/TGE sprint, marketing activation —
 * ~$250k total, manually, with no system. The fifth is the paid diagnostic front
 * door. A longer menu is an aspiration, and the plan refuses it (§8): a services
 * business that quotes work it cannot staff burns the referral network that is
 * its only real asset.
 *
 * WHO DELIVERS. Partners and specialists deliver; the founder sells and
 * coordinates. Therefore `partnerOwner` is `null` on every offer here and
 * `expectedVendorCostCents` is a placeholder — there is no named bench yet
 * (decision D5, blocking Phase 2). That is stated rather than papered over: a
 * null owner means the engagement CANNOT BE STAFFED, and the UI should say so.
 */

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  TODO — PRICE BANDS ARE PLACEHOLDERS. NOT REAL PRICES. DO NOT QUOTE THESE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  Decision D4 (plan §3) is unanswered: only the founder can set price bands,
 *  and he has not supplied them. Every band in this ONE BLOCK is a placeholder
 *  shaped by the two facts he did give — typical engagement $10–25k, and the
 *  diagnostic must be ~$1.5–3k AND creditable, because a $5–10k diagnostic is
 *  20–50% of the whole deal and will not sell.
 *
 *  They live in a single object, on purpose, so replacing them is one edit in
 *  one place with no risk of a stale number surviving somewhere else. Nothing
 *  else in the catalogue mentions money.
 *
 *  `PRICE_BANDS_ARE_PLACEHOLDERS` is exported so surfaces can BADGE the numbers
 *  instead of rendering them as though they were agreed. Flip it to `false` in
 *  the same commit that supplies real bands — never before.
 *
 *  Vendor costs are placeholders for the same reason (D5: no rate cards, because
 *  no named partners). Margin arithmetic is therefore CORRECT BUT UNCALIBRATED,
 *  and that distinction has to reach the screen.
 */
export const PRICE_BANDS_ARE_PLACEHOLDERS = true;

/** TODO(D4): replace with founder-supplied bands. Integer cents, USD. */
const TODO_PRICE_BANDS: Record<OfferKey, PriceBandCents> = {
  diagnostic: { min: 150_000, max: 300_000 },                       // $1,500–$3,000
  mica_whitepaper: { min: 1_200_000, max: 2_500_000 },              // $12,000–$25,000
  legal_opinion_coordination: { min: 800_000, max: 1_800_000 },     // $8,000–$18,000
  gtm_sprint: { min: 1_000_000, max: 2_200_000 },                   // $10,000–$22,000
  marketing_activation: { min: 1_000_000, max: 2_500_000 },         // $10,000–$25,000
};

/**
 * TODO(D5): replace with real partner rate cards. Integer cents, USD.
 * Set at roughly half the band floor as a deliberately CONSERVATIVE placeholder:
 * a too-high placeholder makes margin look worse than it is and gets ignored,
 * a too-low one makes it look safe. Neither is calibrated. Only names and rate
 * cards fix this.
 */
const TODO_VENDOR_COSTS: Record<OfferKey, number> = {
  diagnostic: 40_000,                        // $400 — mostly the founder's own time
  mica_whitepaper: 600_000,                  // $6,000
  legal_opinion_coordination: 500_000,       // $5,000 — counsel's own fee, passed through
  gtm_sprint: 450_000,                       // $4,500
  marketing_activation: 550_000,             // $5,500
};

/**
 * Exclusions that EVERY offer carries, appended to each offer's specific ones.
 *
 * These four are not boilerplate; they are the perimeter of the whole business
 * and each one exists because of a specific, named risk:
 *
 *  1. LISTING. The founder is an LCX employee and LCX is a regulated exchange.
 *     Any implication that paying for services influences a listing decision is
 *     the single largest reputational and regulatory exposure in this programme
 *     (plan §9). It is also currently moot in the most awkward possible way —
 *     LCX listing is UNAVAILABLE — which makes silence indefensible.
 *  2. REGULATOR APPROVAL. No regulatory fact in the plan was verifiable (§0);
 *     nobody here may characterise what a regulator will do.
 *  3. LEGAL ADVICE. Overridden by exactly one offer, which COORDINATES counsel
 *     rather than advising, and says so in its own exclusion list.
 *  4. MARKET OUTCOMES. No price, volume, liquidity or market-making outcome is
 *     ever promised. The market-making lane is deliberately not built at all
 *     until the executed BitStreet agreement has been read (D6, plan §8).
 */
/** Named because exactly one offer substitutes a sharper version of it. */
export const NO_LEGAL_ADVICE_EXCLUSION =
  'No legal, tax, accounting or investment advice is provided. Deliverables are commercial and documentary work product and are not a substitute for advice from your own qualified advisers.';

const UNIVERSAL_EXCLUSIONS: readonly string[] = [
  'No listing of any kind is included, implied or influenced by this engagement — on LCX or on any other venue. Listing decisions are made by exchanges under their own independent processes, and no fee paid here affects them.',
  'No regulatory approval, registration, authorisation, notification acceptance or supervisory outcome is promised, predicted or warranted. No representation is made about how any competent authority will act.',
  NO_LEGAL_ADVICE_EXCLUSION,
  'No market-making, liquidity provision, trading volume, token price, market capitalisation, exchange ranking or listing-timeline outcome is included, promised or forecast.',
];

/**
 * The ONLY offer permitted to drop the blanket no-legal-advice line, and only
 * because its own list says the same thing more precisely: the opinion is
 * counsel's, we coordinate, we do not review or endorse its conclusions.
 *
 * A literal allow-list rather than a flag on the offer, so adding a second
 * exception is a visible edit here rather than a boolean somebody sets in
 * passing.
 *
 * NOT YET ASSERTED BY A TEST — no `catalogue.test.ts` exists (this file's author
 * did not own a test file). The invariant that needs one: every offer's FINAL
 * exclusions disclaim legal advice, either through the universal line or through
 * its own sharper substitute.
 */
const SUBSTITUTES_LEGAL_ADVICE_LINE: readonly OfferKey[] = ['legal_opinion_coordination'];

/**
 * The default contracting party for a new quote (D1, deliberately undecided).
 * Re-exported from here so quote builders read the default from the catalogue —
 * one place — rather than each inventing one.
 */
export const CATALOGUE_DEFAULT_CONTRACTING_ENTITY = DEFAULT_CONTRACTING_ENTITY;

/**
 * A NOTE ON HOW THE INCLUSIONS BELOW ARE WORDED, because it is a deliberate
 * constraint and not timidity.
 *
 * No regulatory fact in this programme was verifiable (plan §0: web access
 * failed all session; everything regulatory is recalled training data with a
 * May 2026 cutoff). So inclusions describe OUR WORK PRODUCT — what we draft,
 * assemble, structure and hand over — and name the CLIENT'S COUNSEL as the
 * authority on what the applicable regime requires. We never assert what a
 * regulation demands, which means these lines stay true even if a rule changed
 * yesterday, and the one place a rule is characterised is a place where a
 * qualified adviser signed for it.
 */
const OFFERS_INTERNAL: readonly ServiceOffer[] = [
  {
    key: 'diagnostic',
    name: 'Token Readiness Diagnostic',
    outcome:
      'A written readiness assessment of your token, documentation and go-to-market position, with a prioritised list of what must be fixed before any launch, offering or listing application — and a fixed-scope proposal for the work you choose to take forward.',
    inclusions: [
      'Structured intake call (90 minutes) with the founder and, where useful, one specialist observer.',
      'Documentation review of what you already have: white paper or offering document, tokenomics model, website and public claims, and any prior legal or compliance memoranda you choose to share.',
      'Token structure summary: supply, emission and unlock schedule, allocation split, utility mechanics, and where those three contradict each other (they usually do).',
      'Public-claims audit: a list of statements on your site, deck and social channels that a supervisor or an exchange listing committee would ask you to substantiate or withdraw.',
      'Documentation gap register: what is missing, who has to produce it (you, your counsel, or a specialist), and the realistic order of operations.',
      'Go-to-market position summary: current community and holder concentration, exchange presence, and the two or three narratives your material is actually making.',
      'A written diagnostic (10–15 pages) with findings ranked by what blocks the next step, each with a named owner.',
      'A 60-minute readout call, and a fixed-scope, fixed-price proposal for any follow-on work.',
    ],
    exclusions: [
      'This is an assessment, not remediation: nothing identified in the diagnostic is fixed, drafted or rewritten as part of it.',
      'No legal opinion, regulatory classification, or view on whether your token is a security, a utility token, an e-money token or an asset-referenced token. Where classification matters, the diagnostic says so and stops there.',
      'No introduction to, application to, or advocacy with any exchange, venue, market maker or investor.',
      'No technical, smart-contract or security audit, and no economic simulation of your token model.',
      'No due diligence on your team, cap table or corporate history, and no verification of facts you provide — the diagnostic reasons from what you tell us and says where it is doing so.',
    ],
    requiredClientInputs: [
      'Named point of contact with authority to answer commercially.',
      'Current white paper, offering document or equivalent, in whatever state it is in.',
      'Tokenomics: supply, allocations, vesting and emission schedule.',
      'Links to live public material — site, deck, socials, any prior announcements.',
      'Which jurisdictions you are actually targeting, and any counsel already engaged.',
    ],
    partnerOwner: null,
    expectedVendorCostCents: TODO_VENDOR_COSTS.diagnostic,
    acceptanceCriteria: [
      'Written diagnostic delivered within 10 business days of the intake call and receipt of all required client inputs.',
      'Every finding carries a severity, a named owner (client / counsel / specialist) and a stated basis.',
      'Readout call held; a written follow-on proposal issued within 3 business days of it.',
    ],
    priceBandCents: TODO_PRICE_BANDS.diagnostic,
    renewalPath:
      'The diagnostic IS the qualification step: its gap register names the follow-on offers, and its fee is credited in full against the first engagement started within 90 days.',
    isDiagnostic: true,
    // ~$1.5–3k and creditable, not the $5–10k the mandate implied. At a $10–25k
    // engagement, a non-creditable $5–10k diagnostic is 20–50% of the deal and
    // will not sell (plan §3, D4).
    creditableAgainstEngagement: true,
  },
  {
    key: 'mica_whitepaper',
    name: 'MiCA White Paper — Drafting & Submission Package',
    outcome:
      'A complete, internally consistent crypto-asset white paper package, drafted against the content requirements confirmed by your counsel, together with the assembled notification pack your counsel or your authorised entity files with the competent authority.',
    inclusions: [
      'Requirements matrix agreed with your counsel at kick-off: every content item the applicable regime requires, mapped to a section of the document and to a named owner.',
      'Full drafting of the white paper from your existing material: issuer and offeror information, project and team description, the offer and its terms, rights and obligations attaching to the token, underlying technology, and the risk section.',
      'Plain-language summary section, written to be readable by a retail holder rather than by us.',
      'Tokenomics section reconciled against your actual contract and vesting schedule — including flagging where the published schedule and the deployed contract disagree.',
      'Risk factors section built specifically for your token type and structure, not a boilerplate list.',
      'Sustainability / environmental-impact disclosure section prepared from consensus-mechanism and infrastructure data you supply.',
      'Mandatory statements and legends placed as your counsel confirms them, including any required statement that the document has not been approved or reviewed by an authority.',
      'Consistency pass across white paper, website, marketing communications and social claims, so the document does not contradict your own live material — the most common and most avoidable finding.',
      'Notification pack assembled: final document in the required format, supporting annexes, cover materials, and a submission checklist your counsel or authorised entity uses to file.',
      'Two full revision rounds after your counsel\'s first review, plus a machine-readable change log.',
      'Post-submission amendment support for 30 days, limited to responding to authority or counsel comments on the document we drafted.',
    ],
    exclusions: [
      'We do not file. Submission to any competent authority is made by you, your counsel, or your authorised entity — never by us on your behalf.',
      'No legal advice and no legal opinion. Whether the applicable regime applies to you, which token category you fall into, and what the regime requires are questions for your counsel; we draft to the requirements your counsel confirms.',
      'No representation of you before any authority, and no communication with any authority in your name.',
      'No opinion on whether the document will be accepted, and no view on timing of any authority\'s response.',
      'No translation into additional languages, and no certified or sworn translation.',
      'No smart-contract audit, no code review, and no verification that the deployed contract matches the described tokenomics — we report contradictions we notice, which is not the same as assuring the code.',
      'No verification of facts, figures, holdings, team credentials or financial statements you supply; the document reproduces your representations as yours.',
      'No white paper for a token type outside the scope agreed at kick-off (e.g. moving from a utility token to an asset-referenced or e-money token mid-engagement is new scope).',
    ],
    requiredClientInputs: [
      'Named counsel engaged and available, with confirmation of the applicable regime and token category — work cannot start without this.',
      'Corporate and issuer details: registered entity, jurisdiction, directors, and the authorised signatory for the document.',
      'Deployed or final contract addresses and the actual vesting/emission configuration.',
      'Tokenomics workbook: supply, allocations, unlocks, treasury policy.',
      'Consensus mechanism and infrastructure detail sufficient for the sustainability disclosure.',
      'All existing public material and any prior versions of the document.',
      'A single named reviewer on your side empowered to close comments.',
    ],
    partnerOwner: null,
    expectedVendorCostCents: TODO_VENDOR_COSTS.mica_whitepaper,
    acceptanceCriteria: [
      'Every line of the kick-off requirements matrix is either drafted or explicitly marked as owned by client/counsel with a reason.',
      'First full draft delivered within 20 business days of kick-off and receipt of all required client inputs.',
      'Your counsel confirms in writing that the document addresses each item on the agreed matrix.',
      'Zero unresolved internal contradictions between the white paper, the tokenomics workbook and live public material, or each remaining one is listed with a client decision recorded against it.',
      'Notification pack delivered complete against the submission checklist, with each item marked present or client-owned.',
    ],
    priceBandCents: TODO_PRICE_BANDS.mica_whitepaper,
    renewalPath:
      'Material changes to the offer, the token or the team require an updated document; annual review and amendment support is quoted separately. Clients reaching this stage typically take GTM next.',
    isDiagnostic: false,
    creditableAgainstEngagement: false,
  },
  {
    key: 'legal_opinion_coordination',
    /**
     * THE OFFER THAT MUST BE NAMED MOST CAREFULLY IN THE WHOLE CATALOGUE.
     *
     * What is sold is COORDINATION — scoping the question, finding and comparing
     * qualified counsel per jurisdiction, assembling the factual record counsel
     * needs, and project-managing to a delivered opinion. The opinion itself is
     * issued by counsel to the client, under counsel's own engagement letter and
     * counsel's own liability. We are never in the advice chain.
     *
     * Hence its exclusion list REPLACES the universal "no legal advice" line
     * with a sharper one: a blanket "no legal advice" would be confusing on an
     * offer whose entire deliverable is a legal opinion arriving. Saying instead
     * "the opinion is counsel's, our work is coordination, and we do not review
     * or endorse its conclusions" is both true and more protective. See
     * `withUniversalExclusions` for how that substitution is made explicit.
     */
    name: 'Legal Opinion Coordination',
    outcome:
      'A legal opinion in your hands, issued to you by qualified counsel in the jurisdictions you need, on a question scoped tightly enough to be answerable — with the factual record assembled and the process managed so it does not stall for three months.',
    inclusions: [
      'Question scoping workshop: turning "is our token legal?" into the specific, answerable questions counsel can actually opine on, and identifying which ones you do not need answered.',
      'Counsel search and comparison: at least two qualified candidates per required jurisdiction, with credentials, relevant precedent, indicative fee, indicative timeline and conflict position presented side by side.',
      'Fee and scope negotiation support with counsel on your behalf, up to the point of your signature.',
      'Factual record pack assembled to counsel\'s specification: token structure, distribution history, marketing and public claims, governance, treasury, technical architecture, and the representations counsel will rely on.',
      'Consistency check of the factual record against your public material before it reaches counsel — an opinion built on facts your website contradicts is worse than no opinion.',
      'Process management: kick-off, question list tracking, chasing, and a written status each week until the opinion is issued.',
      'Multi-jurisdiction coordination where more than one opinion is needed, including keeping the factual record identical across counsel so the opinions do not rest on different facts.',
      'Handover pack: the issued opinion(s), the factual record as relied upon, and a register of the reliance limitations counsel stated.',
    ],
    exclusions: [
      'THE OPINION IS COUNSEL\'S, NOT OURS. Counsel is engaged by you, directly, under counsel\'s own engagement letter, and the opinion is addressed to you. We are not a party to it.',
      'We do not give legal advice, do not review the opinion\'s legal conclusions, do not second-guess counsel, and do not endorse, guarantee or interpret what the opinion says.',
      'No specific conclusion is promised. Counsel may conclude against your commercial preference, may qualify heavily, or may decline to opine at all — the fee covers coordination in every one of those outcomes.',
      'Counsel\'s own fees, disbursements and taxes are billed by counsel to you directly and are not included in this price.',
      'No indemnity, no assumption of counsel\'s liability, and no ability to extend counsel\'s reliance to a third party — that is counsel\'s decision alone.',
      'No engagement of counsel in your name and no instruction of counsel without your written approval.',
      'No jurisdiction outside the list agreed at kick-off.',
      'No filing, registration, notification or representation before any authority or court.',
      'No regulatory approval or supervisory outcome, and no listing outcome, follows from an opinion existing.',
    ],
    requiredClientInputs: [
      'The commercial decision the opinion has to support — without it the question cannot be scoped and the fee will be wasted.',
      'Target jurisdictions, in priority order.',
      'Authorised signatory able to sign counsel\'s engagement letter and pay counsel directly.',
      'Complete and accurate factual record inputs: distribution history, allocations, marketing claims, governance documents, entity structure.',
      'Disclosure of any prior opinion, regulator contact, enforcement action or dispute — counsel will ask, and a late disclosure restarts the clock.',
    ],
    partnerOwner: null,
    expectedVendorCostCents: TODO_VENDOR_COSTS.legal_opinion_coordination,
    acceptanceCriteria: [
      'Scoped question list agreed in writing with you before any counsel is approached.',
      'At least two comparable counsel candidates presented per agreed jurisdiction, with fee and timeline.',
      'Counsel engaged by you within 15 business days of the comparison, subject to your decision.',
      'Factual record accepted by counsel as sufficient to proceed, with no outstanding information request older than 5 business days that is ours to close.',
      'Weekly written status issued without a gap until the opinion is issued or you stop the process.',
      'Handover pack delivered within 5 business days of the opinion being issued.',
    ],
    priceBandCents: TODO_PRICE_BANDS.legal_opinion_coordination,
    renewalPath:
      'Additional jurisdictions, opinion refreshes after a structural change, and the white paper package that usually depends on the classification the opinion settles.',
    isDiagnostic: false,
    creditableAgainstEngagement: false,
  },
  {
    key: 'gtm_sprint',
    name: 'GTM / TGE Strategy Sprint',
    outcome:
      'A decided, sequenced go-to-market and token-generation-event plan: who the token is for, what is said to them, in what order, on what date, with what budget, and who owns each line — plus the things you have decided NOT to do, written down.',
    inclusions: [
      'Four-week structured sprint with a fixed agenda and a fixed end date — not a retainer.',
      'Positioning and narrative: the single claim the project makes, tested against what your competitors already claim and what your own material currently says.',
      'Audience and segment definition: the specific holder, user, partner and developer segments worth pursuing, and the ones to explicitly ignore.',
      'TGE sequencing plan: pre-launch, launch and post-launch phases with dependencies, owners and dates on one page.',
      'Distribution channel plan: which channels, in what order, with expected reach and the cost of each — including the channels you are currently over-investing in.',
      'Community and holder growth plan with target-setting grounded in your current numbers rather than in a comparable project\'s.',
      'Exchange and venue readiness checklist: what a listing committee at any venue typically asks for, so the answer exists before the conversation — presented as preparation, never as access.',
      'Liquidity and market-structure considerations documented as questions for you and your advisers, with the decisions you must make named.',
      'Messaging kit: core narrative, three proof points, objection responses, and a claims list marked for which statements need substantiation before use.',
      'Budget allocation model across channels and phases, with the assumptions visible and editable.',
      'Metrics and review cadence: the five numbers to watch weekly, and the decision each one triggers.',
      'Final read-out to your team, plus a 30-day written check-in after the sprint ends.',
    ],
    exclusions: [
      'Strategy and plan only — no execution. Nothing in the plan is run, posted, bought, negotiated or managed as part of this engagement.',
      'No paid media buying, no agency management, no influencer or KOL procurement, and no ad spend (media budget is yours and is not included in the price).',
      'No content production: no articles, videos, creative assets, or designed collateral beyond the plan documents themselves.',
      'No exchange, venue, market-maker or investor introductions, advocacy or applications. The readiness checklist prepares you; it does not open a door.',
      'No token price, market capitalisation, volume, holder count, follower growth or fundraising outcome is promised, projected as a commitment, or guaranteed. Targets in the plan are targets, not forecasts.',
      'No investment advice, no fundraising or placement activity, and no introduction to investors.',
      'No legal or regulatory review of the marketing claims produced — the claims list marks what needs review; your counsel does the reviewing.',
      'No smart-contract, tokenomics-simulation or economic-audit work.',
    ],
    requiredClientInputs: [
      'Founder or CEO available for the kick-off and the read-out, and a named day-to-day counterpart for the four weeks.',
      'Current metrics: holder count and concentration, community sizes and engagement, web traffic, existing venue presence.',
      'Actual available budget, and the internal or agency resources you can staff execution with.',
      'Tokenomics and any fixed dates already committed publicly.',
      'Prior GTM material, campaign results and what you believe did and did not work.',
    ],
    partnerOwner: null,
    expectedVendorCostCents: TODO_VENDOR_COSTS.gtm_sprint,
    acceptanceCriteria: [
      'Kick-off held within 5 business days of deposit and receipt of required inputs.',
      'All four weekly sessions held, each with written output circulated within 2 business days.',
      'Final plan delivered on the agreed end date, containing: positioning, segments, a dated sequencing plan with named owners, a channel plan with costs, a budget allocation, and an explicit not-doing list.',
      'Every target in the plan carries its assumption and its source; no unsourced number.',
      '30-day written check-in delivered.',
    ],
    priceBandCents: TODO_PRICE_BANDS.gtm_sprint,
    renewalPath:
      'The plan\'s execution phase is the marketing activation offer; the readiness checklist frequently surfaces documentation work (white paper, classification) that becomes its own engagement.',
    isDiagnostic: false,
    creditableAgainstEngagement: false,
  },
  {
    key: 'marketing_activation',
    name: 'Marketing & Community Activation',
    outcome:
      'A launch or campaign actually executed over a defined window: content shipped on a calendar, community programmes running with moderation in place, and a weekly report that says what worked and what to stop.',
    inclusions: [
      'Defined activation window (typically 8–12 weeks) with a fixed scope, agreed at kick-off, and a stated content volume per channel.',
      'Editorial calendar built and maintained, with every item dated, owned and approved before it ships.',
      'Content production to the agreed volume: launch and milestone announcements, explainer threads, long-form posts, and community updates written in your voice.',
      'Community programme design and operation: onboarding flow for new members, contributor or ambassador structure with defined tasks and rewards, and an escalation path for FUD and scam impersonation.',
      'Moderation playbook and rules of engagement, including the standing responses your team may use without escalation and the ones that must be escalated.',
      'AMA and event support: format, question curation, run-of-show, moderator brief, and post-event recap content.',
      'KOL and partner outreach coordination — briefing, scheduling and content review. Fees to any third party are yours and paid directly by you.',
      'Claims control: every public statement checked against your approved claims list before publication, with anything unsubstantiated pulled rather than softened.',
      'Weekly performance report on a fixed set of metrics agreed at kick-off, each with the decision it triggers.',
      'End-of-window retrospective: what to keep, what to stop, and a costed recommendation for what comes next.',
    ],
    exclusions: [
      'No paid media budget, ad spend, KOL fees, sponsorship, listing fees or third-party platform costs are included — these are yours, paid by you directly, and quoted separately if we are asked to manage them.',
      'No follower, holder, engagement, community-size, sentiment, price, volume or fundraising outcome is promised or guaranteed. Targets are targets; performance is reported honestly, including when it is bad.',
      'No purchase of followers, engagement, bots, coordinated posting, undisclosed paid promotion, or any other artificial-metric activity — this is refused, not merely excluded, and it is grounds for us to stop the engagement.',
      'No trading, price-support, volume, market-making or liquidity activity of any kind, and no content that could be read as trading advice or a price prediction.',
      'No publication of any claim your counsel has not cleared where clearance is required, and no representation about listings, approvals, partnerships or audits that you cannot substantiate on request.',
      'No access to or posting from any account we do not have written authorisation for, and no credential is stored by us beyond the engagement.',
      'No design system, brand identity, website build or video production beyond the agreed content formats.',
      'No customer support, no wallet or transaction assistance, and no handling of user funds or personal data beyond what a public channel exposes.',
      'No activity outside the agreed window; extending it is new scope with a new price.',
    ],
    requiredClientInputs: [
      'Approved claims list and a named person on your side able to approve content within 2 business days — approval latency is the single largest cause of a missed calendar.',
      'Channel access or a defined publishing hand-off, on the basis you choose (we can draft-and-hand-over rather than post).',
      'Brand assets, tone guidance and any prior content that performed.',
      'Confirmed dates for anything already committed publicly.',
      'Your own budget for third-party costs (media, KOLs, events), held and paid by you.',
      'A named moderator or community lead on your team for continuity after the window ends.',
    ],
    partnerOwner: null,
    expectedVendorCostCents: TODO_VENDOR_COSTS.marketing_activation,
    acceptanceCriteria: [
      'Calendar published and agreed before week 1 ships.',
      'Agreed content volume delivered per channel per week, or the shortfall reported the same week with its cause named.',
      'Every published item traceable to an approval by your named approver.',
      'Moderation playbook in your hands by end of week 2, and a named client-side owner trained on it before the window ends.',
      'Weekly report issued every week without a gap, including weeks where performance declined.',
      'Retrospective delivered within 5 business days of the window closing.',
    ],
    priceBandCents: TODO_PRICE_BANDS.marketing_activation,
    renewalPath:
      'A second activation window, or a lighter ongoing community-operations arrangement quoted after the retrospective — never auto-renewed, because a renewal nobody re-decided is how a services business accumulates unprofitable work.',
    isDiagnostic: false,
    creditableAgainstEngagement: false,
  },
];

/**
 * Appends the four perimeter exclusions to each offer's own, so no offer can
 * ship without them by omission. Composition rather than copy-paste: the
 * listing/approval/advice/market lines are the ones that must NEVER be quietly
 * dropped, and a reviewer editing one offer's list cannot delete them.
 */
function withUniversalExclusions(offer: ServiceOffer): ServiceOffer {
  const universal = SUBSTITUTES_LEGAL_ADVICE_LINE.includes(offer.key)
    ? UNIVERSAL_EXCLUSIONS.filter((e) => e !== NO_LEGAL_ADVICE_EXCLUSION)
    : UNIVERSAL_EXCLUSIONS;
  return { ...offer, exclusions: [...offer.exclusions, ...universal] };
}

/** The catalogue. Offer-specific exclusions first, perimeter exclusions last. */
export const OFFERS: readonly ServiceOffer[] = OFFERS_INTERNAL.map(withUniversalExclusions);

export function getOffer(key: OfferKey): ServiceOffer {
  const offer = OFFERS.find((o) => o.key === key);
  // Throw rather than return undefined: an unknown offer key on a quote path
  // must fail loudly, not silently price at zero.
  if (!offer) throw new Error(`unknown GPS offer: ${key}`);
  return offer;
}

/** The paid front door. Derived, so it cannot disagree with the catalogue. */
export const DIAGNOSTIC_OFFER: ServiceOffer =
  OFFERS.find((o) => o.isDiagnostic) ?? getOffer('diagnostic');

/**
 * Midpoint of the band, integer cents — the sensible default a quote opens at.
 * Rounded to whole dollars because a proposal quoting $17,499.50 reads as
 * generated rather than decided.
 */
export function bandMidpointCents(offer: ServiceOffer): number {
  const mid = (offer.priceBandCents.min + offer.priceBandCents.max) / 2;
  return Math.round(mid / 100) * 100;
}

/**
 * WHAT THE CATALOGUE IS STILL MISSING, as data rather than as a comment nobody
 * reads.
 *
 * Exported so the UI can SHOW the gaps instead of rendering a finished-looking
 * catalogue. A placeholder price presented as a real one is the precise failure
 * this programme is meant to avoid — the founder sold ~$250k by hand, and a
 * system that quietly invents his prices is worse than the Google Doc it
 * replaces.
 */
export interface CatalogueTodo {
  /** The blocking decision from GPS_IMPLEMENTATION_PLAN.md §3, where there is one. */
  decision: 'D1' | 'D4' | 'D5' | 'D6' | null;
  /** Who alone can supply it. Every item here is founder-or-partner, never ours. */
  owner: 'founder' | 'founder+counsel' | 'partner';
  what: string;
  /** What is affected until it is supplied. */
  consequence: string;
  blocksQuoting: boolean;
}

export const CATALOGUE_TODOS: readonly CatalogueTodo[] = [
  {
    decision: 'D4',
    owner: 'founder',
    what: 'Real price bands for all five offers.',
    consequence:
      'Every band in TODO_PRICE_BANDS is a placeholder derived only from the stated $10–25k engagement range. Nothing here may be sent to a client as a price.',
    blocksQuoting: true,
  },
  {
    decision: 'D4',
    owner: 'founder',
    what: 'Confirm the diagnostic fee and its credit window (placeholder: $1.5–3k, credited in full within 90 days).',
    consequence:
      'The diagnostic is the front door; if it is priced as a fifth of the engagement it will not sell, and if the credit is not honoured in writing it is not creditable.',
    blocksQuoting: true,
  },
  {
    decision: 'D5',
    owner: 'partner',
    what: 'Named partner or specialist per offer, with a rate card.',
    consequence:
      'partnerOwner is null on all five offers and vendor costs are placeholders, so margin arithmetic is correct but UNCALIBRATED, and no engagement can honestly be staffed.',
    blocksQuoting: false,
  },
  {
    decision: 'D5',
    owner: 'partner',
    what: 'Concurrency cap per offer — how many of each a partner can run at once.',
    consequence:
      'Partners deliver, so bench depth is the capacity limit. Without it the system will happily sell more than can be delivered.',
    blocksQuoting: false,
  },
  {
    decision: 'D1',
    owner: 'founder',
    what: 'Contracting entity decision (lcx | external), or confirmation that both stay live.',
    consequence:
      'Defaults to \'lcx\'. Disclosure text, invoice header and (at Phase 3) artifact storage target all derive from it.',
    blocksQuoting: false,
  },
  {
    decision: null,
    owner: 'founder+counsel',
    what: 'Standard disclosure text for the conflict check, per contracting entity.',
    consequence:
      'gps_conflict_check stores the text actually used; until a standard exists each check is drafted from scratch, which is how inconsistent disclosures happen.',
    blocksQuoting: false,
  },
  {
    decision: null,
    owner: 'founder+counsel',
    what: 'Counsel review of these exclusion lists, especially the four perimeter lines.',
    consequence:
      'They were written to be protective and are not legally reviewed. They are the sentences that limit exposure if an engagement goes wrong.',
    blocksQuoting: false,
  },
  {
    decision: 'D6',
    owner: 'founder',
    what: 'Read the executed BitStreet agreement before any market-making representation.',
    consequence:
      'The MM lane is deliberately not built (plan §8) and every offer explicitly disclaims market outcomes. Nothing about MM performance may be represented until the signed agreement is read.',
    blocksQuoting: false,
  },
];
