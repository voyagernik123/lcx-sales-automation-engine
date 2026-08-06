import { createMiddleware } from 'hono/factory';
import {
  DOCTRINE_CEILING_EXEMPTIONS,
  MAX_PAYLOAD_DEPTH,
  NO_COMPARTMENT,
  ceilingFieldVerdict,
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
 * nothing was changed), `refused=0` (walked and clean), `refused=N` (walked and refused). The
 * header also carries `exempted=N`, so a banned name the ceiling ALLOWED on a shape test is
 * never indistinguishable from a payload that never had one.
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
 * `c.body(`, `new Response(` and `streamSSE(` across all 234 non-test files of `apps/api/src`
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

/** What the middleware did, for the header and the caller. */
export interface CeilingSummary {
  /** `walked` — the body was parsed and inspected. `unparseable` — the header said JSON and
   *  the body was not, so nothing was inspected and nothing was changed. */
  readonly state: 'walked' | 'unparseable';
  readonly compartment: string;
  readonly refused: number;
  /** How many refusals were REPLACED in the body. Less than `refused` means the rest could
   *  not be seated — see `seatRefusals`. Never silently equal. */
  readonly seated: number;
  readonly exempted: number;
}

const formatSummary = (s: CeilingSummary): string =>
  `${s.state}; compartment=${s.compartment}; refused=${String(s.refused)};`
  + ` seated=${String(s.seated)}; exempted=${String(s.exempted)}`;

/** Read back what `formatSummary` wrote. Exported for tests and for anyone reading a trace. */
export function parseCeilingHeader(value: string | null | undefined): CeilingSummary | null {
  if (value === null || value === undefined || value === '') return null;
  const parts = new Map<string, string>();
  let state: CeilingSummary['state'] | null = null;
  for (const chunk of value.split(';')) {
    const piece = chunk.trim();
    if (piece === 'walked' || piece === 'unparseable') { state = piece; continue; }
    const eq = piece.indexOf('=');
    if (eq > 0) parts.set(piece.slice(0, eq), piece.slice(eq + 1));
  }
  if (state === null) return null;
  const num = (k: string): number => Number(parts.get(k) ?? '0');
  return {
    state,
    compartment: parts.get('compartment') ?? NO_COMPARTMENT,
    refused: num('refused'),
    seated: num('seated'),
    exempted: num('exempted'),
  };
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
 * exemptions. The depth bound is the same imported `MAX_PAYLOAD_DEPTH`.
 *
 * ── AND WHERE IT COULD STILL DISAGREE, THE MIDDLEWARE SAYS SO ────────────────
 * A refusal with no offending field to replace — `PAYLOAD_TOO_DEEP_TO_VERIFY`, whose finding
 * is about the payload's SHAPE — cannot be seated by anything. Rather than pretend, the
 * summary reports `seated` short of `refused` and the refusal is logged. That is the honest
 * handling of a control that could not fully apply, and it is deliberately visible rather than
 * rounded to a pass. It is also, today, unreachable in practice: the deepest declared response
 * contract in this repo nests roughly a dozen levels against a limit of 32.
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

  const visit = (node: unknown, parentKey: string | null, path: string, depth: number): void => {
    if (node === null || typeof node !== 'object') return;
    if (depth > MAX_PAYLOAD_DEPTH) return; // the walker did not look past here either

    if (Array.isArray(node)) {
      // An array rung does not rename the parent: `rows[0].scores.reach` still sees `scores`.
      for (let i = 0; i < node.length; i += 1) {
        visit(node[i], parentKey, `${path}[${String(i)}]`, depth + 1);
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
 * Mount at `app.use('*', honestyCeiling())`, AFTER `noStore()` and after the compartment
 * gates, so it also inspects their 401/403/422 envelopes — a refusal envelope is a payload a
 * human reads, and there is no reason to hold it to a lower standard than a 200.
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
         which is the not-loaded/genuinely-empty collapse the doctrine forbids. */
      console.error(`${LOG} ${scope.subject} declared application/json and did not parse; the ceiling did not run on it.`);
      res.headers.set(
        HONESTY_CEILING_HEADER,
        formatSummary({ state: 'unparseable', compartment: scope.compartment, refused: 0, seated: 0, exempted: 0 }),
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
        formatSummary({ state: 'walked', compartment: scope.compartment, refused: 0, seated: 0, exempted }),
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
      refused: reading.refusals.length,
      seated,
      exempted,
    });
    if (seated < reading.refusals.length) {
      console.error(
        `${LOG} ${scope.subject} — ${String(reading.refusals.length - seated)} of ${String(reading.refusals.length)} refusals could not be seated in the body (a shape finding has no field to replace). The response was NOT blocked; the refusals above are the record.`,
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
