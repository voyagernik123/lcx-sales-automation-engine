import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOM_ORDER, STAGE_MOVE_MS, STAGE_VIEW, roomFraming } from '@lcx/gl/env/stageScene.js';

/**
 * THE CAMERA MOVES, AND ONLY WHEN THE ROOM CHANGES (THE PRODUCTION, P2).
 *
 * The stage turns toward the room the operator enters — a bounded, eased move on the one clock — and holds. This
 * pins the geometry of that move (neutral for desk-level routes, ±7° at the ends of the arc, monotone across it),
 * its bound (≤ 500 ms: the S3 crossfade plus the settle), and the two ratchets the component must keep: frames come
 * from `lib/clock`'s `onFrame`, never `requestAnimationFrame`, and the file has one `createStage`.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('roomFraming', () => {
  it('a desk-level route (no workspace) is the neutral view', () => {
    expect(roomFraming(null)).toEqual(STAGE_VIEW);
  });
  it('turns up to ±7° across the arc, monotonically, and never changes the distance', () => {
    const az = ROOM_ORDER.map((r) => roomFraming(r).azimuthDeg);
    expect(az[0]).toBeCloseTo(STAGE_VIEW.azimuthDeg - 7, 5);
    expect(az[az.length - 1]).toBeCloseTo(STAGE_VIEW.azimuthDeg + 7, 5);
    for (let i = 1; i < az.length; i++) expect(az[i]).toBeGreaterThan(az[i - 1]!);
    for (const r of ROOM_ORDER) expect(roomFraming(r).distance).toBe(STAGE_VIEW.distance);
  });
  it('the target slides toward the room, and the middle of the arc stays centred', () => {
    const mid = ROOM_ORDER[Math.floor((ROOM_ORDER.length - 1) / 2)]!;
    expect(Math.abs(roomFraming(mid).target[0] - STAGE_VIEW.target[0])).toBeLessThan(0.3);
    expect(roomFraming(ROOM_ORDER[0]!).target[0]).toBeLessThan(roomFraming(ROOM_ORDER[ROOM_ORDER.length - 1]!).target[0]);
  });
});

describe('the move is bounded and drawn from the one clock', () => {
  it('lasts at most half a second', () => {
    expect(STAGE_MOVE_MS).toBeGreaterThan(0);
    expect(STAGE_MOVE_MS).toBeLessThanOrEqual(500);
  });
  it('Stage.tsx takes frames from lib/clock and never from requestAnimationFrame or a timer', () => {
    const code = readFileSync(join(SRC, 'components/stage/Stage.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).toMatch(/import \{[^}]*\bonFrame\b[^}]*\} from '@\/lib\/clock'/);
    expect(code).not.toMatch(/\brequestAnimationFrame\s*\(/);
    expect(code).not.toMatch(/\bsetTimeout\s*\(|\bsetInterval\s*\(/);
    expect([...code.matchAll(/createStage\s*\(/g)]).toHaveLength(1);
  });
});
