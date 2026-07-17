/**
 * demo seed — deterministic, lived-in demo dataset (FINAL_MASTER_PLAN Part 5a).
 *
 * Design goals:
 * - Looks like 9 months of real desk work: 52 projects, 48 deals across all
 *   stages with power-law package values, 26 weeks of KPI history, mixed SLA
 *   states (mostly fresh, a few aging, exactly one breached).
 * - No "[DEMO]" name prefixes — demo-ness is signaled once (env badge) and
 *   tagged machine-readably in raw.demo, never shouted on every row.
 * - Deterministic UUIDs from a 'lcx-demo:' namespace + ON CONFLICT DO NOTHING,
 *   so re-running never duplicates. All value jitter comes from a hash-based
 *   PRNG keyed per row — same output every run.
 *
 * Usage:
 *   npx tsx apps/api/src/seed/demo.ts            # seed (idempotent)
 *   npx tsx apps/api/src/seed/demo.ts --clean    # delete exactly the demo rows
 *
 * Requires DATABASE_URL env (defaults to local Postgres).
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import {
  CADENCE,
  MIXED_CADENCE_CHANNELS,
  squashEntity,
  type SequenceStep,
  type DealStage,
} from '@lcx/shared';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';

/** Legacy prefix — only used by --clean to sweep rows from older seed versions. */
const LEGACY_PREFIX = '[DEMO] ';

/** Deterministic UUID in the 'lcx-demo' namespace (sha1, v5-style version/variant nibbles). */
function demoId(key: string): string {
  const h = createHash('sha1').update(`lcx-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Deterministic [0,1) from a key — stable jitter without Math.random. */
function rand(key: string): number {
  const h = createHash('sha1').update(`lcx-rand:${key}`).digest();
  return h.readUInt32BE(0) / 0x1_0000_0000;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3_600_000);
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
  { key: 'user:sarah', name: 'Sarah Chen', email: 'demo.sarah@lcx.com', role: 'bd' },
  { key: 'user:alex', name: 'Alex Rivera', email: 'demo.alex@lcx.com', role: 'analyst' },
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

/** Compact row builder for the generated half of the roster. */
function gp(
  key: string, name: string, ticker: string, chain: string, category: string,
  region: 'eu' | 'us' | 'other', jurisdiction: string, source: string,
  band: DemoProject['band'], euScore: number, usPreScore: number,
  mcapM: number, rank: number, volM: number, priceUsd: number, change30d: number, ageDays: number,
): DemoProject {
  return {
    key, name, ticker, chain, category, region, jurisdiction, source, band,
    euScore, usPreScore, usPostScore: Math.min(99, usPreScore + 3 + Math.round(rand(key) * 5)),
    mcapUsd: Math.round(mcapM * 1e6 * (0.9 + rand(`${key}:m`) * 0.2)),
    rank, vol24hUsd: Math.round(volM * 1e6 * (0.85 + rand(`${key}:v`) * 0.3)),
    priceUsd, change30d, ageDays,
  };
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
  { key: 'p18', name: 'Mistral Labs', ticker: 'MSTL', chain: 'Solana', category: 'Meme', region: 'us', jurisdiction: 'US', source: 'manual', band: 'archive', euScore: 18, usPreScore: 24, usPostScore: 22, mcapUsd: 2_100_000, rank: 2140, vol24hUsd: 95_000, priceUsd: 0.0004, change30d: -41.2, ageDays: 45 },
  { key: 'p19', name: 'Krypton Legacy', ticker: 'KRY', chain: 'Ethereum', category: 'Legacy', region: 'other', jurisdiction: 'BZ', source: 'closed', band: 'archive', euScore: 12, usPreScore: 10, usPostScore: 11, mcapUsd: 850_000, rank: 3020, vol24hUsd: 12_000, priceUsd: 0.09, change30d: -18.6, ageDays: 2600 },
  { key: 'p20', name: 'Echo Social', ticker: 'ECHO', chain: 'Base', category: 'SocialFi', region: 'eu', jurisdiction: 'ES', source: 'manual', band: 'archive', euScore: 22, usPreScore: 19, usPostScore: 20, mcapUsd: 1_600_000, rank: 2450, vol24hUsd: 60_000, priceUsd: 0.0071, change30d: -25.9, ageDays: 130 },
  // Generated half — same shape, wider spread of ages/sizes.
  gp('p21', 'Arclight Protocol', 'ARCL', 'Ethereum', 'DeFi', 'eu', 'DE', 'esma_main', 'immediate', 84, 61, 178, 196, 12.4, 2.31, 7.8, 540),
  gp('p22', 'Meridian Markets', 'MRDN', 'Arbitrum', 'Derivatives', 'us', 'US', 'top100', 'high', 66, 79, 240, 158, 22.1, 5.04, 11.2, 460),
  gp('p23', 'Basalt Finance', 'BSLT', 'Base', 'DeFi', 'eu', 'FR', 'pipeline', 'high', 77, 54, 96, 302, 6.1, 0.92, -3.4, 350),
  gp('p24', 'Corvus Chain', 'CRVS', 'Cosmos', 'Layer 1', 'other', 'SG', 'potential', 'nurture', 60, 49, 130, 246, 8.9, 1.44, 4.9, 880),
  gp('p25', 'Halcyon Pay', 'HCYN', 'Stellar', 'Payments', 'us', 'US', 'pre_tge', 'high', 58, 74, 88, 328, 4.2, 0.27, 19.3, 190),
  gp('p26', 'Ionis Network', 'IONS', 'Ethereum', 'Infrastructure', 'eu', 'NL', 'esma_casp', 'nurture', 63, 47, 52, 452, 2.8, 0.71, 2.1, 610),
  gp('p27', 'Kite Exchange', 'KITE', 'Solana', 'DEX', 'other', 'KY', 'top100', 'high', 69, 71, 205, 172, 18.6, 3.17, 8.8, 410),
  gp('p28', 'Ledgerline', 'LDGR', 'Ethereum', 'RWA', 'eu', 'LU', 'esma_main', 'nurture', 62, 41, 44, 512, 1.7, 9.85, 1.2, 760),
  gp('p29', 'Mosaic Yield', 'MOSC', 'Base', 'Yield', 'eu', 'IE', 'pipeline', 'nurture', 57, 43, 31, 630, 1.2, 1.63, -6.5, 420),
  gp('p30', 'Northwind Labs', 'NWND', 'Polygon', 'Gaming', 'us', 'US', 'potential', 'watch', 44, 56, 22, 748, 0.8, 0.041, 14.7, 260),
  gp('p31', 'Obsidian Vault', 'OBSD', 'Ethereum', 'RWA', 'eu', 'CH', 'esma_main', 'high', 76, 50, 112, 274, 5.4, 21.4, 3.3, 690),
  gp('p32', 'Pavo Oracle', 'PAVO', 'Multichain', 'Oracle', 'other', 'AE', 'pipeline', 'watch', 48, 39, 26, 702, 1.0, 0.58, -1.8, 500),
  gp('p33', 'Quill Identity', 'QILL', 'Base', 'Identity', 'eu', 'EE', 'esma_emt', 'nurture', 59, 42, 38, 566, 1.5, 0.83, 5.6, 330),
  gp('p34', 'Rivera Swap', 'RVRA', 'Solana', 'DEX', 'us', 'US', 'top100', 'high', 61, 73, 156, 214, 14.8, 1.12, 9.4, 380),
  gp('p35', 'Sable Credit', 'SABL', 'Ethereum', 'Lending', 'eu', 'LI', 'pipeline', 'immediate', 83, 60, 148, 222, 9.7, 4.46, 6.1, 470),
  gp('p36', 'Tundra Compute', 'TNDR', 'Cosmos', 'DePIN', 'other', 'SG', 'potential', 'watch', 46, 44, 19, 802, 0.7, 0.19, 24.5, 150),
  gp('p37', 'Umbra Wallet', 'UMBR', 'Ethereum', 'Wallet', 'eu', 'AT', 'esma_main', 'watch', 43, 33, 13, 940, 0.4, 0.62, -4.9, 580),
  gp('p38', 'Vireo Energy', 'VIRE', 'Polygon', 'RWA', 'eu', 'ES', 'esma_emt', 'nurture', 64, 45, 41, 538, 1.9, 2.07, 3.8, 290),
  gp('p39', 'Wavecrest', 'WAVE', 'Base', 'SocialFi', 'us', 'US', 'manual', 'watch', 39, 51, 17, 858, 0.6, 0.014, 12.2, 170),
  gp('p40', 'Xylem Data', 'XYLM', 'Arbitrum', 'AI', 'eu', 'FR', 'pre_tge', 'nurture', 55, 46, 29, 664, 1.3, 0.37, 17.9, 120),
  gp('p41', 'Yield Harbor', 'YHBR', 'Ethereum', 'Yield', 'eu', 'DE', 'esma_main', 'high', 74, 52, 84, 340, 4.6, 3.29, 2.7, 520),
  gp('p42', 'Zenith Custody', 'ZNTH', 'Ethereum', 'Custody', 'other', 'AE', 'pipeline', 'nurture', 58, 48, 47, 488, 2.1, 12.6, 0.9, 640),
  gp('p43', 'Alto Markets', 'ALTO', 'Solana', 'Derivatives', 'us', 'US', 'top100', 'high', 62, 75, 188, 182, 16.2, 2.58, 7.2, 430),
  gp('p44', 'Boreal Bridge', 'BRLB', 'Multichain', 'Bridge', 'other', 'KY', 'pipeline', 'watch', 45, 40, 24, 726, 0.9, 0.33, -7.1, 360),
  gp('p45', 'Cinder Games', 'CNDR', 'Polygon', 'Gaming', 'us', 'US', 'potential', 'nurture', 49, 58, 35, 596, 1.6, 0.052, 20.8, 240),
  gp('p46', 'Dorsa Privacy', 'DRSA', 'Ethereum', 'Privacy', 'eu', 'CH', 'esma_casp', 'watch', 41, 31, 15, 896, 0.5, 1.28, -2.6, 810),
  gp('p47', 'Ferrum Metals', 'FERM', 'Ethereum', 'RWA', 'eu', 'LU', 'esma_main', 'high', 72, 49, 76, 366, 3.8, 6.94, 4.4, 550),
  gp('p48', 'Gossamer AI', 'GSMR', 'Base', 'AI', 'us', 'US', 'pre_tge', 'nurture', 51, 63, 33, 612, 1.4, 0.24, 28.1, 110),
  gp('p49', 'Hyperion Staking', 'HYPR', 'Ethereum', 'Staking', 'eu', 'IE', 'esma_main', 'nurture', 60, 44, 42, 526, 2.0, 5.51, 1.6, 470),
  gp('p50', 'Isthmus Pay', 'ISTH', 'Stellar', 'Payments', 'other', 'SG', 'pipeline', 'high', 65, 68, 94, 316, 5.0, 0.45, 10.6, 280),
  gp('p51', 'Juniper Notes', 'JNPR', 'Ethereum', 'RWA', 'eu', 'LI', 'esma_emt', 'immediate', 81, 57, 122, 258, 7.2, 8.13, 5.3, 400),
  gp('p52', 'Kelvin Compute', 'KLVN', 'Arbitrum', 'DePIN', 'us', 'US', 'potential', 'watch', 42, 53, 21, 772, 0.8, 0.11, 15.4, 200),
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

const CURATED_PEOPLE: DemoPerson[] = [
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

const FIRST_NAMES = ['Amara', 'Lukas', 'Chiara', 'Mateo', 'Ingrid', 'Rafael', 'Yuki', 'Nadia', 'Owen', 'Freya', 'Diego', 'Hana', 'Viktor', 'Leila', 'Jonas', 'Zara', 'Felix', 'Maren', 'Tariq', 'Ines', 'Bruno', 'Alina', 'Stefan', 'Noor', 'Emil', 'Petra', 'Andrei', 'Lea', 'Marco', 'Selin', 'Oskar', 'Dana'];
const LAST_NAMES = ['Novak', 'Ferreira', 'Lindberg', 'Okafor', 'Tanaka', 'Kovacs', 'Marino', 'Haugen', 'Petrov', 'Silva', 'Weber', 'Dupont', 'Novotny', 'Berg', 'Costa', 'Aliyev', 'Fischer', 'Moreau', 'Janssen', 'Vargas', 'Keller', 'Sato', 'Bakker', 'Andersen', 'Ricci', 'Horvat', 'Nilsen', 'Fontana', 'Meyer', 'Demir', 'Larsen', 'Kraus'];
const TITLES: Array<[string, string]> = [
  ['CEO & Co-founder', 'founder'],
  ['Co-founder & CTO', 'founder'],
  ['Head of BD', 'bd'],
  ['COO', 'exec'],
  ['Head of Partnerships', 'bd'],
];

/** One contact per generated project (p21+), deterministic name/title/status. */
const GENERATED_PEOPLE: DemoPerson[] = PROJECTS.filter((p) => Number(p.key.slice(1)) >= 21).map((p, i) => {
  const r = rand(`person:${p.key}`);
  const [title, role] = TITLES[i % TITLES.length];
  const statuses: DemoPerson['emailStatus'][] = ['verified', 'valid_mx', 'valid_mx', 'unverified', 'invalid'];
  const emailStatus = statuses[Math.floor(r * statuses.length)];
  return {
    key: `pe${21 + i}`,
    projectKey: p.key,
    name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`,
    title,
    role,
    emailStatus,
    verified: emailStatus === 'verified',
    contactability: emailStatus === 'verified' ? 80 + Math.round(r * 15) : emailStatus === 'invalid' ? 8 + Math.round(r * 10) : 35 + Math.round(r * 40),
  };
});

const PEOPLE: DemoPerson[] = [...CURATED_PEOPLE, ...GENERATED_PEOPLE];

interface DemoDeal {
  key: string;
  projectKey: string;
  stage: DealStage;
  packageType: 'listing' | 'marketing' | 'liquidity' | 'dual' | 'emt' | 'custom';
  valueCents: number;
  createdDaysAgo: number;
  updatedDaysAgo: number;
  wonDaysAgo?: number;
  winReason?: string;
  lossReason?: string;
  lossCategory?: string;
}

const WIN_REASONS = [
  'Dual EU+US listing was the differentiator; MiCA-ready compliance package sealed it.',
  'Regulated-venue positioning won against two offshore competitors.',
  'EMT framework fit — legal team preferred the LI base prospectus route.',
  'Fastest compliance turnaround; token due diligence closed in 11 days.',
  'Liquidity program terms beat the incumbent market maker bundle.',
];
const LOSS_REASONS: Array<[string, string]> = [
  ['Signed with a larger competitor exchange offering fee waivers.', 'competitor'],
  ['Listing budget frozen until next funding round.', 'timing'],
  ['Fee structure above their ceiling; declined the revised proposal too.', 'pricing'],
  ['Legal opinion flagged the token pre-CLARITY — revisit after the transition window.', 'compliance'],
  ['Went quiet after the proposal; three follow-ups unanswered.', 'ghosted'],
  ['Chose a competitor bundling perps day-one.', 'competitor'],
  ['Deprioritized US expansion for 2026.', 'timing'],
];
const PACKAGE_TYPES: DemoDeal['packageType'][] = ['listing', 'listing', 'dual', 'liquidity', 'emt', 'marketing', 'custom'];

/** Power-law package value: most $15-80K, tail to ~$450K, rounded to $250. */
function dealValue(key: string): number {
  const r = rand(`value:${key}`);
  const usd = 15_000 + 435_000 * Math.pow(r, 2.2);
  return Math.round(usd / 250) * 250 * 100; // cents
}

/** 48 deals: 11 contacted · 9 discovery · 7 proposal · 5 negotiating · 9 won · 7 lost. */
const DEALS: DemoDeal[] = (() => {
  const plan: Array<[DealStage, number, [number, number]]> = [
    ['contacted', 11, [3, 25]],
    ['discovery', 9, [10, 45]],
    ['proposal', 7, [15, 70]],
    ['negotiating', 5, [25, 90]],
    ['won', 9, [40, 270]],
    ['lost', 7, [30, 270]],
  ];
  const out: DemoDeal[] = [];
  let projIdx = 0;
  let di = 0;
  for (const [stage, count, [minAge, maxAge]] of plan) {
    for (let i = 0; i < count; i++) {
      di += 1;
      const key = `d${String(di).padStart(2, '0')}`;
      const project = PROJECTS[projIdx % PROJECTS.length];
      projIdx += 1;
      const age = Math.round(minAge + rand(`age:${key}`) * (maxAge - minAge));
      // Most open deals touched recently; a few going quiet (drives real warnings).
      const staleRoll = rand(`stale:${key}`);
      const updatedDaysAgo =
        stage === 'won' || stage === 'lost'
          ? Math.round(age * 0.35)
          : staleRoll > 0.8
            ? 9 + Math.round(staleRoll * 10)
            : Math.round(staleRoll * 5);
      const deal: DemoDeal = {
        key,
        projectKey: project.key,
        stage,
        packageType: PACKAGE_TYPES[di % PACKAGE_TYPES.length],
        valueCents: dealValue(key),
        createdDaysAgo: age,
        updatedDaysAgo,
      };
      if (stage === 'won') {
        deal.wonDaysAgo = Math.max(2, Math.round(age * (0.2 + rand(`won:${key}`) * 0.4)));
        deal.winReason = WIN_REASONS[di % WIN_REASONS.length];
      }
      if (stage === 'lost') {
        const [reason, category] = LOSS_REASONS[di % LOSS_REASONS.length];
        deal.lossReason = reason;
        deal.lossCategory = category;
      }
      out.push(deal);
    }
  }
  return out;
})();

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
      [demoId(u.key), u.email, u.name, u.role],
    );
  }
  return n;
}

async function seedProjects(c: Client): Promise<number> {
  let n = 0;
  for (const p of PROJECTS) {
    const domain = `${p.ticker.toLowerCase()}.example`;
    n += await ins(
      c,
      `INSERT INTO projects (
         id, name, website, ticker, chain, source, jurisdiction, category, region,
         market_cap_usd, market_cap_rank, volume_24h_usd, price_usd, price_change_30d,
         token_age_days, last_enriched_at, name_key, domain, ticker_norm, raw, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16,$17,$18,$19,$20)
       ON CONFLICT DO NOTHING`,
      [
        demoId(p.key), p.name, `https://${domain}`, p.ticker, p.chain, p.source,
        p.jurisdiction, p.category, p.region,
        p.mcapUsd, p.rank, p.vol24hUsd, p.priceUsd, p.change30d, p.ageDays,
        squashEntity(p.name), domain, p.ticker.toLowerCase(),
        JSON.stringify({ demo: true, description: `${p.name} — ${p.category} project on ${p.chain}` }),
        daysAgo(30 + Math.round(rand(`created:${p.key}`) * 240)),
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
      { code: 'mcap', factor: 'Market cap', points: Math.min(25, Math.round(best / 4)), max: 25, note: `Market cap $${(p.mcapUsd / 1e6).toFixed(0)}M` },
      { code: 'volume', factor: '24h volume', points: Math.min(20, Math.round(best / 5)), max: 20, note: `24h volume $${(p.vol24hUsd / 1e6).toFixed(1)}M` },
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
        JSON.stringify([{ code: 'fit', factor: 'Listing fit', points: 10, max: 15, note: 'Category and venue fit signal' }]),
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
    const email = pe.emailStatus === 'invalid' ? `${slug}@bounced.example` : `${slug}@${proj.ticker.toLowerCase()}.example`;
    n += await ins(
      c,
      `INSERT INTO people (
         id, project_id, name, title, role, linkedin, email, email_status,
         telegram, verified, contactability_score, enriched_by, raw
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual','{"demo":true}'::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        demoId(pe.key), demoId(pe.projectKey), pe.name, pe.title, pe.role,
        `https://linkedin.com/in/${slug.replace(/\./g, '-')}`, email, pe.emailStatus,
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
    const isWon = d.stage === 'won';
    const isLost = d.stage === 'lost';
    const proj = PROJECTS.find((p) => p.key === d.projectKey)!;
    n += await ins(
      c,
      `INSERT INTO deals (
         id, project_id, stage, package_type, package_value, owner, notes,
         win_reason, loss_reason, loss_category, won_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,'operator',$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT DO NOTHING`,
      [
        demoId(d.key), demoId(d.projectKey), d.stage, d.packageType, d.valueCents,
        `${proj.name} — ${d.packageType} package`,
        d.winReason ?? null, d.lossReason ?? null, d.lossCategory ?? null,
        isWon && d.wonDaysAgo !== undefined ? daysAgo(d.wonDaysAgo) : null,
        daysAgo(d.createdDaysAgo), daysAgo(d.updatedDaysAgo),
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
  // Statuses: open | in_progress | resolved_won_path | resolved_lost | re_nurture.
  // Ages are deliberately mixed: most fresh, a couple aging, exactly ONE breached —
  // a wall of "BREACHED 283h" reads as a broken system, not a busy desk.
  const HANDOFFS = [
    { key: 'h01', projectKey: 'p01', personKey: 'pe01', channel: 'email', status: 'resolved_won_path', assignedTo: 'demo.sarah@lcx.com', summary: 'Elena replied positively to touch 2 — moved to deal desk, dual listing closed.', createdAt: daysAgo(12) },
    { key: 'h02', projectKey: 'p02', personKey: 'pe03', channel: 'email', status: 'in_progress', assignedTo: 'demo.nik@lcx.com', summary: 'Marta asked for the fee schedule and MiCA compliance details. Call booked.', createdAt: hoursAgo(0.4) },
    { key: 'h03', projectKey: 'p03', personKey: 'pe04', channel: 'email', status: 'open', assignedTo: null, summary: 'Jordan replied asking who handles US listings — needs an owner.', createdAt: hoursAgo(3.3) },
    { key: 'h04', projectKey: 'p07', personKey: 'pe10', channel: 'telegram', status: 'open', assignedTo: null, summary: 'Casey pinged back on Telegram — wants indicative liquidity terms.', createdAt: hoursAgo(1) },
    { key: 'h05', projectKey: 'p08', personKey: 'pe11', channel: 'linkedin', status: 'open', assignedTo: null, summary: 'Dmitri accepted the connection and asked for the listing overview deck.', createdAt: daysAgo(9) },
    { key: 'h06', projectKey: 'p04', personKey: 'pe06', channel: 'email', status: 'in_progress', assignedTo: 'demo.alex@lcx.com', summary: 'Hugo shared tokenomics docs; drafting the proposal response.', createdAt: hoursAgo(2.1) },
  ] as const;

  let n = 0;
  for (const h of HANDOFFS) {
    n += await ins(
      c,
      `INSERT INTO handoffs (id, project_id, person_id, channel, trigger_reason, status, assigned_to, summary, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'reply',$5,$6,$7,$8,NOW())
       ON CONFLICT DO NOTHING`,
      [demoId(h.key), demoId(h.projectKey), demoId(h.personKey), h.channel, h.status, h.assignedTo, h.summary, h.createdAt],
    );
    n += await ins(
      c,
      `INSERT INTO handoff_events (id, handoff_id, event_type, actor, content, new_status, created_at)
       VALUES ($1,$2,'created','system','Reply detected — sequence paused, handoff created','open',$3)
       ON CONFLICT DO NOTHING`,
      [demoId(`handoff_event:${h.key}:created`), demoId(h.key), h.createdAt],
    );
    if (h.status !== 'open') {
      n += await ins(
        c,
        `INSERT INTO handoff_events (id, handoff_id, event_type, actor, content, old_status, new_status, created_at)
         VALUES ($1,$2,'status_change',$3,$4,'open',$5,$6)
         ON CONFLICT DO NOTHING`,
        [
          demoId(`handoff_event:${h.key}:status`), demoId(h.key), h.assignedTo ?? 'operator',
          `Status moved to ${h.status}`, h.status, new Date(h.createdAt.getTime() + 3_600_000),
        ],
      );
    }
  }
  return n;
}

async function seedTasks(c: Client): Promise<number> {
  const TASKS = [
    { key: 't01', projectKey: 'p02', dealKey: 'd28', title: 'Send revised term sheet to Quantum Ledger', detail: 'Marta expects the updated fee schedule before Friday call.', status: 'open', dueAt: daysAgo(2), completedAt: null }, // overdue
    { key: 't02', projectKey: 'p03', dealKey: 'd21', title: 'Prepare EMT proposal deck for Solaris Finance', detail: 'Include MiCA EMT framework summary.', status: 'open', dueAt: daysFromNow(1), completedAt: null },
    { key: 't03', projectKey: 'p05', dealKey: 'd01', title: 'Intro call with Polar Chain BD team', detail: null, status: 'open', dueAt: daysFromNow(3), completedAt: null },
    { key: 't04', projectKey: 'p07', dealKey: null, title: 'Verify Lumen Pay contact emails', detail: 'Two contacts still unverified.', status: 'open', dueAt: daysFromNow(5), completedAt: null },
    { key: 't05', projectKey: 'p01', dealKey: 'd33', title: 'Kick off Nebula Protocol listing onboarding', detail: 'Won — start technical integration checklist.', status: 'done', dueAt: daysAgo(4), completedAt: daysAgo(1) },
    { key: 't06', projectKey: 'p04', dealKey: 'd12', title: 'Research AetherSwap tokenomics', detail: null, status: 'done', dueAt: daysAgo(7), completedAt: daysAgo(3) },
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
        t.title, t.detail, t.status, t.dueAt, t.completedAt,
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

interface DemoSeq {
  key: string;
  projectKey: string;
  personKey: string;
  status: string;
  currentStep: number;
  startedAt: Date;
  completedAt: Date | null;
  sentThrough: number;
}

async function seedSequences(c: Client): Promise<number> {
  const CURATED_SEQS: DemoSeq[] = [
    { key: 's01', projectKey: 'p07', personKey: 'pe10', status: 'active', currentStep: 2, startedAt: daysAgo(7), completedAt: null, sentThrough: 2 },
    { key: 's02', projectKey: 'p08', personKey: 'pe11', status: 'paused', currentStep: 1, startedAt: daysAgo(10), completedAt: null, sentThrough: 1 },
    { key: 's03', projectKey: 'p04', personKey: 'pe06', status: 'completed', currentStep: 5, startedAt: daysAgo(40), completedAt: daysAgo(5), sentThrough: 5 },
  ];

  // Historical outbound: 14 more sequences over ~6 months so sent volumes are
  // realistic. The desk sends far more than it receives — without these, the
  // reply-rate denominators collapse and every rate gets policy-suppressed.
  const GENERATED_SEQS: DemoSeq[] = Array.from({ length: 14 }, (_, i) => {
    const idx = 21 + i; // p21..p34 pair with pe21..pe34
    const startedDays = 15 + Math.round(rand(`seq:${idx}:start`) * 150);
    const sentThrough = 2 + Math.floor(rand(`seq:${idx}:sent`) * 4); // 2..5
    const done = sentThrough >= 5 || rand(`seq:${idx}:done`) > 0.4;
    return {
      key: `s${String(4 + i).padStart(2, '0')}`,
      projectKey: `p${idx}`,
      personKey: `pe${idx}`,
      status: done ? 'completed' : 'active',
      currentStep: sentThrough,
      startedAt: daysAgo(startedDays),
      completedAt: done ? daysAgo(Math.max(1, startedDays - 21)) : null,
      sentThrough,
    };
  });

  const SEQS = [...CURATED_SEQS, ...GENERATED_SEQS];

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
        JSON.stringify(buildSteps(proj.name, s.sentThrough)),
        s.currentStep, s.startedAt, s.completedAt,
      ],
    );

    // One sent-message record per sent step — this is what the KPI service
    // counts as outbound volume for reply rates.
    const person = PEOPLE.find((pe) => pe.key === s.personKey);
    const toEmail = person
      ? `${person.name.toLowerCase().replace(/[^a-z]+/g, '.')}@${proj.ticker.toLowerCase()}.example`
      : `bd@${proj.ticker.toLowerCase()}.example`;
    for (let t = 1; t <= s.sentThrough; t++) {
      n += await ins(
        c,
        `INSERT INTO messages (
           id, sequence_id, project_id, step_index, touch_index, to_email, to_name,
           subject, body, provider, status, sent_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'resend','sent',$10)
         ON CONFLICT DO NOTHING`,
        [
          demoId(`msg:${s.key}:${t}`), demoId(s.key), demoId(s.projectKey),
          t - 1, t, toEmail, person?.name ?? null,
          `LCX x ${proj.name} — touch ${t}`,
          `Follow-up ${t} on a potential LCX listing for ${proj.name}.`,
          new Date(s.startedAt.getTime() + (t - 1) * 4 * 86_400_000),
        ],
      );
    }
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
    { key: 'n01', rule: 'reply_received', title: 'Reply from Nebula Protocol', detail: 'Elena Marchetti replied to touch 2 — handoff created.', projectKey: 'p01', href: '/outreach', read: false },
    { key: 'n02', rule: 'deal_stalled', title: 'Quantum Ledger deal stalled', detail: 'No stage change in 14 days while negotiating.', projectKey: 'p02', href: '/deal-board', read: false },
    { key: 'n03', rule: 'competitor_listing', title: 'Vertex Yield listed elsewhere', detail: 'VRTX appeared on a competitor exchange feed.', projectKey: 'p06', href: `/bd-pipeline/${demoId('p06')}`, read: false },
    { key: 'n04', rule: 'discovery_found', title: 'New contacts found for Cobalt Network', detail: 'Contact discovery crawl found 2 new people.', projectKey: 'p09', href: `/bd-pipeline/${demoId('p09')}`, read: false },
    { key: 'n05', rule: 'deal_stalled', title: 'Solaris Finance proposal aging', detail: 'Proposal sent 9 days ago with no response.', projectKey: 'p03', href: '/deal-board', read: true },
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
  // One invoice per recent won deal: older ones paid, the freshest still out.
  const won = DEALS.filter((d) => d.stage === 'won').slice(0, 5);
  let n = 0;
  for (let i = 0; i < won.length; i++) {
    const d = won[i];
    const proj = PROJECTS.find((p) => p.key === d.projectKey)!;
    const status = i < 3 ? 'paid' : i === 3 ? 'sent' : 'overdue';
    const due = status === 'paid' ? daysAgo((d.wonDaysAgo ?? 10) - 14) : status === 'sent' ? daysFromNow(14) : daysAgo(6);
    n += await ins(
      c,
      `INSERT INTO invoices (id, deal_id, amount_cents, currency, status, due_date, line_items)
       VALUES ($1,$2,$3,'USD',$4,$5,$6)
       ON CONFLICT DO NOTHING`,
      [
        demoId(`inv:${d.key}`), demoId(d.key), d.valueCents, status, dateOnly(due),
        JSON.stringify([{ description: `${proj.name} — ${d.packageType} package`, amountCents: d.valueCents }]),
      ],
    );
  }
  return n;
}

async function seedKpiSnapshots(c: Client): Promise<number> {
  // 26 weekly snapshots (~6 months). Volumes grow gently with noise; reply
  // rates live in the realistic 10-20% band; won/revenue accumulate as the
  // won deals in DEALS close over the same window.
  const weeks = 26;
  let n = 0;
  for (let w = 0; w < weeks; w++) {
    const ago = 7 * (weeks - 1 - w); // oldest first
    const growth = 0.5 + (w / (weeks - 1)) * 0.5; // 0.5 → 1.0
    const jitter = (k: string) => 0.85 + rand(`kpi:${w}:${k}`) * 0.3;
    const emailSent = Math.round(42 * growth * jitter('es'));
    const emailReplied = Math.round(emailSent * (0.10 + rand(`kpi:${w}:er`) * 0.08));
    const liSent = Math.round(16 * growth * jitter('ls'));
    const liReplied = Math.round(liSent * (0.12 + rand(`kpi:${w}:lr`) * 0.10));
    // Cumulative wins/revenue as of this week, from the actual deal history.
    const wonSoFar = DEALS.filter((d) => d.stage === 'won' && (d.wonDaysAgo ?? 0) >= ago);
    const revListing = wonSoFar.filter((d) => d.packageType !== 'dual').reduce((s, d) => s + d.valueCents, 0);
    const revDual = wonSoFar.filter((d) => d.packageType === 'dual').reduce((s, d) => s + d.valueCents, 0);
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
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT DO NOTHING`,
      [
        demoId(`kpi:w${w}`), dateOnly(daysAgo(ago)),
        Math.round(4 + growth * 5 * jitter('leads')),
        emailSent, emailReplied, liSent, liReplied,
        Math.round(40 + rand(`kpi:${w}:h1`) * 30),
        Math.round(50 + rand(`kpi:${w}:h2`) * 40),
        Math.round(90 + rand(`kpi:${w}:h3`) * 70),
        Math.round(9 + growth * 8 * jitter('enr')),
        emailReplied + liReplied,
        Math.round(2 + growth * 4 * jitter('prop')),
        wonSoFar.length,
        revListing, revDual,
        JSON.stringify([
          { objection: 'pricing', count: 2 + Math.round(rand(`kpi:${w}:o1`) * 4) },
          { objection: 'timing', count: 1 + Math.round(rand(`kpi:${w}:o2`) * 3) },
          { objection: 'compliance scope', count: Math.round(rand(`kpi:${w}:o3`) * 3) },
        ]),
        Math.round(1 + rand(`kpi:${w}:st`) * 3),
        wonSoFar.length,
        Math.round(2 + rand(`kpi:${w}:hot`) * 3),
        Math.round(1 + rand(`kpi:${w}:std`) * 3),
        Math.round(rand(`kpi:${w}:ov`) * 3),
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
      `DELETE FROM people WHERE id = ANY($1::uuid[]) OR name LIKE $2 OR raw->>'demo' = 'true'`,
      [peopleIds, `${LEGACY_PREFIX}%`],
    );

    // Deleting demo projects cascades: scores, deals (→ deal_events, invoices),
    // handoffs (→ handoff_events), outreach_sequences (→ outreach_tasks), tasks, notifications, signals.
    const projectIds = PROJECTS.map((p) => demoId(p.key));
    const proj = await client.query(
      `DELETE FROM projects WHERE id = ANY($1::uuid[]) OR name LIKE $2 OR raw->>'demo' = 'true'`,
      [projectIds, `${LEGACY_PREFIX}%`],
    );

    const userIds = USERS.map((u) => demoId(u.key));
    const users = await client.query(
      `DELETE FROM users WHERE id = ANY($1::uuid[]) OR name LIKE $2 OR email LIKE 'demo.%@lcx.com'`,
      [userIds, `${LEGACY_PREFIX}%`],
    );

    // Current weekly keys + the two legacy daily keys from older seed versions.
    const kpiIds = [
      ...Array.from({ length: 26 }, (_, w) => demoId(`kpi:w${w}`)),
      demoId('k01'),
      demoId('k02'),
    ];
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

    console.log('\n🎬 LCX Demo Seed — deterministic, lived-in demo dataset');
    console.log(`  Database: ${DB_URL.replace(/\/\/.*@/, '//***@')}\n`);

    await section(pool, '3 demo users', seedUsers);
    await section(pool, `${PROJECTS.length} projects`, seedProjects);
    await section(pool, `${PROJECTS.length} scores (BD queue bands)`, seedScores);
    await section(pool, `${PEOPLE.length} contacts`, seedPeople);
    await section(pool, `${DEALS.length} deals + stage history`, seedDeals);
    await section(pool, '6 handoffs (mixed SLA ages) + events', seedHandoffs);
    await section(pool, '6 tasks (one overdue)', seedTasks);
    await section(pool, '3 sequences + 4 queue items', seedSequences);
    await section(pool, '5 notifications', seedNotifications);
    await section(pool, '5 invoices (paid/sent/overdue)', seedInvoices);
    await section(pool, '26 weekly KPI snapshots (~6 months)', seedKpiSnapshots);

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
