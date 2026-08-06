// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE SECOND WEB CLIENT'S GET GOES THROUGH THE CEILING. ITS TWO POSTS MUST NOT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `lib/api/marketing.ts` said, in a comment, "This is the one place every marketing read
 * passes through". It was false, and the half that mattered is this module: `deskApi.ts`
 * imported `unwrapWithMeta` directly and applied NO ceiling to `recordHandoff`,
 * `findPrecedent` or `recordTriage`. A route here that started returning `impressions` or
 * `follower_delta` would have reached a component with nothing objecting, and the sentence in
 * the other file is what a reader checks INSTEAD of the imports.
 *
 * ── WHAT THIS FILE ASSERTED FIRST, AND WHY IT WAS ITSELF A DEFECT ─────────────
 * The first version put all three behind the ceiling and pinned that with three `rejects`
 * assertions. Two of the three are POSTs whose handler COMMITS BEFORE IT RESPONDS —
 * `routes/marketingDesk.ts:1240-1274` INSERTs `object_actions` and sets the queue status,
 * then builds the 201 body the ceiling walks. So the refusal fired after the write, and the
 * only catch site (`TriageAssessment.tsx:146`) relabels every throw with the rule text
 * "Nothing was written, so this item is still undecided." The test was pinning a screen that
 * asserts a false fact about the ledger — the same argument the lane had already written down
 * to exempt `invokeMarketingAbuse`, applied to it and then not applied here.
 *
 * So the two POST tests are INVERTED, not deleted: they now require the payload to come back
 * rather than throw, and they say why, so nobody re-adds the ceiling without reading the
 * reason. The GET keeps its refusal test.
 *
 * WHY THE MOCK CARRIES A REAL `ApiError`: `optional()` turns a 404/501 into `null` — "the
 * route is not on this environment" — via `e instanceof ApiError`. A stubbed-out error
 * class would make every rejection fall through the `absent` branch, and the test would
 * then be asserting nothing about the ceiling.
 */

const request = vi.fn();

class ApiError extends Error {
  constructor(readonly status: number) {
    super(`http ${String(status)}`);
  }
}

vi.mock('@/lib/apiClient', () => ({
  request: (...a: unknown[]) => request(...a),
  ApiError,
}));

const desk = await import('../deskApi');

const envelope = (data: unknown) => Promise.resolve({ data, meta: { migrated: true } });

/*
 * BRACES, NOT A CONCISE ARROW BODY, AND THE REASON COST half an hour.
 *
 * `request.mockReset()` RETURNS THE MOCK. Vitest treats a function returned from
 * `beforeEach` as that test's TEARDOWN, so `beforeEach(() => request.mockReset())`
 * registers the mock itself as the teardown and CALLS IT after every test. With a mock
 * whose implementation returns a resolved envelope that is invisible; with one that
 * returns a rejected promise, nothing consumes the rejection and the test fails with an
 * unhandled `http 404` pointing at a line that is correct.
 *
 * `marketingCeiling.test.ts` had the same concise-arrow shape and was green only because
 * every mock in it resolves. Fixed there too, with the reason written beside it.
 */
beforeEach(() => {
  request.mockReset();
});

/** The RESIST 2 triage write. `reach` here is the ordinal, in the REQUEST body. */
const triageWrite = {
  replyId: 4,
  verifiability: 'verifiable_false',
  indicators: [],
  reach: 'trending',
  reachBasis: 'operator judgement, stated on screen',
  confidence: 'medium',
  priority: 'low',
  action: 'monitor',
  rationale: 'because',
} as const;

describe('the desk client GET passes the honesty ceiling', () => {
  it('refuses a banned field nested in a precedent row', async () => {
    request.mockReturnValue(envelope([{ id: 'p1', body: 'x', metrics: { engagement_rate: 0.03 } }]));
    await expect(desk.findPrecedent('tvtg')).rejects.toThrow(/engagement_rate/);
  });

  it('does not refuse the reach-shaped names the desk legitimately returns', async () => {
    /*
     * THE FALSE POSITIVE THIS LANE HAD TO NOT CREATE. `reach` as an audience metric is
     * banned; `reach` as RESIST 2's ordinal judgement is the assessment the whole triage
     * board rests on, and the repo has already paid for confusing the two once (nine false
     * positives, recorded in `scripts/doctrine-lint.mjs` RULE 3). The desk's real payloads
     * name their reach-shaped fields `reachTrajectory`, `reachLadder` and `reachAtDecision`,
     * none of which normalise to a banned key — asserted through the read that IS behind the
     * ceiling, because asserting it through one that is not proves nothing.
     */
    request.mockReturnValue(
      envelope([
        {
          id: 'p1',
          body: 'x',
          reachTrajectory: { current: 'trending' },
          reachLadder: [{ level: 'trending' }],
          reachAtDecision: 'trending',
        },
      ]),
    );
    const rows = await desk.findPrecedent('tvtg');
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe('p1');
  });

  it('still reports an absent route as `null` rather than as a refusal', async () => {
    // The module's three-outcome contract is unchanged: `null` = the route is not on this
    // environment. A ceiling refusal throws, and must never be laundered into this branch.
    request.mockImplementation(() => Promise.reject(new ApiError(404)));
    await expect(desk.findPrecedent('tvtg')).resolves.toBeNull();
  });

  it('carries the whole refusal, not just its sentence', async () => {
    request.mockReturnValue(envelope([{ shareOfVoice: 0.42 }]));
    const err = await desk.findPrecedent('sov').then(
      () => null,
      (e: unknown) => e as { code?: string; refusal?: { rule?: { provision?: string } } },
    );
    expect(err?.code).toBe('METRIC_NOT_OBSERVABLE');
    expect(err?.refusal?.rule?.provision).toBe('the honesty ceiling');
  });

  it('refuses a precedent payload that is not a list, rather than showing "no precedent"', async () => {
    /*
     * `Array.isArray(rows) ? rows : []` mapped a withheld or malformed payload to an empty
     * list on the one panel whose purpose is to stop the desk contradicting itself. That is
     * withheld collapsed into genuinely-empty, silently. `[]` now means the retriever found
     * nothing, and anything else is a refusal `PrecedentPanel` already renders.
     */
    request.mockReturnValue(envelope({ rows: 'withheld' }));
    await expect(desk.findPrecedent('tvtg')).rejects.toThrow(/is UNKNOWN — not "nothing"/);
  });
});

describe('the two POSTs are NOT behind the ceiling, and that is the fix rather than the gap', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════════════
   * These two tests assert a NON-refusal, which normally would be the wrong shape for a
   * doctrine test. They are here because the refusal they replace was a lie about a
   * database.
   *
   * `POST /v1/marketing/:id/triage` INSERTs into `object_actions` and calls `setReplyStatus`
   * BEFORE it builds its 201 body (`apps/api/src/routes/marketingDesk.ts:1240-1274`). A
   * ceiling walk of that body therefore throws with the ledger row already written and the
   * queue status already moved. `TriageAssessment.tsx:146` catches every throw and renders
   * `DATA_ABSENT_NOT_ZERO` with the rule text "Nothing was written, so this item is still
   * undecided." The operator would then be told to redo a decision that is already recorded,
   * on the authority of a screen that cannot see the database.
   *
   * That is the identical argument the lane wrote down to exempt `invokeMarketingAbuse`:
   * reporting a completed governed write as a failed one is a worse lie than the one the
   * guard would catch. `recordHandoff` has the same shape and its route is not mounted yet.
   *
   * WHAT IS STILL TRUE, so this is not read as a hole: neither response can put an
   * unobservable figure on a screen. `asHandoff` narrows to six named strings and
   * `recordTriage`'s caller reads only whether the result is `null`. If either payload ever
   * reaches a surface, the check belongs on the SERVER side of the write, before the INSERT.
   * ══════════════════════════════════════════════════════════════════════════════
   */
  it('returns the handoff record rather than claiming the row was not written', async () => {
    request.mockReturnValue(envelope({ id: 'h1', takenBy: 'nik', impressions: 12_000 }));
    const rec = await desk.recordHandoff(7, 'abc', 'drafting_room');
    expect(rec?.id).toBe('h1');
    // And the narrowing is what keeps the banned name off a screen: it is not carried over.
    expect(Object.keys(rec ?? {})).not.toContain('impressions');
  });

  it('returns the triage decision rather than claiming the item is still undecided', async () => {
    request.mockReturnValue(envelope({ replyId: 4, follower_delta: 12 }));
    await expect(desk.recordTriage({ ...triageWrite, indicators: [] })).resolves.toEqual({
      replyId: 4,
      follower_delta: 12,
    });
  });

  it('still reports an absent triage route as `null`, which is the branch that IS about the write', async () => {
    request.mockImplementation(() => Promise.reject(new ApiError(404)));
    await expect(desk.recordTriage({ ...triageWrite, indicators: [] })).resolves.toBeNull();
  });
});
