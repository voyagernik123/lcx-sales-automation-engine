import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobeRelief } from '@/components/market/GlobeRelief';
import {
  buildGlobeBook, centralMeridian, contrastRatio, formatSolarHour, geoUnit, pinHeight, separationDeg,
  solarHourAt, standOnNormal, subSolarPoint,
  EARTH_R, HUB, LABEL_BG, LABEL_DIM_FG, LABEL_FG, PIN_MAX, REGION_SITES,
} from '@/components/market/globeSites';
import type { MapPoint } from '@/lib/api/bd';

/*
 * §7's disposition for an environment whose clause (b) is not established: "it ships behind a toggle that
 * defaults off, and I tell you rather than quietly shipping it."
 *
 * These tests are about the DEFAULT, the FALLBACK and the ARITHMETIC — not about the render. The render is
 * verified by `docs/3d/e2`'s capture against a real rasteriser; jsdom has no WebGL2 and pretending otherwise
 * would be a test that passes for the wrong reason. What CAN be verified here is exactly what §7 asks — that
 * a reader who does nothing sees the scatter, and that the reason is on the page — plus the one thing that
 * makes E2 different from the other eight: that nothing on the figure claims to know where an organisation
 * is.
 */
const point = (over: Partial<MapPoint> = {}): MapPoint => ({
  id: over.id ?? 'p1',
  name: over.name ?? 'Project One',
  ticker: 'ONE',
  marketCapUsd: 1_000_000,
  volume24hUsd: null,
  priceChange30d: null,
  category: null,
  region: 'eu',
  listedOnLcx: false,
  exchangeCount: 0,
  band: 'watch',
  priorityScore: 1,
  propensityScore: 1,
  euScore: null,
  usPreScore: null,
  usPostScore: null,
  recommendedMarket: null,
  ...over,
});

const POINTS: MapPoint[] = [
  point({ id: 'a', region: 'eu', listedOnLcx: true, marketCapUsd: 2_000_000 }),
  point({ id: 'b', region: 'EU ', listedOnLcx: false, marketCapUsd: 3_000_000 }),
  point({ id: 'c', region: 'us', listedOnLcx: false, marketCapUsd: 5_000_000 }),
  point({ id: 'd', region: 'other', listedOnLcx: false, marketCapUsd: 1_000_000 }),
  point({ id: 'e', region: null, listedOnLcx: false, marketCapUsd: 1_000_000 }),
];

describe('GlobeRelief — §7 says an unproven environment defaults off and says so', () => {
  it('renders the FLAT scatter with no interaction, and no canvas', () => {
    const { container } = render(
      <GlobeRelief points={POINTS}><div data-testid="flat">the scatter</div></GlobeRelief>,
    );
    expect(screen.getByTestId('flat'), 'the scatter must be what loads').toBeTruthy();
    expect(container.querySelector('canvas'), 'the globe must NOT be the default').toBeNull();
  });

  it('tells the reader WHY the globe is opt-in, on the page and before the click', () => {
    render(<GlobeRelief points={POINTS}><div>flat</div></GlobeRelief>);
    /* §7(b): nobody has timed it. */
    expect(screen.getByText(/nobody has yet timed whether it answers faster/i)).toBeTruthy();
    /*
     * AND E2's OWN LIMIT, which is the reason this environment was the hardest of the nine. A reader who
     * opens a globe expecting to see where partners are has already been misled by the time they reach a
     * caption inside the frame, so the caveat is beside the button.
     */
    expect(screen.getByText(/places REGIONS at published reference points, never organisations/i)).toBeTruthy();
    expect(screen.getByText(/no per-project coordinates/i)).toBeTruthy();
  });

  it('offers the toggle, and reports its state to assistive technology', () => {
    render(<GlobeRelief points={POINTS}><div>flat</div></GlobeRelief>);
    const btn = screen.getByRole('button', { name: /globe view/i });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('keeps the scatter while the lazy chunk is still loading', () => {
    /*
     * The Suspense fallback IS the scatter rather than a spinner. A reader who clicked for the globe has not
     * asked to lose the universe for the length of a network round trip, and a blank pane would be a worse
     * answer to the question they were already reading.
     */
    render(<GlobeRelief points={POINTS}><div data-testid="flat">the scatter</div></GlobeRelief>);
    fireEvent.click(screen.getByRole('button', { name: /globe view/i }));
    expect(screen.getByTestId('flat'), 'the scatter must survive the load').toBeTruthy();
  });

  it('does not import the GL layer until the reader asks', async () => {
    /*
     * THE BUDGET TEST. The perf budget allows 11 KB of headroom on initial JS and the environment layer alone
     * is 35.7 KB, so an eager import would blow it on a view most readers never open. Asserted structurally:
     * the module graph reachable from this component must not name the engine.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    /* Resolved from the workspace root rather than `import.meta.url`: under jsdom that is not a file: URL and
       `new URL(...)` throws. Existence is asserted FIRST so this test cannot pass by reading an empty
       string — a structural check that silently finds nothing is the failure mode it exists to prevent. */
    const file = path.resolve(process.cwd(), 'src/components/market/GlobeRelief.tsx');
    expect(fs.existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
    const src = fs.readFileSync(file, 'utf8');
    expect(src.length).toBeGreaterThan(500);
    expect(src, 'the GL component must be behind lazy()').toMatch(/lazy\(\(\) => import\(/);
    expect(
      /^import[^;]*from '@lcx\/gl'/m.test(src),
      'GlobeRelief must not import @lcx/gl eagerly',
    ).toBe(false);
  });

  it('the GL renderer has no idle animation and returns to flat on a lost context', async () => {
    /*
     * §6 rule 2 and the context-loss scar, checked on the SOURCE with comments stripped — which is how the
     * previous round caught its own false positive: the words `requestAnimationFrame` appear in several of
     * these files' prose, and a naive grep reads a comment as code.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.resolve(process.cwd(), 'src/components/market/GlobeReliefGl.tsx');
    expect(fs.existsSync(file), `cannot find ${file}`).toBe(true);
    const raw = fs.readFileSync(file, 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code.length).toBeGreaterThan(2000);
    expect(/requestAnimationFrame|setInterval|setTimeout/.test(code), 'no loop in code').toBe(false);
    expect(code).toContain('webglcontextlost');
    /*
     * BRAND FIDELITY BEFORE ANY RESOURCE IS BUILT — §6 rule 5. Anchored on the CALL SITE, not on the name:
     * `createStage` also appears in the import list at the top of the file, so a check against the bare
     * identifier compares an import against a call and passes or fails for a reason unrelated to the rule.
     */
    expect(code.indexOf('assertBrandFidelity()')).toBeGreaterThan(-1);
    expect(code.indexOf('createStage(canvas')).toBeGreaterThan(-1);
    expect(code.indexOf('assertBrandFidelity()')).toBeLessThan(code.indexOf('createStage(canvas'));
    /* And the stage is disposed LAST, after every resource built on it. */
    expect(code).toContain('stage.dispose()');
    const cleanup = code.slice(code.lastIndexOf('return () => {'));
    expect(cleanup.indexOf('disposers.reverse()')).toBeLessThan(cleanup.indexOf('stage.dispose()'));
  });
});

describe('globeSites — the table is the only source of a position, and it refuses the rest', () => {
  it('places only the regions the product actually knows, at published reference points', () => {
    /* Two entries, and both provenances name a published centre. A third entry appearing here without a
       citation would be a guessed coordinate shipped as geography. */
    expect(REGION_SITES.map((s) => s.key)).toEqual(['eu', 'us']);
    for (const s of REGION_SITES) {
      expect(s.provenance, `${s.key} must say what its point IS`).toMatch(/geographic centre/i);
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lon)).toBeLessThanOrEqual(180);
    }
    /* The hub is an address, not a centroid, and that difference is stated. */
    expect(HUB.provenance).toMatch(/registered in Vaduz/i);
  });

  it('groups by region case-insensitively and never places a bucket', () => {
    const book = buildGlobeBook(POINTS);
    expect(book.sites.map((s) => s.key)).toEqual(['eu', 'us']);
    /* 'eu' and 'EU ' are the same region: a trailing space must not create a second, unplaceable group. */
    expect(book.sites[0]!.projects).toBe(2);
    expect(book.sites[0]!.listed).toBe(1);
    expect(book.sites[0]!.mcapUsd).toBe(5_000_000);
    expect(book.sites[1]!.projects).toBe(1);
    expect(book.sites[1]!.listed).toBe(0);

    const reasons = book.unplaced.map((u) => u.reason);
    expect(reasons).toContain('NOT_A_PLACE');
    expect(reasons).toContain('NO_REGION_RECORDED');
    expect(book.placedProjects).toBe(3);
    expect(book.considered).toBe(5);
  });

  it('names an unrecognised region rather than guessing a centroid for it', () => {
    const book = buildGlobeBook([point({ id: 'x', region: 'sg' })]);
    expect(book.sites).toHaveLength(0);
    expect(book.unplaced).toEqual([
      { region: 'sg', projects: 1, listed: 0, reason: 'NO_CENTROID_IN_TABLE' },
    ]);
  });

  it('a broken market cap is UNREADABLE, never zero', () => {
    /*
     * The scar E3 fixed on `BdLead`, and it runs the same way on an API field: `Number(null)` is 0, so a
     * value that never arrived reaches the sum looking exactly like a company worth nothing. A region with no
     * readable member must report NO TOTAL, because $0 is a measurement.
     */
    const book = buildGlobeBook([
      point({ id: 'n1', region: 'eu', marketCapUsd: Number.NaN }),
      point({ id: 'n2', region: 'eu', marketCapUsd: -5 }),
      point({ id: 'n3', region: 'eu', marketCapUsd: Number.POSITIVE_INFINITY }),
    ]);
    expect(book.sites[0]!.mcapUsd).toBeNull();
    expect(book.sites[0]!.mcapUnreadable).toBe(3);
    expect(book.sites[0]!.projects, 'a count is always known').toBe(3);

    /* One readable member among broken ones sums to that member and still reports the breakage. */
    const mixed = buildGlobeBook([
      point({ id: 'm1', region: 'eu', marketCapUsd: Number.NaN }),
      point({ id: 'm2', region: 'eu', marketCapUsd: 400 }),
    ]);
    expect(mixed.sites[0]!.mcapUsd).toBe(400);
    expect(mixed.sites[0]!.mcapUnreadable).toBe(1);
  });

  it('an observed zero listing is distinct from an absence', () => {
    /* `listed: 0` means counted and none — the frame draws no corridor and says so in words. It must never
       arrive as null, which would be "nobody looked". */
    const book = buildGlobeBook([point({ id: 'z', region: 'us', listedOnLcx: false })]);
    expect(book.sites[0]!.listed).toBe(0);
    expect(book.sites[0]!.mcapUsd).not.toBeNull();
  });
});

describe('globeSites — the pin arithmetic, which is the part a GPU-less test CAN check', () => {
  it('pin height is strictly proportional to the count, with no floor', () => {
    /*
     * The whole reason the height is a reading at all. A base offset — the tempting fix for the small case —
     * would make a pin with one project 21% as tall as a pin with a hundred, and the encoding would be gone
     * while still looking like it was there.
     */
    expect(pinHeight(50, 100)).toBeCloseTo(PIN_MAX / 2, 12);
    expect(pinHeight(1, 100) * 2).toBeCloseTo(pinHeight(2, 100), 12);
    expect(pinHeight(0, 100)).toBe(0);
    expect(pinHeight(100, 100)).toBeCloseTo(PIN_MAX, 12);
    /* A degenerate maximum returns zero rather than NaN or Infinity: a NaN model matrix collapses a pin to
       the origin with no GL error at all. */
    expect(pinHeight(3, 0)).toBe(0);
  });

  it('stands a pin ON the surface, right-handed, with a normal matrix that carries +Y onto the site', () => {
    const site = REGION_SITES[1]!; // Kansas: a mid-latitude, mid-longitude case, so no term is zero by luck.
    const n = geoUnit(site.lat, site.lon);
    const h = pinHeight(7, 7);
    const { model, normalMat } = standOnNormal(n, EARTH_R + h / 2);

    /* THE BASE SITS ON THE SURFACE — to six decimals, because the matrix is a `Float32Array` and float32
       carries about seven significant digits. Asserting twelve here would be asserting the storage format
       rather than the geometry, and it failed on exactly that.
        `cylinder` spans ±h/2 about its own origin, so the centre must be
       at R + h/2 or the pin either floats (and casts a detached shadow) or is buried. */
    const centreLen = Math.hypot(model[12]!, model[13]!, model[14]!);
    expect(centreLen).toBeCloseTo(EARTH_R + h / 2, 6);
    expect(centreLen - h / 2).toBeCloseTo(EARTH_R, 6);

    const col = (i: number): [number, number, number] => [model[i * 4]!, model[i * 4 + 1]!, model[i * 4 + 2]!];
    const [t, up, b] = [col(0), col(1), col(2)];
    /* Column 1 IS the site normal — that is what makes the pin lean outward rather than stand on world up. */
    expect(up[0]).toBeCloseTo(n[0], 6);
    expect(up[1]).toBeCloseTo(n[1], 6);
    expect(up[2]).toBeCloseTo(n[2], 6);
    /* Orthonormal. */
    for (const v of [t, up, b]) expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 6);
    expect(t[0] * up[0] + t[1] * up[1] + t[2] * up[2]).toBeCloseTo(0, 6);
    expect(t[0] * b[0] + t[1] * b[1] + t[2] * b[2]).toBeCloseTo(0, 6);

    /*
     * POSITIVE DETERMINANT, which is the whole point. A left-handed basis inverts triangle winding, the
     * renderer's fixed back-face culling discards the pin, and the frame comes out with one fewer marker and
     * NO GL error — a silent missing data point, which is the worst failure this figure could have.
     */
    const det = t[0] * (up[1] * b[2] - up[2] * b[1])
      - up[0] * (t[1] * b[2] - t[2] * b[1])
      + b[0] * (t[1] * up[2] - t[2] * up[1]);
    expect(det).toBeGreaterThan(0.999);

    /*
     * THE NORMAL MATRIX IS COLUMN-MAJOR, because `lit.ts` uploads it with `uniformMatrix3fv(..., false, ...)`
     * whatever its doc comment says. Asserted as the property that matters rather than as a layout: the
     * primitive's own +Y must come out as the site normal. Read the other way round this returns `t`, and the
     * pin would be lit as though it leaned along a tangent — plausible, and wrong.
     */
    const mulColumnMajor = (m: Float32Array, v: readonly [number, number, number]): [number, number, number] => [
      m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2],
      m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2],
      m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2],
    ];
    const mapped = mulColumnMajor(normalMat, [0, 1, 0]);
    expect(mapped[0]).toBeCloseTo(n[0], 6);
    expect(mapped[1]).toBeCloseTo(n[1], 6);
    expect(mapped[2]).toBeCloseTo(n[2], 6);
  });

  it('does not produce a NaN basis at a pole', () => {
    /* No region site is polar today, but a table entry added later could be, and `cross(up, up)` is the zero
       vector — a NaN matrix that collapses the pin to the origin with a complete framebuffer and no error. */
    const { model, normalMat } = standOnNormal([0, 1, 0], EARTH_R);
    for (const v of [...model, ...normalMat]) expect(Number.isFinite(v)).toBe(true);
    expect(model[13]).toBeCloseTo(EARTH_R, 6);
  });
});

describe('globeSites — the sun, the camera and the label contrast', () => {
  it('puts the sub-solar point where the clock says', () => {
    /* 12:00 UTC on an equinox: the sun is over the prime meridian and near the equator. */
    const equinox = subSolarPoint(Date.UTC(2026, 2, 20, 12, 0, 0));
    expect(Math.abs(equinox.lon)).toBeLessThan(0.01);
    expect(Math.abs(equinox.lat)).toBeLessThan(2);

    /* Six hours later the sun has moved 90 degrees WEST. A sign error here would light Asia at Chicago's
       lunchtime, which is the one defect on this figure a reader would notice and could not name. */
    const afternoon = subSolarPoint(Date.UTC(2026, 2, 20, 18, 0, 0));
    expect(afternoon.lon).toBeCloseTo(-90, 5);

    /* Solstices, to the half-degree the approximation claims. */
    expect(subSolarPoint(Date.UTC(2026, 5, 21, 12, 0, 0)).lat).toBeGreaterThan(23.0);
    expect(subSolarPoint(Date.UTC(2026, 11, 21, 12, 0, 0)).lat).toBeLessThan(-23.0);
  });

  it('solar time follows longitude, and formats without a ragged clock', () => {
    const t = Date.UTC(2026, 2, 20, 12, 0, 0);
    expect(solarHourAt(0, t)).toBeCloseTo(12, 6);
    expect(solarHourAt(15, t)).toBeCloseTo(13, 6);
    expect(solarHourAt(-98.583, t)).toBeCloseTo(12 - 98.583 / 15, 6);
    /* Wraps rather than going negative or past 24. */
    expect(solarHourAt(-180, Date.UTC(2026, 2, 20, 1, 0, 0))).toBeCloseTo(13, 6);
    expect(formatSolarHour(5.5)).toBe('05:30');
    expect(formatSolarHour(23.999)).toBe('00:00');
  });

  it('aims the camera by the CIRCULAR mean, so a pair straddling the date line is not inverted', () => {
    /* The whole reason this is not an arithmetic mean: 170 and -170 average to 0, which points the camera at
       the exact opposite side of the planet from both sites. */
    expect(centralMeridian([170, -170])).toBeCloseTo(180, 4);
    expect(centralMeridian([9.9, -98.583])).toBeCloseTo(-44.3, 0);
    /* Antipodal vectors cancel: refused, because no single face shows both and any choice is arbitrary. */
    expect(centralMeridian([0, 180])).toBeNull();
    expect(centralMeridian([HUB.lon])).toBeCloseTo(HUB.lon, 4);
  });

  it('reports the separation the arc lift is supposed to scale with', () => {
    const eu = REGION_SITES[0]!, us = REGION_SITES[1]!;
    const dEu = separationDeg(HUB.lat, HUB.lon, eu.lat, eu.lon);
    const dUs = separationDeg(HUB.lat, HUB.lon, us.lat, us.lon);
    /* Gadheim is a few degrees from Vaduz and Kansas is most of an ocean away. `arcTube` lifts with angular
       distance, so this ordering IS the ordering of the two arcs' heights — and the frame labels the lift as
       geometry rather than as data for exactly that reason. */
    expect(dEu).toBeLessThan(5);
    expect(dUs).toBeGreaterThan(60);
    expect(separationDeg(HUB.lat, HUB.lon, HUB.lat, HUB.lon)).toBeCloseTo(0, 6);
  });

  it('the projected labels clear WCAG AA against their own backing plate', () => {
    /*
     * E6 measures its label contrast with `readPixels` because its labels lie on fogged slabs whose
     * brightness is the data. These labels float beside the geometry and carry their own opaque plate, so the
     * ratio is a property of two authored constants — which means it can be CHECKED here once instead of
     * being claimed in a comment. If somebody dims the label colour to taste, this fails.
     */
    const fg = contrastRatio(LABEL_FG, LABEL_BG);
    const dim = contrastRatio(LABEL_DIM_FG, LABEL_BG);
    expect(fg).not.toBeNull();
    expect(fg!).toBeGreaterThanOrEqual(4.5);
    expect(dim!).toBeGreaterThanOrEqual(4.5);
    /* And the helper itself is not vacuously true. */
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(contrastRatio('not a hex', '#ffffff')).toBeNull();
  });
});
