# LCX COMMAND — the CEO's launch command deck

*The next platform-within-the-platform. The BD/intel engine answers "which token do we list?"
LCX COMMAND answers "are we ready to launch the company in the US, and what's in the way?"
It models the whole US-launch program — products, partners, workstreams, the task dependency
graph, the launch anchor, financials, risks, and decisions — as one governed operating picture
for the CEO. Built as panels inside the existing app now; grows to full depth over waves.*

## Source of truth
A strategy extract (`STRATEGY_EXTRACT.md` + `DATA_GAPS.md`) + structured seed
(`apps/api/src/seed/command/*.json`): 5 products, 38 typed partners, 6 workstreams,
24 tasks with a `depends_on` graph, the launch plan (anchor = UNCONFIRMED US launch date),
13 financial assumptions (mostly planning), 12 risk factors, 24 open decisions. **Non-fabrication
rule:** anything the strategy doesn't contain stays `null` and is surfaced as a data-gap — never invented.

## Integration
Lives in the existing monorepo. `command_*` tables (namespaced — the existing `tasks`/`decisions`
are the Phase-4 desk tables and must not collide). `/v1/command/*` API. A `/command-deck` page
composed of panels. Reuses the ontology, inspectors, governed action registry, decision log, and
risk grading already built.

---

## WAVE 1 — the spine + the deck  *(this wave)*
- **Migration 0040**: `command_products`, `command_partners`, `command_workstreams`,
  `command_tasks` (with `depends_on text[]`), `command_decisions`, `command_risks`,
  `command_financial_assumptions`, `command_launch_targets`. RLS on all.
- **Seed loader** from the committed JSON (idempotent upsert); `command_seed` intel job.
- **`/v1/command` API**: read endpoints per object + `GET /v1/command/overview` (phase rollup,
  partner pipeline by type, risk heat, launch readiness / gating chain, open decisions, data-gaps).
- **Command Deck** (`/command-deck`): launch-readiness header with the **anchor-date UNCONFIRMED**
  banner, workstream/phase rollup, partner pipeline by type, task dependency + critical-path view,
  risk heatmap (likelihood×impact), decisions register, financial assumptions, and an honest
  data-gaps panel. "As panels like we have."
- Gate → deploy → migration handoff → prod-verify + seed.

## WAVE 2 — make it live & governed
- Editable objects through the governed action registry (advance a task, resolve a decision,
  update a partner stage/terms) with full audit — the CEO acts through the deck.
- Partner pipeline board (drag stages) + fill the null contacts/terms as they arrive.
- Launch-schedule **Monte Carlo** off the dependency graph (the anchor-date risk sim).
- Wire risks/decisions/tasks into the existing decision-log + WBR (one operating rhythm).

## WAVE 3 — intelligence layer
- AI operator over the command ontology: "what's the critical path to launch?", "what unblocks
  if we hire the BSA officer this week?", grounded in the graph, cited.
- Program narrative in the WBR; decision-memo capture on every decision resolution.
- Cross-link COMMAND partners ↔ BD-engine projects (one graph).

## WAVE 4+ — the other platforms-within-the-platform
Metals distribution (the empty `MetalsDistributor` type from the brief), treasury/runway,
org/hiring, and further CEO surfaces — each a new module in the same pattern.

**Standing preset:** max rigor, solo, no subagents, wave-by-wave, user green-lights each;
build → gate → push `dev:main` on `lcx-sales` → migration ELI15 → prod-verify.
