import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from '../Modal';
import { DisqualifyDialog } from '@/components/queue/DisqualifyDialog';
import { _resetDismiss, dismissStack } from '@/lib/dismiss';

/**
 * WHOSE FOCUS IS IT — the Modal container's, or the field the operator was sent to?
 *
 * `Modal` focused its own container on a `requestAnimationFrame`, which lands AFTER React
 * honours a child's `autoFocus`. So the destructive `DisqualifyDialog` opened with focus on
 * a `<div>`: every character typed into the reason went nowhere, `⌘⏎` issued zero requests,
 * and nothing failed — the operator performed the whole gesture and the lead stayed
 * qualified. It also cost 7 wasted Tab presses to reach the field the dialog had already
 * pointed at.
 *
 * The container focus is NOT removable: `lib/dismiss.ts` records `document.activeElement` at
 * push time and restores it on close, and its Tab trap pulls focus to an edge when focus is
 * outside the container. With focus left on `<body>` — jsdom and browsers agree that a
 * modal opened by a keystroke has no focused element unless someone sets one — the trap has
 * nothing inside it to keep. So the fix is conditional, not a deletion, and both halves are
 * asserted below: an autofocused child KEEPS focus, a childless-of-autofocus modal still
 * gets it.
 *
 * These run the real `Modal` and the real `DisqualifyDialog` against the real dismiss stack.
 * A stand-in would have proved nothing: the bug is entirely in the ordering between React's
 * autoFocus commit, this component's rAF, and the stack's origin snapshot.
 */

beforeEach(() => {
  _resetDismiss();
});

afterEach(() => {
  _resetDismiss();
  vi.restoreAllMocks();
});

/**
 * Give jsdom enough layout for `lib/dismiss`'s `tabbable()` to see anything at all.
 *
 * NOT a convenience. `tabbable()` filters on `el.offsetParent !== null`, and jsdom has no
 * layout, so `offsetParent` is null for every element in the document — which means the
 * filter returns an EMPTY list for a fully populated dialog. `handleTab` then takes its
 * "nothing to move to" branch and parks focus on the container.
 *
 * That is exactly how this file's Tab-trap test passed while claiming something else. It
 * located 9 tabbables itself, asserted `defaultPrevented` and `panel.contains(active)`, and
 * both were true — via the empty-list branch, with focus on the panel `<div>`, never on the
 * first stop. Measured, not deduced: a temporary probe reported
 * `{ tabbables: 9, landedOn: 'DIV', isPanel: true }`. The wrap-to-first path the comment
 * described had never once run. Stubbing `offsetParent` is what makes the assertion below
 * about the trap rather than about jsdom.
 */
function withLayout<T>(fn: () => T): T {
  const prior = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected ? document.body : null;
    },
  });
  try {
    return fn();
  } finally {
    if (prior) Object.defineProperty(HTMLElement.prototype, 'offsetParent', prior);
    else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
  }
}

/** Let the rAF the Modal schedules actually run. */
async function frame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // A second frame: the restore path in lib/dismiss also defers a frame, and a test that
    // only waited one could pass on ordering luck.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

describe('Modal does not steal focus from a field it autofocused', () => {
  it('leaves focus on an autoFocus child', async () => {
    render(
      <Modal isOpen onClose={() => {}} title="Autofocus probe">
        <input autoFocus aria-label="probe field" />
      </Modal>,
    );
    await frame();
    expect(
      (document.activeElement as HTMLElement | null)?.getAttribute('aria-label'),
      'the modal container took focus back from the field React had just autofocused',
    ).toBe('probe field');
  });

  it('still focuses its own container when nothing inside asked for focus', async () => {
    render(
      <Modal isOpen onClose={() => {}} title="No autofocus">
        <p>read-only</p>
      </Modal>,
    );
    await frame();
    // The container, not <body>. Escape/Tab restoration in lib/dismiss needs focus INSIDE
    // the container; leaving it on <body> is the defect this rAF was added to fix.
    const active = document.activeElement as HTMLElement | null;
    expect(active?.getAttribute('role'), 'focus was left outside the dialog').toBe('dialog');
  });

  it('does not yank focus back if the operator has already moved it inside', async () => {
    // The realistic race: the operator hits Tab in the same frame the modal mounts. Focus is
    // inside the container but not on the container, and pulling it back to the panel would
    // discard a deliberate move.
    const { getByRole } = render(
      <Modal isOpen onClose={() => {}} title="Manual move">
        <button>Inner</button>
      </Modal>,
    );
    const inner = getByRole('button', { name: 'Inner' });
    act(() => inner.focus());
    await frame();
    expect(document.activeElement).toBe(inner);
  });
});

describe('the disqualify dialog can actually be typed into', () => {
  it('opens with the reason field focused, and typed characters land in it', async () => {
    const onConfirm = vi.fn();
    render(<DisqualifyDialog open leadName="Probe Chain 0" onClose={() => {}} onConfirm={onConfirm} />);
    await frame();

    const field = document.activeElement as HTMLTextAreaElement | null;
    expect(
      field?.tagName,
      `the dialog opened with focus on <${field?.tagName.toLowerCase()}>, so every keystroke is dropped`,
    ).toBe('TEXTAREA');

    // Typed the way the browser does it: at whatever holds focus. This is the assertion that
    // would have caught the shipped bug — a `fireEvent.change` on a located element bypasses
    // the entire question of who has focus.
    fireEvent.change(field!, { target: { value: 'Dead project' } });
    expect(field!.value).toBe('Dead project');

    // And ⌘⏎ on the field submits, which is the half of the gesture that silently issued
    // zero requests.
    fireEvent.keyDown(field!, { key: 'Enter', metaKey: true });
    expect(onConfirm, 'Meta+Enter on the reason field disqualified nothing').toHaveBeenCalledWith('Dead project');
  });

  it('the Tab trap still confines focus, which is what licenses aria-modal', async () => {
    render(<DisqualifyDialog open leadName="Probe Chain 0" onClose={() => {}} onConfirm={() => {}} />);
    await frame();

    // The trap only engages for the TOP stack entry with a container, so the registration
    // has to have carried the ref through. `topTraps()` is the same question `aria-modal`
    // answers, asked of the stack rather than of the markup.
    expect(dismissStack().map((d) => d.label)).toEqual(['Disqualify lead dialog']);

    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;

    withLayout(() => {
      // `:not([disabled])` is load-bearing and was missing on the first attempt. This dialog's
      // "Disqualify" button is disabled until a reason is typed; `dismiss.ts`'s `tabbable()`
      // drops disabled elements, so its last stop is "Cancel" while a naive query's is the
      // disabled button. The test then focused an unfocusable node, focus stayed on the
      // textarea, and `handleTab` correctly did nothing — reported as
      // "Tab was allowed to leave a dialog claiming aria-modal", i.e. the guard going red in
      // the product's name for a defect that was entirely the harness's.
      const tabbables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]',
        ),
      ).filter((el) => (el.getAttribute('tabindex') ?? '0').charAt(0) !== '-');
      // If this is ever 0 the assertions below go vacuous in the direction that looks green,
      // so the count is asserted before it is relied on.
      expect(tabbables.length, 'the dialog exposed no Tab stops, so nothing below tests a wrap').toBeGreaterThan(1);
      const first = tabbables[0]!;
      const last = tabbables[tabbables.length - 1]!;
      act(() => last.focus());

      // Tab at the last stop wraps to the FIRST, rather than walking out to the queue behind.
      const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      act(() => {
        last.dispatchEvent(e);
      });
      expect(e.defaultPrevented, 'Tab was allowed to leave a dialog claiming aria-modal').toBe(true);
      expect(document.activeElement, 'Tab at the last stop did not wrap to the first').toBe(first);

      // And Shift+Tab at the first wraps back to the last, which is the other wall.
      const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      act(() => {
        first.dispatchEvent(back);
      });
      expect(back.defaultPrevented, 'Shift+Tab was allowed to leave the dialog').toBe(true);
      expect(document.activeElement, 'Shift+Tab at the first stop did not wrap to the last').toBe(last);
    });
  });

  it('hands focus back to where it came from when it closes', async () => {
    // The other half of what the container focus was load-bearing for. `lib/dismiss` snapshots
    // `document.activeElement` at push time; if the modal's focus handling changed WHEN that
    // snapshot is taken, restoration would hand focus to a control inside the dialog.
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <DisqualifyDialog open={open} leadName="Probe Chain 0" onClose={() => setOpen(false)} onConfirm={() => {}} />
        </>
      );
    }
    const { getByRole } = render(<Harness />);
    const opener = getByRole('button', { name: 'Open' });
    act(() => opener.focus());
    act(() => {
      fireEvent.click(opener);
    });
    await frame();
    expect((document.activeElement as HTMLElement).tagName).toBe('TEXTAREA');

    // Escape, through the one stack that owns it.
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await frame();
    expect(document.activeElement, 'focus was orphaned on <body> after the dialog closed').toBe(opener);
  });
});
