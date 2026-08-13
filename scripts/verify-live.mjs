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
 * AND THE LAZY CHUNKS MUST STILL BE REACHABLE. Absent from the eager set is only half the claim: if the chunk
 * 404s, the toggle refuses for every reader and the flat view is all anyone ever sees — which would look like
 * the feature working as designed, because refusing to flat IS the designed behaviour.
 */
const base = new URL('.', new URL(entry ?? '/', url)).href;
const manifestUrl = new URL('.vite/manifest.json', new URL('/', url)).href;
let reachable = null;
try {
  const m = await fetch(manifestUrl);
  if (m.ok) {
    const manifest = await m.json();
    const names = Object.values(manifest).map((v) => v.file).filter((f) => GL_MARKERS.test(String(f)));
    reachable = [];
    for (const f of names.slice(0, 6)) {
      const r = await fetch(new URL(f, new URL('/', url)).href, { method: 'GET' });
      reachable.push(`${f} → ${r.status}`);
      if (!r.ok) fail.push(`lazy chunk ${f} is not reachable (${r.status}) — every toggle would refuse`);
    }
  }
} catch {
  /* A missing manifest is not a failure: Vite only emits it when asked, and production builds often do not.
     Reported as unknown rather than as a pass, because a silent skip is how a check stops checking. */
}
note(reachable && reachable.length
  ? `lazy GL chunks probed: ${reachable.join(', ')}`
  : 'lazy chunk reachability: UNKNOWN (no asset manifest served — probe a toggle by hand)');
void base;

console.log('');
if (fail.length === 0) {
  console.log('  LIVE CHECK PASSED');
  process.exit(0);
}
for (const f of fail) console.error(`  ✗ ${f}`);
process.exit(1);
