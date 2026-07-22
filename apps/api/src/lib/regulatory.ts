/**
 * Regulatory posture (Palantir-grade Phase 1.5) — LCX's moat, made a first-class
 * facet of every project object instead of scattered flags. Pure derivation from
 * the fields the project row already carries (jurisdiction, region, ESMA registry
 * id, DTI, source), so it's deterministic and cheap. Surfaced on every dossier.
 */

export type PostureTone = 'strong' | 'neutral' | 'watch';

export interface PostureFacet {
  label: string;
  value: string;
  /** Optional emphasis for the moat facets (ESMA/MiCA). */
  tone?: PostureTone;
}

export interface RegulatoryPosture {
  /** Headline classification. */
  label: string;
  tone: PostureTone;
  /** True when the token sits on the ESMA register / is MiCA-relevant — the edge. */
  isMicaRegistry: boolean;
  facets: PostureFacet[];
}

export interface PostureInput {
  jurisdiction?: string | null;
  region?: string | null; // eu | us | other
  esmaTokenId?: string | null;
  dti?: string | null;
  source?: string | null;
}

const ESMA_KIND: Record<string, string> = {
  esma_main: 'ESMA register (MiCA)',
  esma_casp: 'ESMA register (CASP)',
  esma_emt: 'ESMA register (EMT/ART)',
  esma_registry: 'ESMA register',
};

export function deriveRegulatoryPosture(p: PostureInput): RegulatoryPosture {
  const source = (p.source ?? '').toLowerCase();
  const region = (p.region ?? '').toLowerCase();
  const onEsmaRegister = p.esmaTokenId != null && p.esmaTokenId !== '';
  const esmaSourced = source.startsWith('esma');
  const isMicaRegistry = onEsmaRegister || esmaSourced;

  const facets: PostureFacet[] = [];

  if (isMicaRegistry) {
    facets.push({ label: 'ESMA / MiCA', value: ESMA_KIND[source] ?? 'On ESMA register', tone: 'strong' });
  }
  if (p.esmaTokenId) facets.push({ label: 'ESMA token id', value: p.esmaTokenId, tone: 'strong' });
  if (p.dti) facets.push({ label: 'DTI', value: p.dti });
  if (p.jurisdiction) facets.push({ label: 'Jurisdiction', value: p.jurisdiction });
  if (region) facets.push({ label: 'Region', value: region.toUpperCase() });

  let label: string;
  let tone: PostureTone;
  if (isMicaRegistry) {
    label = 'MiCA / ESMA-registered';
    tone = 'strong'; // the LCX edge
  } else if (region === 'eu') {
    label = 'EU jurisdiction';
    tone = 'neutral';
  } else if (region === 'us') {
    label = 'US-focused — Howey exposure';
    tone = 'watch';
  } else {
    label = 'Unclassified';
    tone = 'neutral';
  }

  return { label, tone, isMicaRegistry, facets };
}
