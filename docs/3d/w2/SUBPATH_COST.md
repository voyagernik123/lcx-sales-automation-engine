# X2 · Sub-path exports — what reach costs, measured

`3D_VFX_100X_LIVE.md:103` states the finding: **13.5 KB a route instead of 87.7 KB**. Both numbers were
checked against a real build before anything was changed. One of them is exactly right, one is optimistic,
and the *cause* the line implies is only half the cause — which matters, because the obvious cheaper fix
does not work and was measured failing.

Everything below is raw bytes from `vite build`, never gzip, because that is what the perf budget measures.

---

## 1 · The 87.7 KB is real, to the byte

`apps/web/dist/assets` at the commit this was written. GL chunks found by **shader bytes**
(`grep -l "precision highp float"`), not by filename — a filename list finds 7 and there are 15.

The flat-chart lane reaches `@lcx/gl` through `useFlatChart.ts:98`'s `import()`. That resolves to one
chunk, and a chunk's **static** imports are unconditional: fetching it fetches all of them.

| chunk | bytes |
|---|---:|
| `index-b9cOYKUz.js` (the `@lcx/gl` barrel) | 28,596 |
| `lit-aGuFOGn0.js` | 28,873 |
| `tonemap-CSD-Ky3i.js` | 9,086 |
| `volume-DbTqbDF_.js` — the raymarcher | 6,639 |
| `ao-C1pMhl--.js` | 5,622 |
| `pipeline-Dn6Btr4a.js` | 4,221 |
| `dof-DjZC8j9U.js` | 3,566 |
| `lines-2mdvi6qE.js` | 1,801 |
| `project-CX0jHtRk.js` | 1,389 |
| **total** | **89,793 B = 87.7 KiB** |

Ten route chunks reach `useFlatChart`: `KpiDashboard`, `WinLoss`, `BoardReport`, `ExchangeGaps`,
`ReportBuilder`, `OutreachOps`, `CommandDeck`, `DonutChart`, `tooltip`, and the entry. **A route rendering
one bar chart downloads the volumetric raymarcher, the lit renderer, ambient occlusion and depth of field.**

## 2 · The 13.5 KB is the floor, not the figure

Measured through synthetic entries at `p1/build.mjs`'s settings (esbuild, ESM, es2022, minified):

| what a route imports | bytes | KiB |
|---|---:|---:|
| strokes only — `FlatLine` / `FlatDial` / `FlatTrack` | 14,110 | **13.8** |
| bars only — `FlatBars` / `FlatTrack` | 18,051 | 17.6 |
| the whole flat lane (bars + strokes + shared + stage + pipeline + colour) | 21,663 | 21.2 |

So **13.5 KB is a single-chart-kind route**. A dashboard mixing bar and line charts is 21.2 KiB before
chunk-boundary overhead, and 23.1 KiB measured end-to-end (§5). The saving is 64 KiB, not 74 KiB.

## 3 · The cause is NOT that the barrel fails to tree-shake — and the cheap fix was measured failing

The finding reads as "the package does not expose sub-path entry points, so the barrel drags everything in".
The barrel is not the problem. Same settings, same names:

```
21,667 B   named imports from '@lcx/gl'        ← the barrel, shaken
21,663 B   the same names from their modules   ← sub-paths
87,072 B   import * as m from '@lcx/gl'        ← what apps/web does today
```

**Four bytes apart.** Shaking through the barrel is already perfect. What defeats it is that every dynamic
consumer stores the whole namespace — `setMod(m)` at `FlatBars.tsx:66`, `FlatLine.tsx:62`, `FlatDial.tsx:86`,
`FlatTrack.tsx:80`, `SignatureBackdrop.tsx:81`, `ForgeBackdrop.tsx:78`. A retained namespace object has no
unused exports.

So the obvious cheap fix is "destructure at the import site and change nothing else". **It does not work,
and this is the finding that decides the task.** Two lanes, one app, every site destructured, no exports map:

```
out-lanes/laneFlat.js    0.60 kB  ─┐
out-lanes/laneEnv.js     1.11 kB  ─┴─ both dynamically import →
out-lanes/index.js      68.88 kB      ONE shared chunk
```

68.9 KiB, still carrying the raymarcher into a chart route. Rollup places a module in the chunk of the
**lowest common ancestor of the entries that reach it**, and with both lanes resolving to `src/index.ts`
the union of the two lanes is one chunk by construction. Tree-shaking is not the lever; **specifier
identity** is. The same two lanes, flat resolved through sub-paths:

```
flat lane:  shared 1.33 + bars 7.19 + strokes 3.09 + pipeline 4.44 + stage 5.20 + colour 0.65 = 21.9 kB
env lane:   index.js 48.18 kB        ← no longer carries the flat layer either
```

Sub-path exports are therefore the right lever, for a reason the finding did not state.

## 4 · What was changed, and the proof it changes nothing by itself

`packages/gl/package.json` only. `"."` is untouched; three keys were added:

```json
"./package.json": "./package.json",
"./*.js": { "types": "./src/*.ts", "import": "./src/*.ts", "default": "./src/*.ts" },
"./*":    { "types": "./src/*.ts", "import": "./src/*.ts", "default": "./src/*.ts" }
```

- **Wildcards, not a lane list.** A hand-written `flat` / `env` / `look` list cannot fail on a module nobody
  thought of, and this package gains modules; every recurring defect in this repo has been such a list.
  Lane barrels would also mean new files under `packages/gl/src/`, which this task may not create.
- **`./*.js` must stay.** This package's own source imports with explicit extensions (`'../stage.js'`), so a
  consumer copying that idiom must resolve. Node prefers the longer pattern trailer, so `flat/bars.js` takes
  `./*.js` and `flat/bars` takes `./*`; both land on `src/flat/bars.ts`. Verified through Node's own resolver.
- **`./package.json` is not decoration — the wildcard broke it.** Before: `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  After `./*` alone: `Cannot find module '.../@lcx/gl/src/package.json.ts'`, because `*` captured
  `package.json` and appended `.ts`. An exact key beats a pattern, so this restores it to the real file.

**The exports map alone moves no byte, and that was verified rather than assumed.** `apps/web` was rebuilt
with it in place: every GL chunk came back with an identical content hash and identical size —
`lit-aGuFOGn0.js` 28,873 B, `index-b9cOYKUz.js` 28,596 B, all nine. Initial JS 827,861 B (808 KB) both times.

## 5 · The end-to-end result, measured on a full mirror of the app

The saving needs `apps/web` to change its specifiers, and those files belong to other lanes. To produce a
real number rather than a projection, the whole app was mirrored (`packages/` and `node_modules` symlinked
to the repo, `apps/web` copied), the flat lane and `ForgeBackdrop` rewritten **in the mirror only**, and
both built with sourcemaps. A chunk counts as GL when *every* `sources` entry in its sourcemap is under
`packages/gl/src` — derived from the build, not from a filename list. Lane cost is what the browser
actually fetches: the lane chunk's `import()` targets plus their static closure.

| | before | after | Δ |
|---|---:|---:|---:|
| flat-chart lane (10 routes) | 90,181 B · 88.1 KiB · 9 chunks | 23,681 B · **23.1 KiB** · 7 chunks | **−66,500 B, −73.7%** |
| `ForgeBackdrop` (sign-in shell) | 90,181 B · 88.1 KiB · 9 chunks | 47,415 B · **46.3 KiB** · 12 chunks | **−42,766 B, −47.4%** |
| initial JS | 827,998 B | 827,998 B | **0** |
| all JS in the build | 3,145,660 B | 3,135,321 B | −10,339 B |
| chunk count | 195 | 205 | +10 |

*(Mirror figures include the `//# sourceMappingURL` comment; the 90,181 B here is the same closure as the
89,793 B of §1, +388 B of comments across 9 chunks.)*

The relief renderers were already fine and stay fine — they import **named** symbols statically, so they
never carried the flat layer: `GlobeReliefGl` 42.7 → 43.1, `OntologyOrreryGl` 37.2 → 37.6,
`VaultReliefGl` 44.1 → 44.5, `DeckReliefGl` 47.6 → 48.1 KiB. The ~0.5 KiB each is chunk-boundary overhead.

**Finish the migration or do not start it.** With only the flat lane moved and `ForgeBackdrop` left on the
barrel, `ForgeBackdrop` got *worse* — 88.1 → 89.8 KiB — because the barrel's closure fragmented into more
chunks and it paid the boundary overhead for a split it did not use. Whole-build JS was +3,943 B in that
half state and −10,339 B once both moved.

## 6 · Exactly what has to change in `apps/web`, and by whom

Not made here — these files belong to other lanes. Each is one `import()` becoming a `Promise.all` over the
modules that call site already destructures, merged with `Object.assign`:

| file:line | today | needs |
|---|---|---|
| `apps/web/src/components/charts/gl/useFlatChart.ts:98` | `await import('@lcx/gl')` | `@lcx/gl/flat/shared.js` — it destructures `sharedRenderer` alone, so this one is a single specifier swap |
| `apps/web/src/components/charts/gl/FlatBars.tsx:66` | `import('@lcx/gl').then(m => setMod(m))` | `flat/bars.js`, `look/pipeline.js`, `stage.js`, `look/colour.js` |
| `apps/web/src/components/charts/gl/FlatLine.tsx:62` | same | `flat/strokes.js`, `flat/bars.js` (`plotMatrix`), `look/pipeline.js`, `stage.js`, `look/colour.js` |
| `apps/web/src/components/charts/gl/FlatDial.tsx:86` | same | as `FlatLine` |
| `apps/web/src/components/charts/gl/FlatTrack.tsx:80` | same | as `FlatBars` |
| `apps/web/src/components/command/SignatureBackdrop.tsx:81` | same | `look/pipeline.js` only — it destructures `createPipeline` alone |
| `apps/web/src/components/brand/ForgeBackdrop.tsx:78` | same | `env/lit.js`, `env/mesh.js`, `env/camera.js`, `env/target3d.js`, `env/sky.js`, `env/ao.js`, `env/dof.js`, `env/quality.js`, `stage.js`, `look/colour.js` |

`typeof import('@lcx/gl')` in the type positions can stay — types are erased and cost nothing.

## 7 · What the change does NOT break, checked rather than assumed

- **`npm run gl-budget` is unaffected, and its measurement stays valid.** All three scripts
  (`p1/build.mjs`, `p0/measure.mjs`, `w1/build.mjs`) bundle **entry files by absolute path** with an esbuild
  `alias` for `@lcx/gl`, so package resolution is never consulted. Re-run after the change: spine 78.7 KB of
  147, all six lanes ✓, `flat/bars.ts` alone 8.4 KB, W1 gate 18.3 KB — every published row unchanged, and
  those scripts exit non-zero when prose and bundler disagree.
- **`scripts/type-check-3d.mjs`: 12/12 harnesses clean.** `packages/gl` `tsc --noEmit` clean; `vitest run`
  254/254 in 13 files; `apps/web` `useQualityTier.test.ts` 29/29 — it imports named symbols from the root.
- **Perf budget passes**, and the tight constraint never moved: initial JS 808/850 KB, largest chunk 406/440,
  CSS 111/140, fonts 434/440, passthrough 720/1024.

### The one thing that WOULD break, if a harness ever used a sub-path

The twelve harnesses resolve `@lcx/gl` through an esbuild `alias` pointing at **`index.ts`, a file**. esbuild
applies an alias to sub-paths by concatenation, so a harness writing `@lcx/gl/flat/bars.js` gets:

```
ERROR: Could not resolve ".../packages/gl/src/index.ts/flat/bars.js" (originally "@lcx/gl/flat/bars.js")
```

Their tsconfigs have the same shape — `"@lcx/gl": ["../../../packages/gl/src/index.ts"]`, no `/*` wildcard.
**Nothing breaks today**: every harness imports the root only, and the root is unchanged. But a harness that
wants a sub-path needs its own two lines first, and those files are owned elsewhere:

- alias, in all fourteen: `docs/3d/{e0,e1,e2,e3,e4,e5,e6,e7,e8,p1,s6,w1,w2,w5}/build.mjs` (`s6/build.mjs:11`
  and `:18`, line 13 in the rest) — add `'@lcx/gl/': resolve(ROOT, 'packages/gl/src/')` alongside the
  existing entry, keeping the exact-match alias.
- tsconfig, in all twelve: add `"@lcx/gl/*": ["../../../packages/gl/src/*"]` beside the existing key
  (`docs/3d/{e3,e4,e7,p1}/tsconfig.json:16`, `docs/3d/{e0,e1,e2,e5,e6,e8,s6,w1}/tsconfig.json:20`).

## 8 · Decision

Implement — the lever is real and the number is 64 KiB a chart route, verified end-to-end on a build of the
actual app rather than a synthetic entry. The finding's 87.7 KB is exact; its 13.5 KB is the best case and
23.1 KiB is what a real route lands at; and its implied cause is wrong in a way that would have sent the next
reader to destructure the call sites and bank 68.9 KiB as 21.2 KiB.

The half of this that lives in `packages/gl` is done and is inert on its own. The 64 KiB is not banked until
the seven call sites in §6 move, and it should be all seven in one change — §5 shows a partial migration is
a small net loss.
