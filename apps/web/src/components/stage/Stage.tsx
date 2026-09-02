import { useEffect, useRef, useState } from 'react';
import type { Target3D } from '@lcx/gl/env/target3d.js';
import type { MeshBuffer } from '@lcx/gl/env/lit.js';
import type { PointCloud } from '@lcx/gl/primitives/points.js';
import { resolveQualityTier } from '../shared/useQualityTier';
import { useArrivalStore } from '@/lib/useArrival';
import { useAccessStore } from '@/stores/useAccessStore';
import { workspaceForPath } from '@lcx/shared';
import { useLocation } from 'react-router-dom';

/**
 * THE STAGE — the lit studio every route stands in (THE PRODUCTION, P1).
 *
 * One WebGL2 context, mounted once in the shell at the slot the old backdrop left (S5), drawing a FRAME ON DEMAND
 * and otherwise holding it: on mount, on theme change, on resize, when the page plate moves (sidebar collapse, dock),
 * and when the watch arrives with news. No loop and no scheduled frame: invalidations in one task coalesce into one
 * synchronous draw (a microtask), which is what the redraw ratchet requires of every context owner.
 *
 * WHAT THE OPERATOR SEES. The DOM's main content is a plate standing on a lit floor: a real slab whose top face is
 * unprojected from the content rect (`stageScene.ts`), so it fits the layout at any width and casts a shadow the
 * key light throws. Behind it, eight rooms glow where the watch found change since the operator last looked — the
 * backdrop that "said nothing on 73 routes" now says which room to open first. The chrome is glass over all of it.
 *
 * WHAT IT NEVER DOES. It never draws data (the glows are the watch's counts, bounded, never randomised); it never
 * animates at rest; it never lowers a text floor — the stage's luminance is bounded (`STAGE_LUMINANCE_MAX`) and
 * `glass.test.ts` proves every certified role still clears 4.5:1 through the glass. On refusal (no WebGL2, a lost
 * context, the measurement switch) the DOM's own `bg-page` is what the operator sees — readable, and honest about it
 * through `data-stage="refused:<code>"`.
 *
 * LAZY for the same measured reason the Forge is: the engine's runtime imports are dynamic, so the shell chunk
 * carries only this component (~2 KB) and the stage arrives after first paint.
 */

type Mod = {
  createStage: typeof import('@lcx/gl/stage.js')['createStage'];
  isStage: typeof import('@lcx/gl/stage.js')['isStage'];
  hexToLinear: typeof import('@lcx/gl/look/colour.js')['hexToLinear'];
  TONE_MAP_GLSL: string; SRGB_ENCODE_GLSL: string;
  qualitySettings: typeof import('@lcx/gl/env/quality.js')['qualitySettings'];
  shadowMapSizeFor: typeof import('@lcx/gl/env/quality.js')['shadowMapSizeFor'];
  plane: typeof import('@lcx/gl/env/mesh.js')['plane'];
  createLitRenderer: typeof import('@lcx/gl/env/lit.js')['createLitRenderer'];
  uploadMesh: typeof import('@lcx/gl/env/lit.js')['uploadMesh'];
  createTarget3D: typeof import('@lcx/gl/env/target3d.js')['createTarget3D'];
  createShadowMap: typeof import('@lcx/gl/env/target3d.js')['createShadowMap'];
  createSkyBackdrop: typeof import('@lcx/gl/env/sky.js')['createSkyBackdrop'];
  createPointCloud: typeof import('@lcx/gl/primitives/points.js')['createPointCloud'];
  eyeOf: typeof import('@lcx/gl/env/camera.js')['eyeOf'];
  viewProjection: typeof import('@lcx/gl/env/camera.js')['viewProjection'];
  nearFarOf: typeof import('@lcx/gl/env/camera.js')['nearFarOf'];
  lightViewProjection: typeof import('@lcx/gl/env/camera.js')['lightViewProjection'];
  sceneTheme: typeof import('@lcx/gl/look/theme.js')['sceneTheme'];
  scene: typeof import('@lcx/gl/env/stageScene.js');
  IDENTITY: typeof import('@lcx/gl/math.js')['IDENTITY'];
};

const NM = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const SHADOW_BASELINE = 1024;

/** The element the plate is fitted to. The shell marks its main content region with this attribute. */
export const STAGE_PLATE_ATTR = 'data-stage-plate';

interface StageProps {
  /** The attribute the shell puts on its content region; the shelf is fitted to that element's rect. */
  readonly plateAttr?: string;
}

export function Stage({ plateAttr = STAGE_PLATE_ATTR }: StageProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<string>('loading');
  const location = useLocation();
  const revealed = useArrivalStore((s) => s.revealed);
  const watch = useArrivalStore((s) => s.watch);
  const entitlements = useAccessStore((s) => s.me?.entitlements ?? null);
  const drawRef = useRef<(() => void) | null>(null);

  // Anything that changes what the stage should show asks for exactly one new frame.
  useEffect(() => { drawRef.current?.(); }, [location.pathname, revealed, watch, entitlements]);

  useEffect(() => {
    let alive = true;
    let dispose: (() => void) | null = null;
    void Promise.all([
      import('@lcx/gl/stage.js'), import('@lcx/gl/look/colour.js'), import('@lcx/gl/look/tonemap.js'),
      import('@lcx/gl/env/quality.js'), import('@lcx/gl/env/mesh.js'), import('@lcx/gl/env/lit.js'),
      import('@lcx/gl/env/target3d.js'), import('@lcx/gl/env/sky.js'), import('@lcx/gl/primitives/points.js'),
      import('@lcx/gl/env/camera.js'), import('@lcx/gl/look/theme.js'), import('@lcx/gl/env/stageScene.js'),
      import('@lcx/gl/math.js'),
    ]).then(([stg, col, tm, q, mesh, lit, t3d, sky, pts, cam, th, scene, mth]) => {
      if (!alive) return;
      start({
        createStage: stg.createStage, isStage: stg.isStage, hexToLinear: col.hexToLinear,
        TONE_MAP_GLSL: tm.TONE_MAP_GLSL, SRGB_ENCODE_GLSL: tm.SRGB_ENCODE_GLSL,
        qualitySettings: q.qualitySettings, shadowMapSizeFor: q.shadowMapSizeFor,
        plane: mesh.plane, createLitRenderer: lit.createLitRenderer, uploadMesh: lit.uploadMesh,
        createTarget3D: t3d.createTarget3D, createShadowMap: t3d.createShadowMap, createSkyBackdrop: sky.createSkyBackdrop,
        createPointCloud: pts.createPointCloud, eyeOf: cam.eyeOf, viewProjection: cam.viewProjection, nearFarOf: cam.nearFarOf,
        lightViewProjection: cam.lightViewProjection, sceneTheme: th.sceneTheme, scene, IDENTITY: mth.IDENTITY,
      });
    }).catch(() => { if (alive) setState('refused:LOAD_FAILED'); });

    function start(g: Mod) {
      const canvas = canvasRef.current, host = hostRef.current;
      if (!canvas || !host) return;
      const tier = resolveQualityTier();
      // The tier is a fact about the frame, stamped where a capture can read it back (qualityTierStamp.test.ts).
      canvas.dataset.qualityTier = tier;
      const Q = g.qualitySettings(tier);
      const dpr = Math.min(Q.dprScale, Math.max(1, globalThis.devicePixelRatio || 1));
      const outcome = g.createStage(canvas, { alpha: false });
      if (!g.isStage(outcome)) { setState(`refused:${outcome.code}`); return; }
      const stage = outcome; const gl = stage.gl;
      const present = stage.compile(`#version 300 es
precision highp float; out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`,
        `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uScene; out vec4 frag;
${g.TONE_MAP_GLSL}
${g.SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`);
      const lit = g.createLitRenderer(stage);
      const skyB = g.createSkyBackdrop(stage);
      const shadow = g.createShadowMap(stage, g.shadowMapSizeFor(tier, SHADOW_BASELINE));
      const bail = (reason: string) => { setState(`refused:${reason}`); stage.dispose(); };
      if ('kind' in present) return bail(present.code);
      if ('kind' in lit) return bail(lit.code);
      if ('kind' in skyB) return bail(skyB.code);
      if ('kind' in shadow) return bail(shadow.code);
      const floorMesh = g.uploadMesh(stage, g.plane(80, 4));
      if ('kind' in floorMesh) return bail(floorMesh.code);

      let W = 1, H = 1, target: Target3D | null = null;
      let slab: MeshBuffer | null = null;
      let glows: PointCloud | null = null;

      const plateRect = () => {
        const el = document.querySelector<HTMLElement>(`[${plateAttr}]`);
        const hr = host.getBoundingClientRect();
        if (!el) return { x: hr.width * 0.2, y: hr.height * 0.1, w: hr.width * 0.78, h: hr.height * 0.88 };
        const r = el.getBoundingClientRect();
        return { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
      };

      const size = () => {
        const cssW = Math.max(1, host.clientWidth), cssH = Math.max(1, host.clientHeight);
        const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
        if (w === W && h === H && target) return;
        W = w; H = h; canvas.width = W; canvas.height = H;
        target?.dispose();
        const t = g.createTarget3D(stage, W, H);
        target = 'kind' in t ? null : t;
      };

      const draw = () => {
        if (!alive) return;
        size();
        if (!target) return;
        const dark = document.documentElement.classList.contains('dark');
        const theme = g.sceneTheme(dark ? 'dark' : 'light');
        const view = { ...g.scene.STAGE_VIEW };
        const aspect = W / H;
        const vp = g.viewProjection(view, aspect);
        const eye = g.eyeOf(view);

        // The plate: the DOM content rect unprojected onto y = PLATE_Y.
        const inv = g.scene.invert(vp);
        const rect = plateRect();
        const ndc = g.scene.rectToNdc(rect, { w: host.clientWidth, h: host.clientHeight });
        // THE SHELF: only the page's BOTTOM edge is unprojected onto the plate plane; the shelf runs SHELF_DEPTH back
        // from it. So the page stands on something real, and everything behind the page is room, not slab.
        const bl = inv ? g.scene.unprojectToPlane(inv, ndc.bl[0], ndc.bl[1], g.scene.PLATE_Y) : null;
        const br = inv ? g.scene.unprojectToPlane(inv, ndc.br[0], ndc.br[1], g.scene.PLATE_Y) : null;
        const D = g.scene.SHELF_DEPTH;
        const top = (bl && br
          ? [[bl[0], g.scene.PLATE_Y, bl[2] - D], [br[0], g.scene.PLATE_Y, br[2] - D], br, bl]
          : [[-4, g.scene.PLATE_Y, 1.5 - D], [4, g.scene.PLATE_Y, 1.5 - D], [4, g.scene.PLATE_Y, 1.5], [-4, g.scene.PLATE_Y, 1.5]]) as [typeof eye, typeof eye, typeof eye, typeof eye];
        slab?.dispose();
        const up = g.uploadMesh(stage, g.scene.slabGeometry(top));
        slab = 'kind' in up ? null : up;

        // The rooms: glows behind the plate, sized by the watch.
        const backZ = Math.min(top[0][2], top[1][2]);
        const cx = (top[0][0] + top[1][0]) / 2;
        const positions = g.scene.roomPositions(backZ, cx);
        const here = workspaceForPath(location.pathname);
        const centres: number[] = [], attrs: number[] = [];
        g.scene.ROOM_ORDER.forEach((room, i) => {
          const held = entitlements ? Object.prototype.hasOwnProperty.call(entitlements, room) : true;
          const changed = held ? (watch?.byWorkspace?.[room]?.changed ?? 0) : null;
          const glow = g.scene.roomGlow({ changed, here: here === room });
          if (glow.size === 0) return;
          const p = positions[i]!;
          centres.push(p[0], p[1] + 0.02, p[2]);
          attrs.push(glow.intensity, 0);
        });
        glows?.dispose();
        glows = null;
        if (centres.length) {
          const pc = g.createPointCloud(stage, { centres: new Float32Array(centres), attributes: new Float32Array(attrs), count: centres.length / 3 });
          glows = 'kind' in pc ? null : pc;
        }

        const L = g.scene.STAGE_LIGHT[dark ? 'dark' : 'light'];
        const light = { direction: g.scene.STAGE_KEY_DIR, colour: [L.keyGain, L.keyGain * 0.98, L.keyGain * 0.94] as [number, number, number] };
        const lightVP = g.lightViewProjection(light, [cx, g.scene.PLATE_Y, (top[0][2] + top[3][2]) / 2], 9);
        const draws = [
          { mesh: floorMesh, model: g.IDENTITY(), normalMat: NM, material: { baseColour: theme.structure, roughness: 0.82, metalness: 0.05 } },
          ...(slab ? [{ mesh: slab, model: g.IDENTITY(), normalMat: NM, material: { baseColour: theme.plate, roughness: 0.5, metalness: 0.1 } }] : []),
        ];
        lit.shadowPass(lightVP, draws, shadow);
        target.bind();
        gl.clear(gl.DEPTH_BUFFER_BIT);
        // The horizon carries a breath of the brand at the far edge of the room — visible in the band under the top bar.
        const brand = g.hexToLinear('#2C6BFF');
        const horizon = dark
          ? ([theme.skyHorizon[0] * 0.85 + brand[0] * 0.05, theme.skyHorizon[1] * 0.85 + brand[1] * 0.05, theme.skyHorizon[2] * 0.85 + brand[2] * 0.08] as const)
          : ([theme.skyHorizon[0] * 0.80 + brand[0] * 0.14, theme.skyHorizon[1] * 0.84 + brand[1] * 0.14, theme.skyHorizon[2] * 0.92 + brand[2] * 0.10] as const);
        const skyStops = { zenith: theme.skyZenith, horizon, ground: theme.structure };
        skyB.draw({ eye, target: view.target, fovDeg: view.fovDeg, aspect, sky: skyStops });
        lit.depthPrepass(vp, draws);
        lit.draw({
          viewProj: vp, eye, lightDir: light.direction, lightColour: light.colour, ambientGain: L.ambientGain, sky: skyStops,
          lightVP, shadow, shadowStrength: L.shadowStrength, shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE, draws,
          ao: null, screenSize: [W, H], fog: { density: L.fogDensity, height: 3.0, colour: 'sky' },
        } as Parameters<typeof lit.draw>[0]);
        if (glows) {
          gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
          glows.draw(vp, { size: L.glowSize, lo: g.hexToLinear(dark ? '#2C6BFF' : '#1F4FCC'), hi: g.hexToLinear(dark ? '#7FA6FF' : '#2C6BFF'), gain: L.glowGain, floorY: -1 });
          gl.depthMask(true); gl.disable(gl.BLEND);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.disable(gl.DEPTH_TEST);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
        gl.enable(gl.DEPTH_TEST);
        setState('drawn');
      };

      // Coalesce many invalidations in one task (a resize fires both observers) into ONE synchronous draw at the end
      // of that task. A microtask, not a frame: the redraw ratchet forbids a renderer scheduling a frame it does
      // not draw (§6 rule 2 — a deferred frame can land after its data or its context is gone), and nothing here
      // needs the compositor's cadence; the stage draws when state changes and holds the frame.
      let pending = false;
      const invalidate = () => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; draw(); }); };
      drawRef.current = invalidate;
      const ro = new ResizeObserver(invalidate);
      ro.observe(host);
      const plateEl = document.querySelector(`[${plateAttr}]`);
      if (plateEl) ro.observe(plateEl);
      const mo = new MutationObserver(invalidate);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      invalidate();
      dispose = () => { ro.disconnect(); mo.disconnect(); glows?.dispose(); slab?.dispose(); target?.dispose(); stage.dispose(); };
    }
    return () => { alive = false; drawRef.current = null; dispose?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" data-stage={state}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
