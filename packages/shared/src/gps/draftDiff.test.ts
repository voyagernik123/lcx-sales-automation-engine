import { describe, expect, it } from 'vitest';
import { diffHeadline, draftDiff } from './draftDiff.js';

/**
 * The diff is arithmetic, so it is tested as arithmetic: exact line accounting, exact
 * ordering, and the one derived signal a QA reviewer actually needs — whether this
 * revision CLOSED a [FACT REQUIRED] hole or OPENED a new one.
 */

describe('line accounting', () => {
  it('reports an identical pair as identical, and says the rework did not land', () => {
    const d = draftDiff('a\nb', 'a\nb');
    expect(d.identical).toBe(true);
    expect(d).toMatchObject({ added: 0, removed: 0, unchanged: 2 });
    expect(diffHeadline(d)).toContain('did not reach the text');
  });

  it('counts a pure insertion without touching the surrounding lines', () => {
    const d = draftDiff('a\nc', 'a\nb\nc');
    expect(d).toMatchObject({ added: 1, removed: 0, unchanged: 2 });
    expect(d.lines.find((l) => l.kind === 'added')).toMatchObject({ text: 'b', oldLine: null, newLine: 2 });
  });

  it('counts a pure deletion and keeps the old line number', () => {
    const d = draftDiff('a\nb\nc', 'a\nc');
    expect(d).toMatchObject({ added: 0, removed: 1, unchanged: 2 });
    expect(d.lines.find((l) => l.kind === 'removed')).toMatchObject({ text: 'b', oldLine: 2, newLine: null });
  });

  it('emits a changed line as removal-then-addition, the order a reader expects', () => {
    const kinds = draftDiff('a\nOLD\nc', 'a\nNEW\nc').lines.map((l) => `${l.kind}:${l.text}`);
    expect(kinds).toEqual(['same:a', 'removed:OLD', 'added:NEW', 'same:c']);
  });

  it('handles an empty side without inventing lines', () => {
    expect(draftDiff('', 'a\nb')).toMatchObject({ added: 2, removed: 1, unchanged: 0 });
    expect(draftDiff('a\nb', '')).toMatchObject({ added: 1, removed: 2, unchanged: 0 });
  });

  it('is deterministic and its own inverse in shape', () => {
    const fwd = draftDiff('a\nb\nc', 'a\nx\nc');
    const again = draftDiff('a\nb\nc', 'a\nx\nc');
    expect(JSON.stringify(again)).toBe(JSON.stringify(fwd));
    const back = draftDiff('a\nx\nc', 'a\nb\nc');
    expect(back.added).toBe(fwd.removed);
    expect(back.removed).toBe(fwd.added);
  });
});

describe('the signal a QA reviewer is looking for', () => {
  it('counts a CLOSED fact marker and warns that prose can close one dishonestly', () => {
    const d = draftDiff(
      '## PART A\n[FACT REQUIRED: registered entity]',
      '## PART A\nRegistered as Sable GmbH, Berlin.',
    );
    expect(d.factMarkersRemoved).toBe(1);
    expect(d.factMarkersAdded).toBe(0);
    expect(diffHeadline(d)).toContain('closed by a supplied fact and not by prose');
  });

  it('counts a NEWLY OPENED hole — a revision can regress', () => {
    const d = draftDiff(
      '## PART A\nRegistered as Sable GmbH.',
      '## PART A\n[FACT REQUIRED: registered entity]',
    );
    expect(d.factMarkersAdded).toBe(1);
    expect(diffHeadline(d)).toContain('opened holes');
  });

  it('does not mistake an unchanged marker for movement', () => {
    const d = draftDiff('[FACT REQUIRED: x]\na', '[FACT REQUIRED: x]\nb');
    expect(d.factMarkersAdded).toBe(0);
    expect(d.factMarkersRemoved).toBe(0);
  });
});
