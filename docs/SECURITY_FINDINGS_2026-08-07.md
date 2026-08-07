# Penetration test — the four angles that had never been run

The 2026-08-06 round (`docs/SECURITY_FINDINGS_2026-08-06.md`, F1–F9) left four attack angles
unrun: **denial of service / algorithmic complexity**, **prompt injection**, **the desktop
webview**, and **the 3-D layer**. An earlier pass had reported on two of them, but 21 of its 35
agents died on a spend limit before their refute phase ran — so those halves were *unverified*,
not passed. This round ran all four to completion, adversarially.

## METHOD, AND WHY THE NUMBERS BELOW ARE SMALLER THAN THE FIRST DRAFT

Every candidate finding was handed to an independent skeptic whose instruction was to **refute**
it, defaulting to refuted when uncertain. **22 candidates → 12 confirmed, 10 refuted.** Several
survivors had their severity *lowered* by their own skeptic, and that correction is kept here
rather than quietly dropped, because a round that only ever escalates is not a review.

The ten refuted are listed at the bottom. They are not failures of the finders; a claim that
does not survive a hostile read is exactly what the refute phase is for. Two are worth naming
because they were plausible and wrong: *"at a typed price of $2 the whole price axis reads
$2 $2 $2 $2 $2"* and *"no Content-Security-Policy exists anywhere"*.

## CONFIRMED AND FIXED

| # | angle | what | fixed in |
|---|---|---|---|
| 1 | dos | `channel-mix` froze the whole API for 80–102s on an ~18KB body | `4a8e914` |
| 2 | dos | `quest-cac` uncapped `channels`; a non-array was a 500 | `4a8e914` |
| 3 | dos | rate-limit bucket mintable by rotating `X-Forwarded-For` | `4a8e914` |
| 4 | injection | counterparty text interpolated raw into every operator prompt | `8102304` |
| 5 | injection | forged `[[id]]` citations rendered as attribution | `8102304` |
| 6 | injection | four LLM outcomes collapsed into one, UI named a false cause | `8102304` + `2c3a029` |
| 7 | desktop | stored `javascript:` URL → LCXOS webview → native commands | `56e38d7` |
| 8 | desktop | `safeHref` applied to 9 of ~20 sinks, no ratchet | `56e38d7` |
| 9 | desktop | `diagnostics_append` let the webview forge native log records | `56e38d7` |
| 10 | geometry | mixed absent+withheld cell counted as purely withheld | `9c1e5ab` |
| 11 | geometry | out-of-box cells counted by mean, so a false "0 of 1" | `9c1e5ab` |
| 12 | geometry | `zDomain` sheet swallowed the plan tick labels | `9c1e5ab` |

### The one that mattered most

**#1 is a total availability failure reachable by one authenticated request.** `channelMix` is
O(123 · dims² · rows) and Node here is single-threaded, so an ~18KB body blocks *every* route in
all eight compartments plus `/health` — long enough to flap the platform health check. Measured,
not reasoned: 80–102 seconds, reproduced through the real HTTP stack. The caps that fix it were
chosen by reading what the web actually sends (5 dims × 8 rows) and measuring the cost curve, so
they sit 3–32× above every shipped surface.

**#7 is the most serious chain**: a stored `javascript:` URL, accepted because `notify`'s `href`
was length-bounded only, rendered by the readout without `safeHref`, executing in the Tauri
webview against six unguarded native commands including the Keychain getter. Fixed at the
*write* first, so the dangerous value can no longer be stored, not merely no longer rendered.

## FOUND WHILE FIXING — NOT IN ANY LANE'S BRIEF

Four defects the pentest did not raise, found by generalising what it did:

- **`/v1/reviews` had a FIFTH handler** (`8e83493`). `ab4a995` gated four and the test beside it
  said *"gates ALL FOUR handlers"*. `POST /suggest` — a copilot composing a project's whole
  dossier into prose, and feeding it to a model on `?llm=true` — carried only `requireOperator`.
  **The enumeration was the blind spot**: a hand-listed set cannot fail on a member nobody
  thought of. It surfaced only because the skeptic assigned to it died on the spend limit and I
  chased the finding by hand rather than letting it vanish with the agent.
- **`/v1/tasks` returned the named deal pipeline** (`b28e5d5`) — `'Unstick deal: ' || p.name`
  with each deal's stage and staleness, to any authenticated principal.
- **`ci-check` never built the api** (`4a8e914`'s sibling commit). `build` was `shared && web`.
  Emit-only failures pass the gate and fail the Render deploy.
- **The margin surface was correct and unreadable** (`cc29c1d`) — clipped labels, colliding
  labels, and a vertical axis carrying one tick across an 82-point domain. Found by rendering
  the SVG and *looking at it*, after 20 DOM tests passed.

## WHAT IS STILL OPEN, AND WHOSE IT IS

**Owner's call — not code:**
- The six reachable `#[tauri::command]`s, including the Keychain credential getter, have no
  app-level permission set. #7 closed the delivery path; the capability behind it is untouched.
- Rows already in `notifications.href` written before #7 are not cleaned up by a code fix.
- `/v1/integrations` (`email-threads/:projectId`, `social-mentions/:projectId`) and
  `/v1/users` (`:id/assignments`) read plausibly-compartmented rows with no per-reader filter.
  Recorded as **OPEN** in `docs/phases/ABSENCES.md` and pinned by a test, because the answer
  turns on whether *"who is working what"* is a desk-level fact at LCX. Guessing would either
  break the desk or record a need-to-know ruling nobody made.

**Bounded, not closed:**
- A rotating junk `X-API-Key` still mints up to 4096 rate-limit buckets before folding into a
  shared overflow bucket. Closing it needs credential validation at rate-limit time.
- Every holder of `OPERATOR_API_KEY` now shares one 240/min bucket. That is what keying on the
  credential means, and it is stated rather than discovered later.

**Owed, and mine:**
- `ai_usage_log` still cannot record *why* a model did not answer — that needs `caller`,
  `status`, `http_status` columns, deliberately not added while 0068–0074 are unapplied.
- `commandEngines.ts:38` does `r.scores[d.key] ?? 0`, so an omitted dimension is scored as a
  genuine zero and ranked on it. Absent laundered into a measurement, in a shared package.
- Eight `AiProse` call sites still pass no `validIds`, so a hallucinated id renders as a source
  on those surfaces.
- `cargo clippy` is not installed on this toolchain; the Rust change is compiled and unit-tested
  but not lint-checked. The webview exploit was never reproduced end-to-end in a running LCXOS —
  the Tauri-origin execution step is taken from the finding, not observed here.

## THE TEN REFUTED

Kept so nobody re-raises them from the same reasoning:

1. Admiralty grade selectable by naming a source (`source:'etherscan'` → A2/90%)
2. The AI confirm surface renders only `params.title`, hiding `detail` and `href`
3. LLM-adjusted score written with no human confirm; absent narrative persisted as 0
4. No per-caller LLM budget, no body limit, uncapped prompt interpolation
5. No Content-Security-Policy anywhere in the product
6. Ad-hoc code signing plus a cleartext credential in localStorage
7. Five identical `$2` price labels on the live margin surface
8. A figure drawing with a completely unticked vertical axis and no notice
9. Projection-degeneracy guard exact to 1e-9 while `describeProjection` rounds to 0.1°
10. On a fixed-fee card the effort axis carries zero information while `readsAs` promises a ridge

Note the tension between refuted #8 and confirmed defect *"the vertical axis read 0%"*: the
skeptic correctly refuted the claim as stated — that NaN/Infinity tick counts yield `zTicks = []`
— and the real defect was a different mechanism entirely, a step rounded up until only one tick
landed. A refuted claim near a real bug is why the looking pass exists.
