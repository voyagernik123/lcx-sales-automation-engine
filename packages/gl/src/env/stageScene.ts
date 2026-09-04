/**
 * THE STAGE — the lit studio every route stands in (THE PRODUCTION, P1).
 *
 * L2/L3 glue: pure functions that turn the shell's LAYOUT and the watch's STATE into geometry and a frame recipe
 * for the engine. No React, no DOM reads — the component hands in numbers, this hands back draws.
 *
 * ── WHAT IS ON THE STAGE, AND WHY EACH THING EARNS ITS PIXELS ─────────────────────────────────────────
 *   the ground     the rig's `ground` albedo, lit by the rig's key; it dissolves into the horizon by the rig's fog
 *   the plate      a slab whose TOP FACE projects exactly onto the DOM's main content rect — the page literally stands
 *                  on it and casts a shadow on the ground (the alignment is unprojection, not a guess: resize the
 *                  window and the slab follows the layout)
 *   the rooms      eight positions on an arc behind the plate, one per workspace, glowing where the WATCH found change
 *                  since the operator last looked, dim where nothing moved, absent where they hold no key — S5's
 *                  "the backdrop becomes the watch's canvas", built
 *   the horizon    the rig's sky, so the stage is a place and not a colour
 *
 * ── LUMINANCE IS BOUNDED, AND THE BOUND IS EXPORTED ─────────────────────────────────────────────────
 * The DOM chrome and the page plate are GLASS over this; every certified text role must still clear its floor over
 * the composite. `glass.test.ts` computes those composites from `STAGE_LUMINANCE_MAX` — the brightest the ground
 * and its light pools are allowed to render, per theme. The key gain and the glow sizes below are chosen under it;
 * change either and the test is the thing that notices.
 */
import type { Mat4, Vec3 } from '../math.js';
import type { Geometry } from './mesh.js';
import { computeNormals } from './mesh.js';

/** Brightest linear luminance the stage may put under the glass, per theme. Read by `glass.test.ts`. */
export const STAGE_LUMINANCE_MAX = { dark: 0.04, light: 0.96 } as const;
/** Darkest linear luminance the stage may put under the glass in LIGHT — shadows are lifted by ambient so the page's
 *  grey text never sits over a black composite. Dark's floor is 0 (the room may be black behind the glass). */
export const STAGE_LUMINANCE_MIN = { dark: 0, light: 0.55 } as const;

/** Height of the plate's top face above the ground (world units; the ground is y = 0). */
export const PLATE_Y = 0.32;
export const PLATE_THICKNESS = 0.14;

/** The fixed studio camera. Oblique, slightly from the left — the slab shows one lit edge and its shadow. */
/* A LOW CAMERA (elevation 13°) so the page stands on a SHELF at its bottom edge and the room recedes BEHIND it — floor,
   glows, horizon — visible through the glass plate. The first cut fitted a slab to the whole page rect and the camera
   saw nothing but that slab's top face; photographing the raw stage beside the page is what showed it. */
export const STAGE_VIEW = { target: [0, PLATE_Y + 0.2, -2.2] as Vec3, distance: 13.5, azimuthDeg: -12, elevationDeg: 13, fovDeg: 38 };
/** How far back (world units) the shelf runs from the page's bottom edge. Beyond it the floor is the room's. */
export const SHELF_DEPTH = 1.6;

/**
 * PER-ROOM FRAMING (P2). The camera turns TOWARD the room the operator enters: azimuth swings up to ±7° across the
 * eight rooms and the target slides toward that room's glow. A desk-level route (no workspace) is the neutral view.
 * Returned as the engine's `Viewpoint` shape so `viewProjection`/`eyeOf` consume it unchanged.
 */
export function roomFraming(room: RoomId | null): typeof STAGE_VIEW {
  if (room === null) return STAGE_VIEW;
  const i = ROOM_ORDER.indexOf(room);
  const t = i < 0 ? 0 : (i / (ROOM_ORDER.length - 1)) * 2 - 1;      // -1 … 1 across the arc
  return {
    ...STAGE_VIEW,
    azimuthDeg: STAGE_VIEW.azimuthDeg + t * 7,
    target: [STAGE_VIEW.target[0] + t * 1.4, STAGE_VIEW.target[1], STAGE_VIEW.target[2]] as Vec3,
  };
}

/** How far the shelf sits below its resting height at the start of an arrival (world units). */
export const SHELF_ARRIVAL_DROP = 0.12;
/** The move: user-driven, bounded, one easing. 420 ms is the S3 crossfade (180 ms) plus the settle the eye needs. */
export const STAGE_MOVE_MS = 420;

/** The rig's key light for the stage: from the upper left, forward. */
export const STAGE_KEY_DIR: Vec3 = normalise3([0.42, -0.78, 0.46]);

/**
 * THE STAGE'S OWN LIGHTING NUMBERS, per theme. The rig's `ground` albedo is the page tint deepened — right for a scene
 * that sits BEHIND a page, wrong for a floor that has to be seen beside one: at #070B14 no key can light it. The stage
 * floor uses the rig's `structure` albedo (plinths, walls, rails) and a stronger key; the glows are additive brand blue.
 * Every value below was chosen under `STAGE_LUMINANCE_MAX`: composite luminance under the glass stays below the bound.
 */
export const STAGE_LIGHT = {
  dark: { keyGain: 2.3, ambientGain: 0.7, shadowStrength: 0.85, glowGain: 0.14, glowSize: 0.5, fogDensity: 0.03, envGain: 0.3 },
  /* LIGHT SPEAKS THROUGH CHROMA. Under the text floors a white studio has no luminance headroom (the page is L .93,
     the floor may not drop below .55 under the glass), so what the eye gets is colour and shadow: brand-blue pools,
     a bluer horizon, a firmer shelf shadow. Measured: luminance-only tuning read 3% coverage in light. */
  light: { keyGain: 1.6, ambientGain: 0.9, shadowStrength: 0.62, glowGain: 1.7, glowSize: 0.85, fogDensity: 0.016, envGain: 1.65 },
} as const;

function normalise3(v: Vec3): Vec3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/* ── 4×4 inverse (row-major, the layout `math.ts` uses) ─────────────────────────────────────────── */
export function invert(m: Mat4): Mat4 | null {
  const v = (i: number): number => (m as unknown as number[])[i] ?? 0;
  const a00 = v(0), a01 = v(1), a02 = v(2), a03 = v(3), a10 = v(4), a11 = v(5), a12 = v(6), a13 = v(7);
  const a20 = v(8), a21 = v(9), a22 = v(10), a23 = v(11), a30 = v(12), a31 = v(13), a32 = v(14), a33 = v(15);
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ] as unknown as Mat4;
}

/** COLUMN-MAJOR, like `math.ts` (`projectNdc`): column c is m[c*4 .. c*4+3]. A row-major read here put the slab a
 *  plate-width away from the DOM rect it was fitted to — caught by photographing the raw stage beside the page. */
function transform4(m: Mat4, p: [number, number, number, number]): [number, number, number, number] {
  const a = (i: number): number => (m as unknown as number[])[i] ?? 0;
  const out = [0, 0, 0, 0] as [number, number, number, number];
  for (let r = 0; r < 4; r++) out[r] = a(0 * 4 + r) * p[0] + a(1 * 4 + r) * p[1] + a(2 * 4 + r) * p[2] + a(3 * 4 + r) * p[3];
  return out;
}

/**
 * Where a screen point lands on the horizontal plane y = planeY. `ndc` is (-1..1, -1..1), y up.
 * Returns null when the ray misses the plane (looking above the horizon) — the caller falls back to a default slab.
 */
export function unprojectToPlane(invViewProj: Mat4, ndcX: number, ndcY: number, planeY: number): Vec3 | null {
  const near = transform4(invViewProj, [ndcX, ndcY, -1, 1]);
  const far = transform4(invViewProj, [ndcX, ndcY, 1, 1]);
  const n: Vec3 = [near[0] / near[3], near[1] / near[3], near[2] / near[3]];
  const f: Vec3 = [far[0] / far[3], far[1] / far[3], far[2] / far[3]];
  const dy = f[1] - n[1];
  if (Math.abs(dy) < 1e-9) return null;
  const t = (planeY - n[1]) / dy;
  if (t < 0 || t > 1) return null;
  return [n[0] + (f[0] - n[0]) * t, planeY, n[2] + (f[2] - n[2]) * t];
}

/** A screen rect in CSS px → NDC corners (tl, tr, br, bl), y up. */
export function rectToNdc(rect: { x: number; y: number; w: number; h: number }, viewport: { w: number; h: number }) {
  const nx = (x: number) => (x / viewport.w) * 2 - 1;
  const ny = (y: number) => 1 - (y / viewport.h) * 2;
  return {
    tl: [nx(rect.x), ny(rect.y)] as const, tr: [nx(rect.x + rect.w), ny(rect.y)] as const,
    br: [nx(rect.x + rect.w), ny(rect.y + rect.h)] as const, bl: [nx(rect.x), ny(rect.y + rect.h)] as const,
  };
}

/**
 * The slab whose top face is the quad (tl, tr, br, bl) at y = PLATE_Y, extruded down by PLATE_THICKNESS.
 * Positions are world; normals are computed so the bevel-free faces shade correctly under the key.
 */
/** The plate's edge profile (P6): how far the chamfer runs OUTWARD from the top face, and down. */
export const PLATE_CHAMFER = 0.05;

/**
 * THE PLATE AS A MACHINED SLAB (P6). The top face is exactly the four corners handed in — it projects onto the DOM's
 * main content rect and the glass/luminance contract (`STAGE_LUMINANCE_*`) is about THAT face, so the profile is cut
 * OUTWARD: a 45° chamfer band runs from the top edge out and down by `chamfer`, then the walls fall from the band's
 * outer edge to the bottom. The band catches the key light as a bright machined edge BESIDE the page — in the gutter
 * the chrome fade leaves — and never under a glyph. A chamfer cut inward would have put that highlight under the page's
 * edge text and the plate ceiling (0.04 dark) would have refused it.
 *
 * Ten faces, each with its own four vertices so each has its own normal: top, 4 chamfers, 4 walls, bottom.
 */
export function slabGeometry(top: readonly [Vec3, Vec3, Vec3, Vec3], thickness = PLATE_THICKNESS, chamfer = PLATE_CHAMFER): Geometry {
  const c = Math.max(0, Math.min(chamfer, thickness * 0.9));
  // Push each corner outward along both of its edges (the plate is a rectangle in the plane, so this is an exact offset).
  const dir = (a: Vec3, b: Vec3): Vec3 => {
    const dx = a[0] - b[0], dz = a[2] - b[2]; const l = Math.hypot(dx, dz) || 1; return [dx / l, 0, dz / l];
  };
  const outer = top.map((p, i) => {
    const prev = top[(i + 3) % 4]!, next = top[(i + 1) % 4]!;
    const d1 = dir(p, prev), d2 = dir(p, next);
    return [p[0] + (d1[0] + d2[0]) * c, p[1] - c, p[2] + (d1[2] + d2[2]) * c] as Vec3;
  }) as unknown as readonly [Vec3, Vec3, Vec3, Vec3];
  const bottom = outer.map(([x, , z]) => [x, top[0]![1] - thickness, z] as Vec3) as unknown as readonly [Vec3, Vec3, Vec3, Vec3];
  const P: number[] = [];
  const push = (v: Vec3) => { P.push(v[0], v[1], v[2]); };
  const faces: Vec3[][] = [
    [top[0], top[1], top[2], top[3]],                    // top
    [bottom[3], bottom[2], bottom[1], bottom[0]],        // bottom (reversed)
    // chamfer band: top edge → outer edge, winding outward
    [top[3], top[2], outer[2], outer[3]],                // front
    [top[1], top[0], outer[0], outer[1]],                // back
    [top[0], top[3], outer[3], outer[0]],                // left
    [top[2], top[1], outer[1], outer[2]],                // right
    // walls: outer edge → bottom
    [outer[3], outer[2], bottom[2], bottom[3]],          // front
    [outer[1], outer[0], bottom[0], bottom[1]],          // back
    [outer[0], outer[3], bottom[3], bottom[0]],          // left
    [outer[2], outer[1], bottom[1], bottom[2]],          // right
  ];
  // OUTWARD BY CONSTRUCTION, NOT BY CONVENTION. Each face's winding is checked against the direction from the slab's
  // centroid to the face's centroid under the engine's own `computeNormals`, and reversed when it points in. The first
  // cut of this function wound every wall inward (its test read a −0.707 where +0.707 was claimed) and nothing had
  // noticed, because the walls were never lit from a side anyone measured.
  const centroid: [number, number, number] = [0, 0, 0];
  faces.forEach((f) => f.forEach((v) => { centroid[0] += v[0] / 40; centroid[1] += v[1] / 40; centroid[2] += v[2] / 40; }));
  const oriented = faces.map((f) => {
    const pos = new Float32Array(f.flatMap((v) => [v[0], v[1], v[2]]));
    const n = computeNormals(pos, new Uint16Array([0, 1, 2, 0, 2, 3]));
    const fc: Vec3 = [(f[0]![0] + f[1]![0] + f[2]![0] + f[3]![0]) / 4, (f[0]![1] + f[1]![1] + f[2]![1] + f[3]![1]) / 4, (f[0]![2] + f[1]![2] + f[2]![2] + f[3]![2]) / 4];
    const out = n[0]! * (fc[0] - centroid[0]) + n[1]! * (fc[1] - centroid[1]) + n[2]! * (fc[2] - centroid[2]);
    return out < 0 ? [...f].reverse() : f;
  });
  const I: number[] = [];
  oriented.forEach((f, k) => { f.forEach(push); const b = k * 4; I.push(b, b + 1, b + 2, b, b + 2, b + 3); });
  const positions = new Float32Array(P);
  const indices = new Uint16Array(I);
  const normals = computeNormals(positions, indices);
  const uvs = new Float32Array((positions.length / 3) * 2);
  let min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, positions[i + k]!); max[k] = Math.max(max[k]!, positions[i + k]!); }
  return { positions, normals, uvs, tangents: new Float32Array(positions.length), indices, min, max };
}

/** The eight rooms, in the platform's order, on an arc behind the plate. */
export const ROOM_ORDER = ['command', 'sales', 'intel', 'regulatory', 'distribution', 'marketing', 'gps', 'governance'] as const;
export type RoomId = (typeof ROOM_ORDER)[number];

export interface RoomState {
  /** Changes the watch found since the watermark; null = the operator holds no key to this room. */
  readonly changed: number | null;
  /** The room the operator is standing in right now (the current route's workspace). */
  readonly here: boolean;
}

/** World positions for the eight room glows, given where the plate's far edge sits. */
export function roomPositions(plateBackZ: number, plateCentreX: number): Vec3[] {
  const R = 7.2, z0 = plateBackZ - 2.2;
  return ROOM_ORDER.map((_, i) => {
    const t = (i / (ROOM_ORDER.length - 1)) * 2 - 1;      // -1 … 1
    const a = t * 0.62;                                    // radians across the arc
    return [plateCentreX + Math.sin(a) * R, 0.06, z0 - (Math.cos(a) - 1) * R * 0.55];
  });
}

/**
 * Glow size and brightness per room. Bounded so the pools stay under STAGE_LUMINANCE_MAX: the brightest room
 * (many changes) is 1.0, a quiet room 0.22, the room you stand in gets a steady +0.25, an unheld room 0 (unlit).
 */
export function roomGlow(state: RoomState): { size: number; intensity: number } {
  if (state.changed === null) return { size: 0, intensity: 0 };
  const change = Math.min(1, Math.log1p(state.changed) / Math.log1p(12));
  return { size: 0.9 + change * 1.6 + (state.here ? 0.3 : 0), intensity: Math.min(1, 0.22 + change * 0.78 + (state.here ? 0.25 : 0)) };
}

/* ── THE ARRIVAL ON THE STAGE (P7) ─────────────────────────────────────────────────────────────────────────────── */
export interface ArrivalItemLike { readonly workspace: string }
export interface ArrivalWatchLike { readonly items: readonly ArrivalItemLike[] }

export interface RoomLit {
  /** Draw this room's glow at all on this step. */
  readonly lit: boolean;
  /** This is the step the room lit on — draw it once at its bloom size; the next step settles. */
  readonly justLit: boolean;
}

export function roomLitAt(
  room: string,
  changed: number | null,
  watch: ArrivalWatchLike | null,
  revealed: number,
  sweeping: boolean,
): RoomLit {
  if (changed === null) return { lit: false, justLit: false };          // an unheld room is unlit (P3)
  if (changed === 0) return { lit: true, justLit: false };              // a quiet held room keeps its quiet glow (roomGlow .22, P3) — the
                                                                        // first cut removed it and the dark median fell 35 → 30 %: the
                                                                        // arrival lights the CHANGED rooms on top of the room, not instead of it
  if (watch === null) return { lit: true, justLit: false };
  const first = watch.items.findIndex((it) => it.workspace === room);
  if (first < 0) return { lit: !sweeping, justLit: false };
  const lit = revealed > first;
  return { lit, justLit: lit && revealed === first + 1 && sweeping };
}

/** The bloom-once factors for the step a room lights on; bounded so roomGlow's luminance ceiling still holds after them. */
export const ROOM_BLOOM = { size: 1.35, intensity: 1.25 } as const;
