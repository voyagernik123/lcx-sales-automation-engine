import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Launch, LCXOS_VERSION, LCXOS_DOWNLOAD_URL, LCXOS_DMG_MB } from '../Launch';

/**
 * The public LCXOS page — the one surface a colleague sees before they trust us.
 *
 * Every assertion here guards a claim that can go stale silently, which is the
 * failure mode this repo keeps finding: a page that still says 0.1.4 after 0.3.0
 * ships, or a Download button whose asset name no longer exists, looks perfectly
 * healthy and is broken for exactly the person we cannot afford to lose.
 *
 * WHAT THIS FILE CANNOT SEE, said plainly: jsdom has no layout and no paint, so
 * nothing here proves the download button is visually prominent, that the page
 * looks right, or that it is legible on a phone. It proves the FACTS on the page
 * are true and that the structure that carries them exists.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const renderPage = () =>
  render(
    <MemoryRouter>
      <Launch />
    </MemoryRouter>,
  );

describe('the public LCXOS page', () => {
  describe('facts that must not go stale', () => {
    it('states the version the desktop app is actually built at', () => {
      const conf = JSON.parse(read('apps/desktop/src-tauri/tauri.conf.json')) as { version: string };
      // The page cannot ask the API for this (see the module docstring: the API
      // sleeps, and a spinner on the front page is the thing we are avoiding), so
      // the literal is checked against the source of truth here instead.
      expect(
        LCXOS_VERSION,
        'the version printed on the public page is not the version tauri.conf.json builds',
      ).toBe(conf.version);
      // And it is on screen, not merely exported.
      renderPage();
      expect(screen.getByText(new RegExp(LCXOS_VERSION.replace(/\./g, '\\.')))).toBeInTheDocument();
    });

    it('links to the version-less asset name the publisher really uploads', () => {
      const ASSET = 'LCXOS-macOS-arm64.dmg';
      expect(LCXOS_DOWNLOAD_URL.endsWith(`/releases/latest/download/${ASSET}`)).toBe(true);
      // CROSSING THE BOUNDARY, which is the point of this assertion. Checking the URL
      // against itself would pass while the publisher uploaded something else, and the
      // button would 404 — so read the publisher and require the same literal. This is
      // the check that fails if someone "tidies" the asset name on one side only.
      const publisher = read('apps/desktop/scripts/publish-release.mjs');
      expect(
        publisher.includes(`'${ASSET}'`),
        `publish-release.mjs does not upload an asset named ${ASSET}, so the page's Download button would 404`,
      ).toBe(true);
    });


    it('states a download size the publisher will accept', () => {
      // The page said 6.4 MB while the DMG was 3.8 MB. publish-release.mjs now refuses
      // to publish on a mismatch; this asserts the two sides still agree about WHICH
      // constant carries the number, because renaming it would make that guard
      // unrunnable — and it dies loudly rather than skipping if it cannot find it.
      const publisher = read('apps/desktop/scripts/publish-release.mjs');
      expect(publisher).toContain('LCXOS_DMG_MB');
      expect(LCXOS_DMG_MB, 'a download size of 0 or undefined would render as blank').toBeGreaterThan(0);
      renderPage();
      expect(screen.getByText(new RegExp(String(LCXOS_DMG_MB).replace('.', '\\.') + ' MB'))).toBeInTheDocument();
    });

    it('does not use a versioned download URL, which would break on the next release', () => {
      // `/releases/download/v0.2.0/…` works today and is broken forever after 0.2.1.
      expect(LCXOS_DOWNLOAD_URL).not.toMatch(/\/releases\/download\/v?\d/);
      expect(LCXOS_DOWNLOAD_URL).toContain('/releases/latest/download/');
    });
  });

  describe('it works when the API is asleep — the whole reason it exists', () => {
    const fetchSpy = vi.fn();
    beforeEach(() => {
      fetchSpy.mockClear();
      vi.stubGlobal('fetch', fetchSpy);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('renders without issuing a single network request', () => {
      renderPage();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      // BEHAVIOURAL, not a source grep: an indirect import three modules deep would
      // still show up here, and that is exactly how a health check sneaks back in.
      expect(
        fetchSpy,
        'the public page called fetch — on a cold Render instance that is a 13.5s spinner on our front page',
      ).not.toHaveBeenCalled();
    });

    it('imports nothing from the API client', () => {
      const src = read('apps/web/src/pages/Launch.tsx');
      const imports = [...src.matchAll(/^import[^;]+from\s+'([^']+)'/gm)].map((m) => m[1]);
      const offenders = imports.filter((i) => /apiClient|lib\/api|useApi|stores/.test(i));
      expect(
        offenders,
        'the public page imports API machinery; even unused, a store subscription can fire a request',
      ).toEqual([]);
    });
  });

  describe('the download moment', () => {
    it('offers the Mac app as a real link to the real file', () => {
      renderPage();
      const dl = screen.getByRole('link', { name: /download for mac/i });
      expect(dl).toHaveAttribute('href', LCXOS_DOWNLOAD_URL);
    });

    it('has exactly ONE primary action, so the eye has somewhere to go', () => {
      // The defect this prevents is the one the send-queue ratchet was written for:
      // two equally loud buttons mean no primary action. The browser door is
      // deliberately a quiet link, not a second filled button.
      const { container } = renderPage();
      const filled = [...container.querySelectorAll('a,button')].filter((el) =>
        el.className.includes('bg-navy'),
      );
      expect(
        filled.map((el) => el.textContent?.trim()),
        'the page has more than one filled call-to-action',
      ).toHaveLength(1);
    });

    it('tells the operator about Gatekeeper, and says it happens once', () => {
      renderPage();
      // The single most likely way this plan fails is a colleague double-clicking,
      // seeing macOS refuse, and concluding the download is broken. So: the
      // instruction exists, it names the gesture, and it bounds the pain.
      const note = screen.getByText(/right-click the app/i);
      expect(note).toBeInTheDocument();
      const surrounding = note.closest('div')?.textContent ?? '';
      expect(surrounding.toLowerCase()).toContain('once per mac');
      expect(surrounding.toLowerCase()).toMatch(/not a broken download|expected/);
    });

    it('offers the browser as the second door', () => {
      renderPage();
      expect(screen.getByRole('link', { name: /open it in the browser/i })).toHaveAttribute(
        'href',
        '/select',
      );
      expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/select');
    });
  });

  describe('claims about the app are the four that are true', () => {
    it('does not claim the app is faster than the browser', () => {
      const src = read('apps/web/src/pages/Launch.tsx');
      // Production sits behind ~165-195ms of fixed network latency that no client
      // removes. "Faster" was measured and withdrawn once already in this programme;
      // this stops it being written back in by someone reaching for a benefit.
      const body = src.split('export function Launch')[1] ?? '';
      expect(body).not.toMatch(/\bfaster\b|\binstant\b|\blightning\b/i);
    });

    it('names ⌘0–6 and ⌥Space, the two chords a browser genuinely cannot give', () => {
      renderPage();
      expect(screen.getByText('⌥Space')).toBeInTheDocument();
      expect(screen.getByText('⌘0–6')).toBeInTheDocument();
    });
  });
});

describe('the rename has no survivors', () => {
  /**
   * A ratchet, not a one-off cleanup. The product is LCXOS; the old name must not
   * reappear in shipped UI because someone copied an older file as a template.
   * Scoped to src/ (not docs, which legitimately record the history) and reading
   * only the strings that reach a screen would be nice — but a comment carrying the
   * old name is how the old name gets copied into a string, so both are refused.
   */
  it('no "LCX TERMINAL" remains anywhere in the web source', () => {
    const root = resolve(REPO, 'apps/web/src');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) {
          walk(p);
        } else if (/\.(ts|tsx|css|html)$/.test(e.name)) {
          const text = readFileSync(p, 'utf8');
          // The literal with a SPACE. `LCX_TERMINAL_PLAN.md` (underscores) is a real
          // filename that comments legitimately point at, and matching it would make
          // this ratchet demand we break those pointers.
          if (text.includes('LCX TERMINAL')) hits.push(p.slice(REPO.length + 1));
        }
      }
    };
    walk(root);
    /**
     * The allowlist is EXHAUSTIVE and both entries are documentary — they quote the
     * old name in prose in order to explain the rename, which is the one legitimate
     * reason to write it. Everything else is a leak.
     *
     * If this assertion fails for your file, the fix is to rephrase, not to append
     * to this list. The point of naming them individually rather than skipping
     * comments wholesale is that a comment is precisely how the old name gets
     * copied into a user-visible string later.
     *
     * Non-vacuity comes for free: these two files guarantee a working walk always
     * has candidates, so a walk that silently found nothing fails too.
     */
    expect(hits.sort(), `the old product name is still in the shipped source: ${hits.join(', ')}`).toEqual([
      // explains why the mark exists and what it replaced
      'apps/web/src/components/brand/LcxMark.tsx',
      // this ratchet, which has to contain the literal it searches for
      'apps/web/src/pages/__tests__/launch.test.tsx',
    ]);
  });
});
