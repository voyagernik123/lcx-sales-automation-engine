import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESTINATIONS, GO_KEYS, MENU_ROUTES } from '../destinations';

/**
 * The Rust menu and the TypeScript grammar must name the same destinations.
 *
 * This is the one drift in the app that no compiler can catch: `apps/desktop`
 * builds separately, so a menu id renamed on either side produces a menu item that
 * silently does nothing, in the packaged app only, where nobody runs the tests.
 * Same reasoning as the action-manifest drift test from Phase 3 — if two artefacts
 * have to agree and only one is type-checked, the agreement needs a test.
 */

const MENU_RS = join(__dirname, '..', '..', '..', '..', 'desktop', 'src-tauri', 'src', 'lib.rs');

describe('destinations', () => {
  const rust = readFileSync(MENU_RS, 'utf8');

  it('the Rust menu is readable from here at all', () => {
    // If the desktop app moves, this test must fail loudly rather than silently
    // asserting nothing — an empty haystack makes every "is it present?" check
    // below vacuously passable in the other direction.
    expect(rust).toContain('MenuItem::with_id');
  });

  it('every go-* menu id in the Rust menu has a destination', () => {
    const ids = [...rust.matchAll(/with_id\(app,\s*"(go-[a-z-]+)"/g)].map((m) => m[1]);
    // Back/Forward are history verbs, not destinations, and the command palette is
    // its own overlay.
    const navigational = ids.filter((id) => !['go-back', 'go-forward', 'go-command'].includes(id));
    expect(navigational.length, 'no go-* ids found — has the menu been rewritten?').toBeGreaterThan(5);
    for (const id of navigational) {
      expect(MENU_ROUTES[id], `${id} is in the native menu with no route in destinations.ts`).toBeTruthy();
    }
  });

  it('every destination is reachable from the native menu', () => {
    for (const d of DESTINATIONS) {
      expect(rust, `${d.id} has a route and a g-key but no menu item`).toContain(`"${d.id}"`);
    }
  });

  it('the g-key digits match the ⌘ accelerators they mirror', () => {
    // The two triggers are meant to read as one grammar: if the menu says ⌘3 is
    // INTELLIGENCE then `g 3` must go to the same place, or the manual is lying.
    for (const d of DESTINATIONS) {
      const item = rust.split('\n').find((l) => l.includes(`"${d.id}"`));
      expect(item, `no menu line for ${d.id}`).toBeTruthy();
      const accel = item!.match(/CmdOrCtrl\+(.)/);
      if (accel) {
        expect(accel[1], `${d.id}: menu says ⌘${accel[1]} but the g-grammar uses ${d.key}`).toBe(d.key);
      }
    }
  });

  it('no two destinations claim the same key or path', () => {
    expect(Object.keys(GO_KEYS)).toHaveLength(DESTINATIONS.length);
    expect(new Set(DESTINATIONS.map((d) => d.path)).size).toBe(DESTINATIONS.length);
  });
});
