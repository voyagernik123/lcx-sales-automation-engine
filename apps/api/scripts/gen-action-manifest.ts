/**
 * Generates the committed action manifest the web command line is built from.
 *
 *   npm run gen:actions
 *
 * The artifact is committed on purpose: the command line then opens with zero
 * network round trips (production costs ~165-195ms before our code even runs) and
 * works offline. The drift test keeps it honest — if the registry changes and this
 * is not re-run, CI fails with a diff rather than the client silently offering a
 * stale verb set.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildActionManifest, canonicalJson } from '../src/actions/manifest.js';

const OUT = resolve(
  import.meta.dirname,
  '../../web/src/lib/command/generated/actionManifest.ts',
);

const manifest = buildActionManifest();

const file = `/**
 * GENERATED — do not edit. Run \`npm run gen:actions\` after changing
 * apps/api/src/actions/registry.ts or grammar.ts.
 *
 * The command line's verbs come from here, so it is complete by construction: a
 * governed action cannot exist without a command, and a command cannot exist for
 * an action the server does not have. The drift test
 * (apps/api/src/actions/__tests__/manifest.drift.test.ts) fails CI if this file
 * and the registry disagree.
 *
 * Client-side param validation from these schemas is ADVISORY IN BOTH DIRECTIONS:
 * zod's .refine() is lost in translation (so some invalid input looks valid), and
 * the emitted \`additionalProperties: false\` is stricter than zod, which strips
 * unknown keys (so some valid input looks invalid). invokeAction on the server is
 * the only authority. See apps/api/src/actions/grammar.ts.
 *
 * ${manifest.actions.length} actions · manifest ${manifest.manifestHash}
 */

import type { ActionManifest } from '../types';

export const ACTION_MANIFEST: ActionManifest = ${JSON.stringify(manifest, null, 2)} as const satisfies ActionManifest;

export const MANIFEST_HASH = ${JSON.stringify(manifest.manifestHash)};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file, 'utf8');

// Also emit the canonical bytes the drift test compares against, so the test
// does not have to re-derive the formatting decisions made above.
const CANON = resolve(import.meta.dirname, '../src/actions/generated/manifest.canonical.json');
mkdirSync(dirname(CANON), { recursive: true });
writeFileSync(CANON, canonicalJson(manifest), 'utf8');

console.log(
  `[gen:actions] ${manifest.actions.length} actions, hash ${manifest.manifestHash}\n` +
    `  → ${OUT}\n  → ${CANON}`,
);
