import { describe, expect, it } from 'vitest';
import { analyzeConversation } from './conversation.js';

describe('conversation intelligence', () => {
  it('reads positive vs negative sentiment', () => {
    expect(analyzeConversation('This looks great, we are very interested and keen to move forward.').sentiment).toBe('positive');
    expect(analyzeConversation('Unfortunately this is too expensive and we have a concern about timing.').sentiment).toBe('negative');
    expect(analyzeConversation('Received your note. Reviewing the token details.').sentiment).toBe('neutral');
  });

  it('extracts commitments and next steps', () => {
    const r = analyzeConversation(
      "Thanks for the call. We will send over the token docs tomorrow. Let's schedule a follow up next week to review terms.",
    );
    expect(r.commitments.some((c) => /send over the token docs/i.test(c))).toBe(true);
    expect(r.nextSteps.some((s) => /follow up|schedule/i.test(s))).toBe(true);
  });

  it('surfaces risks and objections', () => {
    const r = analyzeConversation(
      'We are worried about the listing fees. Honestly the price is too expensive and we need board approval before timing anything.',
    );
    expect(r.risks.length).toBeGreaterThan(0);
    expect(r.objections.some((o) => /too expensive/i.test(o))).toBe(true);
  });

  it('is safe on empty / trivial input', () => {
    const r = analyzeConversation('', 0);
    expect(r.sentiment).toBe('neutral');
    expect(r.commitments).toEqual([]);
    expect(r.sentimentScore).toBe(0);
  });
});
