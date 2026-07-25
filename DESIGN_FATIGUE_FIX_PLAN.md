# Design Consistency & Fatigue Fix — Implementation Plan

**Scope:** `apps/web/src` — LCX Sales Automation Engine frontend
**Trigger:** internal design critique (2026-07-14) — team reports usage fatigue, low visual consistency across the 38-page app
**Principle:** no schema/backend changes, no new features. Frontend-only, mechanical-first.

---

## Baseline (measured, not estimated)

| Metric | Current state |
|---|---|
| Pages using shared `Button` component | 0 / 38 |
| Pages using shared `LoadingSkeleton` | 0 / 38 |
| Pages using shared `Card` | 10 / 38 (26%) |
| Pages using shared `EmptyState` | 7 / 38 (18%) |
| Pages using shared `Toast` | 5 / 38 (13%) |
| `text-[10px]` / `text-[11px]` instances | 387 (vs. 54 `text-sm`, 31 `text-lg`) |
| Distinct `<h1>` className variants | 10+ |
| Raw hex colors outside token system | ~18 instances across pages |
| Most common padding/gap values | `py-1`, `px-2`, `gap-1`, `gap-2` |
| Most common corner radius | bare `rounded` (0.25rem) |

Design token foundation (`tokens.css`, `tailwind.config`) is solid — semantic status colors, validated 8-color chart palette, full dark-mode remapping. The problem is adoption and density, not the tokens themselves.

---

## Phase 1 — Typography scale (highest leverage, do first)

**Goal:** one consistent heading system; raise the density floor from 10px to a readable minimum.

1. Create `apps/web/src/components/ui/PageTitle.tsx`:
   - `<PageTitle icon? actions?>{children}</PageTitle>` — single canonical page-header component (replaces all 10+ ad hoc `<h1 className=...>` variants).
   - Fixed style: `text-lg font-bold text-navy dark:text-ice flex items-center gap-2`.
2. Create `apps/web/src/components/ui/SectionLabel.tsx` for the recurring uppercase/tracked mini-labels currently duplicated as `text-[11px] font-bold uppercase tracking-wider text-grey` (used in `CardHeader` and inline elsewhere) — consolidate into one component both `Card.tsx` and pages import.
3. Tailwind config: add a named type scale instead of arbitrary bracket values —
   ```js
   fontSize: {
     micro: ['11px', '1.3'],   // replaces text-[10px]/text-[11px]
     label: ['12px', '1.3'],
     body:  ['13px', '1.5'],
   }
   ```
   `micro` becomes the new *minimum* (11px, not 10px) reserved for dense table cells only.
4. Sweep: replace `text-[10px]` → `text-micro` (or `text-xs` where not table-adjacent), `text-[11px]` → `text-label`. Do this file-by-file, not with a blind global find/replace, since some are table headers (keep dense) and some are page chrome (should grow).
5. Audit every `<h1 ...>` / `<h2 ...>` in `pages/*.tsx` and replace with `<PageTitle>` / `<SectionLabel>`.

**Files touched:** all 38 files in `apps/web/src/pages/`, plus new files in `components/ui/`.
**Effort:** ~1–2 days (mechanical but needs per-file judgment on table vs. chrome text).
**Verification:** re-run the grep from the baseline table — `text-[10px]` count should drop to near-zero outside literal data-table cells; `<h1>` variant count should drop to 1.

---

## Phase 2 — Enforce the component system that already exists

**Goal:** stop the "36 pages built by 36 people" problem at the root — make it harder to *not* use the shared components than to use them.

1. **Button:** grep every page for hand-rolled `<button className="...">` patterns and replace with `<Button variant="...">`. Currently 0/38 pages use it — this is the single biggest quick win since the component already has `primary/secondary/ghost/danger` variants covering nearly every case seen in the pages.
2. **LoadingSkeleton:** find every literal `Loading…` / `Loading...` text string and every ad hoc spinner div; replace with `<LoadingSkeleton variant="table|card|chart" />` matching context. 0/38 adoption today despite the component existing and being spec'd as done in the prior handover — this is a regression to close.
3. **Card:** raise adoption from 26% → target ~90%+ for anything that is visually "a panel/box" — audit the 28 pages not currently using it.
4. **EmptyState / Toast:** same audit pattern — every "No data" string and every custom success/error banner should route through these.
5. Add a lightweight guardrail so this doesn't regress again: an ESLint rule (or a `CONTRIBUTING.md` note + a pre-merge checklist item) that flags new raw `<button>` tags in `pages/*.tsx` and suggests `Button`.

**Files touched:** all `pages/*.tsx`; one new lint rule config (optional but recommended).
**Effort:** ~2–3 days across the 38 pages (can be parallelized page-by-page).
**Verification:** re-run the adoption grep from the baseline table; target ≥90% adoption on Card/EmptyState/Toast, 100% on Button/LoadingSkeleton for their respective use cases.

---

## Phase 3 — Color token compliance

**Goal:** remove the ~18 raw hex leaks so every color on screen traces back to `tokens.css` / the chart palette.

1. Grep `pages/*.tsx` for `#[0-9a-fA-F]{3,6}` and `bg-\[#`.
2. For each hit, map to the nearest existing token (`--chart-1..8`, `--green/amber/red`, `--navy/ice/grey`) rather than inventing new ones. If a genuinely new semantic color is needed (rare), add it to `tokens.css` first, then reference it — never inline.
3. Spot-check dark mode after each replacement (the token system already remaps per-mode; raw hex doesn't).

**Files touched:** the ~10–12 pages identified in the original grep (cyan/rose/orange one-offs).
**Effort:** ~half a day.
**Verification:** grep count → 0 raw hex in `pages/*.tsx`.

---

## Phase 4 — Density & breathing room (selective, not global)

**Goal:** reduce fatigue on pages that don't need trading-terminal density, without hurting the pages that genuinely benefit from tight tables (BdPipeline, MarketMap data grids, DealBoard cards).

1. Classify all 38 pages into two buckets:
   - **Dense-by-necessity** (large tables/grids): `BdPipeline`, `ExchangeGaps`, `AuditLog`, `WinLoss` tables, `SendQueue` — keep current spacing, just apply Phase 1's 11px floor.
   - **Chrome/dashboard/config pages**: `Settings`, `Integrations`, `AiTools`, `Dashboard`, `KpiDashboard` cards, `Roadmap`, `ClaimLibrary` — raise `py-1`→`py-2`, `gap-1`→`gap-2`/`gap-3`, `p-2`→`p-3` or `p-4`.
2. Bump default corner radius on cards/panels from bare `rounded` to `rounded-lg` (already used in 65 places — make it the default in `Card.tsx` rather than opt-in) for a less boxy feel.
3. Do **not** touch dense data-table styling (`.premium-table` in `components.css`) — that density is appropriate for its context; the fatigue problem is dense *non-table* chrome, not the tables themselves.

**Files touched:** ~15–18 "chrome" pages; `components/ui/Card.tsx` default; no change to `.premium-table`.
**Effort:** ~1 day.
**Verification:** manual pass in browser, light + dark mode, at 1920px and 1366px per the original handover's responsive targets.

---

## Phase 5 — Personality pass (lowest priority, optional)

Only after Phases 1–4 land. Scope to the lower-density "chrome" pages identified in Phase 4:

1. Give `EmptyState` 2–3 context-specific icon variants instead of always the generic `Inbox` icon (e.g. a magnifying glass for search-related empties, a checkmark-circle for "all done" states).
2. Add one subtle accent moment per low-density page (e.g. a colored left-border on the primary stat card, consistent with the existing `Card status=` prop that's already built but underused).
3. Nothing that adds animation/JS complexity beyond what's already in `globals.css` (`fadeIn`, `slide-in`, `pulse-beacon` already exist and are usable as-is).

**Effort:** ~1 day, nice-to-have.

---

## Sequencing & effort summary

| Phase | Focus | Effort | Priority |
|---|---|---|---|
| 1 | Typography scale unification | 1–2 days | 🔴 Do first |
| 2 | Component adoption enforcement | 2–3 days | 🔴 Do second |
| 3 | Color token compliance | 0.5 day | 🟡 |
| 4 | Selective density/breathing room | 1 day | 🟡 |
| 5 | Personality pass | 1 day | 🟢 Optional |

**Total: ~6–8 days of focused frontend work**, no backend/schema/DB touches, no new dependencies required (all target components already exist in the codebase).

## Definition of done
- [ ] `text-[10px]` reduced to table-cell-only usage; page chrome text is 12px+ minimum
- [ ] Single `<PageTitle>` component used on all 38 pages (0 ad hoc `<h1>` variants remaining)
- [ ] `Button` adoption 100% for interactive buttons in `pages/*.tsx`
- [ ] `LoadingSkeleton` adoption 100% (no literal "Loading…" text remaining)
- [ ] `Card` / `EmptyState` / `Toast` adoption ≥90%
- [ ] Zero raw hex colors in `pages/*.tsx`
- [ ] Dense-by-necessity pages unchanged in spacing; chrome pages have visibly more breathing room
- [ ] Verified in light + dark mode at 1920px and 1366px
