import { describe, expect, it, vi } from 'vitest';
import { toastUndo, useToastStore } from '../Toast';

describe('toastUndo — the undo pattern (plan 4.1 rule 4)', () => {
  it('queues a success toast carrying an Undo action with a 6s window', () => {
    useToastStore.setState({ toasts: [] });
    const undo = vi.fn();
    toastUndo('Nebula Protocol snoozed — wakes Jul 24', undo);

    const t = useToastStore.getState().toasts.at(-1)!;
    expect(t.type).toBe('success');
    expect(t.duration).toBe(6000);
    expect(t.action?.label).toBe('Undo');

    t.action!.onAction();
    expect(undo).toHaveBeenCalledOnce();
  });
});
