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
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
  /**
   * Provider precedence: Anthropic when its key is set (first-party quality),
   * else OpenRouter (free open-source fallback — default model NVIDIA
   * Nemotron 3 Ultra 550B at $0/token), else unavailable → deterministic paths.
   */
  private get provider(): 'anthropic' | 'openrouter' | null {
    if (env.anthropicApiKey) return 'anthropic';
    if (env.openrouterApiKey) return 'openrouter';
    return null;
  }

  /** True when any provider is configured. Callers can branch on this too. */
  get available(): boolean {
    return this.provider !== null;
  }

  /**
   * Returns { text, usedLlm }. When no key is set (or the call fails), returns
   * usedLlm:false so the caller keeps its deterministic result. Always logs.
   */
  async complete(prompt: string, opts: CompleteOpts): Promise<CompleteResult> {
    const inChars = prompt.length + (opts.system?.length ?? 0);
    const provider = this.provider;

    if (!provider) {
      await logAiUsage(opts.feature, inChars, 0, false);
      return { text: '', usedLlm: false };
    }

    try {
      let res: Response;
      if (provider === 'anthropic') {
        res = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': env.anthropicApiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: env.anthropicModel || 'claude-sonnet-5',
            max_tokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature ?? 0.4,
            ...(opts.system ? { system: opts.system } : {}),
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      } else {
        // OpenRouter — OpenAI-compatible chat completions.
        res = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env.openrouterApiKey}`,
            'x-title': 'LCX Sales Engine',
          },
          body: JSON.stringify({
            model: env.openrouterModel,
            max_tokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature ?? 0.4,
            // Reasoning models (e.g. Nemotron Ultra) otherwise spend the token
            // budget thinking out loud before the answer — verified live: with
            // this off, strict-JSON and [[id]]-citation outputs come back clean.
            // OpenRouter ignores the field for non-reasoning models.
            reasoning: { enabled: false },
            messages: [
              ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
              { role: 'user', content: prompt },
            ],
          }),
        });
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(`[ai] ${provider} ${res.status}: ${detail.slice(0, 200)}`);
        await logAiUsage(opts.feature, inChars, 0, false);
        return { text: '', usedLlm: false };
      }

      let text = '';
      if (provider === 'anthropic') {
        const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
        text = (json.content ?? [])
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string)
          .join('')
          .trim();
      } else {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        text = (json.choices?.[0]?.message?.content ?? '').trim();
      }

      await logAiUsage(opts.feature, inChars, text.length, true);
      return { text, usedLlm: true };
    } catch (err) {
      console.warn(`[ai] ${provider} call failed:`, err instanceof Error ? err.message : err);
      await logAiUsage(opts.feature, inChars, 0, false);
      return { text: '', usedLlm: false };
    }
  }
}

/** Shared singleton — one client for the whole process. */
export const llm = new LLMClient();
