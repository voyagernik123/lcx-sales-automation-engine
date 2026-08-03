/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE MARKETING GRAMMAR IS GENERATED, AND THIS IS WHAT MAKES THAT TRUE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The failure this file exists to prevent is not a wrong row. It is a SECOND PLACE.
 *
 * `PAGE_COMMANDS` and `COMMAND_CODES` in CommandBody are hand-written literals, and the
 * measurable consequence of that is already in the repo: the seventh and eighth
 * compartments shipped with route tables, chords and native menu items, and neither
 * gained a ⌘K row, because appending to a 34-row literal is a step nobody remembers and
 * forgetting it fails silently — as a page you can only reach if you already know the
 * chord. So the assertions below are mostly not about values. They read CommandBody's
 * SOURCE and fail if a marketing path or code appears in it literally, which is the only
 * way to keep "generated" from decaying into "generated once".
 *
 * Two of these tests deliberately go across a package boundary and read source:
 *
 *  · CommandBody.tsx, for the literals that must not be there. Precedent:
 *    `lib/__tests__/destinations.test.ts` reads the Rust menu source for the same
 *    reason — the two artefacts cannot be type-checked against each other.
 *  · apps/api/src/routes/search.ts, for the ONE marketing search group. A noun that
 *    claims a registry subject type is claiming the operator can put such a subject in
 *    front of the command line, and only the route can settle that. Read-only; nothing
 *    here edits the API.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESTINATIONS } from '@/lib/destinations';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import { COMMAND_CODES } from '../CommandBody';
import {
  MARKETING_DESTINATIONS, MARKETING_GOVERNED_ACTIONS, MARKETING_NOUNS,
  MARKETING_PALETTE_CODES, MARKETING_PALETTE_PAGES, MARKETING_PATH_PREFIX,
  MARKETING_WORKSPACE, OWED_ROUTE_FNS, PUBLISHING_VERB,
  destinationForNoun, destinationsUnder, marketingNounsAwaitingRoute,
  marketingNounsWithRouteNotEnumerable,
  marketingPaletteVocabulary, marketingSubjectsWithoutNoun, marketingVerbsForNoun,
  searchMarketingNouns,
} from '../marketingGrammar';

const HERE = __dirname;
const COMMAND_BODY_SRC = readFileSync(join(HERE, '..', 'CommandBody.tsx'), 'utf8');
const SEARCH_ROUTE_SRC = readFileSync(
  join(HERE, '..', '..', '..', '..', '..', 'api', 'src', 'routes', 'search.ts'),
  'utf8',
);

/**
 * CommandBody's own prose talks about marketing — it has to, since it explains why the
 * rows are generated. Only CODE may not carry the literals, so comments are stripped
 * before the source is searched. A test that could be silenced by rewording a comment,
 * or that forbade explaining itself, would be the wrong test in both directions.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const COMMAND_BODY_CODE = codeOnly(COMMAND_BODY_SRC);

describe('the palette rows are generated, not hand-listed', () => {
  it('CommandBody contains no marketing route literal anywhere in its code', () => {
    // THE MUTATION THAT PROVES THIS: paste
    // `{ id: 'mkt', label: 'Marketing', sublabel: '', to: '/marketing', type: 'page' }`
    // into HAND_LISTED_PAGES and this goes red naming the line.
    const offending = COMMAND_BODY_CODE.split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => line.includes(`'${MARKETING_PATH_PREFIX}`) || line.includes(`"${MARKETING_PATH_PREFIX}`));
    expect(offending.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
  });

  it('CommandBody contains no marketing command code literal', () => {
    for (const { code } of MARKETING_PALETTE_CODES) {
      expect(
        COMMAND_BODY_CODE.includes(`code: '${code}'`),
        `code '${code}' is hand-listed in CommandBody — it must come from MARKETING_PALETTE_CODES`,
      ).toBe(false);
    }
  });

  it('emits exactly one row per marketing destination, and nothing else', () => {
    expect(MARKETING_PALETTE_PAGES.map((r) => r.to).sort())
      .toEqual(MARKETING_DESTINATIONS.map((d) => d.path).sort());
    // The generator is a prefix filter over the real table, so a new marketing
    // destination is a new row with no edit here.
    expect(MARKETING_DESTINATIONS.length).toBe(
      DESTINATIONS.filter((d) => d.path === MARKETING_PATH_PREFIX || d.path.startsWith(`${MARKETING_PATH_PREFIX}/`)).length,
    );
    expect(MARKETING_DESTINATIONS.length).toBeGreaterThanOrEqual(4);
  });

  it('every generated row and code is reachable in the palette CommandBody assembles', () => {
    // Not "the arrays are equal" — that the palette really spreads them. A generator
    // nobody imports is the same defect one layer along.
    expect(COMMAND_BODY_CODE).toContain('...MARKETING_PALETTE_PAGES');
    expect(COMMAND_BODY_CODE).toContain('...MARKETING_PALETTE_CODES');
    expect(COMMAND_BODY_CODE).toContain('searchMarketingNouns(query)');
    for (const { code } of MARKETING_PALETTE_CODES) {
      expect(COMMAND_CODES.some((c) => c.code === code)).toBe(true);
    }
  });

  it('no generated code collides with a hand-listed one', () => {
    const seen = COMMAND_CODES.map((c) => c.code);
    expect(seen.length, `duplicate code: ${seen.filter((c, i) => seen.indexOf(c) !== i).join(', ')}`)
      .toBe(new Set(seen).size);
  });
});

describe('every marketing noun is reachable', () => {
  it('each noun lives on a destination that exists', () => {
    for (const noun of MARKETING_NOUNS) {
      expect(destinationForNoun(noun), `${noun.kind} points at missing destination ${noun.destination}`)
        .toBeDefined();
    }
  });

  it('each noun can be found by typing its own name', () => {
    for (const noun of MARKETING_NOUNS) {
      const rows = searchMarketingNouns(noun.plural);
      expect(rows.map((r) => r.id), `typing "${noun.plural}" must surface ${noun.kind}`)
        .toContain(`mkt-noun-${noun.kind}`);
    }
  });

  it('each noun has a code, and the code goes to its surface', () => {
    for (const noun of MARKETING_NOUNS) {
      const entry = MARKETING_PALETTE_CODES.find((c) => c.code === noun.code);
      expect(entry, `${noun.kind} has no palette code`).toBeDefined();
      expect(entry!.to.startsWith(destinationForNoun(noun)!.path)).toBe(true);
    }
  });

  it('names the seven nouns the plan names, plus the record bundle', () => {
    // A literal, and deliberately: deriving the expected list from MARKETING_NOUNS would
    // assert nothing at all. This is the one place the plan's vocabulary is restated, so
    // dropping a noun from the table is a failure rather than a smaller table.
    expect(MARKETING_NOUNS.map((n) => n.kind).sort()).toEqual([
      'claim', 'crisis_statement', 'draft', 'embargo', 'holding', 'precedent',
      'record_bundle', 'reply',
    ]);
  });

  it('every desk inside the compartment hosts at least one noun', () => {
    // The compartment ROOT is exempt: it is the door, and it renders the desk. Every
    // `withinWorkspace` surface is a place with things on it.
    for (const d of MARKETING_DESTINATIONS.filter((x) => x.withinWorkspace)) {
      const hosted = MARKETING_NOUNS.filter((n) => n.destination === d.id);
      expect(hosted.length, `${d.path} is a surface with no noun on it`).toBeGreaterThan(0);
    }
  });
});

describe('every marketing verb is aimable', () => {
  it('no governed marketing action addresses a subject type no noun claims', () => {
    // THE REACHABILITY GATE, pointed the way that breaks: a verb whose subject cannot be
    // put in front of the command line is not a capability. This is the assertion that
    // makes a new marketing action fail here until it has a noun.
    expect(marketingSubjectsWithoutNoun()).toEqual([]);
  });

  it('the compartment really has governed verbs, and they are the three abuse writes', () => {
    expect(MARKETING_GOVERNED_ACTIONS.map((a) => a.id).sort()).toEqual([
      'marketing_embargo_enter', 'marketing_embargo_lift', 'marketing_holdings_declare',
    ]);
    for (const a of MARKETING_GOVERNED_ACTIONS) {
      expect(a.workspace).toBe(MARKETING_WORKSPACE);
    }
  });

  it('the asset nouns carry those verbs and the rest honestly carry none', () => {
    const embargo = MARKETING_NOUNS.find((n) => n.kind === 'embargo')!;
    expect(marketingVerbsForNoun(embargo).map((a) => a.id).sort()).toEqual([
      'marketing_embargo_enter', 'marketing_embargo_lift', 'marketing_holdings_declare',
    ]);
    // The others declare `subjectType: null` rather than a plausible guess, so they offer
    // no verbs at all. A guessed subject type would produce an empty verb menu for a
    // reason no one could find.
    for (const noun of MARKETING_NOUNS.filter((n) => n.subjectType === null)) {
      expect(marketingVerbsForNoun(noun)).toEqual([]);
    }
  });

  it('a noun claiming a registry subject type has a real /v1/search group', () => {
    // The other half of the gate, across the package boundary. Without this the noun
    // table could claim a subject type the route never emits, and the verb stage would
    // be reachable only by typing an id nobody can look up.
    for (const noun of MARKETING_NOUNS) {
      if (!noun.subjectType) continue;
      expect(
        SEARCH_ROUTE_SRC.includes(`subjectType: '${noun.subjectType}'`),
        `GET /v1/search emits no group with subjectType '${noun.subjectType}', so ${noun.kind} instances cannot be aimed at`,
      ).toBe(true);
      if (noun.reach.via === 'server_search') {
        expect(SEARCH_ROUTE_SRC).toContain(`key: '${noun.reach.group}'`);
      }
    }
  });

  it('every verb in the manifest for these subjects is in the same registry the server checks', () => {
    // `verbsFor` is what the palette filters with; this asserts the manifest the two
    // share carries a workspace and a minRole on each marketing action, since a null
    // workspace would make the entitlement filter a no-op.
    for (const a of MARKETING_GOVERNED_ACTIONS) {
      expect(ACTION_MANIFEST.actions).toContain(a);
      expect(a.minRole === 'operator' || a.minRole === 'approver').toBe(true);
      expect(a.subjectTypes.length).toBeGreaterThan(0);
      expect(a.subjectTypes).not.toContain('*');
    }
  });
});

describe('the honesty ceiling is encoded, not narrated', () => {
  it('a noun that says its list route is owed names a route that really is owed', () => {
    // The drift that matters most here: when one of the twenty owed routes lands, it
    // leaves MARKETING_CONTRACTS_OWED and THIS test goes red — which forces the palette
    // to be upgraded from a nav shortcut to real instances instead of quietly staying a
    // shortcut forever.
    for (const { kind, owedFn } of marketingNounsAwaitingRoute()) {
      expect(OWED_ROUTE_FNS, `${kind} waits on ${owedFn}, which is not in MARKETING_CONTRACTS_OWED`)
        .toContain(owedFn);
    }

    /*
     * There used to be a `marketingNounsAwaitingRoute().length > 0` guard here, to stop
     * the loop above passing vacuously. It was right while routes were still owed, and it
     * went red on 2026-08-03 when the LAST one landed — `checkClaimSafety`, which `claim`
     * was waiting on. Keeping it would have meant asserting that the compartment still
     * owes a route when it owes none: a guard against vacuity that had itself become the
     * false claim. `claim` moved to `surface_route`, so `surface_only` is now empty.
     *
     * The vacuity risk is real though, so it is guarded on the thing that is actually
     * invariant — the noun table is populated, and every noun's reach is a declared
     * variant. A noun added with no reach, or the table emptied, still fails here.
     */
    expect(MARKETING_NOUNS.length).toBeGreaterThan(0);
    for (const n of MARKETING_NOUNS) {
      expect(
        ['server_search', 'client_list', 'per_parent', 'surface_only', 'surface_route'],
        `${n.kind} declares reach via "${n.reach.via}", which is not a known variant`,
      ).toContain(n.reach.via);
    }
  });

  it('a surface-only noun row says the route is missing rather than implying rows exist', () => {
    for (const { kind, owedFn } of marketingNounsAwaitingRoute()) {
      const row = searchMarketingNouns(MARKETING_NOUNS.find((n) => n.kind === kind)!.plural)
        .find((r) => r.id === `mkt-noun-${kind}`)!;
      expect(row.sublabel).toContain('no list route yet');
      expect(row.sublabel).toContain(owedFn);
    }
  });

  it('a noun whose route landed no longer claims the route is owed', () => {
    /*
     * THE OPPOSITE DRIFT, and the one that just happened. `fetchCrisisStatements`,
     * `fetchPrecedent` and `fetchExportBundle` were `surface_only` while their routes were
     * owed; the routes landed, left `MARKETING_CONTRACTS_OWED`, and the assertion above
     * went red — correctly, because the palette was still saying "no list route yet" about
     * three mounted routes. `surface_route` is the state that resolves it, and this is what
     * stops it from becoming a way to silence the other test: a `surface_route` fetcher
     * still listed as owed is a paid-debt claim over an unpaid debt.
     */
    const mounted = marketingNounsWithRouteNotEnumerable();
    // `claim` joined on 2026-08-03, when `checkClaimSafety` landed as the LAST of the
    // twenty-one owed routes and emptied `surface_only` entirely. Same reasoning as the
    // other three, and worth stating because it is the least obvious of the four:
    // `POST /claim-safety` returns a verdict on one piece of text. There is no list of
    // claims behind it to enumerate, so promoting it to `client_list` would assert a
    // capability the palette does not have.
    expect(mounted.map((m) => m.kind).sort())
      .toEqual(['claim', 'crisis_statement', 'precedent', 'record_bundle']);
    for (const { kind, fn, notEnumerable } of mounted) {
      expect(OWED_ROUTE_FNS, `${kind} claims ${fn} is mounted, and the ledger still owes it`)
        .not.toContain(fn);
      // The reason is shown, not implied: a blank one would render as a dangling separator.
      expect(notEnumerable.trim().length, `${kind} gives no reason it is not enumerable`)
        .toBeGreaterThan(4);
    }
  });

  it('a mounted-but-not-enumerable row says so instead of "no list route yet"', () => {
    for (const { kind, fn, notEnumerable } of marketingNounsWithRouteNotEnumerable()) {
      const def = MARKETING_NOUNS.find((n) => n.kind === kind)!;
      const row = searchMarketingNouns(def.plural).find((r) => r.id === `mkt-noun-${kind}`)!;
      expect(row.sublabel).toContain(fn);
      expect(row.sublabel).toContain(notEnumerable);
      expect(row.sublabel).not.toContain('no list route yet');
      // And it must not imply the palette lists them either.
      expect(row.sublabel).not.toContain('listed on the desk');
    }
  });

  it('only the reply is enumerated client-side, and only from a mounted route', () => {
    const listed = MARKETING_NOUNS.filter((n) => n.reach.via === 'client_list');
    expect(listed.map((n) => n.kind)).toEqual(['reply']);
    // `GET /v1/marketing/queue` is mounted — it is NOT in the owed ledger.
    expect(OWED_ROUTE_FNS).not.toContain('fetchMarketingQueue');
  });
});

describe('nothing in the grammar could publish', () => {
  it('no generated row, code, noun or governed verb reads as a publishing act', () => {
    // The owner constraint, asserted rather than intended. There is no X credential and
    // nothing here may act as the LCX account; a command palette is one Enter away from
    // every verb in the system, so this is the cheapest place to make the absence load-
    // bearing. Scoped by WORKSPACE, not by name: `notify` ("Send notification") is
    // workspace-null, raises an in-app notification, and is excluded because of what it
    // is rather than because it was listed as an exception.
    const offenders = marketingPaletteVocabulary().filter((s) => PUBLISHING_VERB.test(s));
    expect(offenders).toEqual([]);
  });

  it('the regex it is asserted with actually catches a publishing verb', () => {
    // A vacuous invariant is worse than none: it reads as a guarantee. These are the
    // strings a future action would plausibly arrive under.
    for (const bad of ['Post the reply', 'marketing_publish_draft', 'Send to X', 'Schedule a post', 'Tweet it']) {
      expect(PUBLISHING_VERB.test(bad), `${bad} must be caught`).toBe(true);
    }
    // And does not catch the record-keeping vocabulary this compartment is built on.
    for (const ok of ['Disclosure records', 'recordPublicationCloseOut', 'Precedent', 'Inbound replies']) {
      expect(PUBLISHING_VERB.test(ok), `${ok} must not be caught`).toBe(false);
    }
  });
});

describe('the GPS gap this file recorded is closed', () => {
  /*
   * WHAT WAS HERE. Two tests: "GPS still has no palette page rows — noted, another lane
   * owns it", asserting no `/gps*` literal appeared in CommandBody, and its own note that
   * "if someone wires GPS this goes red and gets deleted, which is the correct end for it".
   * GPS Phase 11 wired it. `gpsGrammar.ts` is that lane's file and it did reuse
   * `destinationsUnder`, exactly as the invitation below was written for.
   *
   * The deletion is not silent: what replaces it asserts the gap stayed closed the way it
   * was closed — GENERATED, so no `/gps` literal appears in CommandBody either. A hand-typed
   * `/gps` row would satisfy the old test's opposite and reintroduce the original defect.
   */
  it('GPS reaches the palette without a route literal in CommandBody', () => {
    const gpsDests = destinationsUnder('/gps');
    expect(gpsDests.length).toBeGreaterThan(0);
    for (const d of gpsDests) {
      expect(
        COMMAND_BODY_CODE.includes(`'${d.path}'`),
        `${d.path} is hand-listed in CommandBody — it must come from GPS_PALETTE_PAGES`,
      ).toBe(false);
    }
    expect(COMMAND_BODY_CODE).toContain('...GPS_PALETTE_PAGES');
  });

  it('the generator is not marketing-specific, and that lane did reuse it', () => {
    expect(destinationsUnder('/gps').map((d) => d.path)).toContain('/gps/book');
    // Read from the GPS grammar's own source: the reuse is the point of the invitation in
    // `marketingGrammar.ts`'s header, and a copy of the filter would be the second place
    // both files exist to remove.
    expect(readFileSync(join(HERE, '..', 'gpsGrammar.ts'), 'utf8')).toContain(
      "destinationsUnder(GPS_PATH_PREFIX)",
    );
  });
});
