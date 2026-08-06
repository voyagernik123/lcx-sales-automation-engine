import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { analyzeConversation } from '@lcx/shared';
import { honestyCeiling, HONESTY_CEILING_HEADER, parseCeilingHeader } from '../honesty.js';

/**
 * THE CEILING CORRUPTED A TRUE NUMBER ON A LIVE ROUTE. THIS PINS THE FIX.
 *
 * Found by an adversarial pass roughly an hour after `honestyCeiling()` was mounted globally.
 * `GET /v1/intel/conversation` returns `data.sentimentScore`, and `sentimentscore` is on the
 * forbidden list — so every 200 from that route had the number replaced by a refusal asserting
 * it was "inferred, proxied or invented". It was neither: `conversation.ts:76` computes it as
 * `Math.round(((pos - neg) / total) * 100)` over cue phrases matched in thread text the desk
 * owns, with `total = pos + neg` as an explicit denominator. The blocklist exists because the
 * X metrics have NO denominator. This one does.
 *
 * ── THE FIX I TRIED FIRST WAS WRONG, AND THE TESTS CAUGHT IT ─────────────────────
 * I scoped the middleware to the marketing compartment. That broke two things the existing
 * suite pins and was right to pin: `/v1/distribution/engines/channel-mix` must have its ordinal
 * `reach` EXEMPTED AND COUNTED rather than never walked, and `/v1/tasks/summary` — a desk-level
 * namespace with no compartment — must still refuse `followerCount`. Descoping seven
 * compartments to fix one field stops checking seven compartments.
 *
 * So the fix is the mechanism this file already had for exactly this: a shape-tested exemption.
 * The shape is the CENSUS — all six other ConversationInsights siblings — not the number,
 * because an integer in [-100,100] is not distinctive and a fabricated score would be one too.
 */

const app = () => {
  const a = new Hono();
  a.use('*', honestyCeiling());
  a.get('/v1/intel/conversation', (c) => c.json({ data: analyzeConversation('great, positive'), meta: {} }));
  // The same NAME and the same VALUE TYPE, without the census around it.
  a.get('/v1/marketing/fake', (c) => c.json({ data: { sentimentScore: 42 } }));
  // The census shape with one sibling missing — the exemption must not apply.
  a.get('/v1/intel/partial', (c) =>
    c.json({ data: { sentimentScore: 42, sentiment: 'positive', commitments: [], nextSteps: [], risks: [] } }));
  return a;
};

const counts = (res: Response) => {
  const reading = parseCeilingHeader(res.headers.get(HONESTY_CEILING_HEADER));
  return reading.kind === 'stated' ? reading.summary.counts : null;
};

describe('a sentiment score with a denominator is exempted, and a bare one is not', () => {
  it('lets INTEL keep its number, and COUNTS the exemption rather than staying silent', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await app().request('/v1/intel/conversation');
    const body = (await res.json()) as { data: { sentimentScore: unknown; sentiment: string } };
    spy.mockRestore();

    expect(typeof body.data.sentimentScore).toBe('number');
    expect(body.data.sentiment).toBe('positive');
    // Exempted, clean and refused are three states. This is the middle one, and it is stated.
    expect(counts(res)).toMatchObject({ refused: 0, seated: 0, exempted: 1 });
  });

  it('still refuses the same field name and value WITHOUT the census around it', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await app().request('/v1/marketing/fake');
    const body = (await res.json()) as { data: { sentimentScore: Record<string, unknown> } };
    spy.mockRestore();

    // This is what makes the exemption a shape test rather than a licence for the name.
    expect(typeof body.data.sentimentScore).toBe('object');
    expect(body.data.sentimentScore.code).toBeTruthy();
    expect(counts(res)).toMatchObject({ refused: 1, exempted: 0 });
  });

  it('refuses a NEARLY-complete census, so the sibling test is not decorative', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await app().request('/v1/intel/partial');
    const body = (await res.json()) as { data: { sentimentScore: Record<string, unknown> } };
    spy.mockRestore();

    // `objections` and `messageCount` are absent. All six or nothing — otherwise the
    // exemption could be obtained by scattering a few plausible sibling names.
    expect(typeof body.data.sentimentScore).toBe('object');
    expect(counts(res)).toMatchObject({ refused: 1, exempted: 0 });
  });

  it('refuses a census-shaped payload whose score is out of range', async () => {
    const a = new Hono();
    a.use('*', honestyCeiling());
    a.get('/v1/intel/x', (c) =>
      c.json({
        data: {
          sentimentScore: 5000,
          sentiment: 'positive', commitments: [], nextSteps: [], risks: [],
          objections: [], messageCount: 1,
        },
      }));
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await a.request('/v1/intel/x');
    const body = (await res.json()) as { data: { sentimentScore: unknown } };
    spy.mockRestore();
    // -100..100 is the range conversation.ts can produce. Outside it, the value did not come
    // from that computation, whatever the surrounding keys claim.
    expect(typeof body.data.sentimentScore).toBe('object');
  });
});
