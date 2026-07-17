# LCX OS — Institutional-Grade Overhaul

**Date:** 2026-07-17
**Trigger:** third consecutive "still looks like a school project" verdict after three CSS-level polish passes.
**Method:** fresh-eyes screenshot audit of the running app (Home, KPI Dashboard, BD Engine, Deal Board, light theme, live seed data) + reference-class synthesis (Bloomberg Terminal, Linear, Stripe Dashboard, Palantir Blueprint, Datadog).
**Rule for this document:** no code. Findings and plan only.

---

## Part 0 — Why the last three passes didn't land (honest post-mortem)

Passes 1–3 (typography sweep, component adoption, elevation/chip craft pass) each made the app *more consistent* — and consistency was genuinely improved. But they all operated at the **class level**: paddings, shadows, chip colors. None of them touched the four layers that actually produce the "school project" read:

1. the **typeface** (never loaded — see F1),
2. the **data the UI renders** (degenerate, obviously fake — F2/F3),
3. the **shell architecture** (Bootstrap-admin two-tone template — F5),
4. the **chart/instrument grammar** (decorative, not analytical — F6).

You can polish chips forever; if the app renders "REPLY RATE 400%" in a system fallback font inside a template shell, it will read amateur every time. This plan attacks those four layers directly.

---

## Part 1 — Diagnosis: eight root causes, ranked by damage

### F1 · The typeface doesn't exist ⚠ smoking gun
`tailwind.config.js` declares `Inter` and `JetBrains Mono`. **Neither font is loaded anywhere** — no `<link>`, no `@font-face`, no import. Every user sees their OS fallback (SF Pro on Mac, Segoe on Windows, Roboto on ChromeOS). Three passes of letter-spacing tuning were performed against a font that isn't installed. The app has *no typographic identity at all* — the single highest-leverage fix in this entire document, and it costs ~20 lines.

### F2 · Degenerate data rendered as if it were rich ⚠ the credibility killer
Observed on KPI Dashboard, live:
- **"REPLY RATE 400%"** with "▲300.0% vs 30d ago" — a rate over 100%, displayed proudly.
- **"▲1000.0%"** delta on new leads.
- A **donut chart with exactly one segment** ($50,000 of $50,000 — a solid blue ring conveying zero information).
- An **inverted funnel**: Contacted 1 → Replied 4 → Proposal 4 → Won 1, with "400% →" stage conversion.
- A **speedometer gauge** rendering "1 of 4 handoffs".

No Fortune-500 tool ever shows these, because they all enforce **small-sample discipline**: rates require a minimum denominator, deltas are suppressed or annotated at low n, single-category compositions never render as donuts, funnels validate monotonicity. Our dashboards happily render mathematical nonsense — this, more than any CSS, is what screams "demo built in a weekend."

### F3 · The data announces itself as fake
- Every visible row is prefixed **"[DEMO]"** — Quantum Ledger, Solaris Finance, Marta Keller.
- Pipeline = exactly **$100,000**, exactly **5 deals**, all "Added Jul 13", all "Hot lead / Begin outreach".
- Every SLA row is "BREACHED 283h" (12 days — operationally implausible as a steady state).
A platform representing "years of work" cannot look serious while rendering ten rows of labeled fiction. Seed data is a design surface.

### F4 · Consumer-grade information density
- Home: four stat cards each holding **one digit** ("5", "6", "5", "1") in ~250×130px of whitespace. Bloomberg shows ~40 data points in that area; even Stripe shows 6–8.
- Deal Board: built for 50 cards, holds 5; two columns are permanent "Drop deals here" placeholders; ~40% of the viewport is empty canvas.
- Big friendly greeting header ("Good morning, Nik" + explainer sentence) consumes the most valuable screen band.
Emptiness reads as absence of substance. Density must be earned by content (see F3/Part 5) *and* designed for (compact instruments, multi-datum tiles).

### F5 · Template shell
The frame is the classic Tailwind-admin starter: **dark navy header bar + white content + floating rounded cards on pale grey**, sidebar with a literal "Navigation" heading, rounded search pill, red notification bubble. Linear, Stripe, Datadog, Retool all moved to **single-tone chrome** years ago: header, sidebar and canvas in the same tonal family, separated by hairlines, with density and typography carrying hierarchy. The two-tone shell alone dates the app by a decade.

### F6 · Charts are decorations, not instruments
- Sparklines are context-free squiggles with a terminal dot (no axis, no range, no baseline).
- Donut + gauge chosen where composition/count made them meaningless.
- Funnel bars lack axis, units and validation.
- No crosshairs, no unit-aware tick formatting, inconsistent number formats between charts.
Real dashboards treat every chart as an instrument: axes, gridlines, units, formatted ticks, hover crosshair, and an honest "not enough data" state.

### F7 · Register whiplash in the copy
Two voices fight each other:
- **Duolingo voice**: "1-day streak 🔥", quota ring that "fills up", "Everything below opens in place", permanent tutorial sentence under the Deal Board.
- **Debug voice**: unexplained glyph codes on deal cards — `O 3d P86`, `T K L C O` circles, `25th` pills — with no on-surface legend.
Institutional tools speak one register: calm, declarative, precise. Gamification (if kept at all) lives in a personal corner, not on the flagship band. Codes are fine — Bloomberg is full of them — but they come with a discoverable legend and consistent mono treatment.

### F8 · Soft consumer geometry
`rounded-xl` (12px) on every card, generous shadows, pill-shaped everything. The reference class uses 4–8px radii, hairline borders as the primary structure, and shadows only on overlays. Softness reads friendly-consumer; crispness reads professional-instrument.

---

## Part 2 — Reference-class research: what the benchmark products actually do

*(Note: live web access was down during this session; this synthesis is from documented, well-known design writeups and first-hand product analysis of each tool. Every claim below is verifiable against the products themselves.)*

**Linear** (the modern gold standard for "feels expensive")
- Inter with hand-tuned dynamic letter-spacing per size; near-black on near-white (no pure #000/#FFF); LCH-derived gray ramp so grays don't drift blue/yellow between themes.
- Structure from **hairline borders and background steps, not shadows**; shadows reserved for overlays/popovers.
- 4–6px radii, 28–32px control heights, 13px UI base size.
- One accent color total; state communicated with 6px dots and text color, almost never filled chips.
- Motion: 100–200ms ease-out, opacity+transform only; nothing bounces.

**Bloomberg Terminal** (the density benchmark)
- Information density is the product: every screen region carries data; whitespace is a bug, not a luxury.
- Mono/tabular numerals everywhere; amber/green/red carry exactly three meanings and nothing else.
- Command codes (function keys, mnemonics) are first-class *and documented on-surface* (autocomplete shows what each code does) — precedent for our Cmd+K codes and card glyphs, done right.
- A persistent **status region** (connection, time, market state) frames the whole session — the single strongest "this is a serious terminal" signal.

**Stripe Dashboard** (the formatting benchmark)
- Ruthless number formatting discipline: compact display ($12.4K), exact on hover, 1 decimal max on percentages, consistent everywhere.
- Charts: thin lines, subtle gridlines, unit-aware axes, restrained single-hue usage; tables are first-class instruments with perfect alignment-by-type.
- Empty/low-data states are designed: explanatory, action-oriented, never a lonely donut.

**Palantir Blueprint** (the dense-enterprise toolkit)
- Explicitly designed for "data-dense desktop web apps": 30px default / 24px compact controls, 12–13px type, minimal radii (2–3px), structure from 1px borders and flat surface steps.
- Dark theme is a **first-class parallel palette** (surface steps: #1C2127 → #252A31 → #2F343C), not an inversion trick — relevant because our inverted-token scheme is the root of the recurring dark-mode bugs (invisible text incidents in passes 1–3).

**Datadog / Grafana** (the chart-grammar benchmark)
- One shared axis/scale/tooltip engine across every chart; crosshair synced across panels; units declared per metric; y-axes always labeled; "no data" is an explicit designed state.

**The eight laws** (synthesis — every law above is violated by the current app):
1. Load a real typeface; numbers are always tabular.
2. Chrome is single-tone; hairlines separate, shadows only float overlays.
3. One accent color; color = state, never decoration.
4. Density is earned: every screen region carries data or gets removed.
5. Every chart is an instrument: axes, units, formatted ticks, honest empty states.
6. Never render a statistic the data can't support (small-n discipline).
7. One voice: calm, declarative, precise; every code has an on-surface legend.
8. The data must look alive: realistic distributions, real timestamps, visible history.

---

## Part 3 — The target identity

**"Regulated-markets workstation."** Not a SaaS marketing dashboard, not a Bloomberg cosplay. The mental model: *the tool a listing desk at a serious exchange would build for itself after ten years.* Calm light theme for daytime CRM work, true terminal-dark for the ops crowd, mono numerals, a status bar, command codes with a legend, and instruments that refuse to lie.

---

## Part 4 — The specification

### 4.1 Typography (P0 — do first, transforms everything)
- **Self-host Inter Variable** (`woff2`, `font-display: swap`) + **JetBrains Mono** (400/500/600). No CDN (works offline, no layout flash, no third-party dependency).
- Global: `font-feature-settings: 'cv05','cv11'` (open digits/l), `-webkit-font-smoothing: antialiased`.
- **`font-variant-numeric: tabular-nums` is the default on every table, stat, ticker and chart label** (the existing `.num-tabular` utility becomes structural, not opt-in).
- Type ramp (total, no exceptions): 11 mono-label / 12 secondary / 13 body & UI / 14 emphasized / 16 section / 20 page title / 26–32 hero numerals (Inter, weight 600, `tracking -0.02em`).
- Letter-spacing follows Inter dynamic-metrics: positive at 11px (+0.005em), negative from 16px up.
- Mono is semantic: tickers, ids, scores, timestamps, command codes, log lines — nothing else.

### 4.2 Color
- Collapse to: **1 neutral ramp** (9 steps, LCH-even, slightly cool), **1 accent** (the LCX cyan — used for interactive/selected/link only), **4 semantic** (green/amber/red/blue for state only), plus the existing validated 8-color categorical chart palette.
- Light theme: text #17181C-ish near-black; canvas one step off-white; cards white; hairlines ~#E7E8EC.
- **Dark theme rebuilt as a parallel palette with explicit surface steps** (canvas → surface → raised → overlay), replacing the inverted-token trick that caused every dark-mode bug this month. This is the structural fix that ends the `dark:text-ice` class of regressions permanently.
- Delete every remaining decorative tint. Color audit gate: any hue on screen must answer "what state does this encode?"

### 4.3 Geometry & elevation
- Radii: **4px controls/chips · 6px cards/panels · 8px overlays**. `rounded-xl`/`rounded-full` retired except avatars and status dots.
- Structure from 1px hairlines + surface steps. Light-theme card shadow reduced to near-invisible (`0 1px 2px / 4%`); `shadow-overlay` only on popovers/drawers/dialogs.
- Control heights 28px (dense) / 32px (default); 8px spacing grid; section rhythm 24px.

### 4.4 The shell (the identity move)
- **Single-tone chrome.** Header, sidebar, canvas in one tonal family, hairline-separated. Kill the navy band.
- **Header (48px) becomes a command bar:** breadcrumb path (`BD / Deal Board`), centered omnisearch (`Cmd+K — search or type a code`), right side: environment badge (`LIVE`/`DEMO`), sync state, notifications, identity.
- **New: 24px bottom status bar** — API connection dot + latency, last data refresh, UTC clock, app version, active identity, active scenario (SIM) indicator. Cheap to build, and the single strongest "serious terminal" signal we can add.
- **Sidebar:** remove the "Navigation" heading; 28px rows at 13px; section labels 11px mono uppercase; active = accent text + 2px left rail (not a filled navy pill); collapsed-mode icons already work — keep.
- KpiTicker moves into the status bar or dies — it currently competes with the header.

### 4.5 Chart engine (rebuild the kit as instruments)
One shared core (`chartCore`: scales, ticks, unit formatters, crosshair, tooltip) consumed by every chart. Rules enforced *in the components*:
- Y-axes always ticked and unit-formatted ($12K, 40%, 14d); time axes with real date ticks.
- Subtle gridlines (4–6% opacity), crosshair on hover, tooltip shows exact values.
- **Composition:** never a donut for n=1 series; horizontal stacked bar for ≤5 categories.
- **Gauges are banned.** Progress = number + thin bar.
- Sparklines get baseline + min/max range shading, or they're dropped.
- Every chart has a designed insufficient-data state: "4 samples — needs 10 for a trend."

### 4.6 Small-n discipline layer (the credibility fix)
A single policy module the whole app must route metrics through:
- **Rates need a floor:** denominator < 8 → display absolute form ("3 of 4 replied"), never a percentage. A rate can never exceed 100% by construction; if inputs disagree, show the inputs.
- **Deltas need history:** baseline < 5 → show "—" with tooltip, not "▲1000%".
- **Funnels validate monotonicity;** violation → render stage-count columns instead.
- Trend charts require ≥ 8 points; below that, show the points as dots + table.
- One shared `formatMoney/formatPct/formatDuration/formatCount` set (see 4.8) — no chart formats its own numbers.

### 4.7 Tables → data grid
- BD Engine (7,870 rows) moves to a virtualized grid (TanStack Table + virtualizer): sticky header, 36px rows (compact 30px toggle), keyboard row-cursor (J/K already exist — keep), column resize, per-user visible-column sets, saved sorts with the existing saved screens.
- Column grammar: text left / numbers right-mono / dates right / single-glyph state centered. Score cells: number + 32px inline bar — the "92 / 100" boxes retire (the "/100" repeated 20× per screen is pure noise).
- Row hover = surface step; selection = accent rail + wash. All tables app-wide adopt the same grammar.

### 4.8 Formatting bible (one module, no local overrides)
- Money: compact ≥$10K ($48.5K, $1.2M), exact on hover/detail; never eight digits on a dashboard.
- Percent: 1 decimal max, no trailing ".0".
- Dates: relative <7d ("3d ago"), then "Jul 13"; full timestamp on hover; all times UTC-labeled.
- Durations: 4h / 3d / 2w — SLA ages cap at "7d+" (a "BREACHED 283h" chip is an incident, not a table row).
- IDs/tickers/codes: always mono, always uppercase.

### 4.9 Motion
- 120ms hover / 160ms state / 200ms drawers-popovers, ease-out, opacity+transform only.
- Live numbers (ticker, SLA ages) change via 300ms crossfade — things that update without announcement feel alive; things that jump feel broken.
- No bounces, no scale-ups, no skeleton shimmer on sub-200ms loads.

### 4.10 Voice & register
- One register: calm, declarative, specific. Sentence case everywhere including buttons.
- **Kill on sight:** "1-day streak", ring-fills-up copy, permanent tutorial sentences (→ one-time dismissible hint or `?` popover), "Everything below opens in place."
- Home greeting band shrinks to one 13px line: `Friday, Jul 17 · 6 need attention · quota 0/20` — the hero space goes back to data.
- **Glyph legend:** every code (`P86`, `T·K·L·C·O`, momentum glyphs, percentile pills) gets a hover tooltip *and* a `?`-invocable legend popover per surface. Codes without a legend are debug output; codes with one are Bloomberg.

---

## Part 5 — Data credibility (why polish was invisible)

The UI can't outrun its data. Two workstreams, both cheap, both transformative:

**5a · Seed realism.** Replace the 5-deal seed with a lived-in dataset: 45–60 deals across all stages, power-law package values ($15K–$450K, no round $100K totals), created dates spread over 9 months, mixed SLA states (mostly fresh, few aging, one breached), realistic project names *without* the `[DEMO]` prefix (demo-ness is signaled once — an env badge in the header — not on every row), 6 months of forecast history so every trend chart has a real series, win/loss history with plausible reasons. One script, run everywhere.

**5b · Evidence of life.** Years-of-work platforms show their history: audit entries surfaced on entities ("scored 2 Mar · enriched 14 May · 3 outreach cycles"), notes with authors and dates, per-user saved views that persist, "last synced 2m ago" stamps. Most of this data already exists in the schema — it's a surfacing problem, not a build problem.

---

## Part 6 — Page-by-page prescriptions (flagships)

**Home → "Desk"**: greeting band → one status line. Four one-digit cards → two multi-datum instruments: *Queue* (immediate/high-priority/follow-ups/replies as one 4-row mini-table with ages) and *Pipeline* (value, stage distribution micro-bar, week delta). SLA list keeps rank but ages obey the formatting bible. Quota/streak module shrinks to one line in "Your day". Live ops feed keeps the terminal treatment — it's the right instinct, now it matches the status bar.

**KPI Dashboard → "Instruments"**: every metric passes through the small-n layer (this alone deletes the 400%/1000%/donut/gauge embarrassments). Stat tiles become label + hero numeral + delta + baseline sparkline with range. Funnel → validated horizontal bar-steps with counts and carried-%. Revenue composition → stacked horizontal bar. Telegram gauge → "1 of 4 moved" + thin progress bar.

**Deal Board**: columns size to content — empty stages collapse to a 40px rail with a count (they expand on drag, so "Drop deals here" placeholders die). Board header: open value, weighted value, stage totals in one dense strip. Tutorial sentence → `?` popover. Cards keep the pass-3 hierarchy; glyphs get the legend.

**BD Engine**: the virtualized grid (4.7). Filters compress to one 32px row + saved-screen chips. Disclaimer banner → one-line footnote above the footer. Keycap legend stays — it's already the most professional element in the app.

**Everything else** inherits the system automatically (shell, fonts, grid grammar, formatters) — no bespoke passes needed; that's the point of fixing the bones instead of the chips.

---

## Part 7 — Execution plan (built for your token budget)

| Phase | Scope | Size | Why this order |
|---|---|---|---|
| **P0** | Fonts self-hosted + geometry tokens (radius/shadow/hairline rebalance) + formatting bible module | S | Highest leverage per token in the codebase; everything after inherits it |
| **P1** | Shell: single-tone chrome, command-bar header, status bar, sidebar refit | M | The identity move; app-wide, one agent, disjoint files |
| **P2** | Small-n policy module + seed realism script (web + api) | M | Kills every nonsense statistic; makes all later visual work visible |
| **P3** | Chart engine core + KPI/Home/WinLoss adoption | M | Depends on P0 formatters + P2 data |
| **P4** | Data grid: BD Engine + table grammar app-wide | M | Independent of P3; can run parallel with it |
| **P5** | Dark theme rebuilt as parallel palette (ends inverted-token bug class) | M | After P1 so it's built on the new shell |
| **P6** | Voice sweep + legends + Home/DealBoard recomposition + both-theme QA gate | S–M | Last mile |

- Each phase = one focused session with the standard gate (tsc, vitest, build, both-theme screenshots). No phase depends on more than the previous one; P3/P4 parallelize.
- Rough sequencing for budget: P0 alone is a visible step-change and is small. If budget is tight, ship P0+P1+P2 first — those three *are* the "no longer a school project" threshold. P3–P6 take it to Fortune-500.

## Part 8 — Acceptance checklist (binary, screenshot-verified)

1. DevTools shows Inter var + JetBrains Mono actually loaded (network tab, woff2).
2. Zero percentages on screen with denominator < 8; zero deltas without baseline; zero single-segment donuts; zero gauges.
3. No row anywhere contains the string "[DEMO]".
4. Header/sidebar/canvas are one tonal family; hairlines only.
5. Status bar shows connection, sync age, UTC clock, version, identity.
6. Every numeral on a dashboard is tabular; every chart y-axis has formatted, unit-aware ticks.
7. Every glyph/code has a hover explanation and a per-surface legend.
8. No permanent tutorial copy; no streak/gamification language on flagship surfaces.
9. Empty kanban stages collapse; no "Drop deals here" placeholder at rest.
10. Dark theme: zero contrast failures on a full-app sweep (parallel palette, not inversion).
11. The dataset shows ≥9 months of history with non-round values everywhere.
12. The blind test: a screenshot of Home or KPI, shown cold to someone who knows Linear/Stripe/Datadog, does not get identified as a template app.
