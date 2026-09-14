import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** The focus band exists in the shader and defaults to a thin lens (0). Read from source: DOF_FRAG is not exported. */
const src = readFileSync(new URL('./dof.ts', import.meta.url), 'utf8');

describe('depth of field keeps a band around the focus sharp', () => {
  it('declares uFocusBand and subtracts it before the aperture scales the circle of confusion', () => {
    expect(src).toContain('uniform float uFocusBand;');
    expect(src).toContain('float c = max(0.0, abs(1.0 / max(0.05, uFocusDistance) - 1.0 / max(0.05, z)) - uFocusBand) * uAperture;');
  });
  it('uploads it, defaulting to 0 so every existing caller is a thin lens', () => {
    expect(src).toContain("gl.uniform1f(gl.getUniformLocation(prog, 'uFocusBand'), o.focusBand ?? 0);");
    expect(src).toContain('readonly focusBand?: number;');
  });
});
