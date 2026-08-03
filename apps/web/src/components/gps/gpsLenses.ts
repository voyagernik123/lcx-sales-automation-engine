/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE LENSES — how a GPS desk's row becomes an inspectable object
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GpsInspector` is generic over the row shape and never looks inside `T`; a lens is what
 * supplies the reading. This file holds the lenses, not the desks, for one reason: a lens
 * is the place where a claim about PROVENANCE gets made, and provenance claims are the
 * thing this compartment is most exposed on. Six of them scattered through six 1,500-line
 * page files could not be reviewed together or asserted together, and `GpsFieldStanding`
 * is only worth having if somebody can read every use of it at once.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────────────
 *
 * A field's standing describes what the SURFACE can know from the row in front of it, not
 * what is true in the database. Where the row cannot distinguish two histories, the lens
 * says so in those words rather than picking the flattering one. `vendorCostCents` is the
 * whole reason this rule needed writing down — see `engagementLens`.
 *
 * ── NO JSX HERE, DELIBERATELY ─────────────────────────────────────────────────
 *
 * `GpsField.value` is a `ReactNode` so a desk can hand the inspector its own money or date
 * rendering, and every value below is a plain string produced by the desk's own formatter
 * passed in. That keeps this a `.ts` file with no component in it, which is what makes the
 * lens testable as a function returning data rather than through a render.
 */

import { CATALOGUE_TODOS, getOffer, marginCents, marginPct } from '@lcx/shared';
import type { GpsEngagementRow } from '@/lib/api/gps';
import type { GpsField, GpsLens, GpsObjectView } from './GpsInspector';

/**
 * The ledger rows the standings below name, as string constants.
 *
 * `awaitingTodo` must match a `CATALOGUE_TODOS.what` exactly or `GpsInspector` renders
 * `UNKNOWN_TODO_NOTICE` — the ratchet its author built so that a placeholder warning cannot
 * outlive the decision it is waiting for. Naming them here rather than inline means the
 * lens and the ledger are compared once, by `__tests__/gpsLenses.test.ts`, instead of at
 * every call site.
 */
export const TODO_PRICE_BANDS = 'Real price bands for all five offers.';
export const TODO_PARTNER_RATE_CARD = 'Named partner or specialist per offer, with a rate card.';
export const TODO_CONTRACTING_ENTITY =
  'Contracting entity decision (lcx | external), or confirmation that both stay live.';
export const TODO_DISCLOSURE_TEXT =
  'Standard disclosure text for the conflict check, per contracting entity.';

/** Every `awaitingTodo` this file claims. Asserted against the ledger, not trusted. */
export const LENS_TODOS: readonly string[] = [
  TODO_PRICE_BANDS, TODO_PARTNER_RATE_CARD, TODO_CONTRACTING_ENTITY, TODO_DISCLOSURE_TEXT,
];

/** Any of the ledger rows above still outstanding? Read from the ledger, never assumed. */
function todoStillOpen(what: string): boolean {
  return CATALOGUE_TODOS.some((t) => t.what === what);
}

export interface EngagementLensDeps {
  /** The desk's own money formatter, so the inspector and the card cannot disagree. */
  money: (cents: number) => string;
  /** The client's jurisdiction, which `GpsEngagementRow` does not join. */
  jurisdiction?: string | null;
  /** Open the delivery desk for this engagement, when the caller can navigate. */
  onOpenDelivery?: (engagementId: string) => void;
}

/**
 * An engagement, read as an object.
 *
 * ── WHY `vendorCostCents` IS THE HARD FIELD ───────────────────────────────────
 *
 * The quote builder falls back to `offer.expectedVendorCostCents` when the operator leaves
 * the cost blank (`pages/Gps.tsx:372`), and the fallback is right — a blank reading as $0
 * would show 100% margin on partner-delivered work. But the ROW keeps no record of which
 * happened. So when the stored cost equals the catalogue's expectation the lens cannot tell
 * a typed figure from an accepted placeholder, and it says exactly that: the standing is
 * `placeholder` and it names the rate-card decision, because that is the direction a wrong
 * guess must fall. Claiming `measured` on a number that may be a compiled constant is how
 * a margin becomes evidence.
 *
 * MARGIN IS `derived`, NEVER `measured`, and never stored — here, in the API and in
 * `0047_gps.sql`. It inherits every assumption of the cost above it, which is precisely the
 * distinction `GpsFieldStanding` draws between the two.
 */
export function engagementLens(deps: EngagementLensDeps): GpsLens<GpsEngagementRow> {
  const { money, jurisdiction = null, onOpenDelivery } = deps;
  return (row: GpsEngagementRow): GpsObjectView => {
    const offer = getOffer(row.offerKey);
    const costLooksCompiled =
      row.vendorCostCents === offer.expectedVendorCostCents && todoStillOpen(TODO_PARTNER_RATE_CARD);
    const pct = marginPct(row.priceCents, row.vendorCostCents);

    const fields: GpsField[] = [
      {
        label: 'Status',
        value: row.status,
        standing: { kind: 'measured', source: 'gps_engagement.status' },
      },
      {
        label: 'Offer',
        value: offer.name,
        standing: { kind: 'measured', source: 'gps_engagement.offer_key → OFFERS' },
      },
      {
        label: 'Price',
        value: money(row.priceCents),
        // The figure is what a human typed into the quote field, which opens EMPTY exactly
        // so that this can be `measured` rather than a band midpoint wearing a price's
        // clothes. The BAND it was checked against is the placeholder, and that is the next
        // field's problem, not this one's.
        standing: { kind: 'measured', source: 'gps_engagement.price_cents — typed at quote time' },
      },
      {
        label: 'Price band it was quoted against',
        value: `${money(offer.priceBandCents.min)} – ${money(offer.priceBandCents.max)}`,
        standing: todoStillOpen(TODO_PRICE_BANDS)
          ? { kind: 'placeholder', awaitingTodo: TODO_PRICE_BANDS }
          : { kind: 'measured', source: 'OFFERS[…].priceBandCents' },
      },
      {
        label: 'Vendor cost',
        value: costLooksCompiled
          ? `${money(row.vendorCostCents)} — indistinguishable from the catalogue's expectation`
          : money(row.vendorCostCents),
        standing: costLooksCompiled
          ? { kind: 'placeholder', awaitingTodo: TODO_PARTNER_RATE_CARD }
          : { kind: 'measured', source: 'gps_engagement.vendor_cost_cents — typed at quote time' },
      },
      {
        label: pct == null ? 'Margin' : `Margin (${pct}%)`,
        value: money(marginCents(row.priceCents, row.vendorCostCents)),
        standing: { kind: 'derived', from: 'marginCents(price, vendorCost) — never stored' },
      },
      {
        label: 'Contracting entity',
        value: row.contractingEntity,
        standing: todoStillOpen(TODO_CONTRACTING_ENTITY)
          ? { kind: 'unreviewed', awaitingTodo: TODO_CONTRACTING_ENTITY }
          : { kind: 'measured', source: 'gps_engagement.contracting_entity' },
      },
      {
        label: 'Delivering partner',
        value: null,
        standing: {
          kind: 'absent',
          whyNoColumn:
            'gps_engagement has no partner column and no offer names a partnerOwner, so nothing '
            + 'on this row says who delivers it. A migration, not a decision.',
        },
      },
      {
        label: 'Jurisdiction',
        value: jurisdiction,
        standing: jurisdiction
          ? { kind: 'measured', source: 'gps_client.jurisdiction — free text a human typed' }
          : {
            kind: 'absent',
            whyNoColumn:
              'GpsEngagementRow joins the client NAME and not its jurisdiction, so this row '
              + 'cannot name a place even when the client record does.',
          },
      },
      {
        label: 'Deposit required',
        value: row.depositRequiredCents > 0
          ? `${money(row.depositRequiredCents)}${row.depositPaidAt ? ' · paid' : ' · unpaid'}`
          : money(0),
        standing: { kind: 'measured', source: 'gps_engagement.deposit_required_cents / deposit_paid_at' },
      },
      {
        label: 'Conflict check',
        // ABSENCE OF A DECISION IS NOT A CLEARANCE, and the word is the same one the wall
        // and the ⌘K row use so an operator reads one vocabulary across three surfaces.
        value: row.conflict
          ? `${row.conflict.decision.replace(/_/g, ' ')} · ${row.conflict.decidedBy}`
          : 'MISSING',
        standing: row.conflict
          ? { kind: 'measured', source: 'gps_conflict_check.decision — desk-level attribution only' }
          : {
            kind: 'absent',
            whyNoColumn:
              'No conflict check row exists for this engagement. That is a missing check, not a '
              + 'clearance, and it is what blocks the proposal.',
          },
      },
      {
        label: 'Disclosure wording used',
        value: row.conflict ? 'stored verbatim on the check' : null,
        standing: row.conflict
          ? { kind: 'unreviewed', awaitingTodo: TODO_DISCLOSURE_TEXT }
          : {
            kind: 'absent',
            whyNoColumn: 'There is no check, so there is no wording to have used.',
          },
      },
    ];

    return {
      kind: 'engagement',
      title: row.clientName || `Engagement ${row.id}`,
      subtitle: `${offer.name} · created ${new Date(row.createdAt).toISOString().slice(0, 10)}`,
      fields,
      refusals: engagementRefusals(row),
      links: onOpenDelivery
        ? [{
          label: 'Delivery desk',
          detail: 'Milestones, evidence and acceptance for this engagement',
          onOpen: () => onOpenDelivery(row.id),
        }]
        : [{
          label: 'Delivery desk',
          detail: 'Reachable from GPS · DELIVERY DESK — this surface cannot navigate there',
        }],
    };
  };
}

/**
 * What is standing against this engagement right now, in sentences with the rule cited.
 *
 * ONLY WHAT THE ROW PROVES. The server re-checks the perimeter, the conflict gate and the
 * below-band rule on every issue (`gps_proposal_issue`), and none of those three is visible
 * on this row — so this list is the subset a surface can be certain of, and the inspector's
 * own "nothing is refusing this object right now… that is a statement about the checks that
 * have run, not a clearance" carries the rest. Inventing a refusal here from a guess would
 * be worse than the gap it fills.
 */
function engagementRefusals(row: GpsEngagementRow): GpsObjectView['refusals'] {
  const out: GpsObjectView['refusals'][number][] = [];
  if (row.conflict == null) {
    out.push({
      id: 'conflict_missing',
      sentence:
        'This engagement cannot be issued as a proposal: no conflict check is recorded against it. '
        + 'Record the check on the engagement card, then issue.',
      rule: 'gps_proposal_issue — conflict-gated in the API and on the card (pages/Gps.tsx:737)',
    });
  }
  if (marginCents(row.priceCents, row.vendorCostCents) <= 0) {
    out.push({
      id: 'margin_not_positive',
      sentence:
        'At this price the engagement makes no margin against the recorded vendor cost. Nothing '
        + 'blocks issuing it — this is the arithmetic saying the work pays nothing, not a rule '
        + 'saying no.',
      rule: 'marginCents(price, vendorCost) ≤ 0 · derived on the surface, never stored',
    });
  }
  return out;
}
