/**
 * LCX COMMAND deep-seed loader (100X Phase 1). Seeds the MUTABLE program state
 * (requirements + blockers) from the compiled deep ontology. Idempotent and
 * preservation-safe: ON CONFLICT refreshes the descriptive text from the
 * strategy but NEVER touches `status` — the desk owns status. RFI rows are not
 * seeded (they're created when the desk issues an RFI; the B2C2 example in the
 * compiled data stays reference-only).
 */
import type pg from 'pg';
import { COMMAND_DEEP_SEED } from '../seed/command/data2.js';

export interface CommandDeepSeedResult { requirements: number; blockers: number }

export async function seedCommandDeep(pool: pg.Pool): Promise<CommandDeepSeedResult> {
  const d = COMMAND_DEEP_SEED as unknown as {
    requirements: Array<{ num: number; requirement: string; detail: string | null; path: string | null; owner: string | null; status: string | null }>;
    blockers: Array<{ num: number; blocker: string; category: string | null; severity: string | null; detail: string | null; owner: string | null; resolvesVia: string | null }>;
  };

  let requirements = 0, blockers = 0;
  for (const r of d.requirements) {
    await pool.query(
      `INSERT INTO command_requirements (num, requirement, detail, path, owner, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (num) DO UPDATE SET requirement=EXCLUDED.requirement, detail=EXCLUDED.detail,
         path=EXCLUDED.path, owner=EXCLUDED.owner, updated_at=now()`,
      [r.num, r.requirement, r.detail, r.path, r.owner, r.status ?? 'not_started'],
    );
    requirements++;
  }
  for (const b of d.blockers) {
    await pool.query(
      `INSERT INTO command_blockers (num, blocker, category, severity, detail, owner, resolves_via)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (num) DO UPDATE SET blocker=EXCLUDED.blocker, category=EXCLUDED.category,
         severity=EXCLUDED.severity, detail=EXCLUDED.detail, owner=EXCLUDED.owner,
         resolves_via=EXCLUDED.resolves_via, updated_at=now()`,
      [b.num, b.blocker, b.category, b.severity, b.detail, b.owner, b.resolvesVia],
    );
    blockers++;
  }
  return { requirements, blockers };
}
