# P6 · THE OBJECTS (Blender → glTF) — preparation, written while the P5 sweep ran (2026-09-03)

Plan text (VFX_PRODUCTION_PLAN.md §P6): the Forge on sign-in as a real machined mesh (bevels, brushed grain,
engraved mark) under the P3 stack, live where hardware allows and the S7 still where it does not; room markers on the
stage as small machined objects; the plate with a real edge profile; `/lcxos` hero live. Built: a minimal glTF 2.0
loader in the engine (positions/normals/tangents/uv/indices, PBR factors, baked AO/normal PNG); `export_gltf.py` with
the S7 calibration pipeline; `public/objects/*.glb` within the passthrough budget. Gate: every asset within budget and
calibrated (Standard); the sign-in Forge's brand hex from the bytes; no eager bytes.

## What exists (read, not assumed)
- Forge live scene = FOUR PRIMITIVES built in the browser: ForgeBackdrop.tsx:461-465
  `cylinder(0.92,0.16,96)` disc · `torus(1.06,0.055,128,32)` ring · `cylinder(1.9,0.09,96)` plinth · `plane(16,24)` floor,
  each through `uploadMesh(stage, g)` (lit.ts:615 → MeshBuffer). The S7 still (`forge-{dark,light}.webp`) stands in when
  GL refuses (ForgeStill.tsx). build_forge.py rebuilds the SAME scene in Blender from those numbers (derived .blend).
- Engine `Geometry` (mesh.ts:22): positions/normals/uvs/tangents Float32Array, indices Uint16|Uint32, min/max bounds.
  `computeTangents` and `computeNormals` exist → the loader may omit TANGENT (and NORMAL) from the file and derive.
- Bytes: check-bundle passthrough = everything outside dist/assets (all of public/): last gate 835/1024 KB; objects/ is
  ~188 KB (du) — forge stills 116 KB, env maps 40 KB, sidecars. The checker's own note (check-bundle.mjs:167-171):
  "THIS IS THE 3D AND MEDIA BUDGET… raising it is fine, raising it silently is not. State the new number, what it
  bought, and re-measure." → P6 raises MAX_PASSTHROUGH_KB by exactly the measured glb bytes + small slack, in the body.
  glb files are fetched lazily by the Forge (already a lazy chunk) → "no eager bytes" holds by construction; assert it.
- Calibration: public/objects/calibration.json (patch #2C6BFF, Blender 5.2.0 LTS, rule: view_transform Standard; each
  object ships a .render.json sidecar; oneObject.test refuses objects without sidecars). brand_hex.py / calibrate.py /
  render.py / encode.py are the S7 pipeline; export_gltf.py joins them.

## Decisions taken now (so the build does not re-plan)
1. LOADER `packages/gl/src/env/gltf.ts`: parse GLB container (magic 0x46546C67, version 2, JSON chunk 0x4E4F534A, BIN
   chunk 0x004E4942); accessors decoded GENERICALLY by componentType (5120/5121/5122/5123/5125/5126) + `normalized` →
   Float32Array, so KHR_mesh_quantization-shaped files load with no special path; per mesh primitive: POSITION
   (required), NORMAL (else computeNormals), TEXCOORD_0 (else zeros), TANGENT (else computeTangents), indices (else
   refused — no non-indexed path, keep it minimal); mode 4 only. Materials: pbrMetallicRoughness factors only
   (baseColorFactor, metallicFactor, roughnessFactor) + our own `extras.anisotropy`/`extras.brandHex` written by the
   exporter. Textures: NOT in step 1 — a 256² normal PNG is 60–120 KB against a ~190 KB headroom; the machined
   detail is GEOMETRY (bevels ~10k tris) and the grain is the anisotropic shader that already exists. AO baked to a
   256² grey PNG only if the measured bytes allow (decide at build, record either way). Returns `{ meshes: {name →
   Geometry & material} }` or a StageRefusal-shaped refusal with the reason (bad magic, missing accessor, mode ≠ 4).
   Unit tests: a GLB written by the test itself (tiny quad) round-trips; a corrupt header refuses; a quantized int16
   position accessor decodes to the same floats.
2. EXPORT `scripts/blender/export_gltf.py`: writes the GLB BY HAND from Blender mesh data (no exporter add-on
   dependency, Draco off, full control of quantization): positions int16 normalized (KHR_mesh_quantization),
   normals int8 normalized, uv uint16 normalized, indices uint16. Scene: disc + ring + plinth with bevel modifiers,
   the engraved mark as a boolean difference of the EXTRACTED brand path (memory: do NOT redraw the mark; import its
   path data as a curve → extrude → boolean), materials carrying the brand hex from calibration.json. Target ≤ ~10k
   triangles → ~200 KB. Sidecar `forge.glb.render.json` in the render.py shape (view transform Standard, hex from
   bytes via brand_hex.py on a rendered patch of the same material).
3. WIRING: ForgeBackdrop keeps the four primitives as the first frame and swaps the disc/ring/plinth MeshBuffers when
   the glb resolves (progressive; the still remains the GL-off path). Room markers: `stageScene.ts` gains a `markers`
   draw fed by a second, tiny glb (or named meshes in the same file — pick by bytes) and falls back to the current
   primitive markers when absent. Plate edge profile: a bevelled ring mesh under the plate edge — measure the plate
   ceiling (§4 open item) before adding anything luminous. `/lcxos` hero: mount ForgeBackdrop under the existing still
   with the same GL-off fallback.
4. GATES (each a test or a measured line in the commit body): glb bytes per file + new passthrough number; loader
   round-trip + refusals; `oneObject.test` extended to glb sidecars; brand hex of the sign-in Forge from encoded bytes
   (brand-fidelity.mjs already samples the Forge plate — extend to the glb frame); instrument sweep on /select-operator
   and /lcxos (fixtures on) with heroRects; no eager bytes = initial JS unchanged and no `.glb` in index.html preloads.

## Sequence (after P5 flips LIVE)
loader + tests → exporter + calibration run (Blender 5.2 present locally) → glb bytes measured → budget raised in the
body → wiring (Forge, markers, plate edge, /lcxos) → sweep → root gate → commit → push → verify-live (`--lazy-js`
needle on the loader's magic string `glTF` and a public `objects/forge.glb` 200 with the right byte count) → P6 LIVE.

## Facts added during the wait
- Blender 5.2.0 LTS at /Applications/Blender.app/Contents/MacOS/Blender (the calibration.json version) — the exporter runs locally.
- The P5 sweep ran ~5 min/route-pair at the start (14/80 after 15 min) — budget ~75 min for a full sweep with fixtures, warm-up and in-place pairs.
- WIRING FACT (ForgeBackdrop.tsx:461-520): the four MeshBuffers (disc/ring/plinth/floor) are uploaded once and a draw
  list is rebuilt PER FRAME with the live theme's materials — disc '#8FA3C4' dark / '#5E6C85' light, plinth '#161D2E' /
  '#AEBACD' (build_forge.py's light plinth is '#B9C5D8' — the still and the live scene already disagree by one hex;
  record, do not "fix" silently), ring '#2C6BFF' both. Roughness is stored as sqrt(authored) (0.5477 = √.30,
  0.3606 = √.13) and pinned by anisoPreserved.test.ts. DECISION: the glb contributes GEOMETRY; ForgeBackdrop keeps
  material authority (one place, one convention, one test). The glb's pbr factors + extras are descriptive and feed
  the sidecar/brand check only. The loader's `roughness` is the authored value — never feed it to the engine raw.
- stageScene.ts has no markers today; "room markers as small machined objects" is new geometry, not a swap.
- Drafts in this directory: gltf.ts (loader, node TRS de-quantization, refusals), gltf.test.ts (5 tests incl.
  quantized + TRS), export_gltf.py (hand-written GLB writer, bevels, engraved mark from lcx-mark.svg). None run yet —
  the sweep owns the machine; run `npx vitest run packages/gl/src/env/__tests__/gltf.test.ts` after moving them in.
- MEASURED (dark export, ring 128×16): forge.glb 146716 bytes; disc 1940 v / 3680 t, ring 2048 v / 4096 t, plinth 1792 v / 3580 t; loader parse: bounds = live radii, 0 off-unit normals/tangents. Passthrough would read ~835+143 KB → raise MAX_PASSTHROUGH_KB to 1152 (states the number; ~174 KB slack for the markers glb).
- DECISION: one theme-agnostic forge.glb (geometry is theme-independent; materials live in ForgeBackdrop). The exporter keeps --theme only for the descriptive plinth hex in extras/sidecar.
- SHADING (measured, not assumed): the boolean leaves 66 flat faces (walls + cap fragments) → the engraving walls already carry face normals; the 30° angle rule splits 40 cap loops on the disc and every one lands on an existing flat-fragment vertex → 1940 vertices either way, bytes identical (146,716). The rule stays because it is the guarantee, the boolean output is the reason it currently costs nothing. Ring/plinth: 0 splits.
