export type SequenceStatus = 'draft' | 'active' | 'paused' | 'completed' | 'handoff';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'bounced' | 'complained';

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type StepChannel = 'email' | 'linkedin' | 'telegram';

export interface SequenceStep {
  touchIndex: number;
  delayDays: number;
  /** Per-touch channel. Legacy sequences may lack it — resolve via MIXED_CADENCE_CHANNELS. */
  channel?: StepChannel;
  /** ISO timestamp persisted at enroll time; legacy fallback: startedAt + delayDays. */
  scheduledAt?: string;
  status?: 'pending' | 'queued' | 'sent' | 'skipped';
  subject: string;
  body: string;
  claimsUsed: string[];
  requiresHumanReview: boolean;
}

/** Channel per touch of the default mixed cadence (index = touchIndex - 1). */
export const MIXED_CADENCE_CHANNELS: readonly StepChannel[] = [
  'email',
  'email',
  'linkedin',
  'telegram',
  'email',
] as const;

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
