/**
 * THE STORED NAVIGATION.
 *
 * `notify` accepted `href` as `z.string().max(300).optional()` — length-bounded and
 * nothing else — and `execute` passes it straight to `notify()`, which writes it to
 * `notifications.href`. So a `javascript:` value was not a bad request that bounced;
 * it was a row. Every later reader of the readout got it, including the LCXOS webview,
 * where a `javascript:` navigation runs in the app origin beside the Tauri commands.
 *
 * These assertions are about the SCHEMA, not about a renderer, because that is where
 * the asymmetry is: one write path, many read paths. A renderer fixed today is a
 * renderer someone adds tomorrow.
 *
 * The last case in this file is the generalisation: ANY param in the registry whose
 * name looks like a URL must refuse `javascript:`. That is what stops the next
 * `attachmentUrl` from shipping with a `.max()` and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ACTION_REGISTRY, isNavigableHref } from '../registry.js';
import { buildActionManifest, canonicalJson } from '../manifest.js';

/** Parse `params` against an action's declared schema. */
function parse(actionId: string, params: Record<string, unknown>) {
  const action = ACTION_REGISTRY[actionId];
  expect(action, `${actionId} is not in the registry`).toBeDefined();
  return action!.paramsSchema.safeParse(params);
}

/**
 * The payloads a webview actually executes. Each is a real bypass of a naive
 * `startsWith('javascript:')` test, which is why the check refuses the CHARACTER
 * rather than trying to strip it the way a URL parser would.
 */
const DANGEROUS = [
  ['bare javascript:', 'javascript:alert(1)'],
  ['uppercased scheme', 'JavaScript:alert(1)'],
  // Leading C0 controls and spaces are removed by the URL parser BEFORE the scheme
  // is read, so all three of these navigate as `javascript:`.
  ['leading NUL', '\u0000javascript:alert(1)'],
  ['leading newline', '\njavascript:alert(1)'],
  ['leading space', '  javascript:alert(1)'],
  // Embedded control characters inside the scheme itself — same removal, same result.
  ['tab inside the scheme', 'java\tscript:alert(1)'],
  ['newline inside the scheme', 'java\nscript:alert(1)'],
  ['CR inside the scheme', 'java\rscript:alert(1)'],
  ['data: html', 'data:text/html,<script>alert(1)</script>'],
  ['vbscript:', 'vbscript:msgbox(1)'],
  ['blob:', 'blob:https://app.lcx.com/1234'],
  ['file:', 'file:///etc/passwd'],
  ['tauri ipc scheme', 'tauri://localhost/x'],
  // Not script execution, but not a site-relative path either: a protocol-relative
  // href is somebody else's origin wearing what looks like a local path.
  ['protocol-relative', '//evil.example/x'],
] as const;

/** What the desk actually stores today — every one of these must keep working. */
const LEGITIMATE = [
  '/deal-board',
  '/outreach',
  '/bd-pipeline/9f1c2f5a-0000-4000-8000-000000000001',
  '/monitors?window=24',
  '/',
  'https://apps.apple.com/app/id123',
  'http://localhost:5173/ops',
  'https://github.com/voyagernik123/lcx-terminal-releases/releases/latest',
];

describe('notify.href refuses a scheme it cannot navigate', () => {
  it.each(DANGEROUS)('refuses %s', (_label, href) => {
    const r = parse('notify', { title: 'x', href });
    expect(r.success, `${JSON.stringify(href)} was accepted and would have been STORED`).toBe(false);
  });

  it.each(DANGEROUS)('the refusal for %s cites its rule', (_label, href) => {
    const r = parse('notify', { title: 'x', href });
    expect(r.success).toBe(false);
    if (r.success) return;
    const message = r.error.issues.map((i) => i.message).join('; ');
    // A refusal that does not say what is allowed makes the caller guess, and a
    // guessing caller retries with another scheme.
    expect(message).toMatch(/site-relative path/);
    expect(message).toMatch(/http\(s\)/);
    // And it names the field, so the param prompt can point at it.
    expect(r.error.issues.some((i) => i.path.join('.') === 'href')).toBe(true);
  });

  it.each(LEGITIMATE)('still accepts %s', (href) => {
    const r = parse('notify', { title: 'x', href });
    expect(r.success, `${href} is a real desk href and must not be refused`).toBe(true);
  });

  it('an absent href is still absent, not a validation error', () => {
    // `optional()` must survive the refinement: most notifications carry no href,
    // and turning "no href" into a refusal would break every rule that omits it.
    expect(parse('notify', { title: 'x' }).success).toBe(true);
  });

  it('an empty href is refused rather than stored as a dead anchor', () => {
    expect(parse('notify', { title: 'x', href: '' }).success).toBe(false);
  });

  it('the length bound is still enforced alongside the scheme check', () => {
    expect(parse('notify', { title: 'x', href: `/${'a'.repeat(400)}` }).success).toBe(false);
  });
});

describe('dist_listing_set_status.url gets the same rule', () => {
  // The second URL-shaped param in the registry — found by grepping the file, not by
  // being reported. It is NOT a live sink: nothing in apps/web/src renders
  // `dist_listings.url` as an anchor today (the distribution panels read status and
  // surface only). It is a stored value one JSX line away from being one, so it is
  // held to the same rule before that line gets written.
  it.each(DANGEROUS)('refuses %s', (_label, url) => {
    const r = parse('dist_listing_set_status', { status: 'live', url });
    expect(r.success, `${JSON.stringify(url)} was accepted and would have been STORED`).toBe(false);
  });

  it('still accepts a real listing URL', () => {
    expect(parse('dist_listing_set_status', { status: 'live', url: 'https://apps.apple.com/app/id1' }).success).toBe(true);
  });

  it('still accepts the status alone', () => {
    expect(parse('dist_listing_set_status', { status: 'live' }).success).toBe(true);
  });
});

describe('isNavigableHref, directly', () => {
  it('accepts a site-relative path and an http(s) origin', () => {
    expect(isNavigableHref('/x')).toBe(true);
    expect(isNavigableHref('https://a.example/x')).toBe(true);
    expect(isNavigableHref('http://a.example')).toBe(true);
  });

  it('refuses a scheme-less bare domain rather than guessing one', () => {
    // safeHref on the web side upgrades `example.com` to `https://example.com`,
    // because there it is repairing a value that already exists. Here the value is
    // being CREATED, so guessing a scheme on the caller's behalf would launder an
    // inference into a stored certainty. It refuses and says what to send.
    expect(isNavigableHref('example.com/path')).toBe(false);
  });

  it('refuses a backslash where a host should be', () => {
    expect(isNavigableHref('https:/\\evil.example')).toBe(false);
    expect(isNavigableHref('https://\\evil.example')).toBe(false);
  });
});

describe('the ratchet: no URL-shaped param may be scheme-unchecked', () => {
  /**
   * The generalisation. `notify.href` and `dist_listing_set_status.url` are the two
   * that exist today; this is what fails when the third is added with a `.max()` and
   * nothing else.
   *
   * Driven off `z.toJSONSchema` rather than off the source text, so it sees the
   * schema the server actually enforces — including params added by the GPS and
   * marketing registries, which are merged in at import time.
   */
  const URL_SHAPED = /href|url|uri|link|src/;

  const sinks: Array<[string, string]> = [];
  for (const [id, action] of Object.entries(ACTION_REGISTRY)) {
    const schema = z.toJSONSchema(action.paramsSchema) as {
      properties?: Record<string, { type?: string }>;
    };
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      if (prop?.type === 'string' && URL_SHAPED.test(key.toLowerCase())) sinks.push([id, key]);
    }
  }

  it('found the URL-shaped params it is supposed to be guarding', () => {
    // If this drops to zero the suite below becomes vacuous — it would pass by
    // having nothing to check. Pinned to the two that exist so a rename is loud.
    expect(sinks.sort()).toEqual([
      ['dist_listing_set_status', 'url'],
      ['notify', 'href'],
    ]);
  });

  it.each(sinks)('%s.%s refuses javascript:', (id, key) => {
    const action = ACTION_REGISTRY[id]!;
    // Fill every OTHER required field with something valid so the only reason this
    // can fail is the URL param itself.
    const schema = z.toJSONSchema(action.paramsSchema) as {
      properties?: Record<string, { type?: string; enum?: unknown[] }>;
      required?: string[];
    };
    const params: Record<string, unknown> = {};
    for (const req of schema.required ?? []) {
      if (req === key) continue;
      const p = schema.properties?.[req];
      params[req] = p?.enum ? p.enum[0] : p?.type === 'number' || p?.type === 'integer' ? 1 : p?.type === 'boolean' ? true : 'x';
    }
    const clean = action.paramsSchema.safeParse({ ...params, [key]: '/ok' });
    expect(clean.success, `the control case for ${id}.${key} must parse, or this test proves nothing`).toBe(true);
    const dirty = action.paramsSchema.safeParse({ ...params, [key]: 'javascript:alert(1)' });
    expect(dirty.success, `${id}.${key} accepts a javascript: URL`).toBe(false);
  });
});

describe('the generated command grammar did not move', () => {
  /**
   * The whole reason this is a `.refine` and not a `.regex`: `z.toJSONSchema` does not
   * emit refinements, so the manifest the web client is generated from is unchanged
   * and `manifest.canonical.json` does not need regenerating. Asserted rather than
   * assumed, because if it were false the drift guard would fail on someone else's
   * unrelated push and they would have no idea why.
   */
  it('notify.href is still an unadorned length-bounded string in the manifest', () => {
    const manifest = buildActionManifest();
    const notify = manifest.actions.find((a) => a.id === 'notify')!;
    const props = (notify.params as { properties: Record<string, unknown> }).properties;
    expect(props.href).toEqual({ maxLength: 300, type: 'string' });
  });

  it('the manifest hash is the one already on disk', () => {
    expect(buildActionManifest().manifestHash).toBe('7aa93c214ef5f44c');
    // and the bytes, so a hash collision cannot make this vacuous
    expect(canonicalJson(buildActionManifest())).toContain('"manifestHash":"7aa93c214ef5f44c"');
  });
});
