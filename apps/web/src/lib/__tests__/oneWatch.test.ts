import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WATCH_RANK, rankWatchItems } from '@lcx/shared';

/**
 * THE ONE-WATCH RATCHET — S4 of INSTRUMENT_100X_PLAN.md, made mechanical.
 *
 * S0 measured 49 ambient animations against a feel layer wired to five files: every motion in the
 * app was the app talking about itself. S4 makes the arrival sweep the ONLY motion and wires the feel
 * layer at the one seam every governed action passes through. This file keeps both permanent:
 *
 *   · no decorative beacon anywhere in src — a state is a colour and a word, not a pulse;
 *   · `animate-pulse` survives only inside LoadingSkeleton, where a request is in flight;
 *   · the governed-action invoker itself plays `commit` / `refuse`, so no page has to remember;
 *   · the ranking prior is one exported constant, in the order the plan states, and the sort obeys it;
 *   · the arrival is driven from ONE mount in the shell and owns no private timer.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!/__tests__|e2e|node_modules/.test(n)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|\.spec\./.test(n)) out.push(p);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
const rel = (p: string) => p.slice(SRC.length + 1);

describe('the watch', () => {
  it('no decorative beacon survives in src', () => {
    const offenders = walk(SRC).filter((f) => /animate-pulse-beacon/.test(strip(readFileSync(f, 'utf8')))).map(rel).sort();
    expect(offenders, 'a pulsing dot says nothing a still dot in the state colour does not — S4 retired them').toEqual([]);
  });

  it('animate-pulse survives only where a request is in flight (LoadingSkeleton)', () => {
    const offenders = walk(SRC).filter((f) => /\banimate-pulse\b/.test(strip(readFileSync(f, 'utf8')))).map(rel).sort();
    expect(offenders).toEqual(['components/shared/LoadingSkeleton.tsx']);
  });

  it('the governed-action invoker plays the feel itself', () => {
    const src = strip(readFileSync(join(SRC, 'components/command/invoke.ts'), 'utf8'));
    expect(src).toMatch(/\bcommit\(/);
    expect(src).toMatch(/\brefuse\(/);
  });

  it('the ranking prior is money > liability > deadline > activity, and the sort obeys it', () => {
    expect([...WATCH_RANK]).toEqual(['money', 'liability', 'deadline', 'activity']);
    const at = (s: string) => `2026-09-01T${s}:00.000Z`;
    const ranked = rankWatchItems([
      { id: 'a', workspace: 'sales', kind: 'activity', title: 'a', detail: '', href: null, at: at('12:00'), source: 'audit' },
      { id: 'l', workspace: 'gps', kind: 'liability', title: 'l', detail: '', href: null, at: at('09:00'), source: 'perimeter' },
      { id: 'm-old', workspace: 'gps', kind: 'money', title: 'm1', detail: '', href: null, at: at('08:00'), source: 'invoice' },
      { id: 'm-new', workspace: 'gps', kind: 'money', title: 'm2', detail: '', href: null, at: at('11:00'), source: 'table' },
      { id: 'd', workspace: 'sales', kind: 'deadline', title: 'd', detail: '', href: null, at: at('10:00'), source: 'table' },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['m-new', 'm-old', 'l', 'd', 'a']);
    expect(ranked.map((r) => r.rank)).toEqual([0, 1, 2, 3, 4]);
  });

  it('the arrival is mounted once in the shell and owns no private timer', () => {
    const top = readFileSync(join(SRC, 'components/layout/TopNav.tsx'), 'utf8');
    expect(top).toMatch(/<WatchStrip\s*\/>/);
    const arrival = strip(readFileSync(join(SRC, 'lib/useArrival.ts'), 'utf8'));
    expect(arrival).not.toMatch(/setTimeout|setInterval/);
    expect(arrival).toMatch(/every\(/);
    // Exactly one driver mount: readers use the store, never the hook.
    const mounts = walk(SRC)
      .filter((f) => rel(f) !== 'lib/useArrival.ts')
      .filter((f) => /\buseArrival\(\)/.test(strip(readFileSync(f, 'utf8'))))
      .map(rel)
      .sort();
    expect(mounts).toEqual(['components/layout/WatchStrip.tsx']);
  });
});
