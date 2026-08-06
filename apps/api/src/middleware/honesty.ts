import { createMiddleware } from 'hono/factory';
import {
  DOCTRINE_CEILING_EXEMPTIONS,
  MAX_PAYLOAD_DEPTH,
  NO_COMPARTMENT,
  ceilingFieldVerdict,
  payloadTooDeepRefusal,
  walkHonestyCeiling,
  workspaceForApiPath,
  type CeilingExemption,
  type CeilingExemptionRule,
  type CeilingOptions,
  type CeilingRefusal,
  type CeilingScope,
} from '@lcx/shared';

/**
 * honestyCeiling() — the doctrine's field-name ban, moved off one browser module and into
 * the API, per compartment.
 *
 * ── WHAT WAS TRUE BEFORE THIS FILE, WHICH IS THE WHOLE REASON FOR IT ──────────
 * `assertHonestPayloadAll` (`packages/shared/src/marketing/observation.ts`) is a careful,
 * well-tested walker that returns EVERY forbidden metric field name a payload carries. Its
 * only production caller was `apps/web/src/lib/api/marketing.ts`, a BROWSER file, whose own
 * comment records that before that it had ZERO. So "absent data refuses, and no forbidden
 * metric field name reaches a human" was enforced for whoever happened to import one web
 * helper, on one compartment, across 76 pages and 223 API files. A control that depends on
 * which client you use is not a control.
 *
 * ── IT IS EXPORTED READY TO MOUNT AND IS DELIBERATELY NOT MOUNTED ─────────────
 * `app.ts` does not reference this file. That is not an oversight and it is not a TODO: the
 * mount is the dangerous part. `app.use('*', honestyCeiling())` sits in front of
 * `GET /v1/notifications/stream`, which is Server-Sent Events — the notification bell for
 * every operator — and a middleware that buffered or re-serialised that response would take
 * it down in production with no test locally able to tell. So the enumeration of every
 * non-JSON surface is in this file as DATA (`NON_JSON_RESPONSE_SURFACES`), pinned by
 * `__tests__/honesty.test.ts` against the route source, and the lead mounts it after reading
 * that list. Until then the honest sentence is "the ceiling is available server-side", not
 * "the ceiling is enforced platform-wide".
 *
 * ── THE GATE IS THE RESPONSE CONTENT-TYPE. NOT THE PATH, NOT THE BODY ────────
 * `isJsonResponse(c.res.headers.get('content-type'))` decides, and nothing else. A path
 * allowlist would rot the first time a route moved; sniffing the body means reading it, which
 * for a stream is the damage itself. Content-type is the one signal that is already correct
 * for every emitter in this API, including a route that answers JSON on one limb and CSV on
 * another (`routes/kpis.ts` does exactly that).
 *
 * One consequence worth naming: `application/json` is NOT in
 * `gps/artifact.ts ARTIFACT_MIME_ALLOWLIST`, so a client's stored document can never be
 * served under a content-type this middleware inspects. The most sensitive bytes in the repo
 * are outside the gate by construction rather than by care.
 *
 * ── WHAT A VIOLATION DOES: THE FIELD IS REFUSED, NOT THE RESPONSE ────────────
 * Three options were on the table and only one of them is defensible:
 *
 *   · 500 / 502 the response. This is the ceiling's own preferred severity — a payload
 *     naming an unobservable metric is a fabrication — and it is unshippable. Mounted
 *     globally, one route that starts returning `viewCount` takes a compartment offline for
 *     every operator, during a launch, over a field name. The blast radius of the CONTROL
 *     would exceed the blast radius of the defect it catches.
 *   · Log and pass through. This is the fabrication the ceiling exists to stop. A number
 *     nobody can defend reaches the screen and the only trace is a log line nobody reads.
 *   · REFUSE THE FIELD. The offending value is replaced, in place, by its own
 *     `CeilingRefusal` — stable code, the rule provision and text, the violating path, and
 *     the compartment. The response keeps its status, its shape and every other field, so a
 *     component that reads `data.impressions` renders a refusal where a fabricated number
 *     would have been. That is doctrine rule 1 exactly: absent data refuses, it never renders
 *     0 and never an estimate, and the placeholder LOOKS like a placeholder.
 *
 * ONE CLASS HAS NO OFFENDING FIELD, AND IT IS REFUSED AT THE GRANULARITY IT HAS. Past
 * `MAX_PAYLOAD_DEPTH` the walker's finding is about the payload's SHAPE — everything below the
 * bound is UNREAD, so no field is named because none was seen. That sub-tree is replaced,
 * whole, by the depth refusal. The sentence above therefore holds for every class the walker
 * can report on a parsed body, which is precisely what it did NOT do in the first version of
 * this file: there, a 34-deep payload's `impressions` reached the client with its raw value and
 * the body carried no refusal at all. The full argument, including what that choice destroys,
 * is above `seatRefusals`.
 *
 * The field-level refusal is also the only option that composes with the browser layer rather
 * than fighting it. The forbidden NAME survives the rewrite (only its value changes), so
 * `apps/web/src/lib/api/marketing.ts`'s `unwrap` still throws for a marketing read — the
 * compartment where the ban is absolute gets a hard failure, and the other seven get a
 * self-explaining refusal in the cell. Neither layer weakens the other.
 *
 * ── AND IT IS COUNTED ─────────────────────────────────────────────────────────
 * Every inspected response carries `X-LCX-Honesty-Ceiling`, and its ABSENCE means the
 * middleware did not look. Four states, never two: no header (not inspected — every non-JSON
 * surface and every bodyless reply), `unparseable` (the header claimed JSON, the body was not,
 * nothing was changed and NO COUNTS ARE STATED, because nothing was counted), `refused=0`
 * (walked and clean), `refused=N` (walked and refused). The header also carries `exempted=N` on
 * both walked states, so a banned name the ceiling ALLOWED on a shape test is never
 * indistinguishable from a payload that never had one. `parseCeilingHeader` is the reader half
 * and it holds the same four states apart — including "a header this middleware did not write",
 * which it reports as `unreadable` rather than defaulting into a clean walk.
 *
 * A BROWSER SEES NONE OF IT, AND THAT IS A GAP WITH A ONE-LINE FIX. `X-LCX-Honesty-Ceiling` is
 * absent from `app.ts:148 exposeHeaders`, so `fetch()` strips it and every web consumer reads
 * all four states as "absent". The four-state design is intact for the server, the logs and any
 * non-browser client; on the surface where humans read the numbers it is currently one state.
 * The body is where the honesty lands for the web — a refused field IS the refusal object — and
 * the missing CORS line is named again at the mount instruction below because it belongs in the
 * same commit as the mount.
 *
 * Every refusal is logged with its code, path, compartment, rule provision and ruleset
 * version, so it is self-explaining from the log alone. Exemptions are logged only alongside a
 * refusal — see `logExemptions` for why routine noise in this channel would defeat it.
 */

/** Set on every response the middleware INSPECTED. Absent means it did not look. */
export const HONESTY_CEILING_HEADER = 'X-LCX-Honesty-Ceiling';

/** Log prefix, matching the repo's `[area] message` idiom so one grep finds every line. */
const LOG = '[honesty]';

/**
 * EVERY NON-JSON RESPONSE BODY IN THIS API, ENUMERATED BY READING THE ROUTES.
 *
 * THERE ARE FOUR, NOT THREE. The brief for this lane said "there are other non-JSON response
 * bodies; do NOT assume there are exactly three", and it was right to: `c.text(`, `c.html(`,
 * `c.body(`, `new Response(` and `streamSSE(` across the 236 non-test files of `apps/api/src`
 * — the count under the exclusion rules `__tests__/honesty.test.ts` itself applies, and it said
 * 234 here until the adversary pass recounted it —
 * hit exactly five files — the four below plus this one — and one of the four
 * (`/v1/outreach/unsubscribe`) answers text on its refusal limb and HTML on its success limb
 * from the same handler.
 *
 * This list is DATA and not a comment because `middleware/workspace.ts` carries the
 * post-mortem for the alternative: a hand-written prefix list drifted from the routes it
 * claimed to cover and silently missed half the artifact surface, while the constant's name
 * promised otherwise. `__tests__/honesty.test.ts` greps every non-test file under `apps/api/src` and fails
 * if a file emits a non-JSON body without appearing here — so the next such route makes a
 * test red instead of making this paragraph stale.
 *
 * NOTHING HERE IS AN INPUT TO THE GATE. The gate is the content-type and only the
 * content-type. This list exists so the person mounting the middleware can see what would
 * break if the gate were ever wrong, and so the SSE case is impossible to overlook.
 */
export interface NonJsonSurface {
  /** Path relative to `apps/api/src`. */
  readonly file: string;
  /** The route, as mounted. */
  readonly route: string;
  /** What it answers with. */
  readonly contentType: string;
  /** What breaks if this response is buffered, parsed or re-serialised. */
  readonly ifTouched: string;
}

export const NON_JSON_RESPONSE_SURFACES: readonly NonJsonSurface[] = [
  {
    file: 'routes/notifications.ts',
    route: 'GET /v1/notifications/stream',
    contentType: 'text/event-stream',
    ifTouched:
      'THE WORST CASE. The notification bell for every operator in every compartment. The response never ends — it heartbeats for ~30 minutes — so `await res.text()` on it does not return slowly, it does not return. Buffering it is an outage with no local reproduction.',
  },
  {
    file: 'routes/kpis.ts',
    route: 'GET /v1/kpis/export',
    contentType: 'text/csv',
    ifTouched:
      'The KPI download becomes a JSON parse error. Note this handler answers JSON on its error limb and CSV on its success limb, which is exactly why the gate reads the response header rather than the path.',
  },
  {
    file: 'routes/outreach.ts',
    route: 'GET /v1/outreach/unsubscribe',
    contentType: 'text/html (200) and text/plain (400)',
    ifTouched:
      'A public, unauthenticated GDPR surface reached from an email footer. It is the one route here a regulator might click, and it must render as a page.',
  },
  {
    file: 'routes/gpsArtifact.ts',
    route: 'GET /v1/gps/artifacts/:id/content',
    contentType: 'the stored artifact mime (pdf/png/jpeg/docx/xlsx/txt/csv)',
    ifTouched:
      "A third party's confidential document is corrupted on download. `application/json` is not in `gps/artifact.ts ARTIFACT_MIME_ALLOWLIST`, so these bytes cannot enter the gate — but a future mime added to that allowlist could, and this row is where somebody would look.",
  },
];

/**
 * Is this response body JSON we may read?
 *
 * EXACT MEDIA TYPE, parameters ignored, case-insensitive. `+json` structured suffixes
 * (`application/problem+json`, `application/vnd.api+json`) are deliberately NOT matched:
 * nothing in this API emits one, and widening a gate on speculation is how a stream ends up
 * inside it. If a route ever needs one, add it here with the route named.
 */
export function isJsonResponse(contentType: string | null | undefined): boolean {
  if (contentType === null || contentType === undefined) return false;
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'application/json';
}

/**
 * WHICH COMPARTMENT'S PAYLOAD THIS IS — from the workspace table, and from nowhere else.
 *
 * `workspaceForApiPath` (`packages/shared/src/workspaces.ts:276`) matches the path against
 * `WORKSPACES[].apiPrefixes`, which is the SAME table `app.ts`'s gate loop iterates to mount
 * `requireWorkspace`. So a refusal's compartment is definitionally the compartment whose
 * `view`/`operate` gate the request passed. Deriving it any other way — a second prefix list,
 * a header, a guess from the handler — would be a second notion of compartment, and this
 * repo's own ledger of that failure mode runs to fourteen instances.
 *
 * WHY NOT READ IT OFF THE CONTEXT. `requireWorkspace` closes over its `WorkspaceId` and sets
 * only `operator`; there is no `c.get('workspace')` to read. Adding one would mean editing
 * `middleware/workspace.ts`, which is outside this lane and would change a live gate to serve
 * a log field. The path is the same fact, obtained without touching the gate.
 *
 * A NULL COMPARTMENT IS A STATED CASE. The desk-level namespaces — `/v1/me`, `/v1/tasks`,
 * `/v1/notifications`, `/v1/audit`, `/v1/access`, `/v1/reviews`, `/v1/actions`, `/v1/search`
 * — are genuinely uncompartmented, by design, and every member holds them. `NO_COMPARTMENT`
 * plus a `derivedFrom` that names the mechanism says so; a silent skip would let the largest
 * ungated part of the API be the part the ceiling never covered.
 */
export function honestyScope(method: string, path: string): CeilingScope {
  const workspace = workspaceForApiPath(path);
  return {
    compartment: workspace ?? NO_COMPARTMENT,
    derivedFrom:
      workspace === null
        ? `workspaceForApiPath('${path}') matched no WORKSPACES[].apiPrefixes — this is a desk-level namespace that every member holds, not a failed lookup`
        : `workspaceForApiPath('${path}'), the same WORKSPACES[].apiPrefixes table app.ts mounts requireWorkspace from`,
    subject: `${method} ${path}`,
  };
}

/** What the walk counted. Present only where a walk happened — see `CeilingSummary.counts`. */
export interface CeilingCounts {
  readonly refused: number;
  /** How many refusals were REPLACED in the body. On a `JSON.parse` output every class is
   *  seatable, so this should always equal `refused`; less than `refused` is a DIVERGENCE
   *  between the seating pass and the walker, and it means a refused value is still in the
   *  body that went out. Reported, never rounded up — see `seatRefusals`. */
  readonly seated: number;
  readonly exempted: number;
}

/** What the middleware did, for the header and the caller. */
export interface CeilingSummary {
  /** `walked` — the body was parsed and inspected. `unparseable` — the header said JSON and
   *  the body was not, so nothing was inspected and nothing was changed. */
  readonly state: 'walked' | 'unparseable';
  readonly compartment: string;
  /**
   * NULL WHERE NOTHING WAS COUNTED, WHICH IS NOT THE SAME AS COUNTED ZERO.
   *
   * The first version of this type made `refused`/`seated`/`exempted` unconditional numbers, so
   * the `unparseable` header asserted `refused=0; seated=0; exempted=0` about a body it had
   * never read — three measurements presented for a measurement that did not happen, and
   * `refused=0` is defined in this file's header as "walked and clean". `state` did disambiguate
   * it for a reader who checked `state`, but the numeric fields are what a machine consumer
   * reads. So the counts are absent when there was no walk, in the type and on the wire.
   */
  readonly counts: CeilingCounts | null;
}

const formatSummary = (s: CeilingSummary): string =>
  `${s.state}; compartment=${s.compartment}`
  + (s.counts === null
    ? ''
    : `; refused=${String(s.counts.refused)}; seated=${String(s.counts.seated)};`
      + ` exempted=${String(s.counts.exempted)}`);

/**
 * WHAT A READER OF THE HEADER MAY CONCLUDE — three outcomes, because the header has four
 * states and a reader who cannot tell them apart makes the header decorative.
 *
 * ── WHY THIS IS NOT `CeilingSummary | null` ──────────────────────────────────
 * It was, and that reader was the mirror image of the defect the header exists to prevent. It
 * defaulted a missing `compartment=` to `NO_COMPARTMENT` — which `observation.ts` defines as
 * the AFFIRMATIVE statement "this namespace genuinely belongs to no compartment" — and a
 * missing `refused=` to `0`, which this file defines as "walked and clean". So
 * `parseCeilingHeader('walked')`, a truncated or foreign header, read back as a clean walk of
 * an uncompartmented namespace: not-stated laundered into stated, twice, in the one function
 * whose job is to keep those apart. Corrupt counts were worse — `Number('x')` is `NaN`, which
 * satisfies neither `> 0` nor `=== 0`, so every guard downstream would treat it as not-refused.
 *
 * `absent` is the not-inspected state (no header at all: every non-JSON surface and every
 * bodyless reply). `unreadable` is a header this middleware did not write, or wrote and
 * something truncated — the raw value is carried so a reader can say what they actually saw.
 * `stated` is a header this middleware wrote, and only then are its fields facts.
 */
export type CeilingHeaderReading =
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreadable'; readonly raw: string }
  | { readonly kind: 'stated'; readonly summary: CeilingSummary };

/** A count on the wire is a non-negative integer or it is not a count this file wrote. */
const readCount = (raw: string | undefined): number | null => {
  if (raw === undefined || !/^(?:0|[1-9][0-9]*)$/.test(raw)) return null;
  return Number(raw);
};

/** Read back what `formatSummary` wrote. Exported for tests and for anyone reading a trace. */
export function parseCeilingHeader(value: string | null | undefined): CeilingHeaderReading {
  if (value === null || value === undefined) return { kind: 'absent' };
  const parts = new Map<string, string>();
  let state: CeilingSummary['state'] | null = null;
  for (const chunk of value.split(';')) {
    const piece = chunk.trim();
    if (piece === 'walked' || piece === 'unparseable') { state = piece; continue; }
    const eq = piece.indexOf('=');
    if (eq > 0) parts.set(piece.slice(0, eq), piece.slice(eq + 1));
  }
  const compartment = parts.get('compartment');
  if (state === null || compartment === undefined || compartment === '') {
    return { kind: 'unreadable', raw: value };
  }

  if (state === 'unparseable') {
    /* No walk happened, so counts must not be present. A header that states BOTH
       `unparseable` and counts is self-contradictory and is not read as either. */
    if (parts.has('refused') || parts.has('seated') || parts.has('exempted')) {
      return { kind: 'unreadable', raw: value };
    }
    return { kind: 'stated', summary: { state, compartment, counts: null } };
  }

  const refused = readCount(parts.get('refused'));
  const seated = readCount(parts.get('seated'));
  const exempted = readCount(parts.get('exempted'));
  if (refused === null || seated === null || exempted === null) {
    return { kind: 'unreadable', raw: value };
  }
  return { kind: 'stated', summary: { state, compartment, counts: { refused, seated, exempted } } };
}

/**
 * REPLACE EVERY REFUSED FIELD WITH ITS REFUSAL, in the parsed body, in place.
 *
 * ── WHY THIS TRAVERSES THE PAYLOAD A SECOND TIME ─────────────────────────────
 * `walkHonestyCeiling` is the authority on WHAT is wrong. It reports each finding with a
 * dotted path (`data.tiles[0].impressions`), and the obvious move is to parse that path and
 * assign. That is a bug factory: a JSON key may legally contain `.` or `[`, so
 * `{"a.b": {"ctr": 1}}` and `{"a": {"b": {"ctr": 1}}}` produce the same path string and one of
 * the two would be edited at the wrong place — silently, on a payload that is already
 * failing. So the seating is done by walking, not by parsing paths.
 *
 * ── AND WHY THE DUPLICATION IS SAFE ──────────────────────────────────────────
 * Only the TRAVERSAL is duplicated. The DECISION and the refusal text come from
 * `ceilingFieldVerdict`, the same exported function the authoritative walker calls, so the two
 * cannot disagree about whether a name is banned, about the normalisation, or about the
 * exemptions. The depth bound is the same imported `MAX_PAYLOAD_DEPTH`, and the depth refusal
 * itself is built by the walker's own `payloadTooDeepRefusal` — so neither the verdict nor any
 * sentence in this file is a second copy of anything.
 *
 * ── THE SHAPE FINDING IS SEATED TOO, BY REFUSING THE SUB-TREE ────────────────
 * `PAYLOAD_TOO_DEEP_TO_VERIFY` is a finding about the payload's SHAPE, so there is no
 * offending FIELD to replace. The first version of this function therefore left it unseated,
 * reported `seated` short of `refused`, and called that honest. It was not, and the adversary
 * pass was right: past `MAX_PAYLOAD_DEPTH` the sub-tree the walk never read went to the client
 * BYTE FOR BYTE, so a 34-deep payload carrying `impressions: 4_200_000` shipped that number to
 * a screen while the response body contained no refusal of any kind. The only trace was a
 * header count, and that header is not in `app.ts:148 exposeHeaders`, so no browser could even
 * read it. The file's central claim — a component that reads `data.impressions` renders a
 * refusal where a fabricated number would have been — was false for exactly that class.
 *
 * So the finding IS seated, at the only place it can be: the node the walk stopped at is
 * REPLACED, whole, by the refusal. Three options were on the table and this is the third:
 *
 *   · leave it, and state the consequence. Rejected. "A fabricated number renders, and the
 *     only record is a header nothing can read" is not a consequence a control gets to state
 *     and keep; it is the fabrication the ceiling exists to stop, arrived at by a different
 *     route.
 *   · refuse the whole response. Rejected for the same reason a 500 was rejected above: the
 *     blast radius of the CONTROL would exceed the defect's. A legitimately deep payload would
 *     take a compartment's surface offline over a nesting level.
 *   · REFUSE THE UNVERIFIED SUB-TREE. The rest of the payload — every field the walk actually
 *     read and cleared — arrives unchanged, and the part nobody verified arrives as a refusal
 *     that names its own path, its code and the rule. That is the same remedy as the
 *     field-level one, applied at the granularity the finding actually has.
 *
 * WHAT THIS DELIBERATELY DESTROYS, said out loud: the data below depth 32 is REMOVED from the
 * response. A client that needed it gets a refusal object instead of a sub-tree, which is a
 * visible failure — and a visible failure is the point, because `MAX_PAYLOAD_DEPTH`'s own
 * docblock says the limit is an estimate off the type declarations and that a real payload
 * refused on it means the LIMIT was wrong. The refusal names the path, so that argument can be
 * had with evidence. Today no declared response contract in this repo nests past roughly a
 * dozen levels, so this limb is expected to be unreachable in practice — expected, not
 * assumed, which is why it is a seat rather than a note.
 *
 * The refusal object itself comes from `payloadTooDeepRefusal` in `observation.ts`, the same
 * constructor the authoritative walker uses, so the sentence in the body and the sentence in
 * the log are one string with one owner.
 *
 * ── SO `seated < refused` NOW MEANS SOMETHING ELSE ENTIRELY ──────────────────
 * On a body that came out of `JSON.parse`, every class of refusal the walker can produce is
 * now seatable: `METRIC_NOT_OBSERVABLE` replaces the field, `PAYLOAD_TOO_DEEP_TO_VERIFY`
 * replaces the sub-tree, and `PAYLOAD_NOT_WALKABLE` cannot arise at all — a `Map`, a `Set` and
 * a typed array do not survive JSON serialisation, so no parsed body contains one. `seated`
 * short of `refused` is therefore no longer a stated limit of the control; it is a
 * DIVERGENCE between this traversal and the walker's, i.e. a bug. It is still reported rather
 * than asserted on, and the honest reading of it is in the caller, where the log line says
 * plainly that some refused value remains in the body.
 *
 * `Object.keys`, not `for…in`: this walks `JSON.parse` output, whose properties are all own
 * and enumerable. The authoritative walker uses `for…in` because it also sees hand-built
 * server-side objects with prototypes; that case cannot arise on a parsed body.
 *
 * MUTATES ITS ARGUMENT, which is sound here and only here: the caller passes a value it just
 * produced with `JSON.parse`, so no other reference to it exists.
 */
export function seatRefusals(root: unknown, options: CeilingOptions): number {
  let seated = 0;
  const scope = options.scope ?? null;

  /* The walker refuses a node it reaches at `depth > MAX_PAYLOAD_DEPTH`, and only if that node
     is a non-null object — a scalar past the bound carries no field names, and the KEY holding
     it was already checked by its parent. Same test here, asked at the DESCENT site rather
     than on entry, because the replacement has to be written by whoever holds the reference. */
  const beyondCeiling = (child: unknown, childDepth: number): boolean =>
    childDepth > MAX_PAYLOAD_DEPTH && child !== null && typeof child === 'object';

  const visit = (node: unknown, parentKey: string | null, path: string, depth: number): void => {
    /* No depth guard on entry: the root is visited at depth 0 and every deeper visit is
       guarded by `beyondCeiling` before it happens, so a node past the bound is never entered
       — it is replaced. A guard here as well would be dead code that read as the live one. */
    if (node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      // An array rung does not rename the parent: `rows[0].scores.reach` still sees `scores`.
      for (let i = 0; i < node.length; i += 1) {
        const where = `${path}[${String(i)}]`;
        if (beyondCeiling(node[i], depth + 1)) {
          node[i] = payloadTooDeepRefusal(where, scope);
          seated += 1;
          continue;
        }
        visit(node[i], parentKey, where, depth + 1);
      }
      return;
    }

    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const where = path === '' ? key : `${path}.${key}`;
      const verdict = ceilingFieldVerdict(key, obj[key], { parentKey, path: where }, options);
      if (verdict.kind === 'refused') {
        obj[key] = verdict.refusal;
        seated += 1;
        // Do NOT descend, matching the walker: a second banned name under an already-refused
        // path is the same defect reported twice at a path nobody will render.
        continue;
      }
      if (beyondCeiling(obj[key], depth + 1)) {
        /* The walk stopped here, so nothing below is known. The sub-tree is replaced by the
           refusal rather than passed through unread — see the docblock. */
        obj[key] = payloadTooDeepRefusal(where, scope);
        seated += 1;
        continue;
      }
      visit(obj[key], key, where, depth + 1);
    }
  };

  visit(root, null, '', 0);
  return seated;
}

export interface HonestyCeilingOptions {
  /**
   * Structural exemptions. Defaults to `DOCTRINE_CEILING_EXEMPTIONS` — the two `reach`
   * shape tests the doctrine names as legitimate: the RESIST 2 circulation ladder
   * (`routes/marketingDesk.ts`) and the ordinal 1-5 scoring dimension
   * (`routes/distribution.ts:119`). Read the block above `CeilingExemptionRule` in
   * `observation.ts` before changing this: a mechanical `reach` check without those two
   * exemptions produced NINE false positives against correct code the first time it was tried.
   *
   * Pass `[]` to run with no exemptions at all. That would refuse
   * `POST /v1/distribution/engines/channel-mix`, which is the point of the warning.
   */
  readonly exempt?: readonly CeilingExemptionRule[];
}

/**
 * WHERE TO MOUNT IT: `app.use('*', honestyCeiling())` on the line after `app.use('*',
 * noStore())` (`app.ts:156`) — i.e. AHEAD OF THE COMPARTMENT GATE LOOP at `app.ts:183`.
 *
 * ── AND THE FIRST VERSION OF THIS PARAGRAPH SAID THE OPPOSITE, WHICH WAS A LIE ─
 * It said "AFTER `noStore()` and after the compartment gates, so it also inspects their
 * 401/403/422 envelopes". The second half is exactly backwards. Hono composes middleware in
 * REGISTRATION order as an onion: a middleware registered earlier WRAPS the ones registered
 * after it. `requireWorkspace` denies by `return c.json(...)` (`middleware/workspace.ts:60`
 * for the 401, `:102` for the 403) and never calls `next()`, so nothing registered after it
 * runs at all on a denied request. Mounted where that paragraph said, this middleware would
 * not have inspected those envelopes — it would not have EXECUTED, and the envelope would
 * carry any banned field it had, raw, with no header to say the ceiling had not looked.
 *
 * The repo already had the rule written down two lines above the gate loop, on `noStore()`:
 * "Ahead of the compartment gates so it also stamps their 401/403 envelopes" (`app.ts:154`).
 * Same composition, same reason, opposite instruction. Registering AFTER `noStore()` and
 * BEFORE the gates satisfies both: `noStore()` stays outermost so its header lands on whatever
 * body finally exists (including a body this middleware rewrote), and the gates run inside this
 * one so their refusal envelopes come back up through it.
 *
 * ── WHAT IS THEN COVERED, AND WHAT IS STILL NOT ───────────────────────────────
 * COVERED at that mount point: every route handler's JSON response in every compartment; the
 * compartment gates' 401 and 403 envelopes; every per-route `requireOperator` /
 * `requireApprover` / per-action refusal, since all of those are downstream of `app.use('*')`.
 *
 * NOT COVERED, because they short-circuit UPSTREAM of that line and no `app.use('*')` after
 * them can see it:
 *   · `rateLimit()` (`app.ts:134`) — its `429 { code: 'RATE_LIMITED' }` envelope
 *     (`middleware/rateLimit.ts:102`) is written before this middleware is reached.
 *   · the CORS preflight (`app.ts:135`), which answers bodyless and is correctly not inspected.
 *   · anything the `logger()` or the latency wrapper ahead of them ever chose to answer, which
 *     today is nothing.
 * Both non-covered envelopes are hand-written constants with no metric field in them; that is
 * the reason it is acceptable, not an argument that the gap does not exist. Moving the mount
 * above `rateLimit()` would close it and would also put a body-reading middleware in front of
 * the thing whose whole job is to answer cheaply under load, which is a worse trade.
 *
 * ── AND THE HEADER IS INVISIBLE TO A BROWSER UNTIL ONE MORE LINE IS ADDED ─────
 * `HONESTY_CEILING_HEADER` is NOT in `app.ts:148 exposeHeaders`, and `fetch()` hides any
 * response header not listed there. So for every web client all four states of the header
 * collapse into one ("absent"), including on a response that WAS inspected and refused. The
 * body is still honest — that is what the seating is for — but the counts are not readable from
 * the browser. Adding `HONESTY_CEILING_HEADER` to that array is one line and belongs in the
 * same commit as the mount; `lib/cors.ts` carries the post-mortem for `X-LCX-No-Store`, which
 * was set by the server, dropped by the browser, and silently did nothing.
 *
 * COST, stated because it is a global middleware on a production API: every JSON response
 * pays one extra `JSON.parse` of its own body plus one walk (measured in `observation.ts` at
 * 0.68ms p95 for a realistic 4,400-key payload). Clean responses are NOT re-serialised — the
 * original `Response` is returned untouched with a header added — so the only path that pays
 * a second `JSON.stringify` is a payload that is already failing. A large JSON body is
 * transiently held twice, as text and as a parsed tree.
 */
export function honestyCeiling(options: HonestyCeilingOptions = {}) {
  const ceiling: Pick<CeilingOptions, 'exempt'> = {
    exempt: options.exempt ?? DOCTRINE_CEILING_EXEMPTIONS,
  };

  return createMiddleware(async (c, next) => {
    await next();

    const res = c.res;
    // THE GATE. Everything in `NON_JSON_RESPONSE_SURFACES` returns here, having been read by
    // nothing — no clone, no buffering, no header. In particular the SSE stream leaves this
    // function on this line.
    if (!isJsonResponse(res.headers.get('content-type'))) return;

    // `clone()` rather than `text()`: on every path where the middleware decides not to act,
    // the original response must still be intact and un-consumed.
    const raw = await res.clone().text();

    /* NO BODY IS NOT UNPARSEABLE JSON. A 204, a 304 and a HEAD reply all arrive here with an
       empty body and a JSON content-type, and `JSON.parse('')` throws — so the naive path
       would stamp `unparseable` and log "declared JSON and did not parse" on every one of
       them. That is a false statement about the response, and it is noise in the one log
       channel the refusals live in. Nothing was inspected, so no header: absence of the
       header is exactly the not-inspected state. */
    if (raw === '') return;

    const scope = honestyScope(c.req.method, c.req.path);
    let payload: unknown;
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      /* The header claimed JSON and the body is not. Nothing was inspected and nothing is
         changed — but `unparseable` is recorded rather than left to look like `refused=0`,
         which is the not-loaded/genuinely-empty collapse the doctrine forbids.

         AND IT STATES NO COUNTS. The first version wrote `refused=0; seated=0; exempted=0`
         here: three measurements about a body that was never read, in the same header whose
         `refused=0` means "walked and clean". `state=unparseable` disambiguated it for a reader
         who checked `state`, but the numbers are what a machine consumer reads, and
         not-measured presented as measured-zero is the exact collapse this header exists to
         prevent. `counts: null` omits them from the wire. */
      console.error(`${LOG} ${scope.subject} declared application/json and did not parse; the ceiling did not run on it.`);
      res.headers.set(
        HONESTY_CEILING_HEADER,
        formatSummary({ state: 'unparseable', compartment: scope.compartment, counts: null }),
      );
      return;
    }

    /*
     * `walkHonestyCeiling`, whose `.refusals` IS `assertHonestPayloadAll` — never
     * `assertHonestPayload`. The house pattern is EVERY refusal then one decision, never the
     * first one found (`routes/marketingDesk.ts:1207-1214`): a gate that reports one banned
     * field per response gets routed around one field per deploy, and a payload with four of
     * them would take four deploys to clean. The plural form is also what makes `exempted`
     * countable, and an exemption nobody can count is indistinguishable from a skip.
     */
    const reading = walkHonestyCeiling(payload, { ...ceiling, scope });
    const exempted = reading.exempted.length;

    if (reading.refusals.length === 0) {
      /* CLEAN. The body is NOT re-serialised — a response the ceiling passed must be the
         response the handler wrote, byte for byte. Only the header is added, and `refused=0`
         means "walked and clean", which the header's absence would not. */
      res.headers.set(
        HONESTY_CEILING_HEADER,
        formatSummary({
          state: 'walked',
          compartment: scope.compartment,
          counts: { refused: 0, seated: 0, exempted },
        }),
      );
      /* NO LOG LINE HERE, EVEN WITH EXEMPTIONS. See `logExemptions`. */
      return;
    }

    for (const refusal of reading.refusals) log(refusal, scope);
    logExemptions(reading.exempted, scope);

    const seated = seatRefusals(payload, { ...ceiling, scope });
    const summary = formatSummary({
      state: 'walked',
      compartment: scope.compartment,
      counts: { refused: reading.refusals.length, seated, exempted },
    });
    if (seated < reading.refusals.length) {
      /* THIS IS NOW A DIVERGENCE ALARM, NOT A STATED LIMIT. Every class of refusal the walker
         can produce on a `JSON.parse` output is seatable — the named field is replaced, the
         too-deep sub-tree is replaced, and `PAYLOAD_NOT_WALKABLE` cannot occur because a Map,
         a Set and a typed array do not survive JSON serialisation. So a shortfall here means
         this traversal and the walker's disagreed, which is a bug in one of them, and the
         consequence is stated rather than softened: a value the ceiling REFUSED is still in
         the body that went out, and the header plus these log lines are the only record of it
         (and the header is not CORS-exposed, so a browser cannot see even that). */
      console.error(
        `${LOG} ${scope.subject} — ${String(reading.refusals.length - seated)} of ${String(reading.refusals.length)} refusals could not be seated in the body. This should be impossible: the seating pass and the walker disagreed. The response was NOT blocked, so a refused value is still in it; the refusals above are the record and this is a defect to fix, not a limit to accept.`,
      );
    }

    /*
     * Hono's `c.res` setter copies every header off the OLD response onto the new one except
     * `content-type` (hono/dist/context.js:119-139). A stale `content-length` copied that way
     * would describe the pre-rewrite body, so it is deleted from the old response BEFORE the
     * assignment. The ceiling header is set AFTER, where the setter cannot overwrite it.
     */
    res.headers.delete('content-length');
    const rewritten = new Response(JSON.stringify(payload), {
      status: res.status,
      statusText: res.statusText,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
    c.res = rewritten;
    c.res.headers.set(HONESTY_CEILING_HEADER, summary);
  });
}

/** One line per refusal: the code, the path, the compartment, and the provision it cites. */
function log(refusal: CeilingRefusal, scope: CeilingScope): void {
  console.error(
    `${LOG} ${refusal.code} at ${refusal.matched ?? 'the root'}`
    + ` — compartment=${scope.compartment}, subject=${scope.subject},`
    + ` rule=${refusal.rule.instrument}/${refusal.rule.provision},`
    + ` ruleSetVersion=${String(refusal.ruleSetVersion)}. ${refusal.sentence}`,
  );
}

/**
 * Exemptions are logged ONLY ON A RESPONSE THAT ALSO CARRIES A REFUSAL, and that boundary is
 * the decision, not an accident.
 *
 * An exemption is the ceiling deciding NOT to refuse a banned name on a shape test, and the
 * ordinal limb of the `reach` exemption is the weakest thing in this control (see
 * `REACH_ORDINAL_SCORE_EXEMPTION`), so it must not be invisible. But it is also CORRECT and
 * fires on every single call to `POST /v1/distribution/engines/channel-mix`. Logging it per
 * request would put a steady stream of expected `[honesty]` lines in front of the refusals,
 * and a channel that is mostly noise is a channel nobody reads — which is how the guard
 * becomes decoration by a different route.
 *
 * So the count goes on the header of EVERY inspected response (`exempted=N`, machine-readable,
 * never absent), and the prose goes in the log only where somebody is already reading it
 * because a refusal fired in the same payload. A `[honesty]` line therefore always means
 * something in that response was wrong.
 */
function logExemptions(exemptions: readonly CeilingExemption[], scope: CeilingScope): void {
  for (const e of exemptions) {
    console.error(
      `${LOG} EXEMPT ${e.ruleId} allowed '${e.name}' at ${e.path}`
      + ` — compartment=${scope.compartment}, subject=${scope.subject}. Grounds: ${e.because}`,
    );
  }
}
