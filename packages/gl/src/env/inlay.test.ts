import { describe, expect, it } from 'vitest';
import { LIT_FRAG } from './lit.js';

/**
 * THE INLAY TERM EXISTS AND IS OFF BY DEFAULT. The Forge disc's engraved mark depends on it reading dark whatever the
 * light does; a shader edit that dropped the branch would ship a blank disc again and every other test would pass.
 */
describe('the lit shader carries an inlay material below a plane inside a radius', () => {
  it('declares the six inlay uniforms', () => {
    for (const u of ['uInlayOn', 'uInlayBelowY', 'uInlayRadius', 'uInlayColour', 'uInlayRough', 'uInlayMetal']) expect(LIT_FRAG).toContain(`uniform ${u === 'uInlayColour' ? 'vec3' : 'float'} ${u};`);
  });
  it('gates on world y below the plane AND xz inside the radius, and feeds base/metal/rough from it', () => {
    expect(LIT_FRAG).toContain('float inlay = (uInlayOn > 0.5 && vWorld.y < uInlayBelowY && length(vWorld.xz) < uInlayRadius) ? 1.0 : 0.0;');
    expect(LIT_FRAG).toContain('vec3 base = mix(uBaseColour, uInlayColour, inlay);');
    expect(LIT_FRAG).toContain('float metal = mix(uMetalness, uInlayMetal, inlay);');
    expect(LIT_FRAG).toContain('vec3 f0 = mix(vec3(0.04), base, metal);');
    expect(LIT_FRAG).toContain('vec3 diffuse = kd * base / PI;');
    expect(LIT_FRAG).toContain('rough = mix(rough, clamp(uInlayRough, 0.045, 1.0), inlay);');
  });
  it('keeps the energy-accounted environment diffuse line and blends the inlay after it', () => {
    expect(LIT_FRAG).toContain('vec3 envDiffuse = skyColourLod(N, 5.5) * uBaseColour * (1.0 - specWeight) * (1.0 - uMetalness);');
    expect(LIT_FRAG).toContain('envDiffuse = mix(envDiffuse, skyColourLod(N, 5.5) * base * (1.0 - specWeight) * (1.0 - metal), inlay);');
  });
});
