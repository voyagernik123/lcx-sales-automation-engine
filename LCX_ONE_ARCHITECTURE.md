# LCX ONE — THE CROWN-JEWEL ARCHITECTURE DOSSIER
**The grand platform, end to end.** For the next engineer, the board, and future-us.
**As of:** 2026-07-24 · prod head `6c03c1a` (+ Phase-7 head after this) · Cloudflare Pages (web) + Render (api, Docker) + Supabase (Postgres).

---

## 0. WHAT THIS IS

LCX ONE is a **multi-platform within a platform** — one deployed app (~80k+ LOC monorepo) that runs several missions for LCX, each a compartmented "workspace," all sharing one identity fabric, one governed-action spine, one audit trail, and one AI substrate. It was built to the doctrine: **Palantir** (ontology, purpose-based access, provenance, decision engines) × **CIA** (need-to-know, tradecraft gates, audit-everything) × **Apple** (one coherent surface) × **Fortune 500** (SLOs, compliance gates, board reporting) × **LCX** (regulated-exchange discipline, LCX-token economics).

Two build programs produced it: the **US-launch COMMAND** platform (5-phase "100X"), then **LCX ONE** (7 phases) which added the workspace fabric and the **PayAgent DISTRIBUTION COMMAND** platform on top.

---

## 1. THE STACK

- **apps/api** — Hono + Drizzle + `pg` on Postgres/Supabase. TypeScript, ESM. Deploys as a Docker image on Render (prod runs compiled `dist/` — `tsc` does NOT copy `.json`, so all seed data is compiled `.ts`).
- **apps/web** — Vite + React 18 + TS + Tailwind. Code-split per route. Deploys to Cloudflare Pages.
- **packages/shared** — pure logic (decision engines, workspace constitution, roster), vitest-tested, consumed by both.
- **Deploy:** push `dev:main` → `lcx-sales` remote → CI builds. **The gate that matters (learned the hard way): run the real emit builds `npm run build -w @lcx/shared && -w @lcx/api && -w @lcx/web` — vitest uses esbuild and does NOT type-check, so an api type error passes tests but fails the Render Docker build silently.** See [gate-must-run-emit-build].

---

## 2. THE FABRIC (LCX OS — Phases 1–2)

**The constitution** (`packages/shared/src/workspaces.ts`): six compiled, git-versioned workspaces — `command`, `sales`, `intel`, `regulatory`, `distribution`, `governance`. Each declares its web routes, API namespaces, mission, sensitivity tier. Zero-drift: the web shell renders nav from it, the API guards namespaces from it, they can never disagree.

**Who may enter** (Postgres, migration 0042): `entitlements` (member × workspace → view/operate/approve, every row a governed grant with who/why), `member_profiles`, `access_requests` (purpose-based front door). The compiled roster (`operators.ts`) is the bootstrap + break-glass source of truth: **Nik, Monty (approvers), Sam (operator)** — all three hold every workspace today (desk decision), but compartmentalization stays live in the machinery.

**Enforcement:** `requireWorkspace(ws, cap)` middleware guards every owned `/v1` namespace (mounted in `app.ts` before routes); `RegistryAction.workspace` + `invokeAction` gate governed writes. **No-lockout covenant:** the loader fail-opens to the legacy full-desk picture on `42P01` (pre-migration) — deploy order can never strand the desk. **Machines** (shared API key, monitors, AI) hold blanket `operate`, never `approve`.

**The front door:** desk sign-in is `email:passcode` verified server-side (timing-safe) against `DESK_PASSCODE` (default `test#1234`, Render-overridable). A bare email opens nothing.

**The Directorate** (`governance` workspace, Phase 2): the `/access` console — entitlement matrix, request inbox, per-member **dossier** (everything they can see + their governed-action footprint, **purpose-gated**: `requirePurpose` writes the reason to the audit spine *before* the read). **Step-up re-auth** on the destructive `revoke_entitlement` (re-enter the passcode). A permanent **red-team suite** (`redteam.test.ts`, `grandAudit.test.ts`) proves the compartments hold: privilege escalation, path-trick bypass, purpose evasion, IDOR, machine scope — all refused.

---

## 3. THE GOVERNED-ACTION SPINE

One path for every server-side mutation: `ACTION_REGISTRY` → `invokeAction`. Each action declares subject types, `minRole`, optional `workspace`, and a zod param schema. `invokeAction` validates → enforces role + workspace entitlement → executes → writes **both** `object_actions` (ledger) and `audit_log` (hash-chained). The AI never writes directly — it proposes; a human confirms; the action records who signed off. Governance gates layer on top: the **SAT gate** (`command_decide` critical decisions need premortem + devil's-advocate), the **compliance gate** (`dist_campaign_set_status` — see §5).

---

## 4. COMMAND (the US-launch platform, `command` workspace)

Zero-drift split: the immutable strategy reference (weighted scorecards, RFI schema, funnel model, 100 graded sources) is compiled into `seed/command/data2.ts` from the strategy workbooks; Postgres (0040/0041) holds only desk-mutable state (RFI values with a C3→B2→A1 provenance ladder, requirements, blockers). Decision engines in `@lcx/shared/commandEngines.ts` (LP rescore + rank-flip sensitivity, waitlist Monte Carlo, listing readiness, token-DD hard gate, program readiness). The AI operator (`commandOperator.ts`): cited Q&A, decision-memo copilot, RFI extractor. Surfaces: US Launch Deck, Partner Pipeline, Command Ops.

---

## 5. DISTRIBUTION COMMAND (PayAgent, `distribution` workspace — LCX ONE Phases 3–7)

**The product:** PayAgent by LCX AI Labs — non-custodial payment links + agent wallets + MCP/Telegram/X + flat LCX fees with a 50% creator rebate. The thesis: agents are customer, channel, and referrer at once; distribution = machine-legibility × machine-payability, run as one closed loop.

- **Ontology** (Phase 3, `seed/distribution/data.ts`): the graded research dossier compiled to an immutable const — 6 rails (x402 top fit-for-LCX), 14 discovery surfaces, 7 competitors, the G1–G8 gap register, funnel/reward model, MiCA/TVTG/X-ban compliance checklist, GEO questions, KOL personas, 38 A/B/C-graded sources. Mutable state (0043): `dist_listings`, `dist_campaigns`, `dist_channel_facts`.
- **Growth engines** (Phase 4, `@lcx/shared/distributionEngines.ts`, pure + seeded): referral K-factor Monte Carlo, emission-budget engine (healthy/watch/breach), quest CAC Monte Carlo, channel-mix optimizer, attribution, presence score.
- **x402 seller layer** (Phase 4, `x402/seller.ts`): a real HTTP-402 handshake pricing LCX data products; **keyless sandbox** until `X402_FACILITATOR_URL` is set — one env flip makes LCX a live Bazaar seller. Public by design (payment is the auth).
- **Cockpit** (Phase 5): the workspace as multi-page — Cockpit (presence dial + funnel + gaps), Listing Ops (governed pipeline), Campaign Ops (live CAC/emission pricing under a budget slider + lifecycle), GEO & Personas, Channel Atlas.
- **The governed loop** (Phase 6): the **compliance gate** on token-incentivized campaign launch — approver authority + active premortem + `legal_check` on `analytic_reviews` + within emission budget, or an audited override; distribution sweep monitors; keyless Galxe/Layer3 exporters; the growth WBR block.
- **The AI operator** (Phase 7, `distributionOperator.ts`): cited Ask-the-Distribution, GEO content drafter, listing-packet drafter, campaign-designer copilot — all grounded in the ontology, deterministic-fallback at $0, and **display-only: the AI never files.**

---

## 6. THE CROSS-CUTTING SUBSTRATE (shared by all workspaces)

Audit log (hash-chained), notifications + daily sweep (per-workspace monitor rules), WBR composer (program + distribution blocks, WoW deltas), SLO latency ring buffer, the dual-provider LLM client (Anthropic → OpenRouter Nemotron at $0 with `reasoning:{enabled:false}` → deterministic fallback; every feature degrades gracefully with no key), `ai_usage_log` telemetry.

---

## 7. OPERATING NOTES

- **Migrations** applied by the desk via Supabase SQL Editor (staged in scratchpad as `APPLY_TO_PROD_00XX.sql`); the API fail-opens until they land. Live on prod: 0040, 0041, 0042, 0043.
- **Prod deploy discipline:** one push per phase; never probe state-changing prod endpoints during a deploy window (old code answers until the rebuild completes).
- **Keyless-first:** every external integration (x402 facilitator, Galxe/Layer3 posting, AI) ships with deterministic degradation and flips on via an env var — never blocked on procurement.
- **External keys/budgets worth provisioning next** (all optional; the platform runs without them): `X402_FACILITATOR_URL` + CDP keys (go-live x402 selling), an Anthropic key (AI quality/privacy upgrade over the free OpenRouter path), Galxe/Layer3/Kaito campaign budgets, X API tier (post-ban rules), OKX AI ASP onboarding.

---

## 8. LCX TERMINAL (the native instrument — TERMINAL Phases 1–7)

The browser app is the development loop and a fallback surface. **LCX TERMINAL is the
product**: the same web app inside a Tauri v2 shell, plus the four things a browser
cannot give an operator instrument — a system-wide summon key, real macOS chrome,
Keychain-backed credentials, and signed self-updates. `apps/desktop/` is deliberately
thin; it never talks to the API and never holds a session.

**The command grammar is GENERATED, not authored.** The governed action registry
(`apps/api/src/actions/registry.ts`) is compiled to a committed manifest that the
webview reads, so the command line is complete by construction: an action cannot exist
without a command, and a command cannot exist for an action the server does not have. A
drift test fails CI if the two disagree, and the manifest carries a hash so a printed
artefact can be checked against a running build.

**What is deliberately NOT true, recorded because each was assumed once:**

- **p95 < 100ms is unreachable over the network.** Production costs **165–195ms of
  fixed infrastructure latency before our code runs** — an `OPTIONS` preflight that
  touches nothing costs 193ms. The origin is GCP `us-west1` behind Cloudflare; it is
  geography, not code. Local-first reads are therefore the mechanism, not an
  optimisation. Two metrics are always published together — `ui_interaction_p95`
  (paint) beside `ui_settle_p95` — because measuring paint alone would let the headline
  number *improve* as the desk got slower, every time a read moved to network-only for
  governance reasons.
- **`audit_log` is not hash-chained.** It is append-only by convention. Saying
  otherwise in a security conversation would be a material misstatement.
- **Governed writes stay online**, and must: the gates read their inputs at write time
  and three of them FAIL OPEN on error, so a queued offline write would be judged
  against stale truth.
- **⌘1–9 cannot be delivered to a web page.** Measured with a capture-phase listener:
  a real ⌘2 in Chrome produces zero keydown events, because the browser reserves them
  for tab switching. The workspace chords are therefore native-menu-only, and the
  webview gets a `g`-prefix grammar instead. Both resolve through one table
  (`apps/web/src/lib/destinations.ts`) that the Rust menu is tested against.
- **Trackpad haptics cannot be verified by any test.** A test can prove
  `haptic_tap` returns without crashing; only a fingertip can prove a tap happened. It
  also does nothing at all without a Force Touch trackpad, which AppKit does not report.

**The interaction spine, and where each piece lives:**

| Concern | Module | The rule it enforces |
|---|---|---|
| Escape | `lib/dismiss.ts` | ONE listener, LIFO, last-opened-wins. Bubble phase, so an inline edit's revert-on-Escape claims the key first. Focus restoration lives here because it is the same lifecycle. **Nothing else may listen for Escape at the document level.** |
| Navigation | `lib/destinations.ts` + `lib/navGrammar.ts` | `g` then a digit. One table shared with the native menu. |
| Lists | `hooks/useListNavigation.ts` | Roving tabindex: a table is ONE tab stop, arrows move within it. Bare `j`/`k` deliberately unbound — `s` snoozes and `d` disqualifies on those same surfaces. |
| Focus | `styles/globals.css` | One `:focus-visible` treatment, WCAG 3:1 on all six surfaces. `focus:outline-none` is banned by test; bare `outline-none` is not, because it loses to the global rule (verified in a browser). |
| Feel | `lib/juice.ts` + `lib/feedback.ts` | Four one-shot animations; overshoot rationed to commits by test. A refusal SPEAKS its remedy into a live region. A no-op gets no celebration. Sound and haptics ship OFF. |
| Teaching | `lib/manual.ts` + `lib/nudge.ts` | `?` and `⌘/` generate the manual from the registry, the destinations table and the LIVE dismiss stack. The nudge engine is mostly rules about staying quiet. |
| The standard | `lib/__tests__/operability.test.ts` | Four of the five audit criteria, asserted for all 22 actions, so action 23 must meet them too. |

**Gate for every terminal phase:** lint · type-check · **real emit builds
(shared → api → web)** · perf budget · unit tests · **e2e**. The emit builds are not
optional: vitest uses esbuild and does not type-check, and omitting them cost a silent
Render deploy failure once. The e2e suite is in the gate because it was found DEAD —
eleven of eleven specs failing since sign-in became server-verified, unnoticed because
the workflow that runs it had never been committed.

---

## 9. THE PHASE LEDGER (prod SHAs)

| Program | Phase | SHA |
|---|---|---|
| COMMAND 100X | P1–P5 | f188a83 → 4703d80 |
| LCX ONE | P1 LCX OS | af35769 |
| LCX ONE | roster+passcode hardening | 47c2cd7 |
| LCX ONE | P2 Directorate | b66acb4 |
| LCX ONE | P3 distribution ontology | 2301ba1 |
| LCX ONE | P4 engines + x402 | 9cafb17 |
| LCX ONE | P5 cockpit | c40fded |
| LCX ONE | P6 governed loop | 36027a5 (+ 6c03c1a deploy fix) |
| LCX ONE | P7 AI operator + audit | dc99c02 |
| TERMINAL | P1 the Shell | df42f5b, d4e6863 |
| TERMINAL | P2 the Speed Floor | a3fbbb2 → 1866658 |
| TERMINAL | P3 the Grammar | 82eaa83 → 78edd6d |
| TERMINAL | P4 the Motion Model | c5ee6b2, 0391454 |
| TERMINAL | P5 the Feel | 42f2d62 |
| TERMINAL | P6 the Teacher | fb16b5f |
| TERMINAL | P7 the Operator's Audit | _this push_ |

**Doctrine, one line:** every fact is source-graded, every write is governed and audited, every compartment is need-to-know, every integration is keyless-first, and the AI drafts but never decides.
