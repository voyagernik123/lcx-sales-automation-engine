import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge, Card, CardBody, CardHeader, PageTitle, Select } from '@/components/ui';
import { PageSkeleton } from '@/components/shared';
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

  const load = useCallback(() => {
    setError(null);
    setData(null);
    fetchControlRegister({ windowDays })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [windowDays]);
  useEffect(load, [load]);

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
