import type { ReactNode } from 'react';
import { AlertTriangle, EyeOff, Lock, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import {
  INSTRUMENTS,
  type GateReading,
  /* A ROUTE CONTRACT, declared once in
   * `packages/shared/src/marketing/contracts/record.ts` and imported by the route handler
   * and by this atom from the same symbol. Not restated here, for the reason `narrow.ts`
   * opens with: a web-local copy of a response shape compiles, passes a mocked test, and
   * crashes on the first real payload. */
  type MarketingWireRefusal,
  type ObservationFrame,
  type Refusal,
  type RefusalRecovery,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DESK'S ATOMS — the four things every marketing panel has to get right
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Tone is the delivery desk's, deliberately: tabular, monospace micro type, hairline
 * dividers, `border-l-2` statements instead of cards inside cards. Nothing new is
 * invented — `Refused` is the same shape as `components/gps/ArtifactIntake.tsx`'s refusal
 * block, and the status colour tokens are the house ones.
 *
 *  · A REFUSAL IS A SENTENCE, with the rule that caused it, what would clear it, and the
 *    span it objected to. A red border is not a refusal, and `flag_reason` on its own is
 *    a sanitiser's note to a log.
 *  · "NOTHING HERE" AND "WE CANNOT SEE" LOOK DIFFERENT. `Absent` and `Nothing` are
 *    separate components on purpose: one is a fact about the desk's judgement, the other
 *    is a fact about this environment's deployment.
 *  · A COUNT CARRIES ITS FRAME. Every figure in this compartment is a lower bound.
 *  · A GATE WITH NO ANSWER IS NOT A PASS.
 */

export function Th({ children, align = 'left', className }: {
  children?: ReactNode; align?: 'left' | 'right'; className?: string;
}) {
  return (
    <th
      scope="col"
      className={clsx(
        'border-b border-line px-2 py-1 text-micro font-bold uppercase tracking-wider text-grey',
        align === 'right' ? 'text-right' : 'text-left', className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className }: {
  children?: ReactNode; align?: 'left' | 'right'; className?: string;
}) {
  return (
    <td className={clsx('px-2 py-1 align-top text-micro', align === 'right' ? 'text-right' : 'text-left', className)}>
      {children}
    </td>
  );
}

/**
 * WHAT WOULD CLEAR IT, as a sentence.
 *
 * `not_recoverable` is the one that matters and it is stated plainly rather than dressed
 * up: an Art 7 promotion cannot be edited into a compliant post and personalised advice
 * cannot be disclaimed into safety, so offering an edit path there would be a lie shaped
 * like helpfulness. Every other kind names the specific act, the specific missing datum
 * or the specific role — never "provide more information".
 */
export function recoverySentence(r: RefusalRecovery): string {
  switch (r.kind) {
    case 'not_recoverable':
      return `There is no version of this that passes. ${r.why}`;
    case 'edit_text':
      return r.what;
    case 'supply_data':
      return `Missing: ${r.missing}. Who can supply it: ${r.whoCanSupply}.`;
    case 'human_authority':
      return `A named human in the ${r.role} role has to act on this. The author cannot clear it themselves.`;
    case 'wait_until':
      return `This clears when ${r.condition} — not before, and not by rewording.`;
    case 'different_surface':
      return r.suggestion;
  }
}

/**
 * A refusal this atom can render.
 *
 * The code is widened to `string` for exactly one reason: `crisis.ts` defines
 * `CrisisRefusal`, whose code union ADDS crisis-only codes (`CERC_KNOWN_EMPTY` and its
 * siblings) to the shared one. They are real refusals from a real engine and they must
 * render here. Widening the render prop is the narrow, honest fix — the alternative is
 * either a cast at every crisis call site or crisis codes leaking into `RefusalCode`,
 * which would let a non-crisis surface emit one.
 */
export type RenderableRefusal = Omit<Refusal, 'code'> & { readonly code: string };

/**
 * One refusal, as an operator can act on it. Four parts, always in this order: what is
 * wrong, what would clear it, the span it objected to, and — small, last, in mono — the
 * provision and the code.
 *
 * `matched` is rendered because a refusal has to be ARGUABLE. One that will not show the
 * span it objected to is an assertion of authority, and an operator routes around those.
 * The code is what a person quotes when they ask why; it is never the message.
 */
export function Refused({ r }: { r: RenderableRefusal }) {
  const instrument = INSTRUMENTS[r.rule.instrument];
  return (
    <div
      role="note"
      data-testid={`mkt-refusal-${r.code}`}
      className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-status-blocked"
    >
      <p className="text-micro font-semibold leading-snug">{r.sentence}</p>
      <p className="mt-1 text-micro leading-snug text-grey">{recoverySentence(r.recovery)}</p>
      {r.matched && (
        <p className="mt-1 break-words font-mono text-[10px] leading-snug text-grey">
          <span className="font-bold uppercase">objected to · </span>{r.matched}
        </p>
      )}
      {/* The provision as read, verbatim, and whether the instrument BINDS LCX at all.
          FINRA and CERC are models this compartment borrows from; presenting a model as
          law would be the same class of overclaim the rest of this desk exists to stop. */}
      <p className="mt-1 text-[10px] leading-snug text-grey">
        <span className="font-semibold">{r.rule.provision}</span> — {r.rule.text}
      </p>
      <p className="font-mono text-[10px] leading-snug text-grey">
        {instrument.title}{instrument.binding ? '' : ' · not binding on LCX; used as a model'} · {r.code} · ruleset v{r.ruleSetVersion}
      </p>
    </div>
  );
}

/**
 * ONE WIRE REFUSAL — the flat I/O shape the watch, record and retention engines send.
 *
 * `MarketingWireRefusal` is NOT `Refusal`, and the contract file says why: its codes are
 * about the REGISTER or the TRANSPORT (`WATCH_SOURCE_UNREACHABLE`,
 * `RETENTION_CLOCK_NEVER_RAN`) rather than about content, so widening `RefusalCode` to
 * hold them would let a fetch failure be reported as a wording violation. `rule` is a
 * string, and `ruleText`/`remedy` are optional because the two engines differ.
 *
 * THE CODE IS NEVER THE MESSAGE. It is printed last, small, in mono, as the thing a person
 * quotes when they ask why. What an operator reads first is the sentence, then the one
 * thing they can do about it. A surface that renders `WATCH_SOURCE_UNREACHABLE` and stops
 * has handed a log line to somebody holding a screen.
 *
 * A refusal with no `remedy` says so rather than printing nothing: silence where an action
 * should be reads as "there is nothing to do", and that is a different claim.
 */
export function WireRefused({ r }: { r: MarketingWireRefusal }) {
  return (
    <div
      role="note"
      data-testid={`mkt-wire-refusal-${r.code}`}
      className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-status-blocked"
    >
      <p className="text-micro font-semibold leading-snug">{r.sentence}</p>
      <p className="mt-1 text-micro leading-snug text-grey">
        {r.remedy ?? 'The engine stated nothing that would clear this. It is a fact about this environment, not something to edit around.'}
      </p>
      {r.subject !== undefined && (
        <p className="mt-1 break-words font-mono text-[10px] leading-snug text-grey">
          <span className="font-bold uppercase">about · </span>{r.subject}
        </p>
      )}
      {r.ruleText !== undefined && (
        <p className="mt-1 text-[10px] leading-snug text-grey">{r.ruleText}</p>
      )}
      <p className="font-mono text-[10px] leading-snug text-grey">{r.rule} · {r.code}</p>
    </div>
  );
}

/**
 * A LIST of wire refusals, or the sentence that there were none.
 *
 * `refusals.length === 0` is rendered as nothing at all deliberately: unlike an empty
 * TABLE, an empty refusal list is not a claim about the world, and printing "no refusals"
 * beside every panel trains an operator to skip the region where refusals appear.
 */
export function WireRefusals({ list }: { list: readonly MarketingWireRefusal[] }) {
  if (list.length === 0) return null;
  return (
    <div className="space-y-1">
      {list.map((r) => <WireRefused key={`${r.code}-${r.subject ?? ''}-${r.sentence.slice(0, 24)}`} r={r} />)}
    </div>
  );
}

/**
 * A READ THAT FAILED, as a refusal rather than as an empty panel.
 *
 * The distinction this exists to keep: a read that threw is NOT a read that found
 * nothing. The API's own wording is carried verbatim as the sentence — it holds the
 * specifics no sentence written in advance could — and `whatNotToBelieve` states, per
 * panel, the conclusion an operator must not draw from a blank space.
 */
export function apiReadRefusal(e: unknown, whatNotToBelieve: string): Refusal {
  return {
    code: 'DATA_ABSENT_NOT_ZERO',
    sentence: e instanceof Error && e.message ? e.message : 'This read failed and the API did not say why.',
    rule: {
      instrument: 'desk_policy',
      provision: 'absent data produces a refusal, never a zero',
      text: whatNotToBelieve,
    },
    recovery: {
      kind: 'not_recoverable',
      why: 'The sentence above is the API\'s own. Nothing on this screen can turn a failed read into data.',
    },
    matched: null,
    ruleSetVersion: 1,
  };
}

/**
 * NOTHING HERE. An honest empty: the list is empty, and the sentence says what that is a
 * statement about — and, just as importantly, what it is not.
 */
export function Nothing({ children }: { children: ReactNode }) {
  return (
    <p data-testid="mkt-empty-nothing" className="border-l-2 border-line px-2 py-1.5 text-micro leading-snug text-grey">
      {children}
    </p>
  );
}

/**
 * WE CANNOT SEE. Visually distinct from `Nothing` — an eye with a line through it, the
 * blocked tone, its own test id — because the two must never be confused. A zero standing
 * in for the unknown is the single most common way an instrument lies.
 */
export function Absent({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="note"
      data-testid="mkt-empty-absent"
      className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-status-blocked"
    >
      <p className="flex items-start gap-1.5 text-micro font-semibold leading-snug">
        <EyeOff size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{title}</span>
      </p>
      <p className="mt-1 text-micro leading-snug text-grey">{children}</p>
    </div>
  );
}

/**
 * A count and its frame. `value` is a LOWER BOUND and the label says so in the label
 * itself rather than in a tooltip — `repliesObserved`, never `replies`.
 *
 * `value === null` renders as "not observable", never as 0.
 */
export function LowerBoundTile({ label, value, frame, tone }: {
  label: string;
  value: number | null;
  frame?: ObservationFrame;
  tone?: 'warn';
}) {
  return (
    <div className="border-l-2 border-line px-2 py-1.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-grey">{label}</div>
      <div
        className={clsx('mt-0.5 text-[20px] font-bold tabular-nums',
          value === null ? 'text-grey' : tone === 'warn' ? 'text-status-conditional' : 'text-navy')}
      >
        {value === null ? 'not observable' : `≥ ${value}`}
      </div>
      {value !== null && (
        <p className="text-[10px] leading-snug text-grey">
          at least this many. The true figure is unknown and higher.
        </p>
      )}
      {frame && <ObservationFrameNote frame={frame} />}
    </div>
  );
}

/**
 * The frame, rendered beside the figure rather than behind a disclosure.
 *
 * THIS DOCBLOCK USED TO CLAIM "a metric with no frame does not render at all", and that
 * was false in the type immediately above it: `frame` is optional and rendered
 * conditionally, and `DeskMeasurement` was passing two figures without one — including
 * `suspicious`, computed over a different population from the `unparsed` tile beside it.
 * A comment asserting a guarantee the code does not keep is worse than no comment, because
 * the next reader stops checking.
 *
 * The property that IS true: every caller in this compartment now passes a frame, and
 * `deskAtoms.test.ts` fails if one stops. `frame` stays optional rather than required
 * because making it required would push callers toward inventing a frame to satisfy the
 * compiler, and an invented frame is the dishonesty this shape exists to prevent.
 *
 * `lastSuccessfulPollAt` is printed because a fall in a line has to be readable as a
 * pipeline fault rather than as a market signal.
 */
export function ObservationFrameNote({ frame }: { frame: ObservationFrame }) {
  return (
    <details data-testid="mkt-observation-frame" className="mt-1 text-[10px] leading-snug text-grey">
      <summary className="cursor-pointer font-mono uppercase tracking-wider">
        what this could and could not see
      </summary>
      <p className="mt-1">
        <span className="font-semibold">Source.</span> <span className="font-mono">{frame.source}</span> — {frame.captures}
      </p>
      <p className="mt-1">
        <span className="font-semibold">Does not capture.</span> {frame.doesNotCapture.join('; ')}.
      </p>
      <p className="mt-1">
        <span className="font-semibold">Known biases.</span> {frame.knownBiases.join('; ')}.
      </p>
      <p className="mt-1 font-mono">
        completeness · {frame.completeness.replace(/_/g, ' ')} · window {frame.windowFrom.slice(0, 16)} to {frame.windowTo.slice(0, 16)}
      </p>
      <p className="font-mono">
        last successful poll · {frame.lastSuccessfulPollAt ?? 'never — a fall in any figure derived from this may be a pipeline fault rather than a change in the world'}
      </p>
    </details>
  );
}

/**
 * YOU MAY NOT READ THIS — a fact about authority, not about the data or the deployment.
 *
 * Five marketing routes are `requireApprover`: the Art 8(2) production, the five-year record
 * write, Art 15 access, Art 17 erasure and the retention sweep. An operator who opens one of
 * those surfaces gets a 403, and the three wrong ways to render it are all worse than useless
 * — "not on this environment" sends them to escalate a deployment bug that does not exist,
 * "read failed" makes them retry forever, and an empty table tells them there is nothing
 * there.
 *
 * Deliberately NOT the blocked tone. This is the control working, and it reads as a
 * conditional rather than as a fault.
 */
export function NotPermitted({ what, sentence }: { what: string; sentence: string }) {
  return (
    <div
      role="note"
      data-testid="mkt-not-permitted"
      className="border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5 text-status-conditional"
    >
      <p className="flex items-start gap-1.5 text-micro font-semibold leading-snug">
        <Lock size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{what} requires an approver, and this session is not one.</span>
      </p>
      <p className="mt-1 text-micro leading-snug text-grey">{sentence}</p>
      <p className="mt-1 text-[10px] leading-snug text-grey">
        Nothing is wrong with this environment and nothing needs retrying. Ask an approver to open this surface —
        and note that two people sharing one passcode is not two people, which is why the role is checked
        server-side rather than hidden client-side.
      </p>
    </div>
  );
}

const GATE_LABEL: Record<GateReading['gate'], string> = {
  claim_safety: 'Claim safety',
  market_abuse: 'Market abuse',
  regime: 'Which law applies',
  length_budget: 'Length and boilerplate',
};

/**
 * ONE GATE'S STANDING. Three states, three different sentences, and the middle one is why
 * this component exists:
 *
 *   engine   the compartment's engine answered.
 *   preview  this screen checked what it can check on its own. Advisory.
 *   absent   NOBODY CHECKED THIS. Rendered in the blocked tone with the reason, so a
 *            missing endpoint can never earn a clean-looking row.
 */
export function Gate({ reading }: { reading: GateReading }) {
  const clean = reading.refusals.length === 0;
  const label = GATE_LABEL[reading.gate];

  if (reading.source === 'absent') {
    return (
      <div data-testid={`mkt-gate-${reading.gate}`}>
        <Absent title={`${label}: not checked.`}>
          {reading.absentBecause ?? 'No verdict reached this screen, and an unchecked gate is not a passed one.'}
        </Absent>
      </div>
    );
  }

  return (
    <div data-testid={`mkt-gate-${reading.gate}`} className="space-y-1">
      <p className="flex flex-wrap items-baseline gap-1.5 text-micro">
        <span className="font-semibold text-navy">{label}</span>
        <span
          className={clsx('font-mono text-[10px] uppercase tracking-wider',
            reading.source === 'engine' ? 'text-grey' : 'text-status-conditional')}
        >
          {reading.source === 'engine' ? 'engine verdict' : 'this screen only — advisory'}
        </span>
        {clean && (
          <span className="text-micro text-grey">
            {reading.source === 'engine'
              ? 'matched no rule the engine holds — which is a statement about the rulebook, not about the sentence.'
              : 'nothing this screen can check is wrong, which is not the same as cleared.'}
          </span>
        )}
      </p>
      {reading.source === 'preview' && reading.absentBecause && (
        <p className="flex items-start gap-1.5 text-[10px] leading-snug text-status-conditional">
          <AlertTriangle size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{reading.absentBecause}</span>
        </p>
      )}
      {reading.refusals.map((r) => <Refused key={`${reading.gate}-${r.code}`} r={r} />)}
    </div>
  );
}

/**
 * The standing sentence about what this desk cannot do, printed where a person looks for
 * a Send button. It is not a disclaimer: the absence of a posting path is the only
 * unbypassable guarantee that a software defect cannot speak for LCX, and a surface that
 * leaves it implicit invites the next person to add the button.
 */
export function NoPostingPath() {
  return (
    <p role="note" className="flex items-start gap-1.5 border-l-2 border-line px-2 py-1.5 text-[10px] leading-snug text-grey">
      <ShieldAlert size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        There is no send, post, schedule or publish control anywhere in this compartment, no route behind
        one, and no stored credential that could reach the LCX account. A cleared draft is text a named
        human takes by hand — and taking it is itself recorded. That gap is the guarantee; it is not a
        missing feature.
      </span>
    </p>
  );
}
