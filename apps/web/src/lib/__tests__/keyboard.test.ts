/**
 * The eager keyboard layer. Small, but it arbitrates between overlays, and the
 * failures it prevents are the kind users describe as "the shortcut is broken"
 * rather than as a bug with a stack trace.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isTypingTarget,
  isCommandChord,
  acceptCommandChord,
  _resetKeyboard,
} from '@/lib/keyboard';

beforeEach(() => _resetKeyboard());

// The `isCommandOpen` flag this file used to cover is gone. Its job — letting other
// overlays know the command line was on top so they could decline Escape — is now
// the dismiss stack's, and is covered by lib/__tests__/dismiss.test.ts. Deleting
// these two tests along with the flag is the point: the behaviour is still tested,
// but once, in the module that actually decides it.

describe('the open chord', () => {
  const key = (init: Partial<KeyboardEvent>) => new KeyboardEvent('keydown', init as KeyboardEventInit);

  it('accepts Cmd+K and Ctrl+K, upper or lower case', () => {
    expect(isCommandChord(key({ metaKey: true, key: 'k' }))).toBe(true);
    expect(isCommandChord(key({ ctrlKey: true, key: 'k' }))).toBe(true);
    // Shift+Cmd+K arrives as 'K'; refusing it would make the chord feel flaky
    // whenever caps lock is on.
    expect(isCommandChord(key({ metaKey: true, key: 'K' }))).toBe(true);
  });

  it('ignores a bare k, so typing never opens the command line', () => {
    expect(isCommandChord(key({ key: 'k' }))).toBe(false);
  });

  it('ignores other modified keys', () => {
    expect(isCommandChord(key({ metaKey: true, key: 'j' }))).toBe(false);
  });
});

describe('chord de-duplication', () => {
  it('accepts one press and rejects an immediate repeat', () => {
    // In LCX TERMINAL the same Cmd+K can arrive twice — once from the native menu
    // item added for discoverability, once from the webview — and toggling twice
    // in the same instant opens then immediately closes.
    expect(acceptCommandChord(1_000)).toBe(true);
    expect(acceptCommandChord(1_050)).toBe(false);
    expect(acceptCommandChord(1_249)).toBe(false);
  });

  it('accepts again once the window has passed', () => {
    expect(acceptCommandChord(1_000)).toBe(true);
    expect(acceptCommandChord(1_300)).toBe(true);
  });

  it('does not block a deliberate close-then-reopen at human speed', () => {
    // A person double-tapping to close and reopen takes far longer than 250ms;
    // a dedupe window wide enough to swallow that would feel unresponsive.
    expect(acceptCommandChord(0)).toBe(true);
    expect(acceptCommandChord(600)).toBe(true);
  });
});

describe('isTypingTarget', () => {
  const el = (tag: string) => document.createElement(tag);

  it('recognises the fields a shortcut must not steal from', () => {
    expect(isTypingTarget(el('input'))).toBe(true);
    expect(isTypingTarget(el('textarea'))).toBe(true);
    expect(isTypingTarget(el('select'))).toBe(true);
  });

  it('recognises contenteditable', () => {
    const div = el('div');
    div.contentEditable = 'true';
    // jsdom does not always derive isContentEditable from the attribute.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it('leaves ordinary elements alone', () => {
    expect(isTypingTarget(el('div'))).toBe(false);
    expect(isTypingTarget(el('button'))).toBe(false);
  });

  it('tolerates null and non-element targets', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(document)).toBe(false);
  });
});
