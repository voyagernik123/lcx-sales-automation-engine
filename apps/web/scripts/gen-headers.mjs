#!/usr/bin/env node
/**
 * SECURITY HEADERS FOR THE WEB SURFACE — written AFTER `vite build`, from the bytes it produced.
 *
 * AUDIT_PENTEST finding 4 (MEDIUM, open since 2026-08-07): no Content-Security-Policy on web
 * prod. Cloudflare Pages reads `dist/_headers`; this script writes it. It is generated rather than
 * committed under `public/` because the policy carries the SHA-256 of every inline `<script>` in
 * the built `index.html` (the two pre-hydration theme scripts), and a hash typed by hand drifts
 * from the bytes the day someone edits the script — at which point the policy silently blocks the
 * anti-flash logic and dark-mode operators get the white flash back. Reading the built file makes
 * the hash follow the code.
 *
 * WHAT THE POLICY ALLOWS, AND WHY EACH ENTRY EXISTS
 *   default-src 'self'                 everything not named below comes from this origin only
 *   script-src  'self' + hashes        the bundle, and exactly the inline scripts index.html ships
 *   style-src   'self' 'unsafe-inline' Tailwind ships as files; the `<body style>` attribute in
 *                                      index.html and React's CSSOM writes need the inline allowance
 *                                      (CSSOM property writes are not blocked by CSP; the markup
 *                                      attribute on <body> is — so 'unsafe-inline' stays for styles)
 *   img-src     'self' data: blob:     inline SVG data URIs and canvas-derived images
 *   font-src    'self'                 the self-hosted Inter and JetBrains Mono files
 *   connect-src 'self' + API origin    fetch and EventSource to the API (NotificationBell's stream)
 *   worker-src  'self' blob:           none today; harmless if a bundler emits one
 *   object-src  'none' · base-uri 'self' · form-action 'self' · frame-ancestors 'none'
 *
 * The API origin is `VITE_API_URL` when the build set it (production does), else the same
 * hardcoded fallback `lib/apiClient.ts` compiles in — read from that file so the two cannot drift.
 *
 * NEVER IN CI AS A GATE BY ITSELF: `scripts/verify-headers.mjs` serves `dist/` with these headers
 * and drives the built app in a browser, asserting zero CSP violations — the check that the policy
 * is not stricter than the app. Run it before shipping a policy change.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(WEB, 'dist');
const indexPath = join(DIST, 'index.html');
if (!existsSync(indexPath)) {
  console.error('gen-headers: dist/index.html is missing — run `vite build` first');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const hashes = inline.map((body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);

function apiOrigin() {
  const fromEnv = process.env.VITE_API_URL?.trim();
  if (fromEnv) return new URL(fromEnv).origin;
  const client = readFileSync(join(WEB, 'src/lib/apiClient.ts'), 'utf8');
  const m = /PROD_API_FALLBACK = '([^']+)'/.exec(client);
  if (!m) throw new Error('gen-headers: PROD_API_FALLBACK not found in lib/apiClient.ts');
  return new URL(m[1]).origin;
}
const api = apiOrigin();

const csp = [
  `default-src 'self'`,
  // Cloudflare Pages injects its Web Analytics beacon at the edge (static.cloudflareinsights.com); it is not in dist, so the local
  // verifier never sees it, and production logged a CSP violation on every page (2026-09-04). Allowed by origin, explicitly.
  `script-src 'self' https://static.cloudflareinsights.com ${hashes.join(' ')}`.trim(),
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  `connect-src 'self' ${api}`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
`;
writeFileSync(join(DIST, '_headers'), headers);
console.log(`gen-headers: dist/_headers written — ${inline.length} inline script hash(es), connect-src ${api}`);
