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
 * It has cost this session NINE separate debugging detours. The ninth got past the first
 * version of this ratchet, which found shaders by their `#version 300 es` marker — and
 * `env/sky.ts` defines `SKY_GLSL`, a SNIPPET meant to be interpolated into other shaders, so it
 * has no version line and was invisible to the check. The guard was narrower than the hazard.
 *
 * So there are now two checks. The first still parses `#version` blocks. The second is the
 * general rule underneath all nine incidents: A BACKTICK NEVER BELONGS INSIDE A BLOCK COMMENT
 * in a file that defines GLSL, because that is the only place this has ever happened and the
 * only place the habit of quoting identifiers collides with the delimiter.
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


describe('GLSL SNIPPETS are checked too — the gap the ninth incident went through', () => {
  /*
   * `env/sky.ts` exports SKY_GLSL: a fragment of GLSL with no `#version` line, meant to be
   * interpolated into other shaders. The checks above find shaders by that marker, so the
   * snippet was invisible to them — and a comment inside it quoted an identifier in backticks,
   * closed the literal, and TypeScript reported a syntax error thirty lines later.
   *
   * The guard was narrower than the hazard. This finds template-literal assignments whose body
   * looks like GLSL by its TOKENS rather than its version line, and applies the same two rules:
   * the literal must not end early, and it must contain no backtick.
   */
  const tick = String.fromCharCode(96);
  const files = walk(SRC).filter((f) => !f.endsWith('.test.ts'));

  /** Every `= <backtick>…` literal in the file whose body reads as GLSL. */
  function glslLiterals(src: string): string[] {
    const out: string[] = [];
    const marker = `= ${tick}`;
    let from = 0;
    for (;;) {
      const at = src.indexOf(marker, from);
      if (at < 0) break;
      const bodyStart = at + marker.length;
      const body = src.slice(bodyStart).split(tick)[0] ?? '';
      from = bodyStart;
      // GLSL by tokens, not by version: `uniform`, a type declaration, or a function body.
      if (/\buniform\s+(vec|mat|float|sampler)|\bvec[234]\s+\w+\s*\(|precision\s+highp/.test(body)) {
        out.push(body);
      }
    }
    return out;
  }

  it('finds snippets as well as whole shaders, so the count exceeds the #version files', () => {
    const total = files.reduce((n, f) => n + glslLiterals(readFileSync(f, 'utf8')).length, 0);
    expect(total).toBeGreaterThan(4);
  });

  it('no GLSL literal — snippet or shader — contains a backtick', () => {
    for (const f of files) {
      for (const body of glslLiterals(readFileSync(f, 'utf8'))) {
        expect(
          body.includes(tick),
          `${f}: a backtick inside a GLSL literal. It TERMINATES the template string. Quote identifiers with plain words.`,
        ).toBe(false);
      }
    }
  });

  it('no GLSL literal is truncated before its closing brace', () => {
    // A literal closed early by a stray backtick loses its tail, so the brace that ends the
    // last function is missing. That absence is the detection.
    for (const f of files) {
      for (const body of glslLiterals(readFileSync(f, 'utf8'))) {
        expect(body, `${f}: a GLSL literal ends before its closing brace`).toContain('}');
      }
    }
  });
});
