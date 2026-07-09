import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v === 'yes';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? '',
  allowDbSkip: bool('ALLOW_DB_SKIP', false),
  operatorApiKey: required('OPERATOR_API_KEY', 'dev-operator-key-change-me'),
  corsOrigins: (process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://127.0.0.1:5173,https://lcx-sales-automation-engine.pages.dev')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  version: process.env.npm_package_version ?? '0.1.0',
} as const;

export type Env = typeof env;
