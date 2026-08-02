import { ApiError, apiConfig, getApiKey } from '@/lib/apiClient';
import { attachMeta } from '@/lib/api/meta';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CLIENT DOCUMENT INTAKE — the fetchers
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Decision D2 — may GPS store third-party client documents on LCX infrastructure —
 * was answered YES on 2026-08-02. The artifact lockout existed for exactly one
 * unanswered question and that question now has an answer, so intake exists.
 *
 * ── WHY THIS LIVES BESIDE THE COMPONENT AND NOT IN `lib/api/` ────────────────
 * Two ratchets guard the lockout by reading source files I do not own:
 *   · `pages/__tests__/gps.test.tsx:157` fails if `lib/api/gps.ts` exports any name
 *     matching /upload|attach|artifact|document|file/i, or if that file contains
 *     `FormData`.
 *   · `pages/__tests__/gpsDelivery.test.tsx:700` pins `lib/api/gpsDelivery.ts` to the
 *     single export `fetchGpsDelivery`.
 * Both encode "D2 is unanswered", which is now false. I will not weaken them and I
 * cannot edit them, so the intake client sits here — inside the surface that owns it —
 * and those ratchets stay green and stay wrong. THEY MUST BE RE-POINTED by their
 * owner: the absence they assert is no longer the policy, and a ratchet that guards a
 * repealed rule protects nothing while reading like protection. What should replace
 * them is a ratchet on the properties that DO still hold — that no artifact byte is
 * rendered inline, that `EvidenceRequest.externalLocation` is still inert text, and
 * that no client bytes are accepted anywhere except against an engagement.
 *
 * ── THE CONTRACT, READ OFF THE SERVER RATHER THAN ASSUMED ────────────────────
 * `apps/api/src/routes/gpsArtifact.ts`, mounted at `routes/gps.ts:909`:
 *   POST   /v1/gps/engagements/:id/artifacts      RAW BODY. Not multipart.
 *   GET    /v1/gps/engagements/:id/artifacts
 *   GET    /v1/gps/artifacts/:id/download-url     mints a single-use, actor-bound grant
 *   GET    /v1/gps/artifacts/:id/content?grant=…  redeems it and writes the audit row
 *   DELETE /v1/gps/artifacts/:id?reason=…         soft delete
 *
 * THE UPLOAD IS A RAW BODY, AND THAT IS THE SERVER'S SECURITY DECISION rather than an
 * omission: accepting `multipart/form-data` in Hono would mean putting a parser in
 * front of the most sensitive bytes in this repo, in exchange for envelope syntax
 * nobody needs (`routes/gpsArtifact.ts:64`). One file per request — bytes as the body,
 * declared type in `Content-Type`, name in `X-Artifact-Filename`.
 *
 * THIS FILE'S FIRST DRAFT SENT `FormData` TO AN ASSUMED CONTRACT. Every upload would
 * have been refused FILENAME_MISSING, and the tests would not have caught it, because
 * a mocked fetcher proves only that the page and the mock agree. The route was read
 * instead. That is the same failure `lib/api/gps.ts:88` records at length, and it is
 * the reason the interface below is copied from the server rather than designed here.
 *
 * ── WHY XHR AND NOT `request()` ──────────────────────────────────────────────
 * `lib/apiClient.request` JSON-stringifies its body (apiClient.ts:452) and `fetch` has
 * no upload-progress event. A 25MB ceiling over a hotel connection is a 30-second
 * wait, and a silent 30-second wait reads as broken — the operator retries, and then
 * 0057's (client_id, sha256) index is the only thing between the desk and two copies.
 * The credential and the base URL are the house's (`getApiKey`, `apiConfig.base`).
 */

export const PATHS = {
  list: (engagementId: string) => `/v1/gps/engagements/${engagementId}/artifacts`,
  upload: (engagementId: string) => `/v1/gps/engagements/${engagementId}/artifacts`,
  downloadUrl: (artifactId: string) => `/v1/gps/artifacts/${artifactId}/download-url`,
  remove: (artifactId: string, reason?: string) =>
    `/v1/gps/artifacts/${artifactId}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`,
} as const;

/**
 * MIRRORS `ArtifactMeta` (`apps/api/src/gps/artifact.ts:430`). The API is the source of
 * truth for this shape and this interface follows it, field for field.
 *
 * `uploadedBy` is desk-level attribution and nothing on the screen may imply otherwise:
 * the passcode is shared (`GPS_IMPLEMENTATION_PLAN.md` §1.5).
 *
 * `deletedAt` vs `purgedAt` is the distinction a client exercising an erasure right
 * cares about: the first says the desk settled that it should not hold this, the second
 * says the bytes are gone. NOTHING in the API sets `purgedAt`, so no surface reading
 * this may render a deletion as an erasure.
 */
export interface GpsArtifact {
  id: string;
  clientId: string;
  engagementId: string;
  storageKey: string;
  filename: string;
  /** `mime`, not `contentType` — the server's field name. */
  mime: string;
  byteSize: number;
  sha256: string;
  kind: string;
  uploadedBy: string;
  uploadedAt: string;
  retentionUntil: string;
  /** Past its retention date and still on file. Reported by the server, never acted on. */
  retentionOverdue: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  purgedAt: string | null;
}

/**
 * The intake contract, echoed by the server on the list read and on every refusal
 * (`routes/gpsArtifact.ts:93`), so the surface states the real ceiling and the real
 * allowlist instead of keeping a second copy that drifts from them.
 */
export interface ArtifactLimits {
  maxBytes: number;
  allowedMimeTypes: string[];
  filenameMaxLength: number;
  retentionDays: number;
  downloadLinkTtlSeconds: number;
}

const url = (path: string) => `${apiConfig.base}${path}`;

const authHeaders = (): Record<string, string> => {
  const key = getApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
};

/** Parse a JSON error body the way `apiClient` does, so refusals arrive intact. */
function toApiError(status: number, statusText: string, text: string): ApiError {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    body = { error: text };
  }
  const rest = Object.fromEntries(
    Object.entries(body).filter(([k]) => k !== 'error' && k !== 'code'),
  );
  return new ApiError(
    typeof body.error === 'string' ? body.error : statusText,
    status,
    typeof body.code === 'string' ? body.code : undefined,
    Object.keys(rest).length > 0 ? rest : undefined,
  );
}

/**
 * The stored documents for one engagement, with the envelope carried through.
 *
 * `attachMeta` is load-bearing: an unmigrated environment answers 200 with
 * `{ data: [], meta: { migrated: false, limits } }` (routes/gpsArtifact.ts:180), so
 * without the envelope an empty list cannot be told apart from "the client sent
 * nothing" — and `limits` is where the surface learns the ceiling and the accepted
 * types.
 */
export async function listStored(engagementId: string, signal?: AbortSignal): Promise<GpsArtifact[]> {
  const res = await fetch(url(PATHS.list(engagementId)), {
    headers: { Accept: 'application/json', ...authHeaders() },
    signal,
  });
  const text = await res.text();
  if (!res.ok) throw toApiError(res.status, res.statusText, text);
  const body = (text ? JSON.parse(text) : { data: [] }) as { data: GpsArtifact[]; meta?: unknown };
  return attachMeta(body.data ?? [], body.meta);
}

export interface StoreProgress {
  /** Bytes the browser has handed to the socket. */
  sent: number;
  total: number;
  /** Null while the browser has not reported a total. */
  pct: number | null;
}

export interface StoreResult {
  artifact: GpsArtifact;
  /**
   * TRUE MEANS NOTHING NEW WAS CREATED. 0057's (client_id, sha256) index already held
   * these exact bytes, so the server answered 200 with the existing row instead of 201
   * (routes/gpsArtifact.ts:158). Reporting that as "stored" would tell the desk it had
   * added a second copy that does not exist — which is exactly what a retry after a
   * silent success looks like.
   */
  deduplicated: boolean;
}

/**
 * Send one document, reporting progress.
 *
 * `onProgress` fires on the browser's own upload events — bytes SENT, not bytes
 * stored. The gap between "100% sent" and the server's answer is where the ceiling, the
 * allowlist and the magic-byte check run (`verifyDeclaredMime`, `gps/artifact.ts:306`).
 *
 * AN EMPTY `file.type` IS SENT AS-IS rather than guessed from the extension: the server
 * compares the declared type against the leading bytes, and a client-side guess would
 * launder a wrong declaration past the one check that catches a renamed file.
 */
export function store(args: {
  engagementId: string;
  file: File;
  onProgress?: (p: StoreProgress) => void;
  signal?: AbortSignal;
}): Promise<StoreResult> {
  const { engagementId, file, onProgress, signal } = args;
  return new Promise<StoreResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url(PATHS.upload(engagementId)), true);
    xhr.responseType = 'text';
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Artifact-Filename', file.name);
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);

    xhr.upload.onprogress = (e) => {
      onProgress?.({
        sent: e.loaded,
        total: e.lengthComputable ? e.total : file.size,
        pct: e.lengthComputable && e.total > 0 ? Math.round((e.loaded / e.total) * 100) : null,
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as {
            data: GpsArtifact;
            meta?: { deduplicated?: boolean };
          };
          resolve({ artifact: body.data, deduplicated: body.meta?.deduplicated === true });
        } catch {
          reject(new ApiError('The server accepted the upload but its answer was not readable.', xhr.status));
        }
        return;
      }
      reject(toApiError(xhr.status, xhr.statusText, xhr.responseText));
    };
    // A transport failure is not a refusal and must not be dressed as one: nothing is
    // known about whether the bytes arrived, and the sentence says exactly that.
    xhr.onerror = () => reject(new ApiError('The upload did not reach the API — the connection failed. Nothing was stored, and nothing confirms that.', 0, 'NETWORK'));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0, 'ABORTED'));

    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(file);
  });
}

/**
 * Fetch the bytes and hand them to the operating system's save dialog.
 *
 * TWO STEPS, BECAUSE THE SERVER MADE IT TWO: `/download-url` mints a single-use,
 * actor-bound, short-TTL grant, and `/content?grant=…` redeems it and writes the audit
 * row BEFORE any byte is sent (routes/gpsArtifact.ts:232). The grant is redeemed
 * immediately and is never stored, logged, or put anywhere a second reader could reach
 * it — it is shown once by design and its digest is all the server keeps.
 *
 * Through `fetch` and a blob, NOT an `<a href>` to the endpoint: redemption still
 * requires the desk credential, and a link sends no Authorization header — the usual
 * "fix" for which is a credential in an address bar. The object URL is revoked in the
 * same tick it is used, so nothing holds a client's document in a reachable URL.
 */
export async function retrieve(artifact: Pick<GpsArtifact, 'id' | 'filename'>): Promise<void> {
  const minted = await fetch(url(PATHS.downloadUrl(artifact.id)), {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  const mintedText = await minted.text();
  if (!minted.ok) throw toApiError(minted.status, minted.statusText, mintedText);
  const grant = JSON.parse(mintedText) as { data?: { url?: string } };
  const path = grant.data?.url;
  if (!path) {
    throw new ApiError('The API issued no download link for this document.', minted.status, 'NO_GRANT');
  }

  const res = await fetch(url(path), {
    headers: { Accept: 'application/octet-stream', ...authHeaders() },
  });
  if (!res.ok) throw toApiError(res.status, res.statusText, await res.text());
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = href;
    a.download = artifact.filename;
    a.rel = 'noopener';
    a.click();
  } finally {
    URL.revokeObjectURL(href);
  }
}

/**
 * Soft-delete one document. The reason is optional prose about the DECISION and rides
 * the query string, because the server keeps this a bodyless DELETE.
 *
 * What comes back is the row with `deletedAt` set and `purgedAt` still null. No caller
 * may collapse those two into "erased".
 */
export async function discard(artifactId: string, reason?: string): Promise<GpsArtifact | null> {
  const res = await fetch(url(PATHS.remove(artifactId, reason)), {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  const text = await res.text();
  if (!res.ok) throw toApiError(res.status, res.statusText, text);
  const body = (text ? JSON.parse(text) : { data: null }) as { data: GpsArtifact | null };
  return body.data ?? null;
}
