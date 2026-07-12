/**
 * ONE gated LLM client for the whole engine.
 *
 * DESIGN RULE: every AI feature has a deterministic path that always works.
 * The LLM only ever *refines* that result. If ANTHROPIC_API_KEY is unset
 * (the default) `complete()` returns { text: '', usedLlm: false } immediately
 * and callers fall back to their deterministic output. Nothing here throws on
 * a missing key, so the engine compiles and runs with no key configured.
 *
 * Every call — LLM or fallback — is logged to ai_usage_log for cost/telemetry.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';

export interface CompleteOpts {
  /** Feature tag for usage logging (e.g. 'reply-drafts', 'sentiment'). */
  feature: string;
  /** Optional system prompt. */
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompleteResult {
  text: string;
  usedLlm: boolean;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Best-effort insert into ai_usage_log. Never throws: telemetry must not break
 * a feature. Silently no-ops when the DB is unavailable (dev without Postgres).
 */
export async function logAiUsage(
  feature: string,
  inChars: number,
  outChars: number,
  usedLlm: boolean,
): Promise<void> {
  if (!env.databaseUrl) return;
  try {
    const db = getDb();
    await db.execute(sql`
      INSERT INTO ai_usage_log (feature, input_chars, output_chars, used_llm)
      VALUES (${feature}, ${inChars}, ${outChars}, ${usedLlm})
    `);
  } catch (err) {
    // Telemetry is non-critical — log and move on.
    console.warn('[ai] usage log failed:', err instanceof Error ? err.message : err);
  }
}

export class LLMClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = env.anthropicApiKey ?? '';
    this.model = env.anthropicModel || 'claude-sonnet-5';
  }

  /** True when a real key is configured. Callers can branch on this too. */
  get available(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Returns { text, usedLlm }. When no key is set (or the call fails), returns
   * usedLlm:false so the caller keeps its deterministic result. Always logs.
   */
  async complete(prompt: string, opts: CompleteOpts): Promise<CompleteResult> {
    const inChars = prompt.length + (opts.system?.length ?? 0);

    if (!this.available) {
      await logAiUsage(opts.feature, inChars, 0, false);
      return { text: '', usedLlm: false };
    }

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: opts.maxTokens ?? 1024,
          temperature: opts.temperature ?? 0.4,
          ...(opts.system ? { system: opts.system } : {}),
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(`[ai] anthropic ${res.status}: ${detail.slice(0, 200)}`);
        await logAiUsage(opts.feature, inChars, 0, false);
        return { text: '', usedLlm: false };
      }

      const json = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (json.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('')
        .trim();

      await logAiUsage(opts.feature, inChars, text.length, true);
      return { text, usedLlm: true };
    } catch (err) {
      console.warn('[ai] anthropic call failed:', err instanceof Error ? err.message : err);
      await logAiUsage(opts.feature, inChars, 0, false);
      return { text: '', usedLlm: false };
    }
  }
}

/** Shared singleton — one client for the whole process. */
export const llm = new LLMClient();
