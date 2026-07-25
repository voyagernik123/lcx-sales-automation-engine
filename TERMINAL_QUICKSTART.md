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

**Updates do not work yet, and today they complain about it.** The app checks on launch
against a GitHub release channel that does not exist — the repo is private and has no
releases — so the check fails and you get a warning toast every launch. Two things have
to happen before self-update is real: a release has to be cut, and the channel has to
move somewhere unauthenticated, because the updater sends no credentials and a private
repo's download URL requires them. Until then, new builds arrive as a DMG from Nik.

## 2. Sign in

Your **LCX email** and the **desk passcode**. Both are checked server-side.

**Where the credential is kept, accurately.** It goes to the macOS **Keychain** — you
can inspect or revoke it in Keychain Access like any other password — *and* to the
webview's `localStorage`, in cleartext, at
`~/Library/WebKit/com.lcx.terminal/WebsiteData/.../localstorage.sqlite3` (mode `0644`).
The Keychain copy is redundant, not exclusive: `localStorage` is what the API client
actually reads. An earlier version of this page said "neither is stored in the browser",
which was simply false, and it is the kind of false that matters — anyone with your user
account can read the desk passcode out of that file. `apps/desktop/README.md` has the
long version.

If you share a Mac: signing out clears your session, filters, notes and desk state, and
nobody inherits your access. Two honest caveats — cached response *bodies* can survive
on disk, because the page navigates away before the IndexedDB clear commits; they are
namespaced per operator, so the next person cannot be served them, but the bytes are
there. And the desk passcode is shared by design, so signing out is not the same as
locking someone out.

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

**On the BD pipeline lead table** — and, honestly, only there for now:

- **↑ ↓** move between rows, **Home / End** jump to the ends, **↵** opens the row.
- **← →** reach the buttons *inside* the row you are on.
- **⇥** treats the whole table as **one** stop, in and out. It does not walk 200 rows.

The other tables (product intelligence, competition, the product matrix) still make
every row its own Tab stop and ignore the arrows. An earlier version of this page said
all ranked lists behaved the same way; they do not yet.

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

- **"API DOWN" in the status bar** — reads may be served from cache; governed writes are
  unavailable until it returns. Note the cache is *not* labelled per value yet, so a
  cached number looks identical to a live one — the banner is your only signal. This is deliberate: the gates
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
  query fixes. That is why reads are cached locally. The app does **not** yet mark which
  values came from cache — that affordance is designed and unbuilt.
