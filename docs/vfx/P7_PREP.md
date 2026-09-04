# P7 · LIVENESS — preparation (written 2026-09-04 while the P6 sweep ran)

Plan: "the truth arriving as light — on arrival the rooms that changed light up in rank order across the stage, the changed
figures bloom once, the ticker turns over; then everything is perfectly still until the next change. Nothing pulses, spins or
breathes." Built: the S4 arrival choreography rendered in the stage and the charts; the consequential-motion ratchet extended.
Gate: CSS motion at rest 0; rAF at rest 0; the arrival sweep measured as ONE bounded sequence.

## What exists (read, not assumed)
- ONE arrival driver: `lib/useArrival.ts` — `useArrivalStore` {watch, revealed, since, unavailable, sweeping, reading}. On
  arrival (fresh session, or a return after ≥ 5 min hidden) it reads `/v1/watch?since=<watermark>`, rolls the <Fig> marks
  (S6), sets `revealed 0`, `sweeping true`, and `WatchStrip` (the ONE mount of `useArrival()`) calls `step()` once per
  heartbeat (ARRIVAL_STEP_MS 250) until `revealed === items.length`; reduced motion reveals everything in one step.
- Items are RANKED (WATCH_RANK: money → liability → deadline → activity), capped at WATCH_CAP 12; `byWorkspace[room]` carries
  {changed, top}. The WatchStrip reveals `items.slice(0, revealed)` — the ticker ALREADY turns over on the sequence.
- Stage.tsx reads `revealed` and `watch` and REDRAWS on each step (`useEffect(drawRef, [revealed, watch, entitlements])`),
  but lights every changed room at full glow from the first frame the watch exists — the redraws change nothing visible.
  Room glow = `roomGlow({changed, here})` (size .9–2.5, intensity .22–1); the entered room's +0.25 eases in with the room
  MOVE (`arrival` 0→1 over STAGE_MOVE_MS via startMotion 'user-driven'), a different thing from the watch arrival.
- Charts bloom once on arrival (P5 `useArrivalBloom`, six keyed sites); <Fig> deltas answer "since I was away" (S6).
- Ratchets: motion at rest 0 / rAF loops 0 / max intervals 2 are measured by the instrument on every capture; the redraw
  contract forbids a renderer scheduling a frame it does not draw (Stage draws synchronously on invalidate — a microtask).

## Design (decided now so the build does not re-plan)
1. STAGE, rank-ordered lighting, DISCRETE and driven by the existing counter — no new loop, no rAF: for each room,
   `firstIndex(room) = watch.items.findIndex(it => it.workspace === room)`; the room's glow is drawn iff
   `firstIndex >= 0 && revealed > firstIndex`, or, for a room with `changed > 0` and no ranked item (the `unranked` tail),
   iff `!sweeping`. The rooms therefore light one after another IN THE ITEMS' RANK ORDER, on the same heartbeat steps the
   ticker turns over on — one choreography, two surfaces. The stage redraw that already happens per step now shows it.
2. BLOOM ONCE: on the step a room lights (`revealed === firstIndex + 1`), draw its glow at size ×1.35 and intensity
   ×1.25 (clamped under STAGE_LUMINANCE_MAX by roomGlow's bound); on the next step it settles. Discrete, bounded, no tween.
   The entered room's move-arrival ease is untouched.
3. STILLNESS: nothing else changes. After the last step `sweeping` is false and the stage holds its frame (already true).
4. THE RATCHET EXTENDED — measured, not asserted: the instrument (fixtures on, the watch fixture has 3 ranked items in 3
   rooms) records per capture `arrival = { items, steps: revealed at rest, stageDraws }` where `stageDraws` is a new
   read-only counter `__LCX_STAGE_FRAMES` (draw() increments it; nothing in the product reads it) sampled at the watch's
   arrival and at rest. Bounded means: `steps === items` and `stageDraws ≤ items + 2` (the arrival frame and the settle).
   The gallery row states it. `oneWatch.test.ts` already pins the single driver; add a unit test on the pure function
   `roomLitAt(watch, revealed, sweeping)` (extract it to stageScene.ts beside roomGlow) — rank order, unranked tail, reduced
   motion (everything lit at once), no watch (P3 behaviour: all held rooms lit by `changed`).
5. WHAT NOT TO BUILD: no per-step fade (frames between steps would be a scheduled animation — the exact thing the ratchet
   refuses), no pulsing, no idle breath, no "spinner while reading" (the arrival is the motion, not the wait).

## Sequence
extract `roomLitAt` + test → Stage glow loop uses it (+ bloom-once) → `__LCX_STAGE_FRAMES` → instrument `arrival` record →
peek /command-deck dark with fixtures (three rooms light in order across three captures? one capture at rest + the log of
steps) → full sweep → gate → commit → push → verify → P7 LIVE. Then P8 (hardening) per the plan.
