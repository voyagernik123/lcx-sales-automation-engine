/*
 * L3.5 · PARTICLES — GPU-updated, additive, curl-noise advected.
 *
 * ── THE RULE THIS LAYER HAS TO EARN ──────────────────────────────────────────────────
 * §6 says an environment must carry information the flat version loses. A particle cloud is the
 * easiest way in this entire programme to violate that: it looks expensive, it moves, and it says
 * nothing. So this layer is built on one constraint — A PARTICLE IS A UNIT OF SOMETHING — and the
 * API refuses to let a caller forget it. `ParticleSource.rate` is particles per second and the
 * caller is expected to derive it from a measured quantity, so the DENSITY of a stream is a reading
 * rather than a look. If a caller wants sparks, they can have them, but they will have written
 * `rate: 40` and will be able to say what the 40 means.
 *
 * ── WHY CURL NOISE, AND NOT A VELOCITY FIELD OR A RANDOM WALK ────────────────────────
 * Curl of a vector potential is DIVERGENCE-FREE by construction. That is not an aesthetic
 * preference: a divergent field has sinks, and particles advected into a sink pile up into a
 * glowing knot that reads as an object rather than as flow. A random walk has the opposite
 * problem — no structure at all, so the cloud diffuses into a uniform haze and stops describing
 * anything. Divergence-free flow is the only one of the three where the visible structure is the
 * FIELD's structure, which is the thing a reader is supposed to be learning.
 *
 * ── WHY PING-PONG TEXTURES AND NOT TRANSFORM FEEDBACK ────────────────────────────────
 * Transform feedback is the obvious WebGL2 answer and it is the wrong one here, for a reason that
 * is about verification rather than performance: a transform-feedback buffer cannot be read back
 * without a fence and a second buffer, so the simulation becomes unobservable from the harness. A
 * float texture can be `readPixels`'d, which means every claim this layer makes — particles stay in
 * bounds, ages advance, dead particles respawn at their emitter — is a number a capture script can
 * assert on rather than a thing a screenshot appears to show.
 */

import type { Mat4 } from '../math';
import { stageRefusal } from '../stage';
import type { Stage, StageRefusal } from '../stage';
import { savePassState, restorePassState, releaseTextureUnits } from './passState';

/**
 * Texture dimensions for a given capacity.
 *
 * Kept pure and exported because the arithmetic is where an off-by-one silently drops the last row
 * of particles — they exist in the buffer, are never updated, and sit frozen at wherever they were
 * initialised. That reads as a rendering artefact, not as an indexing bug.
 */
export function particleLayout(capacity: number): { width: number; height: number; slots: number } {
  /* `Math.max(1, NaN)` IS NaN. The obvious guard does not guard: Math.max propagates NaN rather than
     rejecting it, so a NaN capacity produced NaN dimensions, `texImage2D` silently made an incomplete
     framebuffer, and every particle sat frozen wherever it was seeded — with `gl.getError()` clean.
     Caught by the test, not by a capture, which is the point of the test. */
  const wanted = Number.isFinite(capacity) ? Math.max(1, Math.floor(capacity)) : 1;
  // Square-ish and power-of-two on both axes: a non-power-of-two float texture is legal in WebGL2
  // but the update pass indexes by integer texel and a POT width keeps that arithmetic exact.
  const width = Math.max(1, 2 ** Math.ceil(Math.log2(Math.ceil(Math.sqrt(wanted)))));
  const height = Math.max(1, 2 ** Math.ceil(Math.log2(Math.ceil(wanted / width))));
  return { width, height, slots: width * height };
}

export interface ParticleSource {
  /** Emitter position, world space. */
  readonly at: readonly [number, number, number];
  /**
   * Particles per SECOND. Derive it from a measured quantity — the density of the resulting stream
   * is then a reading rather than a decoration, which is the only basis on which this layer passes
   * §6. A caller emitting a constant because it looked right has built an ornament.
   */
  readonly rate: number;
  /** Initial velocity, world units per second. */
  readonly velocity: readonly [number, number, number];
  /** Emission sphere radius: 0 emits from a point, which reads as a laser rather than a source. */
  readonly spread?: number;
  /** Linear RGB. Additive, so this is radiance added to the frame, not a surface colour. */
  readonly colour: readonly [number, number, number];
  /** Seconds before a particle dies and its slot is reused. */
  readonly life: number;
}

/**
 * How many particles each source emits this frame, with the fractional remainder CARRIED.
 *
 * Pure, exported, and tested, because the naive `floor(rate * dt)` is wrong in a way that looks
 * like a working system: at 60 fps and a rate of 30/s, `rate * dt` is 0.5, `floor` is 0, and the
 * emitter produces NOTHING — for ever, silently, with every uniform correctly set. Any rate below
 * one particle per frame vanishes. Carrying the remainder makes emission exact in the long run and
 * makes a low rate mean "occasionally" rather than "never".
 */
export function emissionSchedule(
  sources: readonly ParticleSource[],
  dtSeconds: number,
  carry: readonly number[],
): { counts: number[]; carry: number[] } {
  const counts: number[] = [];
  const nextCarry: number[] = [];
  for (let i = 0; i < sources.length; i++) {
    const rate = Math.max(0, sources[i]!.rate);
    // Guard the dt too: a tab that was backgrounded returns a multi-second dt on its first frame,
    // and `rate * dt` then dumps a whole minute of emission into one frame — a flash that looks
    // like a bug in the blending. Clamped to 100 ms, which is 6 frames' worth.
    const dt = Math.max(0, Math.min(0.1, dtSeconds));
    const want = rate * dt + (carry[i] ?? 0);
    const whole = Math.floor(want);
    counts.push(whole);
    nextCarry.push(want - whole);
  }
  return { counts, carry: nextCarry };
}

/*
 * 3-D VALUE NOISE AND ITS CURL.
 *
 * Value noise on a hashed lattice rather than simplex: a third of the instructions, and the visual
 * difference at the scales a flow field is sampled at is not detectable — whereas the instruction
 * count IS, because curl needs six partial derivatives and therefore six noise evaluations per
 * component per particle per frame.
 *
 * The curl is taken by CENTRAL differences of a three-component potential. Forward differences are
 * half the cost and are subtly wrong: they bias the field in the +epsilon direction, so the whole
 * cloud drifts diagonally at a rate proportional to epsilon. That is indistinguishable from a
 * deliberate wind and so would never have been questioned.
 *
 * Two more decisions, documented HERE rather than inside the string — see the note on shipped bytes
 * at the top of this file:
 *
 *   · `lcxNoise` smoothsteps the lattice fraction. Linear interpolation leaves axis-aligned creases
 *     at every cell boundary, which in a flow field read as a rectangular grid the particles snap to.
 *   · `lcxPotential` takes three DECORRELATED samples. The same noise offset by a small delta per
 *     axis gives a potential whose components are nearly equal, and the curl of a
 *     near-constant-direction field is near zero — the cloud would barely move, and the field would
 *     look weak rather than wrong.
 */
export const CURL_NOISE_GLSL = `
float lcxHash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lcxNoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(lcxHash(i + vec3(0,0,0)), lcxHash(i + vec3(1,0,0)), u.x),
        mix(lcxHash(i + vec3(0,1,0)), lcxHash(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(lcxHash(i + vec3(0,0,1)), lcxHash(i + vec3(1,0,1)), u.x),
        mix(lcxHash(i + vec3(0,1,1)), lcxHash(i + vec3(1,1,1)), u.x), u.y), u.z);
}
vec3 lcxPotential(vec3 p){
  return vec3(
    lcxNoise(p + vec3(0.0, 0.0, 0.0)),
    lcxNoise(p + vec3(31.416, 7.13, 19.7)),
    lcxNoise(p + vec3(-13.9, 41.2, -5.31))
  );
}
vec3 lcxCurl(vec3 p, float e){
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 px1 = lcxPotential(p + dx), px0 = lcxPotential(p - dx);
  vec3 py1 = lcxPotential(p + dy), py0 = lcxPotential(p - dy);
  vec3 pz1 = lcxPotential(p + dz), pz0 = lcxPotential(p - dz);
  float inv = 1.0 / (2.0 * e);
  return vec3(
    ((py1.z - py0.z) - (pz1.y - pz0.y)) * inv,
    ((pz1.x - pz0.x) - (px1.z - px0.z)) * inv,
    ((px1.y - px0.y) - (py1.x - py0.x)) * inv
  );
}
`;

const UPDATE_VERT = `#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/*
 * THE UPDATE PASS. Four decisions, kept out of the shader string because a comment inside a template
 * literal is SHIPPED — measured at 13.3 KB across this layer, and E8 is live on the sign-in route, so
 * those are bytes a real reader downloads. A minifier cannot touch the inside of a string.
 *
 *   · EMISSION IS A RANGE OF SLOTS per source per frame, uploaded as a flat array. A slot outside
 *     every range keeps integrating; a slot inside one is reborn at its source. That makes the whole
 *     simulation one pass with no per-particle branch on the CPU side.
 *   · REBIRTH HAPPENS BEFORE INTEGRATION, so a particle born this frame takes one step and is
 *     visible immediately. The other order puts every new particle exactly on its emitter for one
 *     frame, which at 60 fps is a bright stationary dot at every source.
 *   · A DEAD PARTICLE IS PARKED, not left drifting: age beyond its life pins it with a sentinel age
 *     the draw pass discards in one comparison. Letting it keep integrating means thousands of
 *     invisible particles each still costing a full curl evaluation.
 *   · THE FLOW SAMPLE is offset by time on +y, so the field itself evolves rather than being a fixed
 *     pattern the particles merely traverse.
 *
 * ── TWO DEFECTS E3 FOUND BY READING THE FIELD BACK, 2026-08-12 ────────────────────────
 * Both were caught by `readState` counting live particles and comparing the total against
 * sum(rate x life) — the analytic steady state. It came back 812 against an expected 592, which is
 * the kind of disagreement no screenshot of a particle cloud can show.
 *
 *   1 · THE SENTINEL DID NOT PARK ANYTHING. The paragraph above was false. A dead particle got
 *       `age = -1`, and the NEXT frame recomputed `age = st.w + uDt` from that sentinel, found
 *       `-0.983 > life` false, and fell through to the integrate path — so the corpse kept drifting
 *       with age climbing back toward zero and RESURRECTED about a second later, wherever the flow
 *       had carried it by then. That is why 220 of E3's particles were outside their channel: they
 *       were the resurrected ones. The park is now explicit and happens before integration.
 *
 *   2 · LIFE WAS READ OUT OF THIS FRAME'S EMISSION RANGES, so it only existed for sources that
 *       happened to emit on that frame. Any source with a rate under one particle per frame — which
 *       is every source E3 has — leaves the array without its entry most frames, and every particle
 *       belonging to it silently fell back to the hard-coded `life = 1.0`. Lifetimes therefore
 *       depended on emission jitter rather than on the caller's number. Lives are now their own
 *       uniform, uploaded for all eight sources every step.
 */
const UPDATE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uState;     // xyz = position, w = age in seconds
uniform sampler2D uVel;       // xyz = velocity, w = source index
uniform vec2 uSize;
uniform float uDt;
uniform float uTime;
uniform float uNoiseScale;
uniform float uNoiseStrength;
uniform float uDrag;
uniform vec3 uGravity;
uniform int uEmitCount;
uniform vec4 uEmitRange[8];   // x = first slot, y = last slot, z = source index, w = life
uniform vec4 uEmitPos[8];     // xyz = position, w = spread
uniform vec4 uEmitVel[8];     // xyz = velocity, w unused
uniform float uLifes[8];      // seconds, per SOURCE, uploaded every step
layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outVel;
${CURL_NOISE_GLSL}
void main(){
  ivec2 texel = ivec2(gl_FragCoord.xy);
  int slot = texel.y * int(uSize.x) + texel.x;
  vec4 st = texture(uState, gl_FragCoord.xy / uSize);
  vec4 vl = texture(uVel, gl_FragCoord.xy / uSize);

  bool reborn = false;
  for (int i = 0; i < 8; i++) {
    if (i >= uEmitCount) break;
    if (float(slot) >= uEmitRange[i].x && float(slot) <= uEmitRange[i].y) {
      float h1 = lcxHash(vec3(float(slot), uTime, 1.0));
      float h2 = lcxHash(vec3(float(slot), uTime, 2.0));
      float h3 = lcxHash(vec3(float(slot), uTime, 3.0));
      vec3 jitter = (vec3(h1, h2, h3) - 0.5) * 2.0 * uEmitPos[i].w;
      st = vec4(uEmitPos[i].xyz + jitter, 0.0);
      vl = vec4(uEmitVel[i].xyz, uEmitRange[i].z);
      reborn = true;
    }
  }

  if (!reborn && st.w < 0.0) { outState = st; outVel = vl; return; }

  int src = clamp(int(vl.w + 0.5), 0, 7);
  float life = max(0.0001, uLifes[src]);

  vec3 flow = lcxCurl(st.xyz * uNoiseScale + vec3(0.0, uTime * 0.15, 0.0), 0.35) * uNoiseStrength;
  vec3 vel = vl.xyz + (flow + uGravity) * uDt;
  vel *= max(0.0, 1.0 - uDrag * uDt);
  vec3 pos = st.xyz + vel * uDt;
  float age = st.w + uDt;

  if (!reborn && age > life) { outState = vec4(st.xyz, -1.0); outVel = vec4(0.0, 0.0, 0.0, vl.w); return; }

  outState = vec4(pos, age);
  outVel = vec4(vel, vl.w);
}`;

/*
 * THE DRAW PASS, vertex stage — one point per slot, positioned by texelFetch rather than by an
 * attribute buffer, so there is nothing to keep in sync with the simulation.
 *
 *   · A DEAD PARTICLE IS MOVED BEHIND THE CAMERA rather than given a zero size. `gl_PointSize` of 0
 *     is implementation-defined: some drivers clamp it to 1, and the frame fills with dim dots that
 *     no amount of tuning removes because nothing in the shader is drawing them.
 *   · THE FADE RAMPS IN as well as out. A particle appearing at full brightness pops, and a stream
 *     of pops reads as flicker rather than as flow.
 *   · SIZE DIVIDES BY w, so a particle shrinks with distance like everything else in the frame.
 */
const DRAW_VERT = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform sampler2D uVel;
uniform vec2 uSize;
uniform mat4 uViewProj;
uniform float uPointScale;
uniform vec3 uColours[8];
uniform float uLifes[8];
out vec3 vColour;
out float vFade;
void main(){
  int slot = gl_VertexID;
  ivec2 texel = ivec2(slot % int(uSize.x), slot / int(uSize.x));
  vec4 st = texelFetch(uState, texel, 0);
  vec4 vl = texelFetch(uVel, texel, 0);

  if (st.w < 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; vFade = 0.0; vColour = vec3(0.0); return; }

  int src = int(vl.w + 0.5);
  vColour = uColours[src];
  float life = max(0.0001, uLifes[src]);
  float t = clamp(st.w / life, 0.0, 1.0);
  vFade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.55, 1.0, t));

  vec4 clip = uViewProj * vec4(st.xyz, 1.0);
  gl_Position = clip;
  gl_PointSize = clamp(uPointScale / max(0.25, clip.w), 1.0, 64.0);
}`;

/*
 * THE DRAW PASS, fragment stage.
 *
 *   · ROUND AND SOFT-EDGED. A square point sprite is the most recognisable tell of an untouched
 *     particle system, and the quadratic falloff is what lets thousands of them sum into something
 *     continuous rather than into a pile of tiles.
 *   · PREMULTIPLIED, with alpha carrying the same weight, because the blend is ONE/ONE — additive.
 *     These ACCUMULATE: two overlapping particles are brighter than one. Source-over would let the
 *     near one hide the far one and the density would stop being a reading.
 */
const DRAW_FRAG = `#version 300 es
precision highp float;
in vec3 vColour;
in float vFade;
out vec4 frag;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float a = (1.0 - r2) * (1.0 - r2);
  frag = vec4(vColour * (a * vFade), a * vFade);
}`;

export interface ParticleField {
  /** Advance the simulation. `dtSeconds` is clamped internally; see `emissionSchedule`. */
  step(opts: {
    readonly sources: readonly ParticleSource[];
    readonly dtSeconds: number;
    /** Lattice scale of the flow field. Larger = finer structure. */
    readonly noiseScale?: number;
    /** World units per second the flow can impart. 0 leaves ballistic motion only. */
    readonly noiseStrength?: number;
    readonly gravity?: readonly [number, number, number];
    /** Velocity lost per second, as a fraction. 0 is a vacuum. */
    readonly drag?: number;
  }): void;
  /** Draw additively into the currently bound framebuffer. Does NOT clear or bind anything. */
  draw(opts: {
    readonly viewProj: Mat4;
    readonly sources: readonly ParticleSource[];
    /** Point diameter in pixels at one world unit from the eye. */
    readonly pointScale?: number;
  }): void;
  /**
   * Read the simulation back. THE REASON THIS LAYER USES TEXTURES: every claim about the particles
   * is a number a harness can assert on. Returns `slots * 4` floats, xyz + age, age < 0 meaning dead.
   */
  readState(): Float32Array;
  readonly slots: number;
  readonly width: number;
  readonly height: number;
  dispose(): void;
}

export function createParticleField(
  stage: Stage,
  capacity: number,
): ParticleField | StageRefusal {
  const gl = stage.gl;
  const { width, height, slots } = particleLayout(capacity);

  /*
   * FLOAT RENDER TARGETS ARE AN EXTENSION, AND ITS ABSENCE MUST REFUSE.
   *
   * Without EXT_color_buffer_float the framebuffer is incomplete and every write silently does
   * nothing: the state textures stay at their initial values, the particles sit frozen where they
   * were seeded, and the frame shows a static spray that looks like a working system on its first
   * frame. There is no error to catch later — this is the only place it can be detected.
   */
  if (!gl.getExtension('EXT_color_buffer_float')) {
    return stageRefusal('MISSING_EXTENSION',
      'particle simulation needs EXT_color_buffer_float to write positions to a texture — without it the state textures never update and the field renders frozen');
  }

  const updateProg = stage.compile(UPDATE_VERT, UPDATE_FRAG);
  if ('kind' in updateProg) return updateProg;
  const drawProg = stage.compile(DRAW_VERT, DRAW_FRAG);
  if ('kind' in drawProg) return drawProg;

  const makeTex = (seed: Float32Array | null): WebGLTexture => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, seed);
    // NEAREST and CLAMP: the update pass addresses exact texels, and any filtering would blend one
    // particle's state into its neighbour's — which produces plausible motion from corrupt data.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  /* SEEDED DEAD, not seeded at the origin. An unseeded RGBA32F texture is zeros, which is age 0 at
     the world origin — so the first frame shows every particle alive in a bright ball at (0,0,0)
     before emission has placed any of them. Age -1 is the dead sentinel the draw pass discards. */
  const seed = new Float32Array(slots * 4);
  for (let i = 0; i < slots; i++) seed[i * 4 + 3] = -1;

  let stateA = makeTex(seed), stateB = makeTex(seed);
  let velA = makeTex(new Float32Array(slots * 4)), velB = makeTex(new Float32Array(slots * 4));

  const fbo = gl.createFramebuffer()!;
  const readFbo = gl.createFramebuffer()!;
  const vao = gl.createVertexArray()!;

  let cursor = 0;
  let carry: number[] = [];

  const bindOut = (st: WebGLTexture, vl: WebGLTexture): boolean => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, st, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, vl, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  };

  const u = (p: WebGLProgram, n: string): WebGLUniformLocation | null => gl.getUniformLocation(p, n);

  return {
    slots, width, height,

    step(o) {
      /*
       * SAVED FIRST, RESTORED ON EVERY EXIT — including the `bindOut` failure below, which had already
       * bound this field's framebuffer before deciding to give up.
       *
       * What this pass used to leave behind, measured for a 1024-slot field: VIEWPORT
       * "0,0,640,400 -> 0,0,32,32", DEPTH_TEST "true -> false", ACTIVE_TEXTURE "0 -> 1". A caller that
       * stepped after binding its scene target then drew the whole rest of the frame into a 32x32
       * corner with no GL error and no refusal. E3 avoids it by stepping first and says so in a
       * comment — but a comment in one harness is not an enforcement for the next one.
       */
      const prev = savePassState(gl);
      const sources = o.sources.slice(0, 8);
      const sched = emissionSchedule(sources, o.dtSeconds, carry);
      carry = sched.carry;

      /*
       * SLOT RANGES FROM ONE ROLLING CURSOR, so emission is oldest-first round robin.
       *
       * A range that wraps past the end of the buffer is SPLIT rather than clamped. Clamping loses
       * the wrapped remainder — emission quietly drops to a fraction of the requested rate whenever
       * the cursor is near the end, which is a periodic stutter nobody would connect to indexing.
       * Two ranges are cheap; the shader already loops over eight.
       */
      const ranges: number[] = [], positions: number[] = [], velocities: number[] = [];
      let used = 0;
      for (let i = 0; i < sources.length && used < 8; i++) {
        const s = sources[i]!;
        let n = Math.min(sched.counts[i] ?? 0, slots);
        while (n > 0 && used < 8) {
          const first = cursor;
          const take = Math.min(n, slots - first);
          ranges.push(first, first + take - 1, i, s.life);
          positions.push(s.at[0], s.at[1], s.at[2], s.spread ?? 0);
          velocities.push(s.velocity[0], s.velocity[1], s.velocity[2], 0);
          cursor = (first + take) % slots;
          n -= take;
          used++;
        }
      }

      if (!bindOut(stateB, velB)) { restorePassState(gl, prev); return; }
      gl.viewport(0, 0, width, height);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(updateProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stateA);
      gl.uniform1i(u(updateProg, 'uState'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, velA);
      gl.uniform1i(u(updateProg, 'uVel'), 1);
      gl.uniform2f(u(updateProg, 'uSize'), width, height);
      gl.uniform1f(u(updateProg, 'uDt'), Math.max(0, Math.min(0.1, o.dtSeconds)));
      /* Time drives BOTH the flow's evolution and the rebirth jitter's hash. A frame counter would
         make the jitter repeat with the counter's period; elapsed seconds do not repeat. */
      gl.uniform1f(u(updateProg, 'uTime'), (performance.now() / 1000) % 3600);
      gl.uniform1f(u(updateProg, 'uNoiseScale'), o.noiseScale ?? 0.35);
      gl.uniform1f(u(updateProg, 'uNoiseStrength'), o.noiseStrength ?? 0.6);
      gl.uniform1f(u(updateProg, 'uDrag'), o.drag ?? 0.4);
      const g = o.gravity ?? [0, 0, 0];
      gl.uniform3f(u(updateProg, 'uGravity'), g[0], g[1], g[2]);
      gl.uniform1i(u(updateProg, 'uEmitCount'), used);
      if (used > 0) {
        gl.uniform4fv(u(updateProg, 'uEmitRange'), new Float32Array(ranges));
        gl.uniform4fv(u(updateProg, 'uEmitPos'), new Float32Array(positions));
        gl.uniform4fv(u(updateProg, 'uEmitVel'), new Float32Array(velocities));
      }
      /* EVERY FRAME, FOR EVERY SOURCE, whether it emitted or not — see defect 2 in the header. A
         source emitting less than one particle per frame is the normal case for a rate derived from a
         real quantity, and reading its life out of this frame's emission ranges made the lifetime a
         function of emission jitter. */
      const lifes = new Float32Array(8);
      for (let i = 0; i < 8; i++) lifes[i] = sources[i]?.life ?? 1;
      gl.uniform1fv(u(updateProg, 'uLifes'), lifes);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      // Swap. Both pairs, together — swapping state without velocity integrates this frame's
      // positions against last frame's velocities, which is a stable-looking half-speed drift.
      const ts = stateA; stateA = stateB; stateB = ts;
      const tv = velA; velA = velB; velB = tv;
      /* Both state textures released and the caller's framebuffer, viewport and enable-state put back.
         `draw` below already did the units; `step` did neither. */
      releaseTextureUnits(gl, 2);
      restorePassState(gl, prev);
    },

    draw(o) {
      const prev = savePassState(gl);
      const sources = o.sources.slice(0, 8);
      gl.useProgram(drawProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stateA);
      gl.uniform1i(u(drawProg, 'uState'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, velA);
      gl.uniform1i(u(drawProg, 'uVel'), 1);
      gl.uniform2f(u(drawProg, 'uSize'), width, height);
      gl.uniformMatrix4fv(u(drawProg, 'uViewProj'), false, o.viewProj);
      gl.uniform1f(u(drawProg, 'uPointScale'), o.pointScale ?? 28);
      const cols = new Float32Array(24), lifes = new Float32Array(8);
      for (let i = 0; i < 8; i++) {
        const s = sources[i];
        cols[i * 3] = s ? s.colour[0] : 0;
        cols[i * 3 + 1] = s ? s.colour[1] : 0;
        cols[i * 3 + 2] = s ? s.colour[2] : 0;
        lifes[i] = s ? s.life : 1;
      }
      gl.uniform3fv(u(drawProg, 'uColours'), cols);
      gl.uniform1fv(u(drawProg, 'uLifes'), lifes);

      /*
       * ADDITIVE, AND DEPTH-TESTED BUT NOT DEPTH-WRITING.
       *
       * Testing means geometry in front correctly hides particles behind it. NOT writing means one
       * particle cannot hide another, which is what makes the accumulation a density reading rather
       * than a fight over the nearest sprite. Writing depth here is the classic mistake: the cloud
       * gets holes wherever draw order happened to put a near particle first.
       */
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, slots);
      gl.bindVertexArray(null);
      /* Texture units RELEASED. E0 lost three passes to a feedback loop because AO left the scene
         depth bound and the next pass wrote to the texture it was still reading.
         The enable-state is RESTORED rather than assumed: this used to end with `depthMask(true)` and
         `disable(BLEND)`, which is a restore only for a caller whose state was already that, while the
         depth test it enabled was left on regardless. */
      releaseTextureUnits(gl, 2);
      restorePassState(gl, prev);
    },

    readState() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, readFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stateA, 0);
      const out = new Float32Array(slots * 4);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, out);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return out;
    },

    dispose() {
      for (const t of [stateA, stateB, velA, velB]) gl.deleteTexture(t);
      gl.deleteFramebuffer(fbo);
      gl.deleteFramebuffer(readFbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(updateProg);
      gl.deleteProgram(drawProg);
    },
  };
}
