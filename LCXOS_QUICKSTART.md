# LCXOS — quick start

**Read time: three minutes. You will not need it again.**

Everything below is also inside the app: press **`?`** anywhere, or **⌘/** if you are
mid-typing. That version is generated from the live build, so it is never out of date
with what you are actually running. This file exists for the five minutes before you
have the app open.

---

## 1. Install (once)

1. Open the DMG, drag **LCXOS** to Applications.
2. First launch: **right-click the app → Open**, then confirm.

**If you already have `LCX TERMINAL.app`, delete it.** The rename means this DMG is a
fresh install rather than an update — macOS identifies an app by its bundle name, so the
two sit side by side instead of one replacing the other. Your sign-in is unaffected: the
credential is keyed to the bundle identifier, which deliberately did NOT change.

That second step is macOS Gatekeeper, and it is expected. The app is ad-hoc signed, not
Developer-ID signed, so macOS has no certificate to check it against. It is **once per
Mac**, not once per launch. (If you would rather not see it at all, that needs an Apple
Developer certificate — see the note at the end.)

**Updates do not work yet, and they fail quietly rather than complaining.** The app checks
on launch against a GitHub release channel that does not exist — the repo is private and
has no releases — so the check throws. It does **not** show you anything: a launch-time
failure goes to the shell log only, because a warning on every single launch that no
operator can act on trains you to ignore the toast layer, and that is the same layer the
governance refusals use. The cost of that choice, stated plainly: a desk that has quietly
stopped receiving updates looks identical to one that is current. Use **Check for
Updates…** in the menu to find out — that path *does* speak, because someone is waiting
for the answer.

*An earlier version of this page said you get "a warning toast every launch". That was
true when written and was fixed a phase later; the sentence outlived the behaviour.*

Two things have to happen before self-update is real: a release has to be cut, and the
channel has to move somewhere unauthenticated, because the updater sends no credentials
and a private repo's download URL requires them. Until then, new builds arrive as a DMG
from Nik.

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
nobody inherits your access. Cached response *bodies* go too — sign-out now waits for
the IndexedDB clear to commit before the page navigates away, where it used to fire the
clear and navigate in the same breath and lose the race. Two honest limits on that: the
wait is bounded at two seconds, so a storage layer that hangs or refuses will not trap
you on a desk you asked to leave (in that case the bytes stay, still namespaced per
operator, so the next person cannot be *served* them). And the desk passcode is shared
by design, so signing out is not the same as locking someone out.

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

**On four tables** — the BD pipeline lead table, product intelligence, competition and
the product &amp; asset registry ledger:

- **↑ ↓** move between rows, **Home / End** jump to the ends, **↵** opens the row.
- **⇥** treats the whole table as **one** stop, in and out. It does not walk 200 rows.
- **← →** reach the buttons *inside* the row you are on — **on the lead table only.**
  The other three put no buttons in a row, so there is nothing there for these keys to
  reach. They are not broken; they have no target.

Two exceptions worth knowing. On the registry ledger, **↵** opens the row's drawer, and
the two buttons inside that drawer stay ordinary **⇥** stops — so that table is one stop
*plus the drawer you opened*, which is what a disclosure panel should be. And on
competition, the projected **LCX USA** row at the bottom is not a cursor position: it is
a static comparison with nothing to open, so **End** stops at the last real competitor.

The app's remaining tables still make every row its own Tab stop and ignore the arrows.
An earlier version of this page said all ranked lists behaved the same way, and a later
one said only the lead table did; both were true when written and neither is now.

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
be faster — plus anything you had picked up and have gone back to the mouse on, and
anything you own but have not used in a long time. At most three, worst first. It
appears once there is something to show, and only when you open it: nothing here
notifies you, and no number goes down while you are away. The app will also mention a
faster key in passing, at most a few times, and then stop — if you keep using the
mouse, that is an answer. Dismissing one of those stops the interruption for good; it
does not hide the key from this page if you come looking for it.

## 7. Print the card

**/cheat-card** is one page, generated from the same tables the app runs on, with the
build's manifest hash on it. Print it, put it next to the screen. If the hash on paper
does not match the app, the card is from an older build.

---

### If something is wrong

- **"API DOWN" in the status bar** — reads may be served from cache; governed writes are
  unavailable until it returns. Three surfaces label a cached figure with its age — **My
  desk**, the **KPI dashboard**, and **listing readiness** — and the chip appears only
  when the figure is *not* live. Everywhere else a cached number still looks identical to
  a live one, so there the banner is your only signal. Writes being blocked is deliberate: the gates
  read their inputs at the moment of writing, so a queued write would be judged against
  stale information. Nothing you typed is lost.
- **A panel is stuck** — press **`?`**. The Escape section lists exactly what is open,
  in the order presses will close it. If something is on screen and *not* in that list,
  that is a bug worth reporting, and naming the panel is enough. There are two exceptions,
  and they are the same exception twice: a panel that deliberately owns no keys, so that
  the ones you triage with keep working.
  - The **First run** card in the bottom-left corner on your very first sign-in, which
    walks you through the `g` chords and `f` while they still work. Dismiss it with the
    **Skip** button on the card, one **Tab** away.
  - The **evidence pane** on the right, if you docked it with **⌘\\**. It owns no keys for
    the same reason — ↑↓, ↵ and the queue letters stay on the table beside it — so Escape
    does not reach it and it is not in the Escape list. **⌘\\** again puts the evidence
    back in a drawer, and the pane's own header shows that key next to its close button.
    It only appears on a window at least 1424px wide.
- **The app will not open after an update** — the previous version is still in
  Applications' Trash-safe location; ask Nik. Update failures are the one area where the
  shell is not yet self-diagnosing.

### Known, and deliberate

- **Right-click → Open on first launch**, per Mac. Removing it needs an Apple Developer
  certificate (~$99/yr, Account Holder only). Nothing else is blocked on it.
- **Reads can be slower than 100ms.** Production sits behind ~165–195ms of fixed
  network latency before any of our code runs — it is geography, not something a faster
  query fixes. That is why reads are cached locally. Three surfaces now mark a cached
  value with its age (My desk, the KPI dashboard, listing readiness); the rest do not
  yet, so on those the age of a figure is still invisible.
