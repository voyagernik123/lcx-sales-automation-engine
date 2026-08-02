import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

import { _resetCorroborationProbe, runPostTimeSweep } from '../postTime.js';
import { resetOEmbedHealth } from '../oembed.js';
import { _resetMigrated } from '../service.js';

/**
 * THE SWEEP MUST NEVER BE ABLE TO POST. Owner constraint 2, held structurally.
 *
 * WHY THIS FILE EXISTS SEPARATELY. `postTime.ts` is the first module in the compartment
 * that is BOTH schedulable and outbound: something will run it unattended, on a timer, with
 * whatever credentials the API process holds. The prohibition is not "we did not write a
 * post button" — it is that no path from a scheduled sweep can reach an X write endpoint,
 * store a credential, or act as the LCX account. A promise in a docblock cannot be checked
 * on the day someone adds a convenient helper; these assertions can.
 *
 * TWO LAYERS, BECAUSE EITHER ALONE IS WEAK. The behavioural half watches the actual
 * requests a full sweep issues, so an indirect call through a helper is still caught. The
 * source half reads this file's own text, so a path that is merely REACHABLE — a write URL
 * behind a flag nobody turned on, an env credential read "for later" — fails before anyone
 * exercises it. A capability that exists in the file is a capability the next change can
 * make live.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, '../postTime.ts'), 'utf8');
/** Comments are prose about the prohibition; the assertions are about executable text. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

interface Seen {
  url: string;
  init: RequestInit | undefined;
}

function pool(): Pool {
  return {
    query: async (sql: string) => {
      if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/FROM marketing_x_reply r/.test(sql)) {
        return {
          rows: [
            {
              id: 41,
              x_comment_id: '1799887766554433221',
              x_post_id: '1799887766554433221',
              author_handle: 'cryptocurious',
              author_display: 'Crypto Curious',
              body: 'eleven days waiting for a withdrawal and no answer from support at all',
              posted_on_displayed: null,
              received_at: '2026-08-02T09:00:00.000Z',
              sender_dkim_domain: 'x.com',
              sender_auth_evidence: 'dkim=pass header.d=x.com',
            },
          ],
          rowCount: 1,
        };
      }
      if (/count\(posted_on_displayed\)/.test(sql)) {
        return {
          rows: [{ rows_held: 4, with_post_date: 1, lookup_eligible: 4, earliest: '2026-07-01T00:00:00.000Z' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Pool;
}

beforeEach(() => {
  resetOEmbedHealth();
  _resetMigrated();
  _resetCorroborationProbe();
});

describe('every request a full sweep issues', () => {
  async function requestsOf(): Promise<Seen[]> {
    const seen: Seen[] = [];
    const spy: typeof fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      return {
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            url: 'https://twitter.com/cryptocurious/status/1799887766554433221',
            author_name: 'Crypto Curious',
            author_url: 'https://twitter.com/cryptocurious',
            html:
              '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">eleven days waiting for a '
              + 'withdrawal and no answer from support at all</p>&mdash; Crypto Curious '
              + '(@cryptocurious) <a href="https://twitter.com/cryptocurious/status/1799887766554433221">'
              + 'August 1, 2026</a></blockquote>',
          }),
      };
    }) as unknown as typeof fetch;
    const out = await runPostTimeSweep(pool(), { fetchImpl: spy, now: () => new Date('2026-08-02T10:00:00.000Z') });
    expect(out.ok).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    return seen;
  }

  it('is a GET', async () => {
    for (const r of await requestsOf()) expect(r.init?.method).toBe('GET');
  });

  it('carries no request body, so there is nothing that could be a post', async () => {
    for (const r of await requestsOf()) expect(r.init?.body).toBeUndefined();
  });

  it('goes only to the documented keyless endpoint', async () => {
    for (const r of await requestsOf()) {
      expect(r.url.startsWith('https://publish.twitter.com/oembed?')).toBe(true);
    }
  });

  /**
   * NOT EVEN THE UNDOCUMENTED ONE. `cdn.syndication.twimg.com` is off by default and graded
   * D4; a scheduled job that quietly enabled it would put an undocumented source behind
   * every grade on the desk, at cron frequency.
   */
  it('never touches the undocumented syndication backend', async () => {
    for (const r of await requestsOf()) expect(r.url).not.toContain('syndication');
  });

  it('sends no authorization or cookie header', async () => {
    for (const r of await requestsOf()) {
      const headers = (r.init?.headers ?? {}) as Record<string, string>;
      const names = Object.keys(headers).map((k) => k.toLowerCase());
      expect(names).not.toContain('authorization');
      expect(names).not.toContain('cookie');
      expect(names).not.toContain('x-csrf-token');
      // What it DOES send: an honest user agent and an Accept. Nothing that identifies LCX
      // as a logged-in party.
      expect(names).toContain('accept');
    }
  });
});

describe('the source of postTime.ts', () => {
  it('names no X write endpoint or posting verb', () => {
    for (const forbidden of [
      'api.twitter.com',
      'api.x.com',
      'statuses/update',
      '/2/tweets',
      'upload.twitter.com',
      'oauth',
    ]) {
      expect(CODE.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('issues no HTTP verb of its own — the one request is oembed.ts’s GET', () => {
    expect(CODE).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
    // It does not call `fetch` at all: the only network call is `fetchOEmbed`.
    expect(CODE).not.toMatch(/\bfetch\s*\(/);
    expect(CODE).toContain('fetchOEmbed(');
  });

  it('reads no environment variable, so it cannot hold a credential', () => {
    expect(CODE).not.toContain('process.env');
    for (const secret of ['bearer', 'apiKey', 'api_key', 'accessToken', 'access_token', 'consumerSecret']) {
      expect(CODE.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  /**
   * NO DELETE, NO TRUNCATE, NO DROP. The sweep's writes are one UPSERT into the
   * corroboration table and `recordPostedOn`'s single-column UPDATE. It must not be able to
   * remove the record MiCA requires to be kept, and it must not rewrite a stranger's stored
   * comment.
   */
  it('destroys nothing and rewrites no content', () => {
    // Matched as SQL statements rather than as substrings: the word "truncated" appears in
    // the marker this module puts on a clipped disagreement value, which is not a verb.
    for (const statement of [/\bDELETE\s+FROM\b/i, /\bTRUNCATE\s+(TABLE\s+)?\w/i, /\bDROP\s+TABLE\b/i, /\bALTER\s+TABLE\b/i]) {
      expect(CODE).not.toMatch(statement);
    }
    expect(CODE).not.toMatch(/SET\s+body\s*=/i);
    expect(CODE).not.toMatch(/SET\s+quarantined\s*=/i);
  });

  /**
   * THE STANDARD FOR THIS WAVE, ASSERTED ON THE FILE ITSELF: no test is skipped past, no
   * lint rule is switched off, and no type error is waved through. A module that needed any
   * of those to pass would not be evidence of anything.
   */
  it('suppresses no check', () => {
    for (const escape of ['eslint-disable', '@ts-ignore', '@ts-expect-error', '@ts-nocheck']) {
      expect(SOURCE).not.toContain(escape);
    }
  });
});
