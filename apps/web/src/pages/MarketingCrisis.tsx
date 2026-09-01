import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui';
import { useClock } from '@/lib/useClock';
import { PrintStyles } from '@/components/report/PrintStyles';
import { toast } from '@/components/shared/Toast';
/**
 * THE CRISIS ENGINE IS IMPORTED BY RELATIVE PATH, and deliberately.
 *
 * `packages/shared/package.json` exposes exactly one entry point (`"."` →
 * `src/index.ts`). A `src/marketing/index.ts` sub-barrel now exists, but it
 * re-exports only `./types.js`, and `src/index.ts` does not re-export it at all — so
 * neither `@lcx/shared/marketing` nor `@lcx/shared/marketing/crisis` resolves, for
 * `tsc` or for Vite, and `crisis.ts` is not reachable through the package at all.
 * The agents who wrote these modules were forbidden to touch `src/index.ts`, and so
 * am I: a human wiring pass owns every barrel and route file.
 *
 * The alternative was to restate the gates, the budgets and the precleared text in
 * this file, which is the duplication that lets a screen and an engine disagree
 * about whether a statement may go out. `crisis.ts` is pure, total and has no I/O,
 * so reaching into it needs no server and cannot drift. Same decision, same
 * reasoning: `pages/GpsConflict.tsx:23-46`.
 *
 * NOTHING HERE READS AN ENDPOINT. `lib/api/marketing.ts` now declares
 * `fetchCrisisStatements`, `postCrisisInstance` and `fetchCrisisInstance`, and every
 * one of them returns `UncontractedPayload` — `unknown` — because the routes behind
 * them do not exist yet. Reading `unknown` off a route that is not there is exactly
 * how a GPS page shipped a guaranteed crash against an invented response contract.
 * This room needs no data at all (see the note below), so it takes none.
 */
import {
  CERC_CLEARANCE_EVIDENCE, CLEARANCE_HEADLINE_TEST_QUESTION, CONTAGION_APPLICABILITY_OWNER,
  CRYPTO_COM_CONTAGION_EVIDENCE,
  CRISIS_BLOCKING_CLEARANCES, CRISIS_ROOM_CANNOT_PUBLISH, CRISIS_ROOM_HANDOFF_REASON,
  FTX_OVER_REASSURANCE_EVIDENCE, HOLDING_LIBRARY_VERSION, HOLDING_PRECONDITION_PROMPT,
  HOLDING_STATEMENTS_ARE_NOT_COUNSEL_REVIEWED,
  HOLDING_STATEMENTS_UNREVIEWED_REASON, INCIDENT_SEVERITIES, INCIDENT_SEVERITY_LABEL,
  SVB_RUN_SPEED_EVIDENCE, TTFS_BUDGET_BASIS, TTFS_BUDGET_MINUTES_BY_SEVERITY,
  activateCrisisStatement, assessTimeToFirstStatement, contagionReadiness,
  gateContagionAnswer, getHoldingStatement, holdingStatementsFor, renderStatementGuidance,
  renderStatementText, seedStatementBody, unpreparedIncidentTypes, validateClockSuppression,
  type ContagionAttribute, type CrisisActivation, type CrisisRefusal,
  type CrisisStatementDraft, type HoldingPrecondition, type HoldingStatement,
  type HoldingStatementId, type IncidentSeverity, type TtfsAssessment,
} from '../../../../packages/shared/src/marketing/crisis';
import {
  // `ClockSuppression` moved here from `crisis.ts` in the integration pass: it was
  // declared there and field-for-field identically in `triage.ts`, and one desk gets one
  // suppression record.
  type Clearance, type ClearanceRole, type ClockSuppression, type DeskMode,
  type IncidentPhase, type IncidentType, type RefusalRecovery, type StatementBody,
} from '../../../../packages/shared/src/marketing/types';
// The WORDS gate. The same engine the desk's outbound gate runs, not a second opinion: it
// is pure, so it works with the API down, which is the condition this room is built for.
import {
  CLAIM_SAFETY_RULESET_VERSION,
  checkClaimSafety,
} from '../../../../packages/shared/src/marketing/claimSafety';
import { namedAssets } from '@/components/marketing/preChecks';
/*
 * E7 THE STORM, PROMOTED — AND MOUNTED ON AN ABSENCE, WHICH IS THE HONEST STATE OF IT.
 *
 * `3D_VFX_1000X.md` §2 lists E7 as replacing a "`MarketingCrisis` heatmap". There is no heatmap on this
 * page and there never was: it is clocks, statements, clearance lanes and gates, with no day axis, no
 * `<svg>` and no per-day series anywhere in its 2,126 lines. Nor is there a forward risk feed to build one
 * from — nothing in `apps/api/src/marketing` or `packages/shared/src/marketing` produces risk by day,
 * channel and severity band.
 *
 * So the promotion mounts the pair (`StormRelief` → flat `RiskCalendar` by default, volumetric behind a
 * toggle that defaults off per §7) against a NAMED absence rather than against invented numbers. Two
 * things were refused on the way here and both are worth recording:
 *
 *   · Authoring `docs/3d/e7`'s 39 synthetic flagged items onto this page, even declared in amber. This is
 *     a compliance instrument used during a live incident and its sheets get printed and filed; synthetic
 *     risk figures on it would eventually be read as the desk's own forward view.
 *   · Rendering nothing until a feed exists. A panel that disappears when its feed is missing is
 *     indistinguishable from a quiet fortnight, which is the one reading this whole component refuses.
 *
 * The moment a feed lands, `buildRiskField` takes it and both views work with no change here.
 */
import { StormRelief } from '@/components/risk/StormRelief';
import { riskFieldUnavailable } from '@/components/risk/riskField';

/**
 * WHY THERE IS NO CALENDAR, in the reader's words and naming whose input is missing.
 *
 * Module-level and constant, so it is not rebuilt per render and cannot become a different absence
 * between two paints.
 */
const FORWARD_RISK = riskFieldUnavailable(
  'No forward risk feed reaches this desk. Marketing risk by day, channel and severity band is not '
  + 'produced anywhere in this system today — not by the crisis engine, which is pure text and gates, and '
  + 'not by the record compartment, which looks backwards at what was published. So there is nothing to '
  + 'draw and nothing to accumulate. This is NOT an all-clear for the days ahead: it is the absence of an '
  + 'instrument, and closing it is an owner decision about what the monitor reports, not a rendering one.',
);

/**
 * THE CRISIS ROOM — LCX MARKETING M5.
 *
 * WHO USES THIS AND UNDER WHAT CONDITIONS. One frightened person, at 02:00,
 * who has been awake for a long time, while a number on a screen somewhere is
 * moving in the wrong direction. That is a specific design problem and it is not
 * the same problem as "a compliance screen". Three consequences run through every
 * decision in this file:
 *
 *  1. IT MUST BE IMPOSSIBLE TO MISREAD. The clock is the largest thing on the
 *     page. A refusal is a sentence in the active voice with the rule beside it,
 *     never a code and never a greyed-out button. Nothing is a colour alone.
 *  2. IT MUST NOT REQUIRE A MANUAL. The three slots are pre-filled from a
 *     precleared statement in one action, the reviewer's test is written out as
 *     the literal question, and every gate says what would change its answer.
 *  3. IT MUST WORK WHEN NOTHING ELSE DOES. This room reads no endpoint and holds
 *     no data. `crisis.ts` is pure text, budgets and gates, so the room is fully
 *     functional with the API down, the database unmigrated and the mailbox
 *     unconfigured — which is a realistic description of the hour it exists for.
 *
 * WHY THE STATEMENTS ARE IN CODE. Same argument as `gps/disclosure.ts`, and it
 * bites harder here: the value of a holding statement is being able to say later,
 * in front of someone, exactly what was said on the night. A table with an UPDATE
 * path silently rewrites that. Text in reviewed code with a version number cannot:
 * changing a word needs a diff, a reviewer and a version bump, and the old wording
 * stays recoverable from git forever.
 *
 * WHAT THIS ROOM CANNOT DO, BY CONSTRUCTION. It cannot publish. There is no post,
 * send, schedule, credential or session anywhere in this file or in the engine
 * behind it, and no button here reaches a network. The terminal state of a cleared
 * statement is a handoff: the text is rendered, a named human copies it and posts
 * it by hand, outside this software. That gap is the only unbypassable guarantee
 * that a defect cannot speak for LCX during the one hour when speaking wrongly is
 * most expensive.
 *
 * WHAT IS DELIBERATELY NOT PERSISTED, said plainly because it matters. Nothing on
 * this screen survives a reload. There is no crisis table, no route and no
 * migration for one, and inventing a response contract for a route that does not
 * exist is the failure this programme was rebuilt to remove. So the room prints,
 * and it says on its face that printing or copying the log is the only way the
 * record leaves the tab. That is a real limitation and it is stated at the top,
 * not buried in a footnote.
 *
 * FOUR-EYES IS REPORTED HONESTLY AND THAT IS THE FEATURE. The roster is however
 * many humans are actually in the room. Where one person supplies every clear the
 * engine returns `FOUR_EYES_UNACHIEVABLE`, and this screen renders that admission
 * where a green tick would otherwise go. A record that says "cleared" when one
 * person wore three hats is worse than one that says four eyes were not achieved.
 *
 * HOUSE PATTERN NOTES, so the next edit does not undo them:
 *  · NO `<header>`, `<aside>` OR `<footer>` ELEMENT. `PrintStyles` hides all three
 *    in print, so the clock and the closing admissions would be deleted from the
 *    printed artefact — the two parts that carry the honesty. They are `<div>`s and
 *    `<section>`s, and `marketingCrisis.test.tsx` fails if any of the three appears.
 *  · Escape is NOT bound here. LCXOS has one Escape owner (`lib/keys/`) and a
 *    page-level handler would be the second — the class of bug that phase removed.
 */

/* ════════ §A The clock, and why this page has an interval at all ════════ */

/**
 * `now`, ticking once a second.
 *
 * Almost every other surface in LCXOS reads the clock exactly once on mount, so
 * that two figures on one printed page cannot have been computed against two
 * instants. This page is the exception and the reason is the whole point of the
 * screen: a time-to-first-statement budget that does not visibly burn is a
 * decoration. An operator who has to reload to find out that they are now overdue
 * has been told nothing.
 *
 * One second, not sixteen milliseconds: the figure is in minutes, this is not an
 * animation, and it must stay legible to someone reading it under stress. Nothing
 * here animates, so there is no reduced-motion question to answer.
 *
 * The print stamp is captured separately and once (`usePrintInstant`), so the
 * printed artefact still carries a single unambiguous instant.
 */
function useTickingNow(): string {
  // The one clock (S1): this second is the footer's second, on the same tick.
  return new Date(useClock(1000)).toISOString();
}

/** The instant the artefact was generated at, read once. Stamped on the paper copy. */
function usePrintInstant(): string {
  const [at] = useState(() => new Date().toISOString());
  return at;
}

/**
 * Every digit run inside the next-update instant, declared as substantiated.
 *
 * `checkClaimSafety` normalises figures by stripping thousands separators and trailing
 * punctuation, so `2026-08-03T04:00` yields `2026`, `08`, `03`, `04`, `00`. They are listed
 * individually with the same reference, because the sourced-figure set is a set of figure
 * STRINGS and a single entry holding the whole timestamp would not match the parts.
 */
function nextUpdateFigures(nextUpdateBy: string): { figure: string; sourceRef: string }[] {
  const parts = nextUpdateBy.match(/\d[\d,.]*\d|\d/g) ?? [];
  const ref = 'the next-update instant recorded in this room by the operator';
  return [...new Set(parts.map((p) => p.replace(/,(?=\d{3}\b)/g, '').replace(/[.,]+$/, '')))]
    .filter((p) => p.length > 0)
    .map((figure) => ({ figure, sourceRef: ref }));
}

/** ISO → `2026-08-02 02:14Z`. Never renders "Invalid Date" onto a crisis record. */
function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return `UNPARSEABLE (${iso})`;
  const d = new Date(t).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}Z`;
}

/** `2026-08-02T02:14` for a `datetime-local` input, from an ISO instant. */
function toLocalInput(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toISOString().slice(0, 16);
}

/** A `datetime-local` value back to an ISO instant, treating the input as UTC. */
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const t = Date.parse(`${v}:00.000Z`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/* ════════ §B Binding a clearance to bytes, honestly ════════ */

/**
 * The fingerprint a clearance is bound to, and an admission about what it is.
 *
 * `Clearance.contentHash` exists so that changing the text voids every clearance
 * given against the old text — otherwise four eyes silently degrades into four eyes
 * on an earlier draft, which the doctrine names as the commonest real failure of
 * these systems. The engine only ever compares two of these for equality, so any
 * function that changes when the bytes change satisfies it.
 *
 * WHAT IT IS NOT. `ContentHash` is documented in the shared vocabulary as a
 * lowercase hex SHA-256. This page produces one only where the browser exposes
 * `crypto.subtle`, which is not universal — jsdom does not, and neither does any
 * non-secure context. Rather than block the crisis room on a Web Crypto feature
 * check, it falls back to a 64-bit FNV-1a fingerprint AND SAYS SO on the surface:
 * a fingerprint detects an edit, it does not resist a forged one. Printing "SHA-256"
 * over an FNV-1a value would be the exact species of unbacked confidence this wave
 * exists to remove.
 */
type Fingerprint =
  | { readonly kind: 'sha256'; readonly hex: string }
  | { readonly kind: 'fnv1a_fallback'; readonly hex: string }
  | { readonly kind: 'computing'; readonly hex: '' };

/** FNV-1a, 64-bit, over UTF-16 code units. Deterministic, synchronous, not a hash. */
function fnv1a64(text: string): string {
  // 64-bit FNV-1a with BigInt: a 32-bit variant collides often enough on short,
  // near-identical strings — which is exactly what two drafts of one sentence are.
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * The fingerprint of the current text, recomputed whenever it changes.
 *
 * Asynchronous only because `crypto.subtle.digest` is. The `computing` state exists
 * so that a clearance can never be recorded against an empty hash during the gap:
 * a hash of `''` would match every other empty hash and quietly bind a clearance to
 * nothing.
 */
function useFingerprint(text: string): Fingerprint {
  const [fp, setFp] = useState<Fingerprint>({ kind: 'computing', hex: '' });
  useEffect(() => {
    let live = true;
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) {
      setFp({ kind: 'fnv1a_fallback', hex: fnv1a64(text) });
      return () => { live = false; };
    }
    /*
     * MARKED `computing` BEFORE THE AWAIT, and this is not tidiness.
     *
     * Leaving the previous hash in place while the new one is computed would let a
     * clearance be recorded against the OLD bytes for as long as the digest takes,
     * and would show a stale fingerprint as if it were the current one. Neither is
     * survivable on a surface whose whole job is that a clearance binds to the text
     * it was given for.
     */
    setFp({ kind: 'computing', hex: '' });
    void (async () => {
      try {
        const bytes = new TextEncoder().encode(text);
        const digest = await subtle.digest('SHA-256', bytes);
        if (!live) return;
        const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
        setFp({ kind: 'sha256', hex });
      } catch {
        // A SubtleCrypto that exists and refuses (an insecure context) is the same
        // operational situation as one that is absent, and it must not leave the
        // room unusable. Fall back and say which one was used.
        if (live) setFp({ kind: 'fnv1a_fallback', hex: fnv1a64(text) });
      }
    })();
    return () => { live = false; };
  }, [text]);
  return fp;
}

export const FINGERPRINT_FALLBACK_NOTICE =
  'This browser exposes no SubtleCrypto, so clearances on this statement are bound by a 64-bit FNV-1a fingerprint rather than a SHA-256 hash. It reliably detects an edit — change one character and every clearance below is voided — and it does NOT resist a deliberately forged collision. The record should say which was used, and it does.';

/* ════════ §C Presentation atoms ════════ */

type Tone = 'blocked' | 'conditional' | 'ready' | 'deferred';

const TONE_BORDER: Record<Tone, string> = {
  blocked: 'border-status-blocked bg-status-blocked-bg',
  conditional: 'border-status-conditional bg-status-conditional-bg',
  ready: 'border-status-ready bg-status-ready-bg',
  deferred: 'border-line bg-status-deferred-bg',
};

const TONE_TEXT: Record<Tone, string> = {
  blocked: 'text-status-blocked',
  conditional: 'text-status-conditional',
  ready: 'text-status-ready',
  deferred: 'text-grey',
};

function Notice(props: { tone: Tone; title: string; testid?: string; children: ReactNode }) {
  return (
    <div data-testid={props.testid} className={clsx('mt-2 border-l-4 px-2 py-1.5', TONE_BORDER[props.tone])}>
      <div className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider', TONE_TEXT[props.tone])}>
        {props.title}
      </div>
      <div className="mt-0.5 font-mono text-micro leading-relaxed text-grey-dark">{props.children}</div>
    </div>
  );
}

function SectionHead(props: { n: string; title: string; note?: ReactNode }) {
  return (
    <div className="mt-6 border-b-2 border-navy pb-1">
      <h2 className="font-mono text-label font-bold uppercase tracking-wider">
        <span className="text-grey">{props.n}</span> {props.title}
      </h2>
      {props.note && <div className="mt-0.5 font-mono text-micro leading-relaxed text-grey">{props.note}</div>}
    </div>
  );
}

/**
 * A refusal, rendered the way the doctrine requires: a sentence an operator can
 * act on, the rule that caused it beside it, and the one thing that would change
 * the answer — or an honest statement that nothing would.
 *
 * Never a bare code. The code is shown as well, small, because it is what a
 * post-mortem counts by frequency, but it is never the message.
 */
function RefusalCard(props: { refusal: CrisisRefusal; testid?: string }) {
  const r = props.refusal;
  return (
    <div
      data-testid={props.testid}
      data-refusal-code={r.code}
      className="mt-1.5 border-l-4 border-status-blocked bg-status-blocked-bg px-2 py-1.5"
    >
      <div className="font-mono text-micro font-bold leading-relaxed text-status-blocked">{r.sentence}</div>
      <div className="mt-1 font-mono text-[10px] leading-relaxed text-grey-dark">
        <span className="font-bold uppercase tracking-wider">Rule:</span> {r.rule.instrument} {r.rule.provision}
        {' — '}{r.rule.text}
      </div>
      <div className="mt-0.5 font-mono text-[10px] leading-relaxed text-grey-dark">
        <span className="font-bold uppercase tracking-wider">To clear it:</span> {recoveryText(r.recovery)}
      </div>
      {r.matched !== null && r.matched !== '' && (
        <div className="mt-0.5 font-mono text-[10px] leading-relaxed text-grey-dark">
          <span className="font-bold uppercase tracking-wider">It objected to:</span> “{r.matched}”
        </div>
      )}
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-grey">
        {r.code} · ruleset v{r.ruleSetVersion}
      </div>
    </div>
  );
}

/**
 * `RefusalRecovery` rendered as a sentence.
 *
 * `not_recoverable` is the one that must not be softened. An operator who reads
 * "supply more information" where the honest answer is "no configuration of this
 * instrument produces the outcome you want" will spend the worst ten minutes of the
 * incident looking for a setting.
 */
function recoveryText(r: RefusalRecovery): string {
  switch (r.kind) {
    case 'not_recoverable':
      return `Nothing clears this. ${r.why}`;
    case 'edit_text':
      return `Change the words: ${r.what}`;
    case 'supply_data':
      return `A fact is missing — ${r.missing}. Who can supply it: ${r.whoCanSupply}.`;
    case 'human_authority':
      return `A named human with ${r.role} authority has to act, and it cannot be the author.`;
    case 'wait_until':
      return `Time or an external event resolves it: ${r.condition}.`;
    case 'different_surface':
      return `The content is fine and the surface is not: ${r.suggestion}`;
    default: {
      // A recovery kind this page has not been taught. Say so rather than render
      // nothing — a blank recovery line reads as "there is nothing to do".
      const unknown: never = r;
      return `This refusal carries a recovery this screen does not know how to render (${JSON.stringify(unknown)}). Read the code above and the engine's own text.`;
    }
  }
}

/** Verbatim text in a box that says it is verbatim. React escapes it; markup is inert. */
function Verbatim(props: { label: string; text: string; testid?: string }) {
  return (
    <div className="mt-1.5">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">{props.label}</div>
      <pre
        data-testid={props.testid}
        className="mt-0.5 whitespace-pre-wrap break-words border-l-2 border-line bg-ice-soft/50 px-2 py-1 font-mono text-micro leading-relaxed text-navy dark:bg-ice-soft/10"
      >{props.text}</pre>
    </div>
  );
}

/**
 * The state of one desk assertion, in words, beside the checkbox that sets it.
 *
 * NOT decoration, and not a colour. The three assertions in the panel at the foot of
 * this screen are `<input type="checkbox">` carrying `br-no-print`, so on paper the
 * control disappears and its sentence — "This statement discloses inside information
 * under MiCA Art 88(1)" — stays behind unqualified. A printed crisis record therefore
 * read as though all three were asserted no matter what the operator had ticked, and
 * the one that matters most is the Art 88(1) limb: combining an inside-information
 * disclosure with marketing is prohibited outright, so a sheet that asserts it by
 * accident and a sheet that omits it are both wrong, in opposite directions, and
 * neither is visible on screen where the box is still there to read.
 *
 * The word carries the state and the colour only agrees with it — that is the rule
 * for every signal on this page, because a printed sheet may be photocopied, faxed to
 * a competent authority, or read by someone who cannot distinguish the two hues.
 */
function AssertedMark(props: { on: boolean }) {
  return (
    <span
      className={clsx('mr-1 font-bold', props.on ? 'text-status-blocked' : 'text-grey')}
      data-asserted={props.on ? 'yes' : 'no'}
    >
      [{props.on ? 'ASSERTED' : 'not asserted'}]
    </span>
  );
}

const FIELD = 'w-full rounded border border-line bg-card px-2 py-1 font-mono text-micro text-navy focus-ring';

/**
 * A `<textarea>` that actually prints what has been typed into it.
 *
 * THE CLAIM THAT WAS FALSE. The print block below used to say "a `<textarea>` prints
 * its content" and merely stripped its border and set `height: auto`. A textarea is a
 * replaced element with its own scroll box: `height: auto` resolves to its `rows`
 * default — two lines — and everything past that is clipped on paper with no
 * scrollbar and no ellipsis to show that anything was removed. Six fields on this
 * screen are textareas, including the three tri-slot boxes whose whole purpose is to
 * hold more than two lines, so the printed sheet quietly truncated the operator's own
 * words. Setting a large `min-height` instead only moves the cut.
 *
 * So the value is mirrored into a `<pre>` that only exists on paper, and the control
 * itself is hidden there. `pre` wraps, grows and breaks across pages, which is what
 * paper needs. Both nodes read the same `value` in the same render, so they cannot
 * disagree — the mirror is not a copy kept in step by hand.
 */
function MirroredTextarea(props: {
  className: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  testid?: string;
}) {
  return (
    <>
      <textarea
        className={props.className}
        aria-label={props.label}
        placeholder={props.placeholder}
        data-testid={props.testid}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <pre
        aria-hidden="true"
        data-print-mirror={props.testid ?? props.label}
        className="hidden whitespace-pre-wrap break-words border-l-2 border-line px-2 py-1 font-mono text-micro leading-relaxed text-navy print:block"
      >{props.value === '' ? '(nothing entered)' : props.value}</pre>
    </>
  );
}

/* ════════ §D This screen's own small decisions, named ════════ */

/**
 * ONE SEVERITY SCALE, and this page no longer maps between two.
 *
 * An earlier revision of the engine carried its own `IncidentSeverity`
 * (`s1_run_risk` … `s4_watch`) alongside the shared `ImpactSeverity`, and this
 * screen held a documented mapping between them. The integration pass collapsed
 * them — `crisis.ts` now declares `IncidentSeverity = ImpactSeverity` and
 * re-exports rather than redeclares — so the mapping is gone rather than kept as a
 * no-op. `INCIDENT_SEVERITIES` supplies the display order, worst first, because a
 * picker that lists "none" first invites the wrong answer under pressure.
 */

/** The incident types the room offers. The shared union, in the order a desk meets them. */
const INCIDENT_TYPES: readonly IncidentType[] = [
  'outage', 'security_incident', 'hack_rumour', 'depeg', 'delisting',
  'regulatory_action', 'peer_contagion', 'impersonation',
];

const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  outage: 'Outage',
  security_incident: 'Security incident',
  hack_rumour: 'Hack rumour (unverified)',
  depeg: 'Depeg of a listed asset',
  delisting: 'Delisting',
  regulatory_action: 'Regulatory action',
  peer_contagion: 'Peer contagion — a shared attribute',
  impersonation: 'Impersonation',
};

const PHASES: readonly IncidentPhase[] = ['preparation', 'initial', 'maintenance', 'recovery'];

/** An append-only local log line. Printed; never sent anywhere. */
interface LogEntry {
  readonly at: string;
  readonly what: string;
}

/** The state of one clearance lane as the operator is filling it in. */
interface LaneForm {
  reviewer: string;
  /** `null` until the reviewer answers the headline question. Never defaulted to true. */
  headlineTest: boolean | null;
  comment: string;
}

const EMPTY_LANE: LaneForm = { reviewer: '', headlineTest: null, comment: '' };

const ALL_ROLES: readonly ClearanceRole[] = ['reputation', 'policy', 'sme', 'legal'];

const ROLE_TITLE: Record<ClearanceRole, string> = {
  reputation: 'Reputation',
  policy: 'Policy',
  sme: 'Subject-matter expert',
  legal: 'Legal',
};

const ROLE_WHAT_THEY_CHECK: Record<ClearanceRole, string> = {
  reputation: 'Responsible for the organisation\'s reputation. Would this sentence survive being read back to us.',
  policy: 'Responsible for ensuring the information does not counter organisation policy.',
  sme: 'Someone both fast and knowledgeable on the actual subject. Are the facts right.',
  legal: 'In the path ONLY when the subject has specific legal implications. Kept out otherwise, on purpose.',
};

/* ════════ §E The room ════════ */

export function MarketingCrisis() {
  const now = useTickingNow();
  const printedAt = usePrintInstant();

  /* ── The incident ── */
  const [incidentId] = useState(() => `local-${Date.now().toString(36)}`);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [severity, setSeverity] = useState<IncidentSeverity>('high');
  const [incidentType, setIncidentType] = useState<IncidentType>('peer_contagion');
  const [phase, setPhase] = useState<IncidentPhase>('initial');
  const [firstStatementAt, setFirstStatementAt] = useState<string | null>(null);

  /* ── The clock suppression, and the form that has to justify it ── */
  const [suppression, setSuppression] = useState<ClockSuppression | null>(null);
  const [suppressReason, setSuppressReason] = useState('');
  const [suppressBy, setSuppressBy] = useState('');
  const [suppressRefusal, setSuppressRefusal] = useState<CrisisRefusal | null>(null);

  /* ── The statement ── */
  const [statementId, setStatementId] = useState<HoldingStatementId | null>(null);
  const [adHoc, setAdHoc] = useState(false);
  const [known, setKnown] = useState('');
  const [notKnown, setNotKnown] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextUpdateBy, setNextUpdateBy] = useState('');
  const [empathy, setEmpathy] = useState('');
  const [withheldWhat, setWithheldWhat] = useState('');
  const [withheldWhy, setWithheldWhy] = useState('');
  const [authoredBy, setAuthoredBy] = useState('');
  const [authoredAt, setAuthoredAt] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<readonly HoldingPrecondition[]>([]);

  /* ── The clears ── */
  const [lanes, setLanes] = useState<Record<ClearanceRole, LaneForm>>({
    reputation: { ...EMPTY_LANE }, policy: { ...EMPTY_LANE },
    sme: { ...EMPTY_LANE }, legal: { ...EMPTY_LANE },
  });
  const [recorded, setRecorded] = useState<readonly Clearance[]>([]);
  const [legalImplications, setLegalImplications] = useState(false);

  /* ── The desk's standing ── */
  const [suspended, setSuspended] = useState(false);
  const [authority, setAuthority] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [counselNamed, setCounselNamed] = useState('');
  const [insideInformation, setInsideInformation] = useState(false);
  const [promotional, setPromotional] = useState(false);

  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const note = useCallback((what: string) => {
    setLog((l) => [...l, { at: new Date().toISOString(), what }]);
  }, []);

  /* ── Derived: the body, its text, its fingerprint ── */

  /** One line per row, blanks dropped. The engine treats a blank line as absent. */
  const lines = (v: string): readonly string[] => v.split('\n').map((s) => s.trim()).filter((s) => s !== '');

  const body: StatementBody = useMemo(() => ({
    known: lines(known),
    notKnown: lines(notKnown),
    nextStep: { action: nextAction.trim(), nextUpdateBy: fromLocalInput(nextUpdateBy) ?? '' },
    empathy: empathy.trim() === '' ? null : empathy.trim(),
    withheld: withheldWhat.trim() === ''
      ? null
      : { what: withheldWhat.trim(), whyNotReleasable: withheldWhy.trim() },
  }), [known, notKnown, nextAction, nextUpdateBy, empathy, withheldWhat, withheldWhy]);

  const text = useMemo(() => renderStatementText(body), [body]);
  const fingerprint = useFingerprint(text);

  /*
   * ══ THE WORDING GATE, ON THE ONLY OUTBOUND PATH THIS ROOM HAS ══
   *
   * This page makes ZERO API calls, by design — it must work with the API down, which is
   * when an incident is most likely. The consequence nobody had stated: `copy()` put the
   * composed LCX statement, including operator free text typed at 02:00, on the clipboard
   * having consulted `activateCrisisStatement` and NOTHING ELSE. The crisis engine checks
   * clearance, completeness, over-reassurance and desk mode. It does not read the WORDS
   * against MiCA Art 66(2)-(3): a price promise, a return promise, an invented licence or a
   * personalised recommendation typed into the `known` column reached the clipboard
   * unexamined, while `/:id/draft` refused the same sentence.
   *
   * `checkClaimSafety` is pure, needs no data and no network, so it runs here. It is the
   * SAME engine and the same ruleset version as the desk's gate — not a second opinion
   * written in a component, which is what `preChecks.ts` exists to refuse to be.
   *
   * WHAT IT STILL CANNOT DO, and §5 says so on screen rather than here only: the Art 90
   * embargo and Art 91(3)(c) holdings joins need the registers, the registers need the API,
   * and the API may be down. So a statement naming an asset symbol is refused outright by
   * `assetsNamedButUnjoinable` below rather than passed as clear — an unavailable check is
   * not a passed check, and that is the same rule the server gate applies.
   */
  const wording = useMemo(() => checkClaimSafety({
    text,
    channel: 'x_public',
    verb: 'original',
    claimIdsCited: [],
    topic: null,
    jurisdiction: 'eu',
    product: null,
    sourceText: null,
    /*
     * THE ONE FIGURE THE INSTRUMENT ITSELF PUT IN THE TEXT.
     *
     * `figuresIn` treats every digit run as a figure, and the next-update instant is
     * rendered into the statement body from a datetime control. Left unsourced, EVERY
     * crisis statement refused `UNSOURCED_FIGURE` on the timestamp the template requires —
     * a rule with a known false-positive mode holding a refusal, which this compartment
     * elsewhere refuses to do (see the `"buy "` note in `claimSafety.ts:1258`).
     *
     * It is substantiated by what it is: a commitment the desk recorded in this room, not
     * an assertion about the world. Nothing else is whitelisted — every other digit the
     * operator types is still checked, which is the case the rule was written for.
     */
    substantiatedFigures: nextUpdateFigures(body.nextStep.nextUpdateBy),
    solvencyAttestationRef: null,
  }), [text, body.nextStep.nextUpdateBy]);

  /** Error-severity findings block, exactly as they do in `outboundGate.ts`. */
  const wordingBlocks = useMemo(
    () => [
      ...wording.verdict.refusals.map((r) => ({ code: r.code as string, sentence: r.sentence })),
      ...wording.verdict.violations
        .filter((v) => v.severity === 'error')
        .map((v) => ({ code: v.rule, sentence: v.remedy })),
    ],
    [wording],
  );

  /** Symbols this statement names, which this room cannot join against any register. */
  const assetsNamedButUnjoinable = useMemo(() => namedAssets(text), [text]);

  /**
   * EVERY CLEARANCE AGAINST OLD BYTES IS KEPT, NOT DISCARDED.
   *
   * The engine compares each clearance's `contentHash` with the current one and
   * reports the mismatch as `void_content_changed`. Dropping stale clearances here
   * would make an edit look like a lane that had simply not been done yet, which is
   * the opposite of the point: the operator needs to see that someone DID clear
   * this, and that their clearance no longer counts, and why.
   */
  const clock: TtfsAssessment = useMemo(() => assessTimeToFirstStatement({
    incidentType, severity, openedAt, firstStatementAt, now, suppression,
  }), [incidentType, severity, openedAt, firstStatementAt, now, suppression]);

  const statement = getHoldingStatement(statementId);

  const draft: CrisisStatementDraft = useMemo(() => ({
    incidentId,
    incidentType,
    phase,
    severity,
    seq: 1,
    body,
    statementId: adHoc ? null : statementId,
    statementVersion: adHoc ? null : (statement?.version ?? null),
    adHoc,
    authoredBy: authoredBy.trim(),
    residualUnknownsClosed: null,
    // No basis capture on this surface yet — see the note beside the reassurance
    // panel. An empty list makes every reassurance construction refuse, which is
    // the correct default and is stated rather than worked around.
    bases: [],
    preconditionsAcknowledged: acknowledged,
    carriesPromotionalContent: promotional,
    isInsideInformationDisclosure: insideInformation,
    contentHash: fingerprint.hex,
    supersedes: null,
  }), [
    incidentId, incidentType, phase, severity, body, adHoc, statementId, statement,
    authoredBy, acknowledged, promotional, insideInformation, fingerprint.hex,
  ]);

  const deskMode: DeskMode = useMemo(() => (suspended
    ? {
        kind: 'suspended_by_authority' as const,
        authority: authority.trim() || '(authority not named)',
        orderRef: orderRef.trim() || '(order reference not recorded)',
        effectiveFrom: openedAt ?? now,
        /*
         * THIS PAGE HAS ONE CHECKBOX, NOT AN ORDER. It knows only that an authority has
         * suspended the desk; it has no field for which Art 94(1) limb arrived or when the
         * order ends. `expiresAt` used to be `now`, which said "the suspension expires this
         * instant" and sat one millisecond from reading as `lapsed`. `null` is the honest
         * value now that the type allows it: no end has been recorded here.
         *
         * `prohibit_or_suspend` is the CONSERVATIVE limb and the choice is deliberate. It
         * carries no statutory ceiling, so nothing on this page can conclude the desk
         * reopens on a date nobody entered — the crisis room stays closed until a
         * withdrawal is recorded on the desk-mode surface, which is where an actual order
         * gets transcribed with its power and its dates.
         */
        expiresAt: null,
        suspensionPower: 'prohibit_or_suspend' as const,
        recordedBy: authoredBy.trim() || '(not named)',
      }
    : { kind: 'normal' as const }), [suspended, authority, orderRef, openedAt, now, authoredBy]);

  const activation: CrisisActivation = useMemo(() => activateCrisisStatement({
    draft,
    clearances: recorded,
    authoredAt: authoredAt ?? openedAt ?? now,
    legalImplications,
    deskMode,
    counselNamed: counselNamed.trim() === '' ? null : counselNamed.trim(),
    now,
  }), [draft, recorded, authoredAt, openedAt, now, legalImplications, deskMode, counselNamed]);

  /* ── Actions ── */

  const open = () => {
    const at = new Date().toISOString();
    setOpenedAt(at);
    note(`Incident opened. The desk became aware at ${stamp(at)}. Severity ${INCIDENT_SEVERITY_LABEL[severity]}, budget ${TTFS_BUDGET_MINUTES_BY_SEVERITY[severity]} minutes.`);
  };

  const seed = (s: HoldingStatement) => {
    const by = fromLocalInput(nextUpdateBy)
      ?? new Date(Date.parse(now) + 60 * 60_000).toISOString();
    const seeded = seedStatementBody(s, by);
    setStatementId(s.id);
    setAdHoc(false);
    setKnown(seeded.known.join('\n'));
    setNotKnown(seeded.notKnown.join('\n'));
    setNextAction(seeded.nextStep.action);
    setNextUpdateBy(toLocalInput(seeded.nextStep.nextUpdateBy));
    setAuthoredAt(new Date().toISOString());
    setAcknowledged([]);
    setRecorded([]);
    note(`Seeded from ${s.id} v${s.version} (library v${HOLDING_LIBRARY_VERSION}). Every clearance reset: the bytes changed.`);
  };

  const suppress = () => {
    const at = new Date().toISOString();
    const candidate = { reason: suppressReason.trim(), by: suppressBy.trim(), at };
    const refusal = validateClockSuppression(candidate);
    setSuppressRefusal(refusal);
    if (refusal !== null) return;
    setSuppression({ reason: candidate.reason, by: candidate.by, at });
    note(`Clock suppressed by ${candidate.by}: ${candidate.reason}`);
  };

  const unsuppress = () => {
    setSuppression(null);
    setSuppressRefusal(null);
    note('Clock suppression lifted. The elapsed figure was never deleted.');
  };

  const recordClear = (role: ClearanceRole, mode: 'blocking' | 'advisory') => {
    const lane = lanes[role];
    const reviewer = lane.reviewer.trim();
    if (reviewer === '') { toast('error', 'Name the reviewer. A clearance with no name is not a clearance.'); return; }
    if (lane.headlineTest === null) {
      toast('error', `Answer the reviewer's test first: ${CLEARANCE_HEADLINE_TEST_QUESTION}`);
      return;
    }
    if (fingerprint.kind === 'computing') {
      toast('error', 'The statement fingerprint is still being computed. A clearance recorded now would bind to nothing.');
      return;
    }
    const c: Clearance = {
      role,
      mode,
      reviewer,
      at: new Date().toISOString(),
      headlineTest: lane.headlineTest,
      contentHash: fingerprint.hex,
      comment: lane.comment.trim() === '' ? null : lane.comment.trim(),
    };
    setRecorded((r) => [...r.filter((x) => !(x.role === role && x.mode === mode)), c]);
    note(`${role} ${mode} clearance recorded by ${reviewer}; headline test answered ${lane.headlineTest ? 'yes' : 'NO'}; bound to ${fingerprint.kind} ${fingerprint.hex.slice(0, 12)}…`);
  };

  const markIssued = () => {
    const at = new Date().toISOString();
    setFirstStatementAt(at);
    note(`First statement handed off at ${stamp(at)}. NOTHING WAS PUBLISHED BY THIS SYSTEM — a named human posts it by hand.`);
  };

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast('success', `${what} copied. LCX OS does not post — paste it yourself.`);
      note(`${what} copied to the clipboard for manual publication.`);
    } catch {
      toast('error', 'Could not copy. Select the text and copy it by hand.');
    }
  };

  const laneOf = useCallback((role: ClearanceRole) => lanes[role], [lanes]);
  const setLane = useCallback((role: ClearanceRole, patch: Partial<LaneForm>) => {
    setLanes((l) => ({ ...l, [role]: { ...l[role], ...patch } }));
  }, []);

  const available = holdingStatementsFor(incidentType);
  const unprepared = unpreparedIncidentTypes(INCIDENT_TYPES);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 text-navy">
      <PrintStyles />
      <CrisisPrintStyles />

      {/* A DIV, NOT A <header> — PrintStyles hides header/aside/footer in print, and
          the clock and the stamp are the two things the paper copy must carry. */}
      <div className="border-b-2 border-navy pb-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-mono text-[17px] font-bold uppercase tracking-wider">The crisis room</h1>
          <span className="font-mono text-micro uppercase tracking-wider text-grey">
            LCX Marketing · known / not known / next update · three parallel clears · no publish path
          </span>
          <span className="ml-auto font-mono text-micro tabular-nums text-grey" data-testid="crisis-printed-at">
            SHEET GENERATED {stamp(printedAt)}
          </span>
          <span className="br-no-print flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>Print this room</Button>
          </span>
        </div>
      </div>

      {/* THE FIRST THING AFTER THE TITLE, because it is the thing that will cost the
          most if it is discovered at the wrong moment. */}
      <Notice tone="conditional" testid="crisis-not-persisted" title="Nothing on this screen is saved. Print it or copy the log before you close the tab.">
        There is no crisis table, no route behind this room and no migration for one, so every
        field, clearance and log line below lives in this browser tab and nowhere else. A reload
        loses it. That is stated here rather than discovered later, and it is a deliberate choice
        over the alternative — writing this screen against a response contract for an endpoint that
        does not exist, which is how this codebase once shipped a page guaranteed to crash. The room
        works with the API down, and the record leaves it by print or clipboard.
      </Notice>

      {CRISIS_ROOM_CANNOT_PUBLISH && (
        <Notice tone="ready" testid="crisis-cannot-publish" title="This room cannot publish, and there is no button here that could">
          {CRISIS_ROOM_HANDOFF_REASON}
        </Notice>
      )}

      {HOLDING_STATEMENTS_ARE_NOT_COUNSEL_REVIEWED && (
        <Notice tone="conditional" testid="crisis-unreviewed" title="The precleared wording is NOT counsel-reviewed">
          {HOLDING_STATEMENTS_UNREVIEWED_REASON}
        </Notice>
      )}

      {fingerprint.kind === 'fnv1a_fallback' && (
        <Notice tone="conditional" testid="fingerprint-fallback" title="Clearances are bound by a fingerprint, not a SHA-256 hash">
          {FINGERPRINT_FALLBACK_NOTICE}
        </Notice>
      )}

      {/* ══ §1 THE CLOCK ══ */}
      <SectionHead
        n="§1"
        title="The clock"
        note={
          <>
            Time from <strong>when the desk became aware</strong> to the first statement, against the
            severity budget. Not time since the incident began — the desk cannot know that, and a
            clock that pretended to would flatter it.
          </>
        }
      />
      <ClockPanel
        clock={clock}
        openedAt={openedAt}
        severity={severity}
        onSeverity={(s) => { setSeverity(s); note(`Severity set to ${INCIDENT_SEVERITY_LABEL[s]} — budget ${TTFS_BUDGET_MINUTES_BY_SEVERITY[s]} minutes.`); }}
        onOpen={open}
        onOpenedAt={(v) => { setOpenedAt(v); note(`Awareness instant corrected to ${stamp(v)}.`); }}
        suppression={suppression}
        suppressReason={suppressReason}
        suppressBy={suppressBy}
        onSuppressReason={setSuppressReason}
        onSuppressBy={setSuppressBy}
        onSuppress={suppress}
        onUnsuppress={unsuppress}
        suppressRefusal={suppressRefusal}
      />

      {/* ══ §2 THE STATEMENT ══ */}
      <SectionHead
        n="§2"
        title="The statement — what we know, what we do not know, when we will speak again"
        note={
          <>
            The only shape a public statement about an incident may take. An empty{' '}
            <strong>not known</strong> column blocks issue: by the doctrine&apos;s own logic a
            statement admitting no uncertainty during a live incident is either speculation or
            over-reassurance, and over-reassurance is the charged act.
          </>
        }
      />

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Incident type">
          <select
            className={FIELD}
            aria-label="Incident type"
            value={incidentType}
            onChange={(e) => { setIncidentType(e.target.value as IncidentType); }}
          >
            {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{INCIDENT_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Phase">
          <select className={FIELD} aria-label="Incident phase" value={phase} onChange={(e) => setPhase(e.target.value as IncidentPhase)}>
            {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Who is writing this">
          <input className={FIELD} aria-label="Author" placeholder="a named human" value={authoredBy} onChange={(e) => setAuthoredBy(e.target.value)} />
        </Field>
        <Field label="Next update by (UTC)">
          <input className={FIELD} type="datetime-local" aria-label="Next update by" value={nextUpdateBy} onChange={(e) => setNextUpdateBy(e.target.value)} />
        </Field>
      </div>

      <PreclearPicker
        available={available}
        chosen={statementId}
        adHoc={adHoc}
        incidentType={incidentType}
        onSeed={seed}
        onAdHoc={() => {
          setAdHoc(true);
          setStatementId(null);
          setAuthoredAt(new Date().toISOString());
          setRecorded([]);
          note('Ad hoc: the operator is writing their own words. No preclear is credited, and the record says so.');
        }}
      />

      <div className="mt-2 grid gap-2 lg:grid-cols-3">
        <SlotBox
          label="What we know"
          hint="One fact per line. Facts the desk can stand behind, however few."
          value={known}
          onChange={setKnown}
          held={activation.completeness.slots.known}
          testid="slot-known"
        />
        <SlotBox
          label="What we do not yet know"
          hint="One open question per line. This column is what stops a statement becoming “everything is fine”."
          value={notKnown}
          onChange={setNotKnown}
          held={activation.completeness.slots.notKnown}
          testid="slot-not-known"
        />
        <SlotBox
          label="What happens next"
          hint="What the desk is doing until the next update. The instant itself is above."
          value={nextAction}
          onChange={setNextAction}
          held={activation.completeness.slots.nextUpdate}
          testid="slot-next"
        />
      </div>

      <details className="br-no-print mt-2">
        <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-wider text-grey focus-ring">
          Optional: empathy line, and anything being withheld
        </summary>
        <div className="mt-1.5 grid gap-2 lg:grid-cols-3">
          <Field label="Empathy line (optional)">
            <MirroredTextarea className={`${FIELD} min-h-[54px]`} label="Empathy line" value={empathy} onChange={setEmpathy} />
          </Field>
          <Field label="Being withheld">
            <MirroredTextarea className={`${FIELD} min-h-[54px]`} label="Withheld" value={withheldWhat} onChange={setWithheldWhat} />
          </Field>
          <Field label="Why it cannot be released">
            <MirroredTextarea className={`${FIELD} min-h-[54px]`} label="Why withheld" value={withheldWhy} onChange={setWithheldWhy} />
          </Field>
        </div>
      </details>

      {statement !== null && !adHoc && (
        <PreclearBrief statement={statement} acknowledged={acknowledged} onToggle={(p) => {
          setAcknowledged((a) => (a.includes(p) ? a.filter((x) => x !== p) : [...a, p]));
        }} />
      )}

      <Verbatim label="The statement as it would be handed over" text={text} testid="statement-text" />
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-grey" data-testid="statement-fingerprint">
        {fingerprint.kind === 'computing'
          ? 'fingerprint: computing — no clearance can be recorded yet'
          : `${fingerprint.kind === 'sha256' ? 'sha-256' : 'fnv-1a fingerprint (not a hash)'}: ${fingerprint.hex}`}
        {' · '}{statement === null ? (adHoc ? 'ad hoc — no preclear credited' : 'no statement chosen') : `${statement.id} v${statement.version} · library v${HOLDING_LIBRARY_VERSION}`}
      </div>

      {activation.completeness.refusals.length > 0 && (
        <div data-testid="completeness-refusals">
          {activation.completeness.refusals.map((r) => <RefusalCard key={r.code} refusal={r} />)}
        </div>
      )}

      <ReassurancePanel activation={activation} />

      {/* ══ §3 THE THREE PARALLEL CLEARS ══ */}
      <SectionHead
        n="§3"
        title="The three clears — gathered at the same time, never in a queue"
        note={
          <>
            Three blocking lanes, side by side: <strong>{CRISIS_BLOCKING_CLEARANCES.join(', ')}</strong>.
            Nothing waits for anything. Legal is out of the path unless the subject has specific legal
            implications, and a blocking legal hold offered when it does not is downgraded to advisory
            rather than honoured — otherwise every interested party becomes a veto and the desk stops
            speaking.
          </>
        }
      />

      <label className="br-no-print mt-2 flex items-start gap-2 font-mono text-micro text-navy">
        <input
          type="checkbox"
          className="mt-0.5 focus-ring"
          checked={legalImplications}
          onChange={(e) => {
            setLegalImplications(e.target.checked);
            note(`Legal implications marked ${e.target.checked ? 'YES — legal becomes a blocking lane' : 'no — legal returns to advisory'}.`);
          }}
        />
        <span>
          This subject has <strong>specific legal implications</strong>, so legal is a blocking lane
          for it. A human states this; nothing infers it, because inferring legal sensitivity from
          text is precisely the judgement a machine should not make.
        </span>
      </label>

      <div className="mt-2 grid gap-2 lg:grid-cols-4" data-testid="clearance-lanes">
        {ALL_ROLES.map((role) => (
          <LaneCard
            key={role}
            role={role}
            lane={activation.clearance.lanes.find((l) => l.role === role) ?? null}
            form={laneOf(role)}
            onForm={(patch) => setLane(role, patch)}
            onRecord={(mode) => recordClear(role, mode)}
            disabled={fingerprint.kind === 'computing'}
          />
        ))}
      </div>

      <div className="mt-1.5 font-mono text-micro text-grey" data-testid="clearance-summary">
        {activation.clearance.distinctReviewers} distinct human(s) hold a required blocking lane.
        {activation.clearance.longestPole
          ? ` Slowest lane: ${activation.clearance.longestPole.role} at ${activation.clearance.longestPole.minutes} minute(s) from authoring.`
          : ' No lane has been cleared yet, so there is no latency to report — which is not the same as a latency of zero.'}
      </div>

      {/* FOUR-EYES, HONESTLY. This is the admission that is the feature. */}
      {activation.clearance.benchAdmission !== null && (
        <Notice tone="blocked" testid="bench-admission" title="Four eyes were not achieved on this statement">
          {activation.clearance.benchAdmission}
        </Notice>
      )}

      {activation.clearance.downgradedToAdvisory.length > 0 && (
        <Notice tone="conditional" testid="downgraded-advisory" title={`${activation.clearance.downgradedToAdvisory.join(', ')} offered a blocking hold and does not have one`}>
          This item is not flagged as having specific legal implications, so a blocking hold from
          {' '}{activation.clearance.downgradedToAdvisory.join(', ')} has been recorded as an advisory
          comment. It is visible, it is on the record, and it cannot delay release. That is the
          doctrine read literally: others may review and comment, but not delay.
        </Notice>
      )}

      {activation.clearance.advisoryComments.length > 0 && (
        <div className="mt-2" data-testid="advisory-comments">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
            Advisory comments — recorded, visible, unable to block
          </div>
          <ul className="mt-0.5 space-y-0.5">
            {activation.clearance.advisoryComments.map((c, i) => (
              <li key={`${c.role}-${i}`} className="font-mono text-micro text-grey-dark">
                <strong>{c.role}</strong> · {c.reviewer}: {c.comment}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activation.clearance.refusals.map((r) => (
        <RefusalCard key={`${r.code}-${r.sentence.slice(0, 24)}`} refusal={r} testid={`clearance-refusal-${r.code}`} />
      ))}

      {/* ══ §4 PEER CONTAGION ══ */}
      <ContagionSection now={now} onUse={(attribute, question, differentiation) => {
        // ONE ACTION. On the day, nobody is browsing a library: the prepared lines
        // land in the two columns and the operator edits from there.
        setKnown((k) => [k.trim(), ...differentiation].filter((s) => s !== '').join('\n'));
        setAdHoc(false);
        setRecorded([]);
        note(`Peer-contagion preclear for "${attribute}" inserted, answering: ${question}. Every clearance reset: the bytes changed.`);
      }} />

      {/* ══ §5 WHAT THE DESK MAY DO ══ */}
      <SectionHead
        n="§5"
        title="May this go out?"
        note="Every gate, in the order the engine evaluates them, with what would change each answer. A refused statement is the normal outcome, not a fault."
      />
      <DeskStandingControls
        suspended={suspended}
        onSuspended={(v) => { setSuspended(v); note(v ? 'Art 94 marketing suspension recorded.' : 'Art 94 suspension cleared.'); }}
        authority={authority}
        onAuthority={setAuthority}
        orderRef={orderRef}
        onOrderRef={setOrderRef}
        counselNamed={counselNamed}
        onCounselNamed={setCounselNamed}
        insideInformation={insideInformation}
        onInsideInformation={setInsideInformation}
        promotional={promotional}
        onPromotional={setPromotional}
      />
      <GateLadder activation={activation} />
      <WordingGate blocks={wordingBlocks} assets={assetsNamedButUnjoinable} />
      <HandoffPanel
        activation={activation}
        text={text}
        firstStatementAt={firstStatementAt}
        wordingBlocks={wordingBlocks}
        assetsNamedButUnjoinable={assetsNamedButUnjoinable}
        onCopy={() => void copy(text, 'The statement')}
        onIssued={markIssued}
      />

      {/* ══ §6 THE LOG ══ */}
      <SectionHead
        n="§6"
        title="The log"
        note="Append-only, local to this tab, printed with the sheet. Copy it before you close the tab; nothing else keeps it."
      />
      <div className="br-no-print mt-1.5">
        <Button size="sm" variant="secondary" onClick={() => void copy(log.map((l) => `${l.at}  ${l.what}`).join('\n'), 'The log')}>
          Copy the log
        </Button>
      </div>
      {log.length === 0 ? (
        <p className="mt-1.5 font-mono text-micro text-grey" data-testid="log-empty">
          Nothing has happened in this room yet. This is an empty log, not a quiet incident.
        </p>
      ) : (
        <ol className="mt-1.5 space-y-0.5" data-testid="crisis-log">
          {log.map((l, i) => (
            <li key={`${l.at}-${i}`} className="font-mono text-micro leading-relaxed text-grey-dark">
              <span className="tabular-nums text-grey">{stamp(l.at)}</span> · {l.what}
            </li>
          ))}
        </ol>
      )}

      {/* ══ §7 THE DAYS AHEAD ══ */}
      <SectionHead
        n="§7"
        title="The days ahead"
        note={
          <>
            Everything above is about an incident that has already started. This is the other half — the
            risk already scheduled to land, by day, channel and severity — and the desk has no feed for it.
            The panel says so rather than showing a calm fortnight.
          </>
        }
      />
      <StormRelief
        field={FORWARD_RISK}
        title="Marketing risk by day, channel and severity"
        readsAs={
          'Each cell is one channel on one day; the strip underneath is the total risk between now and '
          + 'that day, and it refuses rather than continuing across a day nobody measured.'
        }
        heightPx={240}
      />

      <ClosingStatement
        printedAt={printedAt}
        activation={activation}
        clock={clock}
        unprepared={unprepared}
      />
    </div>
  );
}

/* ════════ §F The clock panel ════════ */

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">{props.label}</span>
      <span className="mt-0.5 block">{props.children}</span>
    </label>
  );
}

/**
 * The clock's tone. `overdue` is the loudest state on the screen, and `unknown` is
 * NOT quiet: a desk that cannot measure its own time-to-first-statement is in a
 * worse position than one that is late, because it will not find out.
 */
const CLOCK_TONE: Record<TtfsAssessment['state'], Tone> = {
  met: 'ready',
  running: 'conditional',
  overdue: 'blocked',
  breached: 'blocked',
  suppressed: 'conditional',
  unknown: 'blocked',
};

const CLOCK_HEADLINE: Record<TtfsAssessment['state'], string> = {
  met: 'MET',
  running: 'RUNNING',
  overdue: 'OVERDUE',
  breached: 'BREACHED',
  suppressed: 'SUPPRESSED',
  unknown: 'UNMEASURED',
};

function ClockPanel(props: {
  clock: TtfsAssessment;
  openedAt: string | null;
  severity: IncidentSeverity;
  onSeverity: (s: IncidentSeverity) => void;
  onOpen: () => void;
  onOpenedAt: (iso: string | null) => void;
  suppression: ClockSuppression | null;
  suppressReason: string;
  suppressBy: string;
  onSuppressReason: (v: string) => void;
  onSuppressBy: (v: string) => void;
  onSuppress: () => void;
  onUnsuppress: () => void;
  suppressRefusal: CrisisRefusal | null;
}) {
  const c = props.clock;
  const tone = CLOCK_TONE[c.state];
  return (
    <div
      data-testid="clock-panel"
      data-clock-state={c.state}
      className={clsx('mt-2 border-l-4 px-3 py-2', TONE_BORDER[tone])}
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider', TONE_TEXT[tone])}>
            Time to first statement · {CLOCK_HEADLINE[c.state]}
          </div>
          <div className={clsx('font-mono text-[44px] font-bold leading-none tabular-nums', TONE_TEXT[tone])} data-testid="clock-elapsed">
            {c.elapsedMinutes === null ? '—' : c.elapsedMinutes}
            <span className="text-[20px] text-grey">/{c.budget.budgetMinutes} min</span>
          </div>
        </div>
        <div className="min-w-[180px]">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Remaining</div>
          <div className="font-mono text-[22px] font-bold leading-none tabular-nums text-navy" data-testid="clock-remaining">
            {c.remainingMinutes === null ? 'unmeasured' : `${c.remainingMinutes} min`}
          </div>
        </div>
        <div className="br-no-print min-w-[200px]">
          <Field label="Severity — this sets the budget">
            <select
              className={FIELD}
              aria-label="Incident severity"
              value={props.severity}
              onChange={(e) => props.onSeverity(e.target.value as IncidentSeverity)}
            >
              {INCIDENT_SEVERITIES.map((s) => (
                <option key={s} value={s}>{INCIDENT_SEVERITY_LABEL[s]} · {TTFS_BUDGET_MINUTES_BY_SEVERITY[s]} min</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="br-no-print min-w-[220px]">
          <Field label="The desk became aware at (UTC)">
            <input
              className={FIELD}
              type="datetime-local"
              aria-label="Awareness instant"
              value={props.openedAt ? toLocalInput(props.openedAt) : ''}
              onChange={(e) => props.onOpenedAt(fromLocalInput(e.target.value))}
            />
          </Field>
        </div>
        {props.openedAt === null && (
          <Button size="sm" onClick={props.onOpen}>Open the incident now</Button>
        )}
      </div>

      <p className="mt-2 font-mono text-micro font-bold leading-relaxed text-grey-dark" data-testid="clock-sentence">
        {c.sentence}
      </p>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-grey">
        <span className="font-bold uppercase tracking-wider">Why there is a clock at all:</span>{' '}
        {SVB_RUN_SPEED_EVIDENCE.headline} {TTFS_BUDGET_BASIS}
      </p>

      {/* SUPPRESSION. Only with a recorded reason, and the elapsed figure survives it. */}
      <div className="br-no-print mt-2 border-t border-line pt-2">
        {props.suppression === null ? (
          <>
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
              Stop the clock — only with a recorded reason
            </div>
            <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
              <input
                className={FIELD}
                aria-label="Suppression reason"
                placeholder="Why is the clock being stopped? At least twelve characters."
                value={props.suppressReason}
                onChange={(e) => props.onSuppressReason(e.target.value)}
              />
              <input
                className={FIELD}
                aria-label="Suppressed by"
                placeholder="who is deciding"
                value={props.suppressBy}
                onChange={(e) => props.onSuppressBy(e.target.value)}
              />
              <Button size="sm" variant="secondary" onClick={props.onSuppress}>Suppress</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-micro text-grey-dark">
              Suppressed by <strong>{props.suppression.by}</strong> at {stamp(props.suppression.at)}:{' '}
              {props.suppression.reason}
            </span>
            <Button size="sm" variant="secondary" onClick={props.onUnsuppress}>Lift the suppression</Button>
          </div>
        )}
      </div>
      {props.suppressRefusal !== null && (
        <RefusalCard refusal={props.suppressRefusal} testid="suppression-refusal" />
      )}
      {props.suppression !== null && (
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-grey" data-testid="suppression-kept">
          Suppressing the clock did not delete the elapsed figure and did not close the breach. Both
          are still above and both print. The breach, not the suppression, is what a post-mortem can
          learn from.
        </p>
      )}
    </div>
  );
}

/* ════════ §G The preclear picker and the operator brief ════════ */

function PreclearPicker(props: {
  available: readonly HoldingStatement[];
  chosen: HoldingStatementId | null;
  adHoc: boolean;
  incidentType: IncidentType;
  onSeed: (s: HoldingStatement) => void;
  onAdHoc: () => void;
}) {
  return (
    <div className="mt-2">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
        Start from precleared text — one action
      </div>
      {props.available.length === 0 ? (
        <Notice tone="blocked" testid="preclear-absent" title={`Nothing is precleared for ${INCIDENT_TYPE_LABEL[props.incidentType]}`}>
          There is no prepared statement for this incident type. The whole point of a preclear is
          that it exists before the day it is needed, so this gap has to be closed on a quiet
          Tuesday and cannot be closed now. Writing your own words is legitimate and is recorded as
          ad hoc with your name on it — it is not a substitute for having prepared.
        </Notice>
      ) : (
        <div className="br-no-print mt-1 flex flex-wrap gap-1.5" data-testid="preclear-choices">
          {props.available.map((s) => (
            <Button
              key={s.id}
              size="xs"
              variant={props.chosen === s.id ? undefined : 'secondary'}
              onClick={() => props.onSeed(s)}
            >
              {s.title} · v{s.version}
            </Button>
          ))}
          <Button size="xs" variant={props.adHoc ? undefined : 'secondary'} onClick={props.onAdHoc}>
            Write my own words (ad hoc)
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The operator brief, composed by the engine from `mustNotSay`,
 * `requiresBeforeUse` and `operatorMustSupply` — so a future editor cannot delete a
 * protection by rewriting a paragraph on this page.
 *
 * The preconditions are ticked by a human and are never checked for them. The
 * instrument cannot know whether treasury looked at the balances; it can refuse to
 * proceed until somebody says they did, and record that they said it.
 */
function PreclearBrief(props: {
  statement: HoldingStatement;
  acknowledged: readonly HoldingPrecondition[];
  onToggle: (p: HoldingPrecondition) => void;
}) {
  return (
    <div className="mt-2 border border-line bg-card p-2.5">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
        Before use — tick each. None of these is checked for you.
      </div>
      <ul className="mt-1 space-y-1" data-testid="preconditions">
        {props.statement.requiresBeforeUse.map((p) => (
          <li key={p}>
            <label className="flex items-start gap-2 font-mono text-micro leading-relaxed text-navy">
              <input
                type="checkbox"
                className="br-no-print mt-0.5 focus-ring"
                checked={props.acknowledged.includes(p)}
                onChange={() => props.onToggle(p)}
                aria-label={p}
              />
              <span>
                <span className={clsx('mr-1 font-bold', props.acknowledged.includes(p) ? 'text-status-ready' : 'text-status-blocked')}>
                  [{props.acknowledged.includes(p) ? 'acknowledged' : 'NOT ACKNOWLEDGED'}]
                </span>
                {HOLDING_PRECONDITION_PROMPT[p]}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Verbatim label={`Operator brief — internal, never published`} text={renderStatementGuidance(props.statement)} testid="operator-brief" />
    </div>
  );
}

/** One tri-slot column. The held/missing state is the engine's, not this box's. */
function SlotBox(props: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  held: boolean;
  testid: string;
}) {
  return (
    <div className={clsx('border-l-4 px-2 py-1.5', props.held ? TONE_BORDER.ready : TONE_BORDER.blocked)}>
      <div className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider', props.held ? TONE_TEXT.ready : TONE_TEXT.blocked)}>
        {props.label} · {props.held ? 'present' : 'MISSING — BLOCKS ISSUE'}
      </div>
      <MirroredTextarea
        className={`${FIELD} mt-1 min-h-[110px]`}
        label={props.label}
        testid={props.testid}
        value={props.value}
        onChange={props.onChange}
      />
      <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-grey">{props.hint}</p>
    </div>
  );
}

/**
 * Over-reassurance, shown as findings plus refusals.
 *
 * There is no basis-capture control on this surface yet, and that is stated rather
 * than hidden: with no bases every reassurance construction refuses, which is the
 * correct default — "we are solvent" with nothing behind it is the sentence pleaded
 * as fraud in SEC v. Bankman-Fried — but it also means the room cannot currently be
 * used to issue a properly-evidenced solvency line. That is a gap in this screen,
 * not in the engine, and it is named in the closing statement.
 */
function ReassurancePanel(props: { activation: CrisisActivation }) {
  const r = props.activation.reassurance;
  if (r.findings.length === 0 && r.refusals.length === 0) return null;
  return (
    <div className="mt-2" data-testid="reassurance-panel">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
        Reassurance constructions found in this text
      </div>
      <ul className="mt-0.5 space-y-0.5">
        {r.findings.map((f, i) => (
          <li key={`${f.cls}-${i}`} className="font-mono text-micro leading-relaxed text-grey-dark">
            <strong>{f.cls.replace(/_/g, ' ')}</strong> — “{f.matched}”: {f.why}
          </li>
        ))}
      </ul>
      {r.refusals.map((x) => <RefusalCard key={`${x.code}-${x.sentence.slice(0, 24)}`} refusal={x} />)}
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-grey">
        <span className="font-bold uppercase tracking-wider">What this scan is not:</span> a proof. It
        matches known constructions and a rephrased assertion can walk past it, so a clean panel here
        means “no construction I hold was matched”, never “this statement does not over-reassure”.
        {' '}{FTX_OVER_REASSURANCE_EVIDENCE.headline}
      </p>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-status-conditional" data-testid="no-basis-capture">
        This screen has no control for entering a dated basis, so every reassurance class above
        refuses for want of one. That is the correct default and it is also a limitation of this
        surface: a properly-evidenced solvency line cannot be issued from here yet.
      </p>
    </div>
  );
}

/* ════════ §H One clearance lane ════════ */

const LANE_TONE: Record<string, Tone> = {
  held: 'ready',
  outstanding: 'blocked',
  refused_on_headline_test: 'blocked',
  void_content_changed: 'blocked',
  void_self_cleared: 'blocked',
  advisory_comment: 'deferred',
  not_required: 'deferred',
};

/**
 * A LANE, NOT A STEP. Every lane renders identically and independently; none shows
 * a position in a sequence, and none is disabled because another is outstanding.
 * That is the parallelism made visible — a numbered wizard here would reintroduce
 * the serial chain the doctrine exists to prevent, and once one is in the code
 * nobody takes it out.
 *
 * The reviewer's test is the literal question, asked before the lane can be
 * cleared. `headlineTest` starts as `null` and there is no default: a checkbox that
 * begins checked is a click, and CERC asks for an assertion.
 */
function LaneCard(props: {
  role: ClearanceRole;
  lane: { state: string; sentence: string; latencyMinutes: number | null; required: boolean } | null;
  form: LaneForm;
  onForm: (patch: Partial<LaneForm>) => void;
  onRecord: (mode: 'blocking' | 'advisory') => void;
  disabled: boolean;
}) {
  const state = props.lane?.state ?? 'outstanding';
  const tone = LANE_TONE[state] ?? 'deferred';
  return (
    <div
      data-testid={`lane-${props.role}`}
      data-lane-state={state}
      className={clsx('border-l-4 px-2 py-1.5', TONE_BORDER[tone])}
    >
      <div className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider', TONE_TEXT[tone])}>
        {ROLE_TITLE[props.role]} · {state.replace(/_/g, ' ')}
        {props.lane?.required === false ? ' · advisory' : ' · blocking'}
      </div>
      <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-grey">{ROLE_WHAT_THEY_CHECK[props.role]}</p>
      <p className="mt-1 font-mono text-micro leading-relaxed text-grey-dark" data-testid={`lane-sentence-${props.role}`}>
        {props.lane?.sentence ?? 'This lane has not been assessed yet.'}
      </p>
      {props.lane?.latencyMinutes !== null && props.lane?.latencyMinutes !== undefined && (
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-grey">
          {props.lane.latencyMinutes} minute(s) from authoring to this clearance.
        </p>
      )}

      <div className="br-no-print mt-1.5 space-y-1">
        <input
          className={FIELD}
          aria-label={`${props.role} reviewer`}
          placeholder="reviewer's name"
          value={props.form.reviewer}
          onChange={(e) => props.onForm({ reviewer: e.target.value })}
        />
        {/* THE REVIEWER'S TEST, WRITTEN OUT. Not a tooltip, not a label on a tick
            box — the question, in full, answered before the lane can be cleared. */}
        <fieldset className="border border-line px-1.5 py-1">
          <legend className="px-1 font-mono text-[10px] font-bold leading-tight text-navy" data-testid={`headline-question-${props.role}`}>
            {CLEARANCE_HEADLINE_TEST_QUESTION}
          </legend>
          <div className="flex gap-2">
            {([['yes', true], ['no', false]] as const).map(([label, value]) => (
              <label key={label} className="flex items-center gap-1 font-mono text-micro text-navy">
                <input
                  type="radio"
                  className="focus-ring"
                  name={`headline-${props.role}`}
                  checked={props.form.headlineTest === value}
                  onChange={() => props.onForm({ headlineTest: value })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <MirroredTextarea
          className={`${FIELD} min-h-[44px]`}
          label={`${props.role} comment`}
          placeholder="comment (required if you answered no)"
          value={props.form.comment}
          onChange={(comment) => props.onForm({ comment })}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" onClick={() => props.onRecord('blocking')} disabled={props.disabled}>
            Record a blocking clear
          </Button>
          <Button size="xs" variant="secondary" onClick={() => props.onRecord('advisory')} disabled={props.disabled}>
            Comment only
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ════════ §I Peer contagion — reachable in one action ════════ */

const CONTAGION_TONE: Record<string, Tone> = {
  ready: 'ready',
  expired: 'blocked',
  absent: 'blocked',
};

/**
 * The "are you like them" answers.
 *
 * ONE ACTION, and that is the whole design requirement: on the day the peer fails,
 * nobody is browsing a library. Each prepared answer inserts its differentiation
 * lines straight into the known column, and the gate refuses where nothing is
 * prepared or where what is prepared is past review.
 *
 * `unknown` applicability is NOT rendered as "does not apply". Whether LCX shares a
 * custodian, a bank or an auditor with any given peer is a question of fact this
 * compartment does not hold, so an unprepared answer to an unknown applicability is
 * the worst cell on the board and reads as two gaps rather than one clean no.
 */
function ContagionSection(props: {
  now: string;
  onUse: (attribute: ContagionAttribute, question: string, differentiation: readonly string[]) => void;
}) {
  const rows = contagionReadiness(props.now);
  return (
    <>
      <SectionHead
        n="§4"
        title="“Are you like the firm that just failed?”"
        note={
          <>
            {CRYPTO_COM_CONTAGION_EVIDENCE.headline} The answer has to exist before the peer fails, so each
            prepared line is one click from the statement above.
          </>
        }
      />
      <Notice tone="conditional" testid="contagion-owner" title="Which attributes LCX actually shares is not this compartment's to know">
        {CONTAGION_APPLICABILITY_OWNER}
      </Notice>
      <div className="mt-2 grid gap-2 lg:grid-cols-2" data-testid="contagion-rows">
        {rows.map((row) => {
          const gate = gateContagionAnswer(row.attribute, props.now);
          const tone = CONTAGION_TONE[row.preclear] ?? 'deferred';
          return (
            <div
              key={row.attribute}
              data-contagion-attribute={row.attribute}
              data-contagion-state={row.preclear}
              className={clsx('border-l-4 px-2 py-1.5', TONE_BORDER[tone])}
            >
              <div className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider', TONE_TEXT[tone])}>
                {row.attribute.replace(/_/g, ' ')} · preclear {row.preclear} · LCX {row.applicability}
              </div>
              <p className="mt-0.5 font-mono text-micro leading-relaxed text-grey-dark">{row.sentence}</p>
              {gate.preclear !== null && (
                <>
                  <p className="mt-1 font-mono text-micro font-bold text-navy">“{gate.preclear.question}”</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {gate.preclear.differentiation.map((d, i) => (
                      <li key={i} className="font-mono text-[10px] leading-relaxed text-grey-dark">— {d}</li>
                    ))}
                  </ul>
                  <div className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-status-blocked">
                    Must not say
                  </div>
                  <ul className="space-y-0.5">
                    {gate.preclear.mustNotSay.map((m, i) => (
                      <li key={i} className="font-mono text-[10px] leading-relaxed text-status-blocked">— {m}</li>
                    ))}
                  </ul>
                </>
              )}
              {gate.allowed && gate.preclear !== null ? (
                <div className="br-no-print mt-1.5">
                  <Button
                    size="xs"
                    onClick={() => props.onUse(row.attribute, gate.preclear!.question, gate.preclear!.differentiation)}
                  >
                    Use this answer
                  </Button>
                </div>
              ) : gate.refusal !== null ? (
                <RefusalCard refusal={gate.refusal} testid={`contagion-refusal-${row.attribute}`} />
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ════════ §J The desk's standing, and the two assertions only a human may make ════════ */

/**
 * Three human assertions live here and none of them is inferred.
 *
 * `isInsideInformationDisclosure` and `carriesPromotionalContent` are the desk's
 * own claims about the item. Both true is refused outright — MiCA Art 88(1)
 * prohibits combining an inside-information disclosure with marketing in one
 * artefact, and the resolution is two adjacent artefacts published together, never
 * one blended post. A machine must not decide which one a statement is, which is
 * why a suspension plus a disclosure demands a NAMED counsel rather than a rule of
 * thumb.
 */
function DeskStandingControls(props: {
  suspended: boolean;
  onSuspended: (v: boolean) => void;
  authority: string;
  onAuthority: (v: string) => void;
  orderRef: string;
  onOrderRef: (v: string) => void;
  counselNamed: string;
  onCounselNamed: (v: string) => void;
  insideInformation: boolean;
  onInsideInformation: (v: boolean) => void;
  promotional: boolean;
  onPromotional: (v: boolean) => void;
}) {
  return (
    <div className="mt-2 border border-line bg-card p-2.5">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
        What the desk asserts about this item — a human states each of these
      </div>
      <div className="mt-1 space-y-1">
        <label className="flex items-start gap-2 font-mono text-micro text-navy">
          <input type="checkbox" className="br-no-print mt-0.5 focus-ring" checked={props.insideInformation} onChange={(e) => props.onInsideInformation(e.target.checked)} />
          <span><AssertedMark on={props.insideInformation} />This statement discloses <strong>inside information</strong> under MiCA Art 88(1).</span>
        </label>
        <label className="flex items-start gap-2 font-mono text-micro text-navy">
          <input type="checkbox" className="br-no-print mt-0.5 focus-ring" checked={props.promotional} onChange={(e) => props.onPromotional(e.target.checked)} />
          <span><AssertedMark on={props.promotional} />This statement also carries <strong>promotional content</strong>.</span>
        </label>
        <label className="flex items-start gap-2 font-mono text-micro text-navy">
          <input type="checkbox" className="br-no-print mt-0.5 focus-ring" checked={props.suspended} onChange={(e) => props.onSuspended(e.target.checked)} />
          <span>
            <AssertedMark on={props.suspended} />
            A competent authority has <strong>suspended LCX&apos;s marketing communications</strong>
            {' '}under MiCA Art 94. Drafting, clearing, logging and export stay available — the record
            is what the supervisor will ask for.
          </span>
        </label>
      </div>
      {props.suspended && (
        <div className="hidden print:block mt-1.5 font-mono text-micro leading-relaxed text-navy" data-testid="suspension-printed">
          Suspension particulars — authority: {props.authority.trim() === '' ? 'NOT STATED' : props.authority}
          {' · '}order reference: {props.orderRef.trim() === '' ? 'NOT STATED' : props.orderRef}
          {' · '}counsel who ruled on classification: {props.counselNamed.trim() === '' ? 'NOT NAMED' : props.counselNamed}
        </div>
      )}
      {props.suspended && (
        <div className="br-no-print mt-1.5 grid gap-2 sm:grid-cols-3">
          <Field label="Authority (home or host)">
            <input className={FIELD} aria-label="Suspending authority" value={props.authority} onChange={(e) => props.onAuthority(e.target.value)} />
          </Field>
          <Field label="Order reference">
            <input className={FIELD} aria-label="Order reference" value={props.orderRef} onChange={(e) => props.onOrderRef(e.target.value)} />
          </Field>
          <Field label="Counsel who ruled on classification">
            <input className={FIELD} aria-label="Counsel named" placeholder="named, never a yes/no" value={props.counselNamed} onChange={(e) => props.onCounselNamed(e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

/* ════════ §K The gates ════════ */

/**
 * Every gate, in the engine's own evaluation order, with `skipped` shown as skipped.
 *
 * A gate that was never reached is not a gate that passed, and it is not a gate that
 * failed. Rendering the three states as two would let an operator believe the desk
 * had checked something it stopped before.
 */
function GateLadder(props: { activation: CrisisActivation }) {
  const a = props.activation;
  return (
    <>
      <div className={clsx('mt-2 border-l-4 px-2 py-1.5', a.issuable ? TONE_BORDER.ready : TONE_BORDER.blocked)}>
        <div
          className={clsx('font-mono text-label font-bold uppercase tracking-wider', a.issuable ? TONE_TEXT.ready : TONE_TEXT.blocked)}
          data-testid="issuable-verdict"
        >
          {a.issuable ? 'Every gate passed — this may be handed to a human' : 'NOT ISSUABLE'}
        </div>
        <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-grey">
          A refusal here is the normal outcome and not a fault. There is no override on this screen
          and none in the engine: no combination of inputs clears an expired statement, a
          self-clearance, an unconditional forward commitment or an uncited solvency claim.
        </p>
      </div>
      <ol className="mt-1.5 space-y-0.5" data-testid="gate-ladder">
        {a.gates.map((g) => (
          <li
            key={g.gate}
            data-gate={g.gate}
            data-gate-passed={g.passed ? 'yes' : g.skipped ? 'skipped' : 'no'}
            className="font-mono text-micro leading-relaxed"
          >
            <span
              className={clsx(
                'mr-1.5 inline-block w-[86px] font-bold uppercase tracking-wider',
                g.passed ? TONE_TEXT.ready : g.skipped ? TONE_TEXT.deferred : TONE_TEXT.blocked,
              )}
            >
              {g.passed ? 'passed' : g.skipped ? 'not reached' : 'REFUSED'}
            </span>
            <span className="text-navy">{g.gate.replace(/_/g, ' ')}</span>
            <span className="text-grey"> — {g.detail}</span>
          </li>
        ))}
      </ol>
      {a.refusals.map((r) => (
        <RefusalCard key={`${r.code}-${r.sentence.slice(0, 24)}`} refusal={r} testid={`gate-refusal-${r.code}`} />
      ))}
      {a.capabilities.notes.length > 0 && (
        <div className="mt-2" data-testid="capability-notes">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
            What the desk may still do
          </div>
          <ul className="mt-0.5 space-y-0.5">
            {a.capabilities.notes.map((n, i) => (
              <li key={i} className="font-mono text-micro leading-relaxed text-grey-dark">— {n}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-grey" data-testid="capability-matrix">
        draft {a.capabilities.mayDraft ? 'yes' : 'NO'} · clear {a.capabilities.mayClear ? 'yes' : 'NO'}
        {' · '}record what a human published {a.capabilities.mayRecordPublication ? 'yes' : 'NO'}
        {' · '}hand off {a.capabilities.mayHandOff ? 'yes' : 'NO'}
        {' · '}export the record {a.capabilities.mayExportRecord ? 'yes' : 'NO'}
      </div>
    </>
  );
}

/* ════════ §L Handoff — the seam a human crosses by hand ════════ */

/**
 * The terminal state, and the reason there is no button beside it that publishes.
 *
 * Copy is offered ONLY when every gate passed. Offering it beside a refused
 * statement would make the refusal advisory, and an operator under pressure will
 * take the affordance that is present. "Record that a human published it" is a
 * separate, later act, and it is what stops the clock — the clock is stopped by a
 * human confirming they spoke, never by this software deciding it has.
 */
/**
 * THE WORDS, CHECKED — and the two joins that cannot be, said out loud.
 *
 * Rendered between the crisis ladder and the handoff so the order on screen is the order of
 * the argument: the engine's gates, then the wording gate, then whether anything may leave.
 * A refusal here removes the copy affordance, for the reason the handoff panel already
 * states — a refusal beside a copy button is a suggestion, and at 02:00 an operator takes
 * whichever affordance is present.
 */
function WordingGate(props: { blocks: readonly { code: string; sentence: string }[]; assets: readonly string[] }) {
  const blocked = props.blocks.length > 0 || props.assets.length > 0;
  return (
    <div
      className={clsx('mt-2 border-l-4 px-2 py-1.5', blocked ? TONE_BORDER.blocked : TONE_BORDER.ready)}
      data-testid="crisis-wording-gate"
    >
      <div
        className={clsx('font-mono text-label font-bold uppercase tracking-wider', blocked ? TONE_TEXT.blocked : TONE_TEXT.ready)}
      >
        {blocked ? 'THE WORDS ARE REFUSED' : 'The words matched no rule this room holds'}
      </div>
      {props.blocks.length > 0 && (
        <ol className="mt-1 list-decimal space-y-0.5 pl-4" data-testid="crisis-wording-refusals">
          {props.blocks.map((b) => (
            <li key={b.code} className="font-mono text-micro leading-relaxed text-status-blocked">
              <span className="font-bold">{b.code}</span> — {b.sentence}
            </li>
          ))}
        </ol>
      )}
      {props.assets.length > 0 && (
        <p className="mt-1 font-mono text-micro leading-relaxed text-status-blocked" data-testid="crisis-assets-unjoinable">
          This statement names {props.assets.join(', ')}. The Art 90 embargo register and the
          Art 91(3)(c) holdings register are server-side, this room reads no API by design, and an
          unavailable check is not a passed check. Take a statement naming an asset through the
          desk&apos;s drafting room, where both joins run against live state.
        </p>
      )}
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-grey">
        This is the claim-safety engine the desk&apos;s outbound gate runs — the same ruleset,
        version {String(wordingRulesetVersionNote)}. A clean result means &ldquo;matched no rule
        it holds&rdquo;, never &ldquo;cleared&rdquo;: the two market-abuse joins and the Art 7
        element check are not reachable from this screen.
      </p>
    </div>
  );
}

/** Said once, so the sentence above cannot drift from the engine's own number. */
const wordingRulesetVersionNote = CLAIM_SAFETY_RULESET_VERSION;

function HandoffPanel(props: {
  activation: CrisisActivation;
  text: string;
  firstStatementAt: string | null;
  /** Error-severity wording findings. Non-empty removes the copy affordance. */
  wordingBlocks: readonly { code: string; sentence: string }[];
  /** Symbols named that this room cannot join against a register. */
  assetsNamedButUnjoinable: readonly string[];
  onCopy: () => void;
  onIssued: () => void;
}) {
  const a = props.activation;
  const wordingRefused = props.wordingBlocks.length > 0 || props.assetsNamedButUnjoinable.length > 0;
  return (
    <div className="mt-2 border border-line bg-card p-2.5" data-testid="handoff-panel">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Handoff</div>
      {wordingRefused ? (
        <p className="mt-0.5 font-mono text-micro leading-relaxed text-status-blocked" data-testid="handoff-wording-blocked">
          There is no copy affordance here, because the claim-safety gate above refused these
          words — or they name an asset whose embargo and holdings state this room cannot read.
          Every other gate may have passed; this one has not.
        </p>
      ) : !a.issuable ? (
        <p className="mt-0.5 font-mono text-micro leading-relaxed text-status-blocked" data-testid="handoff-blocked">
          There is no copy affordance here, because this statement is not issuable. A refusal beside a
          copy button is a suggestion, and at 02:00 an operator takes whichever affordance is present.
          Clear the refusals above and it appears.
        </p>
      ) : !a.capabilities.mayHandOff ? (
        <p className="mt-0.5 font-mono text-micro leading-relaxed text-status-blocked" data-testid="handoff-desk-blocked">
          Every gate on the text passed and the desk may not hand off. The reasons are in §5 — the
          statement can still be drafted, cleared, logged and exported, and doing all four is in
          LCX&apos;s interest.
        </p>
      ) : (
        <>
          <p className="mt-0.5 font-mono text-micro leading-relaxed text-grey-dark">
            {CRISIS_ROOM_HANDOFF_REASON}
          </p>
          <div className="br-no-print mt-1.5 flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={props.onCopy}>Copy the statement</Button>
            {props.firstStatementAt === null && (
              <Button size="sm" onClick={props.onIssued}>A human has published it — stop the clock</Button>
            )}
          </div>
        </>
      )}
      {props.firstStatementAt !== null && (
        <p className="mt-1 font-mono text-micro text-grey-dark" data-testid="handoff-recorded">
          A human recorded publishing the first statement at {stamp(props.firstStatementAt)}. This
          system did not publish it and cannot confirm that anything was published — the record is
          somebody&apos;s assertion, and the paste-back of the published bytes and permalink belongs
          to the record surface, not here.
        </p>
      )}
    </div>
  );
}

/* ════════ §M The closing statement ════════ */

/**
 * A `<section>`, deliberately NOT a `<footer>`. `PrintStyles` hides `footer` in
 * print, and these are the paragraphs that stop the printed sheet being read as a
 * clean bill of health.
 */
function ClosingStatement(props: {
  printedAt: string;
  activation: CrisisActivation;
  clock: TtfsAssessment;
  unprepared: readonly IncidentType[];
}) {
  const a = props.activation;
  return (
    <section className="mt-6 border-t-2 border-navy pt-2 font-mono text-micro leading-relaxed text-grey">
      <div data-testid="crisis-closing-stamp">
        THE CRISIS ROOM · LCX MARKETING · sheet generated {stamp(props.printedAt)} · statement{' '}
        {a.record.statementId === null ? (a.record.adHoc ? 'ad hoc' : 'not chosen') : `${a.record.statementId} v${a.record.statementVersion}`}
        {' · library v'}{a.record.libraryVersion} · ruleset v{a.record.ruleSetVersion}
        {' · clock '}{props.clock.state} at {props.clock.elapsedMinutes === null ? 'unmeasured' : `${props.clock.elapsedMinutes} min`} of {props.clock.budget.budgetMinutes}.
      </div>
      <div className="mt-1 font-bold uppercase tracking-wider text-status-blocked">
        What this sheet does not prove
      </div>
      <ol className="mt-0.5 list-decimal space-y-0.5 pl-4" data-testid="crisis-does-not-prove">
        <li>
          THAT ANYTHING WAS PUBLISHED. Nothing in this room reaches a network. A handoff is a named
          human&apos;s assertion that they posted the text by hand; this software cannot confirm it and
          does not claim to.
        </li>
        <li>
          THAT FOUR EYES WERE ON IT.{' '}
          {a.clearance.benchAdmission ?? `${a.clearance.distinctReviewers} distinct human(s) hold a required blocking lane. Sign-in is a shared passcode and a second shared passcode admits any @lcx.com address, so every name here identifies a session rather than a person.`}
        </li>
        <li>
          THAT THE WORDING IS LAWFUL. {HOLDING_STATEMENTS_UNREVIEWED_REASON}
        </li>
        <li>
          THAT THE STATEMENT IS TRUE. A precleared statement is written to be true whether or not the
          incident is real. It carries no assertion that an exploit happened, that a rumour is false or
          that funds are safe — those need a named human and a dated basis, and this screen has no
          control for entering one, so every reassurance class refuses here.
        </li>
        <li>
          THAT IT SURVIVED THE TAB. Nothing here is persisted. This sheet and the clipboard are the
          only ways the record leaves the browser.
        </li>
        <li>
          THAT THE DESK IS PREPARED.{' '}
          {props.unprepared.length === 0
            ? 'Every incident type in the taxonomy has at least one precleared statement.'
            : `${props.unprepared.length} incident type(s) have no precleared statement at all: ${props.unprepared.join(', ')}. Those gaps close on a quiet Tuesday and cannot close during an incident.`}
        </li>
        <li>
          THAT THE CLOCK MEASURES THE WORLD. It measures the interval between the desk recording that
          it became aware and a human recording that they spoke. It does not know when the incident
          began, and it never did. {CERC_CLEARANCE_EVIDENCE.headline}
        </li>
      </ol>
    </section>
  );
}

/* ════════ §N Print ════════ */

/**
 * Crisis-specific print rules, on top of the shared chrome reset in `PrintStyles`.
 *
 * This room says on its face that printing or copying is the only way its record
 * leaves, so the print path is the product and not a convenience. Six rules:
 *
 *  1. THE THREE LANES PRINT AS THREE LANES. A grid that collapses to one column on
 *     paper would present the parallel clears as a sequence — the exact reading this
 *     screen exists to prevent.
 *  2. FORM CONTROLS PRINT THEIR VALUES — now that `MirroredTextarea` makes that
 *     true. The controls themselves are hidden here rather than restyled: a textarea
 *     is a scroll box and `height: auto` clips it to its `rows` default, which is
 *     what the previous version of this rule did to six fields. `input`/`select` are
 *     single-line and render their value, so they only lose their chrome.
 *  3. THE `dark:` VARIANTS ARE NEUTRALISED BY NAME. `PrintStyles` pins the colour
 *     tokens to their light values, but `.dark` stays on `<html>`, so a `dark:bg-*`
 *     utility still matches and still paints. Pinning tokens is not sufficient.
 *  4. THE STATUS AND SURFACE TOKENS ARE PINNED. `PrintStyles` pins six tokens and
 *     `--red`, `--amber`, `--green` and `--ice-soft` are not among them, so printed
 *     from dark mode every refusal, every MISSING — BLOCKS ISSUE heading and every
 *     breach line came out as #e4687a on white paper — roughly 2.4:1, which is a
 *     refusal notice that is technically present and practically absent — while the
 *     unconditional `bg-ice-soft/50` on the verbatim statement resolved to a
 *     near-black wash under dark navy text. `components/gps/LegalPositionStamp.tsx`
 *     pins this by hand for one element; pinning the tokens covers every element,
 *     and a test checks the values against `styles/tokens.css` so they cannot rot.
 *  5. A `<summary>` PRINTS AS A HEADING instead of being deleted. `details` is
 *     forced open on paper, and the old rule then removed the very line that says
 *     what the disclosed block is.
 *  6. NOTHING IS TRAPPED IN A SCROLL BOX. There is no scrollbar on paper, so any
 *     overflow container is a silent guillotine; the same rule as the record bundle.
 */
function CrisisPrintStyles() {
  const css = `
@media print {
  /* The tokens PrintStyles does not pin. Light values, from styles/tokens.css. */
  :root, :root.dark {
    --red: 163 32 53;
    --red-bg: 251 230 234;
    --amber: 138 95 0;
    --amber-bg: 253 243 215;
    --green: 30 122 74;
    --green-bg: 227 244 234;
    --ice: 202 220 252;
    --ice-soft: 234 241 254;
    --grey-light: 185 198 224;
    --navy-deep: 20 26 69;
  }

  /* The parallel clears must not become a queue on paper. */
  [data-testid="clearance-lanes"] {
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  }
  [data-testid="clock-panel"], [data-testid^="lane-"], [data-contagion-attribute],
  [data-refusal-code], section { break-inside: avoid; page-break-inside: avoid; }
  /* A textarea's content is clipped to its box on paper; the mirror carries it. */
  textarea { display: none !important; }
  input, select {
    border: none !important;
    background: #fff !important;
  }
  .overflow-x-auto, .overflow-auto { overflow: visible !important; }
  th, td { white-space: normal !important; overflow-wrap: anywhere !important; }
  thead { display: table-header-group; }
  details { display: block !important; }
  details > summary {
    display: block !important;
    list-style: none !important;
    font-weight: 700;
  }
  pre { white-space: pre-wrap !important; word-break: break-word !important; }
  .dark\\:bg-ice-soft\\/10 { background: #fff !important; }
}
`;
  return <style data-testid="crisis-print-styles">{css}</style>;
}

export default MarketingCrisis;
