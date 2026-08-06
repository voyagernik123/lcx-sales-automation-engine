/**
 * F1 — THE HONESTY CEILING AS API MIDDLEWARE.
 *
 * WHAT WAS TRUE BEFORE THIS FILE. `assertHonestPayloadAll` had exactly one production
 * caller and it was a BROWSER module (`apps/web/src/lib/api/marketing.ts`), whose own
 * comment records that it previously had zero. So the doctrine — absent data refuses, and no
 * forbidden metric field name reaches a human — was enforced for whoever happened to import
 * one web helper, on one compartment, across 76 pages and 223 API files.
 *
 * These tests are about the two ways a server-side ceiling can be worse than no ceiling:
 *
 *   1. IT BREAKS A LIVE SURFACE. `GET /v1/notifications/stream` is Server-Sent Events;
 *      buffering or parsing it kills the notification bell for every operator. Three other
 *      routes answer with CSV, HTML/text and arbitrary client-document bytes. Every one of
 *      them must pass through untouched, and the gate that guarantees it is the RESPONSE
 *      content-type — never a guess from the path, never a sniff of the body.
 *   2. IT REFUSES CORRECT CODE. `reach` is on the blocklist and is ALSO the name of the
 *      RESIST 2 circulation ladder and of an ordinal 1-5 scoring dimension in the
 *      channel-mix matrix. The first mechanical `reach` check in this repo produced NINE
 *      false positives against correct code (`scripts/doctrine-lint.mjs` RULE 3 carries the
 *      post-mortem). Both live shapes are MUST-PASS cases below, written as the routes
 *      actually emit them rather than as a simplified stand-in.
 */
import { describe, expect, it, vi } from 'vitest';
import { Hono, type MiddlewareHandler } from 'hono';
import { streamSSE } from 'hono/streaming';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_PAYLOAD_DEPTH,
  NO_COMPARTMENT,
  DOCTRINE_CEILING_EXEMPTIONS,
  assertHonestPayload,
  assertHonestPayloadAll,
  walkHonestyCeiling,
} from '@lcx/shared';
import {
  HONESTY_CEILING_HEADER,
  NON_JSON_RESPONSE_SURFACES,
  honestyCeiling,
  honestyScope,
  isJsonResponse,
  parseCeilingHeader,
  seatRefusals,
  type CeilingCounts,
  type CeilingSummary,
} from '../honesty.js';

/* ── The harness ───────────────────────────────────────────────────────────────
 * A real Hono app with the middleware mounted the way the lead will mount it: `app.use('*')`
 * ahead of the routes. Nothing is mocked — the middleware's whole job is to interact
 * correctly with a real `Response`, and a mocked one would agree with any implementation. */

/** Console noise is the middleware's log channel; asserted where it matters, silenced here. */
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);

const appWith = (mount: (app: Hono) => void): Hono => {
  const app = new Hono();
  app.use('*', honestyCeiling());
  mount(app);
  return app;
};

/** One JSON route at `path`, answering `payload`. Returns the parsed body and the response. */
const jsonRead = async (path: string, payload: unknown) => {
  const app = appWith((a) => {
    a.get(path, (c) => c.json(payload));
  });
  const res = await app.request(path);
  return { res, body: (await res.json()) as Record<string, unknown> };
};

/**
 * The ceiling header, read through the four-state reader and ASSERTED to be a header this
 * middleware actually wrote.
 *
 * Every assertion below goes through this rather than through `parseCeilingHeader(...)?.field`,
 * because the old reader returned a fully-populated object for a header it did not recognise —
 * `compartment` defaulted to `NO_COMPARTMENT`, the counts to 0 — so a test could pass against a
 * missing or truncated header while appearing to assert on the response. `unreadable` fails
 * here instead.
 */
const statedCeiling = (res: Response): CeilingSummary => {
  const reading = parseCeilingHeader(res.headers.get(HONESTY_CEILING_HEADER));
  expect(reading, JSON.stringify(reading)).toMatchObject({ kind: 'stated' });
  return (reading as { kind: 'stated'; summary: CeilingSummary }).summary;
};

/** The counts, which exist only where a walk happened. `unparseable` has none — see below. */
const statedCounts = (res: Response): CeilingCounts => {
  const summary = statedCeiling(res);
  expect(summary.counts).not.toBeNull();
  return summary.counts as CeilingCounts;
};

/* ══════════════════════════════════════════════════════════════════════════════ */
/* 1. A FORBIDDEN FIELD NAME IS REFUSED, WITH CODE, RULE AND COMPARTMENT           */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('a forbidden metric field name is refused in place', () => {
  it('replaces the value with a refusal carrying code, rule and compartment', async () => {
    const spy = quiet();
    const { res, body } = await jsonRead('/v1/marketing/metrics', {
      data: { postId: 'p1', impressions: 12_000 },
    });
    spy.mockRestore();

    // THE RESPONSE STILL SUCCEEDS. A 500 here would take a live surface down over a field
    // name; the field is refused, not the response. See the argument in honesty.ts.
    expect(res.status).toBe(200);

    const refusal = (body.data as Record<string, unknown>).impressions as Record<string, unknown>;
    expect(refusal.code).toBe('METRIC_NOT_OBSERVABLE');
    // CITES THE RULE IT APPLIES — the provision, its text, and the path that violated it.
    expect((refusal.rule as Record<string, string>).provision).toBe('the honesty ceiling');
    expect((refusal.rule as Record<string, string>).text).toMatch(/no denominator|denominator that does not exist/i);
    expect(refusal.matched).toBe('data.impressions');
    // PER-COMPARTMENT: the refusal names whose payload it was.
    expect((refusal.scope as Record<string, string>).compartment).toBe('marketing');
    expect((refusal.scope as Record<string, string>).subject).toBe('GET /v1/marketing/metrics');

    // The number itself is gone, not merely annotated.
    expect(JSON.stringify(body)).not.toMatch(/12000/);
    // The field that was NOT forbidden is untouched.
    expect((body.data as Record<string, unknown>).postId).toBe('p1');
  });

  it('counts what it did on the response header', async () => {
    const spy = quiet();
    const { res } = await jsonRead('/v1/marketing/metrics', { data: { ctr: 0.4 } });
    spy.mockRestore();
    expect(statedCeiling(res).compartment).toBe('marketing');
    expect(statedCounts(res)).toEqual({ refused: 1, seated: 1, exempted: 0 });
  });

  it('logs the refusal so it is self-explaining without the response', async () => {
    const spy = quiet();
    await jsonRead('/v1/marketing/metrics', { data: { shareOfVoice: 0.9 } });
    const lines = spy.mock.calls.map((c) => c.join(' '));
    spy.mockRestore();
    expect(lines.some((l) => l.includes('[honesty]')
      && l.includes('METRIC_NOT_OBSERVABLE')
      && l.includes('data.shareOfVoice')
      && l.includes('marketing')
      && l.includes('the honesty ceiling'))).toBe(true);
  });

  it('marks a clean payload as walked-and-clean, which is not the same as un-walked', async () => {
    const { res, body } = await jsonRead('/v1/marketing/queue', {
      data: { repliesObserved: { kind: 'lower_bound', atLeast: 3 } },
    });
    expect(statedCounts(res)).toEqual({ refused: 0, seated: 0, exempted: 0 });
    expect(body).toEqual({ data: { repliesObserved: { kind: 'lower_bound', atLeast: 3 } } });
  });

  it('leaves a clean response body byte-for-byte identical', async () => {
    // Not re-serialised at all on the clean path: key order, unicode escaping and spacing
    // are whatever the handler emitted. A JSON.parse/stringify round trip would silently
    // reorder nothing here but WOULD re-escape, and a response the ceiling passed must be
    // the response the handler wrote.
    const raw = '{"z":1,"a":"caf\\u00e9","n":[1,2,3]}';
    const app = appWith((a) => {
      a.get('/v1/marketing/raw', () =>
        new Response(raw, { headers: { 'content-type': 'application/json' } }));
    });
    const res = await app.request('/v1/marketing/raw');
    expect(await res.text()).toBe(raw);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* 2. THE TWO LEGITIMATE `reach` SHAPES — MUST PASS                               */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the legitimate ordinal reach keeps flowing', () => {
  /**
   * The exact shape `POST /v1/distribution/engines/channel-mix` returns
   * (`routes/distribution.ts:107-121` -> `channelMix` -> `commandEngines.ts rescore`):
   * `reach` is a KEY inside `scores` holding an ordinal, and separately a VALUE of `dimKey`.
   */
  const CHANNEL_MIX = {
    data: {
      dimensions: [
        { key: 'reach', label: 'Reach', weight: 0.3 },
        { key: 'agentDensity', label: 'Agent density', weight: 0.3 },
        { key: 'cost', label: 'Cost efficiency', weight: 0.15 },
      ],
      rows: [
        {
          subjectId: 'galxe',
          subjectLabel: 'Galxe',
          scores: { reach: 3, agentDensity: 4, cost: 3, complianceRisk: 5, effort: 2 },
          weighted: 3.45,
          rank: 1,
        },
      ],
      sensitivity: [{ dimKey: 'reach', dimLabel: 'Reach', currentWeight: 0.3, flipWeight: null, gapPerHundredth: 0.01 }],
    },
  };

  it('passes the channel-mix matrix through untouched', async () => {
    const spy = quiet();
    const { res, body } = await jsonRead('/v1/distribution/engines/channel-mix', CHANNEL_MIX);
    spy.mockRestore();
    expect(body).toEqual(CHANNEL_MIX);
    expect(statedCeiling(res).compartment).toBe('distribution');
    // NOT SILENT. The exemption is counted, so "the ceiling let a `reach` through on a
    // stated shape test" is distinguishable from "the payload had no `reach`".
    expect(statedCounts(res)).toEqual({ refused: 0, seated: 0, exempted: 1 });
  });

  it('names which rule exempted it and where', () => {
    const reading = walkHonestyCeiling(CHANNEL_MIX, { exempt: DOCTRINE_CEILING_EXEMPTIONS });
    expect(reading.refusals).toEqual([]);
    expect(reading.exempted).toHaveLength(1);
    expect(reading.exempted[0]).toMatchObject({
      ruleId: 'REACH_ORDINAL_SCORE',
      name: 'reach',
      path: 'data.rows[0].scores.reach',
    });
  });

  it('does not exempt a number outside the ladder rank range', () => {
    // An audience figure hiding under a score set. The range is REACH_RANK's own, so this is
    // the shape that actually matters and it is refused.
    const codes = assertHonestPayloadAll(
      { data: { rows: [{ scores: { reach: 4_200_000 } }] } },
      { exempt: DOCTRINE_CEILING_EXEMPTIONS },
    ).map((r) => r.code);
    expect(codes).toEqual(['METRIC_NOT_OBSERVABLE']);
  });

  it('does not exempt a bare ordinal with no score-set parent', () => {
    // `observation.test.ts` pins `{ reach: 1 }` as a refusal for EVERY forbidden name. The
    // exemption must not falsify that, or the API and the browser would disagree about the
    // same payload.
    const codes = assertHonestPayloadAll({ reach: 3 }, { exempt: DOCTRINE_CEILING_EXEMPTIONS })
      .map((r) => r.code);
    expect(codes).toEqual(['METRIC_NOT_OBSERVABLE']);
  });

  it('does not exempt a non-integer or a stringified count', () => {
    for (const value of [2.5, 0, '3', '12k', null, true]) {
      const codes = assertHonestPayloadAll(
        { scores: { reach: value } },
        { exempt: DOCTRINE_CEILING_EXEMPTIONS },
      ).map((r) => r.code);
      expect(codes, JSON.stringify(value)).toEqual(['METRIC_NOT_OBSERVABLE']);
    }
  });
});

describe('the RESIST 2 ReachAssessment keeps flowing', () => {
  /** `types.ts:827` — `current` is a `Graded<ReachLevel>`. As `routes/marketingDesk.ts`
   *  parses it and as the triage reading echoes it back. */
  const ASSESSMENT = {
    data: {
      reach: {
        current: { value: 'trending', basis: 'two mainstream replies and a quoted thread', confidence: 'M' },
        previous: { value: 'filter_bubble', basis: 'yesterday, niche circulation only', confidence: 'M' },
        previousAt: '2026-08-05T09:00:00.000Z',
      },
      reachLadder: [{ level: 'trending', rank: 3, description: 'Trending: some discussion online', current: true }],
    },
  };

  it('passes a ReachAssessment through untouched', async () => {
    const spy = quiet();
    const { res, body } = await jsonRead('/v1/marketing/1/triage-reading', ASSESSMENT);
    spy.mockRestore();
    expect(body).toEqual(ASSESSMENT);
    expect(statedCounts(res)).toEqual({ refused: 0, seated: 0, exempted: 1 });
  });

  it('passes a bare ReachLevel through untouched', async () => {
    // `routes/marketingGates.ts:1457` reads `reach` back out of a stored assessment as the
    // bare level string. A level name is a member of a five-element enum, so no audience
    // count can be one.
    const spy = quiet();
    const { body } = await jsonRead('/v1/marketing/silence', {
      data: { priority: 'low', reach: 'little_interest', verifiability: 'unverifiable' },
    });
    spy.mockRestore();
    expect((body.data as Record<string, unknown>).reach).toBe('little_interest');
  });

  it('still walks INSIDE an exempted ReachAssessment', async () => {
    // An exemption is about the name `reach`, not about everything under it. The walker
    // descends into an exempted field precisely because its own keys have never been checked.
    const spy = quiet();
    const { body } = await jsonRead('/v1/marketing/1/triage-reading', {
      data: { reach: { current: { value: 'trending' }, impressions: 5_000 } },
    });
    spy.mockRestore();
    const inner = ((body.data as Record<string, unknown>).reach) as Record<string, unknown>;
    expect((inner.impressions as Record<string, unknown>).code).toBe('METRIC_NOT_OBSERVABLE');
    expect((inner.current as Record<string, unknown>).value).toBe('trending');
  });

  it('does not exempt a reach whose value is an arbitrary object', () => {
    const codes = assertHonestPayloadAll(
      { reach: { total: 4_200_000, unique: 3_100_000 } },
      { exempt: DOCTRINE_CEILING_EXEMPTIONS },
    ).map((r) => r.code);
    expect(codes).toEqual(['METRIC_NOT_OBSERVABLE']);
  });

  it('leaves `ReachAssessment`-adjacent names alone, because they were never banned', () => {
    // `reachAssessment`, `reachLadder`, `reachTrajectory`, `reachAtDecision`, `reachRank`,
    // `reachLevel` and `dimKey` normalise to nothing on the blocklist. This is pinned so a
    // future widening of the blocklist cannot quietly catch them.
    const payload = {
      ReachAssessment: { current: { value: 'trending' } },
      reachLadder: [], reachTrajectory: { kind: 'first_estimate' }, reachAtDecision: 'trending',
      reachRank: 3, reachLevel: 'trending', dimKey: 'reach',
    };
    expect(assertHonestPayloadAll(payload)).toEqual([]);
    expect(assertHonestPayloadAll(payload, { exempt: DOCTRINE_CEILING_EXEMPTIONS })).toEqual([]);
  });
});

describe('exemptions are off unless asked for', () => {
  it('the browser read path is unchanged — no options means no exemptions', () => {
    // `apps/web/src/lib/api/marketing.ts` passes no exemptions, so the marketing compartment's
    // browser ceiling behaves exactly as it did before this lane.
    expect(assertHonestPayloadAll({ scores: { reach: 3 } }).map((r) => r.code))
      .toEqual(['METRIC_NOT_OBSERVABLE']);
    expect(assertHonestPayloadAll({ reach: 'trending' }).map((r) => r.code))
      .toEqual(['METRIC_NOT_OBSERVABLE']);
  });

  it('every exemption rule is a shape test on exactly one name', () => {
    // There is deliberately no way to exempt a NAME without a shape test — "exempt
    // impressions on this route" is how a blocklist becomes a formality.
    for (const rule of DOCTRINE_CEILING_EXEMPTIONS) {
      expect(rule.normalisedName).toBe('reach');
      expect(typeof rule.matches).toBe('function');
      expect(rule.because.length).toBeGreaterThan(40);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* 3. NON-JSON BODIES PASS THROUGH UNTOUCHED                                      */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the SSE stream is not touched', () => {
  it('passes text/event-stream through byte-for-byte, forbidden names included', async () => {
    // The real surface: `hono/streaming`'s streamSSE, the same helper
    // `routes/notifications.ts:53` uses. The payload deliberately CONTAINS a forbidden name,
    // so a middleware that inspected the body rather than the content-type would rewrite it
    // and this would fail.
    const app = appWith((a) => {
      a.get('/v1/notifications/stream', (c) =>
        streamSSE(c, async (stream) => {
          await stream.writeSSE({ event: 'connected', data: JSON.stringify({ ok: true }) });
          await stream.writeSSE({ event: 'notification', data: JSON.stringify({ impressions: 1 }) });
        }));
    });
    const res = await app.request('/v1/notifications/stream');
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const text = await res.text();
    expect(text).toBe(
      'event: connected\ndata: {"ok":true}\n\n'
      + 'event: notification\ndata: {"impressions":1}\n\n',
    );
    // No header, which is the proof the middleware returned before it looked at the body.
    // A `refused=0` header here would mean it HAD buffered the stream.
    expect(res.headers.get(HONESTY_CEILING_HEADER)).toBeNull();
  });

  it('leaves the stream a stream — the body is not replaced by a buffered copy', async () => {
    const app = appWith((a) => {
      a.get('/v1/notifications/stream', (c) =>
        streamSSE(c, async (stream) => {
          await stream.writeSSE({ event: 'ping', data: '{"at":1}' });
        }));
    });
    const res = await app.request('/v1/notifications/stream');
    expect(res.body).not.toBeNull();
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('event: ping');
    await reader.cancel();
  });
});

describe('every other non-JSON body passes through untouched', () => {
  /** Each case names the live route it stands for. `body` carries a forbidden name where the
   *  format allows, so content-type gating is what is under test, not body sniffing. */
  const CASES = [
    { what: 'CSV export (GET /v1/kpis/export)', type: 'text/csv', body: 'metric,value\nimpressions,12000\n' },
    { what: 'plain text (GET /v1/outreach/unsubscribe, invalid link)', type: 'text/plain;charset=UTF-8', body: 'Invalid unsubscribe link.' },
    { what: 'HTML (GET /v1/outreach/unsubscribe)', type: 'text/html; charset=UTF-8', body: '<!doctype html><p>impressions</p>' },
    { what: 'client artifact bytes (GET /v1/gps/artifacts/:id/content)', type: 'application/pdf', body: '%PDF-1.7 impressions' },
    { what: 'a body with no content-type at all', type: null, body: '{"impressions":1}' },
  ] as const;

  it.each(CASES)('$what', async ({ type, body }) => {
    const app = appWith((a) => {
      a.get('/v1/anything', () =>
        new Response(body, { headers: type === null ? {} : { 'content-type': type } }));
    });
    const res = await app.request('/v1/anything');
    expect(await res.text()).toBe(body);
    expect(res.headers.get(HONESTY_CEILING_HEADER)).toBeNull();
  });

  it('a bodyless response is not reported as JSON that failed to parse', async () => {
    // A 204 or a HEAD reply has no body. `JSON.parse('')` throws, so the naive path would log
    // "declared JSON and did not parse" and stamp `unparseable` on every one of them — which
    // is a false statement about the response and noise in the log the refusals live in.
    // Nothing was inspected, so there is no header: that IS the not-inspected state.
    const spy = quiet();
    const app = appWith((a) => {
      a.get('/v1/marketing/empty', (c) => {
        c.header('content-type', 'application/json');
        return c.body(null, 204);
      });
    });
    const res = await app.request('/v1/marketing/empty');
    const lines = spy.mock.calls.map((cl) => cl.join(' ')).filter((l) => l.includes('[honesty]'));
    spy.mockRestore();
    expect(res.status).toBe(204);
    expect(res.headers.get(HONESTY_CEILING_HEADER)).toBeNull();
    expect(lines).toEqual([]);
  });

  it('a body that claims JSON and is not is put back exactly as it was', async () => {
    // Not a hypothetical: any hand-built `new Response(bytes, {'content-type':'application/json'})`
    // could do this. The honest answer is to leave it alone and say the ceiling did not run.
    const spy = quiet();
    const app = appWith((a) => {
      a.get('/v1/marketing/broken', () =>
        new Response('not json at all', { headers: { 'content-type': 'application/json' } }));
    });
    const res = await app.request('/v1/marketing/broken');
    spy.mockRestore();
    expect(await res.text()).toBe('not json at all');
    const summary = statedCeiling(res);
    expect(summary.state).toBe('unparseable');
    // AND IT STATES NO COUNTS. `refused=0` on this header would be three measurements about a
    // body that was never read, in the same field whose 0 means "walked and clean". The header
    // must carry the state and the compartment and nothing numeric.
    expect(summary.counts).toBeNull();
    expect(res.headers.get(HONESTY_CEILING_HEADER)).not.toMatch(/refused|seated|exempted/);
  });
});

describe('isJsonResponse — the gate itself', () => {
  it.each([
    ['application/json', true],
    ['application/json; charset=UTF-8', true],
    ['APPLICATION/JSON', true],
    ['  application/json  ', true],
    ['text/event-stream', false],
    ['text/csv', false],
    ['text/plain;charset=UTF-8', false],
    ['text/html; charset=UTF-8', false],
    ['application/pdf', false],
    // Deliberately NOT matched. Nothing in this API emits a `+json` subtype, and widening the
    // gate on speculation is how a stream ends up inside it.
    ['application/problem+json', false],
    ['application/vnd.api+json', false],
    ['', false],
    [null, false],
  ])('%s -> %s', (type, expected) => {
    expect(isJsonResponse(type)).toBe(expected);
  });
});

describe('the non-JSON enumeration is the real one', () => {
  /**
   * A COVERAGE PIN, not a list in a comment. `middleware/workspace.ts` records what happens
   * when a hand-written prefix list drifts from the routes it claims to describe; the same
   * failure here means the lead mounts the middleware believing three routes are non-JSON
   * when there are four. So the enumeration is checked against the source.
   */
  const API_SRC = join(__dirname, '..', '..');
  /** `new Response(` is included: it is how a handler emits a body Hono has no helper for,
   *  and a future one placed outside `routes/` would otherwise dodge this pin entirely. */
  const EMITTERS = /\bc\.text\(|\bc\.html\(|\bc\.body\(|\bstreamSSE\(|\bnew Response\(/;

  /** Every .ts under apps/api/src except tests and the middleware's own file. */
  const sources = (dir: string, out: string[] = [], prefix = ''): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'migrations') continue;
        sources(join(dir, entry.name), out, rel);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
      out.push(rel);
    }
    return out;
  };

  it('names four surfaces, and every one of them is a real emitter', () => {
    expect(NON_JSON_RESPONSE_SURFACES).toHaveLength(4);
    for (const surface of NON_JSON_RESPONSE_SURFACES) {
      const src = readFileSync(join(API_SRC, surface.file), 'utf8');
      expect(EMITTERS.test(src), surface.file).toBe(true);
    }
  });

  it('nothing in apps/api/src emits a non-JSON body without being enumerated', () => {
    const declared = new Set<string>([
      ...NON_JSON_RESPONSE_SURFACES.map((s) => s.file),
      // This middleware itself constructs the rewritten JSON Response. It is the inspector,
      // not an emitter of a non-JSON body, and it is the file the enumeration lives in.
      'middleware/honesty.ts',
    ]);
    const missing: string[] = [];
    for (const rel of sources(API_SRC)) {
      const src = readFileSync(join(API_SRC, rel), 'utf8')
        // Strip line and block-comment lines, so `c.text(` inside prose is not an emitter.
        .replace(/^\s*(?:\/\/|\*|\/\*).*$/gm, '');
      if (EMITTERS.test(src) && !declared.has(rel)) missing.push(rel);
    }
    expect(missing).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* 4. EVERY REFUSAL, NOT THE FIRST                                                */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('every refusal is returned, not the first one found', () => {
  it('seats a refusal at every offending path in one pass', async () => {
    const spy = quiet();
    const { res, body } = await jsonRead('/v1/marketing/metrics', {
      data: {
        ctr: 0.031,
        sov: 0.42,
        tiles: [{ label: 'A', impressions: 900 }, { label: 'B', engagement_rate: 0.1 }],
      },
    });
    spy.mockRestore();

    const data = body.data as Record<string, unknown>;
    const tiles = data.tiles as Record<string, unknown>[];
    for (const at of [data.ctr, data.sov, tiles[0]!.impressions, tiles[1]!.engagement_rate]) {
      expect((at as Record<string, unknown>).code).toBe('METRIC_NOT_OBSERVABLE');
    }
    // The house pattern: four findings, four refusals — not one 422 about the first one.
    expect(statedCounts(res)).toMatchObject({ refused: 4, seated: 4 });
    // Every path is named, so a log reader can delete four fields in one pass rather than
    // discovering them one deploy at a time.
    const matched = [data.ctr, data.sov, tiles[0]!.impressions, tiles[1]!.engagement_rate]
      .map((r) => (r as Record<string, unknown>).matched);
    expect(matched).toEqual([
      'data.ctr', 'data.sov', 'data.tiles[0].impressions', 'data.tiles[1].engagement_rate',
    ]);
  });

  it('logs one line per refusal', async () => {
    const spy = quiet();
    await jsonRead('/v1/marketing/metrics', { data: { ctr: 1, sov: 2, views: 3 } });
    const lines = spy.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('[honesty]'));
    spy.mockRestore();
    expect(lines).toHaveLength(3);
  });

  it('a clean payload with an exemption logs nothing at all', async () => {
    // A `[honesty]` log line must always mean something is WRONG. An exemption on the
    // channel-mix surface is correct and happens on every call to it; logging it per request
    // would bury the refusals in expected noise. The header's `exempted=N` is the channel for
    // the count, on every response, machine-readable.
    const spy = quiet();
    const { res } = await jsonRead('/v1/distribution/mix', {
      data: { rows: [{ scores: { reach: 4, cost: 3 } }] },
    });
    const lines = spy.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('[honesty]'));
    spy.mockRestore();
    expect(lines).toEqual([]);
    expect(statedCounts(res).exempted).toBe(1);
  });

  it('but a refused payload logs what else it let through in the same body', async () => {
    // Once a reader is looking at a refusal, the other banned names the ceiling ALLOWED in
    // the same payload are the next thing they need. That is context for an investigation,
    // not routine noise.
    const spy = quiet();
    await jsonRead('/v1/distribution/mix', {
      data: { rows: [{ scores: { reach: 4 }, impressions: 900 }] },
    });
    const lines = spy.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('[honesty]'));
    spy.mockRestore();
    expect(lines.some((l) => l.includes('METRIC_NOT_OBSERVABLE'))).toBe(true);
    expect(lines.some((l) => l.includes('EXEMPT REACH_ORDINAL_SCORE'))).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* 5. NO COMPARTMENT IS A STATED CASE                                             */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('a request with no compartment states that rather than skipping', () => {
  it('still refuses, and says the namespace belongs to no compartment', async () => {
    const spy = quiet();
    // `/v1/tasks` is desk-level: `app.ts` mounts no `requireWorkspace` for it, so
    // `workspaceForApiPath` answers null. That is a fact about the API, not a lookup failure.
    const { res, body } = await jsonRead('/v1/tasks/summary', { data: { followerCount: 4 } });
    spy.mockRestore();

    const refusal = (body.data as Record<string, unknown>).followerCount as Record<string, unknown>;
    expect(refusal.code).toBe('METRIC_NOT_OBSERVABLE');
    const scope = refusal.scope as Record<string, string>;
    expect(scope.compartment).toBe(NO_COMPARTMENT);
    // `derivedFrom` names the mechanism, so the value can be checked rather than believed.
    expect(scope.derivedFrom).toMatch(/workspaceForApiPath/);
    expect(statedCeiling(res).compartment).toBe(NO_COMPARTMENT);
  });

  it('derives the compartment from the workspace table and nowhere else', () => {
    // One notion of compartment. `honestyScope` calls `workspaceForApiPath`, which is built
    // from the same `WORKSPACES[].apiPrefixes` the gate loop in `app.ts` iterates.
    expect(honestyScope('GET', '/v1/marketing/queue').compartment).toBe('marketing');
    expect(honestyScope('GET', '/v1/gps/book').compartment).toBe('gps');
    expect(honestyScope('POST', '/v1/distribution/engines/channel-mix').compartment).toBe('distribution');
    expect(honestyScope('GET', '/v1/deals/board').compartment).toBe('sales');
    expect(honestyScope('GET', '/v1/notifications').compartment).toBe(NO_COMPARTMENT);
    expect(honestyScope('GET', '/health').compartment).toBe(NO_COMPARTMENT);
  });

  it('carries the method and path as the subject, so a log line identifies the response', () => {
    expect(honestyScope('POST', '/v1/marketing/1/triage').subject)
      .toBe('POST /v1/marketing/1/triage');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* 6. THE PART OF THE PAYLOAD THE WALK NEVER READ                                 */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('a payload deeper than the ceiling walks is refused, not passed through unread', () => {
  /** 34 rungs of `{ a: … }` over a banned name, i.e. two past `MAX_PAYLOAD_DEPTH`. */
  const tooDeep = (leaf: unknown): unknown => {
    let node = leaf;
    for (let i = 0; i <= MAX_PAYLOAD_DEPTH + 1; i += 1) node = { a: node };
    return node;
  };

  /** The depth refusal the middleware seated, found by searching the body rather than by
   *  counting rungs — so a test does not encode the arithmetic it is checking. */
  const seatedDepthRefusal = (body: unknown): Record<string, unknown> | null => {
    if (body === null || typeof body !== 'object') return null;
    const obj = body as Record<string, unknown>;
    if (obj.code === 'PAYLOAD_TOO_DEEP_TO_VERIFY') return obj;
    for (const value of Array.isArray(obj) ? obj : Object.values(obj)) {
      const hit = seatedDepthRefusal(value);
      if (hit !== null) return hit;
    }
    return null;
  };

  it('replaces the unread sub-tree with the depth refusal, so no raw value survives it', async () => {
    /*
     * THE DEFECT THIS PINS, because it shipped: the first version of the middleware left this
     * finding unseated on the grounds that a SHAPE finding has no field to replace. The
     * consequence, which the report did not state, was that `impressions: 4_200_000` at depth
     * 34 reached the client with its raw value and the body carried no refusal of any kind —
     * only a header count, on a header that is not CORS-exposed and so unreadable by any
     * browser. The sub-tree the walk never read is now refused in place.
     */
    const spy = quiet();
    const { res, body } = await jsonRead('/v1/marketing/deep', tooDeep({ impressions: 4_200_000 }));
    const lines = spy.mock.calls.map((c) => c.join(' '));
    spy.mockRestore();

    // The fabricated number is GONE from the response. This is the assertion the old test
    // could not have made, because the number was still there.
    expect(JSON.stringify(body)).not.toMatch(/4200000/);

    const refusal = seatedDepthRefusal(body);
    expect(refusal).not.toBeNull();
    // It names its own path and cites the rule, like every other refusal this file seats: the
    // node it replaced is the first one past the limit, 33 rungs down.
    expect(refusal!.matched).toBe(Array(MAX_PAYLOAD_DEPTH + 1).fill('a').join('.'));
    expect((refusal!.rule as Record<string, string>).provision).toMatch(/honesty ceiling/);
    expect((refusal!.scope as Record<string, string>).compartment).toBe('marketing');
    expect(statedCounts(res)).toMatchObject({ refused: 1, seated: 1 });
    expect(lines.some((l) => l.includes('PAYLOAD_TOO_DEEP_TO_VERIFY'))).toBe(true);
  });

  it('seats every depth refusal it reports — `seated < refused` is now a divergence, not a limit', async () => {
    // Two independent over-deep branches under one node: two refusals, two seats. A shortfall
    // here would mean the seating traversal and the walker disagree about depth.
    const spy = quiet();
    const { res, body } = await jsonRead('/v1/marketing/deep', {
      left: tooDeep({ impressions: 1 }),
      right: tooDeep({ ctr: 1 }),
      shallow: { ok: 1 },
    });
    spy.mockRestore();
    expect(statedCounts(res)).toMatchObject({ refused: 2, seated: 2 });
    /* AND BOTH SEATS ARE THE DEPTH REFUSAL. The counts alone are not a barrier here: a seater
       that descended past the bound would find the two banned FIELDS instead and report
       `seated: 2` as well — two seats for two refusals about different nodes. So the class is
       asserted, and the absence of a field refusal with it. */
    expect(seatedDepthRefusal(body.left)).not.toBeNull();
    expect(seatedDepthRefusal(body.right)).not.toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/METRIC_NOT_OBSERVABLE/);
    // Everything the walk DID read arrives unchanged — the refusal is scoped to the unread part.
    expect((body.shallow as Record<string, unknown>)).toEqual({ ok: 1 });
  });

  it('seats a depth refusal that sits under an array rung', async () => {
    const spy = quiet();
    const { res, body } = await jsonRead('/v1/marketing/deep', { rows: [tooDeep({ sov: 1 })] });
    spy.mockRestore();
    expect(statedCounts(res)).toMatchObject({ refused: 1, seated: 1 });
    const refusal = seatedDepthRefusal(body.rows);
    expect(refusal).not.toBeNull();
    expect(refusal!.matched).toMatch(/^rows\[0\](\.a)+$/);
  });

  it('a payload exactly AT the limit is walked normally and not refused', async () => {
    // The barrier is `depth > MAX_PAYLOAD_DEPTH`. A shape that reaches exactly the limit is
    // fully read, so its banned name is refused as a FIELD, not swallowed by a depth refusal.
    let deep: unknown = { impressions: 1 };
    for (let i = 0; i < MAX_PAYLOAD_DEPTH; i += 1) deep = { a: deep };
    const spy = quiet();
    const { res, body } = await jsonRead('/v1/marketing/deep', deep);
    const lines = spy.mock.calls.map((c) => c.join(' '));
    spy.mockRestore();
    expect(statedCounts(res)).toMatchObject({ refused: 1, seated: 1 });
    expect(lines.some((l) => l.includes('PAYLOAD_TOO_DEEP_TO_VERIFY'))).toBe(false);
    let node = body as Record<string, unknown>;
    for (let i = 0; i < MAX_PAYLOAD_DEPTH; i += 1) node = node.a as Record<string, unknown>;
    expect((node.impressions as Record<string, unknown>).code).toBe('METRIC_NOT_OBSERVABLE');
  });

  it('the browser layer still refuses the rewritten body, with the depth code', async () => {
    /* Pins the sentence in `apps/web/src/lib/api/marketing.ts`. For a FIELD refusal the banned
       NAME survives the server rewrite, so the browser's `assertHonestPayload` still throws
       `METRIC_NOT_OBSERVABLE`. For the too-deep class the name goes with the sub-tree, and the
       claim is that the browser walk runs out of depth at the same node — a different code and
       the same outcome. Asserted rather than reasoned about, because the two layers'
       independence is the whole argument for having both. */
    const spy = quiet();
    const deepRead = await jsonRead('/v1/marketing/deep', tooDeep({ impressions: 4_200_000 }));
    const fieldRead = await jsonRead('/v1/marketing/metrics', { data: { impressions: 1 } });
    spy.mockRestore();

    expect(assertHonestPayload(deepRead.body)?.code).toBe('PAYLOAD_TOO_DEEP_TO_VERIFY');
    expect(assertHonestPayload(fieldRead.body)?.code).toBe('METRIC_NOT_OBSERVABLE');
  });

  it('the walker and the seating pass agree on the node, the path and the sentence', () => {
    // One arithmetic and ONE STRING, checked directly rather than inferred from the counts.
    // Both callers build the refusal through `payloadTooDeepRefusal`, so the sentence in the
    // log and the sentence in the response body cannot drift apart.
    const payload = tooDeep({ impressions: 1 });
    const walked = walkHonestyCeiling(payload, {}).refusals;
    expect(walked.map((r) => r.code)).toEqual(['PAYLOAD_TOO_DEEP_TO_VERIFY']);

    expect(seatRefusals(payload, {})).toBe(1);
    const refusal = seatedDepthRefusal(payload);
    expect(refusal).not.toBeNull();
    expect(refusal!.matched).toBe(walked[0]!.matched);
    expect(refusal!.sentence).toBe(walked[0]!.sentence);
  });
});

describe('what the middleware cannot seat, it reports rather than hides', () => {
  it('does not descend into an already-refused field', async () => {
    // The finding is the NAME. A second banned name under an already-refused path is the
    // same defect reported twice at a path nobody will render.
    const spy = quiet();
    const { res } = await jsonRead('/v1/marketing/metrics', { data: { impressions: { ctr: 1, sov: 2 } } });
    spy.mockRestore();
    expect(statedCounts(res).refused).toBe(1);
  });

  it('walks a top-level array and a top-level scalar without reshaping either', async () => {
    const spy = quiet();
    const arr = await jsonRead('/v1/marketing/rows', [{ ok: 1 }, { ctr: 2 }]);
    spy.mockRestore();
    const rows = arr.body as unknown as Record<string, unknown>[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toEqual({ ok: 1 });
    expect((rows[1]!.ctr as Record<string, unknown>).code).toBe('METRIC_NOT_OBSERVABLE');

    const scalar = await jsonRead('/v1/marketing/scalar', 7);
    expect(scalar.body as unknown).toBe(7);
  });

  it('does not let a stale content-length survive a rewritten body', async () => {
    /*
     * THE BARRIER MOVED, because the first version of this test proved nothing. It asked
     * `jsonRead` for a body and then asserted inside `if (declared !== null)` — and `c.json`
     * in this harness never sets `content-length`, so `declared` was null with the middleware
     * and null without it. The assertion never ran and `honesty.ts`'s
     * `res.headers.delete('content-length')` was covered by nothing; deleting that line left
     * the test green.
     *
     * So the handler now DECLARES a content-length, the way a hand-built `new Response` can.
     * Hono's `c.res` setter copies every header except `content-type` onto the replacement, so
     * without the delete this header describes the pre-rewrite body — and the refusal object
     * is far longer than the number it replaced, so the declared length would be short enough
     * to truncate the response at the socket.
     */
    const original = JSON.stringify({ data: { impressions: 1 } });
    const app = appWith((a) => {
      a.get('/v1/marketing/metrics', () =>
        new Response(original, {
          headers: {
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(original)),
          },
        }));
    });
    const spy = quiet();
    const res = await app.request('/v1/marketing/metrics');
    spy.mockRestore();

    const rewritten = await res.clone().text();
    // The body really was rewritten, so a stale length would really be wrong.
    expect(rewritten.length).toBeGreaterThan(original.length);
    const declared = res.headers.get('content-length');
    // Either absent (deleted, which is what the middleware does) or truthful. Never stale.
    if (declared !== null) expect(Number(declared)).toBe(Buffer.byteLength(rewritten));
    expect(declared).toBeNull();
  });

  it('preserves the status and the other headers of the response it rewrites', async () => {
    const spy = quiet();
    const app = appWith((a) => {
      a.get('/v1/marketing/refused', (c) => {
        c.header('X-LCX-No-Store', '1');
        return c.json({ error: 'nope', code: 'MARKETING_SILENCE_REFUSED', ctr: 1 }, 422);
      });
    });
    const res = await app.request('/v1/marketing/refused');
    spy.mockRestore();
    expect(res.status).toBe(422);
    expect(res.headers.get('X-LCX-No-Store')).toBe('1');
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(((await res.json()) as Record<string, Record<string, unknown>>).ctr.code)
      .toBe('METRIC_NOT_OBSERVABLE');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* 7. THE READER HALF OF THE FOUR-STATE HEADER                                    */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('parseCeilingHeader keeps not-stated apart from stated', () => {
  /*
   * The header exists to hold four states apart. A reader that defaults its way out of a
   * missing field collapses them again, and that is what the first version did: a missing
   * `compartment=` became `NO_COMPARTMENT` (the AFFIRMATIVE "this namespace has none") and a
   * missing `refused=` became 0 ("walked and clean"). `parseCeilingHeader('walked')` therefore
   * answered "a clean walk of an uncompartmented namespace" about a header that stated neither.
   */
  it('reports an absent header as absent, not as a clean walk', () => {
    expect(parseCeilingHeader(null)).toEqual({ kind: 'absent' });
    expect(parseCeilingHeader(undefined)).toEqual({ kind: 'absent' });
  });

  it('reports a header that states no compartment as unreadable', () => {
    // The old reader answered `{ compartment: 'none:desk-level-namespace', refused: 0 }` here.
    expect(parseCeilingHeader('walked')).toEqual({ kind: 'unreadable', raw: 'walked' });
    expect(parseCeilingHeader('walked; refused=1; seated=1; exempted=0'))
      .toMatchObject({ kind: 'unreadable' });
  });

  it('reports a walked header that states no counts as unreadable', () => {
    expect(parseCeilingHeader('walked; compartment=marketing'))
      .toMatchObject({ kind: 'unreadable' });
    // Truncated mid-header — the shape a proxy or a log truncation produces.
    expect(parseCeilingHeader('walked; compartment=marketing; refused=1; seated='))
      .toMatchObject({ kind: 'unreadable' });
  });

  it('never turns a corrupt count into a number', () => {
    // `Number('x')` is NaN, which satisfies neither `> 0` nor `=== 0`, so every guard
    // downstream would have treated a corrupt count as not-refused.
    for (const bad of ['x', '-1', '1.5', '', ' 1', '0x1', 'NaN']) {
      expect(parseCeilingHeader(`walked; compartment=marketing; refused=${bad}; seated=0; exempted=0`), bad)
        .toMatchObject({ kind: 'unreadable' });
    }
  });

  it('reads an unparseable header as stating a compartment and NO counts', () => {
    expect(parseCeilingHeader('unparseable; compartment=marketing')).toEqual({
      kind: 'stated',
      summary: { state: 'unparseable', compartment: 'marketing', counts: null },
    });
  });

  it('rejects an unparseable header that also claims counts, because it cannot be both', () => {
    expect(parseCeilingHeader('unparseable; compartment=marketing; refused=0; seated=0; exempted=0'))
      .toMatchObject({ kind: 'unreadable' });
  });

  it('round-trips what the middleware actually writes', async () => {
    const spy = quiet();
    const { res } = await jsonRead('/v1/marketing/metrics', { data: { ctr: 1 } });
    spy.mockRestore();
    expect(parseCeilingHeader(res.headers.get(HONESTY_CEILING_HEADER))).toEqual({
      kind: 'stated',
      summary: {
        state: 'walked',
        compartment: 'marketing',
        counts: { refused: 1, seated: 1, exempted: 0 },
      },
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* 8. THE MOUNT ORDER THE FILE INSTRUCTS, PINNED                                  */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('a compartment gate that short-circuits is only covered from upstream', () => {
  /**
   * WHY THIS TEST EXISTS: `honesty.ts` used to instruct the lead to mount the middleware
   * "after the compartment gates, so it also inspects their 401/403/422 envelopes". Hono
   * composes in registration order as an onion, so that mount puts the middleware DOWNSTREAM
   * of the gate — and `requireWorkspace` denies with `return c.json(...)` and never calls
   * `next()`. The instruction described the one arrangement in which the middleware does not
   * run on the envelope it claimed to cover. The corrected instruction is now pinned here
   * rather than only asserted in prose.
   *
   * The stand-in gate is the SHAPE of `middleware/workspace.ts:102` — a `c.json` refusal
   * envelope with no `next()` — because the real one loads entitlements from a pool. What is
   * under test is Hono's composition, which does not care which middleware short-circuits.
   */
  const gate: MiddlewareHandler = (c) =>
    c.json(
      { error: "Forbidden: Marketing requires 'view' access", code: 'WORKSPACE_FORBIDDEN', ctr: 0.4 },
      403,
    );

  const appWithOrder = (order: 'ceiling-first' | 'gate-first'): Hono => {
    const app = new Hono();
    if (order === 'ceiling-first') app.use('*', honestyCeiling());
    app.use('/v1/marketing/*', gate);
    if (order === 'gate-first') app.use('*', honestyCeiling());
    app.get('/v1/marketing/queue', (c) => c.json({ data: [] }));
    return app;
  };

  it('mounted AHEAD of the gate, the 403 envelope is inspected and its banned field refused', async () => {
    const spy = quiet();
    const res = await appWithOrder('ceiling-first').request('/v1/marketing/queue');
    spy.mockRestore();
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, Record<string, unknown>>;
    expect(body.ctr!.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(statedCounts(res)).toMatchObject({ refused: 1, seated: 1 });
    // The envelope's own fields are intact — a refusal envelope is still a refusal envelope.
    expect(body.code as unknown).toBe('WORKSPACE_FORBIDDEN');
  });

  it('mounted AFTER the gate, the middleware does not run at all — no header, raw field', async () => {
    // This is the arrangement the old instruction asked for. Nothing is refused and nothing
    // says the ceiling did not look at the body: the header's absence is the only signal, and
    // it reads identically to "this was not a JSON response".
    const spy = quiet();
    const res = await appWithOrder('gate-first').request('/v1/marketing/queue');
    spy.mockRestore();
    expect(res.status).toBe(403);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ ctr: 0.4 });
    expect(parseCeilingHeader(res.headers.get(HONESTY_CEILING_HEADER))).toEqual({ kind: 'absent' });
  });

  it('and a handler that the gate lets through is inspected either way', async () => {
    for (const order of ['ceiling-first', 'gate-first'] as const) {
      const app = new Hono();
      if (order === 'ceiling-first') app.use('*', honestyCeiling());
      app.use('/v1/marketing/*', async (_c, next) => { await next(); });
      if (order === 'gate-first') app.use('*', honestyCeiling());
      app.get('/v1/marketing/queue', (c) => c.json({ data: { ctr: 1 } }));
      const spy = quiet();
      const res = await app.request('/v1/marketing/queue');
      spy.mockRestore();
      expect(statedCounts(res), order).toMatchObject({ refused: 1, seated: 1 });
    }
  });
});
