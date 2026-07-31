import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ONE CONNECTIVITY AUTHORITY.
 *
 * Observed in production: the status bar showed a red API DOWN while the page
 * beside it rendered the Marketing summary, the KPI ticker and a live reply count
 * from that same API — and the OfflineBanner, three components away, correctly
 * showed nothing. Two indicators, one session, opposite verdicts.
 *
 * The cause was that `Footer` kept a private `ok` boolean flipped by a single
 * /health ping every 60s, while `OfflineBanner` used `lib/online` — which
 * accumulates evidence from every request the client makes, requires two
 * consecutive transport failures before it will say 'degraded', and treats a
 * 4xx/5xx as proof the API answered. The footer's signal could not tell "nothing
 * answered" from "answered 500", and one blip pinned it red for a minute.
 *
 * This is source-level because the defect is architectural — a component deciding
 * connectivity for itself — and a rendering test would pass just as happily with
 * two disagreeing sources as with one.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

const FOOTER = 'components/layout/Footer.tsx';
const BANNER = 'components/layout/OfflineBanner.tsx';

describe('every connectivity indicator reads the same source', () => {
  it('the footer subscribes to lib/online', () => {
    const src = strip(read(FOOTER));
    expect(src).toContain('subscribeOnline');
    expect(src).toMatch(/from '@\/lib\/online'/);
  });

  it('the offline banner still does too', () => {
    expect(strip(read(BANNER))).toContain('subscribeOnline');
  });

  it('the footer keeps no private up/down flag', () => {
    const src = strip(read(FOOTER));
    // The exact shape of the old bug: `ok` in the health state, flipped in a
    // catch. Either half returning is the regression.
    expect(src).not.toMatch(/\bok:\s*(true|false)\b/);
    expect(src).not.toMatch(/setApi\([^)]*ok:\s*false/);
  });

  it('the footer does not derive its label from a health-ping rejection', () => {
    // The ping may still MEASURE (latency, sync age). It must not adjudicate.
    const src = strip(read(FOOTER));
    const ping = src.slice(src.indexOf('const ping'));
    const body = ping.slice(0, ping.indexOf('void ping()'));
    const afterCatch = body.slice(body.indexOf('catch'));
    expect(
      afterCatch,
      'the health ping\'s catch block sets component state again — that is the second, ' +
        'weaker verdict this test exists to prevent',
    ).not.toMatch(/setApi|setConn/);
  });
});

describe('the three states are all reachable in the footer', () => {
  const src = strip(read(FOOTER));

  it('renders a distinct degraded state, not just up/down', () => {
    // "Requests are not landing" was previously reported as DOWN, which sent an
    // operator looking for an outage that did not exist.
    expect(src).toContain('DEGRADED');
    expect(src).toMatch(/'degraded'/);
  });

  it('still renders down, and reserves red for it', () => {
    expect(src).toContain('API DOWN');
    expect(src).toMatch(/bg-red-500/);
    expect(src).toMatch(/bg-amber-500/);
    expect(src).toMatch(/bg-emerald-500/);
  });
});

describe('the login screen does not claim an outage it has not proven', () => {
  const src = strip(read('pages/SelectOperator.tsx'));

  it('probes reachability before saying API DOWN', () => {
    // A CORS denial and a dead host are the same opaque TypeError; only a
    // no-cors probe separates them. See lib/reachability.
    expect(src).toContain('classifyUnreachable');
    expect(src).toContain('ORIGIN BLOCKED');
  });

  it('reserves API DOWN for the case where nothing answered', () => {
    expect(src).toMatch(/reach === 'origin-blocked'/);
  });
});
