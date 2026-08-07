import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge, Button, Card, CardBody, CardHeader, Input, PageTitle, Select } from '@/components/ui';
import { PageSkeleton } from '@/components/shared';
import { request } from '@/lib/apiClient';
import {
  fetchControlRegister,
  type ControlRegister as Register,
  type ControlRegisterRefusal,
  type ControlRegisterRow,
} from '@/lib/api/governance';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE CONTROL REGISTER — governed acts that SUCCEEDED while a control did not run.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE BLIND DECISION THIS SCREEN EXISTS FOR. Somebody signs off that a governed
 * decision passed its controls — the board file, the WBR, a regulator response — and
 * every row in the audit log looks equally clean. `/audit-log` cannot answer "which
 * of these succeeded while a control was not evaluated", because the markers that
 * record it (`gateDegraded`, `overrideSat`, `overrideGate`, `idempotencyDegraded`)
 * were written to `audit_log.meta` for months with ZERO readers.
 *
 * ── WHAT THIS SCREEN WILL NOT DO ─────────────────────────────────────────────
 * It never shows a proportion of controls that passed. Not as a percentage, not as a
 * ratio, not as a reassuring green count. The API carries no such field — `coverage.
 * complete` is the literal `false` in the type — and the coverage panel below is
 * rendered unconditionally and NOT behind a disclosure control, because the one
 * reading a reader would take away from a clean-looking register is exactly the one
 * this register cannot support.
 *
 * ── THE THREE STATES, WHICH ARE THE POINT ────────────────────────────────────
 *   rows === null   NOT LOADED. The audit log could not be read. This is a fault,
 *                   not a finding, and it does not render as "nothing was missed".
 *   rows === []     GENUINELY EMPTY for the window — shown beside the window itself
 *                   AND the oldest row the log can reach, because "nothing found" is
 *                   only interpretable next to what was searched.
 *   pre-boundary    UNVERIFIABLE. Acts written before the youngest marker epoch
 *                   carry no marker because no marker existed to carry. They get
 *                   their own panel with the boundary date and commit named, and
 *                   they are NOT in the clean count.
 *
 * ── THIS PAGE MAKES NO JUDGEMENT ABOUT A VALUE ───────────────────────────────
 * It computes nothing. The rank, the consequence score, its components, the
 * remediation verdict and every refusal are the server's, rendered as sent. A
 * browser-side copy of the weights would be a second opinion about which governance
 * gap matters most, and the copy that drifted would be the one on the screen.
 */

const WINDOWS = [30, 90, 180, 365] as const;

/* ══════════════════════════════════════════════════════════════════════════════
 *  TWO MORE CONTROLS ON THIS SCREEN, AND WHY THEY ARE ON THIS ONE.
 *
 *  `verifyAuditSeal` (apps/api/src/access/seal.ts) and `entitlementsAsOf`
 *  (apps/api/src/access/asOf.ts) were built and tested against a real Postgres and
 *  had NO PRODUCTION CALLER — every reference outside their own files was a comment
 *  or a test. A seal nobody reads is not evidence. This screen is where a signer
 *  already comes to ask "what did the controls actually do", so it is where the
 *  answer to "is the record those controls are written into tamper-evident at all"
 *  belongs, and where "who could see this compartment on that date" belongs.
 *
 *  ── THE TYPES ARE DECLARED HERE, WHICH IS NOT WHERE THEY BELONG ──────────────
 *  Every other API shape in this app lives in `lib/api/*`. These do not, for one
 *  reason: `lib/api/governance.ts` is guarded by a ratchet
 *  (`apps/api/src/access/__tests__/controlRegister.test.ts`) that asserts its field
 *  DECLARATIONS are exactly the control-register contract's, and adding an unrelated
 *  interface above `fetchControlRegister` would fail it. Moving these into
 *  `lib/api/governance.ts` — below that boundary, or better, into `packages/shared`
 *  so the API and the browser import ONE declaration — is owed work and is named in
 *  the lane report rather than left to be discovered.
 *
 *  ── FOUR STATES FOR THE SEAL, NEVER THREE ───────────────────────────────────
 *    NOT INSTALLED  0070 has not been applied. This is TRUE OF PRODUCTION TODAY.
 *                   It renders as "this control is not installed" — never as
 *                   verified, and never as a blank panel, which reads as fine.
 *    INTACT         a chain exists and holds, over the region it says it covers.
 *    BROKEN         a chain exists and does not hold, at a named row.
 *    PRE-SEAL       rows written before the chain existed. Neither intact nor
 *                   broken: they were mutable and unchained for their whole life,
 *                   so a digest computed today would assert an integrity that was
 *                   never held. Its OWN panel, never folded into the verdict.
 *  Plus the two this screen owns rather than the API: NOT LOADED (transport) and
 *  NOT UNDERSTOOD (a payload whose shape this page cannot read — refused rather
 *  than rendered optimistically).
 * ════════════════════════════════════════════════════════════════════════════ */

interface SealFrame {
  observedAt: string;
  environment: string;
  source: string;
}

interface SealUndetected {
  id: string;
  statement: string;
  evidence: string;
}

type SealChain =
  | {
      kind: 'intact';
      rowsExamined: number;
      firstSeq: number;
      lastSeq: number;
      headDigest: string;
      coversWholeChain: boolean;
    }
  | {
      kind: 'broken';
      code: string;
      rule: string;
      message: string;
      reason: string;
      atRowId: string;
      atSeq: number;
      rowsExamined: number;
    }
  | { kind: 'empty'; message: string; rule: string };

type SealPreSeal =
  | { kind: 'none' }
  | {
      kind: 'unverifiable';
      code: string;
      rule: string;
      message: string;
      rows: number;
      liveUnsealedRows: number;
      snapshotAgreesWithLiveCount: boolean;
      boundaryRowId: string | null;
      boundaryRowAt: string | null;
    };

type SealUnsealed =
  | { kind: 'consistent'; rows: number }
  | { kind: 'excess'; code: string; message: string; rowIds: string[] }
  | { kind: 'diverged'; code: string; message: string };

type SealHead =
  | { kind: 'anchored'; lastSeq: number; sequenceLastValue: number }
  | { kind: 'gap'; code: string; message: string; missing: number }
  | { kind: 'unused' };

type SealCanonCheck =
  | { kind: 'skipped' }
  | { kind: 'agrees'; rowsCompared: number }
  | { kind: 'diverges'; code: string; message: string; rowIds: string[] };

interface SealReport {
  canonVersion: string;
  genesisDigest: string;
  sealedFrom: string;
  chain: SealChain;
  preSeal: SealPreSeal;
  unsealedRows: SealUnsealed;
  head: SealHead;
  canonCrossCheck: SealCanonCheck;
}

type SealVerification =
  | { kind: 'not_installed'; code: string; rule: string; message: string }
  | {
      kind: 'invalid_bounds';
      code: string;
      rule: string;
      message: string;
      offending: { option: string; value: unknown; why: string }[];
    }
  | { kind: 'sealed'; report: SealReport };

interface AuditSealPayload {
  control: string;
  migration: string;
  frame: SealFrame;
  verification: SealVerification;
  doesNotDetect: SealUndetected[];
}

interface AsOfBoundary {
  ledgerFloor: string;
  earliestReconstructedAt: string | null;
  reconstructedEvents: number;
}

interface AsOfHolding {
  memberId: string;
  workspace: string;
  capability: string;
  grantedBy: string;
  grantedAt: string;
  justification: string | null;
  provenance: 'observed' | 'reconstructed';
  attribution: 'named' | 'unattributed';
  eventId: string;
}

type AsOfAnswer =
  | {
      kind: 'known';
      at: string;
      atResolved: string;
      holdings: AsOfHolding[];
      genuinelyEmpty: boolean;
      eventsReplayed: number;
      boundary: AsOfBoundary;
    }
  | {
      kind: 'unknowable';
      code: string;
      rule: string;
      message: string;
      at: string;
      atResolved: string;
      boundary: AsOfBoundary;
    }
  | {
      kind: 'unanswerable';
      code: string;
      rule: string;
      message: string;
      at: string;
      unresolved: { field: string; value: string; why: string }[];
    }
  | { kind: 'ledger_absent'; code: string; rule: string; message: string; at: string };

interface AsOfPayload {
  control: string;
  migration: string;
  frame: SealFrame;
  answer: AsOfAnswer;
}

/**
 * NOT-LOADED and NOT-UNDERSTOOD are the two failures a panel owns itself.
 *
 * `'loading'` is a fourth thing again and is NOT rendered as empty: a panel that
 * renders nothing while a request is in flight reads exactly like a panel that read
 * the database and found nothing wrong.
 */
type Remote<T> = { state: 'loading' } | { state: 'fault'; why: string } | { state: 'ok'; data: T };

/**
 * The API wraps every payload as `{ data, meta }`. An envelope whose `data` is not an
 * object is NOT UNDERSTOOD — it is emphatically not an empty payload, and coercing it
 * to one would render a panel that looks like a clean read of an absent answer.
 */
function unwrap<T>(r: unknown): T {
  const d = (r as { data?: unknown } | null | undefined)?.data;
  return (d !== null && typeof d === 'object' ? d : {}) as T;
}

const SEAL_KINDS = ['not_installed', 'invalid_bounds', 'sealed'];
const CHAIN_KINDS = ['intact', 'broken', 'empty'];
const ASOF_KINDS = ['known', 'unknowable', 'unanswerable', 'ledger_absent'];

/** A payload this page cannot read is REFUSED. Optimistic rendering of an unknown
 *  shape is how a green panel appears over an answer nobody parsed. */
function understood(v: unknown, kinds: string[]): boolean {
  const k = (v as { kind?: unknown } | null | undefined)?.kind;
  return typeof k === 'string' && kinds.includes(k);
}

function NotUnderstood({ testId, what }: { testId: string; what: string }) {
  return (
    <div data-testid={testId} className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label">
      <p className="font-mono text-xs font-semibold text-status-blocked">NOT UNDERSTOOD</p>
      <p className="mt-1 text-navy">
        The {what} response did not have a shape this page can read, so no verdict is shown. This is a
        fault in the contract between this screen and the API. It is not a finding about {what}, in
        either direction.
      </p>
    </div>
  );
}

function NotLoaded({ testId, why, consequence }: { testId: string; why: string; consequence: string }) {
  return (
    <div data-testid={testId} className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label">
      <p className="font-mono text-xs font-semibold text-status-blocked">NOT LOADED</p>
      <p className="mt-1 text-navy">{why}</p>
      <p className="mt-1.5 text-micro text-grey-dark">{consequence}</p>
    </div>
  );
}

/** A stable code and the rule it cites, rendered the same way everywhere. */
function CodedRefusal({
  testId,
  code,
  headline,
  message,
  rule,
  tone = 'blocked',
}: {
  testId: string;
  code: string;
  headline: string;
  message: string;
  rule?: string;
  tone?: 'blocked' | 'unverified';
}) {
  const blocked = tone === 'blocked';
  return (
    <div
      data-testid={testId}
      className={clsx(
        'rounded-lg border p-3 text-label',
        blocked
          ? 'border-status-blocked/40 bg-status-blocked-bg/40'
          : 'border-status-unverified/40 bg-ice-soft/40 dark:bg-navy-deep/40',
      )}
    >
      <p className={clsx('font-mono text-xs font-semibold', blocked ? 'text-status-blocked' : 'text-status-unverified')}>
        {headline} · {code}
      </p>
      <p className="mt-1 text-navy">{message}</p>
      {rule && <p className="mt-1.5 text-micro text-grey-dark">Rule: {rule}</p>}
    </div>
  );
}

/**
 * THE SEAL PANEL.
 *
 * The one sentence this panel must never produce is "the audit log is verified" when
 * the seal is not installed, and the second is "the audit log is verified" full stop —
 * see `doesNotDetect`, which is rendered beside EVERY verdict the API returns and is
 * not behind a disclosure control, for the same reason the coverage panel above is.
 * It is not rendered when the read itself failed, because the array is the API's and
 * this page keeps no copy; that case is spelled out at the block itself.
 */
function AuditSealPanel({ remote }: { remote: Remote<AuditSealPayload> }) {
  return (
    <Card>
      <CardHeader>Is the audit log itself tamper-evident?</CardHeader>
      <CardBody>
        <div className="space-y-3" data-testid="seal-panel">
          {remote.state === 'loading' && (
            <p data-testid="seal-loading" className="text-label text-grey-dark">
              Reading the seal. Nothing has been verified yet, and this panel is not a verdict until
              it says so.
            </p>
          )}

          {remote.state === 'fault' && (
            <NotLoaded
              testId="seal-not-loaded"
              why={remote.why}
              consequence={
                'This is a fault, not a verdict. It is neither a finding that the chain is intact nor '
                + 'a finding that the seal is absent.'
              }
            />
          )}

          {remote.state === 'ok' && !understood(remote.data.verification, SEAL_KINDS) && (
            <NotUnderstood testId="seal-not-understood" what="audit seal" />
          )}

          {remote.state === 'ok' && understood(remote.data.verification, SEAL_KINDS) && (
            <SealVerdict payload={remote.data} />
          )}

          {/*
            THE LIMITS ARE RENDERED IN EVERY STATE THE API ANSWERED IN — not-installed,
            invalid-bounds, intact, broken — so a reader who only ever sees this panel
            red still does not come away believing a green one would have meant more
            than it does.

            THEY ARE NOT RENDERED WHEN THE READ FAILED OR IS STILL IN FLIGHT, and that
            is a limit of the fix rather than a decision: the array is the API's, this
            page holds no copy of it, and inventing one here would put the vocabulary in
            two places where the copy that drifted is the one an operator reads. In
            those two states there is no verdict on screen for a limit to qualify, and
            NOT LOADED says in its own words that nothing follows in either direction.
            (An earlier draft of this comment claimed the limits render in EVERY state
            including not-loaded. They did not, and do not.)
          */}
          {remote.state === 'ok' && Array.isArray(remote.data.doesNotDetect) && (
            <div data-testid="seal-limits" className="rounded-lg border border-line bg-ice-soft/40 p-3 dark:bg-navy-deep/40">
              <p className="text-micro font-semibold text-status-blocked">
                WHAT AN INTACT CHAIN IS NOT EVIDENCE OF
              </p>
              <ul className="mt-1.5 space-y-2">
                {remote.data.doesNotDetect.map((d) => (
                  <li key={d.id} className="text-micro text-grey-dark">
                    <span className="font-mono text-navy">{d.id}</span> — {d.statement}
                    <span className="block mt-0.5 italic">Established: {d.evidence}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function SealVerdict({ payload }: { payload: AuditSealPayload }) {
  const v = payload.verification;
  return (
    <>
      <div data-testid="seal-frame" className="text-micro text-grey-dark">
        Observed <span className="font-mono">{payload.frame?.observedAt}</span> · environment{' '}
        <span className="font-mono">{payload.frame?.environment}</span> · source{' '}
        <span className="font-mono">{payload.frame?.source}</span>.
      </div>

      {v.kind === 'not_installed' && (
        <div data-testid="seal-state" className="rounded-lg border border-status-unverified/50 bg-ice-soft/40 p-3 text-label dark:bg-navy-deep/40">
          <p className="font-mono text-xs font-semibold text-status-unverified">
            THIS CONTROL IS NOT INSTALLED · {v.code}
          </p>
          <p className="mt-1 text-navy">{v.message}</p>
          <p className="mt-1.5 text-micro text-grey-dark">
            Migration <span className="font-mono">{payload.migration}</span> would install it. Until it
            is applied there is no chain to verify — this is the ABSENCE of a control, which is not the
            same finding as a control that ran and held, and not the same as one that ran and failed.
          </p>
          <p className="mt-1.5 text-micro text-grey-dark">Rule: {v.rule}</p>
        </div>
      )}

      {v.kind === 'invalid_bounds' && (
        <CodedRefusal
          testId="seal-state"
          code={v.code}
          headline="NOT ATTEMPTED"
          message={v.message}
          rule={v.rule}
        />
      )}

      {/*
        `kind: 'sealed'` WITHOUT A `report` IS NOT UNDERSTOOD, NOT A CRASH. Measured:
        `SealedReport` read `report.chain` unguarded, so a payload carrying the kind and
        no report threw `Cannot read properties of undefined (reading 'chain')` out of
        render — React unmounted the whole tree and the operator got a BLANK PAGE. That
        is every state collapsed into no state at all, on the one screen whose job is
        telling four of them apart, and it takes the control register and the replay
        panel down with it.
      */}
      {v.kind === 'sealed' && (
        v.report !== null && typeof v.report === 'object'
          ? <SealedReport report={v.report} />
          : <NotUnderstood testId="seal-state" what="audit seal" />
      )}
    </>
  );
}

function SealedReport({ report }: { report: SealReport }) {
  const chain = report.chain;
  return (
    <>
      {!understood(chain, CHAIN_KINDS) ? (
        <NotUnderstood testId="seal-state" what="audit seal chain" />
      ) : chain.kind === 'intact' ? (
        <div data-testid="seal-state" className="rounded-lg border border-line bg-card p-3 text-label">
          <p className="font-mono text-xs font-semibold text-status-ready">
            INSTALLED · CHAIN HOLDS OVER THE ROWS IT EXAMINED
          </p>
          <p className="mt-1 text-navy">
            <span className="font-mono font-semibold">{chain.rowsExamined}</span> sealed row(s) examined,
            chain positions <span className="font-mono">{chain.firstSeq}</span>–
            <span className="font-mono">{chain.lastSeq}</span>. Every row&apos;s digest was recomputed
            in the API server process from the canonical string Postgres produced — not in your
            browser, and not by the database that stored it.
          </p>
          <p className="mt-1.5 text-micro text-grey-dark">
            {chain.coversWholeChain ? (
              <>
                This verdict covers the whole chain as far as the sequence can witness it. It says
                nothing about any segment reported separately below.
              </>
            ) : (
              <>
                <span className="font-semibold text-status-conditional">
                  THIS VERDICT DOES NOT COVER THE WHOLE CHAIN.
                </span>{' '}
                The walk was windowed, capped, or the head has a gap. Read it as a statement about
                positions {chain.firstSeq}–{chain.lastSeq} and about nothing else.
              </>
            )}
          </p>
          <p className="mt-1 font-mono text-micro text-grey">head {chain.headDigest}</p>
        </div>
      ) : chain.kind === 'broken' ? (
        <div data-testid="seal-state" className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label">
          <p className="font-mono text-xs font-semibold text-status-blocked">
            INSTALLED · CHAIN BROKEN · {chain.code}
          </p>
          <p className="mt-1 text-navy">{chain.message}</p>
          <p className="mt-1.5 font-mono text-micro text-grey-dark">
            reason {chain.reason} · row {chain.atRowId} · position {chain.atSeq} ·{' '}
            {chain.rowsExamined} row(s) examined before the break
          </p>
          <p className="mt-1.5 text-micro text-grey-dark">Rule: {chain.rule}</p>
        </div>
      ) : (
        <div data-testid="seal-state" className="rounded-lg border border-line bg-card p-3 text-label">
          <p className="font-mono text-xs font-semibold text-grey">INSTALLED · NO ROW HAS BEEN SEALED YET</p>
          <p className="mt-1 text-navy">{chain.message}</p>
          <p className="mt-1.5 text-micro text-grey-dark">Rule: {chain.rule}</p>
        </div>
      )}

      {/*
        THE FOURTH STATE. Its own panel, never folded into the verdict above.

        AND IT HAS THREE READINGS, NOT TWO. "there is no unverifiable segment" is a
        POSITIVE FINDING and only `kind: 'none'` may produce it. Measured: this block
        used `preSeal?.kind === 'unverifiable' ? refusal : "No audit row predates the
        seal"`, so an ABSENT or unrecognised `preSeal` rendered that reassurance — a
        claim manufactured out of a field the page never read, on the state the file's
        own header calls the one most easily lost. Absent is now NOT UNDERSTOOD.
      */}
      <div data-testid="seal-preseal">
        {report.preSeal?.kind === 'unverifiable' ? (
          <CodedRefusal
            testId="seal-preseal-refusal"
            code={report.preSeal.code}
            headline="UNVERIFIABLE — WRITTEN BEFORE THE SEAL EXISTED"
            message={report.preSeal.message}
            rule={report.preSeal.rule}
            tone="unverified"
          />
        ) : report.preSeal?.kind === 'none' ? (
          <p className="text-micro text-grey-dark">
            No audit row predates the seal on this environment, so there is no unverifiable segment.
          </p>
        ) : (
          <NotUnderstood testId="seal-preseal-not-understood" what="pre-seal segment" />
        )}
      </div>

      {report.unsealedRows?.kind === 'excess' && (
        <CodedRefusal
          testId="seal-unsealed"
          code={report.unsealedRows.code}
          headline="ROWS OUTSIDE THE CHAIN"
          message={report.unsealedRows.message}
        />
      )}
      {report.unsealedRows?.kind === 'diverged' && (
        <CodedRefusal
          testId="seal-unsealed"
          code={report.unsealedRows.code}
          headline="UNSEALED COUNT DOES NOT RECONCILE"
          message={report.unsealedRows.message}
        />
      )}

      {report.head?.kind === 'gap' && (
        <CodedRefusal
          testId="seal-head"
          code={report.head.code}
          headline="HEAD UNACCOUNTED FOR"
          message={report.head.message}
          tone="unverified"
        />
      )}

      {report.canonCrossCheck?.kind === 'diverges' && (
        <CodedRefusal
          testId="seal-canon"
          code={report.canonCrossCheck.code}
          headline="SPECIFICATION HAS TWO READINGS"
          message={report.canonCrossCheck.message}
          tone="unverified"
        />
      )}
    </>
  );
}

/**
 * AS OF — "what did this person hold on that date".
 *
 * NOTHING IS FETCHED UNTIL AN INSTANT IS SUPPLIED, and that is a doctrine decision
 * rather than a UX one. Loading this panel with `at = now` would answer a question
 * nobody asked in a payload identical in shape to an answer to the question they
 * meant — and "what do they hold today" is exactly what `entitlements` could already
 * tell you, which is the inadequacy the grant ledger exists to fix. The idle state
 * says so out loud instead of showing an empty table.
 */
function AsOfPanel() {
  const [at, setAt] = useState('');
  const [memberId, setMemberId] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [remote, setRemote] = useState<Remote<AsOfPayload> | null>(null);

  const ask = useCallback(() => {
    if (at.trim() === '') return;
    setRemote({ state: 'loading' });
    const qs = new URLSearchParams({ at: at.trim() });
    if (memberId.trim()) qs.set('memberId', memberId.trim());
    if (workspace.trim()) qs.set('workspace', workspace.trim());
    request<{ data: AsOfPayload }>(`/v1/governance/entitlements-as-of?${qs.toString()}`, { auth: true })
      .then((r) => setRemote({ state: 'ok', data: unwrap<AsOfPayload>(r) }))
      .catch((e) => setRemote({ state: 'fault', why: e instanceof Error ? e.message : 'Failed to load' }));
  }, [at, memberId, workspace]);

  return (
    <Card>
      <CardHeader>What did this person hold on that date?</CardHeader>
      <CardBody>
        <div className="space-y-3" data-testid="asof-panel">
          <p className="text-micro text-grey-dark">
            Replays the append-only grant ledger to an instant, so a revocation stops destroying the
            grant it revokes. An instant is REQUIRED — this panel will not answer &ldquo;as of
            now&rdquo; on your behalf, because that is a different question with an identical-looking
            answer.
          </p>

          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              label="Instant (ISO-8601, UTC)"
              data-testid="asof-at"
              value={at}
              placeholder="2026-07-12T00:00:00Z"
              onChange={(e) => setAt(e.target.value)}
            />
            <Input
              label="Member (optional)"
              data-testid="asof-member"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            />
            <Input
              label="Compartment (optional)"
              data-testid="asof-workspace"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            />
            <div className="flex items-end">
              <Button size="sm" data-testid="asof-submit" onClick={ask} disabled={at.trim() === ''}>
                Replay the ledger
              </Button>
            </div>
          </div>

          {remote === null && (
            <p data-testid="asof-idle" className="text-label text-grey-dark">
              NOT ASKED YET. No instant has been supplied, so no replay has been run. This is not an
              empty result and it is not a finding that nobody held anything.
            </p>
          )}

          {remote?.state === 'loading' && (
            <p data-testid="asof-loading" className="text-label text-grey-dark">Replaying…</p>
          )}

          {remote?.state === 'fault' && (
            <NotLoaded
              testId="asof-not-loaded"
              why={remote.why}
              consequence={
                'This is a fault, not an answer. It is not a finding that nobody held this '
                + 'compartment, and it is not a finding that the ledger is absent.'
              }
            />
          )}

          {remote?.state === 'ok' && !understood(remote.data.answer, ASOF_KINDS) && (
            <NotUnderstood testId="asof-not-understood" what="entitlement replay" />
          )}

          {remote?.state === 'ok' && understood(remote.data.answer, ASOF_KINDS) && (
            <AsOfAnswerBlock payload={remote.data} />
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function AsOfAnswerBlock({ payload }: { payload: AsOfPayload }) {
  const a = payload.answer;
  return (
    <div className="space-y-2" data-testid="asof-answer">
      <p className="text-micro text-grey-dark">
        Observed <span className="font-mono">{payload.frame?.observedAt}</span> · environment{' '}
        <span className="font-mono">{payload.frame?.environment}</span> · source{' '}
        <span className="font-mono">{payload.frame?.source}</span>.
      </p>

      {a.kind === 'ledger_absent' && (
        <div
          data-testid="asof-ledger-absent"
          className="rounded-lg border border-status-unverified/50 bg-ice-soft/40 p-3 text-label dark:bg-navy-deep/40"
        >
          <p className="font-mono text-xs font-semibold text-status-unverified">
            THIS CONTROL IS NOT INSTALLED · {a.code}
          </p>
          <p className="mt-1 text-navy">{a.message}</p>
          <p className="mt-1.5 text-micro text-grey-dark">
            Migration <span className="font-mono">{payload.migration}</span> would install it. Rule:{' '}
            {a.rule}
          </p>
        </div>
      )}

      {a.kind === 'unknowable' && (
        <CodedRefusal
          testId="asof-unknowable"
          code={a.code}
          headline="UNKNOWABLE — THE RECORD CANNOT REACH THIS INSTANT"
          message={a.message}
          rule={a.rule}
          tone="unverified"
        />
      )}

      {a.kind === 'unanswerable' && (
        <div data-testid="asof-unanswerable">
          <CodedRefusal
            testId="asof-unanswerable-refusal"
            code={a.code}
            headline="NOT ANSWERABLE AS ASKED"
            message={a.message}
            rule={a.rule}
          />
          <ul className="mt-1.5 space-y-0.5">
            {a.unresolved?.map((u) => (
              <li key={`${u.field}:${u.value}`} className="text-micro text-grey-dark">
                <span className="font-mono">{u.field}</span> = <span className="font-mono">{u.value}</span> — {u.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.kind === 'known' && (
        <div data-testid="asof-known" className="rounded-lg border border-line bg-card p-3 text-label">
          <p className="text-micro text-grey-dark">
            Replayed to <span className="font-mono">{a.atResolved}</span> (asked as{' '}
            <span className="font-mono">{a.at}</span>) over{' '}
            <span className="font-mono">{a.eventsReplayed}</span> ledger event(s). The ledger is
            complete from <span className="font-mono">{a.boundary?.ledgerFloor}</span>; below that it
            refuses rather than interpolating.
          </p>
          {a.genuinelyEmpty ? (
            <p className="mt-1.5 text-navy" data-testid="asof-genuinely-empty">
              GENUINELY EMPTY. The replay ran to completion and nobody held the queried scope at that
              instant. This is a real answer — it is not the ledger being absent, and it is not an
              instant the ledger cannot see, both of which refuse under their own codes instead.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5" data-testid="asof-holdings">
              {a.holdings.map((h) => (
                <li key={h.eventId} className="rounded border border-line p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-label font-semibold text-navy">
                      {h.memberId} · {h.workspace} · {h.capability}
                    </span>
                    {h.provenance === 'reconstructed' ? (
                      <Badge status="unverified">RECONSTRUCTED — NOT AN OBSERVED GRANT EVENT</Badge>
                    ) : (
                      <Badge status="ready">OBSERVED GRANT EVENT</Badge>
                    )}
                    {h.attribution === 'unattributed' && (
                      <Badge status="blocked">UNATTRIBUTED — NO RESPONSIBLE PARTY RECORDED</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-micro text-grey-dark">
                    Granted by <span className="font-mono">{h.grantedBy}</span> at{' '}
                    <span className="font-mono">{h.grantedAt}</span>
                    {h.justification ? <> — {h.justification}</> : <> — no justification recorded</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const FINDING_LABEL: Record<string, string> = {
  gate_not_evaluated: 'CONTROL DID NOT RUN',
  override_accepted: 'OVERRIDDEN WITH A REASON',
  idempotency_degraded: 'REPLAY GUARD NOT HELD',
};

/** One component, so a refusal always looks like a refusal and always cites its rule. */
function RefusalPanel({ refusal }: { refusal: ControlRegisterRefusal }) {
  return (
    <div
      data-testid={`refusal-${refusal.code}`}
      className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label"
    >
      <p className="font-mono text-xs font-semibold text-status-blocked">REFUSED · {refusal.code}</p>
      <p className="mt-1 text-navy">{refusal.sentence}</p>
      <p className="mt-1.5 text-micro text-grey-dark">
        Rule: <span className="font-mono">{refusal.rule.instrument} · {refusal.rule.provision}</span>
        {' — '}{refusal.rule.text}
      </p>
    </div>
  );
}

/**
 * Remediation is a THREE-valued badge and never a two-valued one. `unknown` gets its
 * own colour and its own word: collapsing it into "not filed" would state something
 * the server explicitly said it could not read.
 */
function RemediationBadge({ row }: { row: ControlRegisterRow }) {
  if (row.remediation === 'filed') {
    return (
      <Badge status="ready">
        REVIEW FILED AFTER
        {row.firstReviewAfter ? ` · ${row.firstReviewAfter.slice(0, 10)}` : ''}
      </Badge>
    );
  }
  if (row.remediation === 'not_filed') return <Badge status="blocked">NO REVIEW FILED SINCE</Badge>;
  return <Badge status="unverified">REVIEW STATE UNKNOWN — NOT READ</Badge>;
}

function RowCard({ row, rank }: { row: ControlRegisterRow; rank: number }) {
  return (
    <div
      data-testid={`control-row-${row.auditId}`}
      className="rounded-lg border border-line bg-card p-3 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-grey">#{rank}</span>
        <span className="font-mono text-label font-semibold text-navy">
          {row.subjectType ?? 'unattributed'} {row.subjectId ?? '?'}
        </span>
        {row.programCritical && <Badge status="blocked">PROGRAM-CRITICAL DECISION</Badge>}
        <RemediationBadge row={row} />
        <span className="ml-auto font-mono text-micro text-grey">{row.occurredAt}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {row.findings.map((f) => (
          <span
            key={f}
            className={clsx(
              'rounded border px-1.5 py-0.5 font-mono text-micro font-semibold',
              f === 'gate_not_evaluated'
                ? 'border-status-blocked/50 text-status-blocked'
                : 'border-status-conditional/50 text-status-conditional',
            )}
          >
            {FINDING_LABEL[f] ?? f}
          </span>
        ))}
      </div>

      <dl className="mt-2 space-y-1 text-micro text-grey-dark">
        <div>
          <dt className="inline font-semibold">Actor: </dt>
          <dd className="inline font-mono">{row.actor}</dd>
          {row.actorIsMachine && (
            <span className="ml-1.5 text-status-conditional">
              (machine principal — there is no human to ask what was intended)
            </span>
          )}
        </div>
        <div>
          <dt className="inline font-semibold">Action: </dt>
          <dd className="inline font-mono">{row.action}</dd>
          {row.recurrence > 1 && <span className="ml-1.5">· {row.recurrence} marked acts on this subject in the window</span>}
        </div>
        {row.gateDegradedReason && (
          <div><dt className="inline font-semibold">Gate: </dt><dd className="inline">{row.gateDegradedReason}</dd></div>
        )}
        {row.overrideReason && (
          <div><dt className="inline font-semibold">Override reason: </dt><dd className="inline">{row.overrideReason}</dd></div>
        )}
        {row.idempotencyReason && (
          <div><dt className="inline font-semibold">Replay guard: </dt><dd className="inline">{row.idempotencyReason}</dd></div>
        )}
      </dl>

      {/*
        THE RANK IS SHOWN WITH ITS ARITHMETIC. A bare number beside a governance
        finding is an authority claim; the component list is what makes it an argument
        a reader can disagree with. It is not behind a toggle for that reason.
      */}
      <div className="mt-2 border-t border-line pt-2" data-testid={`consequence-${row.auditId}`}>
        <p className="text-micro font-semibold text-grey">
          Consequence {row.consequence} — ordered by this, not by date. Every point is attributed:
        </p>
        <ul className="mt-1 space-y-0.5">
          {row.consequenceComponents.map((c) => (
            <li key={c.key} className="text-micro text-grey-dark">
              <span className="font-mono">+{c.points} {c.key}</span> — {c.because}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ControlRegister() {
  const [data, setData] = useState<Register | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(90);
  const [seal, setSeal] = useState<Remote<AuditSealPayload>>({ state: 'loading' });

  const load = useCallback(() => {
    setError(null);
    setData(null);
    fetchControlRegister({ windowDays })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [windowDays]);
  useEffect(load, [load]);

  /*
   * THE SEAL IS FETCHED ONCE AND NOT PER WINDOW. It is a property of the LOG, not of
   * the window being examined, and re-fetching it when the window changes would imply
   * the two are related. Bounds are deliberately not sent: the default walk is the
   * whole chain, and a capped walk would come back `coversWholeChain: false` — an
   * under-claim this screen has no reason to manufacture.
   */
  useEffect(() => {
    let live = true;
    setSeal({ state: 'loading' });
    request<{ data: AuditSealPayload }>('/v1/governance/audit-seal', { auth: true })
      .then((r) => { if (live) setSeal({ state: 'ok', data: unwrap<AuditSealPayload>(r) }); })
      .catch((e) => {
        if (live) setSeal({ state: 'fault', why: e instanceof Error ? e.message : 'Failed to load' });
      });
    return () => { live = false; };
  }, []);

  return (
    <div className="p-5">
      <PageTitle
        icon={<ShieldAlert size={20} />}
        subtitle="Governed acts that SUCCEEDED while one of their controls was not evaluated, was overridden, or threw — ranked by consequence, not by date."
        actions={(
          <Select
            value={String(windowDays)}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            aria-label="Window"
            options={WINDOWS.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
          />
        )}
      >
        Control Register
      </PageTitle>

      {/*
        THE SEAL SITS ABOVE THE REGISTER AND OUTSIDE ITS LOADING BRANCH, because it
        qualifies everything below it: this register reads `audit_log.meta`, and
        whether `audit_log` is tamper-evident at all is upstream of every row on the
        page. It must also stay on screen when the register itself fails to load —
        two independent reads, two independent verdicts, neither standing in for the
        other.
      */}
      <div className="mb-4 space-y-4">
        <AuditSealPanel remote={seal} />
      </div>

      {error !== null ? (
        <div data-testid="register-error" className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label">
          <p className="font-mono text-xs font-semibold text-status-blocked">NOT LOADED</p>
          <p className="mt-1 text-navy">{error}</p>
          <p className="mt-1.5 text-micro text-grey-dark">
            This is a fault, not a finding. It does not mean every control ran.
          </p>
        </div>
      ) : data === null ? (
        <PageSkeleton />
      ) : (
        <div className="space-y-4">
          {/*
            THE COVERAGE PANEL IS FIRST AND UNCONDITIONAL. It is the one claim the
            register must never let a reader make on its behalf, so it is not a footer
            and it is not collapsible.
          */}
          <Card>
            <CardHeader>What this register can and cannot see</CardHeader>
            <CardBody>
              <p data-testid="coverage-statement" className="text-label text-navy">
                {data.coverage.statement}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-micro font-semibold text-grey">COVERS</p>
                  <ul className="mt-1 space-y-0.5">
                    {data.coverage.covers.map((c) => (
                      <li key={c} className="text-micro text-grey-dark">· {c}</li>
                    ))}
                  </ul>
                </div>
                <div data-testid="coverage-gaps">
                  <p className="text-micro font-semibold text-status-blocked">DOES NOT COVER</p>
                  <ul className="mt-1 space-y-0.5">
                    {data.coverage.doesNotCover.map((c) => (
                      <li key={c} className="text-micro text-grey-dark">· {c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* The ObservationFrame. Every figure below is only readable beside this. */}
          <div data-testid="register-frame" className="rounded-lg border border-line bg-ice-soft/40 p-3 text-micro text-grey-dark dark:bg-navy-deep/40">
            <p>
              Observed <span className="font-mono">{data.frame.observedAt}</span> over{' '}
              <span className="font-mono">{data.frame.windowFrom}</span> →{' '}
              <span className="font-mono">{data.frame.windowTo}</span> ({data.frame.windowDays} days).
            </p>
            <p className="mt-1">
              Source <span className="font-mono">{data.frame.source}</span> · environment{' '}
              <span className="font-mono">{data.frame.environment}</span>.
            </p>
            {/*
              FOUR SENTENCES, NOT TWO, AND THAT IS THE POINT OF `auditLogEmpty`.
              `earliestReachableRow === null` alone meant three different facts: the
              table does not exist, the table exists and is EMPTY (real Postgres returns
              MIN() as NULL over zero rows), and the table has rows whose oldest
              timestamp could not be interpreted. The screen used to render all three as
              "could not be read ... unknown", which is an absence claimed about a read
              that succeeded — in the field whose declared job is keeping them apart.
            */}
            <p className="mt-1" data-testid="frame-depth">
              {data.frame.auditLogEmpty === null
                ? 'The oldest reachable audit row could not be read, so the depth of this window is unknown.'
                : data.frame.auditLogEmpty
                  ? 'The audit log was read and contains no rows at all — not one governed act has ever been recorded on this environment. That is why nothing is listed below.'
                  : data.frame.earliestReachableRow === null
                    ? 'The audit log was read and is not empty, but the timestamp of its oldest row could not be interpreted, so the depth of this window is unknown.'
                    : <>Oldest reachable audit row: <span className="font-mono">{data.frame.earliestReachableRow}</span>. Nothing before it can be examined at all.</>}
            </p>
            {!data.frame.indexesApplied && (
              <p className="mt-1 text-status-conditional">
                Migration 0069 is not applied on this environment: these reads are correct but sequential.
              </p>
            )}
          </div>

          {/* Every refusal, not the first one found. */}
          {data.refusals.length > 0 && (
            <div className="space-y-2" data-testid="register-refusals">
              {data.refusals.map((r) => <RefusalPanel key={r.code} refusal={r} />)}
            </div>
          )}

          {/*
            THE COUNTS. EVERY ONE OF THEM CAN BE NULL and null is never printed as 0.
            `scanned` and `shown` are rendered rather than merely carried on the
            contract, because they are how a reader sees a TRUNCATED register: the
            server refuses with CONTROL_REGISTER_TRUNCATED, and these two tiles are the
            arithmetic behind that sentence. Without them on screen the page could not
            admit a gap even when its own payload described one.
          */}
          <div className="grid gap-2 sm:grid-cols-3" data-testid="register-counts">
            <Count label="Marked acts in window" value={data.counts.markedInWindow} />
            <Count label="Governed acts in window" value={data.counts.governedActsInWindow} />
            <Count
              label="Post-boundary acts with no marker"
              value={data.counts.cleanInWindow}
              /*
                DELIBERATELY NOT PHRASED AS "not a pass rate". The test that guards this
                screen greps the whole document for the affirmative claim, and a
                DISCLAIMER containing the same words would satisfy the grep and make the
                ratchet useless. Say what the number is, not what it isn't.
              */
              note="A count of acts, over one window, from one marker source. There is no denominator here and no proportion is available — see what this register cannot see, above."
            />
            <Count
              label="Audit rows fetched"
              value={data.counts.scanned}
              note="Rows the two marker scans returned. The scans match on key existence, so this can exceed the number listed below without anything being missing."
            />
            <Count
              label="Marked acts listed below"
              value={data.counts.shown}
              note="Rows actually published in the register. Below either count above means the list is truncated — the server says so as CONTROL_REGISTER_TRUNCATED."
            />
          </div>

          {/* THE UNVERIFIABLE BUCKET — its own panel, never merged into the clean count. */}
          <Card>
            <CardHeader>Unverifiable — before the markers existed</CardHeader>
            <CardBody>
              <div data-testid="unverifiable-bucket" className="text-label text-navy">
                {data.unverifiable.governedActsInWindow === null ? (
                  <p>Not read: the audit log could not be counted, so how many acts predate the markers is unknown.</p>
                ) : (
                  <p>
                    <span className="font-mono font-semibold">{data.unverifiable.governedActsInWindow}</span> governed
                    act(s) in this window, and{' '}
                    <span className="font-mono font-semibold">{data.unverifiable.governedActsAllTime ?? '—'}</span>{' '}
                    in the audit log overall, were written before{' '}
                    <span className="font-mono">{data.unverifiable.boundary}</span>. They carry no marker because no
                    marker existed to carry. Their control state is UNKNOWN — that is not the same finding as a
                    control having been evaluated.
                  </p>
                )}
              </div>
              <ul className="mt-2 space-y-0.5">
                {data.unverifiable.epochs.map((e) => (
                  <li key={e.commit + e.marker} className="text-micro text-grey-dark">
                    <span className="font-mono">{e.date} {e.commit}</span> — {e.marker} ({e.site})
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {/* The fourth vocabulary. Present-but-withheld is a third state, not empty. */}
          <Card>
            <CardHeader>Gates that threw — the outbound gate ledger</CardHeader>
            <CardBody>
              <div data-testid="gate-errors" className="text-label text-navy">
                {data.gateErrors.state === 'not_loaded' && (
                  <p>NOT LOADED. There is no outbound-gate decision ledger on this environment, so gates that threw cannot be counted. This is not a count of zero.</p>
                )}
                {data.gateErrors.state === 'empty' && (
                  <p>No outbound-gate verdict in this window recorded a gate that threw. This ledger was read and is genuinely empty.</p>
                )}
                {data.gateErrors.state === 'present_but_withheld' && (
                  <>
                    <p>
                      <span className="font-mono font-semibold">{data.gateErrors.count}</span> outbound-gate verdict(s)
                      recorded a gate that THREW rather than refusing on the merits
                      {data.gateErrors.earliest && data.gateErrors.latest
                        ? <> (<span className="font-mono">{data.gateErrors.earliest.slice(0, 10)}</span> → <span className="font-mono">{data.gateErrors.latest.slice(0, 10)}</span>)</>
                        : null}.
                      An unavailable check is not a passed check.
                    </p>
                    <p className="mt-1.5 text-micro text-grey-dark">{data.gateErrors.withheldWhy}</p>
                  </>
                )}
              </div>
            </CardBody>
          </Card>

          {/* The register itself. */}
          {data.rows === null ? (
            <div data-testid="rows-not-loaded" className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3 text-label">
              <p className="font-mono text-xs font-semibold text-status-blocked">NOT LOADED</p>
              <p className="mt-1 text-navy">
                The audit log could not be read on this environment, so no governed act was examined. This register is
                empty because nothing was looked at — not because nothing was found.
              </p>
            </div>
          ) : data.rows.length === 0 ? (
            <div data-testid="rows-empty" className="rounded-lg border border-line bg-card p-3 text-label">
              <p className="font-mono text-xs font-semibold text-grey">NO MARKED ACTS IN THIS WINDOW</p>
              <p className="mt-1 text-navy">
                No governed act between <span className="font-mono">{data.frame.windowFrom}</span> and{' '}
                <span className="font-mono">{data.frame.windowTo}</span> carries a control marker.
                {data.frame.auditLogEmpty === true && (
                  <> The audit log was read and holds no rows at all, so this says nothing about controls — there
                    were no governed acts to examine.</>
                )}
                {data.frame.earliestReachableRow !== null && (
                  <> The oldest row this log can reach is <span className="font-mono">{data.frame.earliestReachableRow}</span>.</>
                )}
              </p>
              <p className="mt-1.5 text-micro text-grey-dark">
                This is a finding about the markers this register reads, and about nothing else. Read it beside what
                this register cannot see, above, and beside the unverifiable bucket.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5" data-testid="register-rows">
              {data.rows.map((r, i) => <RowCard key={r.auditId} row={r} rank={i + 1} />)}
            </div>
          )}
        </div>
      )}

      {/*
        AS OF is BELOW the register and outside its branch for the same reason the
        seal is above it: it answers a different question against a different table,
        and it must be reachable when the register cannot be read.
      */}
      <div className="mt-4">
        <AsOfPanel />
      </div>
    </div>
  );
}

/**
 * A count that refuses. `null` from the API means the read did not happen, and the one
 * thing a governance figure may never do is render that as `0`.
 */
function Count({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3" data-testid={`count-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <p className="text-micro font-semibold text-grey">{label.toUpperCase()}</p>
      {value === null ? (
        <p className="mt-0.5 font-mono text-label font-semibold text-status-unverified">NOT READ</p>
      ) : (
        <p className="mt-0.5 font-mono text-xl font-semibold text-navy">{value}</p>
      )}
      {note && <p className="mt-1 text-micro text-grey-dark">{note}</p>}
    </div>
  );
}
