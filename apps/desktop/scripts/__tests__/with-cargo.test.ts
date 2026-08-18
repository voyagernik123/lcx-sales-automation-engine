/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  WHAT MUST BE TRUE OF THE BUILD WRAPPER, OR A RELEASE BECOMES IMPOSSIBLE OR WRONG.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *  `scripts/with-cargo.mjs` sits between `npm run build:dmg` and `tauri build`. Four of its
 *  properties are load-bearing, and each one has already cost a release attempt today:
 *
 *    STDIO INHERITANCE   `tauri build` PROMPTS on the terminal for the updater key's password. A
 *                        wrapper that pipes stdio makes the prompt unanswerable — "Device not
 *                        configured (os error 6)" — and no signed build can be produced at all.
 *    EXIT CODE           A wrapper that returns 0 for a failed build turns failure into apparent
 *                        success, and the publisher then signs whatever is lying in the bundle
 *                        directory. That exact shape shipped once already: publish-release.mjs
 *                        checked the .sig file existed and was 404 characters long, and published
 *                        v0.2.6's signature over v0.2.7's bytes.
 *    ARGV PASS-THROUGH   `--bundles app,dmg` decides whether a .dmg exists to publish.
 *    PATH RESOLUTION     the entire reason the file exists.
 *
 *  ── HOW STDIO INHERITANCE IS PROVED, AND WHY THE OBVIOUS TEST WOULD LIE ───────────────────────
 *  Asserting that the source text contains `stdio: 'inherit'` proves nothing. Nor is "the child saw
 *  the bytes I wrote" sufficient: a wrapper that opened PIPES and copied bytes both ways would pass
 *  that, while still destroying the tty the password prompt needs.
 *
 *  So inheritance is proved by FILE DESCRIPTOR IDENTITY. The wrapper is given a real FILE as fd 0
 *  and another as fd 1. The child reports fstat(0) and fstat(1). If the fds were truly inherited,
 *  the child's fd 0 is the same open file description — a regular file, with the same inode as the
 *  file on disk. A wrapper that piped would hand the child a FIFO, and the inode would not match.
 *  A pipe cannot masquerade as a file, so this distinguishes the two implementations.
 *
 *  ── ANCHORED TO THIS FILE, NOT TO THE WORKING DIRECTORY ───────────────────────────────────────
 *  `apps/desktop/scripts/version-agreement.test.ts` used `resolve(process.cwd(), '..', '..')` and
 *  failed with ENOENT on a path OUTSIDE the repo whenever it was run from the repo root, three times,
 *  with a message that blamed tauri.conf.json. Every path here is derived from import.meta.url, and
 *  this suite is verified from BOTH the repo root and apps/desktop.
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRAPPER = resolve(HERE, '..', 'with-cargo.mjs');
const NODE = process.execPath;

/** A scratch tree per run: stub executables, a fake rustup home, and files to use as fds. */
let TMP = '';
/** Directory holding the stub commands. Always on the child's PATH so a bare name resolves. */
let BIN = '';
/** A fake `~` whose .cargo/bin holds a fake cargo — this is what rustup's layout looks like. */
let FAKE_HOME = '';
/** A home with no .cargo at all, for the "cargo is nowhere" case. */
let EMPTY_HOME = '';

/**
 * Write an executable node script with an ABSOLUTE-PATH shebang.
 *
 * `#!/usr/bin/env node` would need node on the stripped PATH these tests use; hard-coding
 * process.execPath removes that dependency, so a PATH assertion can never accidentally pass or fail
 * because of how node itself was found.
 */
const stub = (name: string, body: string): string => {
  const p = join(BIN, name);
  writeFileSync(p, `#!${NODE}\n${body}\n`, 'utf8');
  chmodSync(p, 0o755);
  return p;
};

beforeAll(() => {
  TMP = mkdtempSync(join(tmpdir(), 'with-cargo-test-'));
  BIN = join(TMP, 'bin');
  FAKE_HOME = join(TMP, 'fake-home');
  EMPTY_HOME = join(TMP, 'empty-home');
  for (const d of [BIN, join(FAKE_HOME, '.cargo', 'bin'), EMPTY_HOME]) {
    spawnSync('mkdir', ['-p', d]);
  }
  // A fake cargo. Never executed by these tests — the wrapper only ever probes for it.
  const fakeCargo = join(FAKE_HOME, '.cargo', 'bin', 'cargo');
  writeFileSync(fakeCargo, '#!/bin/sh\necho fake cargo\n', 'utf8');
  chmodSync(fakeCargo, 0o755);

  /*
   * report.mjs — the stub that stands in for `tauri`. It prints ONE json line to fd 1 describing
   * everything the wrapper is supposed to have arranged: its argv, its env, and the identity of the
   * file descriptors it was handed.
   */
  stub(
    'report.mjs',
    `import { fstatSync, readFileSync } from 'node:fs';
     const fd = (n) => { try { const s = fstatSync(n); return { file: s.isFile(), fifo: s.isFIFO(), tty: s.isCharacterDevice(), ino: s.ino }; } catch (e) { return { err: String(e.code ?? e) }; } };
     let stdinText = null;
     try { stdinText = readFileSync(0, 'utf8'); } catch (e) { stdinText = 'ERR:' + String(e.code ?? e); }
     process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), env: process.env, fd0: fd(0), fd1: fd(1), stdinText }) + '\\n');`,
  );

  /* exit-with.mjs — exits with the code named in argv[0]. Pins exit-code propagation. */
  stub('exit-with.mjs', 'process.exitCode = Number(process.argv[2]);');

  /* marker.mjs — proves whether the child ran AT ALL, by leaving a file behind. */
  stub('marker.mjs', "import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[2], 'ran');");

  /*
   * ask.mjs — the password prompt, in miniature. Writes a prompt, reads ONE line from fd 0, echoes
   * it back. Driven through the wrapper over a pipe, this is the "can the prompt be answered"
   * experiment; it hangs forever if stdin does not reach the child.
   */
  stub(
    'ask.mjs',
    `process.stdout.write('password: ');
     let buf = '';
     process.stdin.on('data', (d) => {
       buf += d;
       const nl = buf.indexOf('\\n');
       if (nl !== -1) { process.stdout.write('GOT[' + buf.slice(0, nl) + ']\\n'); process.exit(0); }
     });`,
  );

  /*
   * self-kill.mjs — dies BY A SIGNAL rather than by exiting. It keeps a timer alive so the only way
   * this process can end is the signal it sends itself; if the signal were somehow not delivered the
   * test times out, which is a failure, rather than exiting 0 and reading as a pass.
   */
  stub('self-kill.mjs', "process.kill(process.pid, 'SIGTERM'); setTimeout(() => {}, 30_000);");
});

afterAll(() => {
  if (TMP.length > 0) rmSync(TMP, { recursive: true, force: true });
});

/** PATH with the stubs and node, and NOTHING that could contain a real cargo. */
const stubPath = (): string => [BIN, dirname(NODE)].join(delimiter);

type Run = { status: number | null; stdout: string; stderr: string };

const runWrapper = (args: string[], env: Record<string, string>, stdio?: unknown[]): Run => {
  const r = spawnSync(NODE, [WRAPPER, ...args], {
    env,
    encoding: 'utf8',
    stdio: (stdio as never) ?? ['ignore', 'pipe', 'pipe'],
  });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

const reported = (run: Run): { argv: string[]; env: Record<string, string>; fd0: Record<string, unknown>; fd1: Record<string, unknown>; stdinText: string } => {
  const line = run.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (line === undefined) throw new Error(`stub printed no json. stdout=${JSON.stringify(run.stdout)} stderr=${JSON.stringify(run.stderr)}`);
  return JSON.parse(line);
};

/**
 * Run the stub WITHOUT the wrapper, same env, same bare-name resolution.
 *
 * This is the baseline for every "the wrapper changed nothing else" claim. Comparing the child's env
 * against the env literal fails for a reason that has nothing to do with the wrapper: macOS injects
 * __CF_USER_TEXT_ENCODING into every posix_spawn'd process, so the child always has one key more
 * than was passed in. Diffing against an unwrapped child spawned the same way cancels that out, and
 * anything that remains is attributable to the wrapper and to nothing else.
 */
const baselineEnv = (env: Record<string, string>): Record<string, string> => {
  const r = spawnSync('report.mjs', [], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) throw r.error;
  return reported({ status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }).env;
};

/** Resolve a name against a PATH string exactly as execvp would, for asserting on the CHILD's view. */
const resolveOn = (pathValue: string, name: string): string | null => {
  for (const dir of pathValue.split(delimiter).filter((d) => d.length > 0)) {
    const p = join(dir, name);
    try {
      if (statSync(p).isFile()) return p;
    } catch { /* next */ }
  }
  return null;
};

describe('with-cargo: PATH resolution', () => {
  it('finds cargo in ~/.cargo/bin when it is absent from PATH, and the CHILD can resolve it', () => {
    const env = { PATH: stubPath(), HOME: FAKE_HOME };
    expect(resolveOn(env.PATH, 'cargo')).toBeNull(); // the owner's exact situation

    const run = runWrapper(['report.mjs'], env);
    expect(run.status).toBe(0);

    const childPath = reported(run).env.PATH;
    // The property that matters is about the CHILD's environment, not about our own bookkeeping.
    expect(resolveOn(childPath, 'cargo')).toBe(join(FAKE_HOME, '.cargo', 'bin', 'cargo'));
    expect(run.stderr).toContain('cargo was not on PATH');
  });

  it('APPENDS the directory rather than prepending, so nothing already on PATH is shadowed', () => {
    const env = { PATH: stubPath(), HOME: FAKE_HOME };
    const childEnv = reported(runWrapper(['report.mjs'], env)).env;
    expect(childEnv.PATH).toBe(`${env.PATH}${delimiter}${join(FAKE_HOME, '.cargo', 'bin')}`);
    expect(childEnv.PATH.startsWith(BIN)).toBe(true);

    // PATH is the ONLY key that differs from an unwrapped child. Nothing else is invented or dropped.
    const base = baselineEnv(env);
    const differing = [...new Set([...Object.keys(base), ...Object.keys(childEnv)])].filter((k) => base[k] !== childEnv[k]);
    expect(differing).toEqual(['PATH']);
  });

  it('prefers $CARGO_HOME/bin over ~/.cargo/bin', () => {
    const cargoHome = join(TMP, 'alt-cargo-home');
    spawnSync('mkdir', ['-p', join(cargoHome, 'bin')]);
    const alt = join(cargoHome, 'bin', 'cargo');
    writeFileSync(alt, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(alt, 0o755);

    const childPath = reported(runWrapper(['report.mjs'], { PATH: stubPath(), HOME: FAKE_HOME, CARGO_HOME: cargoHome })).env.PATH;
    expect(resolveOn(childPath, 'cargo')).toBe(alt);
  });

  it('is a NO-OP when cargo already resolves: the PATH the child sees is byte-identical', () => {
    // A cargo inside the stub dir, which is already on PATH.
    const onPath = join(BIN, 'cargo');
    writeFileSync(onPath, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(onPath, 0o755);
    try {
      const env = { PATH: stubPath(), HOME: FAKE_HOME, CARGO_HOME: join(TMP, 'alt-cargo-home') };
      const run = runWrapper(['report.mjs'], env);
      const child = reported(run);
      expect(child.env.PATH).toBe(env.PATH);
      // and NOTHING else in the environment differs from a child spawned without the wrapper
      expect(child.env).toEqual(baselineEnv(env));
      expect(run.stderr).toBe('');
    } finally {
      rmSync(onPath, { force: true });
    }
  });

  it('does not mistake a DIRECTORY named cargo for cargo', () => {
    const trap = join(TMP, 'trap-bin');
    spawnSync('mkdir', ['-p', join(trap, 'cargo')]); // a directory, executable bit and all
    const env = { PATH: [trap, stubPath()].join(delimiter), HOME: FAKE_HOME };
    const childPath = reported(runWrapper(['report.mjs'], env)).env.PATH;
    // It fell through to ~/.cargo/bin instead of declaring victory on the directory.
    expect(resolveOn(childPath, 'cargo')).toBe(join(FAKE_HOME, '.cargo', 'bin', 'cargo'));
  });

  it('when cargo is genuinely absent: fails, names the rustup installer, and NEVER RUNS THE CHILD', () => {
    const marker = join(TMP, 'must-not-exist');
    const run = runWrapper(['marker.mjs', marker], { PATH: stubPath(), HOME: EMPTY_HOME });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('https://sh.rustup.rs');
    expect(run.stderr).toContain('CARGO_HOME');
    expect(run.stderr).not.toContain('cargo metadata'); // not tauri's confusing message
    expect(existsSync(marker)).toBe(false);
  });

  it('refuses to run with no command at all, rather than exiting 0 having done nothing', () => {
    const run = runWrapper([], { PATH: stubPath(), HOME: FAKE_HOME });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('usage');
  });
});

describe('with-cargo: stdio is INHERITED, not piped', () => {
  it('hands the child the SAME open files it was given — fd identity, which a pipe cannot fake', () => {
    const inFile = join(TMP, 'stdin.txt');
    const outFile = join(TMP, 'stdout.txt');
    writeFileSync(inFile, 'the-password\n', 'utf8');
    writeFileSync(outFile, '', 'utf8');
    const fdIn = openSync(inFile, 'r');
    const fdOut = openSync(outFile, 'w');
    try {
      const r = spawnSync(NODE, [WRAPPER, 'report.mjs'], {
        env: { PATH: stubPath(), HOME: FAKE_HOME },
        stdio: [fdIn, fdOut, 'pipe'],
      });
      expect(r.status).toBe(0);
      const child = JSON.parse(readFileSync(outFile, 'utf8').trim());

      // fd 0: a regular FILE with the inode of the file WE opened. A pipe reports isFIFO.
      expect(child.fd0.file).toBe(true);
      expect(child.fd0.fifo).toBe(false);
      expect(child.fd0.ino).toBe(statSync(inFile).ino);

      // fd 1: same — and the proof is that its bytes reached this file with nobody copying them.
      expect(child.fd1.file).toBe(true);
      expect(child.fd1.fifo).toBe(false);
      expect(child.fd1.ino).toBe(statSync(outFile).ino);

      // and the child could actually READ the descriptor it inherited
      expect(child.stdinText).toBe('the-password\n');
    } finally {
      closeSync(fdIn);
      closeSync(fdOut);
    }
  });

  it('lets a PROMPT be answered: a line written to the wrapper reaches the child and its reply comes back', async () => {
    const answered = await new Promise<string>((res, rej) => {
      const child = spawn(NODE, [WRAPPER, 'ask.mjs'], {
        env: { PATH: stubPath(), HOME: FAKE_HOME },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        rej(new Error(`no reply within 10s — stdin never reached the child. saw: ${JSON.stringify(out)}`));
      }, 10_000);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d: string) => {
        out += d;
        if (out.includes('password: ') && !out.includes('GOT[')) child.stdin.write('hunter2\n');
        if (out.includes('GOT[')) { clearTimeout(timer); res(out); }
      });
      child.on('error', rej);
    });
    expect(answered).toContain('password: ');
    expect(answered).toContain('GOT[hunter2]');
  }, 15_000);
});

describe('with-cargo: exit code and argv', () => {
  it.each([0, 1, 3, 42, 101])('propagates the child exit code %i verbatim', (code) => {
    const run = runWrapper(['exit-with.mjs', String(code)], { PATH: stubPath(), HOME: FAKE_HOME });
    expect(run.status).toBe(code);
  });

  /*
   * A BUILD THAT DIED MUST NOT LOOK LIKE A BUILD THAT WORKED.
   *
   * Ctrl-C during the several minutes of `cargo build --release`, or an OOM kill, ends the child with
   * a SIGNAL and no exit code at all: spawnSync reports status === null. `null` is not a number, and
   * every naive propagation of it — `process.exitCode = child.status`, or `?? 0`, or letting the
   * script simply end — yields 0. Then `npm run release` looks in the bundle directory, finds the
   * PREVIOUS build's artifacts still lying there, and publishes them. That is the same shape as the
   * defect that shipped v0.2.6's signature over v0.2.7's bytes.
   */
  it('a child killed by a SIGNAL exits non-zero (128+signum), not 0', () => {
    const run = runWrapper(['self-kill.mjs'], { PATH: stubPath(), HOME: FAKE_HOME });
    expect(run.status).not.toBe(0);
    expect(run.status).toBe(128 + 15); // SIGTERM
    expect(run.stderr).toContain('SIGTERM');
  });

  /*
   * A fresh clone with no `npm install` has no `tauri` on PATH. The wrapper must say so, and must
   * not report success. 127 is the shell's conventional "command not found", so `npm run` and CI
   * both read it as a failure.
   */
  it('a command that does not exist fails with 127 and names the command', () => {
    const run = runWrapper(['definitely-not-a-real-command-xyz'], { PATH: stubPath(), HOME: FAKE_HOME });
    expect(run.status).toBe(127);
    expect(run.stderr).toContain('definitely-not-a-real-command-xyz');
  });

  it('passes argv through EXACTLY, including the flags a release depends on', () => {
    /*
     * `--bundles app,dmg` is the one that decides whether a .dmg exists to publish. The rest are
     * here because `shell: true` would mangle every one of them: the glob, the spaces, the dollar
     * sign, the empty string.
     */
    const args = ['build', '--bundles', 'app,dmg', '--config', '{"a":1}', 'a b c', '--flag=x y', '$HOME', '*', '--', '-v', ''];
    const run = runWrapper(['report.mjs', ...args], { PATH: stubPath(), HOME: FAKE_HOME });
    expect(reported(run).argv).toEqual(args);
  });
});
