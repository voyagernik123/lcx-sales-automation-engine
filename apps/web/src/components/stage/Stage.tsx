import { useEffect, useRef, useState } from 'react';
import { FORGE_GLB_URL } from '../brand/forgeObjects';
import type { Target3D } from '@lcx/gl/env/target3d.js';
import type { MeshBuffer } from '@lcx/gl/env/lit.js';
import type { PointCloud } from '@lcx/gl/primitives/points.js';
import { resolveQualityTier } from '../shared/useQualityTier';
import { useArrivalStore } from '@/lib/useArrival';
import { useAccessStore } from '@/stores/useAccessStore';
import { workspaceForPath } from '@lcx/shared';
import { onFrame } from '@/lib/clock';
import { prefersReducedMotion } from '@/lib/motion';
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
  createPresenter: typeof import('@lcx/gl/look/present.js')['createPresenter'];
  uploadEnvironment: typeof import('@lcx/gl/env/sky.js')['uploadEnvironment'];
  qualitySettings: typeof import('@lcx/gl/env/quality.js')['qualitySettings'];
  shadowMapSizeFor: typeof import('@lcx/gl/env/quality.js')['shadowMapSizeFor'];
  plane: typeof import('@lcx/gl/env/mesh.js')['plane'];
  createLitRenderer: typeof import('@lcx/gl/env/lit.js')['createLitRenderer'];
  uploadMesh: typeof import('@lcx/gl/env/lit.js')['uploadMesh'];
  parseGlb: typeof import('@lcx/gl/env/gltf.js')['parseGlb'];
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
  startMotion: typeof import('@lcx/gl/motion/index.js')['startMotion'];
  easeInOut: typeof import('@lcx/gl/motion/index.js')['easeInOut'];
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

  // Anything that changes what the stage should show asks for exactly one new frame — and a route change asks
  // for a MOVE when the workspace changed (P2), a cut when it did not.
  const moveRef = useRef<((room: string | null) => void) | null>(null);
  useEffect(() => { moveRef.current?.(workspaceForPath(location.pathname)); }, [location.pathname]);
  useEffect(() => { drawRef.current?.(); }, [revealed, watch, entitlements]);

  useEffect(() => {
    let alive = true;
    let dispose: (() => void) | null = null;
    void Promise.all([
      import('@lcx/gl/stage.js'), import('@lcx/gl/look/colour.js'), import('@lcx/gl/look/present.js'),
      import('@lcx/gl/env/quality.js'), import('@lcx/gl/env/mesh.js'), import('@lcx/gl/env/lit.js'),
      import('@lcx/gl/env/target3d.js'), import('@lcx/gl/env/sky.js'), import('@lcx/gl/primitives/points.js'),
      import('@lcx/gl/env/camera.js'), import('@lcx/gl/look/theme.js'), import('@lcx/gl/env/stageScene.js'),
      import('@lcx/gl/math.js'), import('@lcx/gl/motion/index.js'), import('@lcx/gl/env/gltf.js'),
    ]).then(([stg, col, pres, q, mesh, lit, t3d, sky, pts, cam, th, scene, mth, mo, gltf]) => {
      if (!alive) return;
      start({
        createStage: stg.createStage, isStage: stg.isStage, hexToLinear: col.hexToLinear,
        createPresenter: pres.createPresenter, uploadEnvironment: sky.uploadEnvironment,
        qualitySettings: q.qualitySettings, shadowMapSizeFor: q.shadowMapSizeFor,
        plane: mesh.plane, createLitRenderer: lit.createLitRenderer, uploadMesh: lit.uploadMesh,
        createTarget3D: t3d.createTarget3D, createShadowMap: t3d.createShadowMap, createSkyBackdrop: sky.createSkyBackdrop,
        createPointCloud: pts.createPointCloud, eyeOf: cam.eyeOf, viewProjection: cam.viewProjection, nearFarOf: cam.nearFarOf,
        lightViewProjection: cam.lightViewProjection, sceneTheme: th.sceneTheme, scene, IDENTITY: mth.IDENTITY,
        startMotion: mo.startMotion, easeInOut: mo.easeInOut, parseGlb: gltf.parseGlb,
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
      // THE ONE PRESENT PATH (P4; P3 wired it inline here first): copy → pipeline → FXAA → canvas, shared with the heroes.
      const presenter = g.createPresenter(stage);
      const lit = g.createLitRenderer(stage);
      const skyB = g.createSkyBackdrop(stage);
      const shadow = g.createShadowMap(stage, g.shadowMapSizeFor(tier, SHADOW_BASELINE));
      const bail = (reason: string) => { setState(`refused:${reason}`); stage.dispose(); };
      if ('kind' in presenter) return bail(presenter.code);
      if ('kind' in lit) return bail(lit.code);
      if ('kind' in skyB) return bail(skyB.code);
      if ('kind' in shadow) return bail(shadow.code);
      const floorMesh = g.uploadMesh(stage, g.plane(80, 4));
      if ('kind' in floorMesh) return bail(floorMesh.code);

      /* THE CAMERA (P2). `view` is where the camera IS; a move eases azimuth and target from the room it was in to the
         room it enters over STAGE_MOVE_MS, drawing each frame from the one clock (`onFrame`), then unsubscribes — a
         bounded, user-driven motion, then stillness. Reduced motion resolves to the final framing at once. The shelf
         ARRIVES during the move (its front edge eases up SHELF_ARRIVAL_DROP → 0) and the entered room's glow eases in. */
      let room: string | null = workspaceForPath(location.pathname);
      let view = g.scene.roomFraming(room as never);
      let shelfDrop = 0;
      let arrival = 1; // 0 → 1 across a move; 1 at rest
      let offFrame: (() => void) | null = null;
      let W = 1, H = 1, target: Target3D | null = null;
      let slab: MeshBuffer | null = null;
      let glows: PointCloud | null = null;
      /* THE ROOM MARKERS (P6): a small machined puck under each room's glow, from the same /objects/forge.glb the sign-in
         Forge draws (one asset, browser-cached after the first route that fetched it). Absent until it lands, absent for
         good if it refuses — the glows alone are the P3 state and remain a complete frame. */
      let markerMesh: MeshBuffer | null = null;

      const plateRect = () => {
        const el = document.querySelector<HTMLElement>(`[${plateAttr}]`);
        const hr = host.getBoundingClientRect();
        if (!el) return { x: hr.width * 0.2, y: hr.height * 0.1, w: hr.width * 0.78, h: hr.height * 0.88 };
        const r = el.getBoundingClientRect();
        return { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
      };

      let env: WebGLTexture | null = null, envFor = '', envReq = 0;
      const loadEnvironment = (dark: boolean) => {
        const name = dark ? 'dark' : 'light';
        if (envFor === name) return;
        envFor = name;
        const req = ++envReq;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (!alive || req !== envReq) return;               // a theme flip raced the fetch: the later one wins
          if (env) gl.deleteTexture(env);
          env = g.uploadEnvironment(gl, img);
          // Instrument-facing, like __LCX_STAGE_REDRAW: which studio is bound, so a capture can wait for it instead of guessing.
          (globalThis as { __LCX_STAGE_ENV_READY?: string }).__LCX_STAGE_ENV_READY = name;
          invalidate();
        };
        img.onerror = () => { /* procedural stops remain: the studio is an upgrade, never a dependency */ };
        img.src = `/objects/env-${name}.webp`;
      };
      const size = () => {
        const cssW = Math.max(1, host.clientWidth), cssH = Math.max(1, host.clientHeight);
        const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
        if (w === W && h === H && target) return;
        W = w; H = h; canvas.width = W; canvas.height = H;
        presenter.resize(W, H);
        target?.dispose();
        const t = g.createTarget3D(stage, W, H);
        target = 'kind' in t ? null : t;
      };

      const draw = () => {
        if (!alive) return;
        size();
        if (!target) return;
        const dark = document.documentElement.classList.contains('dark');
        loadEnvironment(dark);
        const theme = g.sceneTheme(dark ? 'dark' : 'light');
        const aspect = W / H;
        const vp = g.viewProjection(view, aspect);
        const eye = g.eyeOf(view);

        // The plate: the DOM content rect unprojected onto y = PLATE_Y.
        const inv = g.scene.invert(vp);
        const rect = plateRect();
        const ndc = g.scene.rectToNdc(rect, { w: host.clientWidth, h: host.clientHeight });
        // THE SHELF: only the page's BOTTOM edge is unprojected onto the plate plane; the shelf runs SHELF_DEPTH back
        // from it. So the page stands on something real, and everything behind the page is room, not slab.
        const plateY = g.scene.PLATE_Y - shelfDrop;
        const bl = inv ? g.scene.unprojectToPlane(inv, ndc.bl[0], ndc.bl[1], plateY) : null;
        const br = inv ? g.scene.unprojectToPlane(inv, ndc.br[0], ndc.br[1], plateY) : null;
        const D = g.scene.SHELF_DEPTH;
        const top = (bl && br
          ? [[bl[0], plateY, bl[2] - D], [br[0], plateY, br[2] - D], br, bl]
          : [[-4, plateY, 1.5 - D], [4, plateY, 1.5 - D], [4, plateY, 1.5], [-4, plateY, 1.5]]) as [typeof eye, typeof eye, typeof eye, typeof eye];
        slab?.dispose();
        const up = g.uploadMesh(stage, g.scene.slabGeometry(top));
        slab = 'kind' in up ? null : up;

        // The rooms: glows behind the plate, sized by the watch.
        const backZ = Math.min(top[0][2], top[1][2]);
        const cx = (top[0][0] + top[1][0]) / 2;
        const positions = g.scene.roomPositions(backZ, cx);
        const here = room;
        const centres: number[] = [], attrs: number[] = [];
        g.scene.ROOM_ORDER.forEach((roomId, i) => {
          const held = entitlements ? Object.prototype.hasOwnProperty.call(entitlements, roomId) : true;
          const changed = held ? (watch?.byWorkspace?.[roomId]?.changed ?? 0) : null;
          const glow = g.scene.roomGlow({ changed, here: false });
          // The entered room's +0.25 eases in with the arrival rather than snapping.
          if (here === roomId) { glow.intensity = Math.min(1, glow.intensity + 0.25 * arrival); glow.size += 0.3 * arrival; }
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
          { mesh: floorMesh, model: g.IDENTITY(), normalMat: NM, material: { baseColour: theme.structure, roughness: 0.7, metalness: 0.05 } },
          ...(slab ? [{ mesh: slab, model: g.IDENTITY(), normalMat: NM, material: { baseColour: theme.plate, roughness: 0.28, metalness: 0.08 } }] : []),
          // Eight machined pucks on the arc, each under its room's glow (the glow point sits 3 cm above the puck's face).
          ...(markerMesh ? positions.map((p) => {
            const m = g.IDENTITY(); m[12] = p[0]; m[13] = 0.025; m[14] = p[2];
            return { mesh: markerMesh!, model: m, normalMat: NM, material: { baseColour: theme.plate, roughness: 0.34, metalness: 0.55 } };
          }) : []),   // glossy enough to mirror the studio's front key (P3)
        ];
        lit.shadowPass(lightVP, draws, shadow);
        target.bind();
        gl.clear(gl.DEPTH_BUFFER_BIT);
        // The horizon carries a breath of the brand at the far edge of the room — visible in the band under the top bar.
        const brand = g.hexToLinear('#2C6BFF');
        const horizon = dark
          ? ([theme.skyHorizon[0] * 0.85 + brand[0] * 0.05, theme.skyHorizon[1] * 0.85 + brand[1] * 0.05, theme.skyHorizon[2] * 0.85 + brand[2] * 0.08] as const)
          : ([theme.skyHorizon[0] * 0.80 + brand[0] * 0.14, theme.skyHorizon[1] * 0.84 + brand[1] * 0.14, theme.skyHorizon[2] * 0.92 + brand[2] * 0.10] as const);
        const skyStops = { zenith: theme.skyZenith, horizon, ground: theme.structure, envMap: env, envGain: L.envGain };
        skyB.draw({ eye, target: view.target, fovDeg: view.fovDeg, aspect, sky: skyStops });
        lit.depthPrepass(vp, draws);
        lit.draw({
          viewProj: vp, eye, lightDir: light.direction, lightColour: light.colour, ambientGain: L.ambientGain, sky: skyStops,
          lightVP, shadow, shadowStrength: L.shadowStrength, shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE, draws,
          ao: null, screenSize: [W, H], fog: { density: L.fogDensity, height: 3.0, colour: 'sky' },
        } as Parameters<typeof lit.draw>[0]);
        if (glows) {
          gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
          // Dark glows are DEEP blue on purpose (chroma-led, P3): the .04 luminance ceiling is spent on blue, whose luminance weight
          // is .07, so the room stays visible through the plate (channel delta) without spending luminance on it.
          glows.draw(vp, { size: L.glowSize, lo: g.hexToLinear(dark ? '#1A3FCC' : '#1F4FCC'), hi: g.hexToLinear(dark ? '#2C6BFF' : '#2C6BFF'), gain: L.glowGain, floorY: -1 });
          gl.depthMask(true); gl.disable(gl.BLEND);
        }
        presenter.present(target, { theme: dark ? 'dark' : 'light' });
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
      void (async () => {
        try {
          const res = await fetch(FORGE_GLB_URL);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const bytes = await res.arrayBuffer();
          if (!alive) return;
          const asset = g.parseGlb(bytes);
          if (asset.kind === 'refused') { host.dataset.markers = `refused: ${asset.reason}`; return; }
          const marker = asset.meshes.find((m) => m.name === 'marker');
          if (!marker) { host.dataset.markers = 'refused: forge.glb has no marker mesh'; return; }
          const up = g.uploadMesh(stage, marker.geometry);
          if ('kind' in up) { host.dataset.markers = `refused: ${up.reason}`; return; }
          if (!alive) { up.dispose(); return; }
          markerMesh = up;
          host.dataset.markers = `glb ${asset.bytes} bytes · 8 pucks`;
          invalidate();
        } catch (e) {
          if (alive) host.dataset.markers = `unavailable: ${e instanceof Error ? e.message : String(e)}`;
        }
      })();
      /* THE REDRAW CONTRACT (P0 → P3). One forced synchronous frame, returning its own wall time in ms, so the instrument
         can report the stage's cost per route×theme and P8 can hold it under budget. Read by nothing in the product. */
      (globalThis as { __LCX_STAGE_REDRAW?: () => number }).__LCX_STAGE_REDRAW = () => { const t0 = performance.now(); draw(); return performance.now() - t0; };
      moveRef.current = (next) => {
        if (next === room) { invalidate(); return; }              // same room, new page: a cut
        const from = view, to = g.scene.roomFraming(next as never);
        room = next;
        offFrame?.(); offFrame = null;
        const tween = g.startMotion({ purpose: 'user-driven', durationMs: g.scene.STAGE_MOVE_MS }, { reducedMotion: prefersReducedMotion(), now: () => performance.now() });
        const settle = (t: number) => {
          view = { ...to, azimuthDeg: from.azimuthDeg + (to.azimuthDeg - from.azimuthDeg) * t,
            target: [from.target[0] + (to.target[0] - from.target[0]) * t, to.target[1], to.target[2]] as typeof to.target };
          shelfDrop = (1 - t) * g.scene.SHELF_ARRIVAL_DROP;
          arrival = t;
        };
        if (tween.instant) { settle(1); invalidate(); return; }
        settle(0);
        offFrame = onFrame(() => {
          const t = tween.value();
          settle(t);
          draw();
          if (tween.done) { offFrame?.(); offFrame = null; }
        });
      };
      const ro = new ResizeObserver(invalidate);
      ro.observe(host);
      const plateEl = document.querySelector(`[${plateAttr}]`);
      if (plateEl) ro.observe(plateEl);
      const mo = new MutationObserver(invalidate);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      invalidate();
      dispose = () => { delete (globalThis as { __LCX_STAGE_REDRAW?: () => number }).__LCX_STAGE_REDRAW; delete (globalThis as { __LCX_STAGE_ENV_READY?: string }).__LCX_STAGE_ENV_READY; ro.disconnect(); mo.disconnect(); offFrame?.(); envReq++; if (env) gl.deleteTexture(env); glows?.dispose(); slab?.dispose(); target?.dispose(); presenter.dispose(); stage.dispose(); };
        (markerMesh as MeshBuffer | null)?.dispose(); markerMesh = null;
      // THE INSTRUMENT'S IN-PLACE GL-OFF (P3): same page, second capture without GL. Dispose, blank the drawing buffer so
      // the page ground shows through, and name the state — the same refusal code a fresh createStage gives under
      // `__LCX_GL_OFF`. Nothing in the product dispatches this event.
      // Hide the canvas as well as disposing: a disposed context keeps its last presented frame on screen, and the
      // measurement wants the page WITHOUT its GL layer — the ground the plate would show over a refused stage.
      const forceOff = () => { const d = dispose; dispose = () => {}; d?.(); canvas.style.display = 'none'; setState('refused:FORCED_OFF_FOR_MEASUREMENT'); };   // inline: a display utility class beats [hidden]
      window.addEventListener('lcx:gl-force-off', forceOff, { once: true });
      { const d = dispose; dispose = () => { window.removeEventListener('lcx:gl-force-off', forceOff); d?.(); }; }
    }
    return () => { alive = false; drawRef.current = null; moveRef.current = null; dispose?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" data-stage={state}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
