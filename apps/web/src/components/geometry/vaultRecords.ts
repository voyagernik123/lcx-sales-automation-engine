/**
 * E6 THE VAULT — the audit spine's own rows, turned into things that can be placed on a time axis.
 *
 * This file is deliberately pure and deliberately separate from the renderer: it is where the three states an
 * audit record can be in are kept apart, and that decision is testable in jsdom while the corridor is not.
 *
 * ── THE THREE STATES ARE REAL, NOT SYNTHESISED ───────────────────────────────────────
 * `docs/3d/e6` proved the environment on synthetic records that carried an explicit `verdict` field. The
 * shipping audit spine has no such field, so the states are DERIVED from what the API actually returns, and
 * each derivation names its source rather than being invented to make the picture better:
 *
 * · WITHHELD — `apps/api/src/routes/audit.ts` replaces `meta` with `{withheld: true, reason}` for a GPS row a
 *   caller cannot read, and for a MARKETING row it withholds `entity_id` as well (`[withheld:marketing]`).
 *   The row itself is deliberately still served — actor, action and timestamp — because "an unattributable
 *   embargo decision is worse than a widely-readable one". So the honest 3-D statement is a lit slab at its own
 *   moment in time whose SUBJECT is a named absence, not a slab with no text: the data withholds the payload,
 *   not the record, and a blank slab would claim more concealment than actually happened.
 * · BLOCKED — the action names a refusal. `middleware/workspace.ts` writes `workspace.access_refused` when the
 *   compartment gate turns a read away, and that is a governed action that DID NOT HAPPEN. Matched by pattern
 *   rather than by a hard-coded string so the next refusal action somebody records is classified on arrival;
 *   the pattern is anchored on separators so `unblocked_at` cannot be read as a block.
 * · ALLOWED — anything else in the spine: a governed action that completed and was recorded.
 *
 * ── AN ABSENT TIMESTAMP IS NOT HOUR ZERO ─────────────────────────────────────────────
 * §6 rule 6. Depth IS the time axis here, so a record whose `createdAt` will not parse has no position at all —
 * and placing it at 0 would put it on the "now" wall, which is the single most misleading spot in the frame. It
 * is EXCLUDED and COUNTED, with the reason named, so the count can be printed rather than absorbed. Same for a
 * timestamp ahead of the clock: that is skew or a bad write, not a record from the future, and a negative depth
 * would put it behind the camera where `projectQuad` would refuse it for a reason that names geometry.
 */
import type { AuditEntry } from '@/lib/api/audit';

export type AuditVerdict = 'ALLOWED' | 'BLOCKED' | 'WITHHELD';

/**
 * An action whose name says the governed act was refused.
 *
 * Anchored on separators at both ends, because the substring test is wrong in both directions: `refused` alone
 * matches `unrefused_count`, and `access_refused` alone misses whatever the next gate calls itself. The list is
 * the vocabulary the API actually uses (`workspace.access_refused`) plus the words a new gate would plausibly
 * pick — and a name that matches none of them is classified ALLOWED, which is the safe direction to be wrong
 * in for a colour: a refusal drawn as an allow understates, whereas an allow drawn as a refusal invents a
 * governance event that never happened.
 */
export const REFUSAL_ACTION_RE = /(?:^|[._\-/])(?:refused|refusal|refuse|denied|deny|blocked|rejected)(?:$|[._\-/])/i;

/** `audit.ts`'s constant for a marketing subject the caller may not read. Not a hash — see its comment. */
export const WITHHELD_ENTITY_ID = '[withheld:marketing]';

export function auditVerdict(entry: AuditEntry): AuditVerdict {
  const meta: unknown = entry.meta;
  if (meta !== null && typeof meta === 'object' && (meta as { withheld?: unknown }).withheld === true) {
    return 'WITHHELD';
  }
  /* Checked as well as `meta.withheld`, not instead of it: the marketing branch withholds both fields and the
     GPS branch withholds one, so either alone would miss a compartment. */
  if (entry.entityId === WITHHELD_ENTITY_ID) return 'WITHHELD';
  if (REFUSAL_ACTION_RE.test(entry.action ?? '')) return 'BLOCKED';
  return 'ALLOWED';
}

export interface VaultRecord {
  readonly id: string;
  /** Hours before the reference clock. Never negative — see `TIMESTAMP_AHEAD_OF_NOW`. */
  readonly hoursAgo: number;
  readonly verdict: AuditVerdict;
  /** The action identifier, WHOLE. `null` when the record carries none — never an empty string. */
  readonly action: string | null;
  readonly actor: string | null;
  /** What the action was done to. `null` = not readable, and `subjectWithheld` says which kind. */
  readonly subject: string | null;
  /**
   * True only when the SUBJECT ITSELF is withheld, which is NOT the same as the row being WITHHELD.
   *
   * `apps/api/src/routes/audit.ts` withholds different fields per compartment and says so at length: a GPS
   * row loses `meta` ONLY — "the actor, the action, the engagement id and the timestamp are above" — while a
   * marketing row loses `entity_id` too, because there the asset symbol is itself the inside information.
   * So on a GPS row the subject is served, the flat table shows it, and a slab printing SUBJECT WITHHELD
   * over it would be the corridor and the table disagreeing about one record. Only the marketing case is a
   * withheld subject, and `WITHHELD_ENTITY_ID` is how the API says so.
   */
  readonly subjectWithheld: boolean;
}

export type UnplacedReason = 'NO_TIMESTAMP' | 'TIMESTAMP_AHEAD_OF_NOW';

export interface VaultUnplaced {
  readonly id: string;
  readonly reason: UnplacedReason;
}

export interface VaultRecordSet {
  /** Newest first, which is the order the corridor is walked in so a cluster tiers deterministically. */
  readonly records: readonly VaultRecord[];
  /** Records with no honest position on a time axis. Named, counted, and NOT drawn at hour zero. */
  readonly unplaced: readonly VaultUnplaced[];
  /** Age of the oldest placed record, in hours. 0 when every record shares one instant. */
  readonly spanHours: number;
}

/** Blank, whitespace and the em dash a table uses for "nothing" all mean ABSENT here, and absent is `null`. */
function textOrNull(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  if (t === '' || t === '—' || t === '-') return null;
  return t;
}

/**
 * The subject, and whether its absence is a withholding.
 *
 * ── THE FIRST VERSION BLANKED EVERY WITHHELD ROW, AND THAT WAS A CLAIM THE API CONTRADICTS ──
 * It returned `null` for the whole `WITHHELD` verdict, so the renderer printed SUBJECT WITHHELD on every one
 * of them. For a marketing row that is exactly right. For a GPS row it is a false statement about the record:
 * `audit.ts` withholds `meta` and nothing else there, deliberately — "the row itself is not hidden: the
 * actor, the action, the engagement id and the timestamp are above" — and the flat table one click away
 * prints that engagement id in its Entity cell. Two drawings of one dataset disagreeing about whether a
 * reader is allowed to know the subject is worse than either drawing alone, and it fails in the direction
 * that makes the governed action less attributable, which is the specific harm the API's comment is about.
 *
 * So the withholding is read from the FIELD the API redacts rather than from the row's verdict, and the two
 * absences stay apart: `[withheld:marketing]` means the subject is being kept from this reader; no entity and
 * no name at all means nobody recorded one.
 */
function subjectOf(entry: AuditEntry): { subject: string | null; subjectWithheld: boolean } {
  const rawId = textOrNull(entry.entityId);
  /* The API's constant, not a heuristic: a stable digest was deliberately rejected there because it would
     still let a reader correlate rows and count embargoes per asset. */
  if (rawId === WITHHELD_ENTITY_ID) return { subject: null, subjectWithheld: true };

  const entity = textOrNull(entry.entity);
  const name = textOrNull(entry.projectName);
  if (entity === null) return { subject: name, subjectWithheld: false };
  /* The project name when the join found one, otherwise the id's first 8 — the same choice the flat table
     makes, so the two drawings name the same subject. */
  if (name !== null) return { subject: `${entity}·${name}`, subjectWithheld: false };
  return { subject: rawId === null ? entity : `${entity}·${rawId.slice(0, 8)}`, subjectWithheld: false };
}

export function buildVaultRecords(entries: readonly AuditEntry[], nowMs: number): VaultRecordSet {
  const records: VaultRecord[] = [];
  const unplaced: VaultUnplaced[] = [];

  for (const e of entries) {
    const t = Date.parse(e.createdAt ?? '');
    if (!Number.isFinite(t)) { unplaced.push({ id: e.id, reason: 'NO_TIMESTAMP' }); continue; }
    const hoursAgo = (nowMs - t) / 3_600_000;
    /* A tolerance of one minute, because a clock a few seconds ahead is the same record and rejecting it
       would drop the newest row on the page — the one an operator opened this surface to see. */
    if (hoursAgo < -1 / 60) { unplaced.push({ id: e.id, reason: 'TIMESTAMP_AHEAD_OF_NOW' }); continue; }
    const verdict = auditVerdict(e);
    const { subject, subjectWithheld } = subjectOf(e);
    records.push({
      id: e.id,
      hoursAgo: Math.max(0, hoursAgo),
      verdict,
      action: textOrNull(e.action),
      actor: textOrNull(e.actor),
      subject,
      subjectWithheld,
    });
  }

  records.sort((a, b) => a.hoursAgo - b.hoursAgo);
  return {
    records,
    unplaced,
    spanHours: records.length === 0 ? 0 : records[records.length - 1]!.hoursAgo,
  };
}

/** How the age of a record is written on its own slab. Days past three, because "71h ago" is arithmetic. */
export function whenOf(hoursAgo: number): string {
  if (hoursAgo < 1) return `${Math.max(1, Math.round(hoursAgo * 60))}m ago`;
  if (hoursAgo < 24) return `${Math.round(hoursAgo)}h ago`;
  if (hoursAgo < 72) return `${(hoursAgo / 24).toFixed(1)}d ago`;
  return `${Math.round(hoursAgo / 24)}d ago`;
}
