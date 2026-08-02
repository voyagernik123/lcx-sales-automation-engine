// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETING_VOCABULARY_OWED } from '../marketing';

/**
 * THE ABSENCES — the guarantees this client keeps by NOT containing something.
 *
 * The owner's constraint on the whole compartment is that nothing here can act as
 * the LCX account: draft, then a human sends by hand, outside this system. An
 * absence is the only guarantee in software that cannot be defeated by a defect —
 * but it is also the only guarantee nothing enforces, because there is no failing
 * test for code somebody has not written yet. This is that test.
 *
 * It reads `lib/api/marketing.ts` as text. That is on purpose: a type-level or
 * import-level check would pass on a publish function that was merely unused, and
 * the point is that the capability must not exist at all.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, '../marketing.ts'), 'utf8');

/**
 * THE SAME FILE WITH ITS COMMENTS REMOVED, and every count below is taken from
 * this rather than from `SRC`.
 *
 * Not a nicety: the module's header explains its own discipline by quoting
 * `auth: true`, so counting occurrences in the raw text reported 29 options for
 * 28 calls and the first version of this test failed on its own documentation.
 * A rule about code has to be measured on code. `SRC` is still used for the
 * assertions that are genuinely about the prose — the ceiling and the reasons
 * being written down where the next reader will hit them.
 */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** Every exported identifier, whatever kind it is. */
const exportedNames = [...CODE.matchAll(
  /^export (?:const|function|interface|type|class) (\w+)/gm,
)].map((m) => m[1]!);

/** The literal first argument of every `request<…>(…)` call in the file. */
const requestPaths = [...CODE.matchAll(
  /request<[^>]*>\(\s*(`[^`]*`|'[^']*')/g,
)].map((m) => m[1]!.slice(1, -1));

describe('there is no path to publish, post or send', () => {
  it('no exported name carries a publishing verb', () => {
    // `recordPublicationCloseOut` is deliberately NOT caught by this list, and the
    // distinction is the compartment's whole design: it records what a human
    // already published, by hand, elsewhere. The software is the witness, never
    // the actuator. 'publicat' is not 'publish' and the difference is direction.
    const forbidden = [
      'publish', 'post', 'send', 'tweet', 'schedule', 'credential',
      'oauth', 'apikey', 'session', 'automat', 'xapi', 'bearer',
    ];
    const offenders = exportedNames.filter(
      (n) => forbidden.some((f) => n.toLowerCase().includes(f)),
    );
    expect(
      offenders,
      'an export named for a publishing verb is the first step in letting a software '
      + 'defect speak for LCX. If a name is innocent, rename it; if the capability is '
      + 'real, it does not belong in this compartment at all.',
    ).toEqual([]);
  });

  it('every network call is a relative /v1/marketing path', () => {
    // No absolute URL anywhere: the browser must never talk to X, an oEmbed
    // endpoint or a syndication host directly. Those reads happen server-side,
    // where the response can be graded, recorded and rate-limited — and where a
    // user's IP and referer are not handed to a third party. A doc comment may
    // name `publish.twitter.com`; a call site may not.
    expect(requestPaths.length, 'no request calls found — the regex has drifted')
      .toBeGreaterThan(20);
    for (const p of requestPaths) {
      expect(p, `${p} is not a relative /v1/marketing path`).toMatch(/^\/v1\/marketing/);
    }
  });

  it('there is no second fetch layer beside `request`', () => {
    for (const escape of ['fetch(', 'XMLHttpRequest', 'axios', 'new WebSocket', 'EventSource']) {
      expect(CODE, `${escape} bypasses apiClient, its auth and its audit headers`)
        .not.toContain(escape);
    }
  });
});

describe('the envelope reaches the browser on every read', () => {
  it('every request is unwrapped with the meta-carrying helper', () => {
    const requests = (CODE.match(/request</g) ?? []).length;
    const unwrapped = (CODE.match(/unwrap\(request</g) ?? []).length;
    expect(
      unwrapped,
      'a fetcher that peels `.data` by hand drops `migrated: false`, the provenance '
      + 'trail and every "we cannot see this" notice — which is how seven surfaces '
      + 'silently lost them last week. See lib/api/meta.ts.',
    ).toBe(requests);
  });

  it('every request is authenticated', () => {
    const requests = (CODE.match(/request</g) ?? []).length;
    const authed = (CODE.match(/auth: true/g) ?? []).length;
    expect(authed, 'an unauthenticated marketing read would sit outside the workspace gate')
      .toBe(requests);
  });

  it('the helper is the shared one, not a local copy', () => {
    // Eight GPS modules each declared `p.then((r) => r.data)` and each dropped the
    // envelope. One implementation, imported.
    expect(SRC).toContain("import { unwrapWithMeta } from './meta.js'");
    expect(CODE, 'a hand-rolled unwrap is how the envelope died the first time')
      .not.toMatch(/=>\s*p\.then\(\(r\)\s*=>\s*r\.data\)/);
  });
});

describe('the shared vocabulary is not re-declared here', () => {
  it('no union member of a shared marketing type appears as a literal', () => {
    // These are members of `EngagementVerb`, `ContentSurface`,
    // `MarketingJurisdiction`, `AssetEmbargoState`, `HoldingsDeclarationState`,
    // `ProductRegulatoryStatus` and `ConsiderationKind`, all declared once in
    // `packages/shared/src/marketing/types.ts`. Finding one here means somebody
    // hand-copied the compartment's vocabulary into the client rather than
    // waiting for the re-export — and two vocabularies agree only until one of
    // them changes.
    for (const member of [
      "'repost'", "'quote'", "'correction'", "'pinned_post'", "'thread_in_progress'",
      "'eea_other'", "'mnpi_pending'", "'declared_holding'", "'register_absent'",
      "'mica_regulated'", "'unsolicited_gift'", "'affiliate_commission'",
    ]) {
      expect(CODE, `${member} belongs to a shared union, not to the web client`)
        .not.toContain(member);
    }
  });

  it('the vocabulary debt is recorded rather than silently absorbed', () => {
    // If the `string` typing were quietly forgotten, this ledger would be the
    // only thing left saying the fields are under-specified on purpose.
    expect(MARKETING_VOCABULARY_OWED.length).toBeGreaterThan(5);
    for (const symbol of MARKETING_VOCABULARY_OWED) {
      expect(SRC, `${symbol} is listed as owed but never mentioned`).toContain(symbol);
    }
    // And the reason has to stay in the file, because the next reader's first
    // instinct will be to "fix" the `string`s by writing the unions here.
    expect(SRC).toContain('packages/shared/src/index.ts');
  });
});

describe('the honesty ceiling has no way into a payload from here', () => {
  it('no metric that needs a denominator we do not have is named', () => {
    // Each of these needs an audience denominator that does not exist without an
    // X credential, and there is no credential and never will be. A field name
    // here would be a request for a number the API cannot honestly produce.
    for (const banned of [
      'impressions', 'reach', 'followerDelta', 'engagementRate',
      'clickThrough', 'shareOfVoice', 'audienceSentiment',
    ]) {
      const identifierUse = new RegExp(`\\b${banned}\\b\\s*[?:]`);
      expect(CODE, `${banned} cannot be measured keyless — it may be named in prose, not typed`)
        .not.toMatch(identifierUse);
    }
  });

  it('the ceiling is written down where the next reader will hit it', () => {
    expect(SRC).toContain('honesty ceiling');
    expect(SRC, 'observed counts are lower bounds and the naming rule has to survive')
      .toContain('repliesObserved');
  });
});
