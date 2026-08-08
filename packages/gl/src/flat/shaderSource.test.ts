import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * A BACKTICK INSIDE A GLSL TEMPLATE LITERAL TERMINATES IT.
 *
 * Shaders in this package live in template literals, and the natural way to write a comment
 * about a variable is to quote it in backticks — which is exactly how every other comment in
 * this repo refers to code. Doing it inside a shader silently ends the string, and TypeScript
 * then reports a parse error tens of lines away with no hint of the cause.
 *
 * It has cost this session EIGHT separate debugging detours. A ratchet is cheaper than a
 * ninth, and this one PARSES rather than enumerating: it finds template literals containing
 * GLSL by their `#version` marker, so a shader added tomorrow in a file nobody listed here is
 * covered automatically. A hand-listed check cannot fail on a member nobody thought of.
 */

const SRC = resolve(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('no shader can be broken by a stray backtick', () => {
  const files = walk(SRC).filter((f) => !f.endsWith('.test.ts'));

  it('finds the shaders by parsing, not by a list somebody has to maintain', () => {
    const withShaders = files.filter((f) => readFileSync(f, 'utf8').includes('#version 300 es'));
    // If this ever drops to zero the check has stopped checking anything.
    expect(withShaders.length).toBeGreaterThan(3);
  });

  it('every GLSL block is a well-formed template literal', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (!src.includes('#version 300 es')) continue;
      /*
       * Each shader is `const NAME = <backtick>#version 300 es … <backtick>`. Slicing from
       * the opening delimiter to the next one gives the literal's ACTUAL extent — so if a
       * stray backtick closed it early, the captured text stops before `void main`, and that
       * absence is the detection.
       */
      const tick = String.fromCharCode(96);
      const parts = src.split(`= ${tick}#version 300 es`);
      for (let i = 1; i < parts.length; i++) {
        const body = parts[i]!.split(tick)[0]!;
        expect(body, `${f}: a GLSL literal ends before its main() — a stray ${tick} closed it early`)
          .toContain('void main');
      }
    }
  });

  it('and no shader body contains a backtick at all, which is the only safe rule', () => {
    const tick = String.fromCharCode(96);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (!src.includes('#version 300 es')) continue;
      const parts = src.split(`= ${tick}#version 300 es`);
      for (let i = 1; i < parts.length; i++) {
        const body = parts[i]!.split(tick)[0]!;
        // Quote code in a shader comment with plain words, not with backticks.
        expect(body.includes(tick), `${f}: backtick inside a shader`).toBe(false);
      }
    }
  });
});
