import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_MAX_BYTES,
  deriveStorageKey,
  readBoundedBody,
  safeFilename,
  sha256Hex,
  verifyDeclaredMime,
} from '../artifact.js';

/**
 * GPS CLIENT ARTIFACT INTAKE — the refusals, tested one at a time.
 *
 * Decision D2 was answered YES (owner, 2026-08-02), so GPS may hold a third party's
 * confidential material. Every assertion below is a property that answer bought and
 * that must not be traded away later for convenience: without them this surface is
 * an unauthenticated-in-effect file drop on the infrastructure of an
 * EU/Liechtenstein-regulated exchange.
 *
 * Each `it` fails if the corresponding check in `../artifact.ts` is removed.
 */

/** Bytes helpers, so the test reads as "these leading bytes" and not as noise. */
const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);

const CLIENT = '11111111-1111-4111-8111-111111111111';
const ENGAGEMENT = '22222222-2222-4222-8222-222222222222';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';

describe('a filename is untrusted display text and is refused, never sanitised', () => {
  const unsafe: ReadonlyArray<[string, string]> = [
    ['../../etc/passwd', 'traversal with separators'],
    ['..\\..\\windows\\system32', 'windows traversal'],
    ['reports/whitepaper.pdf', 'a forward slash'],
    ['reports\\whitepaper.pdf', 'a backslash'],
    ['white..paper.pdf', 'a bare .. anywhere'],
    ['.env', 'a leading dot'],
    ['white\npaper.pdf', 'a newline that would forge a log line'],
    ['white\u0000paper.pdf', 'a NUL that truncates a C string'],
  ];
  for (const [name, why] of unsafe) {
    it(`refuses ${JSON.stringify(name)} — ${why}`, () => {
      const got = safeFilename(name);
      expect(got.ok, `${name} was accepted`).toBe(false);
      if (!got.ok) expect(got.code).toBe('filename_unsafe');
    });
  }

  it('refuses an absent or blank name rather than inventing one', () => {
    for (const raw of [undefined, null, '', '   ', 42]) {
      const got = safeFilename(raw);
      expect(got.ok).toBe(false);
      if (!got.ok) expect(got.code).toBe('filename_missing');
    }
  });

  it('refuses a name longer than the display bound', () => {
    const got = safeFilename(`${'a'.repeat(400)}.pdf`);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('filename_too_long');
  });

  it('accepts an ordinary document name unchanged', () => {
    const got = safeFilename('  MiCA White Paper v3 (final).pdf  ');
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.value).toBe('MiCA White Paper v3 (final).pdf');
  });
});

describe('the storage key is derived from ids, never from the filename', () => {
  it('contains the three ids and the verified extension, and nothing else', () => {
    const key = deriveStorageKey({
      clientId: CLIENT,
      engagementId: ENGAGEMENT,
      artifactId: ARTIFACT,
      ext: '.pdf',
    });
    expect(key).toBe(`gps/${CLIENT}/${ENGAGEMENT}/${ARTIFACT}.pdf`);
  });

  it('cannot be steered by anything a client typed', () => {
    // The point restated as an assertion: no call signature exists that puts a
    // client string into a key, so a traversal attempt cannot reach the key even if
    // the filename check were bypassed.
    const key = deriveStorageKey({
      clientId: CLIENT,
      engagementId: ENGAGEMENT,
      artifactId: ARTIFACT,
      ext: '.txt',
    });
    expect(key).not.toContain('..');
    expect(key.split('/')).toHaveLength(4);
  });

  it('throws on a non-uuid id or an extension not from the allowlist', () => {
    expect(() =>
      deriveStorageKey({ clientId: 'not-a-uuid', engagementId: ENGAGEMENT, artifactId: ARTIFACT, ext: '.pdf' }),
    ).toThrow(/uuid/);
    expect(() =>
      deriveStorageKey({ clientId: CLIENT, engagementId: ENGAGEMENT, artifactId: ARTIFACT, ext: '../x' }),
    ).toThrow(/allowlist/);
  });
});

describe('the declared type is a claim; the leading bytes are the evidence', () => {
  it('accepts a PDF that really is a PDF, and keeps the extension server-side', () => {
    const got = verifyDeclaredMime('application/pdf', PDF);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.spec.ext).toBe('.pdf');
  });

  it('accepts a Content-Type with parameters', () => {
    expect(verifyDeclaredMime('text/csv; charset=utf-8', text('a,b\n1,2\n')).ok).toBe(true);
  });

  it('REFUSES a .pdf declaration whose bytes are a PNG', () => {
    const got = verifyDeclaredMime('application/pdf', PNG);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('mime_mismatch');
  });

  it('REFUSES a text/plain declaration carrying a binary payload', () => {
    for (const payload of [PDF, PNG, ZIP, bytes(0x4d, 0x5a, 0x90, 0x00)]) {
      const got = verifyDeclaredMime('text/plain', payload);
      expect(got.ok, 'a binary body passed as text/plain').toBe(false);
      if (!got.ok) expect(got.code).toBe('mime_mismatch');
    }
  });

  it('REFUSES text that is not valid UTF-8, or that contains NUL', () => {
    const invalidUtf8 = bytes(0x68, 0x69, 0xff, 0xfe);
    expect(verifyDeclaredMime('text/plain', invalidUtf8).ok).toBe(false);
    expect(verifyDeclaredMime('text/csv', bytes(0x61, 0x00, 0x62)).ok).toBe(false);
  });

  it('REFUSES a type that is not on the allowlist at all', () => {
    for (const mime of ['application/x-msdownload', 'application/octet-stream', 'text/html', 'image/svg+xml']) {
      const got = verifyDeclaredMime(mime, PDF);
      expect(got.ok, `${mime} was accepted`).toBe(false);
      if (!got.ok) expect(got.code).toBe('mime_not_allowed');
    }
  });

  it('REFUSES an undeclared type instead of guessing one', () => {
    for (const declared of [undefined, '', '   ', 7]) {
      const got = verifyDeclaredMime(declared, PDF);
      expect(got.ok).toBe(false);
      if (!got.ok) expect(got.code).toBe('mime_not_declared');
    }
  });

  it('REFUSES an empty body even when the type is allowed', () => {
    const got = verifyDeclaredMime('application/pdf', new Uint8Array(0));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('empty_body');
  });
});

describe('the digest is computed here, from the bytes received', () => {
  it('is the sha256 of the body and nothing a client could assert', () => {
    // Known vector: sha256('abc').
    expect(sha256Hex(text('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('changes when one byte changes', () => {
    expect(sha256Hex(text('abc'))).not.toBe(sha256Hex(text('abd')));
  });
});

/** A stream over fixed chunks, so chunk boundaries are part of the test. */
function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else controller.close();
    },
  });
}

describe('the size ceiling refuses; it never truncates', () => {
  it('reassembles a multi-chunk body exactly', async () => {
    const got = await readBoundedBody(streamOf([text('%PDF-1.7 '), text('body'), text(' end')]));
    expect(got.ok).toBe(true);
    if (got.ok) expect(new TextDecoder().decode(got.bytes)).toBe('%PDF-1.7 body end');
  });

  it('accepts a body exactly at the ceiling', async () => {
    const got = await readBoundedBody(streamOf([new Uint8Array(8)]), 8);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.bytes.byteLength).toBe(8);
  });

  it('REFUSES one byte over the ceiling, and returns no bytes at all', async () => {
    const got = await readBoundedBody(streamOf([new Uint8Array(4), new Uint8Array(5)]), 8);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('too_large');
    // The failure mode this guards: a truncated regulatory filing stored as if whole.
    expect(got).not.toHaveProperty('bytes');
  });

  it('stops pulling the stream once the ceiling is passed', async () => {
    // Proves the ceiling bounds MEMORY, not just the answer: a 1 GB body must not be
    // buffered in full before being rejected.
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(4));
      },
    });
    const got = await readBoundedBody(endless, 8);
    expect(got.ok).toBe(false);
    expect(pulls).toBeLessThan(6);
  });

  it('REFUSES an empty or absent body', async () => {
    const empty = await readBoundedBody(streamOf([]));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('empty_body');
    const absent = await readBoundedBody(null);
    expect(absent.ok).toBe(false);
    if (!absent.ok) expect(absent.code).toBe('empty_body');
  });

  it('has a ceiling that is a real bound and not a formality', () => {
    expect(ARTIFACT_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});
