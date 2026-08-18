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

## 2 · Republish the desktop app · **v0.2.7's signature is invalid — auto-update is broken**

**What is fine:** the DMG download works. Anyone installing fresh gets a working 0.2.7 with the 3-D
layer in it. Nothing an operator can see is wrong.

**What is broken:** an already-installed desk cannot auto-update to it. I verified this by
downloading the published asset and checking it against the public key committed in
`tauri.conf.json` — the same key the app checks:

| release | asset | signature |
|---|---|---|
| v0.2.6 | 4,036,991 bytes | **verifies** ✓ |
| v0.2.7 | 4,129,761 bytes | **does not verify** ✗ — it is v0.2.6's signature |

Both carry the identical trusted comment `timestamp:1786438564` (11 August). The cause: `tauri build`
run without a usable signing key still writes a new tarball and **leaves the previous `.sig` beside
it**, and the publish script checked only that a signature existed and was 404 characters long. So it
published 0.2.6's signature over 0.2.7's bytes. An installed desk downloads it, fails verification,
and refuses to install — which looks exactly like a broken updater.

**I told you 0.2.7 was published and verified. That was me repeating the script's own weak check**
("signature 404 chars") instead of checking the signature. It cannot happen again: the publish script
now does a real Ed25519 verification against the committed key and refuses to publish otherwise —
proved by running it against the bad signature first, where it fails, before accepting a good one.

**Why I could not fix it myself:** your signing key is password-protected, and `tauri build` asks for
that password on the terminal. I ran the build; it got as far as
`failed to decode secret key: incorrect updater private key password` because a background process
has no terminal to answer on. I am not going to ask you for that password.

**What to do.** 0.2.8 is already prepared and committed — every version home bumped, the build
green, the DMG built. Publishing it fixes the problem outright, because an installed 0.2.6 desk will
jump straight to 0.2.8 and never see the broken 0.2.7. Run this **in your own terminal**, so the
password prompt has somewhere to appear:

```bash
TAURI_SIGNING_PRIVATE_KEY=~/.lcx-terminal/updater.key npm run build:dmg -w @lcx/desktop && npm run release -w @lcx/desktop
```

Type the key's password when it asks. If it publishes, the signature verified — that is now a
precondition, not a hope.

If you would rather not, say so and I will record it: fresh DMG installs keep working and auto-update
stays broken until a signed release goes out.

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

## 5 · ~~How many proxies sit in front of the API~~ — DONE by you, and it exposed a defect of mine

**You already set it.** `/health` now reports `throttleKey`, and production answered `xff-last-1`,
which is how I found out — the value had been invisible before.

**But setting it revealed a bug in the code that consumes it, and I put it there.** This file used to
tell you the value was "almost certainly 1". I gave you that number without checking the topology,
which is exactly what the source comment beside it warns against.

The throttle picked the client out of `X-Forwarded-For` by counting from the **left**. The left of
that header is the end a caller writes. So:

| request | header the API saw | key it used |
|---|---|---|
| honest | `realclient` | fell back to the shared bucket — the header was never used |
| forged | `1.2.3.4, realclient` | `1.2.3.4` — **the attacker's own value** |

An attacker rotating one header got a fresh failure budget on every request, while every honest
caller shared a single bucket. That is worse than not trusting the header at all, and it was live
from the moment the variable was set.

**Fixed:** it now counts from the right, so it reads only entries our own proxy wrote and a forged
prefix is ignored. Five different forged prefixes now produce one identical key, asserted in
`secondTierThrottle.test.ts`. Nothing for you to do — verify after the deploy if you like:

```bash
curl -s https://lcx-sales-api.onrender.com/health | grep throttleKey
```

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
