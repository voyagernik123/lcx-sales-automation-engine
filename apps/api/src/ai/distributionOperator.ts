import { llm } from './llm.js';
import { DISTRIBUTION_DEEP_SEED } from '../seed/distribution/data.js';

/**
 * The DISTRIBUTION AI operator (LCX ONE Phase 7) — mirrors the COMMAND program
 * operator. Every function grounds in the compiled distribution ontology,
 * cites [[source-id]]s against the 38-source registry, and has a deterministic
 * fallback (usedLlm:false) so it works at $0 with no key. The AI drafts and
 * answers; it NEVER files — every write still flows through the governed
 * registry with a human in the loop.
 */

const SRC_CITE_RE = /\[\[([a-z0-9_]+)\]\]/gi;
type Source = { id: string; label: string; url: string | null };

/** Source-tagged facts the model reasons over (the rails, surfaces, gaps). */
function renderFacts(): { facts: string; sources: Source[] } {
  const D = DISTRIBUTION_DEEP_SEED;
  const lines: string[] = [];
  lines.push(`PRODUCT: ${D.payAgent.tagline} Reward loop: ${D.payAgent.rewardLoop} [[s_payagent]]`);
  lines.push('RAILS (fit-for-LCX 0-5):');
  for (const r of D.rails) lines.push(`  - ${r.name} (fit ${r.fitForLcx}): ${r.model}. ${r.traction}. LCX: ${r.lcxNote} [[${r.srcRefs[0]}]]`);
  lines.push('SURFACES (where agents discover):');
  for (const s of D.surfaces) lines.push(`  - ${s.name} [${s.category}]: ${s.submit}${s.constraint ? ` (⚠ ${s.constraint})` : ''} [[${s.srcRefs[0]}]]`);
  lines.push('COMPETITORS:');
  for (const c of D.competitors) lines.push(`  - ${c.name} (threat ${c.threat}): ${c.focus} — ${c.playbook} [[${c.srcRefs[0]}]]`);
  lines.push('GAPS (openings):');
  for (const g of D.gaps) lines.push(`  - ${g.id} ${g.title}: ${g.gap} → LCX: ${g.lcxAngle}`);
  lines.push(`GROWTH CONTEXT: ${D.growthContext.map((g) => g.headline).join(' | ')}`);
  return { facts: lines.join('\n'), sources: D.sources as unknown as Source[] };
}

function resolveCitations(text: string, sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const m of text.matchAll(SRC_CITE_RE)) {
    const id = m[1]!.toLowerCase();
    if (seen.has(id)) continue;
    const s = sources.find((x) => x.id === id);
    if (s) { seen.add(id); out.push(s); }
  }
  return out;
}

export interface DistAnswer {
  answer: string;
  usedLlm: boolean;
  citations?: Source[];
}

/** Ask-the-distribution: cited Q&A over the ontology. */
export async function askDistribution(question: string): Promise<DistAnswer> {
  const { facts, sources } = renderFacts();
  const deterministic =
    'Distribution grounds in the compiled ontology (rails, surfaces, competitors, gaps). ' +
    'x402 is the highest-fit rail for PayAgent (a facilitator LCX could run); the surfaces are the discovery front doors; the G1–G8 gaps are where LCX has an unfair angle. Ask with an AI key set for a synthesized, cited answer.';
  if (!llm.available) return { answer: deterministic, usedLlm: false };
  const system =
    'You are the LCX distribution strategist for PayAgent. Answer ONLY from the FACTS below. ' +
    'Cite the [[source-id]] tokens inline exactly as they appear next to the facts you use. ' +
    'Be concrete and concise (≤180 words). If the facts do not cover it, say so.';
  const { text, usedLlm } = await llm.complete(
    `FACTS:\n${facts}\n\nQUESTION: ${question}`,
    { feature: 'dist-ask', system, maxTokens: 600, temperature: 0.2 },
  );
  if (!usedLlm || !text) return { answer: deterministic, usedLlm: false };
  return { answer: text, usedLlm: true, citations: resolveCitations(text, sources) };
}

/** GEO content drafter — an answer-engine-optimized FAQ answer from the facts. */
export async function draftGeoContent(query: string): Promise<{ draft: string; usedLlm: boolean; citations?: Source[] }> {
  const { facts, sources } = renderFacts();
  const det = `Draft (deterministic): PayAgent is crypto payment infrastructure for AI agents — non-custodial links, agent wallets, an MCP server, and flat LCX fees that reward the creator on every paid link. For "${query}", the short answer is that an agent needs a payable identity + a rail; PayAgent provides both, natively on x402 and every major L2. (Set an AI key for a citable, GEO-optimized draft.)`;
  if (!llm.available) return { draft: det, usedLlm: false };
  const system =
    'You write GEO/AEO content for PayAgent — the answer an AI engine (ChatGPT/Claude/Perplexity) should surface for the query. ' +
    'Ground ONLY in the FACTS. Lead with the direct answer, then 2-3 crisp supporting sentences. Cite [[source-id]]s. ≤160 words.';
  const { text, usedLlm } = await llm.complete(
    `FACTS:\n${facts}\n\nQUERY TO WIN: ${query}`,
    { feature: 'dist-geo-draft', system, maxTokens: 500, temperature: 0.3 },
  );
  if (!usedLlm || !text) return { draft: det, usedLlm: false };
  return { draft: text, usedLlm: true, citations: resolveCitations(text, sources) };
}

/** Listing submission packet drafter — the copy to submit PayAgent to a surface. */
export async function draftListingPacket(surfaceId: string): Promise<{ packet: string; usedLlm: boolean }> {
  const s = DISTRIBUTION_DEEP_SEED.surfaces.find((x) => x.id === surfaceId);
  if (!s) return { packet: '', usedLlm: false };
  const P = DISTRIBUTION_DEEP_SEED.payAgent;
  const det = `Submission packet for ${s.name} (deterministic):\n• Name: PayAgent by LCX AI Labs\n• One-liner: ${P.tagline}\n• Mechanic: ${s.submit}\n• Chains: ${P.chains.join(', ')}\n• Surfaces: ${P.surfaces.slice(0, 5).join(', ')}\n(Set an AI key for a tailored packet.)`;
  if (!llm.available) return { packet: det, usedLlm: false };
  const system =
    `You draft a submission packet to list PayAgent on "${s.name}". Use the product facts. ` +
    'Output the fields that surface expects (name, description, category, integration snippet if relevant). Concise, ready to paste. ≤200 words.';
  const facts = `PRODUCT: ${P.tagline}\nSURFACES: ${P.surfaces.join(', ')}\nCHAINS: ${P.chains.join(', ')}\nFEES: ${P.fees.map((f) => `${f.mode} ${f.fee}`).join(', ')}\nSUBMIT MECHANIC: ${s.submit}\nAUDIENCE: ${s.audience}`;
  const { text, usedLlm } = await llm.complete(facts, { feature: 'dist-listing-packet', system, maxTokens: 600, temperature: 0.3 });
  return usedLlm && text ? { packet: text, usedLlm: true } : { packet: det, usedLlm: false };
}

/** Campaign-designer copilot — proposes a campaign spec grounded in a surface + the gaps. */
export async function suggestCampaign(surfaceId: string): Promise<{ suggestion: string; usedLlm: boolean }> {
  const s = DISTRIBUTION_DEEP_SEED.surfaces.find((x) => x.id === surfaceId);
  const det = `Campaign idea (deterministic): a quest on ${s?.name ?? 'a quest surface'} — "create a PayAgent link + get one paid (verifiable on-chain)" — rewarding creators in LCX. Compliance: token-incentivized, so it needs a premortem + legal check before launch. Price it in Campaign Ops. (Set an AI key for a fuller proposal.)`;
  if (!llm.available) return { suggestion: det, usedLlm: false };
  const gaps = DISTRIBUTION_DEEP_SEED.gaps.map((g) => `${g.id}: ${g.title}`).join('; ');
  const system =
    'You are a growth strategist proposing ONE concrete PayAgent distribution campaign for the given surface. ' +
    'Tie it to a gap (G1–G8). State: name, target surface, mechanic, why it works, and the compliance flag (token-incentivized?). ≤150 words. The human prices + files it — you only propose.';
  const { text, usedLlm } = await llm.complete(
    `SURFACE: ${s?.name ?? surfaceId} — ${s?.submit ?? ''}\nGAPS: ${gaps}`,
    { feature: 'dist-campaign-suggest', system, maxTokens: 500, temperature: 0.4 },
  );
  return usedLlm && text ? { suggestion: text, usedLlm: true } : { suggestion: det, usedLlm: false };
}
