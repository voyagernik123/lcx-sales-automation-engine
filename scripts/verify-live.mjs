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
 * Three claims, all proven against the deployed host:
 *   1. NOT EAGER    — nothing the document loads up front carries shader source (by bytes, not by filename).
 *   2. IT MOVED     — the entry fingerprint changed, so the deploy actually landed.
 *   3. STILL THERE  — every lazy chunk the deployed bundle graph names is fetchable and is real JavaScript.
 *
 * Exit codes are three, not two, because "I could not tell" must not be able to masquerade as either answer:
 *   0 = all three claims hold.  1 = the deploy is bad.  2 = INCONCLUSIVE (transport, or an unreadable graph).
 *
 * Usage:
 *   node scripts/verify-live.mjs <url> [--expect-changed-from <hash>] [--expect-gl-chunks <n>]
 */

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'https://lcx-sales-automation-engine.pages.dev';
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const expectChangedFrom = flag('--expect-changed-from');
const expectGlChunks = flag('--expect-gl-chunks') ? Number(flag('--expect-gl-chunks')) : null;

const fail = [];
/* INCONCLUSIVE is a third outcome, kept strictly separate from `fail`. A dropped TCP connection is not
   evidence about a deploy, and reporting it as one would train everybody to ignore this script's red. */
const inconclusive = [];
const note = (s) => console.log('  ' + s);

/*
 * ONE FETCH PATH FOR EVERYTHING, WITH RETRIES, BECAUSE OF RULE 5: A NETWORK HICCUP IS NOT A BAD DEPLOY.
 *
 * Retried: a thrown fetch (DNS, reset, timeout), 429, and any 5xx — none of those is a statement about
 * whether the asset exists. NOT retried: 404, and 200-with-the-index-document. Those two ARE the verdict, and
 * on Cloudflare Pages the asset upload completes before the new index is served, so there is no window where
 * a genuinely-deployed chunk answers 404 to the very entry document that names it.
 */
async function http(href, attempts = 3) {
  let lastReason = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(href, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
      if (r.status === 429 || r.status >= 500) {
        lastReason = `HTTP ${r.status}`;
        if (i < attempts) { await new Promise((s) => setTimeout(s, 400 * i)); continue; }
        return { transport: lastReason };
      }
      const body = await r.text();
      return { status: r.status, ok: r.ok, ct: r.headers.get('content-type') ?? '', body };
    } catch (e) {
      lastReason = e?.name === 'TimeoutError' ? 'timed out after 15s' : (e?.message ?? String(e));
      if (i < attempts) await new Promise((s) => setTimeout(s, 400 * i));
    }
  }
  return { transport: lastReason };
}

const doc = await http(url);
if (doc.transport) {
  console.error(`  INCONCLUSIVE: could not reach ${url} (${doc.transport}). This says nothing about the deploy.`);
  process.exit(2);
}
if (!doc.ok) {
  console.error(`  REFUSED: ${url} returned ${doc.status}. Nothing below can be checked.`);
  process.exit(1);
}
const html = doc.body;
note(`${url} → ${doc.status}, ${html.length} bytes`);

/*
 * EAGER means what the DOCUMENT pulls in: a <script src> and any modulepreload the build emitted. A
 * dynamic import inside a chunk is not in here, which is exactly the distinction being tested — a lazy
 * chunk must be absent from this list and reachable on demand.
 */
const scriptSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
const eager = [...new Set([...scriptSrcs, ...preloads])].filter((s) => !/^https?:/i.test(s));

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
 * WHAT COUNTS AS A GL CHUNK IS DECIDED BY BYTES, NOT BY FILENAME.
 *
 * Name matching missed whole categories: `*ReliefGl` does not cover E8 THE FORGE, which ships as
 * `ForgeBackdrop` on the sign-in route, nor the SHARED chunks the renderers import (`ao`, `lit`, `dof`,
 * `volume`, `lines`, `pipeline`, and the engine's own `index`). A missing shared chunk breaks every toggle
 * depending on it while the relief chunk itself loads fine, so name matching would call that healthy. A chunk
 * carrying GLSL source is a GL chunk — a fact about the bytes, which keeps covering environments nobody has
 * named yet. Measured on the deployed graph today: 15, of which 8 are renderer surfaces and 7 are shared.
 */
const SHADER_MARKER = /precision\s+(?:highp|mediump|lowp)|createStage/;
/* Kept for one job only: labelling a chunk that FAILED to load, whose bytes therefore cannot be inspected. */
const GL_MARKERS = /(Relief|Orrery|ReliefGl|OrreryGl|lcx-gl|env-|forge)/i;

/* Assets resolve relative to wherever the entry chunk lives, not to the document. */
const base = entry ? new URL('.', new URL(entry, url)).href : new URL('/assets/', url).href;

/*
 * ── HOW A RESPONSE IS JUDGED: THE PAGES 200-INDEX-DOC TRAP ───────────────────────────
 *
 * A 200 is not proof of anything. Pages serves index.html, status 200, for any asset it does not have — that
 * is what makes an SPA's deep links work. Measured on this site right now: GET
 * /assets/GlobeReliefGl-ZZZZZZZZ.js → 200, 1755 bytes, text/html. So a 404 arrives dressed as a success.
 *
 * And note what a body-LENGTH threshold would do with those numbers. The index document is 1755 B; the
 * smallest real GL chunk on the deployed graph is `lines` at 1801 B. Forty-six bytes apart. Length cannot
 * separate them in either direction, which is why the test is: not HTML, content-type is JavaScript, and for a
 * GL chunk, shader source is present in the body. Length is asserted too — the task asks for it and a
 * truncated upload is a real failure mode — but at 512 B it is a floor against emptiness, not the real test.
 */
const MIN_GL_BODY = 512;
const looksHtml = (b) => /^\s*<(?:!doctype|html)/i.test(b.trimStart().slice(0, 64));
const jsContentType = (ct) => /javascript|ecmascript|text\/plain/i.test(ct);

/*
 * ── HOW THE CHUNK LIST IS RECOVERED: THE DEPLOYED ENTRY CHUNK, TRANSITIVELY ──────────
 *
 * There is no manifest. `.vite/manifest.json` is not served in production, and a check that degraded to
 * UNKNOWN whenever it was absent was UNKNOWN on every real run — i.e. it never once checked the interesting
 * case. Nor are the names read from `apps/web/dist` any more. Both dead ends have a measurement behind them:
 *
 *  · LOCAL NAMES ARE NOT LIVE NAMES. Probing the local hash `KpiDashboard-Cf1tm0p5.js` against production
 *    returns 200 — with the index document. Pages bakes `VITE_API_URL` into every chunk that calls the API, so
 *    a plain `npm run build -w @lcx/web` disagrees with production on the entry chunk and on the renderers
 *    that fetch data (GlobeReliefGl, PipelineReliefGl, StormReliefGl). Rebuilding with
 *    `VITE_API_URL=https://lcx-sales-api.onrender.com` reproduces the deployed hashes exactly, all 15 of 15 —
 *    so hash comparison IS valid when the build inputs are the deployed ones. It is simply not needed: the
 *    deployed bundle names its own chunks, and a check that reads them from there cannot be broken by an env
 *    var nobody remembered to set, or by having no `dist` at all.
 *
 * WHAT THE DEPLOYED ENTRY ACTUALLY CONTAINS — established by fetching it and looking, not by assuming:
 *   · 447,192 B of `application/javascript`, and a Vite preload helper whose dependency table is a plain
 *     array of quoted filenames: `__vite__mapDeps=(i,m=...,d=(m.f||(m.f=["assets/terminal-K4Yhy1Qu.js",…`
 *     — 177 distinct chunk names in the entry alone.
 *   · alongside inline `import("./terminal-K4Yhy1Qu.js")` call sites and static `from"./ao-MxNi4gtc.js"`.
 * All three forms are matched below. Measured attribution of the 195 names the walk resolves: 194 first seen in
 * a mapDeps table, and 1 via a static `from` — that one being the entry chunk itself, which the renderers
 * import back for shared app code. So mapDeps is doing effectively all of the work today; the other two
 * patterns are kept because a build without the preload helper emits only `import("./…")`, and dropping them
 * would make this check silently unable to walk that build rather than loudly unable.
 *
 * The walk has to be transitive, and this is the part a one-level read would get wrong: the entry names
 * `ForgeBackdrop` (the sign-in backdrop) and that chunk in turn names all seven shared GL chunks, while the
 * seven relief renderers are named only from their own route chunk — StormReliefGl from MarketingCrisis,
 * GlobeReliefGl from MarketMap, SurfaceReliefGl and DeckReliefGl from CommandDeck, and so on. Stopping at the
 * entry would find 1 of 15 GL chunks and call the other 14 unknown.
 *
 * Matching only real module-reference syntax — a quoted `"assets/…js"`, `import("./…js")`, `from"./…js"` —
 * rather than any string that happens to look like a filename, so an arbitrary string literal in application
 * code cannot invent a chunk that then "fails" to load.
 */
const REF_PATTERNS = [
  /"assets\/([A-Za-z0-9][A-Za-z0-9_./-]*\.js)"/g,
  /import\(\s*"\.\/([A-Za-z0-9][A-Za-z0-9_./-]*\.js)"\s*\)/g,
  /(?:from|import)\s*"\.\/([A-Za-z0-9][A-Za-z0-9_./-]*\.js)"/g,
];
const referencesIn = (body) => {
  const out = new Set();
  for (const re of REF_PATTERNS) for (const m of body.matchAll(re)) out.add(m[1]);
  return out;
};

/** Fetch a chunk and judge it. Never throws; a transport failure is reported as such, not as an absence. */
async function probeChunk(rel) {
  const r = await http(new URL(rel, base).href);
  if (r.transport) return { transport: r.transport };
  const isIndexDoc = looksHtml(r.body) || r.body === html;
  return {
    status: r.status,
    ok: r.ok,
    ct: r.ct,
    len: r.body.length,
    isIndexDoc,
    isGl: r.ok && !isIndexDoc && SHADER_MARKER.test(r.body),
    usable: r.ok && !isIndexDoc && jsContentType(r.ct),
    body: r.body,
  };
}

/** Breadth-first over the deployed graph, a level at a time, `limit` requests in flight. */
async function walkFrom(startRel, limit = 8) {
  const seen = new Map();
  const namedBy = new Map();
  const known = new Set([startRel]);
  let frontier = [startRel];
  let requests = 0;
  while (frontier.length > 0) {
    const nextLevel = [];
    const it = frontier[Symbol.iterator]();
    const worker = async () => {
      for (let n = it.next(); !n.done; n = it.next()) {
        const rel = n.value;
        const got = await probeChunk(rel);
        requests++;
        if (got.usable) {
          for (const child of referencesIn(got.body)) {
            if (!namedBy.has(child)) namedBy.set(child, rel);
            if (!known.has(child)) { known.add(child); nextLevel.push(child); }
          }
        }
        delete got.body; /* 195 chunk bodies is ~5 MB; the references are already extracted. */
        seen.set(rel, got);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, frontier.length) }, worker));
    frontier = nextLevel;
  }
  return { seen, namedBy, requests };
}

if (entry) {
  const entryRel = entry.split('/').pop();
  const t0 = Date.now();
  const { seen, namedBy, requests } = await walkFrom(entryRel);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const reached = [...seen].filter(([, v]) => v.usable);
  const glChunks = [...seen].filter(([, v]) => v.isGl);
  const stalled = [...seen].filter(([, v]) => v.transport);
  const broken = [...seen].filter(([, v]) => !v.transport && !v.usable);

  note(`deployed graph: ${requests} chunks fetched in ${secs}s, ${reached.length} served real JavaScript`);

  /*
   * CLAIM 1, IN ITS STRONG FORM. The eager check above is a filename test, and a filename test cannot see the
   * failure it most needs to: if a build change merged the env layer INTO the entry chunk, the eager set would
   * still read `index-<hash>.js` and `GL_MARKERS` would not match it, so the old check printed "no GL chunk is
   * loaded eagerly ✓" over 35.7 KB of renderer. Every eager script is in `seen` now, so ask its bytes.
   */
  const eagerGlByName = eager.filter((s) => GL_MARKERS.test(s));
  const eagerGlByBytes = eager.map((s) => s.split('/').pop()).filter((n) => seen.get(n)?.isGl);
  const eagerUnjudged = eager.map((s) => s.split('/').pop()).filter((n) => !seen.has(n) || seen.get(n).transport);
  if (eagerGlByName.length > 0 || eagerGlByBytes.length > 0) {
    fail.push('GL/relief code is in the EAGER set: '
      + `${[...new Set([...eagerGlByName, ...eagerGlByBytes])].join(', ')} — every reader is downloading a `
      + 'renderer they did not ask for');
  } else if (eagerUnjudged.length > 0) {
    inconclusive.push(`could not read the bytes of ${eagerUnjudged.join(', ')}, so "no shader source is `
      + 'loaded eagerly" is unproven for the whole eager set');
  } else {
    note(`no shader source in any of the ${eager.length} eager scripts, by name AND by bytes ✓`);
  }

  /* CLAIM 3. Anything the deployed bundle names must be fetchable. A chunk that answers with the index
     document is ABSENT — and if it is a GL chunk, every toggle that needs it refuses to flat, which is
     indistinguishable from the feature working as designed. That is the whole reason this check exists. */
  for (const [rel, v] of broken) {
    const parent = namedBy.get(rel) ?? 'the deployed document';
    const how = v.isIndexDoc
      ? `answered ${v.status} with the INDEX DOCUMENT (${v.len} B of HTML), so the asset is absent and Pages `
        + 'served the SPA fallback'
      : v.ok
        ? `answered ${v.status} with content-type "${v.ct}" (${v.len} B), which is not JavaScript`
        : `is not reachable (${v.status})`;
    const stakes = GL_MARKERS.test(rel)
      ? ' — the toggle that needs it refuses to flat, which looks exactly like the feature working'
      : ' — the route that needs it cannot load';
    fail.push(`chunk ${rel}, named by ${parent}, ${how}${stakes}`);
  }

  for (const [rel, v] of stalled) {
    inconclusive.push(`${rel} (named by ${namedBy.get(rel) ?? 'the document'}) never answered: ${v.transport}`);
  }

  const undersized = glChunks.filter(([, v]) => v.len < MIN_GL_BODY);
  for (const [rel, v] of undersized) {
    fail.push(`GL chunk ${rel} is only ${v.len} B — under the ${MIN_GL_BODY} B floor, so it is truncated or a `
      + `stub (the smallest real one measured is 1801 B)`);
  }

  const surfaces = glChunks.filter(([rel]) => /Relief|Orrery|Forge/i.test(rel));
  note(`GL chunks reachable on the DEPLOYED graph: ${glChunks.length} `
    + `(${surfaces.length} renderer surfaces + ${glChunks.length - surfaces.length} shared)`);
  for (const [rel, v] of glChunks) note(`  · ${rel} → ${v.status} ${v.len}B ${v.ct} [shaders ✓]`);

  /*
   * A FLOOR, BECAUSE OTHERWISE CLAIM 3 PASSES VACUOUSLY. "Every GL chunk the graph names is reachable" is
   * trivially true of a graph that names none, and this repo has been bitten by exactly that shape of
   * assertion — a loop over an empty collection reporting success. Zero is a failure, not a pass. Pass
   * `--expect-gl-chunks 15` to pin the count when the caller knows what shipped.
   */
  if (stalled.length > 0) {
    /* THE COUNT IS NOT A VERDICT WHEN THE WALK DID NOT FINISH. Measured with a host that accepted the
       connection and never answered for the one GL chunk: this block fired the zero-GL failure below and
       exited 1 with "the GL layer is not deployed at all" — a false accusation built out of a dropped
       connection, which is exactly what must never happen. A chunk that never answered is not a chunk that is
       absent, so an incomplete walk can only be INCONCLUSIVE, and those entries are already recorded above. */
    note(`GL count is unproven: ${stalled.length} chunk(s) never answered, so neither the floor nor `
      + '--expect-gl-chunks can be judged');
  } else if (glChunks.length === 0) {
    fail.push('NOT ONE reachable chunk carries shader source. Either the GL layer is not deployed at all — in '
      + 'which case every relief toggle refuses — or SHADER_MARKER no longer matches what the compiler emits, '
      + 'in which case this check has been passing vacuously. Both need a human.');
  } else if (expectGlChunks !== null && glChunks.length !== expectGlChunks) {
    fail.push(`expected ${expectGlChunks} GL chunks, found ${glChunks.length} on the deployed graph`);
  } else if (fail.length === 0 && stalled.length === 0) {
    /* Gated on the WHOLE ledger, not just on `broken`. Both negative runs of the undersized case printed this
       ✓ line directly above their own ✗ — because the condition here was `broken.length === 0`, which knows
       nothing about a truncated chunk, an eager renderer or a fingerprint that never moved. A summary tick that
       can appear over a failure is worse than no summary, since the log gets skimmed and the tick is what
       people read. */
    note(`every chunk the deployed bundle names is fetchable, and all ${glChunks.length} GL chunks carry their `
      + 'shaders ✓');
  }
} else {
  /*
   * THE UNKNOWN PATH SURVIVES, BUT ONLY FOR SOMETHING GENUINELY UNKNOWABLE. It is no longer reachable by a
   * missing manifest or a missing local build — neither is consulted. If a future Vite emits its dependency
   * table in a form none of REF_PATTERNS matches, the walk finds no children and this is where that lands:
   * loudly, at exit 2, naming the fix (add the pattern), because the deployed entry chunk is the only source
   * of truth for deployed chunk names and local `dist` names are known to resolve to the SPA fallback.
   */
  inconclusive.push('no entry chunk to walk from, so lazy-chunk reachability is UNKNOWN');
}

console.log('');
if (fail.length > 0) {
  for (const f of fail) console.error(`  ✗ ${f}`);
  if (inconclusive.length > 0) for (const i of inconclusive) console.error(`  ? ${i}`);
  console.error('  LIVE CHECK FAILED');
  process.exit(1);
}
if (inconclusive.length > 0) {
  for (const i of inconclusive) console.error(`  ? ${i}`);
  console.error('  LIVE CHECK INCONCLUSIVE — this is NOT a verdict on the deploy. Re-run.');
  process.exit(2);
}
console.log('  LIVE CHECK PASSED');
process.exit(0);
