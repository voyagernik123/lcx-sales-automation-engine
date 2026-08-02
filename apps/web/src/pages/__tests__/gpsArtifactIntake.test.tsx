import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
/* The fixture is composed by the real engine, for the reason `gpsDelivery.test.tsx`
   states at length: a hand-written DeliveryResponse literal is how a page and its test
   end up agreeing with each other about a payload no server ever sent. */
import { composeDeliveryResponse } from '../../../../../packages/shared/src/gps/deliveryView';
import { getOffer } from '../../../../../packages/shared/src/gps/catalogue';
import { GpsDelivery } from '../GpsDelivery';
import { ApiError } from '@/lib/apiClient';
import { attachMeta } from '@/lib/api/meta';
import * as api from '@/lib/api/gpsDelivery';
import * as intake from '@/components/gps/artifactIntakeApi';
import { refusalSentence } from '@/components/gps/artifactRefusal';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CLIENT DOCUMENT INTAKE — the surface D2 unlocked
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * D2 was answered YES on 2026-08-02, so GPS stores client documents. Every assertion
 * here fails without that surface, and the ones worth naming are the ones that guard
 * how it behaves when things go wrong, because that is where an intake surface is
 * either usable or a source of duplicate uploads and silent losses:
 *
 *  · PROGRESS IS VISIBLE, AND "ALL BYTES SENT" IS NOT "STORED". The gap between the
 *    last byte and the server's answer is where the size, type and byte-sniff checks
 *    run. A bar that sits at 100% reading as success is how an operator closes the
 *    panel and never sees the refusal.
 *  · REFUSALS ARE SENTENCES. `ARTIFACT_CONTENT_MISMATCH` is not an instruction. Each
 *    of the three real refusals must say what happened AND what to do — and the
 *    byte-mismatch one must not read as a format nuisance, because a file lying about
 *    its type is a different problem from a file that is too big.
 *  · AN EMPTY LIST IS NOT "NOTHING WAS RECEIVED".
 *  · NOTHING RENDERS A DOCUMENT'S CONTENTS. Storing is authorised; previewing a
 *    client's confidential material inside an authenticated session was not.
 *
 * The network module is mocked; `artifactRefusal.ts` is NOT — the sentence mapping is
 * the behaviour under test, so mocking it would delete the test.
 */

vi.mock('@/lib/api/gpsDelivery', () => ({ fetchGpsDelivery: vi.fn() }));
vi.mock('@/components/gps/artifactIntakeApi', () => ({
  listStored: vi.fn(),
  store: vi.fn(),
  retrieve: vi.fn(),
  discard: vi.fn(),
}));

const OFFER_KEY = 'mica_whitepaper' as const;
const ASOF = '2026-08-01T12:00:00.000Z';

const payload = () => composeDeliveryResponse({
  engagement: {
    id: 'e-1', clientId: 'c-1', clientName: 'Probe Chain',
    offerKey: OFFER_KEY, status: 'in_delivery', offer: getOffer(OFFER_KEY),
  },
  asOf: ASOF,
});

/**
 * A stored row, in the shape the SERVER returns (`ArtifactMeta`,
 * apps/api/src/gps/artifact.ts:430) — `mime` not `contentType`, `retentionUntil` and
 * `retentionOverdue` computed server-side, `purgedAt` separate from `deletedAt`.
 */
const stored = (over: Partial<intake.GpsArtifact> = {}): intake.GpsArtifact => ({
  id: 'a-1',
  clientId: 'c-1',
  engagementId: 'e-1',
  storageKey: 'gps/c-1/a-1.pdf',
  filename: 'probe-chain-cap-table.pdf',
  mime: 'application/pdf',
  byteSize: 2_411_724,
  sha256: 'd0d1f2a3b4c5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f',
  kind: 'client_source',
  uploadedBy: 'desk',
  uploadedAt: '2026-08-02T09:14:00.000Z',
  retentionUntil: '2028-08-01T09:14:00.000Z',
  retentionOverdue: false,
  deletedAt: null,
  deletedBy: null,
  purgedAt: null,
  ...over,
});

/** The server's real refusal envelope: `data.limits`, echoed on every refusal. */
const LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  allowedMimeTypes: ['application/pdf', 'image/png', 'text/csv'],
  filenameMaxLength: 200,
  retentionDays: 730,
  downloadLinkTtlSeconds: 120,
};

const kept = (artifact = stored(), deduplicated = false): intake.StoreResult =>
  ({ artifact, deduplicated });

/**
 * A file that REPORTS a realistic size without allocating one.
 *
 * `size` is overridden rather than filled with 2.4MB of zeroes: the refusal sentence
 * quotes `file.size` back at the operator, so the number has to be a real megabyte
 * figure — a 4KB fixture would have made the "too large" test pass while asserting a
 * sentence no operator will ever see.
 */
const file = (name = 'probe-chain-cap-table.pdf', size = 2_411_724, type = 'application/pdf') => {
  const f = new File([new Uint8Array(8)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

async function mount(rows: intake.GpsArtifact[] = []) {
  vi.mocked(api.fetchGpsDelivery).mockResolvedValue(payload());
  vi.mocked(intake.listStored).mockResolvedValue(attachMeta(rows, { migrated: true, limits: LIMITS }));
  render(
    <MemoryRouter initialEntries={['/gps/delivery?engagementId=e-1']}>
      <GpsDelivery />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId('gps-artifact-intake')).toBeTruthy());
  await waitFor(() => expect(intake.listStored).toHaveBeenCalledWith('e-1'));
}

const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

beforeEach(() => { vi.clearAllMocks(); });

/* ── 1 · THE SURFACE EXISTS, ON THE ENGAGEMENT ──────────────────────────────── */

describe('GPS delivery — the intake surface', () => {
  it('mounts inside the documents section and uploads against THIS engagement id', async () => {
    vi.mocked(intake.store).mockResolvedValue(kept());
    await mount();

    const docs = document.querySelector<HTMLElement>('section[aria-labelledby="documents-h"]')!;
    expect(within(docs).getByTestId('gps-artifact-intake')).toBeTruthy();

    await userEvent.upload(fileInput(), file());
    await waitFor(() => expect(intake.store).toHaveBeenCalled());
    const arg = vi.mocked(intake.store).mock.calls[0]![0];
    // The engagement id comes from the URL this page was opened with — a document
    // stored against the wrong engagement is a document in front of the wrong client.
    expect(arg.engagementId).toBe('e-1');
    expect(arg.file.name).toBe('probe-chain-cap-table.pdf');
    // And the list is re-read, so the row appears without a manual refresh.
    await waitFor(() => expect(intake.listStored).toHaveBeenCalledTimes(2));
  });

  it('shows bytes sent while it uploads, and does NOT call a full bar success', async () => {
    /* The mock hands back a promise the TEST resolves, so the assertions run while the
       upload is genuinely in flight rather than after it. */
    let settle: (r: intake.StoreResult) => void = () => {};
    let report: ((p: intake.StoreProgress) => void) | undefined;
    vi.mocked(intake.store).mockImplementation((args) => {
      report = args.onProgress;
      return new Promise<intake.StoreResult>((resolve) => { settle = resolve; });
    });
    await mount();

    await userEvent.upload(fileInput(), file());
    await waitFor(() => expect(report).toBeTypeOf('function'));

    act(() => { report!({ sent: 1_205_862, total: 2_411_724, pct: 50 }); });
    const bar = screen.getByTestId('gps-artifact-progress');
    expect(bar.textContent).toMatch(/1\.1 MB of 2\.3 MB sent · 50%/);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    expect(bar.textContent).toMatch(/not a storage confirmation/i);

    // Every byte out, server silent. The sentence must change, and must not claim it
    // is stored: the checks that refuse it run in exactly this window.
    act(() => { report!({ sent: 2_411_724, total: 2_411_724, pct: 100 }); });
    expect(screen.getByTestId('gps-artifact-progress').textContent)
      .toMatch(/All bytes sent\. The API has NOT answered yet/);
    expect(screen.getByTestId('gps-artifact-progress').textContent)
      .toMatch(/Nothing is stored until it does/);

    await act(async () => { settle(kept()); });
    await waitFor(() => expect(screen.queryByTestId('gps-artifact-progress')).toBeNull());
    expect(screen.getByText(/stored — 2\.3 MB/)).toBeTruthy();
  });

  it('states the ceiling, the accepted types and the retention period FROM the server', async () => {
    await mount();
    const docs = document.querySelector<HTMLElement>('section[aria-labelledby="documents-h"]')!;
    // Off `meta.limits`, so the boundary on screen cannot disagree with the boundary
    // the server enforces. A hardcoded "25 MB" here would survive the server changing.
    expect(docs.textContent).toMatch(/Up to 25 MB; 3 accepted types; retained 730 days/);
    expect(fileInput().getAttribute('accept')).toBe('application/pdf,image/png,text/csv');
  });

  it('does not call a deduplicated upload "stored" — nothing new was created', async () => {
    /* 0057's (client_id, sha256) index makes the server answer 200 with the row it
       already had (routes/gpsArtifact.ts:158). Calling that "stored" tells the desk it
       now holds two copies, which is exactly what a retry after a slow upload looks
       like — the case the progress bar exists to prevent people causing. */
    vi.mocked(intake.store).mockResolvedValue(kept(stored(), true));
    await mount();
    await userEvent.upload(fileInput(), file());
    const note = await waitFor(() => screen.getByText(/Nothing new was stored/));
    expect(note.textContent).toMatch(/already on file for this client as probe-chain-cap-table\.pdf/);
    expect(note.textContent).toMatch(/The list below is unchanged/);
  });
});

/* ── 2 · THE THREE REAL REFUSALS, AS SENTENCES ──────────────────────────────── */

describe('GPS delivery — refusals an operator can act on', () => {
  const upload = async (err: ApiError, f = file()) => {
    vi.mocked(intake.store).mockRejectedValue(err);
    await mount();
    await userEvent.upload(fileInput(), f);
    return waitFor(() => screen.getByTestId('gps-artifact-refusal'));
  };

  it('too large — names the file, its size and the server\'s ceiling, not the code', async () => {
    /* The server's own prose here is "the file exceeds the 26214400 byte ceiling"
       (gps/artifact.ts:373). A raw byte count is not a sentence an operator can act on,
       so the headline is composed from `file.size` and `data.limits.maxBytes`. */
    const box = await upload(
      new ApiError('the file exceeds the 26214400 byte ceiling', 413, 'TOO_LARGE', { limits: LIMITS }),
    );
    expect(box.textContent).toMatch(/probe-chain-cap-table\.pdf is 2\.3 MB, which is over the ceiling of 25 MB/);
    expect(box.textContent).toMatch(/Nothing was stored/);
    // The code is present for a bug report and is NOT the message.
    expect(box.textContent).toMatch(/TOO_LARGE/);
    expect(box.querySelector('p')!.textContent).not.toMatch(/TOO_LARGE/);
  });

  it('wrong type — names what was sent and lists what the server accepts', async () => {
    const box = await upload(new ApiError(
      "content type 'application/zip' is not accepted; allowed: application/pdf, image/png, text/csv",
      415, 'MIME_NOT_ALLOWED', { limits: LIMITS },
    ));
    expect(box.textContent).toMatch(/GPS does not store that kind of file/);
    // The accepted list is the SERVER's, off `data.limits`, not a copy kept on this side.
    expect(box.textContent).toMatch(/Accepted here: application\/pdf, image\/png, text\/csv/);
    // And the server's own wording survives, which is where the rejected type is named.
    expect(box.textContent).toMatch(/content type 'application\/zip' is not accepted/);
  });

  it('bytes do not match the declared type — reads as a warning, not as a format nuisance', async () => {
    /* MIME_MISMATCH is a 415, exactly like MIME_NOT_ALLOWED (routes/gpsArtifact.ts:109).
       A status-first table would tell the operator to CONVERT a file that is not what it
       claims to be, which is the most misleading thing this surface could say — so the
       code is matched before the status, and this test is what holds that order. */
    const box = await upload(new ApiError(
      'declared application/pdf but the leading bytes are not application/pdf',
      415, 'MIME_MISMATCH', { limits: LIMITS },
    ));
    expect(box.textContent).toMatch(/contents of this file are not the kind of file it says it is/);
    expect(box.textContent).toMatch(/extension was renamed/);
    expect(box.textContent).toMatch(/Confirm what it is with whoever sent it/);
    expect(box.textContent).toMatch(/declared application\/pdf but the leading bytes are not/);
    // It must NOT read as the convert-it advice that MIME_NOT_ALLOWED earns.
    expect(box.textContent).not.toMatch(/Accepted here/);
  });

  it('an unknown code keeps the API\'s own wording instead of flattening it', async () => {
    const box = await upload(new ApiError('The engagement is closed and takes no further documents.', 409, 'ENGAGEMENT_CLOSED'));
    expect(box.textContent).toMatch(/The engagement is closed and takes no further documents\./);
  });

  it('a transport failure is not dressed as a refusal', () => {
    const r = refusalSentence(new TypeError('Failed to fetch'));
    expect(r.headline).toMatch(/Failed to fetch/);
    expect(r.next).toMatch(/Nothing confirms whether the bytes arrived/);
    expect(r.next).toMatch(/stores it twice/);
  });
});

/* ── 3 · WHAT IS ATTACHED: READ, DOWNLOAD, DELETE ───────────────────────────── */

describe('GPS delivery — the attached list', () => {
  it('lists the document with who recorded it, when, its size and its hash', async () => {
    await mount([stored()]);
    const docs = document.querySelector<HTMLElement>('section[aria-labelledby="documents-h"]')!;
    expect(docs.textContent).toMatch(/probe-chain-cap-table\.pdf/);
    expect(docs.textContent).toMatch(/application\/pdf/);
    expect(docs.textContent).toMatch(/2\.3 MB/);
    expect(docs.textContent).toMatch(/2026-08-02T09:14:00\.000Z/);
    expect(docs.textContent).toMatch(/d0d1f2a3b4c5e6f7…/);
    // Desk-level attribution is stated, because the passcode is shared and the row is
    // not proof of WHO (GPS_IMPLEMENTATION_PLAN §1.5).
    expect(docs.textContent).toMatch(/Access is desk-level, not per-person/);
    // Retention is the server's computed date, printed rather than implied.
    expect(docs.textContent).toMatch(/retained until 2028-08-01/);
  });

  it('never renders a document\'s contents — no preview, no embed, no thumbnail', async () => {
    await mount([stored()]);
    const docs = document.querySelector<HTMLElement>('section[aria-labelledby="documents-h"]')!;
    expect(docs.querySelectorAll('img, iframe, embed, object, video')).toHaveLength(0);
    expect(docs.querySelectorAll('a, [href]')).toHaveLength(0);
  });

  it('downloads through the fetcher, which carries the desk credential', async () => {
    vi.mocked(intake.retrieve).mockResolvedValue(undefined);
    await mount([stored()]);
    await userEvent.click(screen.getByRole('button', { name: /download/i }));
    await waitFor(() => expect(intake.retrieve).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' })));
  });

  it('deletes only after a second, explicit confirmation', async () => {
    vi.mocked(intake.discard).mockResolvedValue(stored({ deletedAt: '2026-08-02T10:00:00.000Z', deletedBy: 'desk' }));
    await mount([stored()]);

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    // One click arms it and deletes nothing: the row is a client's document.
    expect(intake.discard).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    await waitFor(() => expect(intake.discard).toHaveBeenCalledWith('a-1'));
    /* DELETED IS NOT ERASED. 0057 separates `deleted_at` from `purged_at` and nothing
       in the API sets the second (gps/artifact.ts:450), so a desk that reads this as an
       answer to an erasure request has been misled by the screen. */
    const done = await waitFor(() => screen.getByText(/is deleted from the desk's record/));
    expect(done.textContent).toMatch(/bytes are NOT yet purged/);
    expect(done.textContent).toMatch(/not an answer to an erasure request/);
  });

  it('an empty list says what it is a statement about, and it is not "nothing was received"', async () => {
    await mount([]);
    const docs = document.querySelector<HTMLElement>('section[aria-labelledby="documents-h"]')!;
    expect(docs.textContent).toMatch(/No document is stored against this engagement/);
    expect(docs.textContent).toMatch(/not\s+about the client/);
    expect(docs.textContent).not.toMatch(/all clear|nothing outstanding/i);
  });

  it('an unmigrated environment says so from the ENVELOPE, which does not throw', async () => {
    /* This is the trap the whole `meta` carrier exists for: the read succeeds, answers
       `[]`, and declares `migrated: false`. Without reading the envelope the panel would
       render "no document is stored against this engagement" — a claim about the client
       made from a fact about the environment. */
    vi.mocked(api.fetchGpsDelivery).mockResolvedValue(payload());
    vi.mocked(intake.listStored).mockResolvedValue(attachMeta([], { migrated: false }));
    render(
      <MemoryRouter initialEntries={['/gps/delivery?engagementId=e-1']}>
        <GpsDelivery />
      </MemoryRouter>,
    );
    const box = await waitFor(() => screen.getByTestId('gps-artifact-refusal'));
    expect(box.textContent).toMatch(/Document storage does not exist on this environment yet/);
    expect(box.textContent).toMatch(/an empty list above is a fact about this environment/);
  });

  it('a list read that fails is a stated refusal, never an empty list', async () => {
    vi.mocked(api.fetchGpsDelivery).mockResolvedValue(payload());
    vi.mocked(intake.listStored).mockRejectedValue(
      new ApiError('relation "gps_artifact" does not exist', 500, 'UNDEFINED_TABLE'),
    );
    render(
      <MemoryRouter initialEntries={['/gps/delivery?engagementId=e-1']}>
        <GpsDelivery />
      </MemoryRouter>,
    );
    const box = await waitFor(() => screen.getByTestId('gps-artifact-refusal'));
    expect(box.textContent).toMatch(/Document storage does not exist on this environment yet/);
    expect(box.textContent).toMatch(/an empty list above is a fact about this environment/);
    expect(screen.queryByText(/No document is stored against this engagement/)).toBeNull();
  });
});
