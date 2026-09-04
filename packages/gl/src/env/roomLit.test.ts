import { describe, expect, it } from 'vitest';
import { roomLitAt } from './stageScene';

const watch = { items: [{ workspace: 'sales' }, { workspace: 'regulatory' }, { workspace: 'sales' }, { workspace: 'distribution' }] };

describe('roomLitAt — the arrival lights the rooms in rank order', () => {
  it('no watch: every held room with change is lit at once (the P3 frame)', () => {
    expect(roomLitAt('sales', 3, null, 0, false)).toEqual({ lit: true, justLit: false });
    expect(roomLitAt('gps', 0, null, 0, false)).toEqual({ lit: true, justLit: false });    // quiet held room: P3's .22 glow stays
    expect(roomLitAt('gps', null, null, 0, false)).toEqual({ lit: false, justLit: false }); // unheld: unlit
  });
  it('lights each room on the step its first ranked item is revealed, and marks that step as the bloom', () => {
    expect(roomLitAt('sales', 2, watch, 0, true)).toEqual({ lit: false, justLit: false });
    expect(roomLitAt('sales', 2, watch, 1, true)).toEqual({ lit: true, justLit: true });
    expect(roomLitAt('sales', 2, watch, 2, true)).toEqual({ lit: true, justLit: false });   // settled; its 2nd item does not re-bloom
    expect(roomLitAt('regulatory', 1, watch, 1, true)).toEqual({ lit: false, justLit: false });
    expect(roomLitAt('regulatory', 1, watch, 2, true)).toEqual({ lit: true, justLit: true });
    expect(roomLitAt('distribution', 1, watch, 3, true)).toEqual({ lit: false, justLit: false });
    expect(roomLitAt('distribution', 1, watch, 4, false)).toEqual({ lit: true, justLit: false }); // the last step ends the sweep: lit, no bloom flag past rest
  });
  it('a quiet held room glows quietly THROUGH the sweep — the arrival adds light to changed rooms, it does not darken the room', () => {
    expect(roomLitAt('gps', 0, watch, 0, true)).toEqual({ lit: true, justLit: false });
    expect(roomLitAt('gps', 0, watch, 2, true)).toEqual({ lit: true, justLit: false });
    expect(roomLitAt('gps', 0, watch, 4, false)).toEqual({ lit: true, justLit: false });
  });
  it('a changed room with no ranked item (the unranked tail) lights when the sweep is over, never during it', () => {
    expect(roomLitAt('marketing', 4, watch, 2, true)).toEqual({ lit: false, justLit: false });
    expect(roomLitAt('marketing', 4, watch, 4, false)).toEqual({ lit: true, justLit: false });
  });
  it('the sequence across the stage is the items\' order: sales, regulatory, distribution', () => {
    const rooms = ['sales', 'regulatory', 'distribution', 'marketing'];
    const order: string[] = [];
    for (let step = 1; step <= 4; step++) {
      for (const r of rooms) if (roomLitAt(r, 1, watch, step, step < 4).justLit) order.push(r);
    }
    expect(order).toEqual(['sales', 'regulatory']);  // distribution lights on the final step, which is rest — lit, not bloomed
    expect(roomLitAt('distribution', 1, watch, 4, false).lit).toBe(true);
  });
});
