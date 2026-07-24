/**
 * LCX COMMAND seed loader (Wave 1). Idempotent upsert of the US-launch strategy
 * extract into the command_* tables. Safe to re-run — ON CONFLICT (id) refreshes
 * every row, so editing the source data.ts and re-seeding re-syncs cleanly.
 *
 * Non-fabrication rule preserved: null source fields insert as NULL, never a
 * placeholder. Called by the `command_seed` intel job and the /v1/command/seed route.
 */
import type pg from 'pg';
import { COMMAND_SEED } from '../seed/command/data.js';

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export interface CommandSeedResult {
  products: number; partners: number; workstreams: number; tasks: number;
  decisions: number; risks: number; financialAssumptions: number; launchTargets: number;
  /** Present when migration 0041 is applied (deep mutable state). */
  requirements?: number; blockers?: number;
}

export async function seedCommand(pool: pg.Pool): Promise<CommandSeedResult> {
  const d = COMMAND_SEED as unknown as {
    products: Row[]; partners: Row[]; workstreams: Row[]; tasks: Row[];
    decisions: Row[]; risks: Row[]; financialAssumptions: Row[];
    launchPlan: { targets: Array<{ name: string; date?: string; confirmed?: boolean; note?: string }> };
  };

  let products = 0, partners = 0, workstreams = 0, tasks = 0, decisions = 0, risks = 0, financialAssumptions = 0, launchTargets = 0;

  for (const p of d.products) {
    await pool.query(
      `INSERT INTO command_products (id, name, type, status, owner, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, status=EXCLUDED.status,
         owner=EXCLUDED.owner, notes=EXCLUDED.notes, source=EXCLUDED.source, updated_at=now()`,
      [s(p.id), s(p.name), s(p.type), s(p.status), s(p.owner), s(p.notes), s(p.source)],
    );
    products++;
  }

  for (const p of d.partners) {
    // ON CONFLICT deliberately does NOT touch pipeline_stage / primary_contact /
    // terms: those become governed, desk-edited fields (Wave 2) — a re-seed must
    // refresh the descriptive extract without clobbering operational state.
    await pool.query(
      `INSERT INTO command_partners (id, name, type, subtype, pipeline_stage, capability_score, tier, primary_contact, terms, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, subtype=EXCLUDED.subtype,
         capability_score=EXCLUDED.capability_score, tier=EXCLUDED.tier,
         notes=EXCLUDED.notes, source=EXCLUDED.source, updated_at=now()`,
      [s(p.id), s(p.name), s(p.type), s(p.subtype), s(p.pipeline_stage), n(p.capability_score), s(p.tier), s(p.primary_contact), s(p.terms), s(p.notes), s(p.source)],
    );
    partners++;
  }

  for (const w of d.workstreams) {
    await pool.query(
      `INSERT INTO command_workstreams (id, name, owner, status, source)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, owner=EXCLUDED.owner, status=EXCLUDED.status, source=EXCLUDED.source, updated_at=now()`,
      [s(w.id), s(w.name), s(w.owner), s(w.status), s(w.source)],
    );
    workstreams++;
  }

  for (const t of d.tasks) {
    const dependsOn = Array.isArray(t.depends_on) ? (t.depends_on as unknown[]).map((x) => String(x)) : [];
    const targetDate = t.target_date && /^\d{4}-\d{2}-\d{2}$/.test(String(t.target_date)) ? String(t.target_date) : null;
    // ON CONFLICT deliberately does NOT touch status: task status becomes a
    // governed, desk-edited field (Wave 2) — a re-seed refreshes the graph and
    // descriptions without resetting progress the desk has recorded.
    await pool.query(
      `INSERT INTO command_tasks (id, workstream, title, owner, target_date, status, depends_on, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET workstream=EXCLUDED.workstream, title=EXCLUDED.title, owner=EXCLUDED.owner,
         target_date=EXCLUDED.target_date, depends_on=EXCLUDED.depends_on,
         notes=EXCLUDED.notes, source=EXCLUDED.source, updated_at=now()`,
      [s(t.id), s(t.workstream), s(t.title), s(t.owner), targetDate, s(t.status), dependsOn, s(t.notes), s(t.source)],
    );
    tasks++;
  }

  for (const dec of d.decisions) {
    await pool.query(
      `INSERT INTO command_decisions (id, phase, decision, recommendation, status)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET phase=EXCLUDED.phase, decision=EXCLUDED.decision,
         recommendation=EXCLUDED.recommendation, updated_at=now()`,
      [s(dec.id), s(dec.phase), s(dec.decision), s(dec.recommendation), s(dec.status) ?? 'open'],
    );
    decisions++;
  }

  for (const r of d.risks) {
    await pool.query(
      `INSERT INTO command_risks (id, category, title, likelihood, impact, mitigation, phase)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET category=EXCLUDED.category, title=EXCLUDED.title, likelihood=EXCLUDED.likelihood,
         impact=EXCLUDED.impact, mitigation=EXCLUDED.mitigation, phase=EXCLUDED.phase, updated_at=now()`,
      [s(r.id), s(r.category), s(r.title), s(r.likelihood), s(r.impact), s(r.mitigation), s(r.phase)],
    );
    risks++;
  }

  for (const fa of d.financialAssumptions) {
    await pool.query(
      `INSERT INTO command_financial_assumptions (id, area, item, value, unit, assumption, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET area=EXCLUDED.area, item=EXCLUDED.item, value=EXCLUDED.value,
         unit=EXCLUDED.unit, assumption=EXCLUDED.assumption, source=EXCLUDED.source, updated_at=now()`,
      [s(fa.id), s(fa.area), s(fa.item), s(fa.value), s(fa.unit), fa.assumption !== false, s(fa.source)],
    );
    financialAssumptions++;
  }

  // Launch targets get stable synthetic ids by index (the source has no ids).
  const targets = d.launchPlan?.targets ?? [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    await pool.query(
      `INSERT INTO command_launch_targets (id, name, target_date, confirmed, note)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, target_date=EXCLUDED.target_date,
         confirmed=EXCLUDED.confirmed, note=EXCLUDED.note, updated_at=now()`,
      [`lt_${i}`, s(t.name), s(t.date), t.confirmed === true, s(t.note)],
    );
    launchTargets++;
  }

  // Deep-state seed (100X Phase 1): requirements + blockers. Best-effort — a
  // prod lagging migration 0041 must not fail the base seed.
  try {
    const { seedCommandDeep } = await import('./seed2.js');
    const deep = await seedCommandDeep(pool);
    return { products, partners, workstreams, tasks, decisions, risks, financialAssumptions, launchTargets, ...deep };
  } catch (err) {
    console.warn('[command] deep seed skipped (0041 pending?):', err instanceof Error ? err.message : err);
    return { products, partners, workstreams, tasks, decisions, risks, financialAssumptions, launchTargets };
  }
}
