/*
 * IS IT ACTUALLY LIVE? — a check against the DEPLOYED site, not against a local build.
 *
 * Everything else in this repo measures the build on this machine. `perf-budget` reads `apps/web/dist`,
 * `ci-check` compiles and tests locally, and the 3-D captures rasterise headlessly here. None of that says a
 * single thing about what a reader is being served, and "I pushed and CI was green" is not the same claim as
 * "the new build is live".
 *
 * ── THE ONE THING THIS CHECKS THAT NOTHING ELSE CAN ──────────────────────────────────
 * Nine 3-D environments now ship behind opt-in toggles, and every one of them depends on the GL layer being in
 * a LAZY chunk. The perf budget proves that about the local bundle. It cannot prove it about production: a
 * misconfigured build, a changed Vite setting, or a modulepreload hint could put a GL chunk in the initial set
 * on the deployed site while the local budget stayed green. Initial JS has 11 KB of headroom and the env layer
 * is 35.7 KB, so that failure is not subtle — it is a third of a megabyte of renderer arriving for every reader
 * who never opens a relief view.
 *
 * So this fetches the deployed `index.html`, reads the set of scripts the document ACTUALLY loads eagerly, and
 * fails if any of them is a GL or relief chunk. It also fails if the fingerprint has not moved, because an
 * unchanged hash after a push means the deploy did not happen and the most dangerous outcome of a deploy is
 * believing it landed.
 *
 * Usage:
 *   node scripts/verify-live.mjs <url> [--expect-changed-from <hash>]
 */

import { readdirSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'https://lcx-sales-automation-engine.pages.dev';
const changedFromIdx = args.indexOf('--expect-changed-from');
const expectChangedFrom = changedFromIdx >= 0 ? args[changedFromIdx + 1] : null;

const fail = [];
const note = (s) => console.log('  ' + s);

const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) {
  console.error(`  REFUSED: ${url} returned ${res.status}. Nothing below can be checked.`);
  process.exit(1);
}
const html = await res.text();
note(`${url} → ${res.status}, ${html.length} bytes`);

/*
 * EAGER means what the DOCUMENT pulls in: a <script src> and any modulepreload the build emitted. A
 * dynamic import inside a chunk is not in here, which is exactly the distinction being tested — a lazy
 * chunk must be absent from this list and reachable on demand.
 */
const scriptSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
const eager = [...new Set([...scriptSrcs, ...preloads])];

note(`eager scripts: ${eager.length}`);
for (const s of eager) note(`  · ${s}`);

/* The fingerprint: whatever the entry chunk is called. A hash that has not moved after a push means the
   deploy did not land, and believing a deploy landed when it did not is the worst outcome available. */
const entry = eager.find((s) => /\/index-[A-Za-z0-9_-]+\.js$/.test(s)) ?? eager[0] ?? null;
const fingerprint = entry ? (entry.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? entry) : null;
note(`fingerprint: ${fingerprint ?? 'NONE FOUND'}`);

if (!entry) fail.push('no entry script found in the deployed document');

if (expectChangedFrom) {
  if (fingerprint === expectChangedFrom) {
    fail.push(`fingerprint is still ${fingerprint} — the deploy has NOT landed yet`);
  } else {
    note(`fingerprint moved: ${expectChangedFrom} → ${fingerprint}`);
  }
}

/*
 * THE LAZY GUARANTEE, CHECKED IN PRODUCTION. Any of these names in the EAGER set means the GL layer is being
 * shipped to every reader rather than to the ones who ask for it.
 */
const GL_MARKERS = /(Relief|Orrery|ReliefGl|OrreryGl|lcx-gl|env-|forge)/i;
const eagerGl = eager.filter((s) => GL_MARKERS.test(s));
if (eagerGl.length > 0) {
  fail.push(`GL/relief chunks are in the EAGER set: ${eagerGl.join(', ')} — every reader is downloading a `
    + 'renderer they did not ask for');
} else {
  note('no GL or relief chunk is loaded eagerly ✓');
}

/*
 * AND THE LAZY CHUNKS MUST STILL BE REACHABLE.
 *
 * Absent from the eager set is only half the claim: if the chunk 404s, the toggle refuses for every reader and
 * the flat view is all anyone ever sees — which would look like the feature working as designed, because
 * refusing to flat IS the designed behaviour.
 *
 * ── TWO WAYS THIS CHECK LIED, BOTH FOUND BY IT LYING ─────────────────────────────────
 *
 * 1. IT READ CHUNK NAMES FROM THE LOCAL BUILD. Cloudflare builds with its own toolchain, and its minifier
 *    names variables differently, so a chunk with byte-identical size gets a different content hash. Probing
 *    local names against production reported three of seven GL chunks missing when all seven were there. The
 *    names must come from the DEPLOYED bundle graph — index.html → entry → page chunk → GL chunk — because
 *    that is the same path the browser walks.
 *
 * 2. A 200 IS NOT PROOF OF ANYTHING. Pages serves index.html, status 200, for any asset it does not have; that
 *    is what makes an SPA's deep links work. Every one of those three "present" chunks answered 200. So a
 *    response only counts when it is JavaScript and is NOT the index document — checked by body, because
 *    content-type is set by the same rule that served the wrong body.
 *
 * Which page chunk HOSTS a GL import is a source-level fact and is read from the local build. The hashes never
 * are. With no local build the reachability stays UNKNOWN rather than passing.
 */
/* Assets resolve relative to wherever the entry chunk lives, not to the document. */
const base = new URL('.', new URL(entry ?? '/', url)).href;

/*
 * WHICH CHUNKS ARE "GL" IS DECIDED BY CONTENT, AND SO IS WHETHER ONE ARRIVED.
 *
 * Three ways an earlier version of this check was wrong, each found by it being wrong:
 *
 * 1. NAME MATCHING MISSED WHOLE CATEGORIES. `*ReliefGl` does not cover E8 THE FORGE, which ships as
 *    `ForgeBackdrop` on the sign-in route, nor the SHARED chunks the renderers import (`ao`, `lit`, `dof`,
 *    `volume`). A missing shared chunk breaks every toggle depending on it while the relief chunk itself loads
 *    fine, so name matching would call that healthy. A chunk carrying GLSL source is a GL chunk — a fact about
 *    the bytes, which keeps covering environments nobody has named yet. There are 15.
 *
 * 2. LOCAL HASHES ARE NOT LIVE HASHES *UNLESS THE BUILD INPUTS MATCH*. A plain `npm run build -w @lcx/web`
 *    disagreed with production on the entry chunk and on exactly three renderers — GlobeReliefGl,
 *    PipelineReliefGl, StormReliefGl — which reported them missing when all three were there.
 *
 *    The cause is not toolchain nondeterminism, which is what it looks like and what I first wrote down. It is
 *    `VITE_API_URL`: Pages bakes the production API origin into every chunk that calls the API, and those three
 *    renderers fetch data while the other four do not. Rebuilding with the desktop app's own command —
 *    `VITE_API_URL=https://lcx-sales-api.onrender.com npm run build -w @lcx/web` — reproduces the deployed
 *    hashes EXACTLY, all 15 of 15, entry chunk included.
 *
 *    That is worth stating precisely, because the wrong reason would retire a usable tool: hash comparison
 *    against production is valid, as long as the build inputs are the deployed ones. This check still reads
 *    names from the DEPLOYED graph rather than relying on that, so it cannot be broken by an env var nobody
 *    remembered to set.
 *
 * 3. A 200 PROVES NOTHING. Pages answers 200 with index.html for any absent asset — that is what makes SPA
 *    deep links work. Measured on this site: a bogus chunk name returns 200, 1755 bytes, text/html.
 *
 * And one trap in the fix itself: `\bpin-HASH\.js` matches inside `map-pin-HASH.js`, which reported a present
 * chunk as absent. So every reference is anchored on `assets/`, and a candidate only COUNTS as the GL chunk it
 * claims to be if its body carries shader source. That last rule is what makes the `index` base tractable —
 * the app shell and the GL engine's own index chunk share it, and only one of them has shaders in it.
 */
const SHADER_MARKER = /precision\s+(?:highp|mediump|lowp)|createStage/;
const baseOfName = (f) => f.replace(/-[A-Za-z0-9_-]+\.js$/, '');
/** Anchored on `assets/` so a base name cannot match the tail of a longer one. */
const liveNamesFor = (body, wantBase) => {
  const esc = wantBase.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&');
  return [...body.matchAll(new RegExp(`assets/(${esc}-[A-Za-z0-9_-]{6,}\\.js)`, 'g'))].map((m) => m[1]);
};

/** Local build, read for STRUCTURE only — which chunk bases carry shaders, and which pages name them. */
function localGraph() {
  try {
    const dir = new URL('../apps/web/dist/assets/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
    const bodies = new Map(files.map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]));
    const glFiles = files.filter((f) => SHADER_MARKER.test(bodies.get(f)));
    const glBases = new Set(glFiles.map(baseOfName));
    /* A page hosts GL if it names a GL chunk FILE (exact name, no base guessing) and is not one itself. */
    const hostBases = new Set();
    for (const [f, body] of bodies) {
      if (glBases.has(baseOfName(f))) continue;
      if (glFiles.some((g) => body.includes(g))) hostBases.add(baseOfName(f));
    }
    return { glBases, hostBases };
  } catch {
    return null;
  }
}

const local = localGraph();
if (!local || local.glBases.size === 0) {
  note('lazy chunk reachability: UNKNOWN (no local build to name the GL chunks — run `npm run build -w @lcx/web`)');
} else {
  note(`local build: ${local.glBases.size} chunks carry shader source, named by ${local.hostBases.size} page chunks`);

  const fetched = new Map();
  const get = async (name) => {
    if (fetched.has(name)) return fetched.get(name);
    const r = await fetch(new URL(name, base).href);
    const body = r.ok ? await r.text() : '';
    const isIndexDoc = body === html || /^\s*<(!doctype|html)/i.test(body);
    const got = { status: r.status, ok: r.ok, body, isIndexDoc, isGl: !isIndexDoc && SHADER_MARKER.test(body) };
    fetched.set(name, got);
    return got;
  };

  /* The corpus of reachable bodies, starting at the document's own entry and growing as chunks resolve. */
  const entryName = entry ? entry.split('/').pop() : null;
  const corpus = [];
  if (entryName) corpus.push((await get(entryName)).body);

  /* Page chunks that name a renderer. Several renderers are named only from their own route's chunk, never
     from the entry, so the corpus has to include them before any renderer can be resolved. */
  let unresolvedHosts = 0;
  for (const hostBase of local.hostBases) {
    const names = corpus.flatMap((b) => liveNamesFor(b, hostBase));
    if (names.length === 0) { unresolvedHosts++; continue; }
    for (const n of new Set(names)) {
      const got = await get(n);
      if (got.ok && !got.isIndexDoc) corpus.push(got.body);
      else fail.push(`page chunk ${n} is absent (${got.status}${got.isIndexDoc ? ', index doc' : ''}) — the `
        + 'toggles it hosts would refuse');
    }
  }
  if (unresolvedHosts > 0) {
    note(`${unresolvedHosts} of ${local.hostBases.size} GL-hosting page chunks are not named by anything already `
      + 'reached (split behind a route the entry does not preload); their GL chunks still count below');
  }

  /*
   * Resolve GL chunks to a FIXPOINT. `ao`, `lit`, `dof` and `volume` are named only from inside a renderer, so
   * each round can expose the next layer. Stops when a round resolves nothing new.
   */
  const reached = new Set();
  const probed = [];
  for (let round = 1; round <= 6; round++) {
    let progress = false;
    for (const glBase of local.glBases) {
      if (reached.has(glBase)) continue;
      const candidates = new Set(corpus.flatMap((b) => liveNamesFor(b, glBase)));
      for (const name of candidates) {
        const got = await get(name);
        if (!got.ok) {
          fail.push(`GL chunk ${name} is not reachable (${got.status}) — the toggle that needs it refuses`);
          continue;
        }
        if (got.isIndexDoc) {
          fail.push(`GL chunk ${name} answered 200 with the INDEX DOCUMENT, so the asset is absent and Pages `
            + 'served the SPA fallback. The toggle refuses to flat, indistinguishable from the feature working '
            + 'as designed — the reason this check exists.');
          continue;
        }
        /* CONTENT decides. The app shell and the engine's index chunk share the base `index`; only the one
           with shaders in it satisfies the claim, and the shell being reachable proves nothing about GL. */
        if (!got.isGl) continue;
        if (!reached.has(glBase)) {
          reached.add(glBase);
          probed.push(`${name} → ${got.status} ${got.body.length}B  [shaders ✓]`);
          progress = true;
        }
        corpus.push(got.body);
      }
    }
    if (!progress) break;
  }

  note(`GL chunks confirmed on the DEPLOYED graph: ${probed.length} of ${local.glBases.size}`);
  for (const pr of probed) note(`  · ${pr}`);

  const unreached = [...local.glBases].filter((b) => !reached.has(b));
  if (unreached.length > 0) {
    fail.push(`${unreached.length} GL chunk(s) in the local build could not be confirmed on the deployed site: `
      + `${unreached.join(', ')}. Either the deploy is older than this build, or nothing a reader can load `
      + 'names them.');
  } else {
    note(`every one of the ${local.glBases.size} GL chunks is reachable AND carries its shaders ✓`);
  }
}

console.log('');
if (fail.length === 0) {
  console.log('  LIVE CHECK PASSED');
  process.exit(0);
}
for (const f of fail) console.error(`  ✗ ${f}`);
process.exit(1);
