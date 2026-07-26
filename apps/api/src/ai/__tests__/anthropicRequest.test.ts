import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anthropicBody, anthropicCaps, stripLeakedThinking } from '../llm.js';

/**
 * THE ANTHROPIC REQUEST SHAPE.
 *
 * The defect these tests exist for was live and silent. All twelve callers in
 * `ai/*.ts` pass `temperature`; `llm.ts` forwarded it unconditionally; and
 * `ANTHROPIC_MODEL` defaulted to a model where a non-default `temperature` is a
 * 400. Because `complete()` swallows non-OK responses on purpose (a provider
 * outage must not take a feature down), the result of setting an Anthropic key
 * would have been: every AI call 400s, every feature quietly serves its
 * deterministic fallback, and nothing anywhere says so.
 *
 * That is untestable through `complete()` — it returns the same
 * `{text:'', usedLlm:false}` for "no key", "400", and "network down". So the
 * body builder is pure and exported, and these assert the shape directly.
 *
 * Each assertion below corresponds to a documented 400, not a preference.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const AI_DIR = resolve(HERE, '..');

/** A representative caller: the JSON-extraction shape, low temperature. */
const OPTS = { feature: 'test', system: 'Be terse.', maxTokens: 600, temperature: 0.2 };

describe('models that reject sampling parameters never receive them', () => {
  // temperature/top_p/top_k are REMOVED on these; sending one is a 400.
  const REJECTS_SAMPLING = [
    'claude-opus-5',
    'claude-sonnet-5',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-fable-5',
    'claude-mythos-5',
  ];

  for (const model of REJECTS_SAMPLING) {
    it(`${model}: no temperature, even though the caller passed one`, () => {
      const body = anthropicBody('prompt', OPTS, model);
      expect(body.temperature).toBeUndefined();
      expect(body.top_p).toBeUndefined();
      expect(body.top_k).toBeUndefined();
      // The caller's intent is not silently dropped on the floor — the model
      // still gets the prompt and system prompt it asked for.
      expect(body.model).toBe(model);
      expect(body.system).toBe('Be terse.');
    });
  }

  it('the shipped default model is one of them — the exact live bug', () => {
    // If this ever flips to a sampling-accepting default the guard above stops
    // guarding the thing that actually broke.
    expect(anthropicCaps('claude-opus-5').sampling).toBe(false);
  });
});

describe('older models keep the per-feature temperature tuning', () => {
  // Twelve features tuned temperature from 0 (sentiment) to 0.6 (outreach).
  // Dropping it everywhere would be a real regression on models that accept it.
  for (const model of ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5']) {
    it(`${model}: forwards temperature`, () => {
      expect(anthropicBody('p', OPTS, model).temperature).toBe(0.2);
    });
  }

  it('omits temperature when the caller did not set one', () => {
    const body = anthropicBody('p', { feature: 'f' }, 'claude-sonnet-4-6');
    expect(body.temperature).toBeUndefined();
  });
});

describe('effort is only sent where it is accepted', () => {
  it('errors on Sonnet 4.5 / Haiku 4.5 — so it is absent', () => {
    expect(anthropicBody('p', OPTS, 'claude-haiku-4-5').output_config).toBeUndefined();
    expect(anthropicBody('p', OPTS, 'claude-sonnet-4-5').output_config).toBeUndefined();
  });

  it('never exceeds `high` while thinking is disabled — xhigh/max would 400', () => {
    for (const model of ['claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8']) {
      const body = anthropicBody('p', OPTS, model);
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.output_config).toEqual({ effort: 'low' });
    }
  });
});

describe('thinking, and the token budget that has to survive it', () => {
  it('Fable 5 gets no thinking field at all — disabling it is a 400 there', () => {
    const body = anthropicBody('p', OPTS, 'claude-fable-5');
    expect(body.thinking).toBeUndefined();
  });

  it('and is given room to think as well as answer', () => {
    // 600 tokens was sized for answer text alone, on a model that never thought
    // unless asked. Thinking is permanent here and shares the same cap.
    expect(anthropicBody('p', OPTS, 'claude-fable-5').max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it("sentiment's 8-token budget would return an empty answer without the floor", () => {
    // `sentiment.ts` asks for maxTokens: 8 — one word. On a model that thinks
    // by default and cannot be told not to, those 8 tokens go to thinking.
    const body = anthropicBody('classify', { feature: 'sentiment', maxTokens: 8 }, 'claude-fable-5');
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it('keeps the tight budget when thinking is genuinely off', () => {
    // The floor is not a blanket inflation: where we can disable thinking, each
    // caller's own budget is correct and cheaper.
    expect(anthropicBody('c', { feature: 'sentiment', maxTokens: 8 }, 'claude-opus-5').max_tokens)
      .toBe(8);
  });
});

describe('an unrecognised model gets the most conservative body we can send', () => {
  // A rejected field is a silent total failure; an omitted field is only an
  // untuned default. So an unknown ID degrades to "works" not "does nothing".
  const body = anthropicBody('p', OPTS, 'claude-something-7');

  it('sends no field that any current model rejects', () => {
    expect(body.temperature).toBeUndefined();
    expect(body.output_config).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });

  it('still assumes it thinks, and budgets for that', () => {
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it('is still a valid, answerable request', () => {
    expect(body.model).toBe('claude-something-7');
    expect(body.messages).toEqual([{ role: 'user', content: 'p' }]);
  });
});

describe('dated model IDs resolve to the same shape as their alias', () => {
  it('a -20260101-style suffix is not treated as an unknown model', () => {
    expect(anthropicCaps('claude-sonnet-4-6-20251114')).toEqual(anthropicCaps('claude-sonnet-4-6'));
  });

  it('and casing / stray whitespace do not change the shape', () => {
    expect(anthropicCaps('  Claude-Opus-5 ')).toEqual(anthropicCaps('claude-opus-5'));
  });
});

describe('leaked reasoning is stripped before anything parses the answer', () => {
  // Downstream this text is JSON.parse'd, or shown to an operator. With thinking
  // disabled, current models can still emit <thinking> into visible output.
  it('removes a full block', () => {
    expect(stripLeakedThinking('<thinking>weighing options</thinking>{"ok":true}')).toBe(
      '{"ok":true}',
    );
  });

  it('removes an unclosed or stray tag rather than leaving half of one', () => {
    expect(stripLeakedThinking('</thinking>the answer')).toBe('the answer');
  });

  it('leaves a clean answer byte-identical apart from trimming', () => {
    const clean = '1. **Ship escrow** [[s_payagent]]\n2. Publish docs';
    expect(stripLeakedThinking(`  ${clean}  `)).toBe(clean);
  });

  it('does not eat legitimate angle brackets or code', () => {
    expect(stripLeakedThinking('use `a < b && c > d` in the filter')).toBe(
      'use `a < b && c > d` in the filter',
    );
  });
});

/**
 * THE RATCHET. Everything above tests one function. None of it would notice a
 * NEW module calling the Messages API directly with its own hand-built body,
 * which is exactly how the original defect would come back.
 */
describe('the adapter cannot be bypassed', () => {
  it('llm.ts is the only file that talks to a model provider', () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(AI_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name === 'llm.ts') continue;
      const src = readFileSync(resolve(AI_DIR, entry.name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/api\.anthropic\.com|openrouter\.ai|['"]x-api-key['"]/.test(src)) {
        offenders.push(entry.name);
      }
    }
    expect(
      offenders,
      `route model calls through \`llm.complete()\` so the per-model request shape applies: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
