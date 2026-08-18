# What only Nik can do

Everything in this file needs a password, a permission, a human, or a product decision. None of it
can be done from a coding session, and none of it is waiting on more engineering.

Ordered by what unblocks the most. Each item says what it is, why it cannot be automated, and
exactly what to do.

---

## 1 · ~~Run the operator trial~~ — OFF YOUR LIST. It cannot be validly run.

**Do not spend the twenty-five minutes.** You already spent them once on an instrument that was
printing its own answers, and that was my fault for not checking it before asking.

Two rounds have now been built and both were refuted on measurement. The reason is structural: every
relief frame prints its dataset in words, and the flat version is a table of the same data — so
whichever one you are shown first tells you what the next question is about, and with one person
there is no second group to balance it against. Rewording does not escape it.

**The finding, in plain terms:** on these surfaces the *labels* carry the answers, not the geometry.
So a race to answer questions can never show the third dimension paying for itself — it just times
you reading the same text twice in two arrangements. If we ever want that answer, the task has to
change (time someone *finding* one record among hundreds, with the labels turned off), and that is a
decision to make deliberately, not a chore to hand you.

Full record: `docs/3d/e9/TRIAL_REFUSED.md`. The trial page refuses to start, so nobody produces a
verdict from it by accident.

**What this costs us:** the eight relief views stay defaulted OFF, labelled "nobody has yet timed
whether it answers faster than this grid." That label is now true *and* known to be untestable as
written. Turning any of them on is a judgement call, and `docs/3d/FINAL_SCORECARD.md` is what to
make it from.

---

## 2 · ~~The desktop signing key~~ — DONE, 2026-08-18

`v0.2.7` is published and the updater endpoint serves it with a 404-character signature. The key was
at `~/.lcx-terminal/updater.key` the whole time and its public half matches the one committed in
`tauri.conf.json`. `TAURI_SIGNING_PRIVATE_KEY` takes a **path**, not the key's contents, so nothing
was ever pasted anywhere.

Worth knowing: **0.2.7 is the first release in this project's history that contains a 3-D layer.**
0.2.6 had none, and nothing in the app said so.

---

## 3 · Two database passwords, in two different places · **the only real chore left**

### 3a · Render — optional, and nothing is broken

**State: the API is UP and will stay up.** `DATABASE_URL` in Render still names the Supabase
*direct* host, which has no IPv4 address and cannot be reached from Render's free tier — so at every
boot the API derives the session-pooler form and uses that instead. `/health` says so:
`dbUrlSource: pooler-fallback`.

I previously told you this was "undiagnosed luck" and that a cold start "rolls the dice again".
**That was wrong.** The candidate list puts `eu-central-1` first and `aws-0` before `aws-1`, so the
host that works is the *first* one tried, every boot, deterministically. There is now a test that
fails if that ordering changes.

So this is hygiene, not risk: the dashboard no longer describes the running system, and the next
person to read it — including me in a later session — sees a string that cannot work.

```bash
bash scripts/go-live.sh --db
```

It re-proves the credential, puts the correct string on your clipboard, and now **offers to skip**
rather than lecturing you. Paste the clipboard string into Render → `lcx-sales-api` → Environment →
`DATABASE_URL` (select all first). Done when `/health` reads `dbUrlSource: env`.

**Do not re-copy from Supabase's Connect panel** — it defaults to the Direct connection, which is
how the unusable string got in three times.

### 3b · The GitHub Actions secret — this one is genuinely broken

The nightly scheduled job fails every run and says exactly why:
`WRONG PASSWORD IN THE DATABASE_URL SECRET`. It is a different store from Render's and I cannot read
or write it.

GitHub → repo → Settings → Secrets and variables → Actions → `DATABASE_URL`. Use the same string
`go-live.sh --db` puts on your clipboard.

Watch out: `#`, `/`, `?` and `%` in a password must be percent-encoded (`%23 %2F %3F %25`) or
everything after them is read as a fragment, path or query and the password is silently truncated —
which produces a *different* error than a wrong password and sends you somewhere else entirely.

---

## 4 · Decide whether this desk reports forward marketing risk

**A product decision, not a bug, and the one I most want an answer on.**

`/marketing/crisis` is finished, correct, and **draws nothing** — because marketing risk by day,
channel and severity band is produced nowhere in this system. Not by the crisis engine, which is
text and gates. Not by the record compartment, which looks backwards.

I did not invent a fixture to light it up: that would put a picture of forward risk into a document
this repo's own source calls *a compliance record somebody keeps*, while the measurement does not
exist. An absence rendering as a reading is the exact failure `docs/phases/ABSENCES.md` prevents.

Either this desk reports forward risk — say what produces it, and the renderer needs no further
work — or it does not, and we delete the surface. **Both answers are fine. The current state, a
finished thing waiting on data nobody has promised, is the only bad one.**

---

## 5 · How many proxies sit in front of the API on Render · 2 minutes, now checkable

**Why I will not guess it.** A brute-force control needs to know which part of `X-Forwarded-For` a
caller can forge. Guessing a hop count is what caused a security defect earlier in this programme.

**State: unset, therefore safe but blunt.** `/health` now reports `throttleKey: tcp-peer`, meaning
the header is not trusted at all and every caller behind the proxy shares one bucket.

Add it under `envVars` in `render.yaml` (almost certainly `1`):

```yaml
      - key: TRUSTED_PROXY_HOPS
        value: "1"
```

Then verify — this is the part that did not exist before:

```bash
curl -s https://lcx-sales-api.onrender.com/health | grep throttleKey
```

`xff-last-1` means it took. `tcp-peer` means it did not. No more setting a value in a dashboard and
having no way to read it back.

---

## 6 · ~~Apple Developer enrollment~~ — DECLINED 2026-08-18, deliberately

You said you are not buying it, and that is a fine decision, so it is recorded as one rather than
sitting on a list. The cost is one dialog the first time anyone opens the app on a machine; the way
past it is **right-click → Open** (double-clicking offers no such option). The updater is
minisign-signed and independent of Apple notarization, so auto-updates are unaffected.

---

## 7 · ~~Screen Recording permission~~ — NOT NEEDED

A `WKWebView.takeSnapshot` of our own view needs no macOS permission grant, and
`apps/desktop/scripts/verify-app-renders.mjs` uses exactly that: three surfaces measured at 1,076 /
2,637 / 3,624 distinct colours against 1 for a blank page.

---

## Where to look for the current state

| question | file |
|---|---|
| why the §7(b) trial cannot be run, and what that tells us | `docs/3d/e9/TRIAL_REFUSED.md` |
| what each 3-D surface actually does on screen, per theme | `docs/3d/FINAL_SCORECARD.md` |
| what the security review found and what is still open | `docs/3d/AUDIT_PENTEST.md` |
| what the QA pass found | `docs/3d/AUDIT_QA.md` |
| what the plan promised versus what shipped | `3D_VFX_100X_LIVE.md` section 8 |
| deliberate absences, including the risk feed | `docs/phases/ABSENCES.md` |
