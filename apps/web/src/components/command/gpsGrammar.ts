/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GLOBAL SERVICES' HALF OF THE COMMAND LINE — GPS Phase 11, the grammar
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT WAS WRONG. Seven waves built this compartment — engines, six desks, a conflict
 * wall, an underwriting instrument — and not one of them reached ⌘K. `lib/destinations.ts`
 * carries all seven surfaces, so `g b` / `g o` / `g u` / `g c` / `g d` / `g l` work and the
 * native menu lists them, while the palette an operator actually uses knew nothing about
 * GLOBAL SERVICES at all. `marketingGrammar.ts` recorded that gap on 2026-08-02
 * (`PALETTE_PAGE_GAP_NOT_OURS`) and left it, correctly, because it is this lane's file.
 * This is that lane. GPS is also the compartment that prices real work for third parties,
 * which makes "reachable only if you already know the chord" the worst place to have it.
 *
 * NOTHING HERE IS HAND-LISTED AGAINST CommandBody. Page rows come from `DESTINATIONS`,
 * codes from the noun table below, verbs from the generated action manifest — which is
 * built from `apps/api/src/actions/registry.ts`, so the palette cannot drift from the
 * registry the server enforces. `__tests__/gpsGrammar.test.ts` reads CommandBody's source
 * and fails if a GPS path or code appears in it literally, and reads
 * `apps/api/src/gps/actions.ts` and fails if the verbs here are not exactly the ones the
 * registry declares.
 *
 * ── WHAT THIS FILE MAY NOT CLAIM ───────────────────────────────────────────────
 *
 * `GET /v1/search` EMITS NO GPS GROUP. Ten compartments have one; `gps` has none
 * (`apps/api/src/routes/search.ts` — `gps` appears there once, in a comment about
 * confidential material). So no noun below claims `server_search`, and the one noun with a
 * registry subject type reaches its instances through a client list route instead. The
 * test asserts the absence in the route's own source, so the day a GPS group lands this
 * file goes red and the noun gets upgraded rather than staying a nav shortcut forever.
 *
 * NO GPS SURFACE ACCEPTS A SELECTION EXCEPT DELIVERY AND THE LOOP. `pages/Gps.tsx`,
 * `GpsBook`, `GpsOrigination`, `GpsUnderwriting` and `GpsConflict` never call
 * `useSearchParams`; only `GpsDelivery` and `GpsLoop` read `engagementId`. A deep link is
 * therefore emitted ONLY where a page provably reads the param — the test greps the page
 * source for `searchParams.get('…')` — because a row that appears to preselect an
 * engagement and silently does not is worse than a row that admits it opens the desk.
 * `GPS_SURFACES_WITHOUT_SELECTION` records the rest.
 *
 * THE PRICES ARE PLACEHOLDERS AND THE EFFORT TRIPLES ARE PLACEHOLDERS. Both are owner
 * inputs nobody has supplied (`PRICE_BANDS_ARE_PLACEHOLDERS`,
 * `EFFORT_TRIPLES_ARE_PLACEHOLDERS`, both `true` in `@lcx/shared`). The rows for `offer`
 * and `effort_triple` say so, on the row, because a palette that quotes a number the desk
 * itself labels provisional has laundered it.
 *
 * ── WHY THIS FILE IMPORTS NOTHING FROM `@lcx/shared` ──────────────────────────
 *
 * Deliberate, and a perf constraint rather than a taste: the palette is in the initial
 * chunk and there are 23KB of headroom in the bundle ratchet. `@lcx/shared`'s GPS modules
 * are tens of thousands of lines (`gps/underwrite.ts` alone is ~1,900) and today they load
 * inside the lazy GPS route chunks. Pulling `OFFERS` or a placeholder flag in here to
 * enumerate a catalogue would drag that graph into the hot path to render sixteen rows.
 * So the constants are named as STRINGS and the TEST imports them — tests are not bundled,
 * the ratchet still fires, and the palette costs nothing. `__tests__/gpsGrammar.test.ts`
 * asserts this file's own source has no `@lcx/shared` import, so the shortcut cannot be
 * taken back later by accident.
 */

import { DESTINATIONS, type Destination } from '@/lib/destinations';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import type { ManifestAction } from '@/lib/command/types';
import { verbsFor, neededCapability, type Principal, type Verb } from './grammar';
import { fetchGpsEngagements } from '@/lib/api/gps';
/**
 * READ-ONLY REUSE, and the invitation was written down. `marketingGrammar.ts` states that
 * its page generator "is deliberately written against a path prefix rather than
 * special-cased to marketing, so whoever owns GPS can reuse it by passing '/gps'", and its
 * test asserts `destinationsUnder('/gps')` finds `/gps/book`. Re-declaring the filter and
 * the row types here would create exactly the SECOND PLACE both files exist to remove, and
 * CommandBody would then be handed two structurally identical row types to spread. Nothing
 * below edits or re-exports a marketing symbol.
 */
import { destinationsUnder, type PaletteRow, type PaletteCode } from './marketingGrammar';

/** The compartment id, as `ACTION_REGISTRY.workspace` and `WORKSPACES` spell it. */
export const GPS_WORKSPACE = 'gps';

/** Every GPS route begins here. The page generator's only input besides DESTINATIONS. */
export const GPS_PATH_PREFIX = '/gps';

/**
 * The registry subject type every GPS action addresses. ONE, deliberately: each action
 * acts on one engagement, which is what makes its audit row attributable
 * (`apps/api/src/gps/actions.ts` — `ENGAGEMENT_SUBJECT`). Stated as a string rather than
 * imported for the bundle reason in the header; the test compares it to the API source.
 */
export const GPS_ENGAGEMENT_SUBJECT = 'gps_engagement';

/* ── the noun table ───────────────────────────────────────────────────────────── */

/**
 * The nouns this compartment has. Not a taxonomy invented here: each is a thing
 * `GPS_100X_PLAN.md` names and a surface renders, and `subjectType` is the REGISTRY's word
 * for it or `null` — never a plausible-looking guess, because a guessed subject type
 * produces a verb menu that is empty for a reason nobody can find.
 */
export type GpsNounKind =
  | 'client'
  | 'engagement'
  | 'offer'
  | 'quote'
  | 'proposal'
  | 'deliverable'
  | 'milestone'
  | 'partner'
  | 'rate_card'
  | 'effort_triple'
  | 'target'
  | 'outreach_opening'
  /* G7: the nouns G2, G4, G5 and G6 put on desks that already existed. */
  | 'dossier'
  | 'draft'
  | 'portal_invite'
  | 'invoice'
  | 'outcome'
  | 'perimeter_position'
  | 'disclosure'
  | 'conflict_decision'
  /* Completion pass: the noun the G7 census wrote down as its one honest gap. The gap
   * was never about the noun — it was that /gps/inputs had no Destination and no
   * native-menu line. Both exist now, so the absence note in gpsGrammar.test.ts became
   * this row. */
  | 'packet';

/**
 * How the palette can put an INSTANCE of this noun in front of the operator TODAY.
 *
 * The honesty ceiling in a type, taken from `MarketingNounReach` and extended by the two
 * states GPS actually has and marketing did not. Ordered by how much of the noun is really
 * reachable:
 *
 *  server_search      /v1/search emits a group for it. NO GPS NOUN QUALIFIES — the route
 *                     emits no `gps` group at all. The variant exists so that adding one
 *                     is an upgrade rather than a new concept, and so the test that
 *                     asserts the absence has something to assert against.
 *  client_list        a mounted list route this palette calls itself. Real instances.
 *  per_parent         listable only under a parent instance — a milestone hangs off an
 *                     engagement — so a palette query cannot enumerate them at all.
 *                     `parentParam` is set ONLY when the surface provably reads it.
 *  compiled_catalogue the instances are a reviewed table in code, not rows in a database.
 *                     Enumerable in principle; deliberately NOT enumerated here, because
 *                     importing the catalogue would put `@lcx/shared`'s GPS graph in the
 *                     initial chunk (see the header). `notImported` says that on the row.
 *  surface_route      the route IS mounted and the palette still cannot enumerate
 *                     instances, because the route is not an enumeration. `notEnumerable`
 *                     says which, in the row itself.
 *  no_fetcher         nothing in `apps/web/src/lib/api/gps*.ts` fetches it. `missingFn`
 *                     names the function that would, and the test asserts NO GPS api
 *                     module exports that name — so when it lands, this file goes red.
 *                     `serverRoute` is non-null when the API already serves it and only
 *                     the browser half is absent; that is a different sentence for the
 *                     operator ("nobody calls it") than a missing route ("it does not
 *                     exist"), and conflating them is how a gap gets mis-triaged.
 */
export type GpsNounReach =
  | { readonly via: 'server_search'; readonly group: string }
  | { readonly via: 'client_list'; readonly fn: string }
  | {
      readonly via: 'per_parent';
      readonly parent: GpsNounKind;
      readonly fn: string;
      /** Query param the parent's surface reads. Omitted when it reads none. */
      readonly parentParam?: string;
    }
  | { readonly via: 'compiled_catalogue'; readonly symbol: string; readonly notImported: string }
  | { readonly via: 'surface_route'; readonly fn: string; readonly notEnumerable: string }
  | {
      readonly via: 'no_fetcher';
      /** The client fetcher that does not exist. No GPS api module may export it. */
      readonly missingFn: string;
      /** The mounted API path, or null when there is no route either. Shown on the row. */
      readonly serverRoute: string | null;
      /** The path literal as the route file writes it, so the claim is checkable. */
      readonly routeLiteral: string | null;
      /** Why it is absent, in a sentence. Shown on the row. */
      readonly reason: string;
    };

export interface GpsNounDef {
  readonly kind: GpsNounKind;
  /** Singular, for the type chip. */
  readonly label: string;
  /** Plural, for the row that takes you to where they live. */
  readonly plural: string;
  /** Bloomberg-style code: type it, hit Enter, you are there. Unique palette-wide. */
  readonly code: string;
  /** The `Destination.id` whose surface renders this noun. Must exist in DESTINATIONS. */
  readonly destination: Destination['id'];
  /** The ACTION_REGISTRY subject type governed writes address, or null when none does. */
  readonly subjectType: string | null;
  readonly reach: GpsNounReach;
  /**
   * One thing that is true about this noun and would otherwise mislead. Shown on the row
   * verbatim. Used for the two placeholder inputs and for the nouns that are a STATE of
   * another object rather than an object — the palette should not imply otherwise.
   */
  readonly caveat?: string;
  /** A shared constant the caveat rests on, asserted by the test rather than trusted. */
  readonly caveatFlag?: string;
  /** Words an operator might type that are not in the label. */
  readonly aliases?: readonly string[];
}

/**
 * `engagement` AND `proposal` SHARE ONE SUBJECT TYPE, and that is not a mistake to tidy
 * away. All five governed GPS actions address `gps_engagement`; a proposal is not a second
 * object but the engagement in `proposed` status, and `gps_proposal_issue` is the verb that
 * puts it there. Giving `proposal` its own palette subject type would produce a noun the
 * server cannot validate, and dropping the noun would hide the one word the founder
 * actually types when he is looking for a price he has already sent.
 *
 * `disclosure` AND `conflict_decision` also share a reach, for the same class of reason:
 * `GET /v1/gps/engagements/:id` returns the check WITH its verbatim
 * `disclosureTextUsed`, and the wall is the surface that reads both.
 */
export const GPS_NOUNS: readonly GpsNounDef[] = [
  {
    kind: 'client', label: 'Client', plural: 'Clients', code: 'gc',
    destination: 'go-ws-gps', subjectType: null,
    reach: { via: 'client_list', fn: 'fetchGpsClients' },
    aliases: ['counterparty', 'project', 'who we work for'],
  },
  {
    kind: 'engagement', label: 'Engagement', plural: 'Engagements', code: 'ge',
    destination: 'go-ws-gps', subjectType: GPS_ENGAGEMENT_SUBJECT,
    reach: { via: 'client_list', fn: 'fetchGpsEngagements' },
    aliases: ['mandate', 'job', 'piece of work'],
  },
  {
    kind: 'proposal', label: 'Proposal', plural: 'Proposals', code: 'gp',
    destination: 'go-ws-gps', subjectType: GPS_ENGAGEMENT_SUBJECT,
    reach: { via: 'client_list', fn: 'fetchGpsEngagements' },
    caveat: 'not an object of its own — an engagement in proposed status, addressed by the engagement id',
    aliases: ['issued', 'priced', 'sent'],
  },
  {
    kind: 'offer', label: 'Offer', plural: 'Offers', code: 'go',
    destination: 'go-gps-underwriting', subjectType: null,
    reach: {
      via: 'compiled_catalogue', symbol: 'OFFERS',
      notImported: 'the catalogue is reviewed code, and importing it here would put the GPS shared graph in the initial chunk',
    },
    caveat: 'the price bands are placeholders until the owner supplies real ones',
    caveatFlag: 'PRICE_BANDS_ARE_PLACEHOLDERS',
    aliases: ['catalogue', 'scope', 'service', 'sku'],
  },
  {
    kind: 'quote', label: 'Quote', plural: 'Quotes', code: 'gq',
    destination: 'go-gps-underwriting', subjectType: null,
    reach: {
      via: 'surface_route', fn: 'underwriteQuote',
      notEnumerable: 'an underwriting of one price you are still typing, not a list of quotes',
    },
    aliases: ['underwrite', 'price', 'margin', 'p(loss)'],
  },
  {
    kind: 'effort_triple', label: 'Effort triple', plural: 'Effort triples', code: 'get',
    destination: 'go-gps-underwriting', subjectType: null,
    reach: {
      via: 'surface_route', fn: 'underwriteQuote',
      notEnumerable: 'loaded server-side by offer and partner and echoed inside one underwriting run',
    },
    caveat: 'the triples are placeholders until the owner states real optimistic/likely/pessimistic days',
    caveatFlag: 'EFFORT_TRIPLES_ARE_PLACEHOLDERS',
    aliases: ['optimistic', 'likely', 'pessimistic', 'days', 'estimate'],
  },
  {
    kind: 'rate_card', label: 'Rate card', plural: 'Rate cards', code: 'grc',
    destination: 'go-gps-underwriting', subjectType: null,
    reach: {
      via: 'no_fetcher', missingFn: 'fetchGpsRateCards', serverRoute: null, routeLiteral: null,
      reason: 'gps_rate_card is what a named third party charges LCX, RLS deny-all, read only by the underwriting engine — no route serves it to a browser',
    },
    aliases: ['cost', 'partner rate', 'day rate'],
  },
  {
    kind: 'partner', label: 'Partner', plural: 'Partners', code: 'gpt',
    destination: 'go-gps-underwriting', subjectType: null,
    reach: {
      via: 'no_fetcher', missingFn: 'fetchGpsPartners', serverRoute: null, routeLiteral: null,
      reason: 'the partner roster is an owner input nobody has recorded yet, and no route lists partners',
    },
    aliases: ['vendor', 'who delivers', 'subcontractor'],
  },
  {
    kind: 'target', label: 'Target', plural: 'Targets', code: 'gt',
    destination: 'go-gps-origination', subjectType: null,
    reach: { via: 'client_list', fn: 'fetchOriginationQueue' },
    aliases: ['queue', 'prospect', 'who to call'],
  },
  {
    kind: 'outreach_opening', label: 'Outreach opening', plural: 'Outreach openings', code: 'gop',
    destination: 'go-gps-origination', subjectType: null,
    reach: {
      via: 'no_fetcher', missingFn: 'fetchTargetOpening',
      serverRoute: '/v1/gps/origination/:targetId/opening',
      routeLiteral: '/origination/:targetId/opening',
      reason: 'the API serves one per target, the brief payload does not carry it, and no browser fetcher calls it',
    },
    aliases: ['opening line', 'first message', 'approach'],
  },
  {
    kind: 'deliverable', label: 'Deliverable', plural: 'Deliverables', code: 'gdv',
    destination: 'go-gps-delivery', subjectType: null,
    reach: { via: 'per_parent', parent: 'engagement', fn: 'fetchGpsDelivery', parentParam: 'engagementId' },
    aliases: ['artifact', 'output', 'what we owe'],
  },
  {
    kind: 'milestone', label: 'Milestone', plural: 'Milestones', code: 'gms',
    destination: 'go-gps-delivery', subjectType: null,
    reach: { via: 'per_parent', parent: 'engagement', fn: 'fetchGpsDelivery', parentParam: 'engagementId' },
    aliases: ['plan', 'progress', 'stage'],
  },
  {
    kind: 'outcome', label: 'Outcome', plural: 'Outcomes', code: 'gou',
    destination: 'go-gps-loop', subjectType: null,
    reach: { via: 'per_parent', parent: 'engagement', fn: 'fetchGpsCaptureForm', parentParam: 'engagementId' },
    aliases: ['win', 'loss', 'realised margin', 'calibration'],
  },
  {
    kind: 'perimeter_position', label: 'Perimeter position', plural: 'Perimeter positions', code: 'gpm',
    destination: 'go-gps-conflict', subjectType: null,
    reach: {
      via: 'no_fetcher', missingFn: 'fetchGpsPerimeter',
      serverRoute: '/v1/gps/conflict/perimeter', routeLiteral: '/perimeter',
      reason: 'the API serves and gates the perimeter; no browser fetcher calls it, so the wall cannot show what the gate is refusing on',
    },
    aliases: ['mnpi', 'wall crossing', 'restricted'],
  },
  {
    kind: 'disclosure', label: 'Disclosure', plural: 'Disclosures', code: 'gdl',
    destination: 'go-gps-conflict', subjectType: null,
    reach: { via: 'per_parent', parent: 'engagement', fn: 'fetchGpsEngagementConflict' },
    caveat: 'the wording shown is the text stored on the check, verbatim — never a summary of it',
    aliases: ['disclosure text', 'wording', 'what we told them'],
  },
  {
    kind: 'conflict_decision', label: 'Conflict decision', plural: 'Conflict decisions', code: 'gcd',
    destination: 'go-gps-conflict', subjectType: null,
    reach: { via: 'per_parent', parent: 'engagement', fn: 'fetchGpsEngagementConflict' },
    caveat: 'no recorded decision is a MISSING check, not a clearance',
    aliases: ['cleared', 'declined', 'coi', 'conflict check'],
  },
  /*
   * ── THE FOUR NOUNS G2–G6 ADDED (G7) ────────────────────────────────────────
   * Each lives on a desk that ALREADY had a palette row, so none needed a new
   * destination — which is why they are here and `packet` is not: founder packets
   * live on `/gps/inputs`, which has no `Destination` and cannot get one without a
   * native-menu line in the desktop shell. That gap is written down rather than
   * papered over with a palette row that would navigate nowhere.
   *
   * All four are `no_fetcher`, which is precise rather than pessimistic: their panels
   * call `request()` inline instead of exporting a named fetcher from `lib/api/gps*`.
   * So each row takes the operator TO THE DESK and says so. The day someone writes
   * the fetcher, the ratchet in `gpsGrammar.test.ts` goes red and the noun is
   * upgraded to real instances.
   */
  {
    kind: 'dossier', label: 'Dossier', plural: 'Research dossiers', code: 'gds',
    destination: 'go-gps-origination', subjectType: null,
    reach: {
      via: 'no_fetcher',
      missingFn: 'fetchGpsDossiers',
      serverRoute: '/v1/gps/dossiers',
      routeLiteral: '/dossiers',
      reason: 'the drawer on the origination queue fetches them inline per target; no api module exports a list fetcher, so this row opens the desk rather than an instance',
    },
    caveat: 'a model draft, cited or refused — accepted by a named human before it counts',
    aliases: ['research', 'brief on a target', 'ai dossier'],
  },
  {
    kind: 'packet', label: 'Founder packet', plural: 'Founder packets', code: 'gpk',
    destination: 'go-gps-inputs', subjectType: null,
    reach: {
      via: 'no_fetcher',
      missingFn: 'fetchGpsPackets',
      serverRoute: '/v1/gps/packets',
      routeLiteral: '/packets',
      reason: 'the packet inbox on the input desk fetches inline; there is exactly one packet per kind, so a cross-packet list fetcher would enumerate six rows a single screen already shows',
    },
    caveat: 'system-proposed, owner-approved — the six numbers every price stands on; approval is what makes a number real',
    aliases: ['founder packet', 'approval packet', 'pricing policy packet', 'g0 packet'],
  },
  {
    kind: 'draft', label: 'Deliverable draft', plural: 'Deliverable drafts', code: 'gdf',
    destination: 'go-gps-delivery', subjectType: null,
    reach: {
      via: 'no_fetcher',
      missingFn: 'fetchGpsDrafts',
      serverRoute: '/v1/gps/factory',
      routeLiteral: '/factory',
      reason: 'the factory panel on the delivery desk fetches one engagement\u2019s version list inline; there is no cross-engagement draft list, and inventing one would imply a queue nobody works from',
    },
    caveat: 'refuses to generate while a required client input is missing (D10)',
    aliases: ['ai draft', 'first draft', 'qa queue', 'factory'],
  },
  {
    kind: 'portal_invite', label: 'Portal invite', plural: 'Portal invites', code: 'gpi',
    destination: 'go-gps-delivery', subjectType: null,
    reach: {
      via: 'no_fetcher',
      missingFn: 'fetchPortalSessions',
      serverRoute: '/v1/gps/portal-admin',
      routeLiteral: '/portal-admin',
      reason: 'the invite panel on the delivery desk lists the links for one engagement inline; a global list of live client credentials is deliberately not something this palette can produce',
    },
    caveat: 'the link is shown ONCE at minting — the server keeps only its digest',
    aliases: ['magic link', 'client link', 'invite the client', 'portal'],
  },
  {
    kind: 'invoice', label: 'Invoice', plural: 'Invoices', code: 'gin',
    destination: 'go-gps-book', subjectType: null,
    reach: {
      via: 'no_fetcher',
      missingFn: 'fetchGpsInvoices',
      serverRoute: '/v1/gps/invoices',
      routeLiteral: '/invoices',
      reason: 'the invoices panel under the book cash view fetches the register and its aging inline; no api module exports a fetcher, so this row opens the book rather than one numbered invoice',
    },
    caveat: 'exists only against an ACCEPTED deliverable — a bill tracing to no acceptance is inexpressible',
    aliases: ['bill', 'money owed', 'aging', 'chase'],
  },
] as const;

/* ── generated: pages and codes ───────────────────────────────────────────────── */

export const GPS_DESTINATIONS = destinationsUnder(GPS_PATH_PREFIX);

const DESTINATION_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

/** The surface a noun lives on, or undefined if the table names one that is gone. */
export function destinationForNoun(def: GpsNounDef): Destination | undefined {
  return DESTINATION_BY_ID.get(def.destination);
}

/**
 * 'GPS · THE BOOK' → 'GPS · The Book'. The menu shouts; a shouting ⌘K row reads as an
 * error state beside 34 sentence-case ones.
 *
 * `KEEP_UPPER` exists because the naive title-caser turns the compartment's own name into
 * 'Gps', which is not what it is called anywhere — in the menu, in the plan, or out loud.
 * A set of one is honest about the scope of the exception; a cleverer rule (preserve short
 * uppercase tokens) would also preserve 'THE'.
 */
const KEEP_UPPER = new Set(['GPS']);

function titleCaseDestination(label: string): string {
  return label
    .split(' ')
    .map((w) => (w === '·' || KEEP_UPPER.has(w) ? w : w[0]! + w.slice(1).toLowerCase()))
    .join(' ');
}

/**
 * The desks that host no noun, with the reason — the mirror of marketing's "every desk
 * hosts at least one noun" assertion, pointed the way GPS actually is.
 *
 * THE BOOK IS NOT A PLACE A NOUN LIVES. It re-bases the engagement portfolio on margin or
 * on price (`fetchGpsBook(basis)`); every row in it is an engagement, already a noun with
 * its own code and its own surface. Inventing a `book_row` noun to satisfy a copied
 * assertion would put a word in the operator's palette that means nothing at the desk.
 * The test requires this list to be EXACTLY the nounless desks, so a seventh desk arriving
 * with nothing on it fails here until someone either gives it a noun or writes down why.
 *
 * DECLARED ABOVE THE GENERATOR THAT READS IT, not below: `GPS_PALETTE_PAGES` is evaluated
 * at module load, and a `const` referenced before its initialiser is a ReferenceError at
 * import time — which in a palette means the whole command line fails to mount.
 */
export const GPS_DESKS_WITHOUT_NOUN: readonly { destination: string; because: string }[] = [
  /*
   * EMPTY SINCE G7, AND THAT IS A REAL CHANGE RATHER THAN A RELAXED TEST.
   *
   * `go-gps-book` was the single entry: every row in the book was an engagement
   * re-based on margin or price, so the desk hosted no noun of its own. G6 put the
   * invoice register under the cash view, and an invoice IS its own object — its own
   * number, its own lifecycle, its own aging. The book hosts a noun now, so this list
   * is empty and the test reads it as "every desk hosts at least one noun".
   *
   * The list stays: the assertion it feeds is that this is EXACTLY the set of nounless
   * desks, so the next desk shipped with nothing on it fails here until someone either
   * gives it a noun or writes down why it has none.
   */
];

/**
 * ⌘K page rows, one per GPS destination, GENERATED.
 *
 * The sublabel is the nouns that live there rather than a written description, so a new
 * noun changes the row's own description and there is no second sentence to update. A desk
 * with no noun on it gets the reason from `GPS_DESKS_WITHOUT_NOUN` instead of an empty
 * string, because a blank sublabel reads as a row that failed to load.
 */
export const GPS_PALETTE_PAGES: readonly PaletteRow[] = GPS_DESTINATIONS.map((d) => {
  const nouns = GPS_NOUNS.filter((n) => n.destination === d.id);
  const noNoun = GPS_DESKS_WITHOUT_NOUN.find((x) => x.destination === d.id);
  return {
    id: `dest-${d.id}`,
    label: titleCaseDestination(d.label),
    sublabel: nouns.length > 0 ? nouns.map((n) => n.plural).join(' · ') : (noNoun?.because ?? ''),
    to: d.path,
    type: 'page' as const,
  };
});

/**
 * Bloomberg-style codes, GENERATED from the noun table.
 *
 * NO QUERY STRING IS EVER APPENDED. Marketing's generator deep-links to a desk tab because
 * its desk reads one; no GPS surface reads any param except `engagementId` on delivery and
 * the loop, and a code carries no engagement. See `GPS_SURFACES_WITHOUT_SELECTION`.
 */
export const GPS_PALETTE_CODES: readonly PaletteCode[] = GPS_NOUNS.flatMap((n) => {
  const dest = destinationForNoun(n);
  if (!dest) return [];
  return [{ code: n.code, to: dest.path, label: n.plural }];
});

/**
 * Surfaces that cannot be pointed at an instance, because they read no query parameter.
 *
 * Recorded rather than worked around. `GpsDelivery` and `GpsLoop` read `engagementId`;
 * `Gps`, `GpsBook`, `GpsOrigination`, `GpsUnderwriting` and `GpsConflict` call
 * `useSearchParams` nowhere at all, so `?engagement=…` on any of them is a string the
 * router carries and the page ignores. The test greps each page's source, which means the
 * day one of them starts reading a param this list goes red and the palette gains a real
 * deep link instead of a plausible-looking one.
 */
export const GPS_SURFACES_WITHOUT_SELECTION: readonly { page: string; destination: string }[] = [
  { page: 'Gps.tsx', destination: 'go-ws-gps' },
  { page: 'GpsBook.tsx', destination: 'go-gps-book' },
  { page: 'GpsOrigination.tsx', destination: 'go-gps-origination' },
  { page: 'GpsUnderwriting.tsx', destination: 'go-gps-underwriting' },
  { page: 'GpsConflict.tsx', destination: 'go-gps-conflict' },
  { page: 'GpsInputs.tsx', destination: 'go-gps-inputs' },
];

/* ── generated: verbs, and why one is unavailable ──────────────────────────────── */

/**
 * The governed actions the manifest declares for this compartment.
 *
 * A FILTER, NOT A LIST. `ACTION_MANIFEST` is generated from `apps/api/src/actions/registry.ts`
 * — into which `GPS_ACTIONS` (`apps/api/src/gps/actions.ts`) is merged by a loop that
 * refuses at import time on an id collision — so a sixth GPS write path appears in the
 * palette with no edit here, and a renamed one disappears from it. There is no GPS action
 * id written anywhere in this file; the test reads this source and fails if one appears,
 * and separately compares these ids to the ones the API module declares.
 */
export const GPS_GOVERNED_ACTIONS: readonly ManifestAction[] =
  ACTION_MANIFEST.actions.filter((a) => a.workspace === GPS_WORKSPACE);

/** The verbs a GPS noun can carry, by its registry subject type. */
export function gpsVerbsForNoun(def: GpsNounDef): readonly ManifestAction[] {
  if (!def.subjectType) return [];
  const type = def.subjectType;
  return GPS_GOVERNED_ACTIONS.filter((a) => a.subjectTypes.includes(type));
}

/**
 * Subject types the manifest addresses in this compartment that no noun above claims.
 *
 * The reachability question, pointed the direction that actually breaks: a governed action
 * whose subject has no palette noun is a verb an operator cannot aim.
 */
export function gpsSubjectsWithoutNoun(): readonly string[] {
  const claimed = new Set(GPS_NOUNS.map((n) => n.subjectType).filter(Boolean));
  return [
    ...new Set(
      GPS_GOVERNED_ACTIONS.flatMap((a) => a.subjectTypes).filter((t) => t !== '*' && !claimed.has(t)),
    ),
  ].sort();
}

/**
 * A verb offered to a member who may not invoke it, said in sentences.
 *
 * Shape mirrors `components/gps/artifactRefusal.ts`'s `RefusalSentence` — what happened,
 * what to do, and the machine code kept separate and small — because that is the house
 * form for a GPS refusal and an operator should not have to learn a second one at the
 * command line.
 */
export interface GpsVerbRefusal {
  /** What is true, as an operator would say it. */
  headline: string;
  /** What to do about it. Never "contact your administrator". */
  next: string;
  /** The rule this rests on, cited so the sentence can be checked rather than believed. */
  rule: string;
  /** `verbsFor`'s own discriminator, for a bug report. Not for reading. */
  code: 'role' | 'entitlement';
}

export interface GpsVerbOffer {
  readonly action: ManifestAction;
  /** Null when this member may invoke it now. */
  readonly refusal: GpsVerbRefusal | null;
  /**
   * What the SERVER still checks after the palette is satisfied, verbatim from the
   * registry's own description. `gps_proposal_issue` is conflict-gated and perimeter-gated
   * and refuses a below-band price without a prior approval; none of that is visible in a
   * role or an entitlement, and a palette that only reported the two it can see would
   * teach the operator that a green verb means a successful invoke.
   */
  readonly serverStillChecks: string;
}

/**
 * Turn `verbsFor`'s blocked reason into a sentence. ONE PLACE DECIDES, THIS ONE TRANSLATES.
 *
 * `components/command/grammar.ts` is the single authority on whether a verb is blocked, and
 * it is not this lane's file — so nothing here re-implements `capAtLeast`, re-reads an
 * entitlement, or adds a condition of its own. If it did, GPS would have a second opinion
 * about permission, and the two would disagree the first time either changed.
 *
 * WHAT THE SENTENCES SAY THAT THE CODE CANNOT. `{ kind: 'entitlement', workspace: 'gps',
 * needed: 'operate', held: 'none' }` is accurate and tells an operator nothing: `gps` is
 * `legacy: false` and `machineAccess: false` in `packages/shared/src/workspaces.ts`, which
 * means holding a desk role grants NOTHING here and no shared machine key can stand in —
 * the grant has to be issued to a named person. "Ask an approver for operate on GLOBAL
 * SERVICES" is the action; the compartment being default-deny is the reason it is needed.
 */
function refusalSentence(action: ManifestAction, blocked: NonNullable<Verb['blocked']>): GpsVerbRefusal {
  if (blocked.kind === 'role') {
    return {
      headline: `${action.label} is an approver's decision, and this session is signed in as an operator.`,
      next: 'Ask an approver to run it, or have your role raised first — the server refuses it either way, so there is nothing to retry here.',
      rule: `ACTION_REGISTRY['${GPS_WORKSPACE}'…].minRole = 'approver', enforced again in invokeAction`,
      code: 'role',
    };
  }
  const held = blocked.held === 'none' ? 'no capability at all' : `only '${blocked.held}'`;
  return {
    headline: `You hold ${held} on GLOBAL SERVICES, and ${action.label.toLowerCase()} needs '${blocked.needed}'.`,
    next: `Ask an approver for '${blocked.needed}' on GLOBAL SERVICES. This compartment holds a third party's commercial terms, so no desk role and no shared machine key grants it — it is issued to a named person or not at all.`,
    rule: `workspace entitlement on '${blocked.workspace}' (WORKSPACES: legacy false, machineAccess false — default-deny)`,
    code: 'entitlement',
  };
}

/**
 * Every GPS verb this member could aim at an engagement, blocked ones INCLUDED.
 *
 * Blocked-and-explained rather than absent, which is the compartment's whole posture: two
 * of the five actions are approver-only and the compartment is default-deny, so on a
 * plain operator's session the silent-filter version of this menu is EMPTY — and an empty
 * menu teaches an operator that GLOBAL SERVICES has no verbs rather than that he has no
 * grant. `verbsFor` already returns the blocked ones with their reason; all this adds is
 * the sentence.
 *
 * THE NOUN IS A PROBE, and the answer is honest about it. Role and entitlement do not
 * depend on which engagement is in front of you, so an id-less noun answers those two
 * exactly. Everything that DOES depend on the instance travels in `serverStillChecks`
 * instead of being silently assumed satisfied.
 */
export function gpsVerbOffers(principal: Principal): readonly GpsVerbOffer[] {
  const probe = { type: GPS_ENGAGEMENT_SUBJECT, id: '', label: 'an engagement' };
  return verbsFor(ACTION_MANIFEST, probe, principal)
    .filter((v) => v.action.workspace === GPS_WORKSPACE)
    .map((v) => ({
      action: v.action,
      refusal: v.blocked ? refusalSentence(v.action, v.blocked) : null,
      serverStillChecks: v.action.description,
    }));
}

/** The capability each GPS verb needs, for a caller rendering the request-access path. */
export function gpsVerbCapability(action: ManifestAction): 'operate' | 'approve' {
  return neededCapability(action) === 'approve' ? 'approve' : 'operate';
}

/* ── what the palette cannot do, reported rather than narrated ─────────────────── */

/** Nouns nothing fetches yet, with the function that would and why it is absent. */
export function gpsNounsWithoutFetcher(): readonly {
  kind: GpsNounKind; missingFn: string; serverRoute: string | null; reason: string;
}[] {
  return GPS_NOUNS.flatMap((n) =>
    n.reach.via === 'no_fetcher'
      ? [{ kind: n.kind, missingFn: n.reach.missingFn, serverRoute: n.reach.serverRoute, reason: n.reach.reason }]
      : [],
  );
}

/** Nouns whose route is mounted and which still cannot be enumerated, with the reason. */
export function gpsNounsWithRouteNotEnumerable(): readonly {
  kind: GpsNounKind; fn: string; notEnumerable: string;
}[] {
  return GPS_NOUNS.flatMap((n) =>
    n.reach.via === 'surface_route' ? [{ kind: n.kind, fn: n.reach.fn, notEnumerable: n.reach.notEnumerable }] : [],
  );
}

/** Nouns that live in compiled code, with the symbol and why it is not imported here. */
export function gpsNounsFromCompiledCatalogue(): readonly {
  kind: GpsNounKind; symbol: string; notImported: string;
}[] {
  return GPS_NOUNS.flatMap((n) =>
    n.reach.via === 'compiled_catalogue'
      ? [{ kind: n.kind, symbol: n.reach.symbol, notImported: n.reach.notImported }]
      : [],
  );
}

/* ── query → rows ─────────────────────────────────────────────────────────────── */

function matchesQuery(def: GpsNounDef, q: string): boolean {
  const haystack = [def.label, def.plural, def.kind.replace(/_/g, ' '), ...(def.aliases ?? [])];
  return haystack.some((h) => h.toLowerCase().includes(q));
}

/**
 * What the row says about itself, DERIVED FROM `reach`, so it cannot claim more than the
 * compartment can do. Every branch is a different sentence because every branch is a
 * different problem for the operator standing in front of it.
 */
function stateSentence(n: GpsNounDef): string {
  switch (n.reach.via) {
    case 'server_search': {
      const verbs = gpsVerbsForNoun(n).length;
      return `${verbs} governed verb${verbs === 1 ? '' : 's'} · search it to act`;
    }
    case 'client_list':
      return 'listed on the desk';
    case 'per_parent':
      return n.reach.parentParam
        ? `listed under one ${n.reach.parent.replace(/_/g, ' ')} · the desk takes ?${n.reach.parentParam}`
        : `listed under one ${n.reach.parent.replace(/_/g, ' ')} · open it from there`;
    case 'compiled_catalogue':
      return `${n.reach.symbol} is compiled policy · not enumerated here, ${n.reach.notImported}`;
    case 'surface_route':
      return `${n.reach.fn} is mounted · ${n.reach.notEnumerable}`;
    case 'no_fetcher':
      return n.reach.serverRoute
        ? `nothing fetches it: ${n.reach.serverRoute} is served, ${n.reach.missingFn} does not exist · ${n.reach.reason}`
        : `nothing fetches it (${n.reach.missingFn} does not exist) · ${n.reach.reason}`;
  }
}

/**
 * Noun-KIND rows: "you asked about milestones, milestones live here".
 *
 * Synchronous and I/O-free on purpose. Eleven of the sixteen nouns have nothing a palette
 * query can enumerate, and firing eleven requests to discover that would be slower and no
 * more truthful. The row states which noun, where it lives, and what it cannot do; the
 * surface states the rest, which is the only place that can.
 */
export function searchGpsNouns(query: string): readonly PaletteRow[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return GPS_NOUNS.filter((n) => matchesQuery(n, q)).flatMap((n) => {
    const dest = destinationForNoun(n);
    if (!dest) return [];
    return [{
      id: `gps-noun-${n.kind}`,
      label: n.plural,
      sublabel: [titleCaseDestination(dest.label), stateSentence(n), n.caveat]
        .filter(Boolean)
        .join(' · '),
      to: dest.path,
      type: 'page' as const,
    }];
  });
}

/**
 * Engagement INSTANCES — the noun that carries every governed verb in the compartment.
 *
 * `GET /v1/gps/engagements` is the list the desk already reads, so this adds no route and
 * no new claim. The rows navigate to the desk; they do NOT append `?engagement=…`, because
 * `pages/Gps.tsx` calls `useSearchParams` nowhere and a param it ignores is a row that
 * lies about what pressing Enter will do (`GPS_SURFACES_WITHOUT_SELECTION`).
 *
 * WHAT THE SUBLABEL LEADS WITH IS THE MISSING CONFLICT CHECK, not the price. A proposal
 * issued without a recorded check is the failure this compartment was built to make
 * visible, and `GpsEngagementRow.conflict` is `null` exactly then — so the palette says
 * MISSING rather than omitting the field, in the same words the wall uses. Absence of a
 * decision is not a clearance.
 *
 * MONEY IS NOT FORMATTED HERE. `priceCents` is an integer in the engagement's own currency
 * and `formatMoney` lives on the surfaces; a palette row that printed a bare cents figure
 * would read as dollars off by a hundred, so the row carries the offer and the status —
 * which is what an operator is searching by — and leaves the number to the desk.
 *
 * The caller gates this on holding `gps`, so a member without the compartment never causes
 * the request. That is honesty, not security — the route checks too, and `gps` is
 * default-deny.
 */
export async function searchGpsEngagements(
  query: string,
  signal?: AbortSignal,
): Promise<readonly PaletteRow[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const noun = GPS_NOUNS.find((n) => n.kind === 'engagement')!;
  const dest = destinationForNoun(noun);
  if (!dest) return [];
  const rows = await fetchGpsEngagements();
  if (signal?.aborted) return [];
  return rows
    .filter((r) => [r.clientName, r.offerKey, r.status, r.id].filter(Boolean).join(' ').toLowerCase().includes(q))
    .slice(0, 5)
    .map((r) => ({
      id: `gps-engagement-${r.id}`,
      label: r.clientName || `Engagement ${r.id}`,
      sublabel: [
        noun.label,
        r.conflict ? `conflict ${r.conflict.decision}` : 'CONFLICT CHECK MISSING',
        r.offerKey,
        r.status,
      ].join(' · '),
      to: dest.path,
      type: 'page' as const,
    }));
}
