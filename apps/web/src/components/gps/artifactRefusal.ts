import { ApiError } from '@/lib/apiClient';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  A REFUSAL AN OPERATOR CAN ACT ON
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `apps/api/src/gps/artifact.ts:183` names fourteen refusal codes. Three of them are
 * the ones an operator meets, and they are not the same problem:
 *
 *   TOO_LARGE        → the file is fine, the ceiling is the ceiling; send less of it.
 *   MIME_NOT_ALLOWED → GPS does not store that kind of file at all; convert it.
 *   MIME_MISMATCH    → the file is LYING about what it is. Either an extension was
 *                      renamed (common, harmless) or the thing is not the document it
 *                      presents itself as (not harmless). Same red box as the other
 *                      two, completely different next action — so it does not get to
 *                      read like a format nuisance.
 *
 * `MIME_MISMATCH` on a red toast conveys none of that, so each refusal becomes two
 * sentences: what happened, and what to do. THE NUMBERS AND THE TYPE LIST COME FROM THE
 * SERVER — every refusal body carries `data.limits` (`routes/gpsArtifact.ts:123`), and a
 * client-side copy of a 25MB ceiling is a copy that will one day disagree with the
 * server about where the boundary is and be confidently wrong on screen.
 *
 * `apiSaid` CARRIES THE SERVER'S OWN WORDING, verbatim, alongside the house sentence.
 * The server's prose holds the specifics ("declared application/pdf but the leading
 * bytes are not application/pdf") and the house sentence holds the action; printing
 * both means nothing has to be parsed out of prose to be shown, and a refusal this
 * table has never seen still arrives with all of its information.
 *
 * MATCHING IS ON THE CODE FIRST AND THE STATUS SECOND, in the server's own order:
 * `MIME_MISMATCH` is a 415 exactly like `MIME_NOT_ALLOWED` (`routes/gpsArtifact.ts:109`),
 * so a status-first table would tell the operator to convert a file that is not what it
 * claims to be — the single most misleading thing this module could say.
 */

export interface RefusalSentence {
  /** What happened, as an operator would say it. */
  headline: string;
  /** What to do about it. */
  next: string;
  /** The API's own wording, verbatim. Shown small, under the two sentences. */
  apiSaid?: string | null;
  /** The machine code, shown small — for a bug report, not for reading. */
  code: string | null;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

/** Bytes as a human reads them. Binary units, because that is what a ceiling is set in. */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : mb.toFixed(0)} MB`;
}

/**
 * THE ONE REFUSAL THAT ARRIVES WITHOUT AN ERROR.
 *
 * A list read against an unmigrated environment does not throw — it answers 200 with
 * `[]` and `migrated: false` in the envelope (`routes/gpsArtifact.ts:180`), so an empty
 * list is a fact about the environment and not about the engagement. The surface states
 * that from the envelope, which means the sentence has to be reachable without an
 * `ApiError` to hang it on; `refusalSentence` returns this same object for the thrown
 * equivalent (`MIGRATION_PENDING`, 503), so the two paths cannot drift apart.
 */
export const STORAGE_NOT_ON_THIS_ENVIRONMENT: RefusalSentence = {
  headline: 'Document storage does not exist on this environment yet.',
  next: 'Migration 0057 has not been applied here. Nothing can be stored and nothing already stored can be listed — an empty list above is a fact about this environment, not about the engagement.',
  code: null,
};

export function refusalSentence(err: unknown, file?: { name: string; size: number }): RefusalSentence {
  if (!(err instanceof ApiError)) {
    return {
      headline: err instanceof Error && err.message ? err.message : 'The upload failed before the API answered.',
      next: 'Nothing confirms whether the bytes arrived. Reload the attached list before sending it again — a retry after a silent success stores it twice.',
      code: null,
    };
  }

  const code = err.code ?? null;
  const c = (code ?? '').toUpperCase();
  const apiSaid = err.message || null;
  const limits = rec(rec(err.data).limits);
  const maxBytes = num(limits.maxBytes);
  const allowed = strings(limits.allowedMimeTypes);
  const nameMax = num(limits.filenameMaxLength);
  const said = (headline: string, next: string): RefusalSentence => ({ headline, next, apiSaid, code });

  if (c === 'MIGRATION_PENDING' || c.includes('NOT_MIGRATED') || c === 'UNDEFINED_TABLE') {
    return { ...STORAGE_NOT_ON_THIS_ENVIRONMENT, apiSaid, code };
  }

  // BEFORE the not-allowed branch: both are 415 and the actions are opposites.
  if (c.includes('MISMATCH') || c.includes('SNIFF') || c.includes('MAGIC')) {
    return said(
      'The contents of this file are not the kind of file it says it is.',
      'Nothing was stored, and this is not a format nuisance: either the extension was renamed, or the file is not the document it presents itself as. Confirm what it is with whoever sent it before trying again.',
    );
  }

  if (c === 'TOO_LARGE' || err.status === 413) {
    const ceiling = maxBytes ? ` of ${bytes(maxBytes)}` : '';
    return said(
      file
        ? `${file.name} is ${bytes(file.size)}, which is over the ceiling${ceiling}.`
        : `That file is over the intake ceiling${ceiling}.`,
      'Nothing was stored. Send only the pages that matter, split it, or leave it in the client\'s own system and record where it lives in the evidence chase above.',
    );
  }

  if (c === 'MIME_NOT_ALLOWED' || err.status === 415) {
    return said(
      'GPS does not store that kind of file.',
      allowed && allowed.length > 0
        ? `Accepted here: ${allowed.join(', ')}. Convert it to one of those, or keep it in the client's own system.`
        : 'Convert it to a document type the intake accepts, or keep it in the client\'s own system.',
    );
  }

  if (c === 'MIME_NOT_DECLARED') {
    return said(
      'This file arrived with no type declared, so nothing could be checked about it.',
      'The browser could not tell what it is — usually a file with no extension or an unknown one. Give it its real extension and send it again; the type is checked against the bytes, so renaming a file to something it is not will be refused, not accepted.',
    );
  }

  if (c.startsWith('FILENAME')) {
    return said(
      'The filename was refused before any byte was read.',
      `Names may not contain a path separator, "..", a leading dot or control characters${nameMax ? `, and must be ${nameMax} characters or fewer` : ''}. Rename it and send it again — nothing was stored.`,
    );
  }

  if (c === 'EMPTY_BODY') {
    return said(
      'That file is empty — zero bytes reached the API.',
      'Nothing was stored. Check the file opens on your own machine before sending it: an empty file is usually a failed export or a broken download rather than a transfer problem.',
    );
  }

  if (c === 'ENGAGEMENT_NOT_FOUND') {
    return said(
      'There is no engagement with the id this page was opened with.',
      'Nothing was stored, and nothing will be until the address is right. Open the engagement from the desk list rather than editing the address bar.',
    );
  }

  if (c === 'ALREADY_DELETED') {
    return said(
      'That document was already deleted.',
      'The list is out of date rather than wrong — reload it. Note that deleted is not erased: the row records the decision, and purging the bytes is a separate act the API does not perform.',
    );
  }

  if (c === 'GRANT_INVALID' || (c === 'NOT_FOUND' && err.status === 404)) {
    return said(
      'That download link is no longer usable.',
      'Download links are single-use and short-lived by design, and an invalid one is answered identically to a document that does not exist so the answer cannot be used to probe for files. Click Download again to mint a new one.',
    );
  }

  if (c === 'GRANT_ACTOR_MISMATCH' || err.status === 403) {
    return said(
      'That download link was issued to a different principal.',
      'Links are bound to whoever minted them, so one cannot be forwarded to a colleague. Nothing was served and the attempt is in the audit record.',
    );
  }

  if (err.status === 401) {
    return said(
      'The API rejected the desk credential.',
      'Nothing was stored. Sign in again on the front door; a rejected credential is cleared automatically, so this page will send you there.',
    );
  }

  if (err.status >= 500) {
    return said(
      'The API failed while handling this document.',
      'Nothing confirms whether it was stored. Reload the attached list and look before sending it again — the server logs the error without the file\'s contents, so ask for the log rather than retrying blindly.',
    );
  }

  // UNKNOWN. The server's own sentence, unflattened — never "Upload failed".
  return {
    headline: err.message || `The API refused this document (HTTP ${err.status}).`,
    next: 'Nothing was stored. This refusal is not one this screen has a sentence for, so the API\'s own wording is shown above exactly as it arrived.',
    apiSaid: null,
    code,
  };
}
