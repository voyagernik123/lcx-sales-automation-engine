import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ENVELOPE_NOT_CARRIED, attachMeta, mergedMetaNotices, metaNotices, unwrapWithMeta,
} from '../meta';
import { GpsMetaBanner } from '@/pages/GpsMetaBanner';

/**
 * GETTING `meta` TO THE BROWSER WAS HALF A FIX.
 *
 * `responseMeta.test.ts` pins the carrier. This pins the CONSEQUENCE: that a read
 * which says `migrated: false`, or whose perimeter came from compiled placeholders,
 * or whose drift verdict was measured against a catalogue the client never saw,
 * produces a sentence the operator can read — on every GPS surface rather than on the
 * one that happened to get a bespoke component.
 *
 * The original defect was never "the fetch layer dropped a field". It was that a
 * figure with no basis rendered identically to a figure with one.
 */

const pageAt = (name: string) => readFileSync(join(__dirname, '../../../pages', name), 'utf8');

/** Judge what a page DOES, not what its comments discuss. */
const codeOnly = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

/** A payload as a fetcher would resolve it: envelope attached, nothing else changed. */
const asRead = <T,>(data: T, meta: Record<string, unknown>): T => attachMeta(data, meta);

describe('the sentences a carried envelope obliges a surface to print', () => {
  it('says the tables do not exist rather than letting an empty list stand as a fact', () => {
    const [n, ...rest] = metaNotices(asRead([] as unknown[], { migrated: false }));
    expect(rest).toEqual([]);
    expect(n.id).toBe('not-migrated');
    expect(n.tone).toBe('refusal');
    // The distinction, in the operator's own words. Without it `[]` reads as "this
    // client has no engagements", which is a claim about the business made from a
    // fact about the environment.
    expect(n.headline).toMatch(/do not exist on this environment/);
    expect(n.detail).toMatch(/empty shape, not an empty book/);
  });

  it('names the migration that would change the answer when the server named one', () => {
    const [n] = metaNotices(asRead({}, { migrated: false, pendingMigration: '0051_gps_outcome.sql' }));
    expect(n.detail).toContain('0051_gps_outcome.sql');
  });

  it('distinguishes a pending migration on a read that DID work from one that did not', () => {
    // routes/gpsLoop.ts:321 — migrated, and the outcome store still absent. A rate
    // computed here is a rate over a subset, which is a warning, not a refusal.
    const notices = metaNotices(asRead({}, { migrated: true, pendingMigration: '0051.sql' }));
    expect(notices.map((x) => [x.id, x.tone])).toEqual([['pending-migration', 'warning']]);
    expect(notices[0].detail).toMatch(/over a subset/);
  });

  it('refuses the calibration reading when outcomes cannot be stored at all', () => {
    const notices = metaNotices(asRead({}, { migrated: true, outcomeStoreMigrated: false }));
    expect(notices.map((x) => x.id)).toEqual(['outcome-store-missing']);
    expect(notices[0].tone).toBe('refusal');
    expect(notices[0].detail).toMatch(/empty table/);
  });

  it('says a perimeter clearance nobody entered is not a clearance', () => {
    const notices = metaNotices(asRead({}, {
      migrated: true, perimeter: { allowed: true, source: 'compiled_placeholder' },
    }));
    expect(notices.map((x) => [x.id, x.tone])).toEqual([['perimeter-placeholder', 'refusal']]);
    expect(notices[0].detail).toMatch(/expired on arrival and authorise nothing/);
  });

  it('stays quiet about a perimeter a human actually entered', () => {
    expect(metaNotices(asRead({}, {
      migrated: true, perimeter: { allowed: true, source: 'database' },
    }))).toEqual([]);
  });

  it('says which acceptance criteria a drift verdict was measured against', () => {
    const live = metaNotices(asRead({}, {
      migrated: true, scopeBasis: { criteriaFrom: 'live_catalogue', note: 'no usable snapshot' },
    }));
    expect(live.map((x) => [x.id, x.tone])).toEqual([['scope-basis-live-catalogue', 'warning']]);
    expect(live[0].headline).toMatch(/not the offer as sold/);
    // Measured against the sale: the verdict means what it appears to mean.
    expect(metaNotices(asRead({}, {
      migrated: true, scopeBasis: { criteriaFrom: 'scope_snapshot', note: 'as sold' },
    }))).toEqual([]);
  });

  it('says the block verdict on screen is a preview and the guard decides at issue', () => {
    const notices = metaNotices(asRead({}, { migrated: true, issueDecisionIsAdvisory: true }));
    expect(notices.map((x) => x.id)).toEqual(['issue-decision-advisory']);
  });

  it('reads no key that no route puts in `meta`', () => {
    /*
     * A rule matching a shape nothing emits is as dead as an exported symbol with no
     * consumer, and worse: it reads as coverage. These three were written and then
     * removed once each producer was checked —
     *   · rateCardsArePlaceholders / effortTriplesArePlaceholders travel in `data`
     *     (routes/gpsUnderwrite.ts:341) and GpsUnderwriting.tsx badges every row from
     *     them already;
     *   · stored: false only ever rides a 422 body (routes/gpsLoop.ts:466), which
     *     apiClient raises as an ApiError, so no payload carrying it reaches a surface.
     */
    expect(metaNotices(asRead({}, {
      migrated: true,
      rateCardsArePlaceholders: true,
      effortTriplesArePlaceholders: true,
      stored: false,
    }))).toEqual([]);
  });

  it('has nothing to say about a read with nothing to declare', () => {
    // The everyday case: it must not manufacture a banner out of a timestamp.
    expect(metaNotices(asRead({ rows: [] }, { migrated: true, timestamp: 'x', version: '1' }))).toEqual([]);
  });

  it('leaves `null` alone, because the API cannot attach an envelope to it', () => {
    // Several GPS routes answer `data: null` for "no such engagement". Absence proves
    // nothing there, so treating it as a lost envelope would cry wolf on every 200.
    expect(metaNotices(null)).toEqual([]);
    expect(metaNotices(undefined)).toEqual([]);
    expect(metaNotices(7)).toEqual([]);
    expect(metaNotices('x')).toEqual([]);
  });

  it('states each fact once across several reads on one surface', () => {
    const a = asRead([] as unknown[], { migrated: false });
    const b = asRead([] as unknown[], { migrated: false });
    const c = asRead({}, { migrated: false, perimeterSource: 'compiled_placeholder' });
    // Three reads, two facts. A page that says "not migrated" three times is
    // reporting how many requests it made, not what is wrong.
    expect(mergedMetaNotices([a, b, c]).map((n) => n.id))
      .toEqual(['not-migrated', 'perimeter-placeholder']);
  });
});

/**
 * THE CARRIER'S ONE WEAKNESS, MADE LOUD.
 *
 * A symbol cannot survive a structural clone. The choice made in `meta.ts` was NOT to
 * make it survive — that needs an enumerable key on the payload, which is the
 * collision the symbol exists to avoid — but to make its absence a refusal-grade
 * finding, so a clone degrades the screen to "this cannot tell you what it is
 * missing" instead of to "looks fine".
 */
describe('a payload that lost its envelope', () => {
  const original = () => asRead({ rows: [1, 2] }, { migrated: false, version: '9' });

  it.each([
    ['a JSON round trip', (v: object) => JSON.parse(JSON.stringify(v)) as object],
    ['structuredClone', (v: object) => structuredClone(v)],
    ['a spread', (v: object) => ({ ...v })],
    // What React Query's structuralSharing does: rebuild from enumerable string keys.
    ['a structural-sharing rebuild', (v: object) => Object.fromEntries(Object.entries(v))],
  ])('is LOUD, not silent, after %s', (_label, clone) => {
    const source = original();
    expect(metaNotices(source).map((n) => n.id)).toEqual(['not-migrated']);

    const cloned = clone(source);
    // The payload is intact. The provenance is gone. Before this, the page rendered
    // the first fact and silently dropped the second.
    expect(cloned).toEqual({ rows: [1, 2] });
    const notices = metaNotices(cloned);
    expect(notices.map((n) => n.id)).toEqual([ENVELOPE_NOT_CARRIED]);
    expect(notices[0].tone).toBe('refusal');
    expect(notices[0].detail).toMatch(/absence of a warning on this screen is not evidence/);
  });

  it('is loud for a fetcher that stopped carrying the envelope at all', async () => {
    // The same failure as a clone, from the other direction: the eight private
    // `unwrap` copies this programme deleted.
    const dropped = await Promise.resolve({ data: { rows: [] }, meta: { migrated: false } })
      .then((r) => r.data);
    expect(metaNotices(dropped).map((n) => n.id)).toEqual([ENVELOPE_NOT_CARRIED]);
    const carried = await unwrapWithMeta(
      Promise.resolve({ data: { rows: [] }, meta: { migrated: false } }),
    );
    expect(metaNotices(carried).map((n) => n.id)).toEqual(['not-migrated']);
  });
});

describe('the operator can read it', () => {
  it('prints the refusal, its reason, and nothing when there is nothing to say', () => {
    const { rerender } = render(<GpsMetaBanner of={[asRead([] as unknown[], { migrated: false })]} />);
    expect(screen.getByText(/do not exist on this environment/)).toBeInTheDocument();
    expect(screen.getByText(/empty shape, not an empty book/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveAttribute('data-notice', 'not-migrated');

    rerender(<GpsMetaBanner of={[asRead({}, { migrated: true })]} />);
    expect(screen.queryByTestId('gps-meta-banner')).not.toBeInTheDocument();
  });

  it('prints one row per fact, refusals and warnings both', () => {
    render(<GpsMetaBanner of={[asRead({}, {
      migrated: true,
      outcomeStoreMigrated: false,
      issueDecisionIsAdvisory: true,
    })]} />);
    expect(screen.getAllByRole('note').map((el) => el.getAttribute('data-notice')))
      .toEqual(['outcome-store-missing', 'issue-decision-advisory']);
  });

  it('says so when the envelope did not arrive', () => {
    render(<GpsMetaBanner of={[{ rows: [] }]} />);
    expect(screen.getByRole('note')).toHaveAttribute('data-notice', ENVELOPE_NOT_CARRIED);
    expect(screen.getByText(/without its provenance envelope/)).toBeInTheDocument();
  });
});

/**
 * ONE TEST PER SURFACE — the half of the fix the audit found missing.
 *
 * Eight modules carried the envelope and ONE component read it, so seven surfaces
 * still rendered `migrated: false` as an ordinary empty table. These assert the
 * wiring page by page, against the state each page actually sets from its fetchers,
 * so a page that keeps the import and stops passing its read is still a failure.
 */
describe('every GPS surface renders what its own reads declared', () => {
  const SURFACES: Array<{ page: string; passes: readonly string[] }> = [
    // The quote desk reads three endpoints; `summary.migrated` is a field and covers
    // only the summary, so the two lists must be passed or an unmigrated environment
    // renders "no clients yet".
    { page: 'Gps.tsx', passes: ['of={[summary, clients, engagements]}'] },
    { page: 'GpsBook.tsx', passes: ['of={[res]}'] },
    { page: 'GpsUnderwriting.tsx', passes: ['of={[res]}'] },
    { page: 'GpsOrigination.tsx', passes: ['of={[res]}'] },
    { page: 'GpsDelivery.tsx', passes: ['of={[data]}'] },
    // The loop's three reads: the snapshot and the two details a win rate is drawn from.
    { page: 'GpsLoop.tsx', passes: ['loop,', 'winLoss.status', 'margin.status'] },
    // The wall keeps rows, not payloads, so it derives the notices at the read and
    // folds `not-migrated` into the banner it already owned.
    {
      page: 'GpsConflict.tsx',
      passes: ['mergedMetaNotices([sum, clients, engagements])', 'notices={readNotices}'],
    },
  ];

  for (const { page, passes } of SURFACES) {
    it(`${page} states it`, () => {
      const code = codeOnly(pageAt(page));
      expect(code, `${page} does not render the envelope at all`).toMatch(/GpsMetaBanner|GpsMetaNotices/);
      for (const token of passes) {
        expect(code.includes(token), `${page} no longer passes \`${token}\``).toBe(true);
      }
    });
  }

  /**
   * THE RATCHET. The defect was one component reading the envelope while seven
   * surfaces did not, so the guard is "no GPS surface omits it" rather than "these
   * seven include it" — a ninth page must fail this on the day it is added.
   */
  it('no GPS page omits it', () => {
    const dir = join(__dirname, '../../../pages');
    const offenders = readdirSync(dir)
      .filter((f) => /^Gps.*\.tsx$/.test(f) && f !== 'GpsMetaBanner.tsx')
      .filter((f) => !/GpsMetaBanner|GpsMetaNotices/.test(codeOnly(pageAt(f))));
    expect(
      offenders,
      'a GPS surface that renders none of its envelope shows a placeholder, an unmigrated '
      + "table or a lost provenance trail as if it were ordinary data — import GpsMetaBanner "
      + 'from ./GpsMetaBanner and pass the values its fetchers resolved',
    ).toEqual([]);
  });
});
