import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACKET_KINDS,
  PROVENANCE_GRADE,
  buildFounderPackets,
  packetProposalDefects,
  type FounderPacket,
  type PerimeterSeedRow,
} from './packets.js';
import { OFFER_KEYS } from './types.js';

/**
 * THE FOUNDER PACKETS — five proposals whose whole worth is their honesty.
 *
 * These tests do not check that the proposed prices are RIGHT — nothing can, that is why the
 * owner approves them. What they check is the machinery that keeps a proposal from quietly
 * becoming a finding: the builder passes its own validator (the same one the API runs on the
 * owner's edits), nothing grades above B2, every unverified claim admits it, the perimeter
 * seed's prohibitions are exactly the two that were argued, and the validator actually
 * DISCRIMINATES — each guard is shown catching the defect it exists for, because a validator
 * nobody has seen refuse is a comment with a function signature.
 */

const ASOF = '2026-08-21T12:00:00.000Z';
const packets = buildFounderPackets(ASOF);
const byKind = (k: FounderPacket['kind']) => packets.find((p) => p.kind === k)!;

describe('the set — five packets, deterministic, self-validating', () => {
  it('covers every kind exactly once, ids stable', () => {
    expect(packets.map((p) => p.kind).sort()).toEqual([...PACKET_KINDS].sort());
    for (const p of packets) expect(p.id).toBe(`packet:${p.kind}`);
  });

  it('is deterministic: same instant in, deep-equal packets out', () => {
    // The API rebuilds packets per request; a nondeterministic builder would show the owner
    // a different proposal than the one his approval recorded.
    expect(buildFounderPackets(ASOF)).toEqual(packets);
  });

  it('every SHIPPED proposal passes the validator the owner’s edits will face', () => {
    for (const p of packets) {
      expect(packetProposalDefects(p.proposal), p.kind).toEqual([]);
    }
  });

  it('every packet states its consequence, and the two deferred ones name their dependency', () => {
    for (const p of packets) expect(p.consequence.trim().length, p.kind).toBeGreaterThan(40);
    expect(byKind('rate_cards').remainingDependency).toMatch(/name real partners/i);
    expect(byKind('perimeter_seed').remainingDependency).toMatch(/review/i);
  });
});

describe('the grades are honest, structurally', () => {
  it('nothing grades above B2, and every grade matches its provenance', () => {
    for (const p of packets) {
      expect(p.evidence.length, `${p.kind} ships without evidence`).toBeGreaterThan(0);
      for (const e of p.evidence) {
        expect(e.grade, `${p.kind}: "${e.claim}"`).toBe(PROVENANCE_GRADE[e.provenance]);
        expect(['B2', 'C3', 'N/A']).toContain(e.grade);
      }
    }
  });

  it('every assistant-knowledge claim carries a verification caveat', () => {
    // The one rule that keeps a C3 from being read as an A1 by a tired reader at 1am.
    for (const p of packets) {
      for (const e of p.evidence) {
        if (e.provenance === 'assistant_knowledge_unverified') {
          expect(e.caveat, `${p.kind}: "${e.claim}" has no caveat`).toBeTruthy();
          // "Verify before relying", "an estimate about a process that has not run", or an
          // explicit not-legal-advice disclaimer — each is a real admission of the limit.
          expect(`${e.caveat}`, `${p.kind}: "${e.claim}"`).toMatch(/verif|estimate|not run|not legal advice/i);
        }
      }
    }
  });

  it('every repo_measurement names a file or a mechanism, not a vibe', () => {
    for (const p of packets) {
      for (const e of p.evidence) {
        if (e.provenance === 'repo_measurement') {
          expect(e.basis, `${p.kind}: "${e.claim}"`).toMatch(/\.ts|\.md|connection target|measured/i);
        }
      }
    }
  });
});

describe('price bands and effort triples — complete, ordered, decomposed', () => {
  it('bands cover all five offers and ascend', () => {
    const rows = byKind('price_bands').proposal;
    if (rows.kind !== 'price_bands') throw new Error('wrong kind');
    expect(rows.rows.map((r) => r.offerKey).sort()).toEqual([...OFFER_KEYS].sort());
    for (const r of rows.rows) {
      expect(r.lowCents).toBeLessThanOrEqual(r.midCents);
      expect(r.midCents).toBeLessThanOrEqual(r.highCents);
      expect(Number.isInteger(r.lowCents) && r.lowCents > 0).toBe(true);
    }
  });

  it('the coordination band’s rationale states that counsel fees are OUTSIDE it', () => {
    // The one sentence that keeps this offer from losing money invisibly. If somebody edits
    // the rationale away, the number loses the meaning that made it defensible.
    const rows = byKind('price_bands').proposal;
    if (rows.kind !== 'price_bands') throw new Error('wrong kind');
    const coord = rows.rows.find((r) => r.offerKey === 'legal_opinion_coordination')!;
    expect(coord.rationale).toMatch(/pass.?through|pass through/i);
  });

  it('triples ascend and each waterfall decomposition IS the likely case', () => {
    const t = byKind('effort_triples').proposal;
    if (t.kind !== 'effort_triples') throw new Error('wrong kind');
    expect(t.rows.map((r) => r.offerKey).sort()).toEqual([...OFFER_KEYS].sort());
    for (const r of t.rows) {
      expect(r.optimisticDays).toBeLessThanOrEqual(r.likelyDays);
      expect(r.likelyDays).toBeLessThanOrEqual(r.pessimisticDays);
      const sum = r.waterfall.aiDraftDays + r.waterfall.internalQaDays + r.waterfall.partnerDays;
      expect(Math.abs(sum - r.likelyDays), r.offerKey).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('the perimeter seed — thirty proposals that never dress up as findings', () => {
  const seed = byKind('perimeter_seed').proposal;
  const rows: readonly PerimeterSeedRow[] = seed.kind === 'perimeter_seed' ? seed.rows : [];

  it('is exactly 6 jurisdictions × 5 offers, no pair twice', () => {
    expect(rows.length).toBe(30);
    const pairs = new Set(rows.map((r) => `${r.jurisdiction}|${r.offerKey}`));
    expect(pairs.size).toBe(30);
    expect(new Set(rows.map((r) => r.jurisdiction)).size).toBe(6);
  });

  it('the prohibitions are EXACTLY the two that were argued — UK and US marketing activation', () => {
    /*
     * A prohibition enforces the moment it lands (perimeterDisposition blocks `prohibited`
     * even unreviewed), so an extra prohibited row in this seed would start refusing real
     * quotes on the owner's approval with nobody having argued for it. The set is pinned
     * closed in both directions.
     */
    const prohibited = rows.filter((r) => r.serviceClass === 'prohibited')
      .map((r) => `${r.jurisdiction}:${r.offerKey}`).sort();
    expect(prohibited).toEqual([
      'United Kingdom:marketing_activation',
      'United States:marketing_activation',
    ]);
  });

  it('every source admits it is unverified, in the row itself', () => {
    // The rows outlive this file. A future reader sees the ROW, not the packet around it.
    for (const r of rows) {
      expect(r.source, `${r.jurisdiction}/${r.offerKey}`).toMatch(/UNVERIFIED/);
      expect(r.source).toMatch(/verify with qualified counsel/i);
    }
  });

  it('both prohibition notes name the lawful re-entry path, not just the wall', () => {
    // A prohibition with no stated alternative teaches the desk to route around the
    // perimeter instead of through it. Each note names the different engagement that IS
    // possible and the class to re-enter it under.
    for (const r of rows.filter((x) => x.serviceClass === 'prohibited')) {
      expect(r.note, `${r.jurisdiction}`).toMatch(/re-enter/i);
      expect(r.note).toMatch(/counsel_required/);
    }
  });

  it('expiry is a horizon, never a date — the builder cannot pre-expire an approval', () => {
    for (const r of rows) {
      expect(r.reviewMonthsAhead).toBe(6);
      expect(r.sourceUrl).toBeNull();
    }
    // And nothing in the whole module bakes a concrete review date or reads a clock.
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, 'packets.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now|new Date\(\)/);
  });
});

describe('the DPO memo — a decision with named consequences, not a nudge', () => {
  it('offers three real options and recommends one of them', () => {
    const m = byKind('dpo_memo').proposal;
    if (m.kind !== 'dpo_memo') throw new Error('wrong kind');
    expect(m.memo.options.map((o) => o.id).sort()).toEqual([
      'adopt_processor_dpa', 'controller_only_no_uploads', 'refuse_uploads_indefinitely',
    ].sort());
    expect(m.memo.options.map((o) => o.id)).toContain(m.memo.recommendedOptionId);
    for (const o of m.memo.options) expect(o.consequence.length).toBeGreaterThan(60);
  });

  it('the memo says it is not legal advice, and grounds residence in a measurement', () => {
    const m = byKind('dpo_memo').proposal;
    if (m.kind !== 'dpo_memo') throw new Error('wrong kind');
    expect(m.memo.memoMarkdown).toMatch(/eu-central-1/);
    const p = byKind('dpo_memo');
    expect(p.evidence.some((e) => /not legal advice/i.test(`${e.caveat}`))).toBe(true);
  });
});

describe('the validator discriminates — each guard shown refusing what it exists for', () => {
  const bands = () => {
    const p = byKind('price_bands').proposal;
    if (p.kind !== 'price_bands') throw new Error('wrong kind');
    return p.rows.map((r) => ({ ...r }));
  };

  it('catches a descending band, a fractional cent, a wrong currency, a missing offer', () => {
    const r1 = bands(); r1[0] = { ...r1[0], lowCents: r1[0].highCents + 1 };
    expect(packetProposalDefects({ kind: 'price_bands', rows: r1 }).join(' ')).toMatch(/ascend/);
    const r2 = bands(); r2[0] = { ...r2[0], midCents: r2[0].midCents + 0.5 };
    expect(packetProposalDefects({ kind: 'price_bands', rows: r2 }).join(' ')).toMatch(/integer cents/);
    const r3 = bands(); (r3[0] as { currency: string }).currency = 'EUR';
    expect(packetProposalDefects({ kind: 'price_bands', rows: r3 }).join(' ')).toMatch(/USD/);
    expect(packetProposalDefects({ kind: 'price_bands', rows: bands().slice(1) }).join(' ')).toMatch(/every offer/);
  });

  it('catches a transposed triple and a decorative waterfall', () => {
    const p = byKind('effort_triples').proposal;
    if (p.kind !== 'effort_triples') throw new Error('wrong kind');
    const t1 = p.rows.map((r) => ({ ...r, waterfall: { ...r.waterfall } }));
    t1[0] = { ...t1[0], optimisticDays: t1[0].pessimisticDays + 1 };
    expect(packetProposalDefects({ kind: 'effort_triples', rows: t1 }).join(' ')).toMatch(/ascend/);
    const t2 = p.rows.map((r) => ({ ...r, waterfall: { ...r.waterfall } }));
    t2[0] = { ...t2[0], waterfall: { ...t2[0].waterfall, aiDraftDays: t2[0].waterfall.aiDraftDays + 2 } };
    expect(packetProposalDefects({ kind: 'effort_triples', rows: t2 }).join(' ')).toMatch(/decoration/);
  });

  it('refuses a rate-card class that reads like a company name — names are the owner’s (D5)', () => {
    const p = byKind('rate_cards').proposal;
    if (p.kind !== 'rate_cards') throw new Error('wrong kind');
    const rows = p.rows.map((r) => ({ ...r }));
    rows[0] = { ...rows[0], partnerClass: 'Muster & Partner GmbH' };
    expect(packetProposalDefects({ kind: 'rate_cards', rows, applyDeferredReason: p.applyDeferredReason }).join(' '))
      .toMatch(/company name/i);
  });

  it('refuses a perimeter row whose source stops admitting it is unverified', () => {
    /*
     * The single most important guard in the file: strip the honesty from a seed row's
     * source and the row becomes a forged finding the moment it lands in the database.
     */
    const rows = (byKind('perimeter_seed').proposal as { rows: readonly PerimeterSeedRow[] }).rows.map((r) => ({ ...r }));
    rows[0] = { ...rows[0], source: 'FMA guidance and TVTG, considered and settled.' };
    expect(packetProposalDefects({ kind: 'perimeter_seed', rows }).join(' ')).toMatch(/forgery/i);
  });

  it('refuses a smuggled key anywhere in the shape — the byte-door the jsonb review demands closed', () => {
    /*
     * final_proposal is jsonb, and the intake lockout admits a jsonb column only when keys
     * AND values are bounded (see factor_scores_at_quote's review: values were bounded, keys
     * carried the payload). An unknown key at any depth is refused, so nothing byte-shaped
     * can ride an edited proposal into the decision record.
     */
    const rows = bands();
    (rows[0] as unknown as Record<string, unknown>).extraField = 'QmFzZTY0IHBheWxvYWQ=';
    expect(packetProposalDefects({ kind: 'price_bands', rows }).join(' ')).toMatch(/unknown key.*document store/i);

    const deep = byKind('effort_triples').proposal;
    if (deep.kind !== 'effort_triples') throw new Error('wrong kind');
    const t = deep.rows.map((r) => ({ ...r, waterfall: { ...r.waterfall } }));
    (t[0].waterfall as unknown as Record<string, unknown>).blob64 = 'x';
    expect(packetProposalDefects({ kind: 'effort_triples', rows: t }).join(' ')).toMatch(/unknown key "rows\.waterfall\.blob64"/);
  });

  it('refuses an over-cap string — long enough to be a payload, not a sentence', () => {
    const rows = bands();
    rows[0] = { ...rows[0], rationale: 'x'.repeat(2_001) };
    expect(packetProposalDefects({ kind: 'price_bands', rows }).join(' ')).toMatch(/cap/);
  });

  it('refuses a DPO memo that recommends an option it does not offer', () => {
    const m = byKind('dpo_memo').proposal;
    if (m.kind !== 'dpo_memo') throw new Error('wrong kind');
    const broken = {
      kind: 'dpo_memo' as const,
      memo: { ...m.memo, options: m.memo.options.filter((o) => o.id !== m.memo.recommendedOptionId) },
    };
    expect(packetProposalDefects(broken).join(' ')).toMatch(/not one of its own options/);
  });
});
