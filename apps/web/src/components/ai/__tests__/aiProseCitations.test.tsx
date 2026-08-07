import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiProse } from '../AiProse';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  A MARKER IS ONLY ATTRIBUTION IF SOMETHING BACKS IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `aiProse.test.tsx` asserts that `[[s_payagent]]` COLLAPSES into a superscript. It
 * never asserts the negative — that a marker with no matching source must NOT become
 * one — and that gap is the whole defect: `renderInline` turned ANY `[[…]]` into
 * `<sup title="source: …">`. The API filtered its citation CHIPS to ids that exist and
 * returned the answer TEXT untouched, so an id the model invented rendered, in the
 * prose, exactly like a real citation.
 *
 * This needs no attacker. One hallucinated hex digit produces a fabricated source on
 * an intelligence surface whose entire claim is that every figure is graded and cited.
 *
 * The API is the first guard (it rewrites unbacked markers out of `[[ ]]` syntax before
 * they arrive). `validIds` here is the second, for the case where a renderer sees a
 * marker the surface cannot resolve.
 */

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('an unresolvable marker does not render as a source', () => {
  it('is not a superscript, and its tooltip does not say "source"', () => {
    const { container } = render(
      <AiProse text={`Volume is organic [[${B}]].`} validIds={[A]} />,
    );
    // THE ASSERTION THE SUITE WAS MISSING.
    expect(container.querySelector('sup')).toBeNull();
    expect(container.querySelector('[title^="source:"]')).toBeNull();
  });

  it('says out loud that it is unverified, and keeps the claimed id visible', () => {
    render(<AiProse text={`Volume is organic [[${B}]].`} validIds={[A]} />);
    expect(screen.getByTitle(/unverified/i)).toBeInTheDocument();
    expect(document.body.textContent).toContain('unverified citation');
    // Kept, not deleted: the operator has to be able to see WHAT was claimed.
    expect(document.body.textContent).toContain(B);
  });

  it('still renders a backed marker as a source superscript', () => {
    const { container } = render(
      <AiProse text={`Wash trading is flagged [[${A}]].`} validIds={[A, B]} />,
    );
    const sup = container.querySelector('sup');
    expect(sup?.getAttribute('title')).toBe(`source: ${A}`);
    expect(sup?.textContent).toBe(A);
  });

  it('treats an upper-cased id as the same id, not as a fabrication', () => {
    const { container } = render(
      <AiProse text={`Flagged [[${A.toUpperCase()}]].`} validIds={[A]} />,
    );
    expect(container.querySelector('sup')).not.toBeNull();
    expect(document.body.textContent).not.toContain('unverified');
  });

  it('marks every unbacked marker in a mixed answer, not just the first', () => {
    const { container } = render(
      <AiProse text={`One [[${B}]] two [[s_invented]] three [[${A}]].`} validIds={[A]} />,
    );
    expect(container.querySelectorAll('sup')).toHaveLength(1);
    expect(container.querySelectorAll('[title^="unverified"]')).toHaveLength(2);
  });
});

describe('surfaces that resolve ids elsewhere are unchanged', () => {
  it('without validIds, every marker still renders as it always did', () => {
    // The other eight AI surfaces cite `s_*` ids they resolve in their own panels.
    // Omitting the prop must not turn their citations into warnings.
    const { container } = render(<AiProse text="one link works on every rail [[s_payagent]]" />);
    const sup = container.querySelector('sup');
    expect(sup?.textContent).toBe('payagent');
    expect(sup?.getAttribute('title')).toBe('source: payagent');
    expect(document.body.textContent).not.toContain('unverified');
  });

  it('an empty validIds array means "this surface can back nothing", not "skip the check"', () => {
    const { container } = render(<AiProse text={`claim [[${A}]]`} validIds={[]} />);
    expect(container.querySelector('sup')).toBeNull();
    expect(document.body.textContent).toContain('unverified citation');
  });
});
