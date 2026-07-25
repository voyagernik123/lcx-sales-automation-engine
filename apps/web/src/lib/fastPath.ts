import { DESTINATIONS } from './destinations';

/**
 * "What is the fast way to do this?" — one sentence per capability.
 *
 * A LEAF MODULE, and that is the entire point of it existing separately. This started
 * out inside `lib/manual.ts`, which was correct by cohesion and wrong by weight:
 * `manual.ts` imports the command grammar, the grammar imports the generated
 * 22-action manifest, and the Sidebar imports `nudge.ts` — so one convenient import
 * dragged the whole manifest out of its lazy chunk and into the eager bundle, costing
 * 9KB against 19KB of headroom. Measured, not guessed: the manifest's string keys
 * survive minification and appeared in `index-*.js`.
 *
 * So the rule this file encodes is that the nudge engine may know the NAME of a fast
 * path without knowing anything about the grammar that executes it. It imports
 * `destinations` — which is a table of seven rows — and nothing else, ever.
 *
 * The wording is shared with the manual on purpose: being told two different things
 * about one key is how an operator stops trusting both.
 */
export function fastPathFor(capability: string): { keys: string[]; what: string } | null {
  const destination = DESTINATIONS.find((d) => d.id === capability);
  if (destination) return { keys: ['g', destination.key], what: `Jump to ${destination.label}` };

  switch (capability) {
    case 'command':
      return { keys: ['⌘K'], what: 'Open the command line and act from the keyboard' };
    case 'dismiss':
      return { keys: ['esc'], what: 'Close the top panel without reaching for the mouse' };
    case 'list-move':
      return { keys: ['↑', '↓'], what: 'Move through rows without the mouse' };
    default:
      return null;
  }
}
