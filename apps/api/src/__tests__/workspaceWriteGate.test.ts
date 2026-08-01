import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WORKSPACES } from '@lcx/shared';
import { requiresOperate } from '../app.js';

/**
 * "CAN READ THE COMPARTMENT" AND "CAN WRITE A THIRD PARTY'S COMMERCIAL TERMS" WERE THE
 * SAME GRANT.
 *
 * `app.ts` mounted `requireWorkspace(ws.id, 'view')` for every method on every
 * compartment prefix, and no GPS route re-checked the capability — `requireOperator` is
 * authentication, not authorisation. So a member granted `gps:view`, which is exactly
 * what the request-access flow hands out by default (`routes/access.ts`), could
 * `POST /v1/gps/clients`, `/quote`, `/engagements`, `/engagements/:id/status`,
 * `origination/targets`, `milestones/:key/state`, `deliverables`, `evidence` and
 * `loop/outcome`.
 *
 * Latent only because 0047 grants nobody `view` today. One grant away is not a boundary.
 */

const APP = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');

describe('compartment writes require operate, reads require view', () => {
  it('mounts both gates and chooses per request', () => {
    expect(APP).toMatch(/requireWorkspace\(ws\.id, 'view'\)/);
    expect(APP).toMatch(/requireWorkspace\(ws\.id, 'operate'\)/);
    expect(APP).toMatch(/requiresOperate\(c\.req\.method, c\.req\.path\)/);
  });

  it('treats exactly GET, HEAD and OPTIONS as reads', () => {
    const set = APP.match(/READ_METHODS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    const methods = [...set.matchAll(/'([A-Z]+)'/g)].map((m) => m[1]).sort();
    expect(methods).toEqual(['GET', 'HEAD', 'OPTIONS']);
    // POST/PATCH/PUT/DELETE must NOT be in it, which is the whole point.
    for (const w of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(set, `${w} is classified as a read`).not.toContain(w);
    }
  });

  /**
   * THE REGRESSION THE METHOD-ONLY SPLIT INTRODUCED.
   *
   * "Not a GET" is not "mutates". Gating every POST at 'operate' silently removed
   * cited Q&A (/v1/command/ask, /v1/distribution/ask) and ad-hoc reporting
   * (/v1/analytics/reports/run) from every member holding only `view` — a policy
   * change nobody asked for, in compartments the GPS fix was not about.
   */
  describe('the requirement is scoped to state mutation, both ways', () => {
    it('demands operate for every method that can change state', () => {
      for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        expect(requiresOperate(m, '/v1/gps/clients'), m).toBe(true);
      }
      // The exemption is per METHOD as well as per path: only POST asks a question.
      for (const m of ['PATCH', 'PUT', 'DELETE']) {
        expect(requiresOperate(m, '/v1/command/ask'), `${m} /ask`).toBe(true);
      }
      expect(requiresOperate('post', '/v1/gps/engagements')).toBe(true); // case-insensitive
    });

    it('does NOT demand operate for a read-shaped POST', () => {
      for (const p of [
        '/v1/command/ask',
        '/v1/distribution/ask',
        '/v1/analytics/reports/run',
        '/v1/analytics/reports/3f9a-1/run',
      ]) {
        expect(requiresOperate('POST', p), p).toBe(false);
      }
    });

    it('leaves reads at view', () => {
      for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) {
        expect(requiresOperate(m, '/v1/gps/engagements'), m).toBe(false);
      }
    });

    it('keeps /v1/projects/score at operate — it rewrites the scores table', () => {
      // score/batch.ts:165 INSERTs ON CONFLICT DO UPDATE. Read-shaped, not a read.
      expect(requiresOperate('POST', '/v1/projects/score')).toBe(true);
      expect(requiresOperate('POST', '/v1/projects/abc/score')).toBe(true);
    });

    it('exempts nothing under a GPS prefix, and nothing by prefix-match', () => {
      for (const prefix of WORKSPACES.find((w) => w.id === 'gps')!.apiPrefixes) {
        for (const p of [prefix, `${prefix}/clients`, `${prefix}/evidence`, `${prefix}/ask`, `${prefix}/reports/run`]) {
          expect(requiresOperate('POST', p), p).toBe(true);
        }
      }
      // Anchored: an exempt path must not be reachable as a prefix or a suffix.
      for (const p of ['/v1/command/ask/../gps/clients', '/v1/command/askx', '/evil/v1/command/ask', '/v1/command/ask/write']) {
        expect(requiresOperate('POST', p), p).toBe(true);
      }
    });

    it('every write on a gated compartment prefix defaults to operate', () => {
      // Deny-by-default: a new POST route is gated at the write tier until someone
      // deliberately adds it to READ_SHAPED_POSTS.
      for (const ws of WORKSPACES) {
        for (const prefix of ws.apiPrefixes) {
          expect(requiresOperate('POST', `${prefix}/some-new-route`), `${ws.id}${prefix}`).toBe(true);
        }
      }
    });
  });

  it('applies the gate to every declared prefix, exact and wildcard', () => {
    expect(APP).toMatch(/app\.use\(`\$\{prefix\}\/\*`, gate\)/);
    expect(APP).toMatch(/app\.use\(prefix, gate\)/);
    // …and no prefix is mounted with a bare 'view' gate any more.
    expect(APP).not.toMatch(/app\.use\(`\$\{prefix\}\/\*`, requireWorkspace\(ws\.id, 'view'\)\)/);
  });

  it('gates every compartment, not just gps', () => {
    // The capability ladder exists in @lcx/shared for this and no mount was using it.
    expect(APP).toMatch(/for \(const ws of WORKSPACES\)/);
    const loop = APP.slice(APP.indexOf('for (const ws of WORKSPACES)'));
    expect(loop.slice(0, loop.indexOf('app.route('))).not.toMatch(/ws\.id === 'gps'/);
  });
});
