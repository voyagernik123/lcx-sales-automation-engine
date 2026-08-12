/**
 * E3 THE PIPELINE — the derivation, with no renderer in it.
 *
 * `docs/3d/e3` proved the environment on a hand-authored dataset. This is the part that reads the SHIPPING
 * page's own leads, and it is a separate module from the renderer for three reasons that are all the same
 * reason: the numbers must be checkable without a GPU.
 *
 * 1 · The caption beside the frame and the geometry inside it are computed ONCE, here. E3's README is proud
 *     that "the report prints the figure the picture shows"; two derivations is how that stops being true.
 * 2 · `@lcx/gl` is not imported by this file, so `PipelineRelief` can decide whether relief is even offerable
 *     — a refused dataset must not pay for a 35.7 KB chunk to be told so.
 * 3 · jsdom has no WebGL2. Everything asserted in `__tests__/pipelineRelief.test.tsx` about absence, about the
 *     stalled aggregate and about a share with no denominator is asserted against this module directly.
 *
 * ── WHAT MAPS ONTO WHAT, AND THE ONE PLACE THIS IS NOT §2's WORD ─────────────────────
 * §2 describes E3 as "a deal's mass = package value, its velocity = days-since-update".
 *
 * `BdPipeline` HAS NO PACKAGE VALUE. There is no deal-size field on a `BdLead` — the surface is a lead queue,
 * not a signed-contract book. The only monetary magnitude the page carries is `marketCapUsd`, which is also
 * the column the flat table offers as a sort key, and it is what an operator means when they ask how big a
 * name is. So MASS IS MARKET CAP, it is labelled market cap everywhere a reader can see it, and the harness's
 * "package value" wording is not carried over into the product. Reading a proxy is defensible; renaming it is
 * not.
 *
 * MOVEMENT IS DAYS SINCE `updatedAt`, which is the real thing rather than a proxy, and it is rendered as
 * HEIGHT rather than as velocity because §6 rule 2 forbids idle animation — a channel of drifting objects is
 * an idle animation with a budget. "Stalls visibly settle" is the half of §2 that survives a still frame, and
 * it is the half that carries the reading.
 *
 * STAGE IS `band`. That is not a liberty: `deriveStage` in `types/bd.ts` already IS this mapping in the
 * shipping app, and `GATE_LABELS` is built by calling it rather than by re-typing its strings.
 */
import { deriveStage, type BdLead } from '@/types/bd';

/**
 * The point past which a lead is treated as dead rather than slow, and the floor of the height axis.
 *
 * A policy number, not a taste one, and the axis CLAMPS at it rather than extending: a lead untouched for 63
 * days and one untouched for 90 both rest on the deck, because the axis does not pretend to resolve a
 * difference nobody acts on differently.
 */
export const STALL_DAYS = 45;

/** Where "stalled" begins, as opposed to "on the deck". E3's 0.6 × the floor. */
export const STALL_ONSET = 0.6 * STALL_DAYS;

/**
 * Six slots per gate, and this is the honest cost of promoting E3 onto a paginated queue.
 *
 * The harness had twelve deals across five stages. This page ships fifty rows a page, so a gate can hold
 * twenty — at which point the cubes interpenetrate and the one visual channel a reader trusts most is
 * destroyed. Six is what fits a 2.2 m segment at three lanes × two depth rows without any pair of maximum-
 * sized cubes touching.
 *
 * The leads that do not fit are the SMALLEST in their gate, the count and the value of what was dropped are
 * printed beside the frame, and every aggregate here is over the DRAWN set only — because a headline number
 * covering rows the picture does not contain is exactly the disagreement between figure and frame that this
 * whole programme keeps rediscovering.
 */
export const MAX_PER_GATE = 6;

/**
 * The gates, far end to near end.
 *
 * `archive` is DELIBERATELY ABSENT and is not a sixth gate. An archived lead has not stalled in a stage; it
 * has been rejected, and putting it in the channel would assert that value is stuck where in fact it was
 * declined. Archived leads are counted and reported as excluded rather than silently filtered — see
 * `archived` on `Channel`.
 */
export const GATE_BANDS = ['unscored', 'watch', 'nurture', 'high', 'immediate'] as const;
export type GateBand = (typeof GATE_BANDS)[number];

/** Built by calling the app's own mapping, so the channel and the flat table cannot disagree about a name. */
export const GATE_LABELS: readonly string[] = GATE_BANDS.map((b) => deriveStage(b));

/**
 * The gate the headline figure is measured PAST — index 3, `high`, which `deriveStage` calls "Warm lead".
 *
 * E3's headline is "value past diligence and stalled": money that has cleared the hard gates and then stopped
 * moving. The equivalent here is a lead the desk has already qualified as warm or hot and then not touched.
 */
export const DEEP_GATE = 3;
export const DEEP_GATE_LABEL: string = GATE_LABELS[DEEP_GATE] ?? 'Warm lead';

/**
 * Which of the two readings a lead supports. They are read from different fields and fail SEPARATELY, which
 * is why this is one enum rather than two booleans hidden in the geometry.
 */
export type Known = 'OBSERVED' | 'VALUE_ABSENT' | 'MOVEMENT_ABSENT' | 'BOTH_ABSENT';

export interface ChannelDeal {
  readonly id: string;
  readonly name: string;
  readonly band: GateBand;
  readonly gateIndex: number;
  /** A PACKING position inside the gate's segment. Not a datum. */
  readonly slot: number;
  /** `null` = never recorded. Never 0, never inferred from a neighbour. */
  readonly valueUsd: number | null;
  /** `null` = no readable last touch. Never 0, which would assert the freshest possible reading. */
  readonly daysSinceUpdate: number | null;
  readonly known: Known;
}

export interface Channel {
  readonly deals: readonly ChannelDeal[];
  /** A stable code when the channel must not be drawn at all. The caller stays on the flat table. */
  readonly refusal: string | null;
  /** Every fault found, named. Present even when `refusal` is set — especially then. */
  readonly faults: readonly string[];
  readonly drawn: number;
  /** Leads that reached the packing stage, before the per-gate cap. */
  readonly considered: number;
  readonly undrawn: number;
  /** Value of the undrawn leads that had one, or `null` if none of them did. */
  readonly undrawnUsd: number | null;
  readonly archived: number;
  readonly valueAbsent: number;
  readonly movementAbsent: number;
  /** Leads whose `updatedAt` is in the future. Clamped to 0 days and counted rather than hidden. */
  readonly futureDated: number;
  /** Sum of the drawn leads' readable market caps, or `null` when not one of them is readable. */
  readonly readableUsd: number | null;
  readonly deepStalledUsd: number | null;
  readonly deepStalledShare: number | null;
  readonly deepStalledNames: readonly string[];
  readonly stalledCount: number;
}

const DAY_MS = 86_400_000;

/**
 * EXCLUDING EVERYTHING USED TO PRINT 0%, AND 0% IS A MEASUREMENT.
 *
 * E3's own README records this: every share was `x / Math.max(1, total)`, which stops a divide-by-zero and in
 * doing so manufactures a reading — on a book where nothing is readable, `total` is 0 because there was
 * nothing to sum, not because the pipeline is empty. Fed five unreadable records the harness printed
 * "0% OF THE READABLE BOOK" in the largest type on the frame. One divider, returning null.
 */
function share(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

/** `$1.75M` / `$430k` / `$9.5k`. The sub-10k branch exists because `Math.round(1600/1000)` is 2. */
export function formatUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `$${Math.round(v / 1e3)}k`;
  return `$${(v / 1e3).toFixed(1)}k`;
}

/**
 * Days since an ISO timestamp, distinguishing "not recorded" from "recorded as nonsense".
 *
 * Those are NOT the same state and collapsing them is the defect this whole file is shaped around. A missing
 * `updatedAt` is an absence the channel renders — the object floats off the top of the movement axis. An
 * `updatedAt` of `"soon"` is CORRUPT, and a corrupt field must refuse the frame rather than be drawn as an
 * absence, because an absence is a claim about the record and this is a claim about the pipe.
 */
function daysSince(iso: string | null | undefined, nowMs: number): number | null | 'INVALID' {
  if (iso === null || iso === undefined || iso.trim() === '') return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'INVALID';
  return (nowMs - t) / DAY_MS;
}

function emptyChannel(refusal: string | null, faults: readonly string[], archived: number): Channel {
  return {
    deals: [], refusal, faults,
    drawn: 0, considered: 0, undrawn: 0, undrawnUsd: null,
    archived, valueAbsent: 0, movementAbsent: 0, futureDated: 0,
    readableUsd: null, deepStalledUsd: null, deepStalledShare: null, deepStalledNames: [],
    stalledCount: 0,
  };
}

interface Candidate {
  lead: BdLead;
  band: GateBand;
  gateIndex: number;
  valueUsd: number | null;
  daysSinceUpdate: number | null;
  known: Known;
}

/**
 * The whole derivation, pure, from the page's own rows.
 *
 * ── ABSENCE WAS DEFENDED EVERYWHERE AND VALIDITY NOWHERE ─────────────────────────────
 * That sentence is E3's, and it is the reason the fault pass below exists. `marketCapUsd` is documented as
 * "`null` = never recorded", the null case is handled in five places, and NOTHING in the harness asked whether
 * a PRESENT number was a number. Fed `NaN`, `Infinity` and `-500_000` as observed values it reached READY and
 * printed `NaN% OF THE READABLE BOOK` onto the frame; a negative value also takes a negative cube root at the
 * mass mapping, so the box edge goes negative in silence.
 *
 * That input is far more likely HERE than in the harness, because these numbers come off an API rather than
 * out of a literal. So one pass, before any packing exists, and a fault refuses the channel by name while the
 * flat table keeps every row.
 */
export function buildChannel(leads: readonly BdLead[], nowMs: number = Date.now()): Channel {
  const faults: string[] = [];
  const candidates: Candidate[] = [];
  let archived = 0;
  let futureDated = 0;

  for (const lead of leads) {
    const band = lead.band;
    if (band === 'archive') { archived++; continue; }
    const gateIndex = (GATE_BANDS as readonly string[]).indexOf(band);
    if (gateIndex < 0) {
      /* A band this file has never heard of. Mapping it to gate 0 would place a lead at a stage it has not
         been assigned, which is a data error the picture would present as a fact. */
      faults.push(`${lead.name}: band ${JSON.stringify(band)} is not a stage in this channel`);
      continue;
    }

    const rawValue = lead.marketCapUsd;
    let valueUsd: number | null = null;
    if (rawValue !== null && rawValue !== undefined) {
      if (!Number.isFinite(rawValue)) faults.push(`${lead.name}: marketCapUsd is ${String(rawValue)}`);
      else if (rawValue < 0) faults.push(`${lead.name}: marketCapUsd is negative (${rawValue})`);
      else valueUsd = rawValue;
    }

    const days = daysSince(lead.updatedAt, nowMs);
    let daysSinceUpdate: number | null = null;
    if (days === 'INVALID') {
      faults.push(`${lead.name}: updatedAt ${JSON.stringify(lead.updatedAt)} is not a date`);
    } else if (days !== null) {
      /* A lead updated "in the future" is clock skew, not corruption. Clamped to today — the freshest
         reading, which is what a just-touched row deserves — and COUNTED, so the clamp is visible. */
      if (days < 0) futureDated++;
      daysSinceUpdate = Math.max(0, days);
    }

    const known: Known = valueUsd === null && daysSinceUpdate === null ? 'BOTH_ABSENT'
      : valueUsd === null ? 'VALUE_ABSENT'
        : daysSinceUpdate === null ? 'MOVEMENT_ABSENT'
          : 'OBSERVED';

    candidates.push({ lead, band: band as GateBand, gateIndex, valueUsd, daysSinceUpdate, known });
  }

  if (faults.length > 0) return emptyChannel('INVALID_LEAD_DATA', faults, archived);
  if (candidates.length === 0) return emptyChannel('NO_LEADS_IN_THE_CHANNEL', faults, archived);

  /*
   * PACKING. Largest first inside each gate, and the readable ones before the unreadable ones — because when
   * the cap bites, the reading this environment exists for is about where the MONEY is, so the money is what
   * stays on screen. What is dropped is reported, both as a count and as a sum.
   */
  const byGate = new Map<number, Candidate[]>();
  for (const c of candidates) {
    const list = byGate.get(c.gateIndex) ?? [];
    list.push(c);
    byGate.set(c.gateIndex, list);
  }

  const deals: ChannelDeal[] = [];
  const dropped: Candidate[] = [];
  for (const [gateIndex, list] of byGate) {
    list.sort((a, b) => {
      const ra = a.valueUsd === null ? 1 : 0, rb = b.valueUsd === null ? 1 : 0;
      if (ra !== rb) return ra - rb;
      if (a.valueUsd !== null && b.valueUsd !== null && a.valueUsd !== b.valueUsd) return b.valueUsd - a.valueUsd;
      return a.lead.name.localeCompare(b.lead.name);
    });
    list.forEach((c, i) => {
      if (i >= MAX_PER_GATE) { dropped.push(c); return; }
      deals.push({
        id: c.lead.id, name: c.lead.name, band: c.band, gateIndex, slot: i,
        valueUsd: c.valueUsd, daysSinceUpdate: c.daysSinceUpdate, known: c.known,
      });
    });
  }

  const readable = deals.filter((d) => d.valueUsd !== null);
  const readableUsd = readable.length === 0 ? null : readable.reduce((s, d) => s + (d.valueUsd ?? 0), 0);

  const isStalled = (d: ChannelDeal): boolean =>
    d.daysSinceUpdate !== null && d.daysSinceUpdate >= STALL_ONSET;

  const deep = deals.filter((d) => d.gateIndex >= DEEP_GATE && d.valueUsd !== null && isStalled(d));
  const deepStalledUsd = deep.length === 0 && readableUsd === null
    ? null
    : deep.reduce((s, d) => s + (d.valueUsd ?? 0), 0);

  const droppedWithValue = dropped.filter((c) => c.valueUsd !== null);

  return {
    deals,
    refusal: null,
    faults,
    drawn: deals.length,
    considered: candidates.length,
    undrawn: dropped.length,
    undrawnUsd: droppedWithValue.length === 0
      ? null
      : droppedWithValue.reduce((s, c) => s + (c.valueUsd ?? 0), 0),
    archived,
    valueAbsent: deals.filter((d) => d.known === 'VALUE_ABSENT' || d.known === 'BOTH_ABSENT').length,
    movementAbsent: deals.filter((d) => d.known === 'MOVEMENT_ABSENT' || d.known === 'BOTH_ABSENT').length,
    futureDated,
    readableUsd,
    deepStalledUsd,
    deepStalledShare: share(deepStalledUsd, readableUsd),
    deepStalledNames: deep.map((d) => d.name),
    stalledCount: deals.filter(isStalled).length,
  };
}
