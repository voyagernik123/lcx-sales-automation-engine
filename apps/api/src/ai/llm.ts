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
 * WHAT SHAPE OF REQUEST A GIVEN ANTHROPIC MODEL ACCEPTS.
 *
 * This table is the whole reason this file is not a one-line `fetch`. The
 * Messages API is not one API across model generations: fields that are
 * required on one model are **rejected with a 400** on the next.
 *
 * THE DEFECT THIS FIXES, which was live and invisible. All twelve callers in
 * `ai/*.ts` pass `temperature` (0 … 0.6), and this client used to forward it
 * unconditionally. `ANTHROPIC_MODEL` defaulted to `claude-sonnet-5`, where a
 * non-default `temperature` is a 400 — as it is on Opus 5, Opus 4.8, Opus 4.7
 * and Fable 5. And `complete()` deliberately swallows a non-OK response so a
 * provider outage can never take a feature down. Those two behaviours compose
 * badly: setting ANTHROPIC_API_KEY would have 400'd *every* AI call, logged
 * `usedLlm:false`, and served the deterministic fallback. No error reaches the
 * operator. The only symptom is that the paid model appears to do nothing.
 *
 * So the mapping is explicit and per-model, and each field below is a 400
 * somewhere, not a preference:
 *   - `sampling`   — temperature/top_p/top_k are REMOVED on Opus 5 / 4.8 / 4.7
 *                    and Fable 5, and non-default values are rejected on
 *                    Sonnet 5. Still accepted on 4.6 and older.
 *   - `effort`     — `output_config.effort` errors on Sonnet 4.5 / Haiku 4.5.
 *   - `canDisableThinking` — `thinking:{type:'disabled'}` is a 400 on Fable 5 /
 *                    Mythos 5, where thinking is always on and cannot be
 *                    turned off. (On Opus 5 it is accepted only at effort
 *                    `high` or below — we only ever send `low`.)
 *   - `thinksByDefault` — omitting `thinking` still THINKS on Opus 5 and
 *                    Sonnet 5. `max_tokens` caps thinking **plus** answer
 *                    text, so a small budget truncates the answer to nothing.
 *                    `sentiment.ts` asks for 8 tokens; without the floor below
 *                    it would return an empty string on every call.
 */
interface AnthropicCaps {
  sampling: boolean;
  effort: boolean;
  canDisableThinking: boolean;
  thinksByDefault: boolean;
}

/**
 * Matched on the model ID because that is the only thing we have. An UNKNOWN
 * model gets the most conservative body we can send — no sampling, no effort,
 * no thinking field, and the token floor — because a field the model rejects
 * is a silent total failure (above) whereas an omitted field is merely a
 * default. New model IDs therefore degrade to "works, untuned" rather than
 * "appears to work, does nothing".
 */
export function anthropicCaps(model: string): AnthropicCaps {
  const m = model.trim().toLowerCase();
  const is = (...ids: string[]) => ids.some((id) => m === id || m.startsWith(`${id}-2`));

  // Thinking is permanent on these; asking for it off is a 400.
  if (is('claude-fable-5', 'claude-mythos-5', 'claude-mythos-preview')) {
    return { sampling: false, effort: true, canDisableThinking: false, thinksByDefault: true };
  }
  // Current generation: sampling params removed, full effort ladder.
  if (is('claude-opus-5', 'claude-sonnet-5')) {
    return { sampling: false, effort: true, canDisableThinking: true, thinksByDefault: true };
  }
  if (is('claude-opus-4-8', 'claude-opus-4-7')) {
    return { sampling: false, effort: true, canDisableThinking: true, thinksByDefault: false };
  }
  // 4.6 / 4.5 Opus: sampling still accepted, effort available.
  if (is('claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-5')) {
    return { sampling: true, effort: true, canDisableThinking: true, thinksByDefault: false };
  }
  // Effort errors on these two.
  if (is('claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1', 'claude-opus-4-0', 'claude-sonnet-4-0')) {
    return { sampling: true, effort: false, canDisableThinking: true, thinksByDefault: false };
  }
  return { sampling: false, effort: false, canDisableThinking: false, thinksByDefault: true };
}

/**
 * Room for the model to think AND still answer, used only when we cannot turn
 * thinking off. Every caller's own budget (8 … 800) was sized for answer text
 * alone, back when no model thought unless asked.
 */
const THINKING_TOKEN_FLOOR = 4096;

/**
 * Build the Messages API body for `model`. Pure and exported so the shape is
 * testable without a key or a network — `anthropicRequest.test.ts` asserts the
 * 400-triggering fields are absent per model, which is the only way this class
 * of defect gets caught before a bill.
 */
export function anthropicBody(
  prompt: string,
  opts: CompleteOpts,
  model: string,
): Record<string, unknown> {
  const caps = anthropicCaps(model);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
  };
  if (opts.system) body.system = opts.system;

  /* These features want short, strictly-shaped output — JSON objects, single
   * sentiment words, prose carrying [[s_id]] citation markers. A reasoning
   * preamble corrupts all three, which is not a guess: the OpenRouter branch
   * below carries a verified note that turning reasoning off is what made
   * strict-JSON and citation output come back clean. So we disable thinking
   * where the model allows it, and keep each caller's own tight token budget.
   *
   * Deliberately NOT paired with a "do not think" system-prompt instruction:
   * that INCREASES <thinking> tag leakage rather than suppressing it. Leakage
   * is handled after the fact, by stripping — see `stripLeakedThinking`. */
  if (caps.canDisableThinking) {
    body.thinking = { type: 'disabled' };
    // Must stay at `high` or below when thinking is disabled, or Opus 5 400s.
    // `low` is also simply correct for extraction-shaped work.
    if (caps.effort) body.output_config = { effort: 'low' };
    body.max_tokens = opts.maxTokens ?? 1024;
  } else {
    // Thinking will happen whether we ask for it or not, so the budget has to
    // cover it as well as the answer.
    body.max_tokens = Math.max(opts.maxTokens ?? 1024, THINKING_TOKEN_FLOOR);
  }

  if (caps.sampling && opts.temperature !== undefined) body.temperature = opts.temperature;
  return body;
}

/**
 * Remove a leaked reasoning block. With thinking disabled, current models can
 * occasionally emit `<thinking>…</thinking>` into the VISIBLE response; that is
 * a documented failure mode, not a hypothetical. Downstream this text is parsed
 * as JSON or shown to an operator, so a stray block breaks a feature outright.
 * Cheap to strip, and it cannot corrupt a well-formed answer.
 */
export function stripLeakedThinking(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<\/?(?:thinking|antml:thinking)>/gi, '')
    .trim();
}

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
          body: JSON.stringify(
            anthropicBody(prompt, opts, env.anthropicModel || 'claude-opus-5'),
          ),
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
        const json = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
          stop_reason?: string;
        };
        // `thinking` blocks are filtered out here, not just trimmed: on models
        // where thinking cannot be disabled they arrive alongside the answer.
        text = stripLeakedThinking(
          (json.content ?? [])
            .filter((b) => b.type === 'text' && typeof b.text === 'string')
            .map((b) => b.text as string)
            .join(''),
        );
        /* A refusal is an HTTP 200 with an empty or partial `content`, so the
         * ok-check above does not catch it. Left as a deterministic fallback
         * rather than surfaced: the caller has a real answer to fall back to,
         * and a refusal is not something the operator can act on. */
        if (json.stop_reason === 'refusal') {
          console.warn(`[ai] anthropic refused ${opts.feature}`);
          await logAiUsage(opts.feature, inChars, 0, false);
          return { text: '', usedLlm: false };
        }
      } else {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        // Same strip as the Anthropic branch: `reasoning:{enabled:false}` above
        // is a request, and open-weight reasoning models do not always honour it.
        text = stripLeakedThinking(json.choices?.[0]?.message?.content ?? '');
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
