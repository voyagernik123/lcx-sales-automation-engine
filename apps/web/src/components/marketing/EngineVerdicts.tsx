import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Scale } from 'lucide-react';
import { SectionLabel } from '@/components/ui';
import {
  checkAdoption, checkRegime, checkReview,
  type AdoptionCheckBody, type RegimeCheckBody, type ReviewCheckBody,
} from '@/lib/api/marketing';
import { Absent, Nothing, Refused, apiReadRefusal } from './DeskAtoms';
import type { EngineGateVerdicts } from './preChecks';
import { routeAbsent } from './narrow';
import {
  CONSIDERATION_DUTY,
  ITEM_PURPOSES,
  SURFACE_APPROVAL_REGIME,
  SURFACE_CLASS,
  type AdoptionReading,
  type Art7FitStatement,
  type Art7Role,
  type ConsiderationKind,
  type ContentSurface,
  type EngagementVerb,
  type ItemPurpose,
  type MarketingViolation,
  type RegimeReading,
  type ReviewVerdict,
  type SpeakerCapacity,
  type TargetVerificationState,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE TWO LIVE VERDICTS — and the judgements an operator has to declare first
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The drafting room used to ask `POST /v1/marketing/review` for one combined verdict.
 * NO ROUTER EVER DECLARED THAT ROUTE. Every gate rendered `absent` on every environment,
 * which was the honest outcome of calling nothing and is why `Gate`'s `absent` source
 * exists — but it meant the whole apparatus was scaffolding.
 *
 * It is mounted now, and so are two narrower endpoints beside it. All three are contracted,
 * and each answers a different axis:
 *
 *   `POST /review`    → `ReviewVerdict`    the WORDS, and the invisible STATE they sit in
 *   `POST /regime`    → `RegimeReading`    which law bites, and the Art 7 arithmetic
 *   `POST /adoption`  → `AdoptionReading`  what a like or a repost would adopt
 *
 * `/review` returns `regime: null` ALWAYS, and says why in `regimeRefusal`: the classifier
 * needs jurisdictions, asset treatment, consideration kind and the Art 7 role, none of which
 * that request carries, and defaulting any of them would clear Art 7 by omission. So the two
 * are complements rather than alternatives — `/review` for the axes that read the text and
 * the registers, `/regime` for the classification the operator's declarations make possible.
 *
 * `/review` WRITES NOTHING AND RELEASES NO TEXT, which is what makes it safe on a keystroke
 * debounce: `releasesNoText` is the literal `true` and the type has no `usableText` field.
 * The gate that does release text is `POST /claim-safety`, and this room does not call it —
 * nothing on this screen consumes released text, because taking the text is a separate
 * recorded act through `recordHandoff`.
 *
 * A fourth, `POST /triage/assess`, is deliberately NOT called from here. Triage is the
 * upstream decision and belongs to the board; asking it from the drafting room is how a
 * screen ends up showing a triage verdict as a wording verdict, which is the exact hazard
 * the earlier wave named when it declined to guess.
 *
 * ── WHY THERE IS A FORM AT ALL, AND WHY IT HAS NO DEFAULTS ────────────────────
 * `/regime`'s validator throws on a missing boolean rather than reading it as `false`, and
 * `giveawayRequiresPersonalDataOrBenefit` is a `Known<boolean>` where an omission becomes
 * `'unknown'` and WIDENS the regime set. That is the engine refusing to be cleared by
 * omission, and a form that filled these in would defeat it: a clearance obtained by
 * leaving a field blank is the failure mode this compartment exists to answer.
 *
 * So every field starts UNANSWERED, the request is not sent until all of them are answered,
 * and until then the gates render `absent` naming which declaration is missing. An operator
 * who wants a verdict has to state what they are claiming about the item — which is also the
 * record, since `assessedBy` is read off the session and stamped on the reading.
 *
 * ── AND WHY `surface` IS ASKED RATHER THAN DERIVED FROM THE VERB ──────────────
 * They are different axes. A `reply` verb can be written into a `thread_in_progress`, and
 * `SURFACE_CLASS` decides which of the two approval regimes applies — pre-approval for
 * static content, risk-based review plus retention for interactive. Deriving one from the
 * other would silently put a pinned post through the interactive regime, which is the
 * lighter one.
 */

/* ════════ THE DECLARATIONS ════════ */

/**
 * WHAT THE OPERATOR IS CLAIMING ABOUT THE ITEM. `null` means unanswered, everywhere.
 *
 * There is deliberately no `Partial<>` and no optional key: an absent key and an
 * unanswered question are the same thing to a reader and different things to a compiler.
 * `missingDeclarations` names the unanswered ones for the screen and `buildBodies` refuses
 * to construct a request until there are none — one shape, checked in two places, and
 * neither of them a default.
 */
export interface Declarations {
  readonly surface: ContentSurface | null;
  readonly purpose: ItemPurpose | null;
  readonly consideration: ConsiderationKind | null;
  readonly art7Role: Art7Role | null;
  readonly authorAccount: 'lcx_official' | 'staff_personal' | null;
  readonly firstPartyLinkPresent: boolean | null;
  readonly citesOwnRegulatoryStatus: boolean | null;
  readonly employmentRelationshipDisclosed: boolean | null;
  /** `'unknown'` is a real answer here and is not the same as unanswered. */
  readonly giveawayRequiresPersonalDataOrBenefit: boolean | 'unknown' | null;
  /** The target's verification state, for the adoption axis. */
  readonly targetVerification: TargetVerificationState | null;
}

export const UNANSWERED: Declarations = {
  surface: null,
  purpose: null,
  consideration: null,
  art7Role: null,
  authorAccount: null,
  firstPartyLinkPresent: null,
  citesOwnRegulatoryStatus: null,
  employmentRelationshipDisclosed: null,
  giveawayRequiresPersonalDataOrBenefit: null,
  targetVerification: null,
};

/**
 * Human labels for the four unions that have no enumerated constant in `packages/shared`.
 *
 * `satisfies Record<Union, string>` IS THE WHOLE POINT and is not a stylistic flourish: it
 * makes each map TOTAL over the shared union, so adding a member to `Art7Role` or
 * `SpeakerCapacity` breaks this file at compile time instead of quietly dropping an option
 * from a dropdown. That is the difference between a label map and a second vocabulary — a
 * copy of the union written as a string array would compile forever after the union changed.
 */
const ART_7_ROLE_LABEL = {
  offeror: 'we are the offeror',
  person_seeking_admission: 'we are seeking admission to trading',
  platform_operator: 'we operate the trading platform',
} satisfies Record<Art7Role, string>;

const AUTHOR_ACCOUNT_LABEL = {
  lcx_official: 'the LCX account',
  staff_personal: "a staff member's own account",
} satisfies Record<NonNullable<Declarations['authorAccount']>, string>;

const VERIFICATION_LABEL = {
  verified_by_desk: 'the desk verified the target itself',
  unverified: 'not verified',
  known_false: 'known to be false',
} satisfies Record<TargetVerificationState, string>;

/** The speaker capacity sent on the adoption call, derived from the account declaration. */
const CAPACITY_FOR = {
  lcx_official: 'official_account',
  staff_personal: 'staff_personal_account',
} satisfies Record<NonNullable<Declarations['authorAccount']>, SpeakerCapacity>;

/**
 * Which declarations are still unanswered, in the operator's words.
 *
 * Returned as SENTENCES rather than as field names, because this list is printed on the
 * gate that has no verdict: "surface" tells a reader nothing, "which surface this will
 * appear on" tells them what to do next.
 */
export function missingDeclarations(d: Declarations): string[] {
  const out: string[] = [];
  if (d.surface === null) out.push('which surface this will appear on — it decides whether pre-approval or risk-based review applies');
  if (d.purpose === null) out.push('what the item is for — the purpose is what pulls in the Art 7 mandatory block');
  if (d.consideration === null) out.push('what consideration, if any, was received — absent is not “none”');
  if (d.art7Role === null) out.push('in what capacity LCX would be speaking');
  if (d.authorAccount === null) out.push('whose account would carry it');
  if (d.firstPartyLinkPresent === null) out.push('whether it links to something LCX controls');
  if (d.citesOwnRegulatoryStatus === null) out.push('whether it cites LCX’s own regulatory status');
  if (d.employmentRelationshipDisclosed === null) out.push('whether the employment relationship is disclosed in the item itself');
  if (d.giveawayRequiresPersonalDataOrBenefit === null) out.push('whether entry requires personal data or a benefit — “unknown” is an answer, blank is not');
  return out;
}

/* ════════ THE FORM ════════ */

const SELECT_CLS = 'mt-0.5 w-full rounded border border-line bg-card px-1.5 py-1 font-mono text-[10px] text-navy focus-ring';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-micro">
      <span className="font-semibold text-navy">{label}</span>
      {children}
      {hint !== undefined && <span className="mt-0.5 block text-[10px] leading-snug text-grey">{hint}</span>}
    </label>
  );
}

/**
 * A tri-state answer. `null` is UNANSWERED and is the initial value of every one of them.
 *
 * Rendered as three radios rather than as a checkbox, because a checkbox has two states and
 * this question has three: an unticked box says "no" and means "nobody said".
 */
function TriState({ name, value, onChange, allowUnknown }: {
  name: string;
  value: boolean | 'unknown' | null;
  onChange: (v: boolean | 'unknown') => void;
  allowUnknown?: boolean;
}) {
  const opts: readonly (boolean | 'unknown')[] = allowUnknown === true ? [true, false, 'unknown'] : [true, false];
  return (
    <span className="mt-0.5 flex flex-wrap gap-2">
      {opts.map((o) => (
        <label key={String(o)} className="flex cursor-pointer items-center gap-1 font-mono text-[10px]">
          <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />
          <span>{o === true ? 'yes' : o === false ? 'no' : 'unknown'}</span>
        </label>
      ))}
    </span>
  );
}

/**
 * The declarations, as a form. Nothing here is optional and nothing here has a default.
 */
export function DeclarationsForm({ id, value, onChange, verbHasTarget }: {
  id: number;
  value: Declarations;
  onChange: (d: Declarations) => void;
  verbHasTarget: boolean;
}) {
  const set = <K extends keyof Declarations>(k: K, v: Declarations[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-2">
      <div>
        <SectionLabel as="h3">What you are declaring about this item</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          The engines will not be asked until every one of these is answered, and none of them starts with a
          value. That is the engines&apos; own posture rather than this screen&apos;s caution: a missing boolean is
          rejected at the door instead of being read as &ldquo;no&rdquo;, because a clearance obtained by
          leaving a field blank is worth nothing. Your answers are stamped on the reading with your name.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field
          label="Surface"
          hint={value.surface === null
            ? 'Not the same question as the verb: it decides which of the two approval regimes applies.'
            : `${SURFACE_CLASS[value.surface]} content · ${SURFACE_APPROVAL_REGIME[SURFACE_CLASS[value.surface]].replace(/_/g, ' ')}`}
        >
          <select
            className={SELECT_CLS}
            aria-label="Surface"
            value={value.surface ?? ''}
            onChange={(e) => set('surface', e.target.value === '' ? null : (e.target.value as ContentSurface))}
          >
            <option value="">— not declared —</option>
            {(Object.keys(SURFACE_CLASS) as ContentSurface[]).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>

        <Field label="Purpose" hint="`offer_or_listing_promotion` is what pulls in the Art 7 mandatory block, and the arithmetic then decides whether it can fit at all.">
          <select
            className={SELECT_CLS}
            aria-label="Purpose"
            value={value.purpose ?? ''}
            onChange={(e) => set('purpose', e.target.value === '' ? null : (e.target.value as ItemPurpose))}
          >
            <option value="">— not declared —</option>
            {ITEM_PURPOSES.map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>

        <Field
          label="Consideration received"
          hint={value.consideration === null
            ? 'Absent is NOT “none”. Say which it is.'
            : `disclosure duty · ${CONSIDERATION_DUTY[value.consideration].replace(/_/g, ' ')}`}
        >
          <select
            className={SELECT_CLS}
            aria-label="Consideration received"
            value={value.consideration ?? ''}
            onChange={(e) => set('consideration', e.target.value === '' ? null : (e.target.value as ConsiderationKind))}
          >
            <option value="">— not declared —</option>
            {(Object.keys(CONSIDERATION_DUTY) as ConsiderationKind[]).map((k) => (
              <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>

        <Field label="Capacity" hint="Which Art 7 role LCX would be speaking in. It changes which mandated statement is required.">
          <select
            className={SELECT_CLS}
            aria-label="Capacity"
            value={value.art7Role ?? ''}
            onChange={(e) => set('art7Role', e.target.value === '' ? null : (e.target.value as Art7Role))}
          >
            <option value="">— not declared —</option>
            {(Object.keys(ART_7_ROLE_LABEL) as Art7Role[]).map((r) => (
              <option key={r} value={r}>{ART_7_ROLE_LABEL[r]}</option>
            ))}
          </select>
        </Field>

        <Field label="Account" hint="A staff personal account carries a different disclosure duty, and the engine applies it.">
          <select
            className={SELECT_CLS}
            aria-label="Account"
            value={value.authorAccount ?? ''}
            onChange={(e) => set('authorAccount', e.target.value === '' ? null : (e.target.value as Declarations['authorAccount']))}
          >
            <option value="">— not declared —</option>
            {(Object.keys(AUTHOR_ACCOUNT_LABEL) as NonNullable<Declarations['authorAccount']>[]).map((a) => (
              <option key={a} value={a}>{AUTHOR_ACCOUNT_LABEL[a]}</option>
            ))}
          </select>
        </Field>

        {verbHasTarget && (
          <Field label="Target verification" hint="Adopting text nobody verified is its own refusal, and “we did not check” is not “unverified by accident”.">
            <select
              className={SELECT_CLS}
              aria-label="Target verification"
              value={value.targetVerification ?? ''}
              onChange={(e) => set('targetVerification', e.target.value === '' ? null : (e.target.value as TargetVerificationState))}
            >
              <option value="">— not declared —</option>
              {(Object.keys(VERIFICATION_LABEL) as TargetVerificationState[]).map((v) => (
                <option key={v} value={v}>{VERIFICATION_LABEL[v]}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Links to something LCX controls">
          <TriState name={`fpl-${id}`} value={value.firstPartyLinkPresent}
            onChange={(v) => set('firstPartyLinkPresent', v === 'unknown' ? null : v)} />
        </Field>
        <Field
          label="Cites LCX’s own regulatory status"
          hint="ESMA names the CASP's regulatory status used as a promotional tool as a DON'T (ESMA35-1872330276-2329). LCX's brand is “regulated in Liechtenstein”, so this is the compartment's highest-frequency risk and the engine flags our own best line."
        >
          <TriState name={`cors-${id}`} value={value.citesOwnRegulatoryStatus}
            onChange={(v) => set('citesOwnRegulatoryStatus', v === 'unknown' ? null : v)} />
        </Field>
        <Field
          label="Employment relationship disclosed in the item"
          hint="In the item, not in the bio. A profile-only disclosure is recorded and never accepted as sufficient."
        >
          <TriState name={`erd-${id}`} value={value.employmentRelationshipDisclosed}
            onChange={(v) => set('employmentRelationshipDisclosed', v === 'unknown' ? null : v)} />
        </Field>
        <Field
          label="Entry requires personal data or a benefit"
          hint="“unknown” is a real answer and widens the regime set rather than clearing it. Blank is not an answer at all."
        >
          <TriState name={`giv-${id}`} allowUnknown
            value={value.giveawayRequiresPersonalDataOrBenefit}
            onChange={(v) => set('giveawayRequiresPersonalDataOrBenefit', v)} />
        </Field>
      </div>
    </div>
  );
}

/* ════════ THE READ ════════ */

/**
 * Both engine reads, with the tri-state each axis needs, plus the sentences for the axes
 * nobody answers.
 *
 * NEITHER READ IS RETRIED AND NEITHER IS POLLED. `null` after a settled attempt means the
 * route is not on this environment; a thrown error is a real refusal and is surfaced as one.
 */
export interface EngineReads {
  readonly verdicts: EngineGateVerdicts | null;
  readonly regime: RegimeReading | null;
  readonly adoption: AdoptionReading | null;
  readonly review: ReviewVerdict | null;
  /** The API's own sentence, when a read failed rather than being absent. */
  readonly failure: string | null;
  readonly inFlight: boolean;
  /** True once at least one attempt has settled, so "not yet asked" is distinguishable. */
  readonly settled: boolean;
  /** Which declarations blocked the request. Empty when all were answered. */
  readonly blockedBy: readonly string[];
}

const DEBOUNCE_MS = 600;

/**
 * BOTH REQUEST BODIES, OR `null` BECAUSE A JUDGEMENT HAS NOT BEEN MADE.
 *
 * Pure, exported, and tested directly — which is the reason it is a function and not inline
 * code in the effect. The two things it must never do are the two things a hurried version
 * would: send `false` for a boolean nobody answered, and send `[]` for a list nobody
 * supplied. Both would clear a check by omission, and neither is visible on screen
 * afterwards.
 */
export function buildBodies(args: {
  replyId: number;
  verb: EngagementVerb;
  text: string;
  targetText: string;
  declarations: Declarations;
  verbHasTarget: boolean;
}): { regime: RegimeCheckBody; adoption: AdoptionCheckBody; review: ReviewCheckBody } | null {
  const { replyId, verb, text, targetText, declarations: d, verbHasTarget } = args;
  const {
    surface, purpose, consideration, art7Role, authorAccount,
    firstPartyLinkPresent, citesOwnRegulatoryStatus, employmentRelationshipDisclosed,
    giveawayRequiresPersonalDataOrBenefit: giveaway,
  } = d;
  if (surface === null || purpose === null || consideration === null) return null;
  if (art7Role === null || authorAccount === null) return null;
  if (firstPartyLinkPresent === null || citesOwnRegulatoryStatus === null) return null;
  if (employmentRelationshipDisclosed === null || giveaway === null) return null;

  const target = targetText === '' ? null : targetText;
  const own = text === '' ? null : text;

  return {
    regime: {
      verb,
      surface,
      body: text,
      targetBody: target,
      purpose,
      consideration,
      firstPartyLinkPresent,
      citesOwnRegulatoryStatus,
      authorAccount,
      employmentRelationshipDisclosed,
      art7Role,
      giveawayRequiresPersonalDataOrBenefit: giveaway,
      /* NOT `[]`. An omitted list is the named gap `AUTHORISED_SERVICE_LIST_ABSENT`, which
         is the owner's to close (plan §7); an empty array would read as "authorised for
         nothing" — a different, confident, wrong answer. */
      authorisedServices: null,
    },
    adoption: {
      verb,
      surface,
      speaker: {
        capacity: CAPACITY_FOR[authorAccount],
        handle: null,
        /* THE TWO FIELDS ARE INVERSES AND THE MAPPING IS WRITTEN OUT RATHER THAN PASSED
           THROUGH. The declaration asks whether the relationship is disclosed IN THE ITEM;
           this field asserts that the only disclosure is in the profile. Forwarding one as
           the other would record the opposite fact, and Commission Guidance §4.2.6 is
           precisely that a profile-only disclosure is not sufficient. */
        employmentDisclosedInProfileOnly: employmentRelationshipDisclosed === false,
        itemPromotesEmployer: authorAccount === 'staff_personal',
      },
      target: verbHasTarget
        ? {
            permalink: null,
            handle: null,
            /* `null`, not `''`. The verdict reports `adoptsUnreadText` — "LCX cannot adopt
               what it has not read" — where an empty string would be that same sentence
               with a confident zero in it. */
            text: target,
            /* Only asked when the verb has a target, so an unanswered value here is not a
               missing declaration. `unverified` is the engine's own conservative member and
               is NOT a stand-in for "we did not check": `known_false` and `verified_by_desk`
               are the two an operator has to choose deliberately. */
            verification: d.targetVerification ?? 'unverified',
            isLcxOwnAccount: false,
          }
        : null,
      ownText: own,
    },
    /*
     * The review body is the smallest of the three and is built here anyway, in the same
     * guarded function, so the three calls cannot drift out of step: a keystroke that changed
     * the text for two engines and not the third would render a stale verdict beside a fresh
     * one with nothing on screen saying which was which.
     */
    review: { verb, text, replyId },
  };
}

/**
 * Ask both engines about this draft.
 *
 * ── THE ART 7 REFUSAL IS ROUTED TO THE LENGTH GATE AND NOWHERE ELSE ───────────
 * `RegimeReading.art7Fit.refusalCode` names the arithmetic's refusal, and the SAME object is
 * inside `decision.refusals`. It is split out by code so it appears once, on the gate about
 * length, instead of twice — once as a wording finding, where it would read as though the
 * sentence were the problem when the mandated block alone may already exceed the ceiling.
 *
 * Every other refusal stays on the regime gate UNSPLIT. Re-bucketing engine refusals by
 * code in the browser would be a second copy of the rulebook, which is the thing this
 * compartment refuses to hold in two places.
 */
export function useEngineVerdicts(args: {
  replyId: number;
  verb: EngagementVerb;
  text: string;
  targetText: string;
  declarations: Declarations;
  verbHasTarget: boolean;
}): EngineReads {
  const { replyId, verb, text, targetText, declarations: d, verbHasTarget } = args;
  const [reads, setReads] = useState<{
    regime: RegimeReading | null; adoption: AdoptionReading | null; review: ReviewVerdict | null;
    failure: string | null; settled: boolean;
  }>({ regime: null, adoption: null, review: null, failure: null, settled: false });
  const [inFlight, setInFlight] = useState(false);

  const blockedBy = missingDeclarations(d);

  /*
   * THE REQUEST BODIES ARE BUILT BEFORE THE EFFECT, AND `null` IS THE GUARD.
   *
   * Every field is narrowed by an explicit `=== null` return rather than asserted with `!`.
   * The difference matters more here than anywhere else in this compartment: a non-null
   * assertion on `surface` would let an incomplete declaration reach the route, where
   * `oneOf` answers 400 and the operator sees a form error instead of the sentence naming
   * which judgement they have not made.
   */
  const bodies = buildBodies({ replyId, verb, text, targetText, declarations: d, verbHasTarget });

  /* The identity of the question, as a string — the same device `useDeskRead` uses and for
     the same reason: every dependency is visible to the linter, so no `eslint-disable` is
     needed, and two identical questions do not re-ask. The bodies themselves live in a ref. */
  const key = bodies === null ? '' : JSON.stringify([replyId, bodies]);
  const latest = useRef(bodies);
  latest.current = bodies;

  useEffect(() => {
    if (key === '') { setReads({ regime: null, adoption: null, review: null, failure: null, settled: false }); return; }
    const b = latest.current;
    if (b === null) return;
    let live = true;
    setInFlight(true);
    const t = setTimeout(() => {
      const optional = <T,>(p: Promise<T>): Promise<T | null> =>
        p.catch((e: unknown) => { if (routeAbsent(e)) return null; throw e; });

      void Promise.all([
        optional(checkRegime(b.regime)),
        optional(checkAdoption(b.adoption)),
        optional(checkReview(b.review)),
      ])
        .then(([regime, adoption, review]) => {
          if (live) setReads({ regime, adoption, review, failure: null, settled: true });
        })
        .catch((e: unknown) => {
          if (live) {
            setReads({
              regime: null, adoption: null, review: null, settled: true,
              failure: e instanceof Error && e.message !== '' ? e.message : 'The engines refused this read and did not say why.',
            });
          }
        })
        .finally(() => { if (live) setInFlight(false); });
    }, DEBOUNCE_MS);
    return () => { live = false; clearTimeout(t); };
  }, [key]);

  const art7Code = reads.regime?.art7Fit?.refusalCode ?? null;
  const regimeRefusals = reads.regime === null
    ? null
    : reads.regime.decision.refusals.filter((r) => art7Code === null || r.code !== art7Code);
  const lengthRefusals = reads.regime === null
    ? null
    : reads.regime.decision.refusals.filter((r) => art7Code !== null && r.code === art7Code);

  const verdicts: EngineGateVerdicts | null =
    reads.regime === null && reads.adoption === null && reads.review === null
      ? null
      : {
          /*
           * FROM `/review`, AND THE TRI-STATE IS THE ROUTE'S OWN. It sets each of these to
           * `null` when that gate did not COMPLETE — an absent register, or a throw — and to
           * an array when it did. Neither is coerced here: `?? []` would turn a gate that
           * threw into a gate that passed, which is the single defect this whole apparatus
           * is built to make impossible.
           */
          claimSafety: reads.review === null ? null : reads.review.claimSafety,
          marketAbuse: reads.review === null ? null : reads.review.marketAbuse,
          regime: regimeRefusals,
          lengthBudget: lengthRefusals,
          adoption: reads.adoption === null ? null : reads.adoption.verdict.refusals,
        };

  return {
    verdicts,
    regime: reads.regime,
    adoption: reads.adoption,
    review: reads.review,
    failure: reads.failure,
    inFlight,
    settled: reads.settled,
    blockedBy,
  };
}

/* ════════ WHAT THE REGIME ENGINE SAID, BEYOND ITS REFUSALS ════════ */

/**
 * The Art 7 arithmetic, as the engine computed it.
 *
 * `mandatedAloneExceedsLimit` is the one that ends the argument and it is printed FIRST when
 * true: it means nothing the author writes can help, so a screen offering an edit box beside
 * it would be offering a way out that does not exist. Roughly 330 characters of verbatim
 * Art 7(1)(d)+(e) boilerplate against a 280-character surface is arithmetic, not an opinion.
 *
 * `missingMandatedFacts` non-empty means `shortfallChars` IS ZERO BECAUSE THE ARITHMETIC DID
 * NOT RUN. That is the trap this block exists to close: a zero shortfall beside a missing
 * fact reads as a pass, and the contract's own comment says to read `fits` instead.
 */
function Art7Fit({ f }: { f: Art7FitStatement }) {
  return (
    <div
      data-testid="mkt-art7-fit"
      className={f.fits
        ? 'border-l-2 border-line px-2 py-1.5'
        : 'border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5'}
    >
      <p className={f.fits ? 'text-micro font-semibold text-navy' : 'text-micro font-semibold text-status-blocked'}>
        {f.mandatedAloneExceedsLimit
          ? 'The mandated block alone will not fit on this surface. Nothing the author writes can change that.'
          : f.fits
            ? 'The mandated elements and the author’s text both fit this surface.'
            : `Over the ceiling by ${f.shortfallChars} characters on this surface.`}
      </p>
      {f.missingMandatedFacts.length > 0 ? (
        /* Before the numbers, because with a fact missing the numbers are not a measurement. */
        <p className="mt-1 text-[10px] leading-snug text-status-conditional">
          <span className="font-semibold">The arithmetic did not run.</span> Facts the desk has not supplied:{' '}
          {f.missingMandatedFacts.join('; ')}. The shortfall above is 0 because nothing was measured, not
          because it fits — read the verdict, not the number. Inventing a contact block would produce a figure
          that looks like arithmetic and is not.
        </p>
      ) : (
        <p className="mt-1 font-mono text-[10px] leading-snug text-grey">
          mandated {f.mandatedChars} + ours {f.editorialChars} against{' '}
          {f.limitChars === null
            ? 'no ceiling this engine models for the surface — which is not “unlimited, so fine”'
            : `${f.limitChars} on ${f.channelLabel}`}
        </p>
      )}
      {f.remedy !== null && (
        <p className="mt-1 text-[10px] leading-snug text-grey">{f.remedy}</p>
      )}
    </div>
  );
}

/**
 * Which law bites, and the two things about that classification that are not refusals.
 *
 * `requiresHumanConfirmation` is rendered as a demand rather than as a note. `market_abuse`
 * and `advice` carry personal, criminal-adjacent consequences, so a surface presenting the
 * classifier's assignment as settled would be presenting a machine's guess as a legal
 * conclusion. `coverage` is what the engine did NOT assess, and a reading with three unrun
 * checks and no refusals is not a clean reading.
 */
export function RegimeReadingNote({ r }: { r: RegimeReading }) {
  return (
    <div className="space-y-1.5" data-testid="mkt-regime-reading">
      <p className="flex flex-wrap items-baseline gap-1.5 text-micro">
        <Scale size={11} className="shrink-0 text-grey" aria-hidden="true" />
        <span className="font-semibold text-navy">
          {r.regimes.length === 0 ? 'No regime was assigned' : r.regimes.join(' · ')}
        </span>
        <span className="font-mono text-[10px] text-grey">
          classified by {r.assessedBy} at {r.assessedAt.slice(0, 16)}
        </span>
      </p>
      <p className="text-[10px] leading-snug text-grey">
        <span className="font-semibold">
          {r.decision.isMarketingCommunication
            ? 'This is a marketing communication.'
            : 'This is not a marketing communication.'}
        </span>{' '}
        {r.decision.marketingCommunicationBasis} Fault standard:{' '}
        <span className="font-mono">{r.decision.faultStandard.replace(/_/g, ' ')}</span> — Art 66(2) is breached
        deliberately OR negligently, so the absence of a check is itself the fault element.
      </p>

      {r.decision.requiresHumanConfirmation.length > 0 && (
        <p
          data-testid="mkt-regime-needs-human"
          className="border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5 text-micro leading-snug text-status-conditional"
        >
          <strong>
            A machine may not settle {r.decision.requiresHumanConfirmation.join(' or ')} by itself.
          </strong>
          <span className="mt-1 block text-[10px]">
            The consequences on those limbs are personal and criminal-adjacent — Art 91(3)(c) carries fines
            from €700,000 against the individual — so the classification above is a proposal a named human has
            to confirm, and it is not a legal conclusion this screen reached.
          </span>
        </p>
      )}

      {r.art7Fit !== null && <Art7Fit f={r.art7Fit} />}

      {r.decision.coverage.length > 0 && (
        <details data-testid="mkt-regime-coverage" className="text-[10px] leading-snug text-grey">
          <summary className="cursor-pointer font-mono uppercase tracking-wider">
            {r.decision.coverage.length} axis{r.decision.coverage.length === 1 ? '' : 'es'} this classification did not assess
          </summary>
          <ul className="mt-1 space-y-1">
            {r.decision.coverage.map((g) => (
              <li key={g.axis}>
                <span className="font-mono font-semibold">{g.axis}</span> — {g.sentence}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * What a like or a repost would adopt, beyond its refusals.
 *
 * `blocked` is the engine's own derived field and is not recomputed here: the route computes
 * it as `refusals.length > 0` precisely so no surface has to decide for itself whether a
 * refusal is advisory. In this compartment none of them are.
 */
export function AdoptionReadingNote({ a }: { a: AdoptionReading }) {
  return (
    <div className="space-y-1" data-testid="mkt-adoption-reading">
      <p className="flex flex-wrap items-baseline gap-1.5 text-micro">
        <span className="font-semibold text-navy">
          {a.blocked ? 'This act is refused as it stands.' : 'No refusal fired on the act itself.'}
        </span>
        <span className="font-mono text-[10px] text-grey">asked by {a.askedBy} at {a.askedAt.slice(0, 16)}</span>
      </p>
      {/* The engine's one-line answer to "what would we be adopting", verbatim. It is the
          sentence the gate itself would put in a confirm dialog, and paraphrasing it here
          would create a second wording of the same finding. */}
      <p className="text-[10px] leading-snug text-grey">{a.verdict.statement}</p>
      {!a.blocked && (
        <p className="text-[10px] leading-snug text-grey">
          That is a statement about the verb and the target, and about nothing else. The words are judged by the
          gates above, and the desk mode was read from the ledger server-side rather than taken from this
          screen — so a suspension cannot be talked past by a client.
        </p>
      )}
      {/* A VERDICT WITH NO REFUSALS AND THREE UNRUN CHECKS IS NOT A CLEAN VERDICT, which is
          the engine's own comment on this field. It is rendered next to the clean line and
          not behind it. */}
      {a.verdict.notChecked.length > 0 && (
        <p data-testid="mkt-adoption-not-checked" className="text-[10px] leading-snug text-status-conditional">
          <span className="font-semibold">Not checked:</span> {a.verdict.notChecked.join('; ')}.
        </p>
      )}
      {/* Diligence gaps are NOT refusals and are not shown as any: the Commission guidance
          names them as the controls that discharge professional diligence, and this act does
          not block on them while the desk still owes them. */}
      {a.verdict.diligenceGaps.length > 0 && (
        <p className="text-[10px] leading-snug text-grey">
          <span className="font-semibold">Owed, though not blocking:</span> {a.verdict.diligenceGaps.join('; ')}.
        </p>
      )}
      {a.verdict.inheritedRefusalCodes.length > 0 && (
        <p className="font-mono text-[10px] leading-snug text-status-blocked">
          inherited from the target rather than found in our words · {a.verdict.inheritedRefusalCodes.join(', ')}
        </p>
      )}
    </div>
  );
}

/**
 * The read's own standing, above the gates.
 *
 * Four states and none of them is a green tick: not yet asked because a declaration is
 * missing; in flight; the routes are absent; or the read failed with the API's own sentence.
 */
export function EngineStanding({ reads }: { reads: EngineReads }) {
  if (reads.blockedBy.length > 0) {
    return (
      <Nothing>
        The engines have not been asked, because {reads.blockedBy.length === 1 ? 'one declaration is' : `${reads.blockedBy.length} declarations are`}{' '}
        still unanswered: {reads.blockedBy.join('; ')}. Nothing below is a verdict, and the gates say so
        individually rather than showing an empty pass.
      </Nothing>
    );
  }
  if (reads.failure !== null) {
    return (
      <Refused r={apiReadRefusal(new Error(reads.failure),
        'A failed engine read is not a clean draft. The axes below were not examined, and an unexamined axis may not be treated as cleared no matter how the text reads.')} />
    );
  }
  if (reads.settled && reads.regime === null && reads.adoption === null && reads.review === null) {
    return (
      <Absent title="None of the three engines is deployed on this environment.">
        <span className="font-mono">POST /v1/marketing/review</span>,{' '}
        <span className="font-mono">/regime</span> and <span className="font-mono">/adoption</span> all answered
        404. No axis below has been examined by a rulebook, and the advisory pre-checks on this screen are
        arithmetic and literal phrase matches — they cannot judge whether a sentence is fair, clear and not
        misleading.
      </Absent>
    );
  }
  return null;
}

/**
 * WHAT THE GATE SAW IN THE TEXT, beyond its refusals.
 *
 * `assetsExtracted` and `extractionCaveat` are rendered TOGETHER and neither may be dropped.
 * The list is what the gate believed the text named, and the caveat is the extractor's own
 * statement of what it cannot see — a bare ticker with no `$`, most of all. An asset list with
 * no caveat reads as complete, and the market-abuse join is only as good as the symbols that
 * reached it: an embargoed token the extractor missed is an Art 90 exposure the gate never
 * looked for.
 *
 * `violations` is NOT `refusals`. Both engines can raise an ERROR-severity violation with an
 * empty refusal list, so a surface branching on refusals alone would show a clean row over a
 * flagged draft. `blockingViolations` is the subset that made the act impermissible, and the
 * two are rendered apart.
 */
export function ReviewVerdictNote({ v }: { v: ReviewVerdict }) {
  /* Identity is `rule` + the span it MATCHED, not `rule` alone: one text can breach the same
     rule on two different phrases, and keying on the rule would silently hide the second. */
  const blockingKeys = new Set(v.blockingViolations.map((b: MarketingViolation) => `${b.rule}\u0000${b.matched}`));
  const nonBlocking = v.violations.filter(
    (x: MarketingViolation) => !blockingKeys.has(`${x.rule}\u0000${x.matched}`),
  );
  return (
    <div className="space-y-1" data-testid="mkt-review-reading">
      <p className="flex flex-wrap items-baseline gap-1.5 text-micro">
        <span className="font-semibold text-navy">disposition · {v.disposition.replace(/_/g, ' ')}</span>
        <span className="font-mono text-[10px] text-grey">
          reviewed by {v.reviewedBy} at {v.reviewedAt.slice(0, 16)}
        </span>
      </p>

      {/* WHAT IT THOUGHT THE TEXT NAMED, AND WHAT IT COULD NOT SEE. Together, always. */}
      <p className="text-[10px] leading-snug text-grey" data-testid="mkt-review-assets">
        <span className="font-semibold">Assets the gate read out of the text:</span>{' '}
        {v.assetsExtracted.length === 0
          ? 'none — which is a statement about the extractor and not about the text'
          : v.assetsExtracted.map((a: string) => `$${a}`).join(', ')}. {v.extractionCaveat}
      </p>

      {/* A FLAG IS NOT A REFUSAL AND A REFUSAL IS NOT A FLAG. */}
      {v.blockingViolations.length > 0 && (
        <ul data-testid="mkt-review-blocking" className="space-y-0.5">
          {v.blockingViolations.map((x: MarketingViolation) => (
            <li key={`${x.rule}-${x.matched}`} className="text-[10px] leading-snug text-status-blocked">
              <span className="font-semibold">blocking · {x.rule}</span> — {x.remedy}
              <span className="block font-mono">
                objected to · {x.matched} · {x.rule_citation.provision} · rule v{x.ruleVersion}
              </span>
            </li>
          ))}
        </ul>
      )}
      {nonBlocking.length > 0 && (
        <ul data-testid="mkt-review-flagged" className="space-y-0.5">
          {nonBlocking.map((x: MarketingViolation) => (
            <li key={`${x.rule}-${x.matched}`} className="text-[10px] leading-snug text-status-conditional">
              <span className="font-semibold">{x.severity} · {x.rule}</span> — {x.remedy}
              <span className="block font-mono">objected to · {x.matched}</span>
            </li>
          ))}
        </ul>
      )}

      {/* A THROWN CHECK IS A REFUSAL, NEVER A PASS. Printed loudly, because the two gates
          above will be `null` when this is set and the row would otherwise read as unchecked
          for no stated reason. */}
      {v.gateError !== null && (
        <p data-testid="mkt-review-gate-error" className="text-[10px] font-semibold leading-snug text-status-blocked">
          A gate threw while checking this text: {v.gateError}. That is a refusal and not a pass — nothing above
          examined the axis it was asked about.
        </p>
      )}

      {/* WHY THE REGIME AXIS IS NOT ANSWERED BY THIS ROUTE, in the route's own words. It is
          not a gap: the classifier needs facts this request does not carry, and defaulting
          them would clear Art 7 by omission. The declarations form is what supplies them. */}
      <Refused r={v.regimeRefusal} />
    </div>
  );
}
