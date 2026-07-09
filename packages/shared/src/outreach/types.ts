export type SequenceStatus = 'draft' | 'active' | 'paused' | 'completed' | 'handoff';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'bounced' | 'complained';

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface SequenceStep {
  touchIndex: number;
  delayDays: number;
  subject: string;
  body: string;
  claimsUsed: string[];
  requiresHumanReview: boolean;
}

export interface CadenceDay {
  touchIndex: number;
  delayDays: number;
  label: string;
}

export const CADENCE: CadenceDay[] = [
  { touchIndex: 1, delayDays: 0, label: 'D0 — Introduction' },
  { touchIndex: 2, delayDays: 3, label: 'D3 — Listing Package' },
  { touchIndex: 3, delayDays: 7, label: 'D7 — Liquidity / Value Prop' },
  { touchIndex: 4, delayDays: 14, label: 'D14 — Direct CTA' },
  { touchIndex: 5, delayDays: 35, label: 'D35 — Final Follow-up' },
];

export function computeScheduledDate(enrolledAt: Date, delayDays: number): Date {
  const d = new Date(enrolledAt);
  d.setDate(d.getDate() + delayDays);
  return d;
}

export function getNextStepIndex(currentStep: number, steps: SequenceStep[]): number {
  for (let i = currentStep; i < steps.length; i++) {
    return i;
  }
  return -1;
}
