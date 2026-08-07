import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ControlRegister } from '../ControlRegister';
import type { ControlRegister as Register } from '@/lib/api/governance';
import * as apiClient from '@/lib/apiClient';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE TWO CONTROLS THAT HAD NO SCREEN — AND THE ONE SENTENCE THEY MUST NOT SAY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `verifyAuditSeal` and `entitlementsAsOf` were built, tested against a real
 * Postgres, and reachable from nothing. This file is about what happens once they
 * ARE reachable, which is a different risk: a control that is NOT INSTALLED
 * rendering as reassurance.
 *
 * ── WHY THAT IS THE RISK AND NOT A HYPOTHETICAL ──────────────────────────────
 * 0069, 0070 and 0071 are NOT APPLIED TO PRODUCTION. So the answer this panel gives
 * on production TODAY is `AUDIT_SEAL_NOT_INSTALLED`, and the two ways to get that
 * wrong are both silent: render it as "verified" (a lie), or render nothing at all
 * (a panel with no red in it, which a signer reads as fine).
 *
 * ── FOUR STATES, AND THEY ARE FOUR ───────────────────────────────────────────
 *   NOT INSTALLED   0070 has not been applied. There is no chain to verify.
 *   INTACT          a chain exists and holds over the region it claims.
 *   BROKEN          a chain exists and does not hold, at a named row.
 *   PRE-SEAL        rows written before the chain existed — neither intact nor
 *                   broken, because they were mutable and unchained for their whole
 *                   life. Its own panel, ALONGSIDE an intact verdict, never inside
 *                   it. That co-occurrence is what test 4 exists for.
 * Plus NOT LOADED (transport) and NOT UNDERSTOOD (a payload shape this page cannot
 * read), which the page owns rather than the API.
 *
 * ── THE OVERCLAIM RATCHET ────────────────────────────────────────────────────
 * `docs/phases/P5_EVIDENCE.md` F9: `audit_log` and `audit_seal_state` are owned by
 * the role the API connects as, ownership alone permits `ALTER TABLE … DISABLE
 * TRIGGER ALL`, and an attack pass drove the REAL verifier against a re-chained
 * forgery and got INTACT, whole chain covered. The repo has already carried the
 * opposite claim once, and the evidence file says the overclaim is worth more than
 * the finding. Test 5 asserts, against a document showing a GREEN chain — the state
 * where a reader is most tempted — that the limits are on screen and that no
 * tamper-proof claim is.
 *
 * ── TEST DISCIPLINE ──────────────────────────────────────────────────────────
 * ASSERT-IN-WAITFOR. Positives inside the waitFor, negatives outside after a
 * positive barrier has settled: a `not.toMatch` inside a waitFor passes instantly
 * against an empty document, which is a false pass. `scripts/doctrine-lint.mjs`
 * rule 5 enforces it.
 *
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * jsdom has no layout and no paint, so "the not-installed state is impossible to
 * miss" is asserted as "it is in the document, carrying its code, not behind a
 * disclosure control". That is a real regression guard and it is not a claim about
 * what a human perceives. It also cannot see the route mount: at the time of
 * writing `router.tsx` does not route to this page and `app.ts` does not mount the
 * API router. Both are named in the lane report as owed wiring.
 */

vi.mock('@/lib/apiClient', async () => {
  const real = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return { ...real, request: vi.fn() };
});

const mockedRequest = apiClient.request as unknown as ReturnType<typeof vi.fn>;

// Braces, not a concise arrow: `mockReset()` RETURNS the mock, and vitest treats a
// hook's return value as a teardown callback and calls it. See the sibling suite.
beforeEach(() => {
  mockedRequest.mockReset();
});

/** A register in its least alarming legitimate state — this file is not about it. */
function register(): Register {
  return {
    contract: 'governance.control_register.v1',
    frame: {
      observedAt: '2026-08-06T12:00:00.000Z',
      windowFrom: '2026-05-08T12:00:00.000Z',
      windowTo: '2026-08-06T12:00:00.000Z',
      windowDays: 90,
      environment: 'production · db.example.supabase.co:5432',
      source: 'audit_log.meta',
      earliestReachableRow: '2026-06-01T00:00:00.000Z',
      auditLogEmpty: false,
      indexesApplied: false,
    },
    coverage: {
      complete: false,
      statement: 'This register cannot tell you what proportion of controls passed.',
      covers: ['actions/registry.ts invokeAction'],
      doesNotCover: ['controls enforced outside the action registry'],
    },
    rows: [],
    counts: { markedInWindow: 0, scanned: 0, shown: 0, governedActsInWindow: 200, cleanInWindow: 200 },
    unverifiable: {
      governedActsInWindow: 0,
      governedActsAllTime: 0,
      boundary: '2026-07-31T00:00:00.000Z',
      epochs: [],
    },
    gateErrors: { state: 'empty', count: 0, earliest: null, latest: null, withheldWhy: null },
    refusals: [],
  };
}

const FRAME = {
  observedAt: '2026-08-06T12:00:00.000Z',
  environment: 'production · db.example.supabase.co:5432',
  source: 'audit_log + audit_seal_state',
};

/** Verbatim from `access/seal.ts` — the array the API publishes on every answer. */
const DOES_NOT_DETECT = [
  {
    id: 'ownership_level_tampering',
    statement:
      'Tampering by the role the API itself connects as. audit_log and audit_seal_state are OWNED '
      + 'by that role, and ownership alone permits ALTER TABLE … DISABLE TRIGGER ALL. It is NOT '
      + 'evidence against whoever holds the application\'s database credential.',
    evidence: 'docs/phases/P5_EVIDENCE.md F9 — a probe drove this function against a re-chained log.',
  },
];

const sealPayload = (verification: unknown) => ({
  data: {
    control: 'audit_seal',
    migration: '0070_audit_seal.sql',
    frame: FRAME,
    verification,
    doesNotDetect: DOES_NOT_DETECT,
  },
  meta: {},
});

const asOfPayload = (answer: unknown) => ({
  data: {
    control: 'entitlement_ledger',
    migration: '0071_grant_ledger.sql',
    frame: { ...FRAME, source: 'entitlement_events' },
    answer,
  },
  meta: {},
});

/** The three endpoints this page reads, answered per path rather than in one blob. */
function serve(opts: { seal?: unknown; asOf?: unknown } = {}) {
  mockedRequest.mockImplementation(async (path: string) => {
    if (path.startsWith('/v1/governance/audit-seal')) {
      if (opts.seal instanceof Error) throw opts.seal;
      return opts.seal ?? sealPayload({ kind: 'not_installed', code: 'X', rule: 'r', message: 'm' });
    }
    if (path.startsWith('/v1/governance/entitlements-as-of')) {
      if (opts.asOf instanceof Error) throw opts.asOf;
      return opts.asOf;
    }
    if (path.startsWith('/v1/governance/control-register')) return register();
    throw new Error(`unexpected path: ${path}`);
  });
}

const pageText = () => document.body.textContent ?? '';
const asOfPaths = () =>
  mockedRequest.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => p.startsWith('/v1/governance/entitlements-as-of'));

const SEALED = (over: Record<string, unknown> = {}) =>
  sealPayload({
    kind: 'sealed',
    report: {
      canonVersion: 'lcx-audit-seal-v1',
      genesisDigest: 'b2dd1adc',
      sealedFrom: '2026-08-06T00:00:00.000Z',
      chain: {
        kind: 'intact',
        rowsExamined: 412,
        firstSeq: 1,
        lastSeq: 412,
        headDigest: 'ff00ff00',
        coversWholeChain: true,
      },
      preSeal: { kind: 'none' },
      unsealedRows: { kind: 'consistent', rows: 0 },
      head: { kind: 'anchored', lastSeq: 412, sequenceLastValue: 412 },
      canonCrossCheck: { kind: 'skipped' },
      ...over,
    },
  });

/* ════════════════════════════════════════════════════════════════════════════
 *  1. NOT INSTALLED — THE STATE PRODUCTION IS ACTUALLY IN
 * ════════════════════════════════════════════════════════════════════════════ */
describe('a control that is not installed says so, and is not mistaken for a clean one', () => {
  it('renders THIS CONTROL IS NOT INSTALLED with its code and the migration that would install it', async () => {
    serve({
      seal: sealPayload({
        kind: 'not_installed',
        code: 'AUDIT_SEAL_NOT_INSTALLED',
        rule: 'House doctrine: absent data refuses. A missing seal is reported as missing.',
        message:
          'audit_log carries no hash chain in this database: migration 0070_audit_seal.sql has not '
          + 'been applied. This is not a chain that failed; it is the absence of one.',
      }),
    });
    render(<ControlRegister />);

    await waitFor(() => {
      const t = screen.getByTestId('seal-state').textContent ?? '';
      expect(t).toMatch(/THIS CONTROL IS NOT INSTALLED/);
      expect(t).toMatch(/AUDIT_SEAL_NOT_INSTALLED/);
      expect(t).toMatch(/0070_audit_seal\.sql/);
      expect(t).toMatch(/absence of one/i);
    });

    // The two ways to get this wrong, both silent. Negatives, outside, after the barrier.
    const state = screen.getByTestId('seal-state').textContent ?? '';
    expect(state).not.toMatch(/\bverified\b/i);
    expect(state).not.toMatch(/CHAIN HOLDS/);
    expect(state).not.toMatch(/\bintact\b/i);
    // And the panel is not blank, which reads as fine.
    expect(state.trim().length).toBeGreaterThan(80);
  });

  it('a transport failure is NOT LOADED, which is a different sentence from NOT INSTALLED', async () => {
    serve({ seal: new Error('Network error') });
    render(<ControlRegister />);

    await waitFor(() => {
      const t = screen.getByTestId('seal-not-loaded').textContent ?? '';
      expect(t).toMatch(/NOT LOADED/);
      expect(t).toMatch(/fault, not a verdict/i);
      expect(t).toMatch(/neither a finding that the chain is intact/i);
    });

    // The three-state collapse this guards: a fault must not borrow the absent-control
    // sentence, and it must not borrow a verdict either.
    expect(screen.queryByTestId('seal-state')).toBeNull();
    expect(pageText()).not.toMatch(/THIS CONTROL IS NOT INSTALLED/);
  });

  it('a payload this page cannot parse is REFUSED, not rendered optimistically', async () => {
    serve({ seal: { data: { control: 'audit_seal', verification: { kind: 'probably_fine' } }, meta: {} } });
    render(<ControlRegister />);

    await waitFor(() => {
      const t = screen.getByTestId('seal-not-understood').textContent ?? '';
      expect(t).toMatch(/NOT UNDERSTOOD/);
      expect(t).toMatch(/not a finding about audit seal, in either direction/i);
    });
    expect(screen.queryByTestId('seal-state')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  2–4. INSTALLED: INTACT, BROKEN, AND THE PRE-SEAL SEGMENT BESIDE THEM
 * ════════════════════════════════════════════════════════════════════════════ */
describe('an installed seal reports intact, broken and pre-seal as three separate things', () => {
  it('an intact chain names how much it examined and whether that is the whole chain', async () => {
    serve({ seal: SEALED() });
    render(<ControlRegister />);

    await waitFor(() => {
      const t = screen.getByTestId('seal-state').textContent ?? '';
      expect(t).toMatch(/INSTALLED · CHAIN HOLDS OVER THE ROWS IT EXAMINED/);
      expect(t).toMatch(/412/);
      expect(t).toMatch(/covers the whole chain as far as the sequence can witness/i);
    });
  });

  it('a WINDOWED intact walk says out loud that it does not cover the whole chain', async () => {
    /*
     * The failure this pins: `coversWholeChain: false` arriving and the screen still
     * reading as "the log is intact". The flag exists because a capped walk, a
     * windowed walk and a head gap all produce a verdict that is true about a SUBSET,
     * and a subset verdict read as a whole-log verdict is the entire risk of the panel.
     */
    serve({
      seal: SEALED({
        chain: {
          kind: 'intact',
          rowsExamined: 50,
          firstSeq: 200,
          lastSeq: 249,
          headDigest: 'abcd',
          coversWholeChain: false,
        },
      }),
    });
    render(<ControlRegister />);

    await waitFor(() => {
      const t = screen.getByTestId('seal-state').textContent ?? '';
      expect(t).toMatch(/THIS VERDICT DOES NOT COVER THE WHOLE CHAIN/);
      expect(t).toMatch(/positions 200–249/);
    });
    expect(screen.getByTestId('seal-state').textContent).not.toMatch(/covers the whole chain as far as/i);
  });

  it('a broken chain names the row, the position and the reason', async () => {
    serve({
      seal: SEALED({
        chain: {
          kind: 'broken',
          code: 'AUDIT_SEAL_CHAIN_BROKEN',
          rule: 'House doctrine: an artefact every other honesty claim rests on must be sealed.',
          message:
            'Chain break at position 88 (row 7f3e): the row was altered after it was written. '
            + 'Rows after this point are NOT covered by this verdict.',
          reason: 'content_digest_mismatch',
          atRowId: '7f3e',
          atSeq: 88,
          rowsExamined: 88,
        },
      }),
    });
    render(<ControlRegister />);

    await waitFor(() => {
      const t = screen.getByTestId('seal-state').textContent ?? '';
      expect(t).toMatch(/INSTALLED · CHAIN BROKEN/);
      expect(t).toMatch(/AUDIT_SEAL_CHAIN_BROKEN/);
      expect(t).toMatch(/content_digest_mismatch/);
      expect(t).toMatch(/row 7f3e/);
      expect(t).toMatch(/position 88/);
    });
    expect(screen.getByTestId('seal-state').textContent).not.toMatch(/CHAIN HOLDS/);
  });

  it('PRE-SEAL rows get their own panel BESIDE an intact verdict, never inside it', async () => {
    /*
     * THE FOURTH STATE, AND THE ONE MOST EASILY LOST. Rows written before 0070 landed
     * were mutable and unchained for their whole life; a digest computed today would
     * assert an integrity that was never held and would produce a chain that LOOKS
     * verified back to the first row this platform ever wrote. So they are neither
     * intact nor broken — and the co-occurrence below is the assertion: the chain
     * verdict reads INTACT and the pre-seal refusal is on screen AT THE SAME TIME.
     */
    serve({
      seal: SEALED({
        preSeal: {
          kind: 'unverifiable',
          code: 'AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE',
          rule: 'House doctrine: an inference is never laundered into a certainty.',
          message:
            '1,204 audit row(s) were written before the seal existed and carry no digest. Their '
            + 'integrity is UNKNOWABLE — neither intact nor broken. Boundary: row 0a11.',
          rows: 1204,
          liveUnsealedRows: 1204,
          snapshotAgreesWithLiveCount: true,
          boundaryRowId: '0a11',
          boundaryRowAt: '2026-08-05T23:59:59.000Z',
        },
      }),
    });
    render(<ControlRegister />);

    await waitFor(() => {
      expect(screen.getByTestId('seal-state').textContent).toMatch(/CHAIN HOLDS OVER THE ROWS IT EXAMINED/);
    });
    await waitFor(() => {
      const t = screen.getByTestId('seal-preseal-refusal').textContent ?? '';
      expect(t).toMatch(/AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE/);
      expect(t).toMatch(/UNVERIFIABLE — WRITTEN BEFORE THE SEAL EXISTED/);
      expect(t).toMatch(/neither intact nor broken/i);
      expect(t).toMatch(/1,204/);
    });

    // The verdict must not have absorbed them: 1,204 unverifiable rows are not part of
    // the 412 the chain examined, and the verdict text must not mention them.
    expect(screen.getByTestId('seal-state').textContent).not.toMatch(/1,204/);
  });

  it('a sealed verdict with NO report is NOT UNDERSTOOD, and does not take the page down', async () => {
    /*
     * FOUND BY THE VERIFICATION PASS, NOT BY DESIGN. `SealedReport` read `report.chain`
     * unguarded while `understood()` only checked `verification.kind`. A payload
     * carrying `kind: 'sealed'` and no report threw
     *   TypeError: Cannot read properties of undefined (reading 'chain')
     * out of render. React unmounts the tree on a render throw, so the operator got a
     * BLANK PAGE — every state collapsed into no state at all, taking the control
     * register and the replay panel down with the seal.
     *
     * The barrier below is what proves it: if the page still crashed, `seal-panel`
     * would never appear and this would fail on the getByTestId, not on the text.
     */
    serve({ seal: sealPayload({ kind: 'sealed' }) });
    render(<ControlRegister />);

    await waitFor(() => {
      expect(screen.getByTestId('seal-state').textContent).toMatch(/NOT UNDERSTOOD/);
    });
    // The rest of the screen survived: this is one panel refusing, not a white screen.
    await waitFor(() => {
      expect(screen.getByTestId('asof-idle').textContent).toMatch(/NOT ASKED YET/);
    });
    const t = pageText();
    expect(t).not.toMatch(/CHAIN HOLDS/);
    expect(t).not.toMatch(/no unverifiable segment/);
  });

  it('an ABSENT preSeal is NOT UNDERSTOOD — never "there is no unverifiable segment"', async () => {
    /*
     * ALSO FOUND BY THE VERIFICATION PASS. The pre-seal block read
     *   preSeal?.kind === 'unverifiable' ? refusal : "No audit row predates the seal"
     * so a payload with NO preSeal field rendered that sentence — observed verbatim:
     *   "No audit row predates the seal on this environment, so there is no
     *    unverifiable segment."
     * That is a positive finding manufactured from a field the page never read, on the
     * fourth state this file's header calls the one most easily lost. Only
     * `kind: 'none'` may say it.
     */
    const { preSeal: _dropped, ...rest } = (SEALED().data.verification as { report: Record<string, unknown> }).report;
    serve({ seal: sealPayload({ kind: 'sealed', report: rest }) });
    render(<ControlRegister />);

    await waitFor(() => {
      const t = screen.getByTestId('seal-preseal-not-understood').textContent ?? '';
      expect(t).toMatch(/NOT UNDERSTOOD/);
      expect(t).toMatch(/not a finding about pre-seal segment, in either direction/i);
    });
    expect(pageText()).not.toMatch(/no unverifiable segment/);
    // The chain verdict itself is unaffected — one unreadable field, one refusal.
    expect(screen.getByTestId('seal-state').textContent).toMatch(/CHAIN HOLDS/);
  });

  it('rows outside the chain and a head gap are separate coded findings, not chain breaks', async () => {
    serve({
      seal: SEALED({
        unsealedRows: {
          kind: 'excess',
          code: 'AUDIT_SEAL_UNSEALED_ROWS_PRESENT',
          message: '3 row(s) are OUTSIDE the seal and outside the pre-seal segment.',
          rowIds: ['r1', 'r2', 'r3'],
        },
        head: {
          kind: 'gap',
          code: 'AUDIT_SEAL_HEAD_GAP',
          message:
            'The chain sequence has issued positions up to 415 but the highest row present is 412. '
            + 'TWO READINGS AND THIS SCHEMA CANNOT DISTINGUISH THEM.',
          missing: 3,
        },
      }),
    });
    render(<ControlRegister />);

    await waitFor(() => {
      expect(screen.getByTestId('seal-unsealed').textContent).toMatch(/AUDIT_SEAL_UNSEALED_ROWS_PRESENT/);
    });
    await waitFor(() => {
      const t = screen.getByTestId('seal-head').textContent ?? '';
      expect(t).toMatch(/AUDIT_SEAL_HEAD_GAP/);
      expect(t).toMatch(/TWO READINGS/);
    });
    // Neither is a chain break, and neither may be dressed as one.
    expect(screen.getByTestId('seal-state').textContent).not.toMatch(/CHAIN BROKEN/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  5. THE OVERCLAIM RATCHET (P5_EVIDENCE F9)
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the screen cannot claim the seal detects ownership-level tampering', () => {
  it('renders the limits beside a GREEN chain, and makes no tamper-proof claim', async () => {
    serve({ seal: SEALED() });
    render(<ControlRegister />);

    // Positive barrier: the green verdict AND the limits are both on screen.
    await waitFor(() => {
      expect(screen.getByTestId('seal-state').textContent).toMatch(/CHAIN HOLDS/);
    });
    await waitFor(() => {
      const t = screen.getByTestId('seal-limits').textContent ?? '';
      expect(t).toMatch(/WHAT AN INTACT CHAIN IS NOT EVIDENCE OF/);
      expect(t).toMatch(/ownership_level_tampering/);
      expect(t).toMatch(/DISABLE TRIGGER ALL/);
      expect(t).toMatch(/P5_EVIDENCE\.md F9/);
    });

    /*
     * THE NEGATIVES. The repo carried the claim that ownership-level tampering is
     * "still DETECTED after the fact"; it is false once the attacker re-chains, and a
     * probe proved the real verifier answers INTACT on a forgery. These are the
     * phrasings that would reintroduce it.
     */
    const t = pageText();
    expect(t).not.toMatch(/tamper-proof/i);
    expect(t).not.toMatch(/cannot be altered/i);
    expect(t).not.toMatch(/cannot be tampered/i);
    expect(t).not.toMatch(/detects any tampering/i);
    expect(t).not.toMatch(/guarantees the audit log/i);
    // And the register's own ratchet must still hold with the new panels present.
    expect(t).not.toMatch(/pass rate/i);
    expect(t).not.toMatch(/100%/);
  });

  it('renders the limits on a NOT-INSTALLED answer too, so a red-only reader still meets them', async () => {
    // A reader who never sees a green panel must still not believe a green one would
    // have meant more than it does.
    serve({
      seal: sealPayload({
        kind: 'not_installed',
        code: 'AUDIT_SEAL_NOT_INSTALLED',
        rule: 'r',
        message: 'migration 0070_audit_seal.sql has not been applied.',
      }),
    });
    render(<ControlRegister />);

    await waitFor(() => {
      expect(screen.getByTestId('seal-limits').textContent).toMatch(/ownership_level_tampering/);
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  6. AS OF — AND THE INSTANT IT REFUSES TO INVENT
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the entitlement replay never answers an instant nobody asked for', () => {
  it('asks nothing until an instant is supplied, and says so rather than showing an empty table', async () => {
    serve({});
    render(<ControlRegister />);

    await waitFor(() => {
      const t = screen.getByTestId('asof-idle').textContent ?? '';
      expect(t).toMatch(/NOT ASKED YET/);
      expect(t).toMatch(/not an empty result/i);
    });

    /*
     * THE LOAD-BEARING NEGATIVE. If the panel fetched on mount with `at = now`, it
     * would return `known` with real holdings and nothing on the payload would say
     * the instant was invented — "what did this person hold on 12 July" silently
     * becomes "what do they hold today", which is the answer `entitlements` could
     * already give and the inadequacy 0071 exists to fix.
     */
    expect(asOfPaths()).toHaveLength(0);
    expect(screen.queryByTestId('asof-answer')).toBeNull();
  });

  it('sends the instant verbatim once one is supplied — not a re-parsed Date', async () => {
    /*
     * `occurred_at` is a timestamptz at MICROSECOND precision and a JavaScript `Date`
     * holds milliseconds. Round-tripping an instant read out of the ledger lands up to
     * 999µs EARLY, and `occurred_at <= at` then excludes the very event the operator
     * pointed at. So the string must reach the query string unmodified.
     */
    serve({ asOf: asOfPayload({ kind: 'ledger_absent', code: 'ENTITLEMENT_LEDGER_ABSENT', rule: 'r', message: 'm', at: 'x' }) });
    render(<ControlRegister />);

    fireEvent.change(screen.getByTestId('asof-at'), { target: { value: '2026-07-12T09:15:00.123456Z' } });
    fireEvent.click(screen.getByTestId('asof-submit'));

    await waitFor(() => {
      expect(asOfPaths()[0]).toContain(encodeURIComponent('2026-07-12T09:15:00.123456Z'));
    });
  });

  it('LEDGER ABSENT renders as a control that is not installed, naming 0071', async () => {
    serve({
      asOf: asOfPayload({
        kind: 'ledger_absent',
        code: 'ENTITLEMENT_LEDGER_ABSENT',
        rule: 'House doctrine: absent data refuses.',
        message:
          'This database has no entitlement history: migration 0071_grant_ledger.sql has not been '
          + 'applied. This is the absence of a record, not a record of nothing.',
        at: '2026-07-12T00:00:00Z',
      }),
    });
    render(<ControlRegister />);

    fireEvent.change(screen.getByTestId('asof-at'), { target: { value: '2026-07-12T00:00:00Z' } });
    fireEvent.click(screen.getByTestId('asof-submit'));

    await waitFor(() => {
      const t = screen.getByTestId('asof-ledger-absent').textContent ?? '';
      expect(t).toMatch(/THIS CONTROL IS NOT INSTALLED/);
      expect(t).toMatch(/ENTITLEMENT_LEDGER_ABSENT/);
      expect(t).toMatch(/0071_grant_ledger\.sql/);
      expect(t).toMatch(/absence of a record, not a record of nothing/i);
    });
    // Never an empty holder set, which reads as "they held nothing".
    expect(screen.queryByTestId('asof-holdings')).toBeNull();
    expect(screen.queryByTestId('asof-genuinely-empty')).toBeNull();
  });

  it('UNKNOWABLE is its own answer — not empty, and not the ledger being absent', async () => {
    serve({
      asOf: asOfPayload({
        kind: 'unknowable',
        code: 'ENTITLEMENT_AS_OF_RECONSTRUCTED_ONLY',
        rule: 'House doctrine: an inference is never laundered into a certainty.',
        message:
          'The ledger is only complete from 2026-08-01. Below that the record is a photograph of '
          + 'the rows that happened to survive. Wrong in both directions is not a caveat; it is a '
          + 'refusal.',
        at: '2026-06-01T00:00:00Z',
        atResolved: '2026-06-01 00:00:00+00',
        boundary: { ledgerFloor: '2026-08-01T00:00:00.000Z', earliestReconstructedAt: '2026-05-01T00:00:00.000Z', reconstructedEvents: 12 },
      }),
    });
    render(<ControlRegister />);

    fireEvent.change(screen.getByTestId('asof-at'), { target: { value: '2026-06-01T00:00:00Z' } });
    fireEvent.click(screen.getByTestId('asof-submit'));

    await waitFor(() => {
      const t = screen.getByTestId('asof-unknowable').textContent ?? '';
      expect(t).toMatch(/UNKNOWABLE — THE RECORD CANNOT REACH THIS INSTANT/);
      expect(t).toMatch(/ENTITLEMENT_AS_OF_RECONSTRUCTED_ONLY/);
      expect(t).toMatch(/Wrong in both directions is not a caveat/);
    });
    expect(screen.queryByTestId('asof-holdings')).toBeNull();
    expect(screen.queryByTestId('asof-genuinely-empty')).toBeNull();
    expect(screen.queryByTestId('asof-ledger-absent')).toBeNull();
  });

  it('GENUINELY EMPTY is a real answer and says which of the three it is', async () => {
    serve({
      asOf: asOfPayload({
        kind: 'known',
        at: '2026-08-05T00:00:00Z',
        atResolved: '2026-08-05 00:00:00+00',
        holdings: [],
        genuinelyEmpty: true,
        eventsReplayed: 0,
        boundary: { ledgerFloor: '2026-08-01T00:00:00.000Z', earliestReconstructedAt: null, reconstructedEvents: 0 },
      }),
    });
    render(<ControlRegister />);

    fireEvent.change(screen.getByTestId('asof-at'), { target: { value: '2026-08-05T00:00:00Z' } });
    fireEvent.click(screen.getByTestId('asof-submit'));

    await waitFor(() => {
      const t = screen.getByTestId('asof-genuinely-empty').textContent ?? '';
      expect(t).toMatch(/GENUINELY EMPTY/);
      expect(t).toMatch(/not the ledger being absent/i);
      expect(t).toMatch(/not an instant the ledger cannot see/i);
    });
    expect(screen.queryByTestId('asof-ledger-absent')).toBeNull();
    expect(screen.queryByTestId('asof-unknowable')).toBeNull();
  });

  it('a RECONSTRUCTED holding is badged as reconstructed, never as an observed grant', async () => {
    /*
     * 0071 rebuilds one grant event per surviving `entitlements` row. That is a
     * photograph, not a history: it cannot see a grant that was later revoked and it
     * cannot see a revocation at all. Presenting it identically to an observed event
     * would launder the inference into a certainty on screen, which is exactly what
     * `provenance` exists to prevent.
     */
    serve({
      asOf: asOfPayload({
        kind: 'known',
        at: '2026-08-05T00:00:00Z',
        atResolved: '2026-08-05 00:00:00+00',
        holdings: [
          {
            memberId: 'monty', workspace: 'gps', capability: 'view',
            grantedBy: 'system:0042_backfill', grantedAt: '2026-05-01T00:00:00.000Z',
            justification: null, provenance: 'reconstructed', attribution: 'unattributed', eventId: 'e1',
          },
          {
            memberId: 'ada', workspace: 'governance', capability: 'operate',
            grantedBy: 'nikhil.sharma@lcx.com', grantedAt: '2026-08-02T00:00:00.000Z',
            justification: 'quarter-end review', provenance: 'observed', attribution: 'named', eventId: 'e2',
          },
        ],
        genuinelyEmpty: false,
        eventsReplayed: 9,
        boundary: { ledgerFloor: '2026-08-01T00:00:00.000Z', earliestReconstructedAt: '2026-05-01T00:00:00.000Z', reconstructedEvents: 4 },
      }),
    });
    render(<ControlRegister />);

    fireEvent.change(screen.getByTestId('asof-at'), { target: { value: '2026-08-05T00:00:00Z' } });
    fireEvent.click(screen.getByTestId('asof-submit'));

    await waitFor(() => {
      const t = screen.getByTestId('asof-holdings').textContent ?? '';
      expect(t).toMatch(/RECONSTRUCTED — NOT AN OBSERVED GRANT EVENT/);
      expect(t).toMatch(/UNATTRIBUTED — NO RESPONSIBLE PARTY RECORDED/);
      expect(t).toMatch(/OBSERVED GRANT EVENT/);
      expect(t).toMatch(/no justification recorded/);
      expect(t).toMatch(/quarter-end review/);
    });
    expect(screen.queryByTestId('asof-genuinely-empty')).toBeNull();
  });

  it('the replay panel survives the register failing to load — two reads, two verdicts', async () => {
    /*
     * The register and these two controls answer different questions against different
     * tables. A page that hid the seal and the replay whenever the register 500'd would
     * let one fault take three controls off the screen at once.
     */
    mockedRequest.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/governance/control-register')) throw new Error('Network error');
      if (path.startsWith('/v1/governance/audit-seal')) {
        return sealPayload({ kind: 'not_installed', code: 'AUDIT_SEAL_NOT_INSTALLED', rule: 'r', message: 'not applied' });
      }
      throw new Error(`unexpected path: ${path}`);
    });
    render(<ControlRegister />);

    await waitFor(() => {
      expect(screen.getByTestId('register-error').textContent).toMatch(/NOT LOADED/);
    });
    await waitFor(() => {
      expect(screen.getByTestId('seal-state').textContent).toMatch(/THIS CONTROL IS NOT INSTALLED/);
    });
    await waitFor(() => {
      expect(screen.getByTestId('asof-idle').textContent).toMatch(/NOT ASKED YET/);
    });
  });
});
