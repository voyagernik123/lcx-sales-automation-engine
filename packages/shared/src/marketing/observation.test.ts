import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_METRIC_FIELD_NAMES,
  MAX_PAYLOAD_DEPTH,
  NORMALISED_FORBIDDEN_FIELD_NAMES,
  NOTIFICATION_CENSUS_DISCLOSURE,
  PAYLOAD_NOT_WALKABLE_CODE,
  PAYLOAD_TOO_DEEP_CODE,
  PROCESS_METRIC_DEFINITIONS,
  REDUNDANT_UNDER_NORMALISATION,
  SOURCES_WITHOUT_DENOMINATOR,
  SOURCE_OBSERVATION_PROFILE,
  assertHonestPayload,
  assertHonestPayloadAll,
  checkFrame,
  fetchOutcomeToFigure,
  frameFor,
  lowerBound,
  measured,
  notificationFrame,
  observedRate,
  partialSharePct,
  ownCorpusFrame,
  type ObservationWindow,
} from './observation.js';
import { PROCESS_METRIC_KEYS, type InboundSourceKind } from './types.js';

const WINDOW: ObservationWindow = {
  from: '2026-07-27T00:00:00.000Z',
  to: '2026-08-02T23:59:59.000Z',
  asOf: '2026-08-02T12:00:00.000Z',
  lastSuccessfulPollAt: '2026-08-02T11:40:00.000Z',
};

describe('the observation frame — what the window could not see', () => {
  it('names blind spots for every source in the vocabulary', () => {
    for (const source of Object.keys(SOURCE_OBSERVATION_PROFILE) as InboundSourceKind[]) {
      const p = SOURCE_OBSERVATION_PROFILE[source];
      expect(p.captures.length, source).toBeGreaterThan(20);
      expect(p.doesNotCapture.length, source).toBeGreaterThan(0);
      expect(p.knownBiases.length, source).toBeGreaterThan(0);
    }
  });

  it('never lets a source without a denominator claim completeness', () => {
    for (const source of SOURCES_WITHOUT_DENOMINATOR) {
      expect(SOURCE_OBSERVATION_PROFILE[source].completeness, source).toBe('unknown_no_denominator');
    }
  });

  it('attaches the census sentence to anything derived from notification mail', () => {
    const frame = notificationFrame(WINDOW);
    expect(frame.knownBiases[0]).toBe(NOTIFICATION_CENSUS_DISCLOSURE);
    expect(frame.knownBiases[0]).toContain('not a sample');
    expect(frame.completeness).toBe('unknown_no_denominator');
    expect(frame.doesNotCapture.join(' ')).toContain('impressions');
    expect(frame.lastSuccessfulPollAt).toBe('2026-08-02T11:40:00.000Z');
    expect(checkFrame(frame)).toBeNull();
  });

  it('appends extra blind spots without letting a caller talk the standing ones away', () => {
    const frame = notificationFrame(WINDOW, ['the mailbox was full on Thursday']);
    expect(frame.doesNotCapture).toContain('the mailbox was full on Thursday');
    expect(frame.doesNotCapture.length).toBeGreaterThan(1);
  });

  it('marks the desk’s own records as a census, with the standing absences attached', () => {
    const frame = ownCorpusFrame(WINDOW, 'Drafts the desk assessed.');
    expect(frame.completeness).toBe('census_of_own_corpus');
    expect(frame.doesNotCapture.join(' ')).toContain('retention sweep');
    expect(checkFrame(frame)).toBeNull();
  });

  it('refuses a frame that names no blind spots', () => {
    const bad = { ...ownCorpusFrame(WINDOW, 'Everything.'), doesNotCapture: [] };
    const r = checkFrame(bad);
    expect(r?.code).toBe('OBSERVATION_FRAME_MISSING');
    expect(r?.sentence).toContain('names no blind spots');
  });

  it('refuses a social frame that claims to be complete', () => {
    const bad = { ...frameFor('x_notification_email', WINDOW), completeness: 'complete_first_party' as const };
    const r = checkFrame(bad);
    expect(r?.code).toBe('OBSERVATION_FRAME_MISSING');
    expect(r?.recovery.kind).toBe('not_recoverable');
  });

  it('refuses a window that runs backwards, or that says nothing about what it captured', () => {
    const backwards = { ...ownCorpusFrame(WINDOW, 'Drafts.'), windowTo: '2026-07-01T00:00:00.000Z' };
    expect(checkFrame(backwards)?.code).toBe('OBSERVATION_FRAME_MISSING');
    const silent = { ...ownCorpusFrame(WINDOW, '  ') };
    expect(checkFrame(silent)?.sentence).toContain('does not say what the window captured');
  });

  it('checks the frame when a figure is wrapped, so a bad frame cannot ride on a good number', () => {
    const bad = { ...ownCorpusFrame(WINDOW, 'Drafts.'), doesNotCapture: [] };
    const fig = measured(42, bad);
    expect(fig.kind).toBe('absent');
  });
});

describe('lower bounds and the three-state fetch', () => {
  it('states a count as a lower bound, with its metric name', () => {
    const fig = lowerBound('replies', 7, notificationFrame(WINDOW));
    expect(fig.kind).toBe('measured');
    if (fig.kind !== 'measured') throw new Error('expected a measurement');
    expect(fig.value).toMatchObject({ kind: 'lower_bound', metric: 'replies', atLeast: 7 });
  });

  it('refuses a fractional or negative observed count', () => {
    expect(lowerBound('replies', -1, notificationFrame(WINDOW)).kind).toBe('absent');
    expect(lowerBound('replies', 1.5, notificationFrame(WINDOW)).kind).toBe('absent');
  });

  it('turns a confirmed absence into a number only when the caller says what zero means', () => {
    const frame = ownCorpusFrame(WINDOW, 'Items ingested.');
    const confirmed = { kind: 'no_data_confirmed', at: WINDOW.asOf, basis: 'mailbox empty and reachable' } as const;
    const withoutZero = fetchOutcomeToFigure<number>(confirmed, frame);
    expect(withoutZero.kind).toBe('absent');
    if (withoutZero.kind !== 'absent') throw new Error('expected absence');
    expect(withoutZero.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');

    const withZero = fetchOutcomeToFigure<number>(confirmed, frame, 0);
    expect(withZero.kind).toBe('measured');
  });

  it('never reads a transport failure or an empty 200 as absence', () => {
    const frame = ownCorpusFrame(WINDOW, 'Items ingested.');
    const unknown = fetchOutcomeToFigure<number>(
      { kind: 'unknown', at: WINDOW.asOf, reason: 'HTTP 200 with zero bytes' },
      frame,
      0,
    );
    expect(unknown.kind).toBe('absent');
    if (unknown.kind !== 'absent') throw new Error('expected absence');
    expect(unknown.refusal.code).toBe('FETCH_OUTCOME_UNKNOWN');
    expect(unknown.refusal.sentence).toContain('not evidence of absence');
  });
});

describe('the honesty ceiling, at runtime', () => {
  it('derives the blocklist from the typed table, so the two cannot drift', () => {
    expect(FORBIDDEN_METRIC_FIELD_NAMES).toHaveLength(38);
    expect(FORBIDDEN_METRIC_FIELD_NAMES).toContain('impressions');
    expect(FORBIDDEN_METRIC_FIELD_NAMES).toContain('shareOfVoice');
    expect(FORBIDDEN_METRIC_FIELD_NAMES).toContain('sov');
    expect(FORBIDDEN_METRIC_FIELD_NAMES).toContain('engagement_rate');
  });

  it('refuses a payload carrying a forbidden field, naming the path', () => {
    const r = assertHonestPayload({ postId: 'p1', impressions: 12_000 });
    expect(r?.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(r?.recovery.kind).toBe('not_recoverable');
    expect(r?.matched).toBe('impressions');
    expect(r?.sentence).toContain('inferred, proxied or invented');
  });

  it('finds one nested inside arrays and objects', () => {
    const r = assertHonestPayload({ panel: { tiles: [{ label: 'SOV' }, { shareOfVoice: 0.42 }] } });
    expect(r?.matched).toBe('panel.tiles[1].shareOfVoice');
  });

  it('normalises case and separators', () => {
    expect(assertHonestPayload({ Impressions: 1 })?.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(assertHonestPayload({ follower_delta: 1 })?.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(assertHonestPayload({ 'engagement-rate': 1 })?.code).toBe('METRIC_NOT_OBSERVABLE');
  });

  it('leaves honest payloads and bare per-item sentiment alone', () => {
    expect(assertHonestPayload({ repliesObserved: { kind: 'lower_bound', atLeast: 3 } })).toBeNull();
    // Bare `sentiment` on an item we actually hold is not banned; the aggregates are.
    expect(assertHonestPayload({ replyId: 'r1', sentiment: 'negative' })).toBeNull();
    expect(assertHonestPayload({ sentimentScore: -0.3 })?.code).toBe('METRIC_NOT_OBSERVABLE');
  });

  it('does not hang on a cycle, and admits the spelling it cannot catch', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(assertHonestPayload(cyclic)).toBeNull();
    // Stated limitation, pinned so it is a known gap rather than a surprise:
    expect(assertHonestPayload({ impressions7d: 1 })).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE CEILING'S OWN THREE DEFECTS — every one the error class it exists to     */
/* prevent. Written before the fix, and each names the input that reproduced it. */
/* ══════════════════════════════════════════════════════════════════════════ */

/** An object with `leaf` sitting at exactly `depth` levels below the returned root. */
function at(depth: number, leaf: unknown): Record<string, unknown> {
  let node: unknown = leaf;
  for (let i = depth; i > 0; i -= 1) node = { [`d${String(i)}`]: node };
  return node as Record<string, unknown>;
}

describe('DEFECT 1 — past the depth limit it refuses, and never returns null', () => {
  /*
   * WHAT WAS WRONG. `walk` returned `null` past `MAX_PAYLOAD_DEPTH`, so "I looked and
   * found nothing" and "I did not look" were THE SAME RETURN VALUE. That is the
   * laundering this whole module exists to stop, committed by the guard itself: a
   * caller reading `null` as clean was reading an unverified payload as a verified one.
   */
  it('still catches a forbidden key at the deepest level it does walk', () => {
    const r = assertHonestPayload(at(MAX_PAYLOAD_DEPTH, { impressions: 1 }));
    expect(r?.code).toBe('METRIC_NOT_OBSERVABLE');
  });

  it('refuses with its own code one level past the limit, rather than reporting clean', () => {
    const r = assertHonestPayload(at(MAX_PAYLOAD_DEPTH + 1, { impressions: 1 }));
    expect(r, 'a payload the walker could not finish must never read as clean').not.toBeNull();
    expect(r?.code).toBe(PAYLOAD_TOO_DEEP_CODE);
    // The two facts a reader needs to act: how deep it went, and where it stopped.
    expect(r?.sentence).toContain(String(MAX_PAYLOAD_DEPTH));
    expect(r?.matched).toContain('d1.d2');
    expect(r?.recovery.kind).toBe('supply_data');
  });

  it('refuses an alternating array/object payload, which consumes two levels a turn', () => {
    // Arrays cost a level each, so this shape hit the old silent-null at a QUARTER of
    // the apparent nesting — four alternations under the old limit of 8.
    let deep: unknown = { impressions: 1 };
    for (let i = 0; i < MAX_PAYLOAD_DEPTH; i += 1) deep = [{ k: deep }];
    const r = assertHonestPayload(deep);
    expect(r).not.toBeNull();
    expect(r?.code).toBe(PAYLOAD_TOO_DEEP_CODE);
  });

  it('leaves an honest payload nested well past a REST response clean', () => {
    // The limit that refuses has to sit above anything the desk actually returns, or
    // the ceiling becomes an outage. Twelve levels is deeper than any contract here.
    expect(assertHonestPayloadAll(at(12, { repliesObserved: { atLeast: 3 } }))).toEqual([]);
  });
});

describe('DEFECT 2 — sharing an object does not suppress a later check', () => {
  /*
   * WHAT WAS WRONG, WITH THE PAYLOAD THAT PROVED IT. The `WeakSet` was added to and
   * never removed, so it was a permanent first-visit-wins dedupe rather than a cycle
   * guard. Where the first visit was TRUNCATED by the depth limit, the object was
   * still marked seen — so the same object at a checkable depth was skipped, and the
   * verdict depended on `Object.keys` order. Same object, same payload, opposite answer.
   */
  const shared = () => ({ q: { impressions: 1 } });

  it('answers the same whichever key order the payload happens to have', () => {
    const s1 = shared();
    const deepFirst = { deep: at(MAX_PAYLOAD_DEPTH - 1, { s: s1 }), shallow: s1 };
    const s2 = shared();
    const shallowFirst = { shallow: s2, deep: at(MAX_PAYLOAD_DEPTH - 1, { s: s2 }) };

    for (const [name, payload] of [['deep first', deepFirst], ['shallow first', shallowFirst]] as const) {
      const codes = assertHonestPayloadAll(payload).map((r) => r.code);
      expect(codes, name).toContain('METRIC_NOT_OBSERVABLE');
      expect(codes, name).toContain(PAYLOAD_TOO_DEEP_CODE);
    }
  });

  it('reports the shallow copy of a shared object even when a deep copy was truncated', () => {
    const s = shared();
    const r = assertHonestPayloadAll({ deep: at(MAX_PAYLOAD_DEPTH - 1, { s }), shallow: s })
      .find((x) => x.code === 'METRIC_NOT_OBSERVABLE');
    expect(r?.matched).toBe('shallow.q.impressions');
  });

  it('still terminates on a cycle several levels down', () => {
    const inner: Record<string, unknown> = { name: 'inner' };
    const outer = { a: { b: { c: inner } } };
    inner.backToOuter = outer;
    expect(assertHonestPayloadAll(outer)).toEqual([]);
  });

  it('skips a typed array\'s BYTES without skipping its named properties', () => {
    /*
     * ── THIS TEST USED TO PIN THE BYPASS IT WAS WRITTEN TO GUARD ──
     * It asserted `toEqual([])` for a real `impressions` property planted on a
     * `Uint8Array`, on the argument that "a byte index cannot normalise to a forbidden
     * name, so nothing checkable is lost". The first half is true and the conclusion was
     * not: skipping the whole OBJECT to avoid its bytes also skipped its names, so the
     * function returned the completed-clean value for a container it had not read — the
     * same not-loaded/clean collapse the depth fix in this file's DEFECT 1 was about.
     *
     * The bytes are still not walked (1MB of them measured at 88ms against 0.68ms for a
     * whole realistic payload). Only the numeric indices and the view's own structural
     * fields are skipped, which is where the cost is and where nothing checkable lives.
     */
    const bytes = new Uint8Array(4);
    Object.assign(bytes as unknown as Record<string, unknown>, { impressions: 1 });
    const all = assertHonestPayloadAll({ bytes });
    expect(all).toHaveLength(1);
    expect(all[0]?.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(all[0]?.matched).toBe('bytes.impressions');
  });

  it('leaves a plain typed array clean, so the named-property check is not an outage', () => {
    // A byte view with nothing but bytes on it has no field name to object to. If this
    // ever fails, the index skip has been lost and every binary payload refuses.
    expect(assertHonestPayloadAll({ bytes: new Uint8Array(64) })).toEqual([]);
    expect(assertHonestPayloadAll({ view: new DataView(new ArrayBuffer(32)) })).toEqual([]);
  });

  it('refuses a byte view too large to enumerate, rather than skipping it in silence', () => {
    /*
     * The named-property check costs one key per byte. At 4,096 elements that is 0.28ms —
     * the same order as the whole realistic payload — and at 1,000,000 it is 184ms. So the
     * bound exists, and the branch above it REFUSES: "did not read" and "read and found
     * nothing" have to stay different answers, which is the entire subject of this file.
     */
    const all = assertHonestPayloadAll({ blob: new Uint8Array(8_192) });
    expect(all).toHaveLength(1);
    expect(all[0]?.code).toBe(PAYLOAD_NOT_WALKABLE_CODE);
    expect(all[0]?.matched).toBe('blob');
    expect(all[0]?.sentence).toContain('8192');
  });

  it('refuses a Map or Set with contents rather than reporting it clean', () => {
    /*
     * `Object.keys` does not see a Map's entries or a Set's members, so both used to fall
     * out of the walk through a bare `return` and produce `[]` — the value a completed
     * clean walk produces. `assertHonestPayloadAll(new Map([['impressions', 1]]))`
     * answered "clean" about a container it had never read.
     */
    const mapRefusals = assertHonestPayloadAll({ m: new Map([['impressions', 1]]) });
    expect(mapRefusals).toHaveLength(1);
    expect(mapRefusals[0]?.code).toBe(PAYLOAD_NOT_WALKABLE_CODE);
    expect(mapRefusals[0]?.matched).toBe('m');
    expect(mapRefusals[0]?.recovery.kind).toBe('supply_data');

    const setRefusals = assertHonestPayloadAll(new Set([{ impressions: 1 }]));
    expect(setRefusals).toHaveLength(1);
    expect(setRefusals[0]?.code).toBe(PAYLOAD_NOT_WALKABLE_CODE);
    // At the root there is no path to name, and `matched` says so rather than inventing one.
    expect(setRefusals[0]?.matched).toBeNull();
  });

  it('does not refuse an EMPTY Map or Set, because nothing in it went unread', () => {
    expect(assertHonestPayloadAll({ m: new Map(), s: new Set() })).toEqual([]);
  });

  it('reads enumerable inherited properties, which `Object.keys` cannot see', () => {
    // `Object.create({ impressions: 1 })` answered clean: the banned name is on the
    // prototype. Class methods and everything on `Object.prototype` are non-enumerable,
    // so `for…in` closes this without refusing an ordinary object or a class instance.
    expect(assertHonestPayload(Object.create({ impressions: 1 }))?.code).toBe('METRIC_NOT_OBSERVABLE');
    class Row { constructor(readonly id = 1) {} get label() { return 'x'; } }
    expect(assertHonestPayloadAll({ row: new Row() })).toEqual([]);
  });

  it('reads a named property hung on an array, not only its indices', () => {
    const rows = Object.assign([{ ok: 1 }], { ctr: 0.2 });
    expect(assertHonestPayload({ rows })?.matched).toBe('rows.ctr');
  });
});

describe('DEFECT 2b — the per-path guard made the walk exponential, and the memo undoes that', () => {
  /*
   * WHAT WAS WRONG. A per-path ancestor set alone turns the walk from O(distinct NODES)
   * into O(distinct PATHS), so a shared-reference DAG — not a cycle — is walked once per
   * path. Measured against the per-path-only version: L=16 in 24ms, L=18 in 87ms, L=20 in
   * 380ms, L=22 in 1,840ms. A clean 4x per level, i.e. 2^L, unbounded to ~2^32 at
   * MAX_PAYLOAD_DEPTH. Latent in the browser (JSON.parse output is a tree) and NOT latent
   * for the API middleware this walker is being built for, where every rule citation is a
   * shared module constant.
   *
   * THE ASSERTION IS A VISIT COUNT, NOT A STOPWATCH. A timing assertion on a shared runner
   * is a flake, and this repo's rule is to move the barrier rather than pick a threshold.
   * An enumerable getter at the leaf counts exactly how many times the walker reached it:
   * 1 with the memo, 2^L without.
   */
  const leafVisits = (levels: number): number => {
    let calls = 0;
    let node: unknown = {
      get probe() {
        calls += 1;
        return 1;
      },
    };
    for (let i = 0; i < levels; i += 1) node = { a: node, b: node };
    expect(assertHonestPayloadAll(node)).toEqual([]);
    return calls;
  };

  it('visits a shared node once per depth, not once per path', () => {
    expect(leafVisits(20)).toBe(1);
  });

  it('and the count does not grow with the number of paths', () => {
    // 2^22 paths reach the same leaf. Without the memo this is 4,194,304 visits and ~1.8s;
    // with it the leaf is proved clean at its depth on the first visit and skipped after.
    expect(leafVisits(22)).toBe(1);
  });

  it('but a node proved clean SHALLOW is still re-walked DEEPER, where it may truncate', () => {
    /*
     * The memo records a proof at a depth, not a visit. A subtree that walked to the bottom
     * from depth 1 says nothing about the same subtree started at depth 21, which has 20
     * fewer levels of budget — and skipping it there would be the truncation-reads-as-clean
     * defect wearing the memo's clothes.
     */
    const s = at(20, { ok: 1 });
    const r = assertHonestPayloadAll({ shallow: s, deep: at(20, { s }) });
    expect(r.map((x) => x.code)).toEqual([PAYLOAD_TOO_DEEP_CODE]);
  });
});

describe('DEFECT 3 — every violation, never the first one found', () => {
  /*
   * The house pattern, two files over: "EVERY refusal, then one 422 — never the first
   * one found" (`apps/api/src/routes/marketingDesk.ts`). A middleware that reports one
   * banned field per attempt gets routed around field by field.
   */
  it('collects each banned field with its own path, in walk order', () => {
    const all = assertHonestPayloadAll({
      impressions: 1,
      rows: [{ ctr: 0.1 }, { sov: 2 }],
      nested: { engagement_rate: 3 },
    });
    expect(all.map((r) => r.matched)).toEqual([
      'impressions',
      'rows[0].ctr',
      'rows[1].sov',
      'nested.engagement_rate',
    ]);
    for (const r of all) expect(r.code).toBe('METRIC_NOT_OBSERVABLE');
  });

  it('does not descend into a banned field, so one bad name is one finding', () => {
    const all = assertHonestPayloadAll({ impressions: { ctr: 1, sov: 2 } });
    expect(all).toHaveLength(1);
    expect(all[0]?.matched).toBe('impressions');
  });

  it('keeps the single-refusal wrapper for the callers that read one', () => {
    // `apps/api/.../marketingGatesMetrics.test.ts` and `lib/api/marketing.ts` both read
    // `Refusal | null` off this. It returns ONE of the list, and null for none.
    expect(assertHonestPayload({ a: 1 })).toBeNull();
    expect(assertHonestPayload({ ctr: 1, sov: 2 })?.matched).toBe('ctr');
    expect(assertHonestPayloadAll({ ctr: 1, sov: 2 })).toHaveLength(2);
  });

  it('names the forbidden FIELD, not the unreadable container, when a payload has both', () => {
    /*
     * WHAT WAS WRONG. The wrapper returned `all[0]` — walk order — so on
     * `{ a: <too deep>, z: { ctr: 1 } }` the code and sentence a caller renders described
     * the payload's SHAPE while the actual forbidden metric sat only in `.refusals`, which
     * no production surface in this repo reads. The screen then said "too deep to verify"
     * about a payload whose real problem was a named unobservable metric.
     *
     * A named field outranks a container the walker could not read: it is the more
     * actionable finding and it is a certainty rather than an unknown.
     */
    const both = { a: at(MAX_PAYLOAD_DEPTH + 1, { ok: 1 }), z: { ctr: 1 } };
    expect(assertHonestPayloadAll(both).map((r) => r.code)).toEqual([
      PAYLOAD_TOO_DEEP_CODE,
      'METRIC_NOT_OBSERVABLE',
    ]);
    const one = assertHonestPayload(both);
    expect(one?.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(one?.matched).toBe('z.ctr');

    // Same rule against the other unreadable-container code.
    expect(assertHonestPayload({ m: new Map([['x', 1]]), z: { sov: 1 } })?.code)
      .toBe('METRIC_NOT_OBSERVABLE');
    // And with no named field to prefer, the container refusal is still what comes back.
    expect(assertHonestPayload({ m: new Map([['x', 1]]) })?.code).toBe(PAYLOAD_NOT_WALKABLE_CODE);
  });

  it('leaves the PLURAL list in walk order, because a report must not reorder its findings', () => {
    const codes = assertHonestPayloadAll({
      m: new Map([['x', 1]]),
      z: { impressions: 1 },
    }).map((r) => r.code);
    expect(codes).toEqual([PAYLOAD_NOT_WALKABLE_CODE, 'METRIC_NOT_OBSERVABLE']);
  });
});

describe('the thirteen names that are redundant under normalisation', () => {
  /*
   * REPORTED, NOT DELETED. 38 declared names collapse to 25 distinct keys once case and
   * separators are stripped, so thirteen entries can never be the reason a payload is
   * caught. They stay in `FORBIDDEN_FIELD_TABLE` because the table is keyed by
   * `ForbiddenMetricField` and is the readable statement of what is banned — deleting a
   * spelling would make the union and the table disagree, and `impression_count` is the
   * spelling a Postgres row actually arrives with.
   */
  it('names exactly which thirteen, so the claim is checkable rather than asserted', () => {
    expect(FORBIDDEN_METRIC_FIELD_NAMES).toHaveLength(38);
    expect(NORMALISED_FORBIDDEN_FIELD_NAMES).toHaveLength(25);
    expect(REDUNDANT_UNDER_NORMALISATION).toEqual([
      'impression_count',
      'view_count',
      'unique_reach',
      'follower_count',
      'follower_delta',
      'follower_growth',
      'engagement_rate',
      'click_through_rate',
      'share_of_voice',
      'audience_sentiment',
      'sentiment_score',
      'net_sentiment',
      'sentiment_pct',
    ]);
  });

  it('every redundant spelling is still banned, which is the point of keeping them', () => {
    for (const name of REDUNDANT_UNDER_NORMALISATION) {
      expect(FORBIDDEN_METRIC_FIELD_NAMES, name).toContain(name);
      expect(assertHonestPayload({ [name]: 1 })?.code, name).toBe('METRIC_NOT_OBSERVABLE');
    }
  });
});

describe('observedRate — the function no caller gets reach out of', () => {
  const frame = ownCorpusFrame(WINDOW, 'Drafts assessed in the window.');

  it('computes a rate over a census the desk holds', () => {
    const fig = observedRate({
      metric: 'precleared derivation rate',
      numerator: 3,
      denominator: { kind: 'own_corpus_total', value: 4, counts: 'items published' },
      frame,
    });
    expect(fig.kind).toBe('measured');
    if (fig.kind !== 'measured') throw new Error('expected a measurement');
    expect(fig.value.ratio).toBeCloseTo(0.75);
    expect(fig.value.pct).toBe(75);
    expect(fig.value.counts).toBe('items published');
  });

  it('refuses when the denominator is unobservable, and says what it would have counted', () => {
    const fig = observedRate({
      metric: 'share of voice',
      numerator: 12,
      denominator: {
        kind: 'unobservable',
        wouldNeedToCount: 'all items covering the issue',
        why: 'We observe only items that mentioned us and reached our inbox.',
      },
      frame,
    });
    expect(fig.kind).toBe('absent');
    if (fig.kind !== 'absent') throw new Error('expected a refusal');
    expect(fig.refusal.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(fig.refusal.recovery.kind).toBe('not_recoverable');
    expect(fig.refusal.sentence).toContain('all items covering the issue');
  });

  it('refuses over a notification-mail frame even when a plausible denominator is passed', () => {
    const fig = observedRate({
      metric: 'reply rate',
      numerator: 4,
      denominator: { kind: 'own_corpus_total', value: 40, counts: 'replies received' },
      frame: notificationFrame(WINDOW),
    });
    expect(fig.kind).toBe('absent');
    if (fig.kind !== 'absent') throw new Error('expected a refusal');
    expect(fig.refusal.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(fig.refusal.sentence).toContain('approaches 1 by construction');
  });

  it('refuses 0/0 instead of reporting 0%', () => {
    const fig = observedRate({
      metric: 'precleared derivation rate',
      numerator: 0,
      denominator: { kind: 'own_corpus_total', value: 0, counts: 'items published' },
      frame,
    });
    expect(fig.kind).toBe('absent');
    if (fig.kind !== 'absent') throw new Error('expected a refusal');
    expect(fig.refusal.code).toBe('DATA_ABSENT_NOT_ZERO');
    expect(fig.refusal.sentence).toContain('Zero of zero is not 0%');
  });

  it('reports an observed zero over a real census, because that is a finding', () => {
    const fig = observedRate({
      metric: 'precleared derivation rate',
      numerator: 0,
      denominator: { kind: 'own_corpus_total', value: 9, counts: 'items published' },
      frame,
    });
    expect(fig.kind).toBe('measured');
    if (fig.kind !== 'measured') throw new Error('expected a measurement');
    expect(fig.value.pct).toBe(0);
  });

  it('refuses a numerator larger than the census it came from', () => {
    const fig = observedRate({
      metric: 'claim provenance rate',
      numerator: 11,
      denominator: { kind: 'own_corpus_total', value: 10, counts: 'quantitative claims' },
      frame,
    });
    expect(fig.kind).toBe('absent');
    if (fig.kind !== 'absent') throw new Error('expected a refusal');
    expect(fig.refusal.sentence).toContain('join defect');
  });

  it('refuses non-integer counts', () => {
    const fig = observedRate({
      metric: 'claim provenance rate',
      numerator: 1.5,
      denominator: { kind: 'own_corpus_total', value: 10, counts: 'quantitative claims' },
      frame,
    });
    expect(fig.kind).toBe('absent');
  });
});

describe('the twelve process metrics', () => {
  it('defines every metric in the vocabulary, and no others', () => {
    expect(Object.keys(PROCESS_METRIC_DEFINITIONS).sort()).toEqual([...PROCESS_METRIC_KEYS].sort());
    expect(PROCESS_METRIC_KEYS).toHaveLength(12);
    for (const key of PROCESS_METRIC_KEYS) {
      expect(PROCESS_METRIC_DEFINITIONS[key].refusesWhen.length, key).toBeGreaterThan(10);
    }
  });

  it('defines the metrics here but computes none of them here', async () => {
    // The collapse, pinned. `loop.ts` owns the arithmetic; this module owns the
    // definition and the frame. If a computation is ever re-added here there will be
    // two answers to the same question again, which is the defect this test guards.
    const mod: Record<string, unknown> = await import('./observation.js');
    for (const name of [
      'timeToFirstStatement', 'clearanceLatencyByRole', 'preclearedDerivationRate',
      'claimProvenanceRate', 'contradictionDebt', 'notKnownNonEmptyRate',
      'nextUpdateBreachCount', 'retractionCount', 'ignoreWithRationaleRate',
      'questionCoverage',
    ]) {
      expect(mod[name], name).toBeUndefined();
    }
    const loop: Record<string, unknown> = await import('./loop.js');
    for (const name of [
      'timeToFirstStatement', 'clearanceLatencyByRole', 'preclearedDerivationRate',
      'claimProvenanceRate', 'notKnownNonEmptyRate', 'nextUpdateBreachCount',
      'retractionCount', 'ignoreWithRationaleRate',
    ]) {
      expect(typeof loop[name], name).toBe('function');
    }
  });
});

describe('partialSharePct — 100 and 0 are claims, not roundings', () => {
  it('does not report 199 of 200 as 100', () => {
    // The exact input that rendered `100%` in the post-time coverage headline while one
    // open reply had no post date. `Math.round` alone returns 100 here.
    expect(Math.round((199 / 200) * 100)).toBe(100); // the defect, shown
    expect(partialSharePct(199, 200)).toBe(99);
  });

  it('does not report any other near-complete share as 100', () => {
    for (const [part, whole] of [[398, 400], [999, 1000], [9_999, 10_000]] as const) {
      expect(Math.round((part / whole) * 100), `${part}/${whole} rounds up`).toBe(100);
      expect(partialSharePct(part, whole), `${part}/${whole}`).toBe(99);
    }
  });

  it('does not report a share that exists as 0', () => {
    // The mirror forgery: one covered row out of 250 reads as "not a single one".
    expect(Math.round((1 / 250) * 100)).toBe(0);
    expect(partialSharePct(1, 250)).toBe(1);
  });

  it('returns 100 only when every one is covered, and 0 only when none is', () => {
    expect(partialSharePct(200, 200)).toBe(100);
    expect(partialSharePct(0, 200)).toBe(0);
  });

  it('rounds an ordinary share to the nearest whole percent', () => {
    expect(partialSharePct(50, 120)).toBe(42);
    expect(partialSharePct(1, 3)).toBe(33);
    expect(partialSharePct(2, 3)).toBe(67);
  });

  it('refuses rather than returning 0 when the denominator cannot carry a share', () => {
    // Absent, never zero. A caller that gets null must print its refusal sentence.
    for (const [part, whole] of [[0, 0], [1, 0], [3, 2], [-1, 10]] as const) {
      expect(partialSharePct(part, whole), `${part}/${whole}`).toBeNull();
    }
    expect(partialSharePct(1.5, 10)).toBeNull();
    expect(partialSharePct(1, 10.5)).toBeNull();
  });
});
