/**
 * Program readiness assembly (100X Phase 4) — one place that feeds the deck
 * dial, the /readiness endpoint, and the WBR program block. Live state in,
 * composite out; degrades to compiled defaults / zeros, never throws.
 */
import type pg from 'pg';
import { programReadiness } from '@lcx/shared';
import { COMMAND_DEEP_SEED } from '../seed/command/data2.js';

const GATING = ['t_bsa', 't_counsel', 't_bankselect', 't_msb', 't_mtl', 't_3lp', 't_oes', 't_fiat_live', 't_surveil', 't_listpolicy'];
const DONE = new Set(['done', 'complete', 'completed', 'live']);

export async function computeProgramReadiness(pool: pg.Pool): Promise<{ score: number; dials: Array<{ key: string; label: string; score: number; weight: number }> }> {
  const q = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> => {
    try { return (await pool.query(sql, params)).rows as Record<string, unknown>[]; } catch { return []; }
  };
  const ref = COMMAND_DEEP_SEED as unknown as {
    requirements: Array<{ num: number; path: string | null; status: string | null }>;
    blockers: Array<{ num: number; severity: string | null; category: string | null }>;
  };
  const [gt, blockRows, reqRows, lpRows, growth] = await Promise.all([
    q(`SELECT id, status FROM command_tasks WHERE id = ANY($1)`, [GATING]),
    q(`SELECT num, severity, category, status FROM command_blockers`),
    q(`SELECT num, path, status FROM command_requirements`),
    q(`SELECT pipeline_stage FROM command_partners WHERE id IN ('pt_b2c2','pt_falconx','pt_cumberland')`),
    q(`SELECT status FROM command_tasks WHERE id = 't_waitlist_tool'`),
  ]);
  const blockers = blockRows.length
    ? blockRows.map((r) => ({ num: Number(r.num), severity: (r.severity as string) ?? null, category: (r.category as string) ?? null, status: String(r.status ?? 'open') }))
    : ref.blockers.map((b) => ({ num: b.num, severity: b.severity, category: b.category, status: 'open' }));
  const requirements = reqRows.length
    ? reqRows.map((r) => ({ num: Number(r.num), path: (r.path as string) ?? null, status: (r.status as string) ?? null }))
    : ref.requirements.map((r2) => ({ num: r2.num, path: r2.path, status: r2.status }));
  const lpsCommitted = lpRows.filter((r) => ['signed', 'incumbent_onboarding', 'in_progress'].includes(String(r.pipeline_stage))).length;
  const growthFoundation = growth.length > 0 && DONE.has(String(growth[0].status)) ? 1 : String(growth[0]?.status ?? '') === 'in_progress' ? 0.5 : 0;
  return programReadiness({
    gatingDone: gt.filter((r) => DONE.has(String(r.status))).length,
    gatingTotal: GATING.length,
    blockers, requirements, lpsCommitted, lpTarget: 3, growthFoundation,
  });
}
