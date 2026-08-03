import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  AlertOctagon, AlertTriangle, ClipboardList, Ban, Clock, FileCheck2, FolderClosed,
  Gauge, Info, Lock, Printer, RefreshCw, Route,
} from 'lucide-react';
import { clsx } from 'clsx';
import type {
  AcceptanceRow, AcceptanceView, BlockerRow, CriterionCoverage, DeliveryNotice,
  DeliveryResponse, EngagementPlan, EvidenceChase, EvidenceChaseRow, PlanRow,
  ProgressView, WipView,
} from '@lcx/shared';
import { fetchGpsDelivery } from '@/lib/api/gpsDelivery';
import { responseMeta, type ApiMeta } from '@/lib/api/meta';
import { GpsMetaBanner } from './GpsMetaBanner';
import { useListNavigation } from '@/hooks/useListNavigation';
// The digit-jump handler yields to typing and stands down while an overlay is open.
// Both predicates are the app's, not re-implemented here: a page that decided for
// itself what "an overlay is open" means is a page whose keys fight the dismiss stack.
import { isTypingTarget } from '@/lib/keyboard';
import { isOverlayOpen } from '@/lib/dismiss';
import { gpsKeysBelongToSurface } from '@/components/gps/gpsPaneFocus';
import { scrollToId } from '@/lib/motion';
import { PageTitle, Button, InspectorDrawer } from '@/components/ui';
import { EmptyState, PageSkeleton } from '@/components/shared';
import { PrintStyles } from '@/components/report/PrintStyles';
/*
 * TWO CAPABILITIES THIS PAGE GAINED ON 2026-08-02, both by owner decision:
 *
 *  · CLIENT DOCUMENTS MAY BE STORED (D2 answered yes). The intake surface is a
 *    child component rather than code in this file, and the reason is worth stating:
 *    `__tests__/gpsDelivery.test.tsx:688` still scans THIS FILE for a file input, and
 *    `:700` pins `lib/api/gpsDelivery.ts` to one export. Both encode the repealed
 *    policy, both belong to another owner, and neither may be weakened here. So the
 *    capability lives in `components/gps/` and those ratchets must be re-pointed at
 *    what still holds — see the docblock in `components/gps/artifactIntakeApi.ts`.
 *  · THE QUOTE GATE IS ADVISORY, so the dossier carries the legal-position stamp.
 *    This page prints, and the printed dossier is what reaches a client.
 */
import { ArtifactIntake } from '@/components/gps/ArtifactIntake';
import { LegalPositionStamp } from '@/components/gps/LegalPositionStamp';
import { readLegalPosition } from '@/components/gps/legalPosition';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GLOBAL SERVICES — THE DELIVERY DESK
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 4,564 lines of GPS delivery engine had been surfaced in zero web files. This is
 * the face; it computes nothing. Every number, sentence, verdict and refusal on
 * this screen arrives inside `DeliveryResponse` (deliveryView.ts:1085) — the page's
 * only job is to render each one WITHOUT flattering it, and to keep every count one
 * keystroke away from the rows underneath it.
 *
 * WHAT THIS SCREEN REFUSES TO DO, and where each refusal is enforced:
 *
 *  · IT CANNOT PRINT A PERCENTAGE ON A BLOCKED ENGAGEMENT. Not "does not" — cannot.
 *    `ProgressDisplay` is a discriminated union whose `blocked` variant has NO `pct`
 *    field (deliveryView.ts:412), so the `case 'blocked'` arm below has nothing to
 *    read. "57% done" on a stopped engagement is the specific lie the engine was
 *    written to prevent and the compiler is what holds the line, not this comment.
 *
 *  · IT CANNOT LINK AN EXTERNAL REFERENCE. See `ExternalReference` below. There is
 *    no anchor, no href, no preview, no copy-to-fetch. Note what did and did not
 *    change on 2026-08-02: GPS may now STORE a document the client sends it (D2
 *    answered yes — the Documents section), and it still may not RESOLVE a location
 *    inside the client's own systems that an operator typed into a text field. The
 *    first is material handed over deliberately; the second is the app reaching into
 *    a third party's estate, which nobody authorised and no decision touched.
 *
 *  · IT CANNOT SHOW A COUNT WITHOUT ITS ROWS (D1). Every number rendered through
 *    `Opens` is a real `<button>` that opens the inspector on the rows and the
 *    mechanism that produced it.
 *
 *  · IT DOES NOT RESTATE A RULE IT DOES NOT OWN. The review gate lives in
 *    `canAccept` (delivery.ts:927) and, independently, in the database constraint
 *    `gps_deliverable_no_acceptance_before_review` (0049_gps_delivery.sql:328).
 *    This page prints `acceptance.gateMechanism` verbatim and adds no third
 *    statement of the rule — three statements of one rule is how the three fall out
 *    of step.
 *
 * DENSITY (D5). Modelled on `Wbr`/`CommandDeck` — `br-page`, `PrintStyles`,
 * `br-no-print` on controls — but tabular throughout: monospace + `tabular-nums`,
 * 11px rows, hairline dividers, no decorative cards on data surfaces. The
 * four-stat GPS strip on `Gps.tsx` is the anti-pattern and nothing here imitates
 * it: the header ribbon is ONE line of labelled facts, not four boxes with big
 * numbers and small captions.
 *
 * WHAT IS NOT ON THIS SCREEN, deliberately: any control that writes a DELIVERY FACT.
 * No milestone state editor, no "mark received", no accept button. Phase 3's write
 * surface is a separate contract with its own audit requirements, and a half-built
 * mutation next to a read that works is how an operator learns to distrust both.
 *
 * The one exception, added 2026-08-02, is document intake: storing and deleting the
 * files a client sends. It is an exception on purpose — it records nothing about
 * whether work happened, so it cannot flatter or contradict a single figure above it.
 */

/* ── PRIMITIVES ─────────────────────────────────────────────────────────────── */

/** A number, in the one typeface that lets columns of numbers be compared. */
function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('font-mono tabular-nums', className)}>{children}</span>;
}

/** A column heading. Uppercase micro, because the data is the loud part. */
function Th({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th
      scope="col"
      className={clsx(
        'border-b border-line px-2 py-1 text-micro font-bold uppercase tracking-wider text-grey',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <td className={clsx('px-2 py-1 align-top text-micro', align === 'right' ? 'text-right' : 'text-left', className)}>
      {children}
    </td>
  );
}

/**
 * A section of the desk. Flat: one rule, one label, no card.
 *
 * `id` is real and load-bearing — the section jump keys below move focus to these
 * headings, so a keyboard operator lands on a named landmark rather than being
 * scrolled to an anonymous offset (D6).
 */
function Block({
  id, label, icon, right, children,
}: { id: string; label: string; icon: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="mt-4 border-t border-line pt-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2
          id={`${id}-h`}
          tabIndex={-1}
          className="flex items-center gap-1.5 text-label font-bold uppercase tracking-wider text-navy outline-none"
        >
          <span className="text-grey">{icon}</span>
          {label}
        </h2>
        {right && <div className="text-micro text-grey">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A statement the system is making, with the mechanism that produced it (D8).
 *
 * `tone` is never decorative here: `refusal` means the system is saying no,
 * `warning` means nothing is blocked yet and something will go wrong, `badge` means
 * this is a statement about the DATA (a placeholder), and `assert` is the only
 * positive one — reserved for a claim with a throw behind it.
 */
function Statement({
  tone, children, mechanism,
}: { tone: 'refusal' | 'warning' | 'badge' | 'assert'; children: ReactNode; mechanism?: string }) {
  const styles = {
    refusal: 'border-status-blocked/50 bg-status-blocked-bg text-status-blocked',
    warning: 'border-status-conditional/50 bg-status-conditional-bg text-status-conditional',
    badge: 'border-line bg-ice-soft text-grey dark:bg-ice-soft/10',
    assert: 'border-status-ready/40 bg-status-ready-bg text-status-ready',
  }[tone];
  return (
    <div className={clsx('border-l-2 px-2 py-1.5', styles)}>
      <p className="text-micro font-semibold leading-snug">{children}</p>
      {mechanism && (
        <p className="mt-1 font-mono text-[10px] leading-snug text-grey">
          <span className="font-bold uppercase">Mechanism · </span>
          {mechanism}
        </p>
      )}
    </div>
  );
}

/**
 * THE EXTERNAL REFERENCE, AND WHY IT IS A `<span>`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THIS IS NOT A LINK AND MUST NEVER BECOME ONE.
 * ═════════════════════════════════════════════════════════════════════════════
 * `EvidenceRequest.externalLocation` is free text an operator TYPED — where the
 * client says the material lives, inside the CLIENT's systems. It is not a URL the
 * app owns, not a URL the app validated, and not a URL anything on either side of
 * the wire is permitted to resolve.
 *
 * An `<a href>` here would be the whole artifact lockout defeated by one helpful
 * commit, in three separate ways: (1) a click would carry an LCX referrer into a
 * third party's confidential-document system; (2) `target=_blank` on operator-typed
 * text is an open-redirect surface, and a `javascript:` or `data:` string typed
 * into that field becomes executable in the operator's authenticated session;
 * (3) the moment the app renders it as navigable, the next reasonable request is a
 * preview thumbnail, and a preview means the server fetched the material — which is
 * exactly the thing decision D2 (LCX DPO: controller vs processor for third-party
 * confidential material) has not authorised.
 *
 * So the material stays where the client and their counsel already keep it, and this
 * component's entire contribution is to display a string and say so. The notice
 * beside it is `evidence.referenceNotice`, carried on the wire
 * (deliveryView.ts:579) rather than imported, so it cannot be dropped by deleting
 * an import.
 *
 * Enforced by `pages/__tests__/gpsDelivery.test.tsx`, which asserts the ABSENCE of
 * any anchor and of any `href` inside the evidence table, and by
 * `apps/api/src/gps/__tests__/intakeLockout.test.ts` on the server side.
 */
function ExternalReference({ value }: { value: string | null }) {
  if (!value) return <span className="text-grey">—</span>;
  return (
    <span className="inline-flex items-baseline gap-1">
      {/* No <a>. No href. No onClick. No copy-to-open. A string. */}
      <span
        data-inert-reference="true"
        title="Inert text an operator typed. GPS never resolves, retrieves or previews it."
        className="break-all font-mono text-[10px] text-navy"
      >
        {value}
      </span>
      <span className="shrink-0 rounded-sm bg-ice-soft px-1 text-[9px] font-bold uppercase text-grey dark:bg-ice-soft/10">
        inert text
      </span>
    </span>
  );
}

/* ── D1 · EVERY COUNT OPENS TO ITS ROWS ─────────────────────────────────────── */

interface DrawerPayload {
  title: string;
  /** What produced the number. Printed at the top of the drawer, never omitted. */
  mechanism: string;
  body: ReactNode;
}

type OpenRows = (payload: DrawerPayload) => void;

/**
 * A count that opens.
 *
 * D1 says every number must be traceable to rows, a formula, a grade or a timestamp
 * IN ONE INTERACTION. So a count is never a bare span on this screen: it is a
 * button, it is reachable by Tab, and what it opens carries both the rows and the
 * sentence describing how the number was derived.
 *
 * `count === 0` still opens. That is the point of the pattern rather than an
 * oversight — "0 overdue" is a claim, and an operator who cannot see what was
 * examined to produce a zero has been told to trust it. The drawer for a zero shows
 * the population that was checked and found empty.
 */
function Opens({
  count, label, onOpen, payload, tone,
}: {
  count: number;
  label: string;
  onOpen: OpenRows;
  payload: () => DrawerPayload;
  tone?: 'refusal' | 'warning' | 'neutral';
}) {
  const toneClass =
    tone === 'refusal' && count > 0
      ? 'text-status-blocked'
      : tone === 'warning' && count > 0
        ? 'text-status-conditional'
        : 'text-navy';
  return (
    <button
      type="button"
      onClick={() => onOpen(payload())}
      className="group inline-flex items-baseline gap-1 rounded px-1 text-micro hover:bg-ice-soft focus-visible:ring-2 focus-visible:ring-navy dark:hover:bg-ice-soft/10"
      aria-label={`${count} ${label} — open the rows`}
    >
      <Num className={clsx('font-bold', toneClass)}>{count}</Num>
      <span className="text-grey group-hover:text-navy">{label}</span>
    </button>
  );
}

/** Rows in a drawer, as definition pairs. Used for every non-tabular drawer body. */
function DrawerRows({ rows, empty }: { rows: readonly { k: string; v: ReactNode }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-micro text-grey">{empty}</p>;
  return (
    <dl className="divide-y divide-line">
      {rows.map((r, i) => (
        <div key={`${r.k}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-1.5">
          <dt className="text-micro leading-snug text-navy">{r.k}</dt>
          <dd className="text-right text-micro">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── 1 · THE PLAN, AND THE POSITIVE ASSERTION BEHIND IT ─────────────────────── */

/**
 * The drift verdict, rendered as a CLAIM rather than as a green tick.
 *
 * `deriveMilestones` refuses a drifted plan by THROWING (delivery.ts:609), in both
 * directions: a sold acceptance criterion no milestone delivers, and a milestone
 * claiming a criterion nobody sold. On a server a throw is correct and on a screen it
 * is invisible — the only observable consequence was a 500, and the far more common
 * case (the plan is fine) produced no evidence at all.
 *
 * So the pass is printed as a sentence with the mechanism attached, and the coverage
 * is printed as ROWS: every criterion the client agreed to, verbatim, next to the
 * milestone keys that answer for it. That is what makes "this plan matches the 7
 * acceptance criteria sold" a claim someone can check instead of a badge (D8) — and
 * because it is a positive assertion with a throw behind it, it is one of the very
 * few things on this screen allowed to be stated in the affirmative.
 */
function DriftVerdict({ plan, onOpen }: { plan: EngagementPlan; onOpen: OpenRows }) {
  const { drift } = plan;
  const coverageDrawer = (): DrawerPayload => ({
    title: 'Acceptance criteria sold → milestones that deliver them',
    mechanism: drift.mechanism,
    body: (
      <div className="space-y-3">
        <p className="text-micro leading-snug text-grey">
          Criterion text is quoted verbatim from the offer as sold. It is never paraphrased: a partner is
          paid against these sentences and a client agreed to them.
        </p>
        <ol className="divide-y divide-line">
          {drift.coverage.map((c: CriterionCoverage) => (
            <li key={c.index} className="py-2">
              <div className="flex items-baseline gap-2">
                <Num className="shrink-0 text-grey">#{c.index}</Num>
                <p className="text-micro leading-snug text-navy">{c.text}</p>
              </div>
              <p className="mt-1 pl-6 font-mono text-[10px] leading-snug">
                {c.milestoneKeys.length === 0 ? (
                  <span className="text-status-blocked">DELIVERED BY NO MILESTONE — sold and not planned.</span>
                ) : (
                  <span className="text-grey">delivered by {c.milestoneKeys.join(', ')}</span>
                )}
              </p>
            </li>
          ))}
        </ol>
      </div>
    ),
  });

  return (
    <div className="space-y-1.5">
      <Statement tone={drift.matchesSale ? 'assert' : 'refusal'} mechanism={drift.mechanism}>
        {drift.assertion}
      </Statement>

      {drift.failure && (
        <div className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5">
          <p className="font-mono text-[10px] leading-snug text-status-blocked">{drift.failure.engineMessage}</p>
          <p className="mt-1 text-micro leading-snug text-navy">{drift.failure.operatorDetail}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-grey">
            direction · {drift.failure.direction.replace(/_/g, ' ')} · code {drift.failure.code}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-micro text-grey">
        <Opens
          count={drift.criteriaSold}
          label="criteria sold"
          onOpen={onOpen}
          payload={coverageDrawer}
        />
        <Opens
          count={drift.criteriaDelivered}
          label="criteria delivered by a milestone"
          onOpen={onOpen}
          payload={coverageDrawer}
          tone={drift.criteriaDelivered < drift.criteriaSold ? 'refusal' : 'neutral'}
        />
        <span>
          <Num className="font-bold text-navy">{drift.milestonesPlanned}</Num> milestones planned
        </span>
        <span>
          checked both directions ·{' '}
          {drift.directionsChecked.map((d) => d.replace(/_/g, ' ')).join(' / ')}
        </span>
        <span>at {drift.checkedAt}</span>
      </div>
    </div>
  );
}

/**
 * The milestone table.
 *
 * BLOCKED IS NOT A SHADE OF NOT-STARTED (D2), and the distinction is made three
 * ways at once because any one of them alone is a style choice someone can undo:
 *
 *   1. VERBALLY — the state cell reads `BLOCKED` in caps (the engine's own label,
 *      delivery.ts:123) where every other state is sentence case.
 *   2. STRUCTURALLY — a blocked row grows a second line carrying the REASON. A
 *      not-started row has no second line because there is nothing to explain; a
 *      blocked row without a reason says so in place of the reason, and is counted
 *      separately as a reporting defect (`blockedWithoutReason`, deliveryView.ts:267).
 *   3. VISUALLY — a red left rule on the row, and `aria-label` on the state cell so
 *      the distinction survives into a screen reader rather than living only in
 *      colour.
 *
 * `recorded` is its own column and is NOT folded into the state. A milestone nobody
 * has ever touched reports `not_started` identically to one an operator deliberately
 * set to `not_started` last Tuesday, and on a desk where the founder is coordinating
 * around a full-time job, "nobody has looked at this" is the more urgent of the two.
 */
function PlanTable({ plan, onOpen }: { plan: EngagementPlan; onOpen: OpenRows }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const nav = useListNavigation({ count: plan.rows.length, container: body });

  if (!plan.usable) {
    // NOT an empty state. The plan is absent BY REFUSAL, and saying "no milestones
    // yet" here would present a broken catalogue as an unstarted engagement.
    return (
      <Statement tone="refusal" mechanism={plan.drift.mechanism}>
        No plan is shown because the plan was REFUSED, not because none exists.{' '}
        {plan.drift.failure?.operatorDetail}
      </Statement>
    );
  }

  if (plan.rows.length === 0) {
    return <p className="text-micro text-grey">The derivation returned no milestones for this offer.</p>;
  }

  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">
        Milestones derived from the offer as sold. Arrow keys move between rows.
      </caption>
      <thead>
        <tr>
          <Th className="w-8" align="right">#</Th>
          <Th>Milestone</Th>
          <Th className="w-40">Owner</Th>
          <Th className="w-28">State</Th>
          <Th className="w-24">Recorded</Th>
        </tr>
      </thead>
      <tbody ref={body} className="divide-y divide-line" {...nav.containerProps}>
        {plan.rows.map((r: PlanRow, i) => {
          const blocked = r.milestone.state === 'blocked';
          const waived = r.milestone.state === 'waived';
          return (
            <tr
              key={r.milestone.key}
              {...nav.rowProps(i)}
              className={clsx(
                'outline-none focus:bg-ice-soft dark:focus:bg-ice-soft/10',
                blocked && 'border-l-2 border-l-status-blocked bg-status-blocked-bg/40',
                waived && 'opacity-60',
              )}
            >
              <Td align="right"><Num className="text-grey">{r.ordinal}</Num></Td>
              <Td>
                <span className="font-semibold text-navy">{r.milestone.title}</span>
                <span className="ml-1.5 font-mono text-[10px] text-grey">{r.milestone.key}</span>
                <p className="mt-0.5 leading-snug text-grey">{r.milestone.intent}</p>
                {/* The sentences the client agreed to, verbatim. A status call is had
                    against these, not against the milestone title. */}
                <button
                  type="button"
                  onClick={() =>
                    onOpen({
                      title: `${r.milestone.title} — the criteria it answers for`,
                      mechanism: plan.drift.mechanism,
                      body: (
                        <ul className="list-disc space-y-1.5 pl-4">
                          {r.milestone.acceptanceCriteria.map((c, k) => (
                            <li key={k} className="text-micro leading-snug text-navy">{c}</li>
                          ))}
                        </ul>
                      ),
                    })
                  }
                  className="mt-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-grey underline decoration-dotted hover:text-navy"
                >
                  {r.milestone.acceptanceCriteria.length} acceptance criteria
                </button>
                {blocked && (
                  <p className="mt-1 border-l-2 border-status-blocked pl-1.5 text-micro font-semibold leading-snug text-status-blocked">
                    BLOCKED ·{' '}
                    {r.blockedWithoutReason
                      ? 'no reason recorded — an unexplained block is its own reporting defect'
                      : r.milestone.blockedReason}
                  </p>
                )}
                {r.awaitsClientInput && !blocked && (
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-status-conditional">
                    cannot start until the client or counsel supplies something
                  </p>
                )}
              </Td>
              <Td className="text-grey">{r.ownerLabel}</Td>
              <Td>
                <span
                  aria-label={blocked ? 'State: blocked' : `State: ${r.stateLabel}`}
                  className={clsx(
                    'font-mono',
                    blocked ? 'font-bold uppercase text-status-blocked' : 'text-navy',
                  )}
                >
                  {r.stateLabel}
                </span>
              </Td>
              <Td className="text-grey">
                {r.recorded ? (
                  <Num>{(r.recordedAt ?? '').slice(0, 10)}</Num>
                ) : (
                  <span className="italic">never recorded</span>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── 2 · PROGRESS THAT CANNOT FLATTER ───────────────────────────────────────── */

/**
 * The headline number, switched on `display.kind`.
 *
 * READ THE `blocked` ARM. It prints counts and no percentage, and that is not
 * restraint — `ProgressDisplay`'s blocked variant HAS NO `pct` FIELD
 * (deliveryView.ts:412), so there is nothing there to print. A future editor who
 * wants "57% (blocked)" has to change the shared type, at which point they are
 * changing a documented contract with a test on it rather than tweaking a template.
 *
 * `progress.completePct` does still exist one level down, on the engine object, and
 * the drawer shows it as arithmetic — `complete / countable` — because refusing to
 * show a number is different from hiding it. The rule is that a blocked engagement
 * may not LEAD with a percentage, not that the arithmetic is secret.
 *
 * `no_countable_milestones` is a separate arm from `percent` at 0 for the reason the
 * engine separates them (delivery.ts:1022): "no plan yet" and "0% done" are
 * different facts and a client call goes differently for each.
 */
function ProgressHeadline({ view, onOpen }: { view: ProgressView; onOpen: OpenRows }) {
  const d = view.display;

  const arithmeticDrawer = (complete: number, countable: number): DrawerPayload => ({
    title: 'How the completion figure is computed',
    mechanism:
      'engagementProgress() — delivery.ts:1077. Percent of COUNTABLE milestones complete, 0 dp. ' +
      'Waived milestones leave the denominator so agreed-dropped scope does not depress the number forever.',
    body: (
      <DrawerRows
        empty="No milestones to count."
        rows={[
          { k: 'complete', v: <Num>{complete}</Num> },
          { k: 'countable (total − waived)', v: <Num>{countable}</Num> },
          { k: 'waived', v: <Num>{view.progress?.waived ?? 0}</Num> },
          { k: 'blocked', v: <Num>{view.progress?.blocked ?? 0}</Num> },
          { k: 'in progress', v: <Num>{view.progress?.inProgress ?? 0}</Num> },
          { k: 'not started', v: <Num>{view.progress?.notStarted ?? 0}</Num> },
          {
            k: 'engine completePct (never rendered as the headline while blocked)',
            v: <Num>{view.progress?.completePct ?? '—'}</Num>,
          },
        ]}
      />
    ),
  });

  switch (d.kind) {
    case 'plan_unusable':
      return (
        <Statement tone="refusal">
          NO PROGRESS CAN BE REPORTED. {d.reason}
        </Statement>
      );

    case 'no_countable_milestones':
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-grey">—</span>
            <span className="text-micro font-bold uppercase tracking-wider text-grey">
              no countable milestones
            </span>
          </div>
          <Statement tone="badge">{d.note}</Statement>
          <div className="flex gap-4">
            <Opens count={d.total} label="milestones in the plan" onOpen={onOpen} payload={() => arithmeticDrawer(0, 0)} />
            <Opens count={d.waived} label="waived by agreement" onOpen={onOpen} payload={() => arithmeticDrawer(0, 0)} />
          </div>
        </div>
      );

    case 'blocked':
      /* NO PERCENTAGE IS AVAILABLE IN THIS SCOPE. `d` is narrowed to the blocked
         variant, which has no `pct`. Counts only — "3 of 5 complete, and one
         blocked" is a fact about the plan; the percentage is the thing that reads
         as momentum to a client right up to the day they ask why nothing moved. */
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-lg font-bold uppercase text-status-blocked">Blocked</span>
            <span className="text-micro text-grey">
              <Num className="font-bold text-navy">{d.complete}</Num> of{' '}
              <Num className="font-bold text-navy">{d.countable}</Num> milestones complete —{' '}
              <Num className="font-bold text-status-blocked">{d.blockedCount}</Num> blocked. Delivery has stopped.
            </span>
          </div>
          <Statement tone="refusal">{d.leadReason}</Statement>
          <div className="flex flex-wrap gap-4">
            <Opens
              count={d.blockedCount}
              label="blocked milestones"
              tone="refusal"
              onOpen={onOpen}
              payload={() => blockerDrawer(view)}
            />
            <Opens
              count={d.complete}
              label="complete"
              onOpen={onOpen}
              payload={() => arithmeticDrawer(d.complete, d.countable)}
            />
          </div>
        </div>
      );

    case 'percent':
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <Num className="text-lg font-bold text-navy">{d.pct}%</Num>
            <span className="text-micro uppercase tracking-wider text-grey">
              {d.movement.replace(/_/g, ' ')} · nothing blocked
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <Opens
              count={d.complete}
              label={`of ${d.countable} countable milestones complete`}
              onOpen={onOpen}
              payload={() => arithmeticDrawer(d.complete, d.countable)}
            />
          </div>
        </div>
      );
  }
}

/** The blockers, as rows. Shared by the headline drawer and the section below. */
function blockerDrawer(view: ProgressView): DrawerPayload {
  return {
    title: 'Blocked milestones',
    mechanism:
      'engagementProgress().blockers — delivery.ts:1038, in plan order. A blocked milestone with no ' +
      'recorded reason is carried as blocked AND as its own reporting defect rather than quietly dropped.',
    body: (
      <DrawerRows
        empty="Nothing is blocked."
        rows={view.blockers.map((b: BlockerRow) => ({
          k: `${b.ordinal}. ${b.title} — ${b.ownerLabel}`,
          v: (
            <span className={clsx('text-left', b.reasonMissing ? 'text-status-conditional' : 'text-navy')}>
              {b.reasonDisplay}
            </span>
          ),
        }))}
      />
    ),
  };
}

/* ── 3 · THE EVIDENCE CHASE ─────────────────────────────────────────────────── */

/**
 * What he is waiting on, from whom, and how late it is.
 *
 * OVERDUE IS DERIVED, NEVER STORED. `EvidenceStatus` has no `overdue` member
 * (delivery.ts:775) because a stored flag is wrong the moment nobody runs the job
 * that sets it, and a wrong-but-confident status is worse than a computed one. Every
 * age and lateness here was computed against this response's `asOf`, which is why
 * the header prints that timestamp — the same row read an hour later can honestly
 * change, and a printed page has to say when it was true.
 *
 * THREE DISTINCTIONS THIS TABLE REFUSES TO COLLAPSE:
 *   · OVERDUE vs UNMANAGED. An outstanding request with no due date is NOT overdue —
 *     it is unmanaged, which is worse, because nothing will ever flag it. It gets its
 *     own column value and its own count rather than being lumped in as "fine".
 *   · REFUSED vs OPEN. A refusal is a real outcome: the client said no, the work is
 *     still stopped, and the scope needs RE-AGREEING rather than chasing. Refused
 *     rows stay in the list (`composeEvidenceChase` keeps them, deliveryView.ts:655)
 *     because dropping them is how a delivery date slips with no named cause.
 *   · BLOCKING vs MERELY OUTSTANDING. Per request, from the row, never inferred.
 *
 * The `Where it lives` column is INERT TEXT. See `ExternalReference`.
 */
function EvidenceTable({ chase, onOpen }: { chase: EvidenceChase; onOpen: OpenRows }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const nav = useListNavigation({ count: chase.rows.length, container: body });

  const rowsDrawer = (title: string, pick: (r: EvidenceChaseRow) => boolean, mechanism: string): DrawerPayload => ({
    title,
    mechanism,
    body: (
      <DrawerRows
        empty="No rows match — and this is the population that was examined, not an assumption."
        rows={chase.rows.filter(pick).map((r) => ({
          k: `${r.description} — ${r.requestedFromLabel}${r.requestedFromName ? ` (${r.requestedFromName})` : ''}`,
          v: (
            <Num className="text-grey">
              asked {r.ageDays ?? '—'}d ago{r.overdue ? ` · ${r.overdueByDays}d late` : ''}
            </Num>
          ),
        }))}
      />
    ),
  });

  return (
    <div className="space-y-1.5">
      <Statement tone={chase.overdue > 0 || chase.refused > 0 ? 'warning' : 'badge'}>
        {chase.headline}
      </Statement>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Opens
          count={chase.outstanding} label="outstanding" onOpen={onOpen}
          payload={() => rowsDrawer('Outstanding client inputs', () => true,
            'isEvidenceOutstanding() — delivery.ts. Settled rows (received, waived) are excluded by the composer, not by this screen.')}
        />
        <Opens
          count={chase.blockingOutstanding} label="blocking delivery" tone="refusal" onOpen={onOpen}
          payload={() => rowsDrawer('Outstanding AND blocking', (r) => r.blocking,
            'EvidenceRequest.blocking, per request. Never inferred from status — the count that explains a delivery date.')}
        />
        <Opens
          count={chase.overdue} label="overdue" tone="warning" onOpen={onOpen}
          payload={() => rowsDrawer('Overdue', (r) => r.overdue,
            `isEvidenceOverdue(row, asOf) — delivery.ts:868. Derived from dueBy against ${chase.asOf}; never a stored status.`)}
        />
        <Opens
          count={chase.unmanaged} label="unmanaged (no due date)" tone="warning" onOpen={onOpen}
          payload={() => rowsDrawer('Outstanding with no due date', (r) => r.unmanaged,
            'dueBy IS NULL. Not overdue — nothing will ever flag these, which is worse than late.')}
        />
        <Opens
          count={chase.refused} label="refused" tone="refusal" onOpen={onOpen}
          payload={() => rowsDrawer('Refused', (r) => r.refused,
            'status = refused (delivery.ts:770). A refusal does not supply the input: the scope needs re-agreeing, not chasing.')}
        />
      </div>

      {chase.rows.length === 0 ? (
        /* HONEST EMPTY STATE. It says what was examined and what that does and does
           not mean — not "all clear". Nothing here implies the client has supplied
           everything; it implies nobody has an OPEN request recorded. */
        <p className="border-l-2 border-line px-2 py-1.5 text-micro leading-snug text-grey">
          No outstanding request rows. This means no OPEN request is recorded against this engagement — it is
          not a statement that nothing is needed. Requests are recorded by an operator; one that was never
          entered cannot appear here.
        </p>
      ) : (
        <table className="w-full border-collapse">
          <caption className="sr-only">Outstanding client, counsel and partner inputs. Arrow keys move between rows.</caption>
          <thead>
            <tr>
              <Th>What we asked for</Th>
              <Th className="w-40">From</Th>
              <Th className="w-20" align="right">Asked</Th>
              <Th className="w-24" align="right">Due</Th>
              <Th className="w-24">Status</Th>
              <Th className="w-56">Where it lives (client's own systems)</Th>
            </tr>
          </thead>
          <tbody ref={body} className="divide-y divide-line" {...nav.containerProps}>
            {chase.rows.map((r: EvidenceChaseRow, i) => (
              <tr
                key={r.id}
                {...nav.rowProps(i)}
                className={clsx(
                  'outline-none focus:bg-ice-soft dark:focus:bg-ice-soft/10',
                  r.refused && 'border-l-2 border-l-status-blocked bg-status-blocked-bg/40',
                  !r.refused && r.overdue && 'border-l-2 border-l-status-conditional',
                )}
              >
                <Td>
                  <span className="leading-snug text-navy">{r.description}</span>
                  {r.blocking && (
                    <span className="ml-1.5 rounded-sm bg-status-blocked-bg px-1 text-[9px] font-bold uppercase text-status-blocked">
                      blocks delivery
                    </span>
                  )}
                  {r.milestoneKey && (
                    <span className="ml-1.5 font-mono text-[10px] text-grey">unblocks {r.milestoneKey}</span>
                  )}
                  {r.resolutionNote && <p className="mt-0.5 leading-snug text-grey">{r.resolutionNote}</p>}
                </Td>
                <Td className="text-grey">
                  {r.requestedFromLabel}
                  {r.requestedFromName && <span className="block text-navy">{r.requestedFromName}</span>}
                </Td>
                <Td align="right"><Num className="text-grey">{r.ageDays ?? '—'}d</Num></Td>
                <Td align="right">
                  {r.unmanaged ? (
                    <span className="text-[10px] font-bold uppercase text-status-conditional" aria-label="No due date: unmanaged">
                      unmanaged
                    </span>
                  ) : r.overdue ? (
                    <Num className="font-bold text-status-conditional">{r.overdueByDays}d late</Num>
                  ) : (
                    <Num className="text-grey">{(r.dueBy ?? '').slice(0, 10)}</Num>
                  )}
                </Td>
                <Td>
                  <span
                    className={clsx('font-mono', r.refused ? 'font-bold uppercase text-status-blocked' : 'text-navy')}
                  >
                    {r.status.replace(/_/g, ' ')}
                  </span>
                </Td>
                <Td><ExternalReference value={r.externalLocation} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* The lockout sentence, carried on the wire (deliveryView.ts:579) so this
          screen cannot render the column without the reason the column is text. */}
      <p className="text-[10px] leading-snug text-grey">
        <Lock size={9} className="mr-1 inline-block align-baseline" />
        {chase.referenceNotice}
      </p>
    </div>
  );
}

/* ── 4 · ACCEPTANCE, AND THE GATE'S REFUSAL REASONS ─────────────────────────── */

/**
 * Deliverables, with every refusal reason printed on the row that earned it.
 *
 * The gate is NOT implemented here. It is `canAccept` (delivery.ts:927) and,
 * independently, the database constraint `gps_deliverable_no_acceptance_before_review`
 * (0049_gps_delivery.sql:328) — so unreviewed work product cannot be accepted by any
 * endpoint, batch update or hand-run SQL. This screen reports those refusals and
 * prints `acceptance.gateMechanism` beside them, which is the D8 requirement: the
 * refusal names the thing that would have stopped it anyway.
 *
 * REFUSALS ARE SHOWN IN THE ENGINE'S ORDER — hardest gate first, review before
 * convenience (delivery.ts:910). When three reasons are shown to a hurried operator
 * the first one is the one that gets read, so re-sorting them here would quietly
 * change which rule the desk learns.
 *
 * `outsideThePlan` is flagged, never inferred: an accepted deliverable answering to
 * no milestone is scope that was delivered and may never have been priced, which on
 * a $10–25k engagement is the whole margin.
 */
function AcceptanceTable({ view, onOpen }: { view: AcceptanceView; onOpen: OpenRows }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const nav = useListNavigation({ count: view.rows.length, container: body });

  const drawer = (title: string, pick: (r: AcceptanceRow) => boolean, mechanism: string): DrawerPayload => ({
    title,
    mechanism,
    body: (
      <DrawerRows
        empty="No rows match — this is the population that was examined."
        rows={view.rows.filter(pick).map((r) => ({
          k: r.title,
          v: (
            <span className="text-navy">
              {r.refusals.length === 0 ? 'may be accepted' : r.refusals.map((x) => x.code).join(', ')}
            </span>
          ),
        }))}
      />
    ),
  });

  return (
    <div className="space-y-1.5">
      <Statement tone={view.blocked > 0 ? 'refusal' : 'badge'} mechanism={view.gateMechanism}>
        {view.headline}
      </Statement>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Opens count={view.acceptable} label="ready to accept" onOpen={onOpen}
          payload={() => drawer('canAccept() allows these through', (r) => r.verdict.canAccept,
            'canAccept(deliverable, evidence) — delivery.ts:927.')} />
        <Opens count={view.blocked} label="refused" tone="refusal" onOpen={onOpen}
          payload={() => drawer('Acceptance refused, with reasons', (r) => r.verdict.state === 'blocked',
            'canAccept() reasons, hardest gate first — delivery.ts:910. Never a silent exclusion.')} />
        <Opens count={view.awaitingReview} label="awaiting a recorded review" tone="refusal" onOpen={onOpen}
          payload={() => drawer('Refused: required review not recorded',
            (r) => r.refusals.some((x) => x.code === 'review_outstanding'),
            `Refused twice over: canAccept() and the DB constraint ${view.gateDbConstraint}.`)} />
        <Opens count={view.awaitingEvidence} label="waiting on a blocking input" tone="warning" onOpen={onOpen}
          payload={() => drawer('Refused: blocking client input outstanding',
            (r) => r.refusals.some((x) => x.code === 'evidence_outstanding'),
            'canAccept() filters evidence by engagement and milestone itself — delivery.ts:966 — so one milestone\'s missing input cannot block another\'s deliverable.')} />
        <Opens count={view.outsideThePlan} label="answer to no milestone" tone="warning" onOpen={onOpen}
          payload={() => drawer('Deliverables outside the plan', (r) => r.outsideThePlan,
            'milestoneKey IS NULL (delivery.ts:733). Delivered scope that may never have been priced.')} />
        <Opens count={view.accepted} label="accepted" onOpen={onOpen}
          payload={() => drawer('Accepted', (r) => r.verdict.state === 'accepted', 'state = accepted.')} />
      </div>

      {view.rows.length === 0 ? (
        <p className="border-l-2 border-line px-2 py-1.5 text-micro leading-snug text-grey">
          No deliverable rows recorded. Nothing has been declared as work product for this engagement — which is
          a statement about what has been ENTERED, not about what a partner has produced.
        </p>
      ) : (
        <table className="w-full border-collapse">
          <caption className="sr-only">Deliverables and the acceptance gate's verdict on each. Arrow keys move between rows.</caption>
          <thead>
            <tr>
              <Th>Deliverable</Th>
              <Th className="w-32">Owner</Th>
              <Th className="w-24">State</Th>
              <Th className="w-32">Review</Th>
              <Th>Gate verdict</Th>
            </tr>
          </thead>
          <tbody ref={body} className="divide-y divide-line" {...nav.containerProps}>
            {view.rows.map((r: AcceptanceRow, i) => (
              <tr
                key={r.deliverableId}
                {...nav.rowProps(i)}
                className={clsx(
                  'outline-none focus:bg-ice-soft dark:focus:bg-ice-soft/10',
                  r.verdict.state === 'blocked' && 'border-l-2 border-l-status-blocked',
                )}
              >
                <Td>
                  <span className="font-semibold text-navy">{r.title}</span>
                  {r.outsideThePlan && (
                    <span className="ml-1.5 rounded-sm bg-status-conditional-bg px-1 text-[9px] font-bold uppercase text-status-conditional">
                      outside the plan
                    </span>
                  )}
                  <p className="mt-0.5 leading-snug text-grey">{r.description}</p>
                  {r.milestoneKey && <span className="font-mono text-[10px] text-grey">{r.milestoneKey}</span>}
                </Td>
                <Td className="text-grey">{r.ownerLabel}</Td>
                <Td><span className="font-mono text-navy">{r.state.replace(/_/g, ' ')}</span></Td>
                <Td>
                  {r.reviewRequired ? (
                    <span
                      className={clsx('font-mono text-[10px] font-bold uppercase', r.reviewRecorded ? 'text-status-ready' : 'text-status-blocked')}
                    >
                      {r.reviewRecorded ? `recorded ${(r.reviewedAt ?? '').slice(0, 10)}` : 'REQUIRED · not recorded'}
                    </span>
                  ) : (
                    // NOT "not required". `review_required` is a per-row column an
                    // approver waived at creation with a stated reason — it is not a
                    // property of the offer, and rendering it as one turned one
                    // person's assertion into policy on the screen that authorises
                    // invoicing. `reviewBasis` is null on every row today
                    // (DELIVERY_SCHEMA_GAPS: 0049 has no such column), so the absence
                    // is stated rather than left as an empty line.
                    <span className="text-[10px] uppercase text-status-conditional">
                      waived at creation
                      <span className="ml-1 normal-case text-grey">
                        — an approver set review_required = false on this row. Not a property of the offer.
                      </span>
                    </span>
                  )}
                  {r.reviewBasis
                    ? <p className="mt-0.5 leading-snug text-grey">{r.reviewBasis}</p>
                    : <p className="mt-0.5 leading-snug text-grey">basis not recorded — 0049 has no review_basis column</p>}
                  {r.reviewRecorded && r.reviewedBy && <p className="text-[10px] text-grey">by {r.reviewedBy}</p>}
                </Td>
                <Td>
                  {r.refusals.length === 0 ? (
                    <span className="text-[10px] font-bold uppercase text-status-ready">
                      may be accepted
                    </span>
                  ) : (
                    <ol className="space-y-0.5">
                      {r.refusals.map((x, k) => (
                        <li key={x.code} className="leading-snug">
                          <span className="font-mono text-[10px] font-bold uppercase text-status-blocked">
                            {k + 1}. {x.code.replace(/_/g, ' ')}
                          </span>
                          <span className="ml-1 text-grey">{x.detail}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="font-mono text-[10px] leading-snug text-grey">
        Gate enforced independently in the database as <span className="font-bold">{view.gateDbConstraint}</span>.
        This screen reports refusals; it does not implement the rule.
      </p>
    </div>
  );
}

/**
 * WHICH VALUES IN THE TABLE ABOVE ARE SUBSTITUTED RATHER THAN RECORDED.
 *
 * `deliveryDesk.ts` substitutes `reviewBasis: null`, `acceptedBy: null` and
 * `milestoneKey: null` on every acceptance row because 0049 has no columns for them,
 * and it ships a ledger saying so. That ledger travelled in `meta` — and the web
 * `unwrap` dropped `meta` (`lib/api/meta.ts`), so the screen rendered the
 * substitutions and discarded the explanation. A null then read as a fact: "not
 * required", "no milestone", nobody accepted it.
 *
 * Rendered from the CARRIED meta, so if the server stops sending the ledger this
 * block disappears rather than going stale.
 */
function SchemaGaps({ meta }: { meta: ApiMeta | undefined }) {
  const gaps = meta?.schemaGaps;
  if (!Array.isArray(gaps) || gaps.length === 0) return null;
  const rows = gaps.filter(
    (g): g is { field: string; substitution: string; consequence: string; closedBy: string } =>
      typeof g === 'object' && g !== null && typeof (g as { field?: unknown }).field === 'string',
  );
  if (rows.length === 0) return null;
  return (
    <details className="mt-2 border-t border-line pt-1.5">
      <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-status-conditional">
        {rows.length} field{rows.length === 1 ? '' : 's'} above are SUBSTITUTED, not recorded
      </summary>
      <p className="mt-1 leading-snug text-grey">
        The schema has no column for these, so the value you see is a placeholder this
        code inserted — not something a human entered. Reading one as a fact is the
        failure this list exists to prevent.
      </p>
      <ul className="mt-1 space-y-1">
        {rows.map((g) => (
          <li key={g.field} className="leading-snug">
            <p className="font-mono text-[10px] font-bold text-navy">{g.field}</p>
            <p className="text-grey">{g.substitution}</p>
            <p className="text-grey">{g.consequence}</p>
            <p className="font-mono text-[10px] text-grey">closed by: {g.closedBy}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ── 5 · THE COORDINATION CEILING ───────────────────────────────────────────── */

/**
 * The number that actually caps this business.
 *
 * PARTNERS DELIVER. He sells and coordinates, AROUND A FULL-TIME LCX JOB — so the
 * ceiling is not partner capacity and it is not revenue, it is his own coordination
 * hours per week. `wipLoad` counts in hours rather than in engagements because three
 * diagnostics and three legal-opinion coordinations are the same engagement count and
 * roughly double the work (delivery.ts:1250).
 *
 * OVER THE CEILING IS STATED PLAINLY AND FIRST. `headroomHours` is NOT clamped at
 * zero (deliveryView.ts:870) — a negative number is the honest one, and the
 * "another engagement?" answer is never a bare yes/no: it names the hours, the
 * ceiling and the basis.
 *
 * D3 — THE UNCERTAINTY SITS BESIDE THE ESTIMATE, NEVER INSIDE IT. The hours are
 * placeholders (`COORDINATION_HOURS_ARE_PLACEHOLDERS`, delivery.ts:1173) and
 * `basisIsMeasured` is false today. The badge says so next to the figures rather
 * than shading the figures for uncertainty: a capacity number quietly discounted is
 * a number nobody can argue with, and D4 requires that the system be arguable.
 *
 * The drivers are LEAVE-ONE-OUT over `wipLoad` (deliveryView.ts:963): each
 * engagement's contribution is how much the engine's own total moves when it is
 * removed, so the rows cannot disagree with the total they explain. If they ever
 * fail to reconstruct it, an `UNATTRIBUTED` driver appears — which is the honest
 * failure mode rather than a table that silently does not add up.
 */
function WipBlock({ wip, onOpen }: { wip: WipView; onOpen: OpenRows }) {
  const c = wip.ceiling;
  const tone = c.overCeiling ? 'refusal' : c.atCeiling ? 'warning' : 'badge';

  const driverDrawer = (): DrawerPayload => ({
    title: 'Every committed hour, attributed to the engagement that caused it',
    mechanism:
      'Leave-one-out over wipLoad() — deliveryView.ts:963. Each engagement\'s points are the amount the ' +
      'engine\'s own total moves when that engagement is removed, so these rows cannot disagree with the ' +
      'total. The per-offer hours table is module-private (delivery.ts:1178); copying it would create a ' +
      'second placeholder constant that drifts.',
    body: (
      <div className="space-y-2">
        <DrawerRows
          empty="No live engagements are drawing on the ceiling."
          rows={wip.hourDrivers.map((d) => ({
            k: d.label,
            v: <Num className={clsx('font-bold', d.points === 0 ? 'text-grey' : 'text-navy')}>{d.points}h</Num>,
          }))}
        />
        <p className="border-t border-line pt-1.5 font-mono text-[10px] text-grey">
          drivers sum to {wip.hourDrivers.reduce((s, d) => s + d.points, 0)}h · engine total{' '}
          {c.committedHoursPerWeek}h
        </p>
        <p className="text-micro leading-snug text-grey">{wip.basisNote}</p>
      </div>
    ),
  });

  return (
    <div className="space-y-1.5">
      <Statement tone={tone}>{wip.statement}</Statement>

      {/* THE PLAIN ANSWER. Deliberately its own line: "can I take another one" is
          the only question this section exists to answer, and burying it inside a
          statistics strip is how it stops being answered. */}
      <div
        className={clsx(
          'border-l-2 px-2 py-1.5',
          c.overCeiling
            ? 'border-status-blocked bg-status-blocked-bg'
            : c.atCeiling
              ? 'border-status-conditional bg-status-conditional-bg'
              : 'border-status-ready bg-status-ready-bg',
        )}
      >
        <p className="text-micro font-bold uppercase tracking-wider">
          Another engagement? · {wip.anotherEngagement.verdict.replace(/_/g, ' ')}
        </p>
        <p className="mt-0.5 text-micro leading-snug text-navy">{wip.anotherEngagement.because}</p>
      </div>

      {/* One dense line of labelled facts, not four stat cards. */}
      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-micro">
        <div>
          <dt className="inline text-[10px] uppercase tracking-wider text-grey">committed </dt>
          <dd className="inline"><Num className="font-bold text-navy">{c.committedHoursPerWeek}h/wk</Num></dd>
        </div>
        <div>
          <dt className="inline text-[10px] uppercase tracking-wider text-grey">ceiling </dt>
          <dd className="inline"><Num className="font-bold text-navy">{c.capacityHoursPerWeek}h/wk</Num></dd>
        </div>
        <div>
          <dt className="inline text-[10px] uppercase tracking-wider text-grey">headroom </dt>
          <dd className="inline">
            {/* NEGATIVE, not clamped. `-6h` is the fact; `0h` would be a comfort. */}
            <Num className={clsx('font-bold', c.headroomHours < 0 ? 'text-status-blocked' : 'text-navy')}>
              {c.headroomHours}h
            </Num>
          </dd>
        </div>
        <div>
          <dt className="inline text-[10px] uppercase tracking-wider text-grey">utilisation </dt>
          <dd className="inline">
            <Num className={clsx('font-bold', c.overCeiling ? 'text-status-blocked' : 'text-navy')}>
              {c.utilisationPct === null ? 'n/a' : `${c.utilisationPct}%`}
            </Num>
          </dd>
        </div>
        {c.overByHours !== null && (
          <div>
            <dt className="inline text-[10px] font-bold uppercase tracking-wider text-status-blocked">over by </dt>
            <dd className="inline"><Num className="font-bold text-status-blocked">{c.overByHours}h/wk</Num></dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Opens count={wip.load.active} label="live engagements" onOpen={onOpen} payload={driverDrawer} />
        <Opens count={wip.load.blocked} label="blocked (still counted — chasing IS the work)" tone="warning" onOpen={onOpen} payload={driverDrawer} />
        <Opens count={wip.load.awaitingClientInput} label="awaiting a client input" onOpen={onOpen} payload={driverDrawer} />
        <Opens count={wip.load.awaitingCollection} label="delivered, not collected" tone="warning" onOpen={onOpen} payload={driverDrawer} />
        <Opens count={wip.load.unstaffable} label="no named partner — his to deliver" tone="refusal" onOpen={onOpen} payload={driverDrawer} />
        <Opens count={wip.load.clients} label="distinct clients" onOpen={onOpen} payload={driverDrawer} />
      </div>

      {/* D3. Beside the numbers, not folded into them. */}
      <Statement tone="badge">
        <span className="font-bold uppercase">
          {wip.basisIsMeasured ? 'Basis: measured · ' : 'Basis: PLACEHOLDER, not measured · '}
        </span>
        {wip.basisNote}
      </Statement>
    </div>
  );
}

/* ── D4 · WHERE THE SYSTEM ARGUES BACK ──────────────────────────────────────── */

/**
 * The notice rail: everything the view objects to, in the composer's order.
 *
 * ORDER IS NOT MINE TO CHOOSE. `deliveryNotices` sorts hardest-first
 * (deliveryView.ts:NOTICE_ORDER) — scope drift, then the coordination ceiling, then
 * the review gate — and this component preserves it. A page that re-sorted by
 * severity would put "placeholder hours" above "an acceptance criterion is delivered
 * by no milestone", and the desk would learn the wrong priority.
 *
 * Badges are NOT hidden behind a disclosure. A statement about the data ("these
 * hours are placeholders") is the kind of thing that gets collapsed for tidiness and
 * then never read, and it is precisely the claim that stops this screen from
 * over-promising.
 */
function NoticeRail({ notices }: { notices: readonly DeliveryNotice[] }) {
  if (notices.length === 0) {
    return (
      <p className="border-l-2 border-line px-2 py-1.5 text-micro text-grey">
        The view raises nothing against this engagement. That is a statement about the checks listed in the
        sections below, not a general assurance.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {notices.map((n) => (
        <li key={n.code} className="flex items-start gap-1.5">
          <span className="mt-0.5 shrink-0">
            {n.severity === 'refusal' ? (
              <AlertOctagon size={11} className="text-status-blocked" />
            ) : n.severity === 'warning' ? (
              <AlertTriangle size={11} className="text-status-conditional" />
            ) : (
              <Info size={11} className="text-grey" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={clsx(
                'text-micro leading-snug',
                n.severity === 'refusal'
                  ? 'font-semibold text-status-blocked'
                  : n.severity === 'warning'
                    ? 'text-status-conditional'
                    : 'text-grey',
              )}
            >
              <span className="mr-1 font-mono text-[10px] uppercase tracking-wider opacity-70">
                {n.code.replace(/_/g, ' ')}
              </span>
              {n.text}
            </p>
            {n.mechanism && (
              <p className="font-mono text-[10px] leading-snug text-grey">{n.mechanism}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── THE PAGE ───────────────────────────────────────────────────────────────── */

/**
 * Section jump targets (D6).
 *
 * Digits, not letters, and NOT `j`/`k`. `useListNavigation`'s docblock records why
 * bare letters are unsafe on these surfaces — this app already gives single letters
 * to destructive verbs elsewhere, and a grammar where some letters move and others
 * mutate is one that will eventually mutate something someone meant to scroll past.
 * Digits are bound to nothing else in the app (checked: no other surface handles a
 * bare digit) and they move FOCUS to a named heading rather than scrolling to an
 * offset, so a screen-reader user hears which section they arrived in.
 */
const SECTIONS: readonly { key: string; id: string; label: string }[] = [
  { key: '1', id: 'plan', label: 'Plan' },
  { key: '2', id: 'progress', label: 'Progress' },
  { key: '3', id: 'evidence', label: 'Evidence' },
  { key: '4', id: 'acceptance', label: 'Acceptance' },
  { key: '5', id: 'wip', label: 'WIP' },
  { key: '6', id: 'documents', label: 'Documents' },
];

export function GpsDelivery() {
  const params = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  /**
   * Two ways in because the route is NOT mine to add: `router.tsx` is owned by the
   * human wiring pass. `/gps/delivery/:id` is the shape I am asking for, and
   * `?engagementId=` keeps the page reachable from `Gps.tsx`'s engagement list
   * before that route exists. Neither is invented state — both are the URL, so a
   * printed page's provenance is the address bar.
   */
  const engagementId = params.id ?? searchParams.get('engagementId') ?? '';

  const [data, setData] = useState<DeliveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<DrawerPayload | null>(null);

  const load = useCallback(() => {
    if (!engagementId) return;
    setBusy(true);
    setError(null);
    fetchGpsDelivery(engagementId)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load the delivery desk'))
      .finally(() => setBusy(false));
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const openRows: OpenRows = useCallback((payload) => setDrawer(payload), []);

  /**
   * Digit jumps. NOTE WHAT IS NOT HERE: any Escape handler.
   *
   * Escape has exactly one owner in this app — the dismiss stack (`lib/dismiss.ts`),
   * which `InspectorDrawer` registers with via `useDismissible`. A second Escape
   * listener on the page would close the drawer AND do whatever else it wanted, in
   * an order determined by listener registration. So this handler binds digits only,
   * and it stands down entirely while an overlay is open.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (isOverlayOpen()) return;
      /*
       * AND STANDS DOWN FOR A DOCKED PANE, which `isOverlayOpen()` cannot see.
       *
       * A docked pane registers NOTHING with the dismiss stack, deliberately — `lib/split.ts`
       * argues that one entry there makes `isOverlayOpen()` true and silently kills the very
       * keys docking exists to preserve. So the guard above returns false for a docked pane,
       * and `⌘\` can dock the universal evidence pane over this desk: focus a control inside
       * it, press `4`, and this listener moved the page behind the operator's cursor.
       */
      if (!gpsKeysBelongToSurface()) return;
      const section = SECTIONS.find((s) => s.key === e.key);
      if (!section) return;
      const h = document.getElementById(`${section.id}-h`);
      if (!h) return;
      e.preventDefault();
      // Focus FIRST, then scroll. Focus is the part that matters — it moves the
      // keyboard cursor and announces the landmark — and `scrollToId` is the house
      // helper rather than a raw `scrollIntoView` because a bare smooth scroll
      // overrides the reduced-motion stylesheet (lib/motion.ts:38, ratcheted by
      // lib/__tests__/reducedMotion.test.ts).
      h.focus();
      scrollToId(`${section.id}-h`, 'start');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /**
   * Refusals first, for the ribbon's one-line summary.
   *
   * `useMemo` not for speed — the list is a dozen items — but so the ribbon and the
   * rail cannot disagree about how many refusals there are by counting differently.
   */
  const refusals = useMemo(
    () => (data?.notices ?? []).filter((n) => n.severity === 'refusal'),
    [data],
  );

  /**
   * THE LEGAL POSITION BEHIND THE PRICE ON THIS DOSSIER.
   *
   * Read from the payload and its envelope, never assumed. `DeliveryResponse` names no
   * jurisdiction (deliveryView.ts:1246 composes id, client, offer and status only), so
   * this resolves to "no jurisdiction is even named" until the perimeter owner threads
   * one through — which is a louder and more accurate stamp than a confident one, and
   * is exactly the direction `readLegalPosition` is built to fail in.
   */
  const legal = useMemo(() => readLegalPosition([data]), [data]);

  if (!engagementId) {
    return (
      <div className="p-5">
        <EmptyState
          variant="search"
          title="No engagement selected"
          description="This desk shows one engagement at a time. Open it from the engagement list, or append ?engagementId= to this address."
        />
      </div>
    );
  }

  return (
    <div className="br-page p-4">
      <PrintStyles />

      <PageTitle
        icon={<Route size={20} />}
        subtitle={
          data
            ? `${data.engagement.offerName} · ${data.engagement.clientName ?? data.engagement.clientId} · ${data.engagement.statusLabel}`
            : 'One engagement: what was sold, what is moving, what is stopped, and what it costs him per week.'
        }
        actions={
          <div className="br-no-print flex items-center gap-2">
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-grey sm:inline">
              {SECTIONS.map((s) => `${s.key} ${s.label.toLowerCase()}`).join(' · ')}
            </span>
            <Button size="sm" variant="secondary" onClick={load} disabled={busy}>
              <RefreshCw size={13} className={busy ? 'animate-spin motion-essential' : ''} /> Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer size={13} /> Print dossier
            </Button>
          </div>
        }
      >
        Delivery desk
      </PageTitle>

      {error ? (
        /* An error is an error, not an empty desk. A page that renders "nothing
           outstanding" when the request failed teaches the desk to trust a blank. */
        <EmptyState
          variant="error"
          title="Delivery desk unavailable"
          description={`${error} — nothing below is being shown, and no part of this should be read as "clear".`}
          action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}
        />
      ) : !data ? (
        <PageSkeleton />
      ) : (
        <div className="br-deck">
          {/* THE RIBBON — one line of labelled facts. Not four stat cards: the
              four-stat strip on Gps.tsx is the anti-pattern, because it gives a
              placeholder the same visual weight as a refusal. D7: the dossier is
              dated here, which is what makes the printed page honest an hour later. */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-y border-line py-1.5 font-mono text-micro">
            <span className="font-bold uppercase tracking-wider text-navy">
              {data.engagement.offerName}
            </span>
            <span className="text-grey">
              client <span className="text-navy">{data.engagement.clientName ?? data.engagement.clientId}</span>
            </span>
            <span className="text-grey">
              engagement <span className="text-navy">{data.engagement.id}</span>
            </span>
            <span className="text-grey">
              status <span className="text-navy">{data.engagement.statusLabel}</span>
            </span>
            <span className={clsx(data.progress.isBlocked ? 'font-bold text-status-blocked' : 'text-navy')}>
              {data.progress.stateLabel}
            </span>
            <span className={clsx(refusals.length > 0 ? 'font-bold text-status-blocked' : 'text-grey')}>
              {refusals.length} refusal{refusals.length === 1 ? '' : 's'}
            </span>
            <span className="ml-auto text-grey">as of {data.asOf}</span>
          </div>

          {/* THE STAMP, DIRECTLY UNDER THE RIBBON AND ABOVE EVERYTHING ELSE.
              This dossier is printable and the printed page is what reaches a client,
              so the sentence that the number is not legally cleared has to be on the
              first sheet, not in a footnote on the last. It is the whole of what the
              desk traded for letting quotes through at all (owner, 2026-08-02). */}
          <LegalPositionStamp reading={legal} subject="engagement dossier" className="mt-2" />

          {/* WHAT THE READ DECLARED ABOUT ITSELF, above the engine's own rail.
              `meta.scopeBasis` is the one that changes a verdict's meaning: drift
              measured against `live_catalogue` was measured against criteria the
              client never agreed to (routes/gpsDelivery.ts:290), and the catalogue is
              versioned code that has changed. It travelled in `meta` from the first
              day this page existed and nothing rendered it. */}
          <GpsMetaBanner className="mt-2" of={[data]} />

          {/* D4 — the rail, above everything, in the composer's order. */}
          <div className="mt-2">
            <NoticeRail notices={data.notices} />
          </div>

          <Block
            id="plan" label="The plan, as sold" icon={<ClipboardList size={12} />}
            right={`${data.plan.recordedCount} of ${data.plan.rows.length} milestones have recorded state`}
          >
            <div className="space-y-2">
              <DriftVerdict plan={data.plan} onOpen={openRows} />
              {data.plan.unknownLiveKeys.length > 0 && (
                /* Recorded delivery history that no longer answers to any milestone.
                   Shown, never dropped: silently discarding it is how history
                   disappears after a catalogue edit (D2). */
                <Statement tone="warning">
                  {data.plan.unknownLiveKeys.length} recorded milestone state(s) belong to no milestone in the
                  current plan ({data.plan.unknownLiveKeys.join(', ')}). Still stored; no longer shown against
                  anything.
                </Statement>
              )}
              <PlanTable plan={data.plan} onOpen={openRows} />
            </div>
          </Block>

          <Block
            id="progress" label="Progress" icon={<Gauge size={12} />}
            right={data.progress.next ? `next · ${data.progress.next.title}` : 'nothing left to move'}
          >
            <div className="space-y-2">
              <ProgressHeadline view={data.progress} onOpen={openRows} />
              {/* The engine's own sentence, verbatim and paste-able into a client
                  update. It leads with the block when there is one, which is the
                  whole reason the engine returns a headline at all. */}
              <p className="border-l-2 border-line px-2 py-1.5 text-micro leading-snug text-navy">
                {data.progress.headline}
              </p>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <Opens
                  count={data.progress.blockers.length} label="blockers" tone="refusal"
                  onOpen={openRows} payload={() => blockerDrawer(data.progress)}
                />
                <Opens
                  count={data.progress.unexplainedBlockers} label="blocked with no reason recorded" tone="warning"
                  onOpen={openRows} payload={() => blockerDrawer(data.progress)}
                />
                <Opens
                  count={data.progress.awaitingClientInput} label="awaiting a client or counsel input"
                  onOpen={openRows} payload={() => blockerDrawer(data.progress)}
                />
              </div>
            </div>
          </Block>

          <Block
            id="evidence" label="Evidence chase" icon={<Clock size={12} />}
            right={`overdue derived against ${data.asOf}`}
          >
            <EvidenceTable chase={data.evidence} onOpen={openRows} />
          </Block>

          <Block id="acceptance" label="Acceptance" icon={<FileCheck2 size={12} />}>
            <AcceptanceTable view={data.acceptance} onOpen={openRows} />
            <SchemaGaps meta={responseMeta(data)} />
          </Block>

          <Block
            id="wip" label="Coordination ceiling (whole desk)" icon={<Gauge size={12} />}
            right="his hours, around a full-time LCX job"
          >
            <WipBlock wip={data.wip} onOpen={openRows} />
          </Block>

          <Block
            id="documents" label="Client documents" icon={<FolderClosed size={12} />}
            right="stored on LCX infrastructure — D2 answered yes, 2026-08-02"
          >
            {/* The panel owns its own read and its own `migrated: false` sentence: that
                envelope is about the ARTIFACT table, which is a different migration from
                the one the delivery read describes, and the page-level banner would flatten
                the two into one claim (`components/gps/ArtifactIntake.tsx`). */}
            <ArtifactIntake engagementId={engagementId} />
          </Block>

          {/* THE API'S OWN STATEMENT ABOUT WHAT IT DOES WITH CLIENT MATERIAL, printed
              verbatim from the wire rather than restated here.
              A screen that paraphrases a server claim is a screen you cannot use to
              audit the server, which is why these two paragraphs are rendered as sent.
              They were STALE for part of 2026-08-02 — they still said GPS holds no
              client document after intake had shipped — and this block carried an
              explicit SUPERSEDED warning naming the contradiction. `deliveryView.ts`
              and `delivery.ts` have since been corrected, so the warning is gone: it
              would now be the stale claim. The distinction the sentences draw is the
              real one an operator makes here — a REFERENCE to material in the client's
              systems, which nothing follows, versus an UPLOAD, which puts the material
              on LCX infrastructure with a retention date and an audit trail. */}
          <section aria-labelledby="lockout-h" className="mt-4 border-t border-line pt-2">
            <h2
              id="lockout-h"
              className="flex items-center gap-1.5 text-label font-bold uppercase tracking-wider text-navy"
            >
              <Ban size={12} className="text-grey" /> Client document handling, as the API states it
            </h2>
            <p className="mt-1 text-micro leading-snug text-navy">{data.lockout.noClientDocumentStore}</p>
            <p className="mt-1 text-micro leading-snug text-grey">{data.lockout.externalReferenceIsInert}</p>
            <ul className="mt-1.5 space-y-0.5">
              {data.lockout.enforcedBy.map((e) => (
                <li key={e} className="font-mono text-[10px] leading-snug text-grey">
                  <Lock size={9} className="mr-1 inline-block align-baseline" />
                  {e}
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-3 border-t border-line pt-1.5 font-mono text-[10px] text-grey">
            {/* THE SCOPE OF THE OLD CLAIM, NARROWED RATHER THAN DELETED.
                This line said "read-only: this surface records nothing", which stopped
                being true when intake landed. It is not softened into vagueness and it
                is not left standing as a falsehood: the claim now names what it covers
                (delivery facts — no milestone state, no acceptance, no review) and then
                names the exception out loud. `__tests__/gpsDelivery.test.tsx` asserts
                both halves, so neither can be dropped without going red. */}
            GPS delivery dossier · engagement {data.engagement.id} · composed {data.asOf} · delivery
            facts are read-only: this surface records nothing about whether work happened, whether it
            was reviewed or whether it was accepted. Its only writes are storing and deleting the
            documents a client sent.
          </p>
        </div>
      )}

      {/* D1 — the rows behind whichever number was clicked. Escape is the dismiss
          stack's, not this page's. */}
      <InspectorDrawer
        isOpen={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.title ?? ''}
      >
        {drawer && (
          <div className="space-y-3">
            <p className="border-l-2 border-line px-2 py-1.5 font-mono text-[10px] leading-snug text-grey">
              <span className="font-bold uppercase">Mechanism · </span>
              {drawer.mechanism}
            </p>
            {drawer.body}
          </div>
        )}
      </InspectorDrawer>
    </div>
  );
}
