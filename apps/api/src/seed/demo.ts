/**
 * demo seed — deterministic demo dataset so no page shows an empty state.
 *
 * Every row uses a fixed UUID derived from a 'lcx-demo:' namespace (sha1 → UUIDv5-style),
 * and every insert is ON CONFLICT DO NOTHING, so re-running never duplicates.
 * All demo entity names are prefixed "[DEMO] " so they are recognizable and cleanable.
 *
 * Usage:
 *   npx tsx apps/api/src/seed/demo.ts            # seed (idempotent)
 *   npx tsx apps/api/src/seed/demo.ts --clean    # delete exactly the demo rows and exit
 *
 * Requires DATABASE_URL env (defaults to local Postgres).
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import {
  CADENCE,
  MIXED_CADENCE_CHANNELS,
  defaultPackageValue,
  squashEntity,
  type SequenceStep,
  type DealStage,
} from '@lcx/shared';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';

const DEMO_PREFIX = '[DEMO] ';

/** Deterministic UUID in the 'lcx-demo' namespace (sha1, v5-style version/variant nibbles). */
function demoId(key: string): string {
  const h = createHash('sha1').update(`lcx-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  return daysAgo(-n);
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* ──────────────────────────────────────────────
 *  Demo data definitions
 * ────────────────────────────────────────────── */

const USERS = [
  { key: 'user:nik', name: 'Nik Sharma', email: 'demo.nik@lcx.com', role: 'admin' },
  { key: 'user:sarah', name: 'Sarah Chen', email: 'demo.sarah@lcx.com', role: 'bd' }, // BD manager
  { key: 'user:alex', name: 'Alex Rivera', email: 'demo.alex@lcx.com', role: 'analyst' }, // BD associate
] as const;

interface DemoProject {
  key: string;
  name: string;
  ticker: string;
  chain: string;
  category: string;
  region: 'eu' | 'us' | 'other';
  jurisdiction: string;
  source: string;
  band: 'immediate' | 'high' | 'nurture' | 'watch' | 'archive';
  euScore: number;
  usPreScore: number;
  usPostScore: number;
  mcapUsd: number;
  rank: number;
  vol24hUsd: number;
  priceUsd: number;
  change30d: number;
  ageDays: number;
}

const PROJECTS: DemoProject[] = [
  { key: 'p01', name: 'Nebula Protocol', ticker: 'NEB', chain: 'Ethereum', category: 'DeFi', region: 'eu', jurisdiction: 'LI', source: 'pipeline', band: 'immediate', euScore: 92, usPreScore: 70, usPostScore: 78, mcapUsd: 480_000_000, rank: 92, vol24hUsd: 32_000_000, priceUsd: 4.82, change30d: 18.4, ageDays: 640 },
  { key: 'p02', name: 'Quantum Ledger', ticker: 'QLD', chain: 'Ethereum', category: 'Infrastructure', region: 'eu', jurisdiction: 'DE', source: 'esma_main', band: 'immediate', euScore: 90, usPreScore: 64, usPostScore: 71, mcapUsd: 310_000_000, rank: 128, vol24hUsd: 21_500_000, priceUsd: 1.27, change30d: 9.2, ageDays: 910 },
  { key: 'p03', name: 'Solaris Finance', ticker: 'SOLF', chain: 'Solana', category: 'DeFi', region: 'us', jurisdiction: 'US', source: 'top100', band: 'immediate', euScore: 74, usPreScore: 89, usPostScore: 93, mcapUsd: 720_000_000, rank: 61, vol24hUsd: 58_000_000, priceUsd: 12.4, change30d: 27.1, ageDays: 420 },
  { key: 'p04', name: 'AetherSwap', ticker: 'AETH', chain: 'Arbitrum', category: 'DEX', region: 'eu', jurisdiction: 'FR', source: 'pipeline', band: 'immediate', euScore: 88, usPreScore: 58, usPostScore: 66, mcapUsd: 205_000_000, rank: 174, vol24hUsd: 15_800_000, priceUsd: 0.86, change30d: 12.9, ageDays: 380 },
  { key: 'p05', name: 'Polar Chain', ticker: 'POLR', chain: 'Polar', category: 'Layer 1', region: 'other', jurisdiction: 'SG', source: 'potential', band: 'immediate', euScore: 86, usPreScore: 72, usPostScore: 75, mcapUsd: 1_150_000_000, rank: 44, vol24hUsd: 96_000_000, priceUsd: 3.41, change30d: 6.3, ageDays: 1240 },
  { key: 'p06', name: 'Vertex Yield', ticker: 'VRTX', chain: 'Ethereum', category: 'Yield', region: 'eu', jurisdiction: 'NL', source: 'pipeline', band: 'high', euScore: 78, usPreScore: 55, usPostScore: 60, mcapUsd: 92_000_000, rank: 311, vol24hUsd: 5_600_000, priceUsd: 2.18, change30d: -4.1, ageDays: 530 },
  { key: 'p07', name: 'Lumen Pay', ticker: 'LMN', chain: 'Stellar', category: 'Payments', region: 'us', jurisdiction: 'US', source: 'pre_tge', band: 'high', euScore: 62, usPreScore: 80, usPostScore: 83, mcapUsd: 145_000_000, rank: 228, vol24hUsd: 9_400_000, priceUsd: 0.34, change30d: 15.7, ageDays: 210 },
  { key: 'p08', name: 'Drift Markets', ticker: 'DRFT', chain: 'Solana', category: 'Derivatives', region: 'other', jurisdiction: 'KY', source: 'top100', band: 'high', euScore: 71, usPreScore: 76, usPostScore: 74, mcapUsd: 260_000_000, rank: 149, vol24hUsd: 30_200_000, priceUsd: 1.92, change30d: 3.8, ageDays: 460 },
  { key: 'p09', name: 'Cobalt Network', ticker: 'CBLT', chain: 'Cosmos', category: 'Infrastructure', region: 'eu', jurisdiction: 'CH', source: 'esma_casp', band: 'high', euScore: 75, usPreScore: 52, usPostScore: 57, mcapUsd: 68_000_000, rank: 402, vol24hUsd: 3_100_000, priceUsd: 0.57, change30d: 8.5, ageDays: 720 },
  { key: 'p10', name: 'Ember DAO', ticker: 'EMBR', chain: 'Base', category: 'DAO', region: 'us', jurisdiction: 'US', source: 'potential', band: 'high', euScore: 58, usPreScore: 77, usPostScore: 79, mcapUsd: 54_000_000, rank: 468, vol24hUsd: 2_700_000, priceUsd: 0.081, change30d: 22.6, ageDays: 160 },
  { key: 'p11', name: 'Glacier Vault', ticker: 'GLCR', chain: 'Ethereum', category: 'RWA', region: 'eu', jurisdiction: 'LU', source: 'esma_main', band: 'nurture', euScore: 64, usPreScore: 44, usPostScore: 49, mcapUsd: 38_000_000, rank: 585, vol24hUsd: 1_400_000, priceUsd: 15.2, change30d: 1.9, ageDays: 840 },
  { key: 'p12', name: 'Nova Bridge', ticker: 'NOVB', chain: 'Multichain', category: 'Bridge', region: 'other', jurisdiction: 'AE', source: 'pipeline', band: 'nurture', euScore: 59, usPreScore: 48, usPostScore: 51, mcapUsd: 27_000_000, rank: 672, vol24hUsd: 900_000, priceUsd: 0.44, change30d: -8.7, ageDays: 390 },
  { key: 'p13', name: 'Pulse Oracle', ticker: 'PLSO', chain: 'Ethereum', category: 'Oracle', region: 'eu', jurisdiction: 'EE', source: 'esma_emt', band: 'nurture', euScore: 61, usPreScore: 40, usPostScore: 45, mcapUsd: 45_000_000, rank: 540, vol24hUsd: 1_900_000, priceUsd: 1.05, change30d: 4.4, ageDays: 610 },
  { key: 'p14', name: 'Terra Forge', ticker: 'TFRG', chain: 'Polygon', category: 'Gaming', region: 'us', jurisdiction: 'US', source: 'potential', band: 'nurture', euScore: 52, usPreScore: 60, usPostScore: 62, mcapUsd: 19_000_000, rank: 789, vol24hUsd: 640_000, priceUsd: 0.023, change30d: -12.3, ageDays: 300 },
  { key: 'p15', name: 'Zephyr AI', ticker: 'ZAI', chain: 'Base', category: 'AI', region: 'eu', jurisdiction: 'IE', source: 'pre_tge', band: 'watch', euScore: 47, usPreScore: 38, usPostScore: 42, mcapUsd: 8_500_000, rank: 1120, vol24hUsd: 210_000, priceUsd: 0.012, change30d: 31.5, ageDays: 90 },
  { key: 'p16', name: 'Onyx Privacy', ticker: 'ONYX', chain: 'Ethereum', category: 'Privacy', region: 'other', jurisdiction: 'PA', source: 'top100', band: 'watch', euScore: 42, usPreScore: 30, usPostScore: 33, mcapUsd: 15_000_000, rank: 902, vol24hUsd: 480_000, priceUsd: 0.67, change30d: -2.2, ageDays: 1500 },
  { key: 'p17', name: 'Helio Staking', ticker: 'HLO', chain: 'Ethereum', category: 'Staking', region: 'eu', jurisdiction: 'AT', source: 'esma_main', band: 'watch', euScore: 45, usPreScore: 35, usPostScore: 39, mcapUsd: 11_000_000, rank: 1010, vol24hUsd: 330_000, priceUsd: 2.94, change30d: 0.8, ageDays: 700 },
  { key: 'p18', name: 'Mistral Meme', ticker: 'MSTM', chain: 'Solana', category: 'Meme', region: 'us', jurisdiction: 'US', source: 'manual', band: 'archive', euScore: 18, usPreScore: 24, usPostScore: 22, mcapUsd: 2_100_000, rank: 2140, vol24hUsd: 95_000, priceUsd: 0.0004, change30d: -41.2, ageDays: 45 },
  { key: 'p19', name: 'Krypton Legacy', ticker: 'KRY', chain: 'Ethereum', category: 'Legacy', region: 'other', jurisdiction: 'BZ', source: 'closed', band: 'archive', euScore: 12, usPreScore: 10, usPostScore: 11, mcapUsd: 850_000, rank: 3020, vol24hUsd: 12_000, priceUsd: 0.09, change30d: -18.6, ageDays: 2600 },
  { key: 'p20', name: 'Echo Social', ticker: 'ECHO', chain: 'Base', category: 'SocialFi', region: 'eu', jurisdiction: 'ES', source: 'manual', band: 'archive', euScore: 22, usPreScore: 19, usPostScore: 20, mcapUsd: 1_600_000, rank: 2450, vol24hUsd: 60_000, priceUsd: 0.0071, change30d: -25.9, ageDays: 130 },
];

interface DemoPerson {
  key: string;
  projectKey: string;
  name: string;
  title: string;
  role: string;
  emailStatus: 'verified' | 'valid_mx' | 'unverified' | 'invalid';
  verified: boolean;
  contactability: number;
}

const PEOPLE: DemoPerson[] = [
  { key: 'pe01', projectKey: 'p01', name: 'Elena Marchetti', title: 'CEO & Co-founder', role: 'founder', emailStatus: 'verified', verified: true, contactability: 90 },
  { key: 'pe02', projectKey: 'p01', name: 'Tobias Lang', title: 'Head of BD', role: 'bd', emailStatus: 'valid_mx', verified: false, contactability: 70 },
  { key: 'pe03', projectKey: 'p02', name: 'Marta Keller', title: 'Founder', role: 'founder', emailStatus: 'verified', verified: true, contactability: 85 },
  { key: 'pe04', projectKey: 'p03', name: 'Jordan Blake', title: 'COO', role: 'exec', emailStatus: 'valid_mx', verified: false, contactability: 65 },
  { key: 'pe05', projectKey: 'p03', name: 'Priya Nair', title: 'Head of Partnerships', role: 'bd', emailStatus: 'unverified', verified: false, contactability: 40 },
  { key: 'pe06', projectKey: 'p04', name: 'Hugo Fontaine', title: 'CEO', role: 'founder', emailStatus: 'verified', verified: true, contactability: 88 },
  { key: 'pe07', projectKey: 'p05', name: 'Wei Zhang', title: 'Co-founder & CTO', role: 'founder', emailStatus: 'unverified', verified: false, contactability: 45 },
  { key: 'pe08', projectKey: 'p05', name: 'Anna Lindqvist', title: 'VP Growth', role: 'bd', emailStatus: 'invalid', verified: false, contactability: 10 },
  { key: 'pe09', projectKey: 'p06', name: 'Ruben de Vries', title: 'Founder', role: 'founder', emailStatus: 'valid_mx', verified: false, contactability: 68 },
  { key: 'pe10', projectKey: 'p07', name: 'Casey Morgan', title: 'CEO', role: 'founder', emailStatus: 'verified', verified: true, contactability: 92 },
  { key: 'pe11', projectKey: 'p08', name: 'Dmitri Volkov', title: 'Head of Listings', role: 'bd', emailStatus: 'unverified', verified: false, contactability: 35 },
  { key: 'pe12', projectKey: 'p08', name: 'Sofia Reyes', title: 'CMO', role: 'exec', emailStatus: 'invalid', verified: false, contactability: 12 },
];

interface DemoDeal {
  key: string;
  projectKey: string;
  stage: DealStage;
  packageType: 'listing' | 'marketing' | 'liquidity' | 'dual' | 'emt' | 'custom';
  createdDaysAgo: number;
  winReason?: string;
  lossReason?: string;
  lossCategory?: string;
}

const DEALS: DemoDeal[] = [
  { key: 'd01', projectKey: 'p01', stage: 'won', packageType: 'dual', createdDaysAgo: 45, winReason: 'Dual EU+US listing was the differentiator; MiCA-ready compliance package sealed it.' },
  { key: 'd02', projectKey: 'p02', stage: 'negotiating', packageType: 'listing', createdDaysAgo: 30 },
  { key: 'd03', projectKey: 'p03', stage: 'proposal', packageType: 'emt', createdDaysAgo: 21 },
  { key: 'd04', projectKey: 'p04', stage: 'discovery', packageType: 'listing', createdDaysAgo: 12 },
  { key: 'd05', projectKey: 'p05', stage: 'contacted', packageType: 'liquidity', createdDaysAgo: 6 },
  { key: 'd06', projectKey: 'p06', stage: 'lost', packageType: 'listing', createdDaysAgo: 60, lossReason: 'Signed with a larger competitor exchange offering fee waivers.', lossCategory: 'competitor' },
];

const STAGE_PATH: DealStage[] = ['contacted', 'discovery', 'proposal', 'negotiating'];

/* ──────────────────────────────────────────────
 *  Seed sections (each in its own transaction)
 * ────────────────────────────────────────────── */

type Client = pg.PoolClient;

async function section(pool: pg.Pool, label: string, fn: (c: Client) => Promise<number>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await fn(client);
    await client.query('COMMIT');
    console.log(`  ✓ ${label} (${inserted} inserted)`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw new Error(`section "${label}" failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    client.release();
  }
}

async function ins(client: Client, sql: string, params: unknown[]): Promise<number> {
  const res = await client.query(sql, params);
  return res.rowCount ?? 0;
}

async function seedUsers(c: Client): Promise<number> {
  let n = 0;
  for (const u of USERS) {
    n += await ins(
      c,
      `INSERT INTO users (id, email, name, role, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT DO NOTHING`,
      [demoId(u.key), u.email, DEMO_PREFIX + u.name, u.role],
    );
  }
  return n;
}

async function seedProjects(c: Client): Promise<number> {
  let n = 0;
  for (const p of PROJECTS) {
    const name = DEMO_PREFIX + p.name;
    const domain = `${p.ticker.toLowerCase()}.demo.example`;
    n += await ins(
      c,
      `INSERT INTO projects (
         id, name, website, ticker, chain, source, jurisdiction, category, region,
         market_cap_usd, market_cap_rank, volume_24h_usd, price_usd, price_change_30d,
         token_age_days, last_enriched_at, name_key, domain, ticker_norm, raw
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16,$17,$18,$19)
       ON CONFLICT DO NOTHING`,
      [
        demoId(p.key), name, `https://${domain}`, p.ticker, p.chain, p.source,
        p.jurisdiction, p.category, p.region,
        p.mcapUsd, p.rank, p.vol24hUsd, p.priceUsd, p.change30d, p.ageDays,
        squashEntity(name), domain, p.ticker.toLowerCase(),
        JSON.stringify({ demo: true, description: `${p.name} — ${p.category} project on ${p.chain}` }),
      ],
    );
  }
  return n;
}

async function seedScores(c: Client): Promise<number> {
  let n = 0;
  for (const p of PROJECTS) {
    const best = Math.max(p.euScore, p.usPreScore);
    const reasons = [
      { code: 'demo_mcap', factor: 'Market cap', points: Math.min(25, Math.round(best / 4)), max: 25, note: `Market cap $${(p.mcapUsd / 1e6).toFixed(0)}M` },
      { code: 'demo_volume', factor: '24h volume', points: Math.min(20, Math.round(best / 5)), max: 20, note: `24h volume $${(p.vol24hUsd / 1e6).toFixed(1)}M` },
    ];
    n += await ins(
      c,
      `INSERT INTO scores (
         id, project_id, eu_score, us_pre_score, us_post_score, band, reasons,
         recommended_market, propensity_score, propensity_reasons, priority_score, model_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'demo-v1')
       ON CONFLICT DO NOTHING`,
      [
        demoId(`score:${p.key}`), demoId(p.key), p.euScore, p.usPreScore, p.usPostScore,
        p.band, JSON.stringify(reasons),
        p.euScore >= p.usPreScore ? 'eu' : 'us',
        Math.min(99, best + 3),
        JSON.stringify([{ code: 'demo_fit', factor: 'Listing fit', points: 10, max: 15, note: 'Demo propensity signal' }]),
        best,
      ],
    );
  }
  return n;
}

async function seedPeople(c: Client): Promise<number> {
  let n = 0;
  for (const pe of PEOPLE) {
    const slug = pe.name.toLowerCase().replace(/[^a-z]+/g, '.');
    const proj = PROJECTS.find((p) => p.key === pe.projectKey)!;
    const email = pe.emailStatus === 'invalid' ? `${slug}@bounced.example` : `${slug}@${proj.ticker.toLowerCase()}.demo.example`;
    n += await ins(
      c,
      `INSERT INTO people (
         id, project_id, name, title, role, linkedin, email, email_status,
         telegram, verified, contactability_score, enriched_by, raw
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual','{"demo":true}'::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        demoId(pe.key), demoId(pe.projectKey), DEMO_PREFIX + pe.name, pe.title, pe.role,
        `https://linkedin.com/in/${slug.replace(/\./g, '-')}-demo`, email, pe.emailStatus,
        pe.contactability >= 60 ? `@${slug.split('.')[0]}_${proj.ticker.toLowerCase()}` : null,
        pe.verified, pe.contactability,
      ],
    );
  }
  return n;
}

async function seedDeals(c: Client): Promise<number> {
  let n = 0;
  for (const d of DEALS) {
    const value = defaultPackageValue(d.packageType);
    const isWon = d.stage === 'won';
    const isLost = d.stage === 'lost';
    n += await ins(
      c,
      `INSERT INTO deals (
         id, project_id, stage, package_type, package_value, owner, notes,
         win_reason, loss_reason, loss_category, won_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,'operator',$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT DO NOTHING`,
      [
        demoId(d.key), demoId(d.projectKey), d.stage, d.packageType, value,
        `Demo deal for ${d.projectKey}`,
        d.winReason ?? null, d.lossReason ?? null, d.lossCategory ?? null,
        isWon ? daysAgo(5) : null, daysAgo(d.createdDaysAgo),
      ],
    );

    // Stage history: created → each intermediate stage → current stage.
    const terminal: DealStage[] = isWon ? ['won'] : isLost ? ['lost'] : [];
    const pathIdx = STAGE_PATH.indexOf(d.stage);
    const intermediate = isWon || isLost ? STAGE_PATH.slice(0, isLost ? 2 : 4) : STAGE_PATH.slice(0, pathIdx + 1);
    const chain: Array<{ from: string | null; to: string }> = [{ from: null, to: 'not_started' }];
    let prev = 'not_started';
    for (const s of [...intermediate, ...terminal]) {
      chain.push({ from: prev, to: s });
      prev = s;
    }
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      n += await ins(
        c,
        `INSERT INTO deal_events (id, deal_id, event_type, actor, old_stage, new_stage, content, meta, created_at)
         VALUES ($1,$2,'stage_change','operator',$3,$4,$5,'{"demo":true}'::jsonb,$6)
         ON CONFLICT DO NOTHING`,
        [
          demoId(`deal_event:${d.key}:${i}`), demoId(d.key), step.from, step.to,
          i === 0 ? 'Deal created' : `Stage moved to ${step.to}`,
          daysAgo(d.createdDaysAgo - i * Math.max(1, Math.floor(d.createdDaysAgo / (chain.length + 1)))),
        ],
      );
    }
  }
  return n;
}

async function seedHandoffs(c: Client): Promise<number> {
  // Statuses come from apps/api/src/outreach/handoffs.ts:
  // open | in_progress | resolved_won_path | resolved_lost | re_nurture
  const HANDOFFS = [
    { key: 'h01', projectKey: 'p01', personKey: 'pe01', status: 'resolved_won_path', assignedTo: 'demo.sarah@lcx.com', summary: 'Elena replied positively to touch 2 — moved to deal desk, dual listing closed.' },
    { key: 'h02', projectKey: 'p02', personKey: 'pe03', status: 'in_progress', assignedTo: 'demo.nik@lcx.com', summary: 'Marta asked for the fee schedule and MiCA compliance details. Call booked.' },
    { key: 'h03', projectKey: 'p03', personKey: 'pe04', status: 'open', assignedTo: null, summary: 'Jordan replied asking who handles US listings — needs an owner.' },
  ] as const;

  let n = 0;
  for (const h of HANDOFFS) {
    n += await ins(
      c,
      `INSERT INTO handoffs (id, project_id, person_id, channel, trigger_reason, status, assigned_to, summary, created_at, updated_at)
       VALUES ($1,$2,$3,'email','reply',$4,$5,$6,$7,NOW())
       ON CONFLICT DO NOTHING`,
      [demoId(h.key), demoId(h.projectKey), demoId(h.personKey), h.status, h.assignedTo, h.summary, daysAgo(8)],
    );
    n += await ins(
      c,
      `INSERT INTO handoff_events (id, handoff_id, event_type, actor, content, new_status, created_at)
       VALUES ($1,$2,'created','system','Reply detected — sequence paused, handoff created','open',$3)
       ON CONFLICT DO NOTHING`,
      [demoId(`handoff_event:${h.key}:created`), demoId(h.key), daysAgo(8)],
    );
    if (h.status !== 'open') {
      n += await ins(
        c,
        `INSERT INTO handoff_events (id, handoff_id, event_type, actor, content, old_status, new_status, created_at)
         VALUES ($1,$2,'status_change',$3,$4,'open',$5,$6)
         ON CONFLICT DO NOTHING`,
        [
          demoId(`handoff_event:${h.key}:status`), demoId(h.key), h.assignedTo ?? 'operator',
          `Status moved to ${h.status}`, h.status, daysAgo(5),
        ],
      );
    }
  }
  return n;
}

async function seedTasks(c: Client): Promise<number> {
  const TASKS = [
    { key: 't01', projectKey: 'p02', dealKey: 'd02', title: 'Send revised term sheet to Quantum Ledger', detail: 'Marta expects the updated fee schedule before Friday call.', status: 'open', dueAt: daysAgo(2), completedAt: null }, // overdue
    { key: 't02', projectKey: 'p03', dealKey: 'd03', title: 'Prepare EMT proposal deck for Solaris Finance', detail: 'Include MiCA EMT framework summary.', status: 'open', dueAt: daysFromNow(1), completedAt: null },
    { key: 't03', projectKey: 'p05', dealKey: 'd05', title: 'Intro call with Polar Chain BD team', detail: null, status: 'open', dueAt: daysFromNow(3), completedAt: null },
    { key: 't04', projectKey: 'p07', dealKey: null, title: 'Verify Lumen Pay contact emails', detail: 'Two contacts still unverified.', status: 'open', dueAt: daysFromNow(5), completedAt: null },
    { key: 't05', projectKey: 'p01', dealKey: 'd01', title: 'Kick off Nebula Protocol listing onboarding', detail: 'Won — start technical integration checklist.', status: 'done', dueAt: daysAgo(4), completedAt: daysAgo(1) },
    { key: 't06', projectKey: 'p04', dealKey: 'd04', title: 'Research AetherSwap tokenomics', detail: null, status: 'done', dueAt: daysAgo(7), completedAt: daysAgo(3) },
  ] as const;

  let n = 0;
  for (const t of TASKS) {
    n += await ins(
      c,
      `INSERT INTO tasks (id, project_id, deal_id, title, detail, kind, status, due_at, created_by, completed_at)
       VALUES ($1,$2,$3,$4,$5,'manual',$6,$7,'operator',$8)
       ON CONFLICT DO NOTHING`,
      [
        demoId(t.key), demoId(t.projectKey), t.dealKey ? demoId(t.dealKey) : null,
        DEMO_PREFIX + t.title, t.detail, t.status, t.dueAt, t.completedAt,
      ],
    );
  }
  return n;
}

function buildSteps(projectName: string, sentThrough: number): SequenceStep[] {
  return CADENCE.map((c, i) => ({
    touchIndex: c.touchIndex,
    delayDays: c.delayDays,
    channel: MIXED_CADENCE_CHANNELS[i],
    status: c.touchIndex <= sentThrough ? 'sent' : c.touchIndex === sentThrough + 1 ? 'queued' : 'pending',
    subject: `${c.label.split('—')[1]?.trim() ?? 'Follow-up'} — LCX x ${projectName}`,
    body: `Hi — following up on a potential LCX listing for ${projectName}. (${c.label})`,
    claimsUsed: [],
    requiresHumanReview: false,
  }));
}

async function seedSequences(c: Client): Promise<number> {
  const SEQS = [
    { key: 's01', projectKey: 'p07', personKey: 'pe10', status: 'active', currentStep: 2, startedAt: daysAgo(7), completedAt: null, sentThrough: 2 },
    { key: 's02', projectKey: 'p08', personKey: 'pe11', status: 'paused', currentStep: 1, startedAt: daysAgo(10), completedAt: null, sentThrough: 1 },
    { key: 's03', projectKey: 'p04', personKey: 'pe06', status: 'completed', currentStep: 5, startedAt: daysAgo(40), completedAt: daysAgo(5), sentThrough: 5 },
  ] as const;

  let n = 0;
  for (const s of SEQS) {
    const proj = PROJECTS.find((p) => p.key === s.projectKey)!;
    n += await ins(
      c,
      `INSERT INTO outreach_sequences (
         id, project_id, person_id, channel, status, steps, current_step,
         from_email, started_at, completed_at, created_at, updated_at
       ) VALUES ($1,$2,$3,'email',$4,$5,$6,'bd@lcx.com',$7,$8,$7,NOW())
       ON CONFLICT DO NOTHING`,
      [
        demoId(s.key), demoId(s.projectKey), demoId(s.personKey), s.status,
        JSON.stringify(buildSteps(DEMO_PREFIX + proj.name, s.sentThrough)),
        s.currentStep, s.startedAt, s.completedAt,
      ],
    );
  }

  // Assisted-channel queue items (unique on sequence_id + step_index)
  const QUEUE = [
    { key: 'q01', seqKey: 's01', projectKey: 'p07', personKey: 'pe10', stepIndex: 2, touchIndex: 3, channel: 'linkedin', action: 'connection_request', subject: null, body: 'Hi Casey — leading BD at LCX; would love to connect about a Lumen Pay listing.', dueAt: daysAgo(0) },
    { key: 'q02', seqKey: 's01', projectKey: 'p07', personKey: 'pe10', stepIndex: 3, touchIndex: 4, channel: 'telegram', action: 'telegram_dm', subject: null, body: 'Hi Casey, following up on the LCX listing conversation — open to a quick call this week?', dueAt: daysFromNow(2) },
    { key: 'q03', seqKey: 's02', projectKey: 'p08', personKey: 'pe11', stepIndex: 2, touchIndex: 3, channel: 'linkedin', action: 'message', subject: 'LCX x Drift Markets', body: 'Dmitri — sharing the LCX listing overview; the EU regulated venue could complement your current markets.', dueAt: daysAgo(1) },
    { key: 'q04', seqKey: 's02', projectKey: 'p08', personKey: 'pe12', stepIndex: 3, touchIndex: 4, channel: 'telegram', action: 'telegram_dm', subject: null, body: 'Hi Sofia — final nudge on the LCX listing intro for Drift Markets.', dueAt: daysFromNow(4) },
  ] as const;

  for (const q of QUEUE) {
    n += await ins(
      c,
      `INSERT INTO outreach_tasks (
         id, sequence_id, project_id, person_id, step_index, touch_index,
         channel, action, subject, body, status, due_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
       ON CONFLICT DO NOTHING`,
      [
        demoId(q.key), demoId(q.seqKey), demoId(q.projectKey), demoId(q.personKey),
        q.stepIndex, q.touchIndex, q.channel, q.action, q.subject, q.body, q.dueAt,
      ],
    );
  }
  return n;
}

async function seedNotifications(c: Client): Promise<number> {
  const NOTIFS = [
    { key: 'n01', rule: 'reply_received', title: 'Reply from [DEMO] Nebula Protocol', detail: 'Elena Marchetti replied to touch 2 — handoff created.', projectKey: 'p01', href: '/outreach', read: false },
    { key: 'n02', rule: 'deal_stalled', title: '[DEMO] Quantum Ledger deal stalled', detail: 'No stage change in 14 days while negotiating.', projectKey: 'p02', href: '/deal-board', read: false },
    { key: 'n03', rule: 'competitor_listing', title: '[DEMO] Vertex Yield listed elsewhere', detail: 'VRTX appeared on a competitor exchange feed.', projectKey: 'p06', href: `/bd-pipeline/${demoId('p06')}`, read: false },
    { key: 'n04', rule: 'discovery_found', title: 'New contacts found for [DEMO] Cobalt Network', detail: 'Contact discovery crawl found 2 new people.', projectKey: 'p09', href: `/bd-pipeline/${demoId('p09')}`, read: false },
    { key: 'n05', rule: 'deal_stalled', title: '[DEMO] Solaris Finance proposal aging', detail: 'Proposal sent 9 days ago with no response.', projectKey: 'p03', href: '/deal-board', read: true },
  ] as const;

  let n = 0;
  for (const x of NOTIFS) {
    n += await ins(
      c,
      `INSERT INTO notifications (id, rule, title, detail, project_id, href, read_at, dedup_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [
        demoId(x.key), x.rule, x.title, x.detail, demoId(x.projectKey), x.href,
        x.read ? daysAgo(1) : null, `demo:${x.key}`,
      ],
    );
  }
  return n;
}

async function seedInvoices(c: Client): Promise<number> {
  // invoices.status vocabulary: draft | sent | paid | overdue ('sent' == outstanding/pending)
  const INVOICES = [
    { key: 'i01', dealKey: 'd01', amountCents: defaultPackageValue('dual'), status: 'paid', dueDate: dateOnly(daysAgo(3)), items: [{ description: 'Dual Listing (EU+US) package', amountCents: defaultPackageValue('dual') }] },
    { key: 'i02', dealKey: 'd02', amountCents: defaultPackageValue('listing'), status: 'sent', dueDate: dateOnly(daysFromNow(14)), items: [{ description: 'Standard Listing package', amountCents: defaultPackageValue('listing') }] },
  ] as const;

  let n = 0;
  for (const inv of INVOICES) {
    n += await ins(
      c,
      `INSERT INTO invoices (id, deal_id, amount_cents, currency, status, due_date, line_items)
       VALUES ($1,$2,$3,'USD',$4,$5,$6)
       ON CONFLICT DO NOTHING`,
      [demoId(inv.key), demoId(inv.dealKey), inv.amountCents, inv.status, inv.dueDate, JSON.stringify(inv.items)],
    );
  }
  return n;
}

async function seedKpiSnapshots(c: Client): Promise<number> {
  const SNAPSHOTS = [
    { key: 'k01', date: dateOnly(daysAgo(1)), leads: 4, sent: 38, replied: 5, enrolled: 12, funnelReplied: 5, proposal: 3, won: 1, revListing: 2_000_000, revDual: 5_000_000, hot: 2, stalled: 1, overdue: 1 },
    { key: 'k02', date: dateOnly(daysAgo(0)), leads: 5, sent: 44, replied: 7, enrolled: 14, funnelReplied: 6, proposal: 4, won: 1, revListing: 2_000_000, revDual: 5_000_000, hot: 3, stalled: 2, overdue: 1 },
  ] as const;

  let n = 0;
  for (const s of SNAPSHOTS) {
    n += await ins(
      c,
      `INSERT INTO kpi_daily_snapshots (
         id, snapshot_date, new_high_score_leads_week,
         reply_rate_email_sent, reply_rate_email_replied,
         reply_rate_linkedin_sent, reply_rate_linkedin_replied,
         avg_hours_first_touch_to_handoff, avg_hours_handoff_to_proposal, avg_hours_proposal_to_won,
         funnel_enrolled, funnel_replied, funnel_proposal, funnel_won,
         revenue_listing, revenue_dual, top_objections,
         stalled_deal_count, total_won, hot_deals, stalled_deals, overdue_actions
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,52,68,120,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT DO NOTHING`,
      [
        demoId(s.key), s.date, s.leads,
        s.sent, s.replied, Math.round(s.sent / 3), Math.max(1, Math.round(s.replied / 3)),
        s.enrolled, s.funnelReplied, s.proposal, s.won,
        s.revListing, s.revDual,
        JSON.stringify([{ objection: 'pricing', count: 3 }, { objection: 'timing', count: 2 }]),
        s.stalled, s.won, s.hot, s.stalled, s.overdue,
      ],
    );
  }
  return n;
}

/* ──────────────────────────────────────────────
 *  Clean — delete exactly the demo rows
 * ────────────────────────────────────────────── */

async function clean(pool: pg.Pool): Promise<void> {
  console.log('\n🧹 Removing demo data...\n');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // people.project_id is ON DELETE SET NULL — delete demo contacts explicitly first.
    const peopleIds = PEOPLE.map((p) => demoId(p.key));
    const ppl = await client.query(
      `DELETE FROM people WHERE id = ANY($1::uuid[]) OR name LIKE $2`,
      [peopleIds, `${DEMO_PREFIX}%`],
    );

    // Deleting demo projects cascades: scores, deals (→ deal_events, invoices),
    // handoffs (→ handoff_events), outreach_sequences (→ outreach_tasks), tasks, notifications, signals.
    const projectIds = PROJECTS.map((p) => demoId(p.key));
    const proj = await client.query(
      `DELETE FROM projects WHERE id = ANY($1::uuid[]) OR name LIKE $2`,
      [projectIds, `${DEMO_PREFIX}%`],
    );

    const userIds = USERS.map((u) => demoId(u.key));
    const users = await client.query(
      `DELETE FROM users WHERE id = ANY($1::uuid[]) OR name LIKE $2`,
      [userIds, `${DEMO_PREFIX}%`],
    );

    const kpiIds = ['k01', 'k02'].map((k) => demoId(k));
    const kpi = await client.query(`DELETE FROM kpi_daily_snapshots WHERE id = ANY($1::uuid[])`, [kpiIds]);

    await client.query('COMMIT');
    console.log(`  ✓ ${ppl.rowCount} demo people removed`);
    console.log(`  ✓ ${proj.rowCount} demo projects removed (children cascaded)`);
    console.log(`  ✓ ${users.rowCount} demo users removed`);
    console.log(`  ✓ ${kpi.rowCount} demo KPI snapshots removed`);
    console.log('\n✅ Demo data cleaned.\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ──────────────────────────────────────────────
 *  Main
 * ────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

  try {
    await pool.query('SELECT 1');

    if (args.includes('--clean')) {
      await clean(pool);
      return;
    }

    console.log('\n🎬 LCX Demo Seed — deterministic, idempotent demo dataset');
    console.log(`  Database: ${DB_URL.replace(/\/\/.*@/, '//***@')}\n`);

    await section(pool, '3 demo users', seedUsers);
    await section(pool, '20 demo leads (projects)', seedProjects);
    await section(pool, '20 demo scores (BD queue bands)', seedScores);
    await section(pool, '12 demo people (contacts)', seedPeople);
    await section(pool, '6 demo deals + stage history', seedDeals);
    await section(pool, '3 demo handoffs + events', seedHandoffs);
    await section(pool, '6 demo tasks (one overdue)', seedTasks);
    await section(pool, '3 demo sequences + 4 queue items', seedSequences);
    await section(pool, '5 demo notifications', seedNotifications);
    await section(pool, '2 demo invoices (paid, sent)', seedInvoices);
    await section(pool, '2 demo KPI snapshots (sparklines)', seedKpiSnapshots);

    console.log('\n✅ Demo seed complete. Re-run any time — inserts are conflict-safe.');
    console.log('   Remove with: npx tsx apps/api/src/seed/demo.ts --clean\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Demo seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
