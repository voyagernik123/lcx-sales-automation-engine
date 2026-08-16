# What only Nik can do

Everything in this file needs a password, a permission, a human, or a product decision. None of it
can be done from a coding session, and none of it is waiting on more engineering.

Ordered by what unblocks the most. Each item says what it is, why it cannot be automated, and
exactly what to do.

---

## 1 · Run the operator trial · ~25 minutes · **do this one first**

**What it is.** The programme's own rule says a 3-D view only earns its place if a real operator
gets their answer at least as fast as they would from the flat table underneath it. Seven surfaces,
two trials each.

**Why not me.** I would be marking my own homework. A machine-reader substitute *was* built and run,
and it invalidated itself on four design defects — that write-up is in `docs/3d/e9/README.md`. The
clause needs a human who wants the answer for its own sake.

**How.**
```bash
open docs/3d/e9/RUNNING_THE_TRIAL.md
```

**If surfaces fail, that is a real result and we turn them off.** The gate exists precisely to stop a
showreel shipping as an instrument. Nothing in the codebase resists that outcome.

---

## 2 · The desktop signing key

**What it is.** `TAURI_SIGNING_PRIVATE_KEY` — the minisign key that signs the updater bundle.

**Current state.** The app **builds and runs on your Mac today**. `tauri build` completes the `.app`
under ad-hoc signing and fails only at the updater tarball. So this blocks *distribution to other
machines*, not the application itself.

**How.** Set it in your own environment and run the release. Do not send it to me and do not paste it
into a session:
```bash
export TAURI_SIGNING_PRIVATE_KEY="…"
npm run release -w @lcx/desktop
```

---

## 3 · The database password

**What it is.** The `DATABASE_URL` GitHub secret has the wrong password, so the nightly scheduled job
fails every run.

**Current state.** The job now diagnoses itself instead of dying silently — it prints
`WRONG PASSWORD IN THE DATABASE_URL SECRET`, and separately distinguishes a malformed URL and an
unroutable host. The IPv6/pooler problem that used to be tangled up with this is fixed.

**Watch out for.** `#`, `/` and `?` in a password break URL parsing and produce a *different* error
than a wrong password. If the password contains any of them, percent-encode it.

**How.** GitHub → repo → Settings → Secrets and variables → Actions → `DATABASE_URL`.

---

## 4 · Decide whether this desk reports forward marketing risk

**What it is.** A product decision, not a bug, and the one I most want an answer on.

The crisis-calendar surface (`/marketing/crisis`) is finished, correct, and **draws nothing** —
because marketing risk by day, channel and severity band is produced nowhere in this system. Not by
the crisis engine, which is text and gates. Not by the record compartment, which looks backwards.

**Why I did not "fix" it.** Inventing a fixture to light it up would put a picture of forward risk
into a document this repo's own source calls *a compliance record somebody keeps*, while the
underlying measurement does not exist. That is an absence rendering as a reading, which is the exact
failure the empty-state rules in `docs/phases/ABSENCES.md` are built to prevent.

**The decision.** Either this desk reports forward risk — in which case say what produces it, and the
renderer needs no further work — or it does not, and we delete the surface. Both are fine. The
current state, a finished thing waiting on data nobody has promised, is the only bad one.

---

## 5 · How many proxies sit in front of the API on Render

**What it is.** One line in `render.yaml`. I will not guess it, because guessing a hop count is
exactly what caused a security defect earlier in this programme.

**Why it matters.** A brute-force control needs to know which part of `X-Forwarded-For` a caller can
forge. Without the number it falls back to keying on the TCP peer, which is safe but blunt: behind a
proxy every caller looks like one address, so the throttle is coarser than it needs to be.

**How.** Confirm the number (almost certainly `1`) and add it under `envVars` in `render.yaml`:
```yaml
      - key: TRUSTED_PROXY_HOPS
        value: "1"
```

---

## 6 · Apple Developer enrollment

**What it is.** Without it, the first time anyone opens the desktop app macOS calls it unidentified
and warns them off. Notarization needs `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` (or the API-key
trio) in the build environment.

---

## 7 · Optional — Screen Recording permission

Only needed if you want a **photograph** of the desktop app running. Everything else about it is
already verified without it: the binary embeds this exact build, it launches, and its WebView was
measured to support every capability all the surfaces need.

System Settings → Privacy & Security → Screen Recording → enable for your terminal.

---

## Where to look for the current state

| question | file |
|---|---|
| what each 3-D surface actually does on screen, per theme | `docs/3d/FINAL_SCORECARD.md` |
| what the security review found and what is still open | `docs/3d/AUDIT_PENTEST.md` |
| what the QA pass found | `docs/3d/AUDIT_QA.md` |
| what the plan promised versus what shipped | `3D_VFX_100X_LIVE.md` section 8 |
| deliberate absences, including the risk feed | `docs/phases/ABSENCES.md` |
