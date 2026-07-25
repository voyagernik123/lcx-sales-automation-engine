import { useEffect, useRef } from 'react';
import { GO_IDLE, stepGoGrammar, type GoState } from '@/lib/navGrammar';

/**
 * Install the `g` prefix grammar for the lifetime of the shell.
 *
 * The armed state lives in a ref, not in React state: arming must be visible to
 * the very next keypress, which may arrive in the same tick, and a re-render per
 * keystroke of a prefix is pure waste. Nothing renders from it — the Phase 6
 * manual will read it through a separate subscription if it wants to show the
 * pending prefix.
 */
export function useGoGrammar(onNavigate: (path: string) => void): void {
  const go = useRef<GoState>(GO_IDLE);
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const step = stepGoGrammar(go.current, e, Date.now());
      go.current = step.state;
      if (step.claim) e.preventDefault();
      if (step.go) navigate.current(step.go.path);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
