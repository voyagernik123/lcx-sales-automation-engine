import { responseMeta } from '@/lib/api/meta';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  IS THERE A LEGAL POSITION ON FILE FOR THIS JURISDICTION?
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The quote gate became ADVISORY on 2026-08-02 (owner's decision). Before that,
 * `gps_jurisdiction_profile` holding no human-entered position meant every quote in
 * every jurisdiction was REFUSED — the perimeter guard was load-bearing and nothing
 * got through. It now lets everything through, runs anyway, and records its verdict.
 *
 * That trade has exactly one thing on the other side of it: the sentence stamped on
 * the quote saying the number is not legally cleared. THIS FILE DECIDES WHEN THAT
 * SENTENCE IS PRINTED, so its default direction is the whole safeguard:
 *
 *   AN ABSENT FIELD IS READ AS "NO POSITION ON FILE".
 *
 * Not as "unknown, so say nothing". A deploy where the API stops sending
 * `legalPositionOnFile`, a payload that lost its envelope to a structural clone, a
 * route nobody remembered to thread it through — every one of those must produce a
 * stamped page, because the alternative is an unstamped price landing in front of a
 * client on the strength of a field that went missing. The only way to remove the
 * stamp is for something to affirmatively say `legalPositionOnFile: true`.
 *
 * WHAT THE SERVER SENDS: `perimeterStamp` (api/src/gps/perimeterGuard.ts:557) spreads
 * three FLAT keys — `legalPositionOnFile`, `legalPositionGateCode`,
 * `legalPositionNotice` — into every quote, proposal and engagement response, on the
 * allowed path as well as the refused one, plus `advisory` on the clearance. Flat and
 * plainly named on purpose: a nested key is one refactor away from being silently
 * absent, and an absent key here would render as a proposal that looks cleared.
 *
 * WHERE IT LOOKS, and why it looks in more than one place: this surface must not be a
 * second place the answer can be dropped. `perimeterClearanceFor` publishes a flat
 * `perimeterSource`
 * (api/src/gps/conflict.ts:474) while `POST /v1/gps/quote` nests it as
 * `meta.perimeter.source` (routes/gps.ts:331) — the same fact, two shapes, already,
 * today. So every candidate object below is searched for both spellings, and the
 * pre-existing signal (`perimeterSource === 'compiled_placeholder'`, which means no
 * human has entered a position) is honoured on its own. That makes the stamp correct
 * against the API AS IT IS DEPLOYED RIGHT NOW, before the new field lands, rather
 * than correct only after a coordinated release.
 *
 * `compiled_placeholder` WINS OVER A `true`. If one read says a position is on file
 * and another says the perimeter came from the compiled placeholders, the compiled
 * placeholders are the fact: they are expired on arrival and authorise nothing
 * (`lib/api/meta.ts:252`). Two disagreeing sources resolve to the unflattering one.
 */

export type LegalPositionBasis =
  /** Something said `legalPositionOnFile: true` and nothing contradicted it. */
  | 'on_file'
  /** Something said `legalPositionOnFile: false`. */
  | 'stated_absent'
  /** The perimeter behind this answer is compiled placeholder rows, not a position. */
  | 'compiled_placeholder'
  /** No read carried the field at all. Treated as absent — see the docblock. */
  | 'field_absent';

export interface LegalPositionReading {
  /** True ONLY when a read affirmatively said so. Never inferred from silence. */
  onFile: boolean;
  /** The jurisdiction the reading is about, or null when nothing named one. */
  jurisdiction: string | null;
  basis: LegalPositionBasis;
  /** `meta.perimeter.source` / `perimeterSource`, verbatim, when a read carried it. */
  perimeterSource: string | null;
  /**
   * `legalPositionNotice` — THE SERVER'S OWN SENTENCE, printed verbatim when present.
   *
   * `perimeterStamp` (api/src/gps/perimeterGuard.ts:557) puts three flat keys on every
   * quote, proposal and engagement response, and this is the one meant to be read by a
   * human. Printing it rather than paraphrasing it is the house rule for every carried
   * sentence in this compartment (`chase.referenceNotice`, `acceptance.gateMechanism`):
   * the surface cannot drift from the guard's wording, and the wording changes in one
   * place. Null until the perimeter owner spreads the stamp into the routes, which is
   * why the component has its own sentences and treats this as an addition.
   */
  notice: string | null;
  /** `legalPositionGateCode` — `perimeter_stale` today. Null when a position is on file. */
  gateCode: string | null;
  /**
   * `advisory: true` means the gate REFUSED for want of a position and the act was let
   * through anyway. It is the difference between "nobody checked" and "the check ran,
   * failed, and was overridden by policy", and only the second is what the desk agreed
   * to on 2026-08-02.
   */
  advisory: boolean;
}

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/**
 * The objects worth searching for one value: the payload, the envelope, and the two
 * sub-objects the API nests perimeter facts under. One level deep, deliberately — a
 * recursive walk would find `legalPositionOnFile` on some unrelated nested row and
 * answer a question about the wrong jurisdiction.
 */
function candidates(source: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => { const r = asRecord(v); if (r) out.push(r); };
  push(source);
  push(responseMeta(source));
  for (const base of [...out]) {
    push(base.perimeter);
    push(base.quoteGate);
    push(base.legalPosition);
  }
  return out;
}

/**
 * Read the state of the legal position across every payload a surface is holding.
 *
 * `opts.jurisdiction` is what the SCREEN knows (the client's jurisdiction field, free
 * text a human typed — `0047_gps.sql:67`). It is used only when no read named one,
 * because a jurisdiction the server evaluated against beats a jurisdiction the screen
 * inferred from a dropdown.
 */
export function readLegalPosition(
  sources: readonly unknown[],
  opts: { jurisdiction?: string | null } = {},
): LegalPositionReading {
  let stated: boolean | undefined;
  let placeholder = false;
  let perimeterSource: string | null = null;
  let jurisdiction: string | undefined;
  let notice: string | undefined;
  let gateCode: string | undefined;
  let advisory = false;

  for (const source of sources) {
    for (const c of candidates(source)) {
      const flag = c.legalPositionOnFile;
      if (typeof flag === 'boolean') {
        // A single `false` anywhere is decisive: this is a one-way ratchet towards
        // printing the stamp, so `false` is never overwritten by a later `true`.
        stated = stated === false ? false : flag;
      }
      const src = str(c.perimeterSource) ?? str(c.source);
      if (src) {
        perimeterSource ??= src;
        if (src === 'compiled_placeholder') placeholder = true;
      }
      jurisdiction ??= str(c.jurisdiction) ?? str(c.evaluatedFor);
      notice ??= str(c.legalPositionNotice);
      gateCode ??= str(c.legalPositionGateCode);
      if (c.advisory === true) advisory = true;
    }
  }

  const resolved = jurisdiction ?? str(opts.jurisdiction) ?? null;
  const carried = { perimeterSource, notice: notice ?? null, gateCode: gateCode ?? null, advisory };

  if (placeholder) {
    return { onFile: false, jurisdiction: resolved, basis: 'compiled_placeholder', ...carried };
  }
  if (stated === true) {
    return { onFile: true, jurisdiction: resolved, basis: 'on_file', ...carried };
  }
  return {
    onFile: false,
    jurisdiction: resolved,
    basis: stated === false ? 'stated_absent' : 'field_absent',
    ...carried,
  };
}
