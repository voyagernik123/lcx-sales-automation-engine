import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PAPER NEVER SEES THE ROOM (P8). Both GL hosts — the shell's stage and the Forge — are `print:hidden`: the still (Forge)
 * and the plain page (stage) are what a print sheet carries. A canvas that prints is a frame from whatever the compositor
 * held at the moment of the dialog, in whichever theme BoardReport had just stripped. Read from source, like the other pins.
 */
const SRC = resolve(__dirname, '..');
const hosts = [
  { file: 'stage/Stage.tsx', marker: 'data-stage={state}' },
  { file: 'brand/ForgeBackdrop.tsx', marker: 'ref={hostRef}' },
];

describe('the GL hosts are print:hidden', () => {
  for (const h of hosts) {
    it(`${h.file} hides its host in print`, () => {
      const src = readFileSync(resolve(SRC, h.file), 'utf8');
      const line = src.split('\n').find((l) => l.includes(h.marker) && l.includes('className'));
      expect(line, `${h.file}: no host element line carrying ${h.marker}`).toBeTruthy();
      expect(line, `${h.file}: the GL host prints`).toMatch(/print:hidden/);
    });
  }
});
