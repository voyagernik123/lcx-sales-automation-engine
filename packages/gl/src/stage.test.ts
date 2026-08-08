import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createStage, isStage, stageRefusal, STAGE_REFUSAL_CODES, DEPTH_POLICY,
} from './stage.js';

/**
 * "NO WEBGL2" IS A REAL STATE (`3D_WORK_100X.md` §6.3.7), and the whole point of making
 * it a discriminated union is that a caller cannot forget it. These tests exercise the
 * refusal path — which, on the machines that actually hit it, is the ONLY path.
 *
 * There is no context in Node, so `createStage` here always refuses. That is convenient
 * rather than limiting: the refusal is the branch least likely to be exercised by hand
 * and most likely to be wrong.
 */

function fakeCanvas(ctx: unknown): HTMLCanvasElement {
  const c = { width: 64, height: 64, clientWidth: 32, clientHeight: 32, getContext: () => ctx };
  return c as unknown as HTMLCanvasElement;
}

describe('the stage refuses instead of throwing', () => {
  it('a browser with no WebGL2 gets a refusal, not an exception', () => {
    const out = createStage(fakeCanvas(null));
    expect(isStage(out)).toBe(false);
    expect(out.kind).toBe('refused');
    if (isStage(out)) expect.unreachable('should have refused');
    expect(out.code).toBe('NO_WEBGL2');
  });

  it('the reason is addressed to a READER, and says the data is unaffected', () => {
    const out = createStage(fakeCanvas(null));
    if (isStage(out)) expect.unreachable('should have refused');
    // "An error occurred" tells a reader nothing and implies their data is broken.
    expect(out.reason).not.toMatch(/error occurred|something went wrong|failed to/i);
    expect(out.reason).toMatch(/data is unaffected/);
    expect(out.reason.length).toBeGreaterThan(60);
  });

  it('every declared refusal code carries a distinct, non-empty reason', () => {
    const reasons = STAGE_REFUSAL_CODES.map((c) => stageRefusal(c).reason);
    for (const r of reasons) expect(r.trim().length).toBeGreaterThan(40);
    expect(new Set(reasons).size).toBe(STAGE_REFUSAL_CODES.length);
  });

  it('driver detail is carried VERBATIM — paraphrasing loses the line number', () => {
    const raw = `ERROR: 0:42: 'vFog' : undeclared identifier`;
    expect(stageRefusal('SHADER_COMPILE_FAILED', raw).detail).toBe(raw);
    // Absent detail is absent, not an empty string pretending to be a driver log.
    expect(stageRefusal('NO_WEBGL2').detail).toBeUndefined();
  });
});

describe('the VAO discipline that cost P0 a whole pass', () => {
  const stageSrc = readFileSync(resolve(process.cwd(), 'src/stage.ts'), 'utf8');
  const pointsSrc = readFileSync(resolve(process.cwd(), 'src/primitives/points.ts'), 'utf8');
  const linesSrc = readFileSync(resolve(process.cwd(), 'src/primitives/lines.ts'), 'utf8');

  it('blit owns its VAO privately — it is never a parameter', () => {
    /*
     * P0 pass 2 rendered a SOLID BLACK FRAME. Every draw call was issued, every uniform
     * was set, nothing threw. A geometry pass had reused the full-screen triangle's VAO
     * and re-pointed attribute 0 at its own buffer, so every post-process blit afterwards
     * drew a degenerate triangle. Vertex-array state is per-VAO and corrupting it is
     * silent, so the structural fix is that callers cannot reach the VAO at all.
     */
    expect(stageSrc).toMatch(/blit\(program: WebGLProgram, setUniforms\?/);
    expect(stageSrc).not.toMatch(/blit\([^)]*vao/i);
  });

  it('each primitive creates its own VAO rather than binding into a shared one', () => {
    for (const [name, src] of [['points', pointsSrc], ['lines', linesSrc]] as const) {
      expect(src, `${name} does not create its own vertex array`).toContain('createVertexArray()');
      // And unbinds when finished, so a later pass inherits nothing.
      expect(src, `${name} leaves a VAO bound`).toContain('bindVertexArray(null)');
    }
  });
});

describe('the depth policy is stated, not implied', () => {
  it('says WHY additive fields skip the depth test', () => {
    // Depth-test-off looks like an oversight unless the reason is written down. The
    // quantity is a sum; a depth test would discard terms of it.
    expect(DEPTH_POLICY).toMatch(/sum/);
    expect(DEPTH_POLICY).toMatch(/polygon offset/i);
  });
});
