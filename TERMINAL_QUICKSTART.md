# LCX TERMINAL — quick start

**Read time: three minutes. You will not need it again.**

Everything below is also inside the app: press **`?`** anywhere, or **⌘/** if you are
mid-typing. That version is generated from the live build, so it is never out of date
with what you are actually running. This file exists for the five minutes before you
have the app open.

---

## 1. Install (once)

1. Open the DMG, drag **LCX TERMINAL** to Applications.
2. First launch: **right-click the app → Open**, then confirm.

That second step is macOS Gatekeeper, and it is expected. The app is ad-hoc signed, not
Developer-ID signed, so macOS has no certificate to check it against. It is **once per
Mac**, not once per launch. (If you would rather not see it at all, that needs an Apple
Developer certificate — see the note at the end.)

Updates install themselves. The app checks quietly on launch and only interrupts you if
there is something to install.

## 2. Sign in

Your **LCX email** and the **desk passcode**. Both are checked server-side; neither is
stored in the browser. On this Mac the credential lives in the macOS **Keychain**, so
you can inspect or revoke it in Keychain Access like any other password.

If you share a Mac: signing out wipes every local trace — filters, notes, desk state,
cached reads. Nobody inherits your session.

## 3. The four keys that matter

| Key | What it does |
|---|---|
| **⌘K** | The command line. Find any object, then act on it. This is the one to learn. |
| **`?`** | What can I do *here*, right now — generated for the screen you are on. **⌘/** if you are typing. |
| **`g` then a digit** | Jump to a workspace. `g 2` is SALES ENGINE, `g 4` is REGULATORY. |
| **esc** | Back out of one thing. Always exactly one. It never navigates away or discards work in progress. |

In the app (not a browser tab) you also get **⌥Space** to summon the desk from anywhere
on the Mac, and **⌘0–6** for the workspaces. Those ⌘ chords do *not* work in a browser
tab — the browser keeps ⌘1–9 for its own tabs — which is why `g` exists and works in
both.

## 4. Doing something, end to end

Press **⌘K**, type enough of an object's name to find it, press **↵**. Pick the verb.
Fill the fields. **↵**.

That is the whole grammar: **object → verb → parameters → enter.** There is no separate
place to go for each kind of work.

**When it refuses.** A governed action can be blocked — you are not an approver, the
workspace is not yours, a premortem is required first. The refusal tells you *what to do
next*, not just that it failed. That sentence is the useful part; read it rather than
retrying.

**When it says nothing changed.** Some actions succeed without changing anything —
tracking a project that is already tracked. You will see "nothing changed" rather than a
success tick, on purpose. If the record did not move, you should not be told it did.

## 5. Ranked lists

The queue, the pipeline, the deal board — anywhere rows are ranked:

- **↑ ↓** move between rows, **Home / End** jump to the ends, **↵** opens the row.
- **⇥** treats the whole table as **one** stop, in and out. It does not walk 200 rows.

Careful on the queue: **`s`** snoozes and **`d`** disqualifies the row you are on. Those
are real, immediate, single-letter actions. (This is also why `j`/`k` are *not* bound to
movement — a grammar where some bare letters scroll and others mutate a record is one
that eventually disqualifies a lead you meant to scroll past.)

## 6. Two things you can turn on

**Settings → The Feel.** Confirmation sounds and trackpad haptics, both **off** by
default. There is a *Sample* button for each, so you can hear and feel them before
deciding. Haptics need a Force Touch trackpad; on anything else they are silently
inert.

Motion follows your macOS **Reduce Motion** setting automatically — you do not need to
tell the app twice.

**Settings → Your keyboard.** What you still do with the mouse, and the key that would
be faster. It appears once there is something to show. The app will also mention a
faster key in passing, at most a few times, and then stop — if you keep using the
mouse, that is an answer.

## 7. Print the card

**/cheat-card** is one page, generated from the same tables the app runs on, with the
build's manifest hash on it. Print it, put it next to the screen. If the hash on paper
does not match the app, the card is from an older build.

---

### If something is wrong

- **"API DOWN" in the status bar** — reads may be served from cache and are marked as
  such; governed writes are unavailable until it returns. This is deliberate: the gates
  read their inputs at the moment of writing, so a queued write would be judged against
  stale information. Nothing you typed is lost.
- **A panel is stuck** — press **`?`**. The Escape section lists exactly what is open,
  in the order presses will close it. If something is on screen and *not* in that list,
  that is a bug worth reporting, and naming the panel is enough.
- **The app will not open after an update** — the previous version is still in
  Applications' Trash-safe location; ask Nik. Update failures are the one area where the
  shell is not yet self-diagnosing.

### Known, and deliberate

- **Right-click → Open on first launch**, per Mac. Removing it needs an Apple Developer
  certificate (~$99/yr, Account Holder only). Nothing else is blocked on it.
- **Reads can be slower than 100ms.** Production sits behind ~165–195ms of fixed
  network latency before any of our code runs — it is geography, not something a faster
  query fixes. That is why reads are cached locally and why the app tells you when a
  value came from cache.
