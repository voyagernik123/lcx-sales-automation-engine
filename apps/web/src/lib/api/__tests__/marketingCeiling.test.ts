import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE RUNTIME HALF OF THE HONESTY CEILING, ACTUALLY APPLIED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `observation.ts` opened with "THREE LAYERS GUARD THE CEILING, AND ONLY THE FIRST TWO ARE
 * PROOFS". Both of those two had ZERO production callers: `assertHonestPayload` appeared
 * only in its own tests, and `HonestFigures<T>` only in its own docblock. The paragraph was
 * describing a design, and a reader would have taken it as a description of the code.
 *
 * Layer 2 is now wired at the one place every marketing read passes through. These tests
 * assert it from the outside — mock the transport, hand back a payload carrying a banned
 * field, and require the read to FAIL rather than return it. The last test is the one that
 * matters most: it proves the guard is on the shared `unwrap` and not bolted onto one
 * fetcher, by exercising a different endpoint.
 */

const request = vi.fn();
vi.mock('../../apiClient', () => ({ request: (...a: unknown[]) => request(...a) }));

const api = await import('../marketing');

const envelope = (data: unknown) => Promise.resolve({ data, meta: { migrated: true } });

beforeEach(() => request.mockReset());

describe('a payload carrying a forbidden metric fails the read', () => {
  it('refuses `impressions` rather than handing it to a component', async () => {
    request.mockReturnValue(envelope([{ id: 1, impressions: 12_000 }]));
    await expect(api.fetchMarketingQueue()).rejects.toThrow(/cannot be observed without an X credential/);
  });

  it('carries the refusal code, so a surface can render the refusal rather than a stack', async () => {
    request.mockReturnValue(envelope({ counts: {}, shareOfVoice: 0.42 }));
    await expect(api.fetchMarketingSummary()).rejects.toMatchObject({ code: 'METRIC_NOT_OBSERVABLE' });
  });

  it('finds a banned field nested inside the payload', async () => {
    request.mockReturnValue(envelope({ counts: {}, panel: { tiles: [{ label: 'ok' }, { follower_delta: 3 }] } }));
    await expect(api.fetchMarketingSummary()).rejects.toThrow(/follower_delta/);
  });

  it('guards a DIFFERENT endpoint too, which is how we know it is on `unwrap`', async () => {
    request.mockReturnValue(envelope({ bundle: { engagement_rate: 0.031 } }));
    await expect(api.fetchExportBundle('item-1')).rejects.toThrow(/engagement_rate/);
  });
});

describe('it does not refuse the payloads the desk actually returns', () => {
  it('passes an ordinary queue read through unchanged', async () => {
    const rows = [{ id: 1, author_handle: 'someone', body: 'hi', posted_at: null }];
    request.mockReturnValue(envelope(rows));
    await expect(api.fetchMarketingQueue()).resolves.toEqual(rows);
  });

  it('passes `sentiment`, which is declared, never written, and not a banned name', async () => {
    // The ban is on a sentiment SCORE. A nullable column that nothing writes is not a
    // metric being claimed, and refusing it would break every queue read.
    const rows = [{ id: 1, sentiment: null }];
    request.mockReturnValue(envelope(rows));
    await expect(api.fetchMarketingQueue()).resolves.toEqual(rows);
  });

  it('passes the post-time coverage figures the panels now depend on', async () => {
    const s = { counts: { new: 120 }, postTimeCoverage: { openRows: 120, withPostTime: 50 } };
    request.mockReturnValue(envelope(s));
    await expect(api.fetchMarketingSummary()).resolves.toEqual(s);
  });
});
