/**
 * ONE MOUTH — the Title VI engine over everything that leaves the building, IN SHADOW
 * MODE: it computes, it records, it counts, and it stops nothing.
 *
 * ══ THE ASYMMETRY THIS EXISTS TO MEASURE ══
 * `gateOutboundText` composes the two engines that carry MiCA Title VI — Art 90
 * (embargo), Art 91(3)(c) (the author's own position, personal liability at roughly
 * EUR 700,000), Art 88(1) (a disclosure combined with marketing). It is consulted on
 * exactly two paths, and both of them are MARKETING DRAFTS. Sales email
 * (`messages`, `outreach_tasks`) and campaign copy (`dist_campaigns`) leave the building
 * having met no gate at all. One company, one regulator, three mouths, one gate.
 *
 * ══ WHY SHADOW AND NOT ENFORCEMENT ══
 * Nobody has ever measured what fraction of this desk's outbound text the engine would
 * refuse. Switching enforcement on over an unmeasured base rate is how a control gets an
 * outage at 02:00 and is then switched off for good — that exact failure is recorded in
 * this compartment already (`marketingMemory.test.ts`): when a gate refuses everything,
 * humans stop using the gate and the real risk goes UP. So this module produces the
 * number that justifies enforcement, and it produces it without ever being able to
 * cause the outage.
 *
 * NOTHING HERE RETURNS A VERDICT A CALLER CAN BLOCK ON. `OneMouthObservation` carries
 * `wouldBlock` and `blocked: false` as a LITERAL type, and it has no `allowed` and no
 * `usableText` field — there is deliberately nothing on it that a send path could read
 * as permission or as a stop. 0073's `mode` and `blocked` CHECK constraints say the same
 * thing at the storage layer, so a row can never later be waved at as evidence that a
 * send was prevented.
 *
 * THE EMISSION WARRANT IS THE EXCEPTION AND IT LIVES NEXT DOOR. `emissionWarrant.ts`
 * DOES block, because a token-incentivised campaign carries personal liability and
 * "count it and let it through" is not survivable there. Shadow mode applies to this
 * file, not to that one.
 *
 * ══ A SHADOW COUNT NOBODY CAN QUERY IS NOT EVIDENCE ══
 * Everything is recorded with its stable code, the provision that code cites, and a
 * LOCATOR — table, row id, and which columns were concatenated — so a finding can be
 * followed back to the text. `loadOneMouthShadowReport` is the read, and it is built so
 * that a screen showing nothing has to say WHICH nothing:
 *
 *   not_loaded                   0073 is not applied here. Nothing is known.
 *   recording_nothing_observed   the ledger is readable and empty — the instrument is
 *                                installed and no traffic has been put through it.
 *   observed_no_findings         traffic WAS observed and none of it would have blocked.
 *                                A measured zero, with a frame.
 *   observed_with_findings       the number this whole module exists to produce.
 *
 * The first three all render as "nothing here" and they are three different facts. A
 * zero is a claim: it carries an ObservationFrame — what was observed, over what window,
 * and what the window cannot see — plus the environment it was read from.
 *
 * ══ THE SPLIT THAT KEEPS THE NUMBER USABLE ══
 * `perimeterAttributable` marks a would-be refusal caused by the REGISTER rather than by
 * the words: EMBARGO_REGISTER_ABSENT, HOLDINGS_DECLARATION_MISSING, ASSET_STATE_UNKNOWN.
 * Every one of those fires today on any text naming any symbol, because the embargo
 * register is `not_attested` by design until the desk attests it. Reported as one number
 * the shadow rate would read ~100% and would mean nothing, and "our sales email is
 * unlawful" would be indistinguishable from "we have not attested our own register".
 * Those are different findings with different owners, so they are different fields.
 */
import type { Pool } from 'pg';
import type { Disposition } from '@lcx/shared';
import { PENDING_MIGRATIONS, REGISTERED_MIGRATIONS } from '../db/migrationLedger.js';
import { env } from '../lib/env.js';
import { composeCampaignPublicText } from './emissionWarrant.js';
import {
  EXTRACTION_IS_LEXICAL,
  gateOutboundText,
  gateReferenceFrom,
  gateTextSha256,
} from './outboundGate.js';

export const ONE_MOUTH_MIGRATION = '0073_one_mouth_shadow.sql';
export const ONE_MOUTH_CONTRACT = 'marketing.one_mouth_shadow.v1';

/**
 * SHADOW, AS A VALUE AND AS A TYPE. Exported so a surface can render the word rather
 * than hardcode it, and so a future enforcement mode has to be a new member here — which
 * makes it a reviewable change instead of a flipped boolean.
 */
export const ONE_MOUTH_MODE = 'shadow' as const;

/** The three mouths. `dist_campaign` overlaps `emissionWarrant.ts` deliberately: the
 *  shadow ledger observes EVERY campaign, the warrant gates only the token-incentivised
 *  ones, and the two read the same canonical bytes. */
export type OneMouthSurface = 'sales_email' | 'assisted_touch' | 'dist_campaign';

export const ONE_MOUTH_SURFACES: readonly OneMouthSurface[] = [
  'sales_email', 'assisted_touch', 'dist_campaign',
];

/**
 * The refusal codes that are a property of the REGISTER, not of the words.
 *
 * Taken from the shared union rather than invented: `abuse.ts` emits the first two when
 * the perimeter is absent or unattested, and `gateOutboundText` uses the third for its
 * own fail-closed path. See the file docblock for why they are counted separately.
 */
export const PERIMETER_CODES: readonly string[] = [
  'EMBARGO_REGISTER_ABSENT',
  'HOLDINGS_DECLARATION_MISSING',
  'ASSET_STATE_UNKNOWN',
];

/**
 * Recorded as the actor when the source row names no sender.
 *
 * `messages` records `to_email` and no author; the sender is on
 * `outreach_sequences.from_email` and can be null. A PLACEHOLDER THAT LOOKS LIKE ONE:
 * the Art 91(3)(c) limb still runs and still refuses against it — a text whose author
 * this desk cannot identify cannot have its holdings limb cleared — but the observation
 * carries `actorAttributed: false` so that refusal is never read as a finding about a
 * named colleague.
 */
export const UNATTRIBUTED_ACTOR = 'unattributed:no-sender-on-row';

/** Where the observed bytes came from. `columns` is which bytes, because a digest over a
 *  different composition is a digest of something else. */
export interface OneMouthLocator {
  readonly table: string;
  readonly rowId: string;
  readonly columns: string;
}

/**
 * What a caller says about text that is about to leave the building.
 *
 * THERE IS NO SYMBOL FIELD, AND THAT IS THE POINT. `gateOutboundText` extracts asset
 * symbols from the text SERVER-SIDE precisely so a drafter cannot suppress the Art 90
 * and Art 91(3)(c) joins by omitting a field, and this interface preserves that
 * property: there is nothing here to omit. A caller that passes extra keys is passing
 * keys nothing reads.
 */
export interface OneMouthSubject {
  readonly surface: OneMouthSurface;
  readonly locator: OneMouthLocator;
  readonly text: string;
  /** The sender, or `null` when the row records none. Never taken from a request body. */
  readonly actor: string | null;
  /**
   * Only meaningful for `assisted_touch`, whose rows carry their own channel. Defaults
   * per surface below. `checkClaimSafety` treats `x_public` specially and none of these
   * three surfaces is that, so this choice moves no verdict today — it is recorded
   * honestly rather than left to a hardcoded literal that would become wrong silently.
   */
  readonly channel?: 'email' | 'linkedin' | 'telegram' | 'web_page';
  readonly now?: string;
}

const DEFAULT_CHANNEL: Readonly<Record<OneMouthSurface, 'email' | 'linkedin' | 'web_page'>> = {
  sales_email: 'email',
  assisted_touch: 'linkedin',
  dist_campaign: 'web_page',
};

/**
 * One observation. NOTE WHAT IS ABSENT: no `allowed`, no `usableText`, no field a send
 * path could read as permission. `blocked` is the literal `false`.
 */
export interface OneMouthObservation {
  readonly mode: typeof ONE_MOUTH_MODE;
  /** The literal `false`. The type forbids ever claiming otherwise. */
  readonly blocked: false;
  /** What enforcement WOULD have done. Nothing was done. */
  readonly wouldBlock: boolean;
  readonly surface: OneMouthSurface;
  readonly locator: OneMouthLocator;
  readonly actor: string;
  readonly actorAttributed: boolean;
  readonly observedAt: string;
  readonly textSha256: string;
  /** `gate:<16 hex>` — the same reference the outbound gate mints, so an operator can
   *  quote one string at both ledgers. */
  readonly reference: string;
  readonly textChars: number;
  readonly disposition: Disposition;
  /** The UNSCOPED codes. A control ledger holds the true codes, never the redaction. */
  readonly refusalCodes: readonly string[];
  /**
   * The provisions those refusals cite. NOT positionally paired with `refusalCodes`:
   * the scoped Art 90 limb collapses several codes into one sentence, so the two lists
   * can legitimately differ in length. Recorded because a count without the rule it
   * applies is a statistic nobody can act on.
   */
  readonly rulesCited: readonly string[];
  readonly blockingViolations: readonly string[];
  readonly assetsExtracted: readonly string[];
  readonly extractionCaveat: string;
  readonly perimeterAttributable: boolean;
  readonly gateError: string | null;
}

/**
 * Run the engine over one piece of outbound text and report what it found.
 *
 * NEVER THROWS AND NEVER BLOCKS. `gateOutboundText` resolves with a refusal rather than
 * rejecting; the digest is computed inside the same try so a failing `node:crypto` import
 * cannot escape either. On any internal failure the observation still comes back, with
 * `gateError` set and `wouldBlock: true` — because in shadow mode "the check failed" is
 * itself a datum about how enforcement would behave, and recording it as a clean pass
 * would understate the base rate.
 */
export async function observeOneMouth(
  pool: Pool,
  subject: OneMouthSubject,
): Promise<OneMouthObservation> {
  const now = subject.now ?? new Date().toISOString();
  const actorAttributed = typeof subject.actor === 'string' && subject.actor.trim() !== '';
  const actor = actorAttributed ? subject.actor!.trim() : UNATTRIBUTED_ACTOR;
  const channel = subject.channel ?? DEFAULT_CHANNEL[subject.surface];

  const base = {
    mode: ONE_MOUTH_MODE,
    blocked: false as const,
    surface: subject.surface,
    locator: subject.locator,
    actor,
    actorAttributed,
    observedAt: now,
    textChars: subject.text.length,
    extractionCaveat: EXTRACTION_IS_LEXICAL,
  };

  try {
    const textSha256 = await gateTextSha256(subject.text);
    const verdict = await gateOutboundText(pool, {
      text: subject.text,
      /*
       * `original` — a desk-authored communication, not a reply to somebody. That maps to
       * intents `['promotional']` inside the gate, which is the right Art 88(1) input for
       * a sales email and for campaign copy: both sell LCX's activities. It also maps to
       * ContentSurface `original_post`; `campaign_landing_copy` would be truer for the
       * campaign surface and is unreachable from here because the gate derives the surface
       * from the verb and `outboundGate.ts` is not this lane's to change. The difference
       * affects SURFACE_CLASS only.
       */
      verb: 'original',
      channel,
      actor,
      /*
       * `clearance` and not `draft`: this text is finished. It is in a table, addressed,
       * and the only thing between it and a recipient is a send. Recording it as a draft
       * would understate what the observation is about.
       */
      phase: 'clearance',
      now,
      // NOT passed: `viewerIsEmbargoApprover`. Nobody reads a shadow observation as a
      // drafter, so the scoped explanation is irrelevant here — and the codes below are
      // taken from `ledgerOnly`, which is unscoped regardless.
    });

    const refusalCodes = verdict.ledgerOnly.refusalCodes.map(String);
    const rulesCited = [...new Set(
      verdict.refusals.map((r) => `${r.rule.instrument} ${r.rule.provision}`.trim()),
    )];
    const blockingViolations = verdict.blockingViolations.map((v) => v.rule);

    return {
      ...base,
      textSha256,
      reference: gateReferenceFrom(textSha256),
      /*
       * `!verdict.allowed`, taken from the gate's own single answer rather than
       * re-derived from the code lists. `outboundGate.ts` records at length what happens
       * when a caller recomputes this: an error-severity VIOLATION blocks while emitting
       * no refusal at all, so `refusalCodes.length > 0` would have called those texts
       * clear — the exact defect that let a `flagged` draft be ledgered as
       * `allowed: true`.
       */
      wouldBlock: !verdict.allowed,
      disposition: verdict.disposition,
      refusalCodes,
      rulesCited,
      blockingViolations,
      assetsExtracted: verdict.assetsExtracted,
      perimeterAttributable: refusalCodes.some((c) => PERIMETER_CODES.includes(c)),
      gateError: verdict.gateError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      /*
       * A DIGEST THAT COULD NOT BE COMPUTED IS STATED, NEVER BLANK — and it is 64 zeros
       * rather than a sentence because 0073's CHECK admits only 64 hex characters, and a
       * row that cannot be written is an observation lost. `reference` says the true thing
       * in words; `outboundGate.ts` exports the same admission under
       * GATE_REFERENCE_UNAVAILABLE and this reuses that spelling so one grep finds both.
       */
      textSha256: '0'.repeat(64),
      reference: 'gate:reference-unavailable',
      wouldBlock: true,
      disposition: 'refused',
      refusalCodes: ['ASSET_STATE_UNKNOWN'],
      rulesCited: ['desk_policy Outbound gate — fail closed'],
      blockingViolations: [],
      assetsExtracted: [],
      perimeterAttributable: true,
      gateError: message,
    };
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  RECORDING
 * ════════════════════════════════════════════════════════════════════════════ */

let ledgerCache: boolean | null = null;

/** Test-only: forget the probe. */
export function _resetOneMouthLedgerMigrated(): void {
  ledgerCache = null;
}

/**
 * Has 0073 landed here? Same three-state discipline as `gateLedgerMigrated`: only a
 * DEFINITIVE answer is cached, so one transient error cannot pin the ledger into
 * "absent" for the life of the process.
 */
async function oneMouthLedgerMigrated(pool: Pool): Promise<boolean> {
  if (ledgerCache !== null) return ledgerCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_one_mouth_shadow') IS NOT NULL AS ok`,
    );
    ledgerCache = Boolean((res.rows[0] as { ok?: unknown } | undefined)?.ok);
    return ledgerCache;
  } catch {
    return false;
  }
}

/**
 * Append one observation. Returns whether it landed; NEVER THROWS.
 *
 * A failed write here cannot be allowed to break the path it is observing — the whole
 * premise of shadow mode is that it changes no outcome, and a module that could 500 a
 * send queue would be enforcement by accident. The failure is logged and reported as
 * `false`, and `loadOneMouthShadowReport` says so from the other side: a ledger that is
 * readable and empty is `recording_nothing_observed`, never "no findings".
 */
export async function recordOneMouthObservation(
  pool: Pool,
  obs: OneMouthObservation,
): Promise<boolean> {
  try {
    if (!(await oneMouthLedgerMigrated(pool))) return false;
    await pool.query(
      `INSERT INTO marketing_one_mouth_shadow
         (mode, blocked, surface, locator_table, locator_row_id, locator_columns,
          actor, actor_attributed, text_sha256, text_chars, would_block, disposition,
          refusal_codes, rules_cited, violation_codes, assets_extracted,
          perimeter_attributable, gate_error, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        obs.mode,
        // Passed explicitly rather than left to the column DEFAULT so the writer states
        // the claim it is making. 0073's CHECK refuses anything else.
        obs.blocked,
        obs.surface,
        obs.locator.table,
        obs.locator.rowId,
        obs.locator.columns,
        obs.actor,
        obs.actorAttributed,
        obs.textSha256,
        obs.textChars,
        obs.wouldBlock,
        obs.disposition,
        obs.refusalCodes,
        obs.rulesCited,
        obs.blockingViolations,
        obs.assetsExtracted,
        obs.perimeterAttributable,
        obs.gateError,
        obs.observedAt,
      ],
    );
    return true;
  } catch (err) {
    console.error('[marketing] one-mouth observation not recorded:', err);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE SWEEP — the corpora, read server-side.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface OneMouthSourceResult {
  readonly surface: OneMouthSurface;
  /** `not_loaded` when the source table does not exist on this environment. */
  readonly state: 'read' | 'not_loaded';
  readonly rowsRead: number | null;
  readonly observed: number | null;
  readonly recorded: number | null;
  readonly wouldBlock: number | null;
  readonly table: string;
}

export interface OneMouthSweep {
  readonly contract: typeof ONE_MOUTH_CONTRACT;
  readonly mode: typeof ONE_MOUTH_MODE;
  /** The literal `false`. A sweep stops nothing. */
  readonly blocked: false;
  readonly observedAt: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly sources: readonly OneMouthSourceResult[];
  /** True when the observations could not be recorded — the count is then not evidence. */
  readonly ledgerAbsent: boolean;
  readonly refusals: readonly { code: string; sentence: string; rule: string }[];
}

export interface OneMouthSweepOptions {
  readonly now?: Date;
  readonly windowDays?: number;
  readonly limitPerSurface?: number;
  readonly surfaces?: readonly OneMouthSurface[];
}

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_LIMIT_PER_SURFACE = 200;

interface SweepRow {
  row_id: unknown;
  subject: unknown;
  body: unknown;
  actor: unknown;
  channel?: unknown;
}

/**
 * The three reads, INDEPENDENTLY guarded.
 *
 * One try/catch per source and not one around the loop: `messages` can exist on an
 * environment where `dist_campaigns` does not (0003 against 0043), and a single guard
 * would turn one missing table into three zeroes. A source that could not be read is
 * `not_loaded` with null counts, which is a different fact from a source that was read
 * and held nothing.
 */
async function readSource(
  pool: Pool,
  surface: OneMouthSurface,
  from: string,
  limit: number,
): Promise<SweepRow[] | null> {
  const sql: Record<OneMouthSurface, string> = {
    // The sender is on the SEQUENCE, not the message — `messages` records only the
    // recipient. A LEFT JOIN so a message with no sequence is still observed, with the
    // actor stated as unattributed rather than the row silently skipped.
    sales_email:
      `SELECT m.id::text AS row_id, m.subject, m.body, s.from_email AS actor
         FROM messages m LEFT JOIN outreach_sequences s ON s.id = m.sequence_id
        WHERE m.created_at >= $1
        ORDER BY m.created_at DESC LIMIT $2`,
    /*
     * `edited_body` wins where a human edited it: that is the text that will actually be
     * sent, and gating the pre-edit body would be gating something nobody is sending.
     *
     * THE ACTOR IS DELIBERATELY NULL. `outreach_tasks` records the RECIPIENT (person_id)
     * and no author, and the nearest candidate — `outreach_sequences.from_email` through
     * `sequence_id` — is the EMAIL sender, while these rows are LinkedIn and Telegram
     * touches a different human performs by hand. Attributing them to the email sender
     * would put a named colleague's holdings declaration behind text they may not have
     * sent, which is an inference laundered into a certainty. Unattributed refuses, which
     * is the safe direction, and `actorAttributed: false` says so on every row.
     */
    assisted_touch:
      `SELECT t.id::text AS row_id, t.subject, COALESCE(t.edited_body, t.body) AS body,
              NULL::text AS actor, t.channel
         FROM outreach_tasks t
        WHERE t.created_at >= $1
        ORDER BY t.created_at DESC LIMIT $2`,
    // `created_by` is the nearest thing to an author on a campaign row.
    dist_campaign:
      `SELECT c.id::text AS row_id, c.name AS subject, c.detail AS body, c.created_by AS actor
         FROM dist_campaigns c
        WHERE c.created_at >= $1
        ORDER BY c.created_at DESC LIMIT $2`,
  };
  try {
    const res = await pool.query<SweepRow>(sql[surface], [from, limit]);
    return res.rows;
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01') {
      return null;
    }
    throw err;
  }
}

const SOURCE_TABLE: Readonly<Record<OneMouthSurface, string>> = {
  sales_email: 'messages',
  assisted_touch: 'outreach_tasks',
  dist_campaign: 'dist_campaigns',
};

const SOURCE_COLUMNS: Readonly<Record<OneMouthSurface, string>> = {
  sales_email: 'subject+body',
  assisted_touch: 'subject+coalesce(edited_body,body)',
  // ONE definition, shared with the warrant: `composeCampaignPublicText` is what
  // `emissionWarrant.ts` digests, so the shadow observation and the warrant are about the
  // same bytes and their `text_sha256` values join.
  dist_campaign: 'name+detail+task_labels',
};

/** The bytes gated for one row, per surface. */
function textFor(surface: OneMouthSurface, row: SweepRow): string {
  const subject = row.subject == null ? '' : String(row.subject);
  const body = row.body == null ? '' : String(row.body);
  if (surface === 'dist_campaign') {
    return composeCampaignPublicText({ name: subject, detail: body });
  }
  return [subject, body].filter((s) => s.trim() !== '').join('\n');
}

/**
 * Observe and record every piece of outbound text in the window. Blocks nothing.
 *
 * WHY THE CORPORA ARE READ HERE RATHER THAN PASSED IN: a caller that chose which rows to
 * submit would be choosing the base rate, and the number this module exists to produce
 * would then be a number about the caller. The definition of "everything that leaves the
 * building" belongs server-side, in one place, where it can be reviewed.
 */
export async function sweepOneMouth(
  pool: Pool,
  opts: OneMouthSweepOptions = {},
): Promise<OneMouthSweep> {
  const now = opts.now ?? new Date();
  const windowDays = Number.isSafeInteger(opts.windowDays) && (opts.windowDays as number) > 0
    ? (opts.windowDays as number)
    : DEFAULT_WINDOW_DAYS;
  const limit = Number.isSafeInteger(opts.limitPerSurface) && (opts.limitPerSurface as number) > 0
    ? (opts.limitPerSurface as number)
    : DEFAULT_LIMIT_PER_SURFACE;
  const windowTo = now.toISOString();
  const windowFrom = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const surfaces = opts.surfaces ?? ONE_MOUTH_SURFACES;

  const refusals: { code: string; sentence: string; rule: string }[] = [];
  const sources: OneMouthSourceResult[] = [];
  let ledgerAbsent = false;

  for (const surface of surfaces) {
    const rows = await readSource(pool, surface, windowFrom, limit);
    if (rows === null) {
      sources.push({
        surface,
        state: 'not_loaded',
        rowsRead: null,
        observed: null,
        recorded: null,
        wouldBlock: null,
        table: SOURCE_TABLE[surface],
      });
      refusals.push({
        code: 'ONE_MOUTH_SOURCE_ABSENT',
        sentence:
          `There is no ${SOURCE_TABLE[surface]} relation on this environment, so the ${surface} `
          + 'mouth was NOT observed. Its counts are null and not zero: nothing is known about what '
          + 'that surface emitted in this window.',
        rule:
          'house_doctrine — absent data refuses. It never renders 0 and never an empty list that '
          + 'reads as "nothing happened".',
      });
      continue;
    }

    let observed = 0;
    let recorded = 0;
    let wouldBlock = 0;
    for (const row of rows) {
      const text = textFor(surface, row);
      // An empty artefact is not observed: there is nothing for the engine to read, and a
      // clear verdict over zero bytes would dilute the base rate with rows that carry no
      // text at all.
      if (text.trim() === '') continue;
      const obs = await observeOneMouth(pool, {
        surface,
        locator: {
          table: SOURCE_TABLE[surface],
          rowId: String(row.row_id ?? ''),
          columns: SOURCE_COLUMNS[surface],
        },
        text,
        actor: row.actor == null ? null : String(row.actor),
        channel: surface === 'assisted_touch' && row.channel === 'telegram'
          ? 'telegram'
          : undefined,
        now: windowTo,
      });
      observed += 1;
      if (obs.wouldBlock) wouldBlock += 1;
      if (await recordOneMouthObservation(pool, obs)) recorded += 1;
      else ledgerAbsent = true;
    }

    sources.push({
      surface,
      state: 'read',
      rowsRead: rows.length,
      observed,
      recorded,
      wouldBlock,
      table: SOURCE_TABLE[surface],
    });
  }

  if (ledgerAbsent) {
    refusals.push({
      code: 'ONE_MOUTH_LEDGER_ABSENT',
      sentence:
        `Observations were computed and could NOT be recorded: ${ONE_MOUTH_MIGRATION} has not been `
        + 'applied on this environment (or the insert failed). The counts in this response are '
        + 'from this run only and nothing durable exists to query — so this sweep is not the '
        + 'evidence that would justify enforcement.',
      rule:
        'house_doctrine — nothing leaves without a record. A count nobody can query afterwards is '
        + 'a runtime opinion that vanished.',
    });
  }

  return {
    contract: ONE_MOUTH_CONTRACT,
    mode: ONE_MOUTH_MODE,
    blocked: false,
    observedAt: windowTo,
    windowFrom,
    windowTo,
    sources,
    ledgerAbsent,
    refusals,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE READ — the number, and what kind of nothing a nothing is.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * FOUR STATES, THREE OF WHICH RENDER AS "NOTHING HERE".
 *
 * Collapsing any two of them turns shadow mode into a silent pass, which is the specific
 * way this control could be worse than not existing: a green screen asserting that
 * outbound text was checked and found clean, produced by an instrument nothing has ever
 * called.
 */
export type OneMouthShadowState =
  /** 0073 is not applied, or the ledger could not be read. Nothing is known. */
  | 'not_loaded'
  /** The ledger exists and is empty in this window. Installed, and never called. */
  | 'recording_nothing_observed'
  /** Text WAS observed and none of it would have blocked. A measured zero. */
  | 'observed_no_findings'
  /** The number this module exists to produce. */
  | 'observed_with_findings';

export interface OneMouthFrame {
  readonly observedAt: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly windowDays: number;
  /** What was observed, in words. */
  readonly captures: string;
  /** The named absences. Non-empty, always. */
  readonly doesNotCapture: readonly string[];
  readonly knownBiases: readonly string[];
  /**
   * `census_of_own_corpus` is deliberately NOT claimed. The population is whatever was
   * put through `observeOneMouth`, not everything the desk sent, and there is no
   * denominator for the latter.
   */
  readonly completeness: 'population_is_what_was_submitted';
  /** Where these figures came from. Never NODE_ENV alone — a prod build pointed at a
   *  laptop reports `production`. */
  readonly environment: string;
  readonly source: 'marketing_one_mouth_shadow';
  readonly ledgerApplied: boolean;
  /** Oldest and newest observation in the window, so a count is interpretable. */
  readonly earliestObservation: string | null;
  readonly latestObservation: string | null;
}

export interface OneMouthCounts {
  /** Every count is nullable. `null` is "not read"; 0 is a measurement. */
  readonly observations: number | null;
  readonly wouldBlock: number | null;
  /** Of `wouldBlock`, how many are caused by the register rather than by the words. */
  readonly perimeterAttributable: number | null;
  /** How much of the count is one template repeating. */
  readonly distinctTexts: number | null;
  readonly unattributedActor: number | null;
  readonly gateErrors: number | null;
}

export interface OneMouthShadowReport {
  readonly contract: typeof ONE_MOUTH_CONTRACT;
  readonly mode: typeof ONE_MOUTH_MODE;
  /** The literal `false`. Nothing in this window was blocked. */
  readonly blocked: false;
  readonly state: OneMouthShadowState;
  /** Why a surface showing nothing is showing nothing. Always present. */
  readonly stateStatement: string;
  readonly frame: OneMouthFrame;
  readonly counts: OneMouthCounts;
  /** Refusal code → how many observations carried it. `null` when not read. */
  readonly byCode: Readonly<Record<string, number>> | null;
  readonly bySurface: readonly {
    surface: string;
    observations: number;
    wouldBlock: number;
  }[] | null;
  readonly coverage: {
    /** The literal `false`. There is no denominator for "everything the desk sent". */
    readonly complete: false;
    readonly statement: string;
    readonly doesNotCover: readonly string[];
  };
  readonly refusals: readonly { code: string; sentence: string; rule: string }[];
}

export interface OneMouthReportOptions {
  readonly now?: Date;
  readonly windowDays?: number;
}

/** The one aggregate row. Every field `unknown` because `COUNT(*)` arrives as a decimal
 *  string and a timestamp arrives as a `Date` or a string depending on the driver. */
interface TotalsRow {
  observations: unknown;
  would_block: unknown;
  perimeter: unknown;
  distinct_texts: unknown;
  unattributed: unknown;
  gate_errors: unknown;
  earliest: unknown;
  latest: unknown;
}

function environmentLabel(): string {
  let host = 'unknown-host';
  try {
    // `URL.host` is hostname:port and never carries the credentials in the DSN.
    host = new URL(env.databaseUrl).host || host;
  } catch {
    // No DSN configured (tests, or a boot before env is set). Say so rather than guess.
  }
  return `${env.nodeEnv} · ${host}`;
}

const iso = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' && v !== '') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

/** A count or `null`, never a fabricated 0. `COUNT(*)` arrives as a decimal string. */
const int = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The shadow count, readable.
 *
 * THREE AGGREGATES AND NO ROW DUMP. A report is not an export: `assets_extracted` on
 * this table is a list of symbols the desk was drafting about before any announcement,
 * which is the Art 90 inside information itself, and `locator_row_id` identifies a named
 * recipient's email. The counts are the governance fact; the rows are held behind the
 * marketing compartment, exactly as `access/controlRegister.ts` does for 0062.
 */
export async function loadOneMouthShadowReport(
  pool: Pool,
  opts: OneMouthReportOptions = {},
): Promise<OneMouthShadowReport> {
  const now = opts.now ?? new Date();
  const windowDays = Number.isSafeInteger(opts.windowDays) && (opts.windowDays as number) > 0
    ? (opts.windowDays as number)
    : DEFAULT_WINDOW_DAYS;
  const windowTo = now.toISOString();
  const windowFrom = new Date(now.getTime() - windowDays * 86_400_000).toISOString();

  const refusals: { code: string; sentence: string; rule: string }[] = [];

  /*
   * THREE STATES, AND THE FIRST DRAFT OF THIS LINE HAD TWO.
   *
   * It read `!PENDING_MIGRATIONS.includes(ONE_MOUTH_MIGRATION)` — and 0073 is not in
   * that list, because `db/migrationLedger.ts` belongs to another lane and has never
   * heard of this file. So the report published `ledgerApplied: true` for a migration
   * that has reached no database at all: absence from the pending list was read as
   * "applied", which is the same fail-open shape as an empty register reading as clear.
   * Its own test caught it.
   *
   * A file the ledger does not KNOW is a third state and the worst of the three: nothing
   * lists it, so nobody will apply it, and `migrationImmutability.test.ts` fails on it
   * until the ledger is updated.
   */
  const ledgerKnowsFile = REGISTERED_MIGRATIONS.includes(ONE_MOUTH_MIGRATION);
  const ledgerApplied = ledgerKnowsFile && !PENDING_MIGRATIONS.includes(ONE_MOUTH_MIGRATION);

  const frameBase = {
    observedAt: windowTo,
    windowFrom,
    windowTo,
    windowDays,
    captures:
      'Title VI verdicts computed over outbound sales email, assisted-channel touches and '
      + 'campaign copy that were SUBMITTED to the shadow gate inside this window. Verdicts only — '
      + 'nothing was blocked.',
    doesNotCapture: [
      'any text that was never submitted to the shadow gate, which includes every mouth this '
      + 'module has not been wired into yet',
      'text sent from a colleague\'s own mailbox, or pasted into a chat, which reaches no table '
      + 'here at all',
      'assets named in prose, in lower case, or by project name rather than ticker — the '
      + 'extractor is lexical (see extractionCaveat on every observation)',
      'whether a would-be refusal is CORRECT: this counts what the engine says, not what a '
      + 'regulator would say',
    ],
    knownBiases: [
      'the embargo register is not attested by design, so perimeter codes dominate the raw count '
      + '— read wouldBlock beside perimeterAttributable, never alone',
      'one template email observed on many sends counts many times; distinctTexts is published '
      + 'beside the total for exactly that reason',
      'a mouth that is not wired in contributes nothing and looks identical to a mouth that '
      + 'emitted nothing',
    ],
    completeness: 'population_is_what_was_submitted' as const,
    environment: environmentLabel(),
    source: 'marketing_one_mouth_shadow' as const,
    ledgerApplied,
  };

  const coverage = {
    complete: false as const,
    statement:
      'This report cannot tell you what proportion of the desk\'s outbound text would be refused, '
      + 'and it publishes no such figure. The denominator would have to be everything the desk '
      + 'sent, and no table here holds that. It counts what was submitted to the shadow gate and '
      + 'nothing else.',
    doesNotCover: [
      'outbound text on any path that does not call observeOneMouth',
      'whether the would-be refusals would have survived review by a human',
      'anything about enforcement: nothing in this window was blocked, by construction',
    ],
  };

  const notLoaded = (sentence: string): OneMouthShadowReport => ({
    contract: ONE_MOUTH_CONTRACT,
    mode: ONE_MOUTH_MODE,
    blocked: false,
    state: 'not_loaded',
    stateStatement: sentence,
    frame: { ...frameBase, earliestObservation: null, latestObservation: null },
    counts: {
      observations: null,
      wouldBlock: null,
      perimeterAttributable: null,
      distinctTexts: null,
      unattributedActor: null,
      gateErrors: null,
    },
    byCode: null,
    bySurface: null,
    coverage,
    refusals: [
      ...refusals,
      {
        code: 'ONE_MOUTH_LEDGER_ABSENT',
        sentence,
        rule:
          'house_doctrine — three states are never collapsed. Not-loaded, '
          + 'present-but-withheld and genuinely-empty are three facts. A ledger that cannot be '
          + 'read is NOT a ledger of zero findings.',
      },
    ],
  });

  let totals: TotalsRow | null;
  try {
    const res = await pool.query<TotalsRow>(
      `SELECT COUNT(*)                                            AS observations,
              COUNT(*) FILTER (WHERE would_block)                 AS would_block,
              COUNT(*) FILTER (WHERE would_block
                                 AND perimeter_attributable)      AS perimeter,
              COUNT(DISTINCT text_sha256)                         AS distinct_texts,
              COUNT(*) FILTER (WHERE NOT actor_attributed)        AS unattributed,
              COUNT(*) FILTER (WHERE gate_error IS NOT NULL)      AS gate_errors,
              MIN(observed_at)                                    AS earliest,
              MAX(observed_at)                                    AS latest
         FROM marketing_one_mouth_shadow
        WHERE observed_at >= $1 AND observed_at <= $2`,
      [windowFrom, windowTo],
    );
    totals = res.rows[0] ?? null;
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01') {
      return notLoaded(
        `There is no marketing_one_mouth_shadow relation on this environment: `
        + `${ONE_MOUTH_MIGRATION} has not been applied. NOTHING IS KNOWN about what the three `
        + 'mouths emitted — this is not a report that they emitted nothing, and it is not a '
        + 'report that nothing would have been refused.',
      );
    }
    throw err;
  }

  const observations = totals ? int(totals.observations) : null;
  const wouldBlock = totals ? int(totals.would_block) : null;
  const perimeter = totals ? int(totals.perimeter) : null;
  /*
   * ALL THREE OR NONE. `COUNT(*)` never returns NULL on real Postgres, so this is
   * reachable only through a shape fault — a renamed column, a view, a driver returning
   * something non-numeric. It matters because the state machine below reads
   * `wouldBlock > 0`: a null `wouldBlock` beside a real `observations` would have produced
   * `observed_no_findings`, i.e. a POSITIVE claim that outbound text was checked and found
   * clean, from a read that failed. `int()` refusing to fabricate a zero is only half the
   * fix; this is the other half.
   */
  if (observations === null || wouldBlock === null || perimeter === null) {
    return notLoaded(
      'The shadow ledger exists and its aggregate returned counts that could not be read as '
      + 'numbers, so nothing here is READ. That is a shape fault in the read, not a finding that '
      + 'no text was observed and not a finding that nothing would have been refused.',
    );
  }

  let byCode: Record<string, number> | null = {};
  try {
    const res = await pool.query<{ code: unknown; n: unknown }>(
      `SELECT code, COUNT(*) AS n
         FROM marketing_one_mouth_shadow, unnest(refusal_codes) AS code
        WHERE observed_at >= $1 AND observed_at <= $2
        GROUP BY code ORDER BY n DESC, code ASC`,
      [windowFrom, windowTo],
    );
    for (const r of res.rows) {
      const code = typeof r.code === 'string' ? r.code : null;
      const n = int(r.n);
      if (code !== null && n !== null) byCode[code] = n;
    }
  } catch (err) {
    if (typeof err !== 'object' || err === null || (err as { code?: string }).code !== '42P01') {
      throw err;
    }
    /*
     * A CONTRADICTION, AND IT IS PUBLISHED AS ONE. The totals read above succeeded, so the
     * relation exists; a 42P01 here means the histogram read is asking for something else.
     * `byCode: {}` would render as "no refusal codes in this window" beside a non-zero
     * `wouldBlock` — the empty list that reads as "nothing happened", which is the exact
     * thing doctrine forbids. `null` is not-loaded, and the refusal says why.
     */
    byCode = null;
    refusals.push({
      code: 'ONE_MOUTH_CODE_HISTOGRAM_UNREADABLE',
      sentence:
        'The per-code breakdown could not be read even though the totals could. WHICH gates would '
        + 'have fired is therefore NOT KNOWN — an empty breakdown here would read as "no codes '
        + 'fired", which contradicts the count beside it.',
      rule:
        'house_doctrine — absent data refuses. It never renders an empty list that reads as '
        + '"nothing happened".',
    });
  }

  let bySurface: OneMouthShadowReport['bySurface'] = null;
  try {
    const res = await pool.query<{ surface: unknown; n: unknown; wb: unknown }>(
      `SELECT surface, COUNT(*) AS n, COUNT(*) FILTER (WHERE would_block) AS wb
         FROM marketing_one_mouth_shadow
        WHERE observed_at >= $1 AND observed_at <= $2
        GROUP BY surface ORDER BY surface ASC`,
      [windowFrom, windowTo],
    );
    bySurface = res.rows.map((r) => ({
      surface: String(r.surface),
      observations: int(r.n) ?? 0,
      wouldBlock: int(r.wb) ?? 0,
    }));
  } catch (err) {
    if (typeof err !== 'object' || err === null || (err as { code?: string }).code !== '42P01') {
      throw err;
    }
    // Same reasoning as the histogram above: `null` is not-loaded, and the per-mouth split
    // being missing is stated rather than rendered as three surfaces with nothing on them.
    bySurface = null;
    refusals.push({
      code: 'ONE_MOUTH_SURFACE_SPLIT_UNREADABLE',
      sentence:
        'The per-mouth split could not be read even though the totals could, so WHICH mouth '
        + 'produced these observations is NOT KNOWN. That matters most where it is missing: the '
        + 'whole point of the count is to say which surface needs the gate first.',
      rule:
        'house_doctrine — three states are never collapsed. Not-loaded is not genuinely-empty.',
    });
  }

  /*
   * THE TOTAL AND THE SPLIT MUST NOT DISAGREE SILENTLY. Both read the same rows over the
   * same window; if they do not add up, one of the two reads is wrong and neither is
   * trustworthy — which is a thing to say, not a thing to reconcile by picking a number.
   */
  if (bySurface !== null) {
    const summed = bySurface.reduce((n, s) => n + s.observations, 0);
    if (summed !== observations) {
      refusals.push({
        code: 'ONE_MOUTH_SPLIT_DISAGREES',
        sentence:
          `The per-mouth split accounts for ${summed} observation(s) and the total over the same `
          + `window is ${observations}. The two reads disagree, so neither the total nor the split `
          + 'can be relied on. This is stated rather than resolved.',
        rule:
          'house_doctrine — placeholders must look like placeholders. A figure that cannot be '
          + 'reconciled is surfaced as a stated disagreement, not smoothed into a plausible number.',
      });
    }
  }

  /*
   * THE STATE. Note that `observations === 0` is NOT "no findings" — the ledger was
   * readable and nothing had been put through the instrument, which is the state a
   * green screen would otherwise misreport as a clean bill of health.
   */
  const state: OneMouthShadowState = observations === 0
    ? 'recording_nothing_observed'
    : wouldBlock > 0 ? 'observed_with_findings' : 'observed_no_findings';

  const stateStatement = state === 'recording_nothing_observed'
    ? `The shadow ledger is readable and holds NO observations in this window (${windowDays} `
      + 'day(s)). The instrument is installed and nothing has been put through it, which is not '
      + 'the same as text having been observed and found clean. Wire a send path into '
      + 'observeOneMouth, or run sweepOneMouth, before reading anything into this zero.'
    : state === 'observed_no_findings'
      ? `${observations} piece(s) of outbound text were observed in this window and NONE would `
        + 'have been blocked. This is a measured zero, over the population stated in the frame — '
        + 'which is what was submitted to the gate, not everything the desk sent.'
      : `${observations} piece(s) of outbound text were observed and ${wouldBlock} would have been `
        + `blocked had this been enforcement. ${perimeter} of those are attributable to the `
        + 'register being unattested rather than to the words — read the two numbers together, '
        + 'because they have different owners and different remedies.';

  if (!ledgerKnowsFile) {
    refusals.push({
      code: 'ONE_MOUTH_MIGRATION_UNREGISTERED',
      sentence:
        `${ONE_MOUTH_MIGRATION} exists on disk and db/migrationLedger.ts has never heard of it, so `
        + 'it is not pending, not shipped, and not applicable anywhere. An unlisted migration is '
        + 'one nobody applies: the surface that needs it refuses forever, and '
        + 'db/__tests__/migrationImmutability.test.ts fails on the file until the ledger accounts '
        + 'for it. This is a build-integration gap, not a finding about outbound text.',
      rule:
        'house_doctrine — three states are never collapsed. Absence from the pending list is not '
        + 'evidence of having been applied.',
    });
  } else if (!ledgerApplied) {
    refusals.push({
      code: 'ONE_MOUTH_LEDGER_PENDING',
      sentence:
        `${ONE_MOUTH_MIGRATION} is listed as PENDING in the migration ledger, so on any `
        + 'environment where it has not been applied by hand this report reads not_loaded. The '
        + 'figures above came from a database that does have the table.',
      rule:
        'house_doctrine — placeholders must look like placeholders. A figure carries the '
        + 'environment it came from, and a pending migration is part of that description.',
    });
  }

  if (wouldBlock > 0 && perimeter === wouldBlock) {
    refusals.push({
      code: 'ONE_MOUTH_RATE_IS_PERIMETER_ONLY',
      sentence:
        `Every one of the ${wouldBlock} would-be refusals in this window is attributable to the `
        + 'register rather than to the words. This number therefore says nothing about the '
        + 'lawfulness of the desk\'s copy: it says the embargo and holdings registers are not '
        + 'attested, which they are not, by design. Do not present it as a text-quality finding.',
      rule:
        'house_doctrine — an inference is never laundered into a certainty. A count whose whole '
        + 'cause is a missing attestation is reported as that, not as a finding about the text.',
    });
  }

  return {
    contract: ONE_MOUTH_CONTRACT,
    mode: ONE_MOUTH_MODE,
    blocked: false,
    state,
    stateStatement,
    frame: {
      ...frameBase,
      earliestObservation: iso(totals!.earliest),
      latestObservation: iso(totals!.latest),
    },
    counts: {
      observations,
      wouldBlock,
      perimeterAttributable: perimeter,
      distinctTexts: int(totals!.distinct_texts),
      unattributedActor: int(totals!.unattributed),
      gateErrors: int(totals!.gate_errors),
    },
    byCode,
    bySurface,
    coverage,
    refusals,
  };
}
