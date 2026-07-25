# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> a11y ratchet >> the first tab stop bypasses the shell chrome
- Location: e2e/smoke.spec.ts:140:3

# Error details

```
Error: the stop after the skip link is still outside <main>

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Skip to content" [active] [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - banner [ref=e5]:
    - link "LCX USA" [ref=e6] [cursor=pointer]:
      - /url: /
    - button "Switch workspace" [ref=e8] [cursor=pointer]:
      - generic [ref=e9]: SALES ENGINE
      - img [ref=e10]
    - navigation "Breadcrumb" [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: /
        - generic [ref=e15]: Deal Board
    - button "Search or type a command… ⌘K" [ref=e17] [cursor=pointer]:
      - img [ref=e18]
      - generic [ref=e21]: Search or type a command…
      - generic [ref=e22]: ⌘K
    - generic [ref=e23]:
      - generic "Local development environment" [ref=e24]: LOCAL
      - button "Notifications" [ref=e27] [cursor=pointer]:
        - img [ref=e28]
      - button "Switch to dark mode" [ref=e31] [cursor=pointer]:
        - img [ref=e32]
      - button "N Nik" [ref=e35] [cursor=pointer]:
        - generic [ref=e36]: "N"
        - generic [ref=e37]: Nik
        - img [ref=e38]
  - status [ref=e40]:
    - img [ref=e41]
    - generic [ref=e45]: Connection degraded
    - generic [ref=e46]: The network is up but the API is not answering. Reads are served from local state and may be stale. Governed actions stay unavailable until the connection returns — every gate reads its inputs at the moment of the write, so a queued action would be judged against truth that has since changed.
  - generic [ref=e47]:
    - complementary [ref=e48]:
      - navigation [ref=e49]:
        - generic [ref=e50]:
          - button "Pipeline" [expanded] [ref=e51] [cursor=pointer]:
            - text: Pipeline
            - img [ref=e52]
          - generic [ref=e54]:
            - link "BD Engine" [ref=e55] [cursor=pointer]:
              - /url: /bd-pipeline
              - img [ref=e56]
              - generic [ref=e60]: BD Engine
            - link "Exchange Gaps" [ref=e61] [cursor=pointer]:
              - /url: /exchange-gaps
              - img [ref=e62]
              - generic [ref=e66]: Exchange Gaps
            - link "Deal Board" [ref=e67] [cursor=pointer]:
              - /url: /deal-board
              - img [ref=e69]
              - generic [ref=e71]: Deal Board
            - link "Deal Desk" [ref=e72] [cursor=pointer]:
              - /url: /deal-desk
              - img [ref=e73]
              - generic [ref=e76]: Deal Desk
            - link "Targets" [ref=e77] [cursor=pointer]:
              - /url: /targets
              - img [ref=e78]
              - generic [ref=e80]: Targets
        - generic [ref=e81]:
          - button "Outreach" [expanded] [ref=e82] [cursor=pointer]:
            - text: Outreach
            - img [ref=e83]
          - generic [ref=e85]:
            - link "Outreach Ops" [ref=e86] [cursor=pointer]:
              - /url: /outreach-ops
              - img [ref=e87]
              - generic [ref=e90]: Outreach Ops
            - link "Send Queue" [ref=e91] [cursor=pointer]:
              - /url: /send-queue
              - img [ref=e92]
              - generic [ref=e95]: Send Queue
            - link "Handoff Queue" [ref=e96] [cursor=pointer]:
              - /url: /outreach
              - img [ref=e97]
              - generic [ref=e99]: Handoff Queue
            - link "Claim Library" [ref=e100] [cursor=pointer]:
              - /url: /claim-library
              - img [ref=e101]
              - generic [ref=e104]: Claim Library
        - generic [ref=e105]:
          - button "My Desk" [expanded] [ref=e106] [cursor=pointer]:
            - text: My Desk
            - img [ref=e107]
          - generic [ref=e109]:
            - link "My Tasks" [ref=e110] [cursor=pointer]:
              - /url: /tasks
              - img [ref=e111]
              - generic [ref=e114]: My Tasks
            - link "Notes & Docs" [ref=e115] [cursor=pointer]:
              - /url: /notes
              - img [ref=e116]
              - generic [ref=e119]: Notes & Docs
            - link "Keyboard Card" [ref=e120] [cursor=pointer]:
              - /url: /cheat-card
              - img [ref=e121]
              - generic [ref=e123]: Keyboard Card
            - link "Integrations" [ref=e124] [cursor=pointer]:
              - /url: /integrations
              - img [ref=e125]
              - generic [ref=e132]: Integrations
            - link "Settings" [ref=e133] [cursor=pointer]:
              - /url: /settings
              - img [ref=e134]
              - generic [ref=e137]: Settings
      - generic [ref=e139]:
        - generic [ref=e140]:
          - img [ref=e141]
          - generic [ref=e143]: LCX Field Notes
        - paragraph [ref=e145]: Every closed deal makes tomorrow’s queue smarter.
      - button "Collapse sidebar" [ref=e157] [cursor=pointer]:
        - img [ref=e158]
    - main [ref=e160]:
      - status "Loading page" [ref=e162]:
        - status "Loading cards" [ref=e166]
        - status "Loading table" [ref=e183]
  - contentinfo [ref=e219]:
    - generic "API unreachable — retrying every 60s" [ref=e220]: API DOWN
    - 'generic "UI p95 — what you actually feel. PAINT 19ms (budget 100ms): intent → screen showing local state. SETTLE 19ms: intent → every authoritative region resolved. Cache hits 0% of paints. 2 samples this session." [ref=e222]': UI 19/19MS
    - generic [ref=e223]: INTERNAL · NOT LEGAL ADVICE · US COUNSEL SIGN-OFF REQUIRED
    - generic "Coordinated Universal Time" [ref=e224]: 06:09:44 UTC
    - generic "Build version" [ref=e225]: v0.1.0
    - generic "Signed in as Nik" [ref=e226]: "N"
```

# Test source

```ts
  64  |      * it holds with or without a database.
  65  |      */
  66  |     for (const [path, heading] of [
  67  |       ['/deal-board', /deal board/i],
  68  |       ['/bd-kpis', /kpi dashboard/i],
  69  |       ['/win-loss', /win ?\/ ?loss/i],
  70  |     ] as const) {
  71  |       await page.goto(path);
  72  |       /*
  73  |        * The trailing `.first()` on the COMBINED locator is load-bearing, and its
  74  |        * absence was a real flake caught in Phase 7 — this spec failed roughly one
  75  |        * run in six with "strict mode violation: resolved to 2 elements".
  76  |        *
  77  |        * `a.first().or(b.first())` is not "one element": `.or()` matches the union,
  78  |        * so when BOTH sides are present it resolves to two and `toBeVisible()`
  79  |        * throws on strict mode instead of passing. Both sides are routinely present
  80  |        * here — the OfflineBanner says "…the API is not answering. Retrying…",
  81  |        * which matches `/retry/i`, and it appears asynchronously after the first
  82  |        * failed health ping, i.e. it races the heading it is meant to substitute
  83  |        * for. The assertion wanted "either of these exists", so collapse the union
  84  |        * to one element and ask whether THAT is visible.
  85  |        */
  86  |       const resolved = page
  87  |         .getByRole('heading', { name: heading })
  88  |         .first()
  89  |         .or(page.getByText(/could not|unavailable|failed|try again|retry|no .* yet/i).first())
  90  |         .first();
  91  |       await expect(resolved, `${path} rendered neither its heading nor a named state`).toBeVisible();
  92  |       // And never the raw Suspense fallback still on screen after settling.
  93  |       await expect(page.locator('body')).not.toHaveText(/^\s*$/);
  94  |     }
  95  |   });
  96  | });
  97  | 
  98  | test.describe('a11y ratchet', () => {
  99  |   // Dependency-free guard: every interactive control must have an accessible
  100 |   // name, and every field a label/placeholder. Verified clean today across
  101 |   // Deal Board (130 buttons) and BD Engine (74) — this keeps it that way.
  102 |   for (const path of ['/', '/deal-board', '/bd-pipeline', '/bd-kpis']) {
  103 |     test(`no unlabeled controls on ${path}`, async ({ page }) => {
  104 |       await goToDesk(page, path);
  105 |       await page.waitForLoadState('networkidle').catch(() => {});
  106 |       const unlabeled = await page.evaluate(() => {
  107 |         const name = (el: Element) =>
  108 |           (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
  109 |         const btns = [...document.querySelectorAll('button')].filter((b) => !name(b)).length;
  110 |         const fields = [...document.querySelectorAll('input,select,textarea')].filter((i) => {
  111 |           const id = i.getAttribute('id');
  112 |           const lbl = id && document.querySelector(`label[for="${id}"]`);
  113 |           return !lbl && !i.getAttribute('aria-label') && !i.getAttribute('placeholder') && !i.getAttribute('title');
  114 |         }).length;
  115 |         return { btns, fields };
  116 |       });
  117 |       expect(unlabeled.btns, 'buttons without an accessible name').toBe(0);
  118 |       expect(unlabeled.fields, 'form fields without a label').toBe(0);
  119 |     });
  120 |   }
  121 | 
  122 |   /**
  123 |    * Bypass Blocks (WCAG 2.4.1), added in Phase 7 and ratcheted here because the
  124 |    * defect it fixes is invisible to anyone using a mouse.
  125 |    *
  126 |    * Measured before the skip link existed: reaching the first control inside the
  127 |    * page content took 24 Tab presses on EVERY route — 6 top-bar controls, 17
  128 |    * sidebar destinations, then the sidebar collapse toggle — and the shell
  129 |    * re-renders on navigation, so the cost recurred on every page. Counted on /,
  130 |    * /bd-pipeline, /deal-board and /command-deck; identical on all four.
  131 |    *
  132 |    * The assertion is behavioural rather than "a skip link element exists",
  133 |    * because the two ways this feature ships broken both leave the element in
  134 |    * place: it can be unreachable (not first in the tab order), or activating it
  135 |    * can scroll without moving focus — which happens whenever the target is not
  136 |    * focusable, and then the next Tab returns to the top bar as if nothing
  137 |    * happened. Checking where focus actually lands is the only check that fails
  138 |    * for either.
  139 |    */
  140 |   test('the first tab stop bypasses the shell chrome', async ({ page }) => {
  141 |     await goToDesk(page, '/deal-board');
  142 | 
  143 |     await page.keyboard.press('Tab');
  144 |     const first = await page.evaluate(() => {
  145 |       const a = document.activeElement as HTMLElement | null;
  146 |       return { tag: a?.tagName, text: (a?.textContent ?? '').trim(), href: a?.getAttribute('href') };
  147 |     });
  148 |     expect(first.tag, 'the first tab stop is not a link').toBe('A');
  149 |     expect(first.href, 'the first tab stop does not target the main landmark').toBe('#main-content');
  150 | 
  151 |     // Activating it must MOVE focus into the landmark, not merely scroll to it.
  152 |     await page.keyboard.press('Enter');
  153 |     await expect
  154 |       .poll(() => page.evaluate(() => document.activeElement?.id), {
  155 |         message: 'activating the skip link did not move focus to <main id="main-content">',
  156 |       })
  157 |       .toBe('main-content');
  158 | 
  159 |     // And the next Tab must land INSIDE main — i.e. the chrome really was skipped.
  160 |     await page.keyboard.press('Tab');
  161 |     const inside = await page.evaluate(
  162 |       () => !!document.getElementById('main-content')?.contains(document.activeElement),
  163 |     );
> 164 |     expect(inside, 'the stop after the skip link is still outside <main>').toBe(true);
      |                                                                            ^ Error: the stop after the skip link is still outside <main>
  165 |   });
  166 | });
  167 | 
  168 | test.describe('inspector interaction (ontology)', () => {
  169 |   test('opens a deal inspector and Escape closes it', async ({ page }) => {
  170 |     await goToDesk(page, '/deal-board');
  171 |     const pill = page.locator('button[title^="Likelihood:"]').first();
  172 |     // If the API is down there are no cards — skip rather than fail the ratchet.
  173 |     if (await pill.count()) {
  174 |       await pill.click();
  175 |       await expect(page.getByRole('heading', { name: 'DEAL' })).toBeVisible();
  176 |       await page.keyboard.press('Escape');
  177 |       await expect(page.getByRole('heading', { name: 'DEAL' })).toBeHidden();
  178 |     }
  179 |   });
  180 | });
  181 | 
```