import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE PANEL WAS NAMING A CAUSE IT DID NOT KNOW.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * On any `usedLlm === false` this panel printed:
 *
 *     "AI narrative unavailable (no key) — the graded evidence behind this project:"
 *
 * `llm.ts` returned that same false for four unrelated conditions — no provider, a
 * provider error (a 429, or a 400 on the request shape), an explicit model refusal, and
 * a transport failure. So in three cases out of four the panel stated something untrue,
 * confidently, to the person deciding whether to trust the surface. That is an inference
 * ("usedLlm false, so probably no key") laundered into a certainty.
 *
 * These tests drive the panel with each outcome the API can now return and assert it
 * renders the CODE it was given rather than a guess.
 */

const estimateOutlook = vi.fn();
const askDossier = vi.fn();

const draftOutreach = vi.fn();

vi.mock('@/lib/api/aiOperator', () => ({
  askDossier: (...a: unknown[]) => askDossier(...a),
  estimateOutlook: (...a: unknown[]) => estimateOutlook(...a),
  proposeActions: vi.fn(),
  confirmProposal: vi.fn(),
  draftOutreach: (...a: unknown[]) => draftOutreach(...a),
}));
vi.mock('@/components/shared/Toast', () => ({ toast: vi.fn() }));

const { AiOperatorPanel } = await import('../AiOperatorPanel');

const A = '11111111-1111-1111-1111-111111111111';

const CITATION = { id: A, grade: 'B2', predicate: 'wash_trading_flag', source: 'chain', confidence: 60 };

const answer = (over: Record<string, unknown>) => ({
  data: {
    answer: '',
    citations: [CITATION],
    usedLlm: false,
    evidenceCount: 7,
    unbackedCitations: 0,
    looksLikeInjection: false,
    ...over,
  },
  meta: { aiAvailable: true },
});

/** Open the panel and fire the outlook request. */
async function openAndAsk() {
  const user = userEvent.setup();
  render(<AiOperatorPanel projectId="p1" />);
  await user.click(screen.getByRole('button', { name: /AI Operator/i }));
  await user.click(screen.getByRole('button', { name: /Estimative outlook/i }));
}

beforeEach(() => {
  estimateOutlook.mockReset();
  askDossier.mockReset();
  draftOutreach.mockReset();
});

describe('the panel renders the code it was given, not a guess at the cause', () => {
  it('a provider error is shown as a provider error — never as a missing key', async () => {
    estimateOutlook.mockResolvedValue(
      answer({
        status: 'provider_error',
        code: 'AI_PROVIDER_ERROR',
        detail: 'The anthropic API rejected the request with HTTP 429: rate_limit_error',
        rule: 'Three states are never collapsed: a provider failure is withheld, not genuinely-empty.',
      }),
    );
    await openAndAsk();

    await waitFor(() => {
      expect(screen.getByText('AI_PROVIDER_ERROR')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/HTTP 429/)).toBeInTheDocument();
    });
    // The lie the old panel told. Negatives OUTSIDE waitFor — the awaits above have
    // already proved the outcome rendered, so the DOM here is the settled one.
    expect(document.body.textContent).not.toMatch(/no key/i);
  });

  it('a model refusal is shown as a refusal, with its rule', async () => {
    estimateOutlook.mockResolvedValue(
      answer({
        status: 'refused',
        code: 'AI_MODEL_REFUSED',
        detail: 'The model returned stop_reason="refusal" for "dossier-qa".',
        rule: 'An inference is never laundered into a certainty: the model declined to answer.',
      }),
    );
    await openAndAsk();

    await waitFor(() => {
      expect(screen.getByText('AI_MODEL_REFUSED')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/never laundered into a certainty/)).toBeInTheDocument();
    });
    expect(document.body.textContent).not.toMatch(/no key/i);
  });

  it('an absent provider still says so — the one case the old sentence got right', async () => {
    estimateOutlook.mockResolvedValue(
      answer({
        status: 'no_provider',
        code: 'AI_NO_PROVIDER',
        detail: 'No AI provider is configured (neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY), so no model was called.',
        rule: 'Absent data refuses.',
      }),
    );
    await openAndAsk();

    await waitFor(() => {
      expect(screen.getByText('AI_NO_PROVIDER')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument();
    });
  });

  it('an API build that reports no reason is described as exactly that', async () => {
    // Not-loaded is a third state. Inventing "no key" here is the original defect.
    estimateOutlook.mockResolvedValue({
      data: { answer: '', citations: [CITATION], usedLlm: false, evidenceCount: 7 },
      meta: { aiAvailable: true },
    });
    await openAndAsk();

    await waitFor(() => {
      expect(screen.getByText(/did not report why/i)).toBeInTheDocument();
    });
    expect(document.body.textContent).not.toMatch(/no key/i);
  });
});

describe('the panel surfaces what the answer itself is carrying', () => {
  it('warns when the dossier contained something aimed at the model', async () => {
    estimateOutlook.mockResolvedValue(
      answer({ answer: 'Conviction is low.', usedLlm: true, status: 'ok', code: null, looksLikeInjection: true }),
    );
    await openAndAsk();

    await waitFor(() => {
      expect(screen.getByText(/reads like an instruction aimed at the model/i)).toBeInTheDocument();
    });
  });

  it('states the count of markers that resolve to no evidence', async () => {
    estimateOutlook.mockResolvedValue(
      answer({
        answer: `Backed [[${A}]] and not [unverified citation: 99999999-9999-9999-9999-999999999999].`,
        usedLlm: true, status: 'ok', code: null, unbackedCitations: 1,
      }),
    );
    await openAndAsk();

    await waitFor(() => {
      expect(screen.getByText(/resolve to no evidence in the dossier/i)).toBeInTheDocument();
    });
  });

  /**
   * The outreach draft is the one AiProse call site in this file that can resolve
   * NOTHING — `draftOutreach` returns no citation set — while still being built by the
   * same `renderContext` whose footer instructs the model to cite ids in double
   * brackets, and while never passing through `markUnbackedCitations`. So every marker
   * that reaches it is unbacked by construction, and rendering one as
   * `<sup title="source: …">` is the F2 defect on a draft that gets copied into an email.
   */
  it('an outreach draft can back nothing, so a marker in it is never a source', async () => {
    // The client unwraps `.data` for this endpoint (unlike askDossier/estimateOutlook),
    // so the panel receives the OutreachDraft itself.
    draftOutreach.mockResolvedValue({
      draft: `Hi there — we like your volume [[${A}]].`,
      rationale: 'r',
      usedLlm: true,
    });
    const { container } = render(<AiOperatorPanel projectId="p1" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /AI Operator/i }));
    await user.click(screen.getByRole('button', { name: /Draft outreach/i }));

    await waitFor(() => {
      expect(screen.getByText(/Outreach draft/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(container.querySelector('[title^="unverified"]')).not.toBeNull();
    });
    expect(container.querySelector('sup')).toBeNull();
    expect(container.querySelector('[title^="source:"]')).toBeNull();
  });

  it('renders a backed marker as a source and an unbacked one as plain text', async () => {
    const { container } = render(<AiOperatorPanel projectId="p1" />);
    estimateOutlook.mockResolvedValue(
      answer({
        answer: `Backed [[${A}]] and invented [[99999999-9999-9999-9999-999999999999]].`,
        usedLlm: true, status: 'ok', code: null, unbackedCitations: 0,
      }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /AI Operator/i }));
    await user.click(screen.getByRole('button', { name: /Estimative outlook/i }));

    await waitFor(() => {
      expect(container.querySelector('sup')).not.toBeNull();
    });
    // Exactly one source superscript: the id that has a citation chip behind it.
    expect(container.querySelectorAll('sup')).toHaveLength(1);
    expect(container.querySelector('sup')?.getAttribute('title')).toBe(`source: ${A}`);
    expect(container.querySelector('[title^="unverified"]')).not.toBeNull();
  });
});
