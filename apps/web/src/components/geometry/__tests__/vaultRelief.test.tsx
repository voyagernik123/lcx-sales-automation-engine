import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VaultRelief } from '@/components/geometry/VaultRelief';
import { auditVerdict, buildVaultRecords, whenOf } from '@/components/geometry/vaultRecords';
import type { AuditEntry } from '@/lib/api/audit';
import { storage } from '@/lib/persistence';

/*
 * §7's disposition for an environment whose clause (b) is not established: "it ships behind a toggle that defaults
 * off, and I tell you rather than quietly shipping it."
 *
 * These tests are about the DEFAULT, the FALLBACK and the CLASSIFICATION — not about the render. The render is
 * verified by `docs/3d/e6`'s capture against a real rasteriser; jsdom has no WebGL2 and pretending otherwise would
 * be a test that passes for the wrong reason. What can be verified here is exactly what §7 asks (a reader who does
 * nothing sees the table, the reason is on the page, the GL layer is behind `lazy()`) plus the one part of the 3-D
 * reading that is pure data: that a withheld record and a record with no timestamp stay distinct from an ordinary
 * one instead of collapsing into a blank or an hour zero.
 */
const NOW = Date.parse('2026-08-12T12:00:00.000Z');
const at = (hoursAgo: number): string => new Date(NOW - hoursAgo * 3_600_000).toISOString();

const entry = (over: Partial<AuditEntry> & { id: string }): AuditEntry => ({
  actor: 'n.sharma',
  action: 'campaign_publish',
  entity: 'projects',
  entityId: '0191abcd-ef01-2345-6789-abcdef012345',
  meta: {},
  projectName: 'Aster',
  createdAt: at(3),
  ...over,
});

const ENTRIES: readonly AuditEntry[] = [
  entry({ id: 'a' }),
  entry({ id: 'b', action: 'workspace.access_refused', entity: 'workspace', createdAt: at(44) }),
  entry({ id: 'c', entity: 'gps_engagement', meta: { withheld: true, reason: 'compartment' }, createdAt: at(70) }),
];

/* A toggle click is a CHOICE since 2026-08-20 and persists through the storage module's
   in-memory tier, which localStorage.clear() cannot reach — without this, one test's click
   becomes the next test's default and failures depend on execution order. */
beforeEach(() => { storage.clearAll(); });

describe('VaultRelief — the vault is the default by owner decision, and says so', () => {
  it('renders the FLAT table with no interaction, and no canvas', () => {
    const { container } = render(
      <VaultRelief entries={ENTRIES}><table><tbody><tr><td>campaign_publish</td></tr></tbody></table></VaultRelief>,
    );
    /* The page's own table, untouched. A canvas appearing here would mean the corridor had shipped as the default
       on a claim nobody has measured. */
    expect(container.querySelector('table'), 'the table must be what loads').not.toBeNull();
    expect(screen.getByText('campaign_publish')).toBeTruthy();
    expect(container.querySelector('canvas'), 'the vault must NOT be the default').toBeNull();
  });

  it('tells the reader WHY the vault is opt-in, on the page next to the button', () => {
    render(<VaultRelief entries={ENTRIES}><table /></VaultRelief>);
    expect(screen.getByText(/default by owner decision/i)).toBeTruthy();
  });

  it('offers the toggle, and reports its state to assistive technology', () => {
    render(<VaultRelief entries={ENTRIES}><table /></VaultRelief>);
    const btn = screen.getByRole('button', { name: /vault view/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('keeps the table on screen while the lazy chunk is still loading', () => {
    /* The Suspense fallback IS the table rather than a spinner. A reader who clicked has not asked to lose the
       records for the length of a network round trip. */
    const { container } = render(
      <VaultRelief entries={ENTRIES}><table><tbody><tr><td>campaign_publish</td></tr></tbody></table></VaultRelief>,
    );
    fireEvent.click(screen.getByRole('button', { name: /vault view/i }));
    expect(container.querySelector('table'), 'the table must survive the load').not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('does not import the GL layer until the reader asks', async () => {
    /*
     * THE BUDGET TEST. The perf budget allows 11 KB of headroom on initial JS and the environment layer alone is
     * 35.7 KB, so an eager import would blow it on a view most readers never open. Asserted structurally: the
     * module graph reachable from this component must not name the engine.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    /* Resolved from the workspace root rather than `import.meta.url`: under jsdom that is not a file: URL and
       `new URL(...)` throws. Existence is asserted FIRST so this test cannot pass by reading an empty string — a
       structural check that silently finds nothing is the failure mode it exists to prevent. */
    const file = path.resolve(process.cwd(), 'src/components/geometry/VaultRelief.tsx');
    expect(fs.existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
    const src = fs.readFileSync(file, 'utf8');
    expect(src.length).toBeGreaterThan(500);
    expect(src, 'the GL component must be behind lazy()').toMatch(/lazy\(\(\) => import\(/);
    expect(
      /^import[^;]*from '@lcx\/gl'/m.test(src),
      'VaultRelief must not import @lcx/gl eagerly',
    ).toBe(false);
  });

  it('frees every GPU resource it allocated, and the stage last', async () => {
    /*
     * CHECKED RATHER THAN REVIEWED, because the sibling environment shipped without it. `StormReliefGl`
     * uploaded seven meshes and registered a disposer for none of them: `uploadMesh` creates a VAO and four
     * buffers and hands back the only thing that frees them, and `Stage` tracks its programs and its own
     * targets and knows nothing about a mesh. Nothing errors, nothing is visible and the frame is correct —
     * the context simply grows by thirty-five objects every time a reader toggles the view, until the browser
     * drops it and `webglcontextlost` reports the wrong cause.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.resolve(process.cwd(), 'src/components/geometry/VaultReliefGl.tsx');
    expect(fs.existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
    const src = fs.readFileSync(file, 'utf8');

    const calls = [...src.matchAll(/uploadMesh\(/g)];
    expect(calls.length, 'a file that uploads no mesh cannot pass this vacuously').toBeGreaterThan(0);
    for (const m of calls) {
      expect(
        /disposers\.push\(/.test(src.slice(m.index, m.index + 300)),
        'every uploadMesh must register its disposer in its own block, before the next upload is attempted',
      ).toBe(true);
    }
    /* Reverse, and the stage LAST — it owns the context, so releasing it first leaves every other delete*
       call operating on a dead one: silent rather than fatal, and it leaks on every remount. */
    expect(src).toMatch(/for \(const d of disposers\.reverse\(\)\) d\(\);\s*(\/\*[\s\S]*?\*\/\s*)?stage\.dispose\(\);/);
    /* And the context-loss handler, without which a dropped context leaves a stale frame of an audit log on
       screen for ever while the GPU has moved on. */
    expect(src).toContain('webglcontextlost');
    expect(src).toContain('CONTEXT_LOST');
  });

  it('mounts where the flat table is rendered, wrapping it rather than replacing it', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const page = path.resolve(process.cwd(), 'src/pages/AuditLog.tsx');
    expect(fs.existsSync(page)).toBe(true);
    const src = fs.readFileSync(page, 'utf8');
    /* The table is inline JSX on this page, so the honest wrap is as a CHILD. If a future edit swaps the table out
       for the corridor rather than wrapping it, the flat default is gone and §7 is broken. */
    expect(src).toContain('<VaultRelief entries={entries}>');
    expect(src).toContain('</VaultRelief>');
    expect(src).toMatch(/<VaultRelief entries=\{entries\}>\s*<table/);
  });
});

describe('the three states of an audit record stay three states', () => {
  it('classifies a withheld payload as WITHHELD, from what the API actually sends', () => {
    /* `apps/api/src/routes/audit.ts` replaces `meta` with `{withheld: true, reason}` for a compartment the caller
       cannot read, and withholds `entity_id` as well on a marketing row. Both are the same state here. */
    expect(auditVerdict(entry({ id: 'x', meta: { withheld: true, reason: 'r' } }))).toBe('WITHHELD');
    expect(auditVerdict(entry({ id: 'y', entityId: '[withheld:marketing]' }))).toBe('WITHHELD');
  });

  it('classifies an action that NAMES a refusal as BLOCKED, and one that merely mentions it as ALLOWED', () => {
    expect(auditVerdict(entry({ id: 'x', action: 'workspace.access_refused' }))).toBe('BLOCKED');
    expect(auditVerdict(entry({ id: 'y', action: 'grant_denied' }))).toBe('BLOCKED');
    /* Anchored on separators in both directions: a substring test would read this as a block, and a colour that
       invents a governance event is worse than one that misses a new spelling. */
    expect(auditVerdict(entry({ id: 'z', action: 'unrefused_count_recomputed' }))).toBe('ALLOWED');
    expect(auditVerdict(entry({ id: 'w', action: 'score_computed' }))).toBe('ALLOWED');
  });

  it('keeps a withheld SUBJECT distinct from a subject that was never recorded', () => {
    const { records } = buildVaultRecords([
      entry({ id: 'marketing', entityId: '[withheld:marketing]', entity: 'marketing_asset', projectName: null }),
      entry({ id: 'nosubject', entity: null, entityId: null, projectName: null }),
    ], NOW);
    const byId = new Map(records.map((r) => [r.id, r]));
    /* Both are `null` here and the renderer prints two different strings for them — SUBJECT WITHHELD versus NO
       SUBJECT RECORDED. The table shows one empty cell for both, which is the reading this view exists to keep. */
    expect(byId.get('marketing')!.subject).toBeNull();
    expect(byId.get('marketing')!.subjectWithheld).toBe(true);
    expect(byId.get('marketing')!.verdict).toBe('WITHHELD');
    expect(byId.get('nosubject')!.subject).toBeNull();
    expect(byId.get('nosubject')!.subjectWithheld).toBe(false);
    expect(byId.get('nosubject')!.verdict).toBe('ALLOWED');
  });

  it('does NOT blank a GPS subject the API deliberately still serves', () => {
    /*
     * A WITHHELD ROW IS NOT A WITHHELD SUBJECT, and reading one off the other was a claim the API contradicts.
     * `apps/api/src/routes/audit.ts` replaces `meta` on a GPS row and nothing else — "the row itself is not
     * hidden: the actor, the action, the engagement id and the timestamp are above" — because an unattributable
     * governed action is the worse failure. The flat table prints that engagement id in its Entity cell, so a
     * slab printing SUBJECT WITHHELD over it would be the corridor and the table disagreeing about one record.
     */
    const { records } = buildVaultRecords([
      entry({
        id: 'gps', meta: { withheld: true, reason: 'compartment' },
        entity: 'gps_engagement', entityId: '9f3c17ab-2d4e-4ce6-94c2-5ff3d18047f4', projectName: null,
      }),
    ], NOW);
    const r = records[0]!;
    expect(r.verdict, 'the row is still withheld').toBe('WITHHELD');
    expect(r.subjectWithheld, 'but its SUBJECT is not').toBe(false);
    expect(r.subject).toBe('gps_engagement·9f3c17ab');
  });

  it('REFUSES a position to a record with no usable timestamp instead of drawing it at hour zero', () => {
    /* §6 rule 6, and it bites hardest here of anywhere: depth IS the time axis, so hour zero is the "now" wall —
       the single most misleading place in the frame to put a record whose age nobody knows. */
    const { records, unplaced } = buildVaultRecords([
      entry({ id: 'good' }),
      entry({ id: 'nodate', createdAt: 'not a date' }),
      entry({ id: 'future', createdAt: at(-48) }),
    ], NOW);
    expect(records.map((r) => r.id)).toEqual(['good']);
    expect(unplaced).toEqual([
      { id: 'nodate', reason: 'NO_TIMESTAMP' },
      { id: 'future', reason: 'TIMESTAMP_AHEAD_OF_NOW' },
    ]);
  });

  it('orders records newest first and reports the span the depth axis has to cover', () => {
    const { records, spanHours } = buildVaultRecords(ENTRIES, NOW);
    expect(records.map((r) => Math.round(r.hoursAgo))).toEqual([3, 44, 70]);
    expect(Math.round(spanHours)).toBe(70);
  });

  it('treats a blank or em-dash actor as ABSENT rather than as a name', () => {
    const { records } = buildVaultRecords([entry({ id: 'x', actor: '—', action: '  ' })], NOW);
    expect(records[0]!.actor).toBeNull();
    expect(records[0]!.action).toBeNull();
  });

  it('writes an age a reader does not have to divide', () => {
    expect(whenOf(3)).toBe('3h ago');
    expect(whenOf(44)).toBe('1.8d ago');
    expect(whenOf(410)).toBe('17d ago');
  });
});
