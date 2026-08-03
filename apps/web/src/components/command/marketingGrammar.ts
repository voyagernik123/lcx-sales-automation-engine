/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  LCX MARKETING'S HALF OF THE COMMAND LINE — M9, the grammar
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT WAS WRONG. Three waves built the compartment and every one of them stopped at
 * the route table. `lib/destinations.ts` gained the three surfaces, so `g y` / `g r` /
 * `g m` work and the native menu lists them — but ⌘K, which is the surface an operator
 * actually uses, knew nothing about marketing at all. `PAGE_COMMANDS` in CommandBody is
 * a hand-listed literal of 34 rows written before the seventh compartment existed, and
 * a hand-listed table is exactly the artefact that cannot be kept current: nobody
 * remembers to append to it, and forgetting fails silently as a page you can only reach
 * if you already know the chord.
 *
 * So nothing here is hand-listed against CommandBody. Page rows and command codes are
 * GENERATED — page rows from `DESTINATIONS`, verbs from the generated action manifest,
 * codes from the noun table below. `__tests__/marketingGrammar.test.ts` reads
 * CommandBody's source and fails if a marketing path or code appears in it literally,
 * because the moment one does, this file has stopped being the single place.
 *
 * GPS IS THE SAME DEFECT AND IS DELIBERATELY NOT FIXED HERE. None of `/gps`, `/gps/book`
 * … `/gps/loop` is in `PAGE_COMMANDS` either — seven desks reachable by chord and absent
 * from ⌘K. Fixing that means editing the GPS lane, so it is recorded (see
 * `PALETTE_PAGE_GAP_NOT_OURS`) and left. The generator below is deliberately written
 * against a path prefix rather than special-cased to marketing, so whoever owns GPS can
 * reuse it by passing '/gps'.
 *
 * ── THE TWO OWNER CONSTRAINTS, RESTATED WHERE THE VERBS ARE ────────────────────
 *
 * There is no X API credential and nothing in this compartment may act as the LCX
 * account. A command palette is the highest-leverage place to breach that, because it is
 * one Enter away from every verb in the system, so the invariant is asserted rather than
 * intended: `PUBLISHING_VERB` below is checked against every generated row and every
 * governed marketing action, and the test fails on a match. The absence is the guarantee
 * — there is no publish action in the manifest to hide, and this makes it impossible for
 * one to arrive unnoticed through the palette.
 *
 * `notify` ("Send notification", workspace `null`, subjectTypes `*`) IS offered on a
 * marketing noun and is NOT a breach: it raises an in-app notification on the subject.
 * It is scoped out of the assertion by workspace rather than by name, since a name-based
 * exception is the kind that quietly grows.
 */

import { DESTINATIONS, type Destination } from '@/lib/destinations';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import type { ManifestAction } from '@/lib/command/types';
import { MARKETING_CONTRACTS_OWED, fetchMarketingQueue } from '@/lib/api/marketing';

/** The compartment id, as `ACTION_REGISTRY.workspace` and `entitlements` spell it. */
export const MARKETING_WORKSPACE = 'marketing';

/** Every marketing route begins here. The generator's only input besides DESTINATIONS. */
export const MARKETING_PATH_PREFIX = '/marketing';

/**
 * Recorded, not fixed. See the header: these are reachable by `g` chord and by the
 * native menu, and absent from ⌘K, and they are not this lane's files.
 */
export const PALETTE_PAGE_GAP_NOT_OURS: readonly string[] = [
  '/gps and the six desks under it (GPS Phases 6-12) have no ⌘K page row',
] as const;

/* ── the noun table ───────────────────────────────────────────────────────────── */

/**
 * The nouns this compartment has. NOT a taxonomy invented here: each one is a thing the
 * plan names and a surface renders, and `subjectType` is the *registry's* word for it or
 * `null` — never a plausible-looking guess, because a guessed subject type produces a
 * verb menu that is empty for a reason nobody can find.
 */
export type MarketingNounKind =
  | 'reply'
  | 'draft'
  | 'claim'
  | 'embargo'
  | 'holding'
  | 'crisis_statement'
  | 'precedent'
  | 'record_bundle';

/**
 * How the palette can put an INSTANCE of this noun in front of the operator TODAY.
 *
 * This is the honesty ceiling in a type. Twenty of twenty-one marketing routes do not
 * exist yet (`MARKETING_CONTRACTS_OWED`), so for most of these nouns there is nothing to
 * enumerate and the palette must say "here is the surface" rather than invent rows. The
 * variants are ordered by how much of the noun is really reachable:
 *
 *  server_search  /v1/search emits a group for it, so instances are real nouns and the
 *                 verb stage works. Only `marketing_asset` qualifies.
 *  client_list    a mounted list route this palette can call itself. Real instances,
 *                 but they navigate to their surface rather than to a verb, because the
 *                 registry addresses no subject type for them.
 *  per_parent     listable only under a parent instance (drafts hang off a reply), so a
 *                 palette query cannot enumerate them at all.
 *  surface_only   the list route is OWED. `owedFn` must name a row in
 *                 `MARKETING_CONTRACTS_OWED`, and the test enforces that — so when the
 *                 route lands and drops out of the ledger, this file goes red and the
 *                 palette gets upgraded instead of quietly staying a nav shortcut.
 *  surface_route  the route IS mounted and contracted, and the palette still cannot
 *                 enumerate instances — because the route is not an enumeration.
 *                 `notEnumerable` says which, in the row itself.
 *
 * ══ WHY `surface_route` HAD TO EXIST ══
 * Three nouns said `surface_only` naming `fetchCrisisStatements`, `fetchPrecedent` and
 * `fetchExportBundle`. All three routes then landed and left `MARKETING_CONTRACTS_OWED`,
 * and the ratchet above did exactly its job: it went red rather than letting the palette
 * keep telling an operator "no list route yet" about three routes that exist. The wrong fix
 * would have been to drop `surface_only` and claim `client_list`, which would assert the
 * palette can list crisis statements, precedents and record bundles — and it cannot. None of
 * the three is a list: the crisis library is versioned text in code with no instances to
 * enumerate, `GET /precedent` answers a QUESTION and has no meaning without one, and
 * `GET /export/:itemId` needs a record uid. So the third state is "mounted, and still not
 * enumerable", with the reason on the row.
 */
export type MarketingNounReach =
  | { readonly via: 'server_search'; readonly group: string }
  | { readonly via: 'client_list'; readonly fn: string }
  | { readonly via: 'per_parent'; readonly parent: MarketingNounKind; readonly fn: string }
  | { readonly via: 'surface_only'; readonly owedFn: string }
  | {
      readonly via: 'surface_route';
      /** The client fetcher. Must NOT be in `MARKETING_CONTRACTS_OWED` — the debt is paid. */
      readonly fn: string;
      /** Why a palette query cannot enumerate instances from it. Shown on the row. */
      readonly notEnumerable: string;
    };

export interface MarketingNounDef {
  readonly kind: MarketingNounKind;
  /** Singular, for the type chip. */
  readonly label: string;
  /** Plural, for the row that takes you to where they live. */
  readonly plural: string;
  /** Bloomberg-style code: type it, hit Enter, you are there. Unique palette-wide. */
  readonly code: string;
  /** The `Destination.id` whose surface renders this noun. Must exist in DESTINATIONS. */
  readonly destination: Destination['id'];
  /** Query params that focus that surface on this noun, e.g. the desk tab. */
  readonly deepLink?: Readonly<Record<string, string>>;
  /** The param an instance row sets, when instances are reachable. */
  readonly instanceParam?: string;
  /** The ACTION_REGISTRY subject type governed writes address, or null when none does. */
  readonly subjectType: string | null;
  readonly reach: MarketingNounReach;
  /** Words an operator might type that are not in the label. */
  readonly aliases?: readonly string[];
}

/**
 * EMBARGO AND HOLDING SHARE ONE SUBJECT TYPE, and that is not a mistake to tidy up.
 * `marketing_embargo_enter`, `marketing_embargo_lift` and `marketing_holdings_declare`
 * all address `marketing_asset` — the subject is the asset symbol, and an embargo and a
 * declared position are two opinions about the same symbol. Splitting them into two
 * palette subject types would produce a noun the server cannot validate.
 *
 * `claim` OVERLAPS THE PLATFORM'S OWN `claim` OBJECT TYPE (`lib/objectRegistry.ts`,
 * `/claim-library`) and is a different thing: that one is an approved outreach line for
 * sales, this one is a factual assertion inside a marketing draft that `checkClaimSafety`
 * refuses or clears. Same English word, two compartments. The code (`mc`) and the surface
 * keep them apart in the palette; nothing here touches the sales claim.
 */
export const MARKETING_NOUNS: readonly MarketingNounDef[] = [
  {
    kind: 'reply', label: 'Inbound reply', plural: 'Inbound replies', code: 'mr',
    destination: 'go-marketing-desk', deepLink: { tab: 'triage' }, instanceParam: 'reply',
    subjectType: null,
    reach: { via: 'client_list', fn: 'fetchMarketingQueue' },
    aliases: ['mention', 'inbound', 'queue', 'triage'],
  },
  {
    kind: 'draft', label: 'Draft reply', plural: 'Draft replies', code: 'md',
    destination: 'go-marketing-desk', deepLink: { tab: 'drafting' },
    subjectType: null,
    reach: { via: 'per_parent', parent: 'reply', fn: 'fetchDrafts' },
    aliases: ['drafting', 'wording'],
  },
  {
    kind: 'claim', label: 'Marketing claim', plural: 'Marketing claims', code: 'mc',
    destination: 'go-marketing-desk', deepLink: { tab: 'drafting' },
    subjectType: null,
    reach: {
      via: 'surface_route', fn: 'checkClaimSafety',
      notEnumerable: 'a verdict on one piece of text, not a list of claims',
    },
    aliases: ['claim safety', 'refusal'],
  },
  {
    kind: 'embargo', label: 'Asset embargo', plural: 'Asset embargoes', code: 'me',
    destination: 'go-marketing-desk', deepLink: { tab: 'measurement' },
    subjectType: 'marketing_asset',
    reach: { via: 'server_search', group: 'marketing_assets' },
    aliases: ['perimeter', 'mnpi', 'embargo'],
  },
  {
    kind: 'holding', label: 'Declared holding', plural: 'Declared holdings', code: 'mh',
    destination: 'go-marketing-desk', deepLink: { tab: 'measurement' },
    subjectType: 'marketing_asset',
    reach: { via: 'server_search', group: 'marketing_assets' },
    aliases: ['position', 'disclosure', 'holdings'],
  },
  {
    kind: 'crisis_statement', label: 'Crisis statement', plural: 'Crisis statements', code: 'mx',
    destination: 'go-marketing-crisis',
    subjectType: null,
    reach: {
      via: 'surface_route', fn: 'fetchCrisisStatements',
      notEnumerable: 'a versioned library, not a query',
    },
    aliases: ['crisis', 'holding statement', 'clearance'],
  },
  {
    kind: 'precedent', label: 'Precedent', plural: 'Precedent', code: 'mp',
    destination: 'go-marketing-desk', deepLink: { tab: 'precedent' },
    subjectType: null,
    reach: {
      via: 'surface_route', fn: 'fetchPrecedent',
      notEnumerable: 'answers a question — there is nothing to list',
    },
    aliases: ['what we said before', 'prior'],
  },
  {
    kind: 'record_bundle', label: 'Disclosure record', plural: 'Disclosure records', code: 'mb',
    destination: 'go-marketing-record',
    subjectType: null,
    reach: {
      via: 'surface_route', fn: 'fetchExportBundle',
      notEnumerable: 'produced per record uid',
    },
    aliases: ['record', 'art 8', 'produce on demand', 'export'],
  },
] as const;

/* ── generated: pages, codes, verbs ───────────────────────────────────────────── */

/**
 * The subset of a ⌘K row this file is allowed to produce.
 *
 * Structural rather than imported from CommandBody: the palette owns its own row type
 * and importing it back would make the generator depend on the thing it generates for.
 */
export interface PaletteRow {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly to: string;
  readonly type: 'page';
}

export interface PaletteCode {
  readonly code: string;
  readonly to: string;
  readonly label: string;
}

/** Every destination inside a compartment, by path prefix. Not marketing-specific. */
export function destinationsUnder(prefix: string): readonly Destination[] {
  return DESTINATIONS.filter((d) => d.path === prefix || d.path.startsWith(`${prefix}/`));
}

export const MARKETING_DESTINATIONS = destinationsUnder(MARKETING_PATH_PREFIX);

function withParams(path: string, params?: Readonly<Record<string, string>>): string {
  if (!params) return path;
  const qs = new URLSearchParams(params).toString();
  return qs ? `${path}?${qs}` : path;
}

const DESTINATION_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

/** The surface a noun lives on, or undefined if the registry names one that is gone. */
export function destinationForNoun(def: MarketingNounDef): Destination | undefined {
  return DESTINATION_BY_ID.get(def.destination);
}

/**
 * ⌘K page rows for the compartment, one per destination, GENERATED.
 *
 * The sublabel is the nouns that live there rather than a written description, so a new
 * noun changes the row's own description and there is no second sentence to update. The
 * compartment root gets the door's sentence: it renders the desk, and saying so twice
 * would make ⌘K look like it has two desks.
 */
export const MARKETING_PALETTE_PAGES: readonly PaletteRow[] = MARKETING_DESTINATIONS.map((d) => {
  const nouns = MARKETING_NOUNS.filter((n) => n.destination === d.id);
  const sublabel = d.withinWorkspace
    ? nouns.map((n) => n.plural).join(' · ')
    // Not "no publish path behind it", which is what this said first: the invariant below
    // scans row sublabels, and it caught its own prose. Rewording is the right fix rather
    // than exempting descriptions — a row that DESCRIBES publishing is a row an operator
    // reads as offering it, and the exemption would have been the hole.
    : 'The compartment door — nothing behind it can act as the LCX account';
  return {
    id: `dest-${d.id}`,
    // 'MARKETING · THE DESK' is the menu's voice; ⌘K rows are sentence case elsewhere in
    // the list, and a shouting row reads as an error state.
    label: titleCaseDestination(d.label),
    sublabel,
    to: d.path,
    type: 'page' as const,
  };
});

/** 'MARKETING · CRISIS ROOM' → 'Marketing · Crisis Room'. */
function titleCaseDestination(label: string): string {
  return label
    .split(' ')
    .map((w) => (w === '·' ? w : w[0]! + w.slice(1).toLowerCase()))
    .join(' ');
}

/** Bloomberg-style codes, GENERATED from the noun table. */
export const MARKETING_PALETTE_CODES: readonly PaletteCode[] = MARKETING_NOUNS.flatMap((n) => {
  const dest = destinationForNoun(n);
  if (!dest) return [];
  return [{ code: n.code, to: withParams(dest.path, n.deepLink), label: n.plural }];
});

/** The governed actions the manifest declares for this compartment. */
export const MARKETING_GOVERNED_ACTIONS: readonly ManifestAction[] =
  ACTION_MANIFEST.actions.filter((a) => a.workspace === MARKETING_WORKSPACE);

/** The verbs a marketing noun can carry, by its registry subject type. */
export function marketingVerbsForNoun(def: MarketingNounDef): readonly ManifestAction[] {
  if (!def.subjectType) return [];
  const type = def.subjectType;
  return MARKETING_GOVERNED_ACTIONS.filter((a) => a.subjectTypes.includes(type));
}

/**
 * Subject types the manifest addresses in this compartment that no noun above claims.
 *
 * The reachability question, pointed the direction that actually breaks: a governed
 * action whose subject has no palette noun is a verb an operator cannot aim.
 */
export function marketingSubjectsWithoutNoun(): readonly string[] {
  const claimed = new Set(MARKETING_NOUNS.map((n) => n.subjectType).filter(Boolean));
  return [
    ...new Set(
      MARKETING_GOVERNED_ACTIONS.flatMap((a) => a.subjectTypes).filter(
        (t) => t !== '*' && !claimed.has(t),
      ),
    ),
  ].sort();
}

/** Nouns whose instances cannot be enumerated yet, with the route each is waiting on. */
export function marketingNounsAwaitingRoute(): readonly { kind: MarketingNounKind; owedFn: string }[] {
  return MARKETING_NOUNS.flatMap((n) =>
    n.reach.via === 'surface_only' ? [{ kind: n.kind, owedFn: n.reach.owedFn }] : [],
  );
}

/**
 * Nouns whose route IS mounted and which still cannot be enumerated here, with the reason.
 *
 * The mirror of the function above, and it needs its own ratchet for the opposite drift:
 * marking a noun `surface_route` while its fetcher is still in `MARKETING_CONTRACTS_OWED`
 * would claim a paid debt and delete the "no list route yet" warning an operator relies on.
 */
export function marketingNounsWithRouteNotEnumerable(): readonly {
  kind: MarketingNounKind; fn: string; notEnumerable: string;
}[] {
  return MARKETING_NOUNS.flatMap((n) =>
    n.reach.via === 'surface_route'
      ? [{ kind: n.kind, fn: n.reach.fn, notEnumerable: n.reach.notEnumerable }]
      : [],
  );
}

/** The owed-route ledger, as this file needs to read it. */
export const OWED_ROUTE_FNS: readonly string[] = MARKETING_CONTRACTS_OWED.map((c) => c.fn);

/* ── the invariant ────────────────────────────────────────────────────────────── */

/**
 * A verb that would speak for LCX. There is none, and this is how it stays that way.
 *
 * Word-bounded so 'Disclosure records' and 'recordPublicationCloseOut' do not trip it —
 * recording that a human published by hand is the opposite of publishing.
 */
export const PUBLISHING_VERB =
  /(?<![a-z])(publish|publishes|publishing|post|posts|posted|posting|send|sends|sending|schedule|schedules|tweet|tweets|autopost)(?![a-z])/i;

/**
 * Everything the palette would put in front of an operator for this compartment, as one
 * flat list of strings, for the invariant to be checked against. Rows AND verbs: a
 * publish button and a `marketing_publish` action are the same breach by different doors.
 */
export function marketingPaletteVocabulary(): readonly string[] {
  return [
    ...MARKETING_PALETTE_PAGES.flatMap((r) => [r.label, r.sublabel, r.to]),
    ...MARKETING_PALETTE_CODES.flatMap((c) => [c.code, c.label, c.to]),
    ...MARKETING_GOVERNED_ACTIONS.flatMap((a) => [a.id, a.label, a.description ?? '']),
    ...MARKETING_NOUNS.flatMap((n) => [n.label, n.plural, ...(n.aliases ?? [])]),
  ];
}

/* ── query → rows ─────────────────────────────────────────────────────────────── */

function matchesQuery(def: MarketingNounDef, q: string): boolean {
  const haystack = [def.label, def.plural, def.kind.replace(/_/g, ' '), ...(def.aliases ?? [])];
  return haystack.some((h) => h.toLowerCase().includes(q));
}

/**
 * Noun-KIND rows: "you asked about drafts, drafts live here".
 *
 * Synchronous and I/O-free on purpose. For six of the eight nouns there is no list route
 * to call, and a palette that fired eight requests to discover that would be slower and
 * no more truthful. The row states which noun and where it lives; the surface states the
 * rest, which is the only place that can.
 */
export function searchMarketingNouns(query: string): readonly PaletteRow[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return MARKETING_NOUNS.filter((n) => matchesQuery(n, q)).flatMap((n) => {
    const dest = destinationForNoun(n);
    if (!dest) return [];
    const verbs = marketingVerbsForNoun(n);
    // What the row says about itself is derived from `reach`, so it cannot claim more
    // than the compartment can do.
    const state =
      n.reach.via === 'server_search'
        ? `${verbs.length} governed verb${verbs.length === 1 ? '' : 's'} · search the symbol to act`
        : n.reach.via === 'client_list'
          ? 'listed on the desk'
          : n.reach.via === 'per_parent'
            ? `listed under each ${n.reach.parent.replace(/_/g, ' ')}`
            : n.reach.via === 'surface_route'
              // The route is mounted, so the row must not say "no list route yet" — and it
              // must not imply the palette can list them either.
              ? `${n.reach.fn} is mounted · ${n.reach.notEnumerable}`
              : `no list route yet (${n.reach.owedFn})`;
    return [{
      id: `mkt-noun-${n.kind}`,
      label: n.plural,
      sublabel: `${titleCaseDestination(dest.label)} · ${state}`,
      to: withParams(dest.path, n.deepLink),
      type: 'page' as const,
    }];
  });
}

/**
 * Reply INSTANCES — the one marketing noun with a mounted list route.
 *
 * `GET /v1/marketing` is the queue the desk already reads, so this adds no route and no
 * new claim. The rows navigate to the desk with the reply selected rather than into the
 * verb stage, because the registry addresses no subject type for a reply: offering a verb
 * menu on it would mean offering `notify` and nothing else, which reads as "there is
 * nothing you can do to a reply" when in fact everything you do to one is on the desk.
 *
 * The caller gates this on holding `marketing`, so an operator without the compartment
 * never causes the request. That is honesty, not security — the route checks too.
 */
export async function searchMarketingReplies(
  query: string,
  signal?: AbortSignal,
): Promise<readonly PaletteRow[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const replyNoun = MARKETING_NOUNS.find((n) => n.kind === 'reply')!;
  const dest = destinationForNoun(replyNoun);
  if (!dest) return [];
  const rows = await fetchMarketingQueue();
  if (signal?.aborted) return [];
  return rows
    .filter((r) => {
      const hay = [r.author_handle, r.body, String(r.id)].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 5)
    .map((r) => ({
      id: `mkt-reply-${r.id}`,
      // `author_handle`, never `author_display`: the display name is attacker-chosen and
      // is not identity (see `MarketingReply`). A palette row is the smallest surface in
      // the app and the easiest place to be spoofed on.
      label: r.author_handle ? `@${r.author_handle}` : `Reply #${r.id}`,
      // QUARANTINED IS SAID FIRST, not filtered out. A quarantined row is an
      // unauthenticated message or an id collision: it is not in the queue and not in any
      // count, and it must never be promoted or drafted from — but hiding a forgery
      // attempt from the operator who searched for it is worse than showing it labelled.
      // The desk enforces what can be done with it; ⌘K owes the label.
      sublabel: [
        replyNoun.label,
        r.quarantined ? `QUARANTINED (${r.quarantine_code ?? 'no code'})` : r.status,
        (r.body ?? '').slice(0, 60),
      ].join(' · '),
      to: withParams(dest.path, { ...replyNoun.deepLink, [replyNoun.instanceParam!]: String(r.id) }),
      type: 'page' as const,
    }));
}
