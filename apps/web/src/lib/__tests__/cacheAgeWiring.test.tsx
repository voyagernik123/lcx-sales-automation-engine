/**
 * The affordance is APPLIED, and applied to real endpoints (handover, T1 #22).
 *
 * This repo has shipped a focus utility that was referenced at zero sites, so
 * Tailwind purged it and it did not exist. A chip nothing renders is the same
 * defect wearing a different hat, and neither a unit test on the derivation nor a
 * type-check would notice. So this file asserts two things a reviewer cannot
 * eyeball: that the chip is rendered on real surfaces, and that every path it is
 * pointed at is one the read cache can actually serve — a typo, or a chip aimed at
 * a never-cacheable endpoint, renders nothing forever and teaches nothing.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { isCacheable } from '@/lib/readPolicy';
import { noteServed, _resetReadCache } from '@/lib/readCache';
import { CacheAge } from '@/components/ui/CacheAge';

const SRC = join(__dirname, '..', '..');
/** The affordance's own definition — a self-reference would prove nothing. */
const OWN_FILE = join(SRC, 'components', 'ui', 'CacheAge.tsx');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

/** Every `<CacheAge path="…"` in the tree, as [file, path] pairs. */
function callSites(): Array<{ file: string; path: string }> {
  const found: Array<{ file: string; path: string }> = [];
  for (const file of walk(SRC)) {
    if (file === OWN_FILE) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<CacheAge\s+path="([^"]+)"/g)) {
      found.push({ file: file.slice(SRC.length + 1), path: m[1] });
    }
  }
  return found;
}

describe('the chip is wired into the app', () => {
  const sites = callSites();

  it('scans a real tree', () => {
    expect(walk(SRC).length).toBeGreaterThan(100);
  });

  it('is rendered on at least one surface that is not its own definition', () => {
    // Deliberately a floor, not an exact count: the remaining surfaces are a
    // named follow-up and adding one must not break this.
    expect(sites.length).toBeGreaterThanOrEqual(3);
  });

  it('is only ever pointed at a path the read cache can serve', () => {
    const dead = sites.filter((s) => !isCacheable(s.path));
    // A chip on a never-cacheable path — or on a typo — is invisible forever.
    expect(dead).toEqual([]);
  });
});

describe('the chip says nothing about a live value', () => {
  beforeEach(() => _resetReadCache());

  it('renders no element at all when the body came off the wire', () => {
    noteServed('/v1/kpis', { storedAt: Date.now(), fromCache: false });
    const { container } = render(<CacheAge path="/v1/kpis" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders no element for a path nothing has read', () => {
    const { container } = render(<CacheAge path="/v1/kpis" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the age when the body came out of the cache', () => {
    noteServed('/v1/kpis', { storedAt: Date.now() - 4 * 60_000, fromCache: true });
    render(<CacheAge path="/v1/kpis" />);
    expect(screen.getByText('4m old')).toBeInTheDocument();
  });

  it('carries the exact stamp in the tooltip, not just a rounded age', () => {
    const storedAt = Date.UTC(2026, 6, 25, 9, 5);
    noteServed('/v1/kpis', { storedAt, fromCache: true });
    render(<CacheAge path="/v1/kpis" />);
    // Fixed instant, formatted in UTC by lib/format — no local-timezone dependency.
    expect(screen.getByTitle(/received Jul 25, 09:05 UTC/)).toBeInTheDocument();
  });

  it('canonicalises, so a differently-ordered query still finds the age', () => {
    noteServed('/v1/projects?a=1&b=2', { storedAt: Date.now() - 120_000, fromCache: true });
    render(<CacheAge path="/v1/projects?b=2&a=1" />);
    expect(screen.getByText('2m old')).toBeInTheDocument();
  });
});
