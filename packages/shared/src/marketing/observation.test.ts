import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_METRIC_FIELD_NAMES,
  NOTIFICATION_CENSUS_DISCLOSURE,
  PROCESS_METRIC_DEFINITIONS,
  SOURCES_WITHOUT_DENOMINATOR,
  SOURCE_OBSERVATION_PROFILE,
  assertHonestPayload,
  checkFrame,
  fetchOutcomeToFigure,
  frameFor,
  lowerBound,
  measured,
  notificationFrame,
  observedRate,
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
