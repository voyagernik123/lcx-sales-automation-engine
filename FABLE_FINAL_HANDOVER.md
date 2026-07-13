# LCX Sales Automation Engine — FINAL HANDOVER

## CRITICAL: Read this entire document before writing a single line of code.

---

You are Fable. You have the repo. 75% of the work is done. 42,779 lines of code. 50 features. 27 database migrations. 208 passing tests. Build compiles green. Everything "works" but nothing is **connected end-to-end** and nothing looks like a Fortune 500 company built it.

Your job is to take this from "coded" to **shipped**. Not more features. **Connected. Polished. End-to-end.**

---

## CURRENT STATE — Brutal Truth

### What's GOOD
- Backend: Complete. Every API route, service, DB table, migration exists. Auth works. Rate limiting works. Error mapping (Postgres codes → proper HTTP 4xx) works.
- Frontend: 36 pages exist. Router wired. Zustand stores persist filters. API client handles auth + errors correctly.
- AI: 10 modules coded, all with deterministic fallback. LLM key turns them on automatically.
- Tests: 208 passing. Build green.

### What's BROKEN (you fix this)
1. **Pages are ISLANDS** — 36 pages that look like they were built by 36 different people. No visual consistency. No shared layout patterns. No polished dashboard feel.
2. **Customer360 is a GHOST** — page exists at `/customer/:id` but NO link from anywhere. Not in sidebar. Not in LeadDetail. Users will NEVER find it.
3. **LeadDetail is a 1,380-line MONOLITH** — it has deals, sequences, drafts, people, signals all inline. It does NOT bridge to DealBoard, DealDesk, or Customer360. Users are trapped in one page.
4. **All 6 integration services are MOCKS** — email sync, Twitter, calendar, chat monitor, web push, e-signature are stubs. They return hardcoded data. This is fine for demo but NOT for a real product.
5. **12+ migrations have ZERO seed data** — tables exist but empty. No demo leads, no deals, no tasks. Empty pages look like a bug.
6. **No real-time WebSocket/SSE notifications** — the "notification bell" only shows data from the daily rule sweep. No live handoff alerts, no live deal changes.
7. **KPI Dashboard is a STATIC list of cards** — no charts, no trendlines, no drill-down animation, no comparison periods. It's a `<div>` full of numbers.
8. **Kanban board has NO styling** — drag-drop works but cards are raw text. No color coding, no contact avatars, no value badges, no "days in stage" indicators.
9. **Board Report is a JSON dump styled with CSS** — not an actual PDF. No templating engine. No LLM-written exec summary (route exists, unused).
10. **No end-to-end user journey** — a user cannot: find a lead → enrich → score → add contact → enroll in sequence → handle handoff → create deal → advance stages → track KPIs in ONE smooth flow. Each step exists but the transitions are broken.

---

## WHAT YOU MUST BUILD

### Principle: Every page must look like it belongs to ONE product. Every feature must flow into the next. Every dashboard must have actual charts. Every integration must work or clearly show "Connect" with OAuth instructions.

---

## PHASE A: END-TO-END CONNECTIVITY (Week 1)

Fix the navigation and inter-page flow. This is the #1 problem.

### A1. Wire Customer360 into the navigation
- Add `Customer360` to the LeadDetail page header: a "360 View" button that links to `/customer/${id}`
- Add `Customer360` as an entry in the sidebar under "BD Engine" section
- The Customer360 page must load real project data from `/v1/projects/:id/360` and show ALL relationship history in one scrollable view with sections: Profile, Score, Deals, Outreach, Handoffs, Tasks, Notes, Documents, Timeline

### A2. Bridge LeadDetail to specialized pages
- In the DealSection of LeadDetail, add a button: "Open in Deal Desk" → `/deal-desk?projectId=${id}`
- In the DealSection, add a button: "View on Board" → `/deal-board`
- In the Sequences section, add a link: "Manage in Outreach Ops" → `/outreach-ops`
- In the People section, add "View 360" → `/customer/${id}`

### A3. Sidebar completeness
Add these missing routes to the sidebar:
- `/customer/:id` — labeled "Customer 360" (use `#` for generic, or show it contextually)
- `/notes/:projectId` — labeled "Notes & Docs" (show when project context is active)
- Actually, restructure sidebar into SECTIONS with headers:
  ```
  BD OPERATIONS
    BD Engine (/bd-pipeline)
    Exchange Gaps (/exchange-gaps)
    Deal Board (/deal-board)
    Deal Desk (/deal-desk)
    Outreach Ops (/outreach-ops)
    Send Queue (/send-queue)
    Handoff Queue (/outreach)
  
  INTELLIGENCE
    AI Console (/ai-tools)
    Win / Loss (/win-loss)
    Market News (/market-news)
    Market Map (/market-map)
    KPI Dashboard (/bd-kpis)
    Board Report (/board-report)
    Report Builder (/report-builder)
  
  CRM
    My Tasks (/tasks)
    Notes & Docs (/notes) — add project selector
    Integrations (/integrations)
  
  COMPLIANCE
    Claim Library (/claim-library)
    Audit Log (/audit-log)
  ```

### A4. End-to-end user journey
Build a "Quick Actions" floating button or a header toolbar that presents the current workflow step:
- Lead selected → actions: Enrich, Score, Find Contact, Enroll, View 360
- Contact found → actions: Enroll in Sequence, Add to Task
- Handoff created → actions: View Handoff, Generate Reply, Move to Telegram
- Deal created → actions: Advance Stage, Generate Proposal, Send for Signature
- Deal won → actions: Start Onboarding, Create Invoice

This creates a guaranteed flow users can follow without hunting through pages.

---

## PHASE B: FORTUNE 500 DASHBOARD POLISH (Week 2-3)

Every dashboard page needs real data visualization, not just text.

### B1. KPI Dashboard (`/bd-kpis`)
**Current state:** Static cards with numbers. No trends. No comparison. No charts.
**Required state:**
- Each metric card must show: current value + delta arrow (↑/↓) + period-over-period % change + sparkline (mini line chart showing last 7 days)
- Funnel: horizontal bar chart with color gradient (Contacted → Replied → Proposal → Won), each bar clickable to filter pipeline
- Revenue by stream: donut chart or stacked bar
- Reply rates: bar chart comparing rates by channel (email vs LinkedIn vs Telegram)
- Telegram conversion: gauge chart showing handoffs → moved to Telegram rate
- Weekly view: Gantt-style bar showing hot/stalled/overdue deal counts over time
- Date range picker at top: "Last 7 days" / "Last 30 days" / "QTD" / "YTD" / Custom
- Auto-refresh toggle (30s polling)

### B2. Board Report (`/board-report`)
**Current state:** Tables with CSS. No actual PDF.
**Required state:**
- Three tabs: Weekly Report / Monthly Report / Quarterly Report
- Each tab shows a full, formatted preview that looks like a real board deck
- "Download PDF" button that generates an actual PDF with proper page layout, header, footer
- "Send to Execs" button that emails the PDF to configured recipients via Resend
- Executive summary: auto-generated from KPI data (use the LLM endpoint if key available, otherwise template)
- Funnel section: visual pipeline with stage counts
- Revenue section: table with deltas
- Top 10 deals: table with project name, stage, value, owner
- Anomalies section: list of detected anomalies with severity badges
- BD performance section: leaderboard with per-member metrics

### B3. Deal Board (`/deal-board`)
**Current state:** Drag-drop works but styling is bare. No information density.
**Required state:**
- Each card must show: project name, ticker badge, package value (formatted as $20K), owner avatar/initials, days in current stage, priority score badge, last activity timestamp
- Columns must show: stage name, deal count, total pipeline value
- Color-coded by package type (listing=blue, marketing=green, liquidity=amber, dual=purple)
- "Won" column: green border + checkmark. "Lost" column: red border + X.
- Card click → slide-out detail panel with key deal info + "Open Lead" link
- Loading skeleton (animated gray placeholders, not text)
- Empty column: "Drop deals here" placeholder with dashed border and plus icon

### B4. Win/Loss Dashboard (`/win-loss`)
**Current state:** Tables with data. No visualization.
**Required state:**
- Big number cards at top: Overall Win Rate %, Deals Won, Deals Lost, Total Revenue Won
- Bar chart: win/loss by jurisdiction (EU vs US) with win rate % labels
- Bar chart: win/loss by package type
- Table: by source (ESMA, Pipeline, Top 100, etc.) with win rate column
- Top loss reasons: horizontal bar chart
- LLM narrative section (collapsible): AI-generated insights about what's working (uses Claude if key available, otherwise template)
- Time filter: All Time / Last Quarter / Last Month

### B5. Market Map (`/market-map`)
**Current state:** Raw SVG with circles. No interactivity beyond hover.
**Required state:**
- Zoom in/out buttons (SVG transform)
- Pan (drag to move the viewport)
- Legend that is always visible
- Band filter chips at top (click to filter)
- Listed on LCX toggle (show/hide already-listed)
- Tooltip on hover: project name, ticker, market cap formatted, priority score, band, exchange count
- Click → navigate to LeadDetail
- Min 800px wide, responsive to 600px
- Loading spinner overlay during data fetch

### B6. AI Console (`/ai-tools`)
**Current state:** Two boxes. Sentiment + objection. Functional but bare.
**Required state:**
- Four tabbed panels: Sentiment Analyzer / Objection Handler / Reply Drafter / Content Personalizer
- Each panel has: input area, "Run" button, results area with clear formatting
- Reply Drafter: select a project from dropdown, select touch index, get preview with copy button
- Objection Handler: input objection text → get suggested responses + matching claims
- LLM status indicator in header: green dot = key configured, gray dot = fallback mode
- "Configure LLM Key" prompt if key is missing (with instructions)

### B7. Market News (`/market-news`)
**Current state:** Cards with links. Functional.
**Required state:**
- Feed items sorted by relevance score (highest first)
- Filter chips: All / High Relevance Only / With Ticker Match
- Source filter: All / CoinDesk / CoinTelegraph / Regulatory
- Sentiment badge per article (positive/neutral/negative for LCX)
- "Daily Briefing" card at top: LLM-generated summary of today's top 5 stories (collapsible)
- Email digest configuration: toggle on/off, set recipients, set schedule

---

## PHASE C: INTEGRATION REALITY (Week 3-4)

Every integration page must work with real OAuth, not mocks.

### C1. Integrations Page (`/integrations`)
**Current state:** All mock/stub data. No real connections.
**Required state:**
- Each integration card shows: service logo, connection status (Connected / Disconnected with warning icon), last sync time
- Connected integrations: show a "Configure" button → opens settings (e.g., which calendar, which Twitter account)
- Disconnected integrations: show a "Connect" button → initiates OAuth flow or opens setup instructions
- For OAuth integrations (Gmail, Google Calendar, Twitter): implement proper OAuth callback endpoint, store refresh tokens encrypted, show token expiry
- For API key integrations (Resend, Crisp, SendGrid): show masked key + "Change" button
- Meeting booking links: generate personal booking link, copy to clipboard, show upcoming meetings
- Email sync: show recent threads, filter by project, compose new email
- Social mentions: show recent mentions with platform icon, sentiment badge, "Create Lead" button

### C2. Implement at least ONE real integration
Choose ONE of these and make it work end-to-end:
- **Google Calendar:** OAuth → list calendars → create events → webhook receiver for changes
- **Gmail:** OAuth → list threads → match threads to projects by email domain → display in CRM
- **Resend:** Already partially working — verify webhook signature, add domain verification status, add sending stats

### C3. Mock providers must be CLEARLY labeled
Every mock/stub must:
- Show a yellow "Demo Mode" banner at the top of the section
- Have a "Connect Real Account" button that opens OAuth or API key setup
- Use realistic data that looks like a real integration (not `mock-thread-0`)

---

## PHASE D: SEED DATA & DEMO EXPERIENCE (Week 4)

### D1. Create a seed script
Write `apps/api/src/seed/demo.ts` that populates:
- 2-3 sample users (Nik — admin, Sarah — BD Manager, Alex — BD Associate)
- 20 sample leads across all bands (immediate through archive) with real crypto project names, tickers, market caps, scores
- 5 sample deals in various stages (contacted, proposal, negotiating, won, lost)
- 3 sample handoffs (1 open, 1 in_progress, 1 resolved_won_path)
- 5 sample tasks (2 pending, 1 completed, 1 overdue)
- 3 sample sequences (1 active, 1 paused, 1 completed)
- Sample board report data
- Sample win/loss analytics data
- 5 notification records
- 2 invoice records (1 paid, 1 pending)

### D2. Empty state polish
Every page that shows "Loading…" or "No data" must show:
- A branded empty state illustration or icon (not just gray text)
- A clear description of what WILL appear here
- A CTA button ("Import Leads", "Create First Deal", "Enroll a Project")
- Never show a blank white page

---

## PHASE E: POLISH & DELIGHT (Week 4-5)

### E1. Global loading skeleton
Replace every `Loading…` text with an animated skeleton:
- Table skeleton: rows of gray rectangles with shimmer animation
- Card skeleton: box with pulse animation
- Chart skeleton: area-shaped gradient with pulse

### E2. Toast notifications everywhere
After every successful action, show a confirmation toast:
- "Lead enriched ✓"
- "Sequence enrolled ✓"
- "Deal advanced to Proposal ✓"
- "Invoice created ✓"

### E3. Keyboard shortcuts
- `Cmd/Ctrl+K` → open command palette (search projects, navigate pages)
- `Cmd/Ctrl+Enter` → submit current form
- `Esc` → close modal/drawer
- Already have `CommandPalette.tsx` — make it actually work

### E4. Dark mode consistency
Every new page must have `dark:` variants for ALL styles. No hardcoded colors that break in dark mode. Test every page in both modes.

### E5. Responsive breakpoints
Every page must work at:
- 1920px (desktop — full layout)
- 1366px (laptop — compact layout)
- 768px (tablet — single column, collapsible sidebar)
- Not required: mobile (this is a desktop tool)

### E6. Real-time notifications (WebSocket or SSE)
- Replace the 30s polling with Server-Sent Events from the API
- When a handoff is created, push a notification to the assigned user in real time
- When a deal stage changes, push to the deal board
- When a reply is received, push to the inbox
- The notification bell must update in real time (no page refresh)

---

## WHAT NOT TO DO

1. **Do NOT add new features.** 50 is enough. Polish what exists.
2. **Do NOT touch working backend logic.** The API services work correctly. If a route returns data, trust it. Focus on frontend.
3. **Do NOT change the database schema.** 27 migrations is final. No table changes.
4. **Do NOT refactor the AI modules.** They work. The LLM gating pattern (`llm.available`) is correct.
5. **Do NOT delete anything.** No file removals unless truly dead code.
6. **Do NOT change the scoring engine.** It passes 30 fixture tests with byte-identical output.

---

## VERIFICATION CHECKLIST (ship when ALL pass)

- [ ] Navigate between ALL pages using sidebar — no broken links
- [ ] LeadDetail → Customer360 link works
- [ ] LeadDetail → Deal Board link works
- [ ] LeadDetail → Deal Desk link works
- [ ] KPI Dashboard shows charts (not just text cards)
- [ ] Deal Board cards have full information density + color coding
- [ ] Board Report renders formatted sections
- [ ] AI Console has Reply Drafter + Content Personalizer tabs
- [ ] Integrations page shows connection status for each service
- [ ] At least ONE integration works with real OAuth
- [ ] Demo seed script populates data — run `npm run seed:demo`
- [ ] No empty pages after seeding — every page shows data
- [ ] Dark mode looks correct on all pages
- [ ] Loading skeletons appear (not text)
- [ ] Toast notifications fire on actions
- [ ] Sidebar has BD OPERATIONS / INTELLIGENCE / CRM / COMPLIANCE sections
- [ ] Build passes: `npm run ci-check`
- [ ] All 208 tests pass: `npm test`
- [ ] End-to-end user journey works: import → score → contact → enroll → handoff → deal → advance → won → KPI update
- [ ] Real-time notification bell updates without page refresh

---

## KEY FILE MAP (what to modify, not rewrite)

### Navigation (MUST MODIFY)
- `apps/web/src/components/layout/Sidebar.tsx` — restructure into sections, add missing links
- `apps/web/src/components/layout/AppLayout.tsx` — add notification bell, command palette, floating action bar
- `apps/web/src/pages/LeadDetail.tsx` — add bridge buttons to DealBoard, DealDesk, Customer360

### Dashboards (HEAVY UPGRADE)
- `apps/web/src/pages/KpiDashboard.tsx` — add charts, sparklines, deltas, date picker
- `apps/web/src/pages/BoardReport.tsx` — add tabs, PDF download, email, proper layout
- `apps/web/src/pages/DealBoard.tsx` — add card styling, color coding, info density
- `apps/web/src/pages/WinLoss.tsx` — add charts, big number cards, narrative section
- `apps/web/src/pages/MarketMap.tsx` — add zoom, pan, legend, toggle

### Integrations (MAKE REAL)
- `apps/web/src/pages/Integrations.tsx` — add connection status, OAuth flows, config panels
- `apps/api/src/integrations/calendar.ts` — implement Google Calendar OAuth (at least one real integration)
- `apps/api/src/integrations/twitter.ts` — implement Twitter OAuth or document setup clearly

### AI (ADD TABS)
- `apps/web/src/pages/AiTools.tsx` — add Reply Drafter + Content Personalizer tabs
- `apps/api/src/routes/ai.ts` — ensure all AI routes return proper error messages when LLM unavailable

### Seed (CREATE)
- `apps/api/src/seed/demo.ts` — NEW FILE: full demo data population
- `package.json` — add `"seed:demo": "npx tsx apps/api/src/seed/demo.ts"` script

### Real-time (ADD)
- `apps/api/src/index.ts` — add SSE endpoint or WebSocket server
- `apps/web/src/components/layout/NotificationBell.tsx` — connect to real-time events
- `apps/api/src/notifications/service.ts` — push on insert, not just daily sweep

### Global Polish (ADD)
- `apps/web/src/components/shared/LoadingSkeleton.tsx` — NEW FILE with table/card/chart skeletons
- `apps/web/src/components/shared/EmptyState.tsx` — enhance with illustrations and CTAs
- `apps/web/src/components/layout/CommandPalette.tsx` — make functional (search projects, navigate)
- Replace all `Loading…` text and bare error messages with skeleton/empty state components

---

## CONCLUSION

You have 42,779 lines of working code. 50 features. 27 migrations. 208 tests. Everything passes. What's missing is not more code — it's **connectivity, polish, and end-to-end flow**.

A Fortune 500 product is not about more features. It's about:
1. Every page feeling like it belongs to the same product
2. Every feature flowing naturally into the next
3. Every dashboard showing real visualizations, not text dumps
4. Every integration either working or clearly showing the setup path
5. No dead ends — every page links to the next logical page
6. Real data in the demo — not "No data yet" on 15 pages
7. Notifications that arrive in real time, not on page refresh
8. Loading states that look intentional, not broken

Build this. Ship this. This is the final handover.
