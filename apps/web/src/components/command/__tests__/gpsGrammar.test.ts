/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE GPS GRAMMAR IS GENERATED, AND THIS IS WHAT MAKES THAT TRUE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The failure this file exists to prevent is not a wrong row. It is a SECOND PLACE.
 *
 * `PAGE_COMMANDS` and `COMMAND_CODES` in CommandBody are hand-written literals, and the
 * measurable consequence is already in the repo: GLOBAL SERVICES shipped seven surfaces, a
 * route table, six chords and six native menu items across seven waves, and gained no ⌘K
 * row at any point — because appending to a 34-row literal is a step nobody remembers and
 * forgetting it fails silently, as a desk you can only reach if you already know the chord.
 * So most of the assertions below are not about values. They read SOURCE — CommandBody's,
 * the API's, the GPS pages' — and fail when a claim in `gpsGrammar.ts` stops matching the
 * thing it claims about.
 *
 * FOUR OF THESE TESTS DELIBERATELY CROSS A PACKAGE BOUNDARY AND READ SOURCE. Precedent:
 * `lib/__tests__/destinations.test.ts` reads the Rust menu source, and
 * `__tests__/marketingGrammar.test.ts` reads `apps/api/src/routes/search.ts`, for the same
 * reason — the two artefacts cannot be type-checked against each other.
 *
 *  · CommandBody.tsx          for the literals that must not be there.
 *  · apps/api/src/routes/search.ts   for the GPS search group that does NOT exist. The
 *                             noun table's honesty about instance reach rests on it.
 *  · apps/api/src/gps/actions.ts     for the action ids, so "the verbs are derived" is
 *                             measured against the registry rather than asserted.
 *  · apps/web/src/pages/Gps*.tsx and lib/api/gps*.ts   for every function name and query
 *                             param the noun table claims or denies.
 *
 * All read-only. Nothing here edits any of them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRICE_BANDS_ARE_PLACEHOLDERS,
  EFFORT_TRIPLES_ARE_PLACEHOLDERS,
  OFFERS,
} from '@lcx/shared';
import { DESTINATIONS } from '@/lib/destinations';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import { COMMAND_CODES } from '../CommandBody';
import type { Principal } from '../grammar';

vi.mock('@/lib/api/gps', () => ({ fetchGpsEngagements: vi.fn() }));
import { fetchGpsEngagements } from '@/lib/api/gps';

import {
  GPS_DESKS_WITHOUT_NOUN, GPS_DESTINATIONS, GPS_ENGAGEMENT_SUBJECT, GPS_GOVERNED_ACTIONS,
  GPS_NOUNS, GPS_PALETTE_CODES, GPS_PALETTE_PAGES, GPS_PATH_PREFIX,
  GPS_SURFACES_WITHOUT_SELECTION, GPS_WORKSPACE,
  destinationForNoun, gpsNounsFromCompiledCatalogue, gpsNounsWithRouteNotEnumerable,
  gpsNounsWithoutFetcher, gpsSubjectsWithoutNoun, gpsVerbCapability, gpsVerbOffers,
  gpsVerbsForNoun, searchGpsEngagements, searchGpsNouns,
} from '../gpsGrammar';

const HERE = __dirname;
const WEB_SRC = join(HERE, '..', '..', '..');
const API_SRC = join(WEB_SRC, '..', '..', 'api', 'src');

const read = (...p: string[]) => readFileSync(join(...p), 'utf8');

const COMMAND_BODY_SRC = read(HERE, '..', 'CommandBody.tsx');
const GRAMMAR_SRC = read(HERE, '..', 'gpsGrammar.ts');
const SEARCH_ROUTE_SRC = read(API_SRC, 'routes', 'search.ts');
const GPS_ACTIONS_SRC = read(API_SRC, 'gps', 'actions.ts');

/** The API's GPS route files, concatenated. A path literal is claimed against these. */
const API_GPS_ROUTES_SRC = [
  'gps.ts', 'gpsArtifact.ts', 'gpsBook.ts', 'gpsConflict.ts', 'gpsDelivery.ts',
  'gpsLoop.ts', 'gpsOrigination.ts', 'gpsUnderwrite.ts',
  /* G0–G6's route files. Added in G7: the mount literals live in gps.ts, which was
     already read, but a noun claiming `/v1/gps/invoices` should be checkable against
     the file that SERVES it and not only against the line that mounts it. */
  'gpsPackets.ts', 'gpsDemand.ts', 'gpsDossier.ts', 'gpsFactory.ts', 'gpsInvoice.ts',
  'gpsPortal.ts',
].map((f) => read(API_SRC, 'routes', f)).join('\n');

/** The browser's GPS api modules, concatenated. Every `fn` claim is checked against these. */
const WEB_GPS_API_SRC = [
  'gps.ts', 'gpsBook.ts', 'gpsConflict.ts', 'gpsDelivery.ts', 'gpsLoop.ts',
  'gpsOrigination.ts', 'gpsUnderwrite.ts',
].map((f) => read(WEB_SRC, 'lib', 'api', f)).join('\n');

/**
 * Which page renders which destination.
 *
 * A literal, and deliberately: it is the one restatement in this file, and it is what makes
 * "the page really reads that param" checkable. Asserted below to cover every GPS
 * destination, so a new desk cannot slip past the param and selection tests.
 */
const PAGE_BY_DESTINATION: Readonly<Record<string, string>> = {
  'go-ws-gps': 'Gps.tsx',
  'go-gps-book': 'GpsBook.tsx',
  'go-gps-origination': 'GpsOrigination.tsx',
  'go-gps-underwriting': 'GpsUnderwriting.tsx',
  'go-gps-conflict': 'GpsConflict.tsx',
  'go-gps-delivery': 'GpsDelivery.tsx',
  'go-gps-loop': 'GpsLoop.tsx',
};

const pageSrc = (destination: string) => read(WEB_SRC, 'pages', PAGE_BY_DESTINATION[destination]!);

/** An export of any name shape these modules use: `export const`, `export async function`. */
const exportsName = (src: string, name: string) =>
  new RegExp(`export\\s+(const|async\\s+function|function)\\s+${name}\\b`).test(src);

/**
 * CommandBody's own prose will have to talk about GPS once it explains why the rows are
 * generated. Only CODE may not carry the literals, so comments are stripped before the
 * source is searched — a test that could be silenced by rewording a comment, or that
 * forbade explaining itself, would be the wrong test in both directions.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const COMMAND_BODY_CODE = codeOnly(COMMAND_BODY_SRC);
const GRAMMAR_CODE = codeOnly(GRAMMAR_SRC);

const OPERATOR_NO_GRANT: Principal = { role: 'operator', entitlements: {} };
const OPERATOR_WITH_GRANT: Principal = { role: 'operator', entitlements: { gps: 'operate' } };
const APPROVER: Principal = { role: 'approver', entitlements: { gps: 'approve' } };

describe('the palette rows are generated, not hand-listed', () => {
  it('CommandBody contains no GPS route literal anywhere in its code', () => {
    // THE MUTATION THAT PROVES THIS: paste
    // `{ id: 'gps', label: 'GPS', sublabel: '', to: '/gps', type: 'page' }`
    // into HAND_LISTED_PAGES and this goes red naming the line.
    const offending = COMMAND_BODY_CODE.split('\n')
      .map((line, n) => ({ line, n: n + 1 }))
      .filter(({ line }) =>
        line.includes(`'${GPS_PATH_PREFIX}`) || line.includes(`"${GPS_PATH_PREFIX}`));
    expect(offending.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
  });

  it('CommandBody contains no GPS command code literal', () => {
    for (const { code } of GPS_PALETTE_CODES) {
      expect(
        COMMAND_BODY_CODE.includes(`code: '${code}'`),
        `code '${code}' is hand-listed in CommandBody — it must come from GPS_PALETTE_CODES`,
      ).toBe(false);
    }
  });

  it('emits exactly one row per GPS destination, and nothing else', () => {
    expect(GPS_PALETTE_PAGES.map((r) => r.to).sort())
      .toEqual(GPS_DESTINATIONS.map((d) => d.path).sort());
    // The generator is a prefix filter over the real table, so a new GPS destination is a
    // new row with no edit here.
    expect(GPS_DESTINATIONS.length).toBe(
      DESTINATIONS.filter((d) => d.path === GPS_PATH_PREFIX || d.path.startsWith(`${GPS_PATH_PREFIX}/`)).length,
    );
    expect(GPS_DESTINATIONS.length).toBe(7);
  });

  it('no row carries a blank sublabel, including the desk with no noun on it', () => {
    // A blank sublabel renders as a row that failed to load. The book has no noun of its
    // own, so it must still say what it is.
    for (const row of GPS_PALETTE_PAGES) {
      expect(row.sublabel.trim().length, `${row.to} has an empty sublabel`).toBeGreaterThan(4);
    }
  });

  it('the compartment name is not lower-cased into something nobody calls it', () => {
    // 'GPS · THE BOOK' must become 'GPS · The Book', never 'Gps · The Book'.
    const book = GPS_PALETTE_PAGES.find((r) => r.to === '/gps/book')!;
    expect(book.label).toBe('GPS · The Book');
    expect(GPS_PALETTE_PAGES.find((r) => r.to === '/gps')!.label).toBe('Global Services');
  });

  it('no generated code collides with a hand-listed one, or with another GPS code', () => {
    const generated = GPS_PALETTE_CODES.map((c) => c.code);
    expect(generated.length, `duplicate GPS code: ${generated.filter((c, i) => generated.indexOf(c) !== i).join(', ')}`)
      .toBe(new Set(generated).size);
    /*
     * EXACTLY ONCE, which is the form this assertion takes now that the wiring has landed.
     * It read `COMMAND_CODES.some(…) === false` while GPS was unwired — a legitimate
     * collision check then, and an assertion that GPS is absent from the palette now. The
     * intent is unchanged and the direction is not weakened: a hand-listed `gc` would put
     * two entries under one code, and the loser would be whichever sorted second.
     */
    for (const code of generated) {
      expect(
        COMMAND_CODES.filter((c) => c.code === code).length,
        `code '${code}' appears more than once in COMMAND_CODES — one code, two destinations`,
      ).toBe(1);
    }
  });

  it('no code carries a query string, because no GPS surface reads one', () => {
    // Marketing's generator deep-links to a desk tab. GPS has no tab param anywhere, and a
    // param a page ignores makes the row lie about what Enter will do.
    for (const c of GPS_PALETTE_CODES) expect(c.to).not.toContain('?');
    for (const r of GPS_PALETTE_PAGES) expect(r.to).not.toContain('?');
  });
});

describe('every GPS noun is reachable', () => {
  it('each noun lives on a destination that exists', () => {
    for (const noun of GPS_NOUNS) {
      expect(destinationForNoun(noun), `${noun.kind} points at missing destination ${noun.destination}`)
        .toBeDefined();
    }
  });

  it('each noun can be found by typing its own name', () => {
    for (const noun of GPS_NOUNS) {
      const rows = searchGpsNouns(noun.plural);
      expect(rows.map((r) => r.id), `typing "${noun.plural}" must surface ${noun.kind}`)
        .toContain(`gps-noun-${noun.kind}`);
    }
  });

  it('each noun has a code, and the code goes to its surface', () => {
    for (const noun of GPS_NOUNS) {
      const entry = GPS_PALETTE_CODES.find((c) => c.code === noun.code);
      expect(entry, `${noun.kind} has no palette code`).toBeDefined();
      expect(entry!.to).toBe(destinationForNoun(noun)!.path);
    }
  });

  it('names the twenty nouns the plan names', () => {
    // A literal, and deliberately: deriving the expected list from GPS_NOUNS would assert
    // nothing at all. This is the one place the plan's vocabulary is restated, so dropping
    // a noun from the table is a failure rather than a smaller table.
    //
    // SIXTEEN BECAME TWENTY IN G7, and the four are the objects G2–G6 actually built:
    // a research dossier, a deliverable draft, a portal invite and an invoice. They are
    // added here rather than left out because the failure this whole file exists to
    // prevent is precisely the one GPS shipped seven times — a surface an operator can
    // only reach if he already knows it is there.
    //
    // `packet` is NOT in this list, and that is the honest gap: founder packets live on
    // /gps/inputs, which has no Destination and cannot get one without a native-menu
    // line in the desktop shell. A palette row pointing nowhere would be worse than
    // its absence, so the absence is written down (see GPS_NOUNS' G7 block).
    expect(GPS_NOUNS.map((n) => n.kind).sort()).toEqual([
      'client', 'conflict_decision', 'deliverable', 'disclosure', 'dossier', 'draft',
      'effort_triple', 'engagement', 'invoice', 'milestone', 'offer', 'outcome',
      'outreach_opening', 'partner', 'perimeter_position', 'portal_invite', 'proposal',
      'quote', 'rate_card', 'target',
    ]);
  });

  it('the desks with no noun on them are exactly the ones written down', () => {
    // The mirror of marketing's "every desk hosts at least one noun", pointed the way GPS
    // is: the book re-bases the engagement list, so it hosts no noun of its own. A seventh
    // desk arriving with nothing on it fails here until it gets a noun or a written reason.
    const nounless = GPS_DESTINATIONS
      .filter((d) => d.withinWorkspace && !GPS_NOUNS.some((n) => n.destination === d.id))
      .map((d) => d.id)
      .sort();
    expect(nounless).toEqual(GPS_DESKS_WITHOUT_NOUN.map((x) => x.destination).sort());
    for (const x of GPS_DESKS_WITHOUT_NOUN) {
      expect(x.because.trim().length, `${x.destination} gives no reason it hosts no noun`)
        .toBeGreaterThan(10);
    }
  });

  it('the page map covers every GPS destination', () => {
    // Without this the param and selection tests below could silently skip a new desk.
    expect(Object.keys(PAGE_BY_DESTINATION).sort()).toEqual(GPS_DESTINATIONS.map((d) => d.id).sort());
  });
});

describe('the verbs are DERIVED from the registry, not listed here', () => {
  it('no GPS action id appears literally anywhere in gpsGrammar.ts', () => {
    // THE MUTATION THAT PROVES THIS: write `if (a.id === 'gps_proposal_issue')` into
    // gpsGrammar.ts and this goes red naming the id. A hand-listed verb is a verb that
    // survives being deleted from the registry.
    for (const a of GPS_GOVERNED_ACTIONS) {
      expect(
        GRAMMAR_CODE.includes(a.id),
        `'${a.id}' is written into gpsGrammar.ts — the verb list must come from ACTION_MANIFEST`,
      ).toBe(false);
    }
  });

  it('the derived verbs are exactly the ones apps/api/src/gps/actions.ts declares', () => {
    // Across the package boundary, because that is where the registry lives. A sixth GPS
    // write path appears in the palette with no edit; a renamed one leaves it.
    const declared = [...GPS_ACTIONS_SRC.matchAll(/^\s*id: '(gps_[a-z_]+)',/gm)].map((m) => m[1]!).sort();
    expect(declared.length).toBeGreaterThan(0);
    expect(GPS_GOVERNED_ACTIONS.map((a) => a.id).sort()).toEqual(declared);
  });

  it('the subject type is the one the API module addresses, spelled the same way', () => {
    expect(GPS_ACTIONS_SRC).toContain(`ENGAGEMENT_SUBJECT = '${GPS_ENGAGEMENT_SUBJECT}'`);
    for (const a of GPS_GOVERNED_ACTIONS) {
      expect(ACTION_MANIFEST.actions).toContain(a);
      expect(a.workspace).toBe(GPS_WORKSPACE);
      expect(a.subjectTypes).toEqual([GPS_ENGAGEMENT_SUBJECT]);
      // `'*'` would make the audit row name no object at all, which is the whole reason
      // this compartment declares one subject type.
      expect(a.subjectTypes).not.toContain('*');
      expect(a.minRole === 'operator' || a.minRole === 'approver').toBe(true);
      expect(gpsVerbCapability(a)).toBe(a.minRole === 'approver' ? 'approve' : 'operate');
    }
  });

  it('no governed GPS action addresses a subject type no noun claims', () => {
    // The reachability gate, pointed the way that breaks: a verb whose subject cannot be
    // put in front of the command line is not a capability.
    expect(gpsSubjectsWithoutNoun()).toEqual([]);
  });

  it('the two engagement nouns carry every verb and the rest honestly carry none', () => {
    for (const kind of ['engagement', 'proposal'] as const) {
      const noun = GPS_NOUNS.find((n) => n.kind === kind)!;
      expect(gpsVerbsForNoun(noun).map((a) => a.id).sort())
        .toEqual(GPS_GOVERNED_ACTIONS.map((a) => a.id).sort());
    }
    // The others declare `subjectType: null` rather than a plausible guess, so they offer
    // no verbs at all. A guessed subject type produces an empty verb menu for a reason
    // nobody can find.
    for (const noun of GPS_NOUNS.filter((n) => n.subjectType === null)) {
      expect(gpsVerbsForNoun(noun)).toEqual([]);
    }
  });
});

describe('a verb the member cannot invoke says why, in sentences', () => {
  it('a member with no GPS grant still sees every verb, each with a refusal', () => {
    // The compartment is default-deny, so the silent-filter version of this menu is EMPTY —
    // and an empty menu teaches an operator that GLOBAL SERVICES has no verbs rather than
    // that he has no grant.
    const offers = gpsVerbOffers(OPERATOR_NO_GRANT);
    expect(offers.length).toBe(GPS_GOVERNED_ACTIONS.length);
    for (const o of offers) expect(o.refusal, `${o.action.id} vanished instead of refusing`).not.toBeNull();
  });

  it('the refusal is a sentence an operator can act on, with the rule cited', () => {
    for (const o of gpsVerbOffers(OPERATOR_NO_GRANT)) {
      const r = o.refusal!;
      expect(r.headline.endsWith('.'), `${o.action.id} headline is not a sentence`).toBe(true);
      expect(r.next.endsWith('.'), `${o.action.id} next-step is not a sentence`).toBe(true);
      expect(r.rule.trim().length, `${o.action.id} cites no rule`).toBeGreaterThan(10);
      // Never a raw code in the prose. `verbsFor`'s discriminator is carried separately,
      // for a bug report.
      expect(r.headline).not.toContain('entitlement');
      expect(r.headline).not.toContain('kind');
      // Both refusals end in the same place — a named human with the authority — so the
      // next step is a person to ask, never "contact your administrator". The compartment
      // name belongs on the entitlement refusal specifically, asserted below.
      expect(r.next).toContain('approver');
      expect(['role', 'entitlement']).toContain(r.code);
    }
  });

  it('the entitlement refusal names the capability to ask for and why a role will not do', () => {
    const o = gpsVerbOffers(OPERATOR_NO_GRANT).find((x) => x.action.minRole === 'operator')!;
    expect(o.refusal!.code).toBe('entitlement');
    expect(o.refusal!.headline).toContain("'operate'");
    expect(o.refusal!.next).toContain("'operate'");
    // The reason the grant is needed at all: no desk role and no shared key reaches here.
    expect(o.refusal!.next).toContain('machine key');
    expect(o.refusal!.rule).toContain('default-deny');
  });

  it('an operator WITH the grant is refused only the approver-only verbs, and told so', () => {
    const offers = gpsVerbOffers(OPERATOR_WITH_GRANT);
    const refused = offers.filter((o) => o.refusal);
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.map((o) => o.action.id).sort())
      .toEqual(GPS_GOVERNED_ACTIONS.filter((a) => a.minRole === 'approver').map((a) => a.id).sort());
    for (const o of refused) {
      expect(o.refusal!.code).toBe('role');
      expect(o.refusal!.headline).toContain('approver');
      // Nothing to retry: the server refuses it too, so the row must not imply otherwise.
      expect(o.refusal!.next).toContain('nothing to retry');
    }
  });

  it('an approver holding approve is refused nothing', () => {
    for (const o of gpsVerbOffers(APPROVER)) {
      expect(o.refusal, `${o.action.id} refused an approver who holds approve`).toBeNull();
    }
  });

  it('every verb states what the SERVER still checks after the palette is satisfied', () => {
    // A green verb is not a successful invoke: the proposal is conflict-gated and
    // perimeter-gated and a below-band price needs a prior approval, none of which is
    // visible in a role or an entitlement.
    for (const o of gpsVerbOffers(APPROVER)) {
      expect(o.serverStillChecks.trim().length, `${o.action.id} states no server-side gate`)
        .toBeGreaterThan(20);
      expect(o.serverStillChecks).toBe(o.action.description);
    }
  });
});

describe('the honesty ceiling is encoded, not narrated', () => {
  it('no noun claims server_search, because /v1/search emits no GPS group', () => {
    // The claim and the thing it is a claim about, in one test. When a GPS group lands this
    // goes red and the engagement noun gets upgraded, instead of the palette quietly
    // staying a nav shortcut.
    expect(GPS_NOUNS.filter((n) => n.reach.via === 'server_search')).toEqual([]);
    expect(
      SEARCH_ROUTE_SRC.includes(`workspace: '${GPS_WORKSPACE}'`),
      'GET /v1/search now emits a gps group — upgrade the engagement noun to server_search',
    ).toBe(false);
    expect(SEARCH_ROUTE_SRC).not.toContain(`subjectType: '${GPS_ENGAGEMENT_SUBJECT}'`);
  });

  it('every reach is a declared variant and the table is populated', () => {
    expect(GPS_NOUNS.length).toBe(20);
    for (const n of GPS_NOUNS) {
      expect(
        ['server_search', 'client_list', 'per_parent', 'compiled_catalogue', 'surface_route', 'no_fetcher'],
        `${n.kind} declares reach via "${n.reach.via}", which is not a known variant`,
      ).toContain(n.reach.via);
    }
  });

  it('every fetcher a noun claims really is exported by a GPS api module', () => {
    // The claim that breaks silently: a noun saying "listed on the desk" through a function
    // that was renamed. `lib/api/gps.ts` already shipped one path (`/propose` against a
    // server serving `/proposal`) that nothing typechecked.
    for (const n of GPS_NOUNS) {
      const fn =
        n.reach.via === 'client_list' || n.reach.via === 'per_parent' || n.reach.via === 'surface_route'
          ? n.reach.fn
          : null;
      if (!fn) continue;
      expect(
        exportsName(WEB_GPS_API_SRC, fn),
        `${n.kind} claims ${fn}, which no lib/api/gps* module exports`,
      ).toBe(true);
    }
  });

  it('every missing fetcher really is missing, and its route claim is true', () => {
    const missing = gpsNounsWithoutFetcher();
    expect(missing.length).toBeGreaterThan(0);
    for (const { kind, missingFn, serverRoute, reason } of missing) {
      // The ratchet: the day someone writes the fetcher, this goes red and the noun gets
      // upgraded from "nothing fetches it" to real instances.
      expect(
        exportsName(WEB_GPS_API_SRC, missingFn),
        `${kind} says ${missingFn} does not exist, and a GPS api module now exports it — upgrade the reach`,
      ).toBe(false);
      expect(reason.trim().length, `${kind} gives no reason it is unfetched`).toBeGreaterThan(20);
      const def = GPS_NOUNS.find((n) => n.kind === kind)!;
      const literal = def.reach.via === 'no_fetcher' ? def.reach.routeLiteral : null;
      if (serverRoute) {
        // "The API serves it and nobody calls it" and "no route exists" are different
        // triage. Claiming the first requires the route to be there.
        expect(literal, `${kind} claims ${serverRoute} without naming the route literal`).not.toBeNull();
        expect(serverRoute.endsWith(literal!)).toBe(true);
        expect(
          API_GPS_ROUTES_SRC.includes(`'${literal}'`),
          `${kind} claims ${serverRoute} is served, and no GPS route file registers '${literal}'`,
        ).toBe(true);
      } else {
        expect(literal, `${kind} names a route literal but no serverRoute`).toBeNull();
      }
    }
  });

  it('a mounted-but-not-enumerable noun says which route and why', () => {
    const mounted = gpsNounsWithRouteNotEnumerable();
    expect(mounted.length).toBeGreaterThan(0);
    for (const { kind, fn, notEnumerable } of mounted) {
      expect(notEnumerable.trim().length, `${kind} gives no reason it is not enumerable`)
        .toBeGreaterThan(10);
      const row = searchGpsNouns(GPS_NOUNS.find((n) => n.kind === kind)!.plural)
        .find((r) => r.id === `gps-noun-${kind}`)!;
      expect(row.sublabel).toContain(fn);
      expect(row.sublabel).toContain(notEnumerable);
      // And it must not imply the palette lists them.
      expect(row.sublabel).not.toContain('listed on the desk');
    }
  });

  it('the compiled catalogue is named, and the row admits it is not enumerated here', () => {
    const compiled = gpsNounsFromCompiledCatalogue();
    expect(compiled.map((c) => c.symbol)).toEqual(['OFFERS']);
    // The symbol exists and is a real catalogue — imported HERE, in a test, which is not
    // bundled. That is the whole point of naming it as a string in the palette.
    expect(Object.keys(OFFERS).length).toBeGreaterThan(0);
    for (const { kind, notImported } of compiled) {
      const row = searchGpsNouns(GPS_NOUNS.find((n) => n.kind === kind)!.plural)
        .find((r) => r.id === `gps-noun-${kind}`)!;
      expect(row.sublabel).toContain('not enumerated here');
      expect(row.sublabel).toContain(notImported);
      expect(row.sublabel).not.toContain('listed on the desk');
    }
  });

  it('a noun that says nothing fetches it says so on the row, with the reason', () => {
    for (const { kind, missingFn, reason } of gpsNounsWithoutFetcher()) {
      const row = searchGpsNouns(GPS_NOUNS.find((n) => n.kind === kind)!.plural)
        .find((r) => r.id === `gps-noun-${kind}`)!;
      expect(row.sublabel).toContain('nothing fetches it');
      expect(row.sublabel).toContain(missingFn);
      expect(row.sublabel).toContain(reason);
      expect(row.sublabel).not.toContain('listed on the desk');
    }
  });

  it('a per-parent noun says which parent, and never claims the palette lists it', () => {
    for (const n of GPS_NOUNS.filter((x) => x.reach.via === 'per_parent')) {
      const row = searchGpsNouns(n.plural).find((r) => r.id === `gps-noun-${n.kind}`)!;
      expect(row.sublabel).toContain('listed under one');
      expect(row.sublabel).not.toContain('listed on the desk');
    }
  });

  it('a claimed parent param is one the parent surface really reads', () => {
    // The failure this prevents: a row promising `?engagementId=` against a page that never
    // calls useSearchParams, which looks identical to a working deep link until you use it.
    let checked = 0;
    for (const n of GPS_NOUNS) {
      if (n.reach.via !== 'per_parent' || !n.reach.parentParam) continue;
      const src = pageSrc(n.destination);
      expect(
        src.includes(`searchParams.get('${n.reach.parentParam}')`),
        `${n.kind} claims ?${n.reach.parentParam} and ${PAGE_BY_DESTINATION[n.destination]} never reads it`,
      ).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('the surfaces that read no param are exactly the ones written down', () => {
    const unread = GPS_DESTINATIONS
      .filter((d) => !pageSrc(d.id).includes('useSearchParams'))
      .map((d) => d.id)
      .sort();
    expect(unread).toEqual(GPS_SURFACES_WITHOUT_SELECTION.map((s) => s.destination).sort());
    for (const s of GPS_SURFACES_WITHOUT_SELECTION) {
      expect(PAGE_BY_DESTINATION[s.destination], `${s.destination} is not a GPS destination`).toBe(s.page);
    }
  });

  it('the placeholder caveats rest on flags that are really still true', () => {
    const flags: Record<string, boolean> = {
      PRICE_BANDS_ARE_PLACEHOLDERS,
      EFFORT_TRIPLES_ARE_PLACEHOLDERS,
    };
    const flagged = GPS_NOUNS.filter((n) => n.caveatFlag);
    expect(flagged.map((n) => n.kind).sort()).toEqual(['effort_triple', 'offer']);
    for (const n of flagged) {
      // When the owner supplies real bands or real triples the flag flips, this goes red,
      // and the caveat comes off the row instead of outliving the thing it warned about.
      expect(
        flags[n.caveatFlag!],
        `${n.kind} warns on ${n.caveatFlag}, which is no longer true — drop the caveat`,
      ).toBe(true);
      const row = searchGpsNouns(n.plural).find((r) => r.id === `gps-noun-${n.kind}`)!;
      expect(row.sublabel).toContain(n.caveat!);
    }
  });

  it('every caveat that exists is shown on the row rather than kept in the source', () => {
    for (const n of GPS_NOUNS.filter((x) => x.caveat)) {
      expect(n.caveat!.trim().length).toBeGreaterThan(10);
      const row = searchGpsNouns(n.plural).find((r) => r.id === `gps-noun-${n.kind}`)!;
      expect(row.sublabel, `${n.kind}'s caveat is not on its row`).toContain(n.caveat!);
    }
  });

  it('the grammar imports nothing from @lcx/shared, so the palette stays cheap', () => {
    // The perf ratchet, in the file's own source. There are 23KB of headroom in the bundle
    // budget and the GPS shared graph is tens of thousands of lines behind a lazy chunk;
    // one convenience import here would move it into the initial one. THE MUTATION THAT
    // PROVES THIS: add `import { OFFERS } from '@lcx/shared';` to gpsGrammar.ts.
    expect(GRAMMAR_CODE).not.toContain("from '@lcx/shared'");
  });
});

describe('engagement instances', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'eng_1', clientName: 'ACME', offerKey: 'gtm_sprint', status: 'draft',
    conflict: null, ...over,
  });

  beforeEach(() => vi.mocked(fetchGpsEngagements).mockReset());

  it('finds an engagement by client name and sends it to the desk with no query string', async () => {
    vi.mocked(fetchGpsEngagements).mockResolvedValue([row()] as never);
    const rows = await searchGpsEngagements('acme');
    expect(rows.map((r) => r.id)).toEqual(['gps-engagement-eng_1']);
    // `pages/Gps.tsx` reads no param, so appending one would make the row lie.
    expect(rows[0]!.to).toBe('/gps');
  });

  it('says the conflict check is MISSING rather than leaving the field out', async () => {
    // Absence of a decision is not a clearance. A proposal issued without a recorded check
    // is the failure this compartment was built to make visible.
    vi.mocked(fetchGpsEngagements).mockResolvedValue([row()] as never);
    const [r] = await searchGpsEngagements('acme');
    expect(r!.sublabel).toContain('CONFLICT CHECK MISSING');

    vi.mocked(fetchGpsEngagements).mockResolvedValue([
      row({ conflict: { decision: 'cleared', decidedBy: 'nik', decidedAt: 'x' } }),
    ] as never);
    const [cleared] = await searchGpsEngagements('acme');
    expect(cleared!.sublabel).toContain('conflict cleared');
    expect(cleared!.sublabel).not.toContain('MISSING');
  });

  it('prints no money, because a bare cents figure reads as dollars', async () => {
    vi.mocked(fetchGpsEngagements).mockResolvedValue([row({ priceCents: 2_000_000 })] as never);
    const [r] = await searchGpsEngagements('acme');
    expect(r!.sublabel).not.toContain('2000000');
    expect(r!.sublabel).toContain('gtm_sprint');
  });

  it('asks for nothing on a one-character query, and honours an abort', async () => {
    expect(await searchGpsEngagements('a')).toEqual([]);
    expect(fetchGpsEngagements).not.toHaveBeenCalled();

    vi.mocked(fetchGpsEngagements).mockResolvedValue([row()] as never);
    const ac = new AbortController();
    const p = searchGpsEngagements('acme', ac.signal);
    ac.abort();
    expect(await p).toEqual([]);
  });
});

describe('the ⌘K wiring landed', () => {
  /*
   * THIS WAS THE NEGATIVE FORM UNTIL THE WIRING PASS. It asserted GPS was NOT spread into
   * CommandBody, so that the gap was a known quantity rather than a discovery — and it
   * carried the exact positive assertions to replace it with. This is that replacement,
   * unchanged from what the grammar's author wrote down.
   */
  it('every generated row and code is reachable in the palette CommandBody assembles', () => {
    // Not "the arrays are equal" — that the palette really spreads them. A generator
    // nobody imports is the same defect one layer along.
    expect(COMMAND_BODY_CODE).toContain('...GPS_PALETTE_PAGES');
    expect(COMMAND_BODY_CODE).toContain('...GPS_PALETTE_CODES');
    expect(COMMAND_BODY_CODE).toContain('searchGpsNouns(query)');
    for (const { code } of GPS_PALETTE_CODES) {
      expect(
        COMMAND_CODES.some((c) => c.code === code),
        `code '${code}' is generated but not in the palette's code table`,
      ).toBe(true);
    }
  });

  it('the engagement instance search is wired, since /v1/search can never supply one', () => {
    // The one noun carrying all five governed verbs, and `useObjectSearch` cannot reach it:
    // the search route emits no `gps` group (asserted above against its own source). If
    // this row is not fetched by the palette itself, the verb-bearing noun is unreachable.
    expect(COMMAND_BODY_CODE).toContain('searchGpsEngagements');
    // Behind the compartment gate, and gated on the compartment rather than on a flag.
    expect(COMMAND_BODY_CODE).toContain('principal.entitlements[GPS_WORKSPACE]');
  });

});
