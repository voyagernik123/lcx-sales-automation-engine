#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  RUN A COMMAND WITH CARGO ON PATH, SO THE DESKTOP BUILD DOES NOT DEPEND ON WHO STARTED IT.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *  `npm run build:dmg -w @lcx/desktop` failed for the owner and succeeded for an agent, on the same
 *  commit, minutes apart:
 *
 *    failed to run 'cargo metadata' ... No such file or directory (os error 2)
 *
 *  cargo was installed the whole time — /Users/nik/.cargo/bin/cargo exists. rustup appends its bin
 *  directory from a shell PROFILE, and nothing in ~/.zshrc, ~/.zprofile, ~/.profile or
 *  ~/.bash_profile mentions cargo (checked with grep -l: no file matched). So the owner's
 *  interactive zsh has never had ~/.cargo/bin on PATH; the agent's shell did. The build worked or
 *  did not depending on the ENVIRONMENT OF THE CALLER, and its error message pointed at a Rust
 *  install that was never broken — which sends the reader off reinstalling a toolchain instead of
 *  looking at PATH.
 *
 *  `scripts/go-live.sh:387-411` already solves exactly this, with a long comment explaining it. The
 *  knowledge existed in one script while the npm scripts everyone actually types kept the
 *  dependency. This removes it from the npm scripts, which is the only place it can be removed for
 *  every caller at once.
 *
 *  ── APPEND, DO NOT PREPEND ────────────────────────────────────────────────────────────────────
 *  go-live.sh PREPENDS ~/.cargo/bin. Prepending puts a `cargo install`-ed binary AHEAD of the
 *  workspace's node_modules/.bin, so a stray `tauri` in ~/.cargo/bin would silently replace the
 *  pinned CLI (@tauri-apps/cli 2.11.4) during a signed release. Measured today: `comm -12` over
 *  ~/.cargo/bin and the repo's node_modules/.bin returns nothing, so there is no collision on THIS
 *  machine — but the ordering costs nothing to get right and the failure it prevents is a release
 *  built by an unknown CLI version. We append, and only when cargo is not resolvable at all, so
 *  there is by construction nothing to shadow.
 *
 *  ── WHY A DIRECTORY GOES ON PATH, NOT AN ABSOLUTE PATH TO cargo ───────────────────────────────
 *  cargo is not the only Rust binary tauri needs — cargo itself shells out to `rustc`, and both
 *  live in the same rustup bin directory. Resolving `cargo` to an absolute path and passing it
 *  along would fix the first error and produce a second one for rustc. Putting the DIRECTORY on
 *  PATH brings rustc, rustup and the rest with it.
 *
 *  ── WHERE IT LOOKS, AND WHY THE LIST IS SHORT ─────────────────────────────────────────────────
 *    1. PATH             — if cargo already resolves, PATH is left BYTE-IDENTICAL. No-op by default.
 *    2. $CARGO_HOME/bin  — rustup's documented location when CARGO_HOME is set.
 *    3. ~/.cargo/bin     — rustup's default.
 *
 *  Deliberately NOT probed: /usr/local/bin, /opt/homebrew/bin, /opt/local/bin. A cargo installed by
 *  Homebrew or MacPorts sits in a directory that is on the default PATH by construction (/etc/paths,
 *  `brew shellenv`), so step 1 already finds it. The only installer that puts cargo somewhere the
 *  default PATH does not reach is rustup, and rustup's location is exactly (2)/(3). Keeping every
 *  candidate derived from the environment also means the test suite can control the ENTIRE search
 *  space with PATH/CARGO_HOME/HOME, instead of asserting things about whichever machine runs it. If
 *  some future host hides cargo elsewhere, set CARGO_HOME — that is the supported answer.
 *
 *  ── WHAT THE PROBE DOES NOT PROVE, STATED SO NOBODY OVERREADS IT ──────────────────────────────
 *  Finding an executable file named `cargo` is NOT proof that cargo works. On this machine
 *  ~/.cargo/bin/cargo is a SYMLINK TO `rustup` — a shim. If rustup has no default toolchain
 *  installed, that shim exists, is executable, and still fails. This wrapper does not run
 *  `cargo --version` to find out: the rustup shim will DOWNLOAD a toolchain on first use, and a
 *  build wrapper that reaches for the network to satisfy a precondition check is worse than the
 *  problem. When the shim is broken, rustup's own error text is clear about it, unlike tauri's.
 *
 *  ── SIGNALS ARE LEFT ALONE, DELIBERATELY ──────────────────────────────────────────────────────
 *  No SIGINT/SIGTERM handler is installed. Ctrl-C reaches the child directly because it shares this
 *  process group, exactly as it does today with `npm run tauri build`. Installing a no-op handler
 *  here would make Ctrl-C do NOTHING at all if the child also ignores it — a build nobody can stop
 *  is a worse failure than the orphan it would prevent.
 *
 *  Usage:  node scripts/with-cargo.mjs <command> [args...]
 *  Exit:   the child's exit code, verbatim; 128+signum if it was killed; 127 if the command does
 *          not exist; 1 if cargo cannot be found; 2 if called with no command.
 */
import { spawnSync } from 'node:child_process';
import { accessSync, constants as FS, statSync, writeSync } from 'node:fs';
import { constants as OS, homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const SELF = 'with-cargo';
const WIN = process.platform === 'win32';
const CARGO = WIN ? 'cargo.exe' : 'cargo';

/*
 * writeSync(2) and NOT process.stderr.write + process.exit().
 *
 * When stderr is a PIPE, process.stderr.write is asynchronous on POSIX, and process.exit() can
 * truncate or drop what was just written. The one message that matters here is the diagnostic
 * telling a human why their build stopped, so it is written with a synchronous fd write, and the
 * process ends by setting process.exitCode rather than by calling process.exit().
 */
const say = (line) => { try { writeSync(2, `${line}\n`); } catch { /* stderr closed; nothing to do */ } };

/** A directory named `cargo`, or a non-executable file, is not cargo. Both are checked. */
const isExecutableFile = (p) => {
  try {
    if (!statSync(p).isFile()) return false;
  } catch {
    return false;
  }
  if (WIN) return true;
  try {
    accessSync(p, FS.X_OK);
    return true;
  } catch {
    return false;
  }
};

/*
 * An EMPTY PATH entry means the current directory to POSIX. It is skipped here: resolving a build
 * toolchain out of whatever directory the caller happened to be in is a worse outcome than not
 * finding it. The consequence of skipping is at most one unnecessary append, which is harmless.
 */
const pathDirs = (raw) => String(raw ?? '').split(delimiter).filter((d) => d.length > 0);

const findOnPath = (raw) => {
  for (const dir of pathDirs(raw)) {
    const candidate = join(dir, CARGO);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
};

/** Every candidate is derived from the environment, so a test can control the whole search space. */
const candidateDirs = () => {
  const dirs = [];
  if (process.env.CARGO_HOME) dirs.push(join(process.env.CARGO_HOME, 'bin'));
  let home = null;
  try {
    home = homedir();
  } catch {
    home = null;
  }
  if (home) dirs.push(join(home, '.cargo', 'bin'));
  return [...new Set(dirs)];
};

const argv = process.argv.slice(2);
if (argv.length === 0) {
  say(`${SELF}: no command given.`);
  say(`${SELF}: usage: node scripts/with-cargo.mjs <command> [args...]`);
  process.exitCode = 2;
} else {
  const [command, ...args] = argv;
  const env = { ...process.env };
  let stop = false;

  if (findOnPath(env.PATH) === null) {
    const dirs = candidateDirs();
    const found = dirs.find((d) => isExecutableFile(join(d, CARGO)));
    if (found === undefined) {
      say(`${SELF}: cargo is not on PATH and was not found in any known location.`);
      say(`${SELF}: Tauri compiles a Rust binary, so the desktop app cannot build without it.`);
      say(`${SELF}: looked in: PATH, ${dirs.length > 0 ? dirs.join(', ') : '(no CARGO_HOME, no home directory)'}`);
      say(`${SELF}: install with:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`);
      say(`${SELF}: already installed elsewhere?  export CARGO_HOME=/path/to/cargo`);
      process.exitCode = 1;
      stop = true;
    } else {
      env.PATH = env.PATH && env.PATH.length > 0 ? `${env.PATH}${delimiter}${found}` : found;
      /*
       * VERIFY THE POST-CONDITION, do not assume the append achieved it. The property this wrapper
       * exists for is "cargo resolves from the child's PATH" — that is what gets checked, by walking
       * the PATH we are about to hand over, rather than trusting that appending a directory we
       * probed implies it.
       */
      const resolved = findOnPath(env.PATH);
      if (resolved === null) {
        say(`${SELF}: appended ${found} to PATH but cargo still does not resolve from it. Refusing to`);
        say(`${SELF}: hand tauri an environment it will fail in with a message about cargo metadata.`);
        process.exitCode = 1;
        stop = true;
      } else {
        say(`${SELF}: cargo was not on PATH; appended ${found} (using ${resolved})`);
      }
    }
  }

  if (!stop) {
    /*
     * stdio: 'inherit' IS THE LOAD-BEARING LINE.
     *
     * `tauri build` PROMPTS ON THE TERMINAL for the updater key's password. Anything that pipes or
     * captures stdio makes that prompt unanswerable — it fails with "Device not configured
     * (os error 6)" — and a release becomes impossible to cut. There is no `shell: true` either: it
     * would hand `--bundles app,dmg` and any path containing a space to a shell to re-split.
     */
    const child = spawnSync(command, args, { stdio: 'inherit', env, windowsHide: true });

    if (child.error) {
      if (child.error.code === 'ENOENT') {
        say(`${SELF}: could not run '${command}' — no such command on PATH.`);
        say(`${SELF}: PATH was: ${env.PATH ?? '(unset)'}`);
        process.exitCode = 127;
      } else {
        say(`${SELF}: could not run '${command}': ${child.error.message}`);
        process.exitCode = 1;
      }
    } else if (typeof child.signal === 'string' && child.signal.length > 0) {
      const num = OS.signals[child.signal];
      say(`${SELF}: '${command}' was killed by ${child.signal}`);
      process.exitCode = typeof num === 'number' ? 128 + num : 1;
    } else {
      /*
       * The child's code, VERBATIM. A wrapper that returns 0 for a failed build is how a broken
       * bundle gets published: the next step looks in the bundle directory and signs whatever is
       * lying there. `status` is null only when a signal killed the child, handled above; the
       * fallback is deliberately non-zero rather than optimistic.
       */
      process.exitCode = typeof child.status === 'number' ? child.status : 1;
    }
  }
}
