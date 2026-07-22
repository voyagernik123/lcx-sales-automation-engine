import { transitionDealStage } from './api/bd';
import { ApiError } from './apiClient';
import { toast } from '@/components/shared/Toast';

/**
 * Stage transition with the premortem gate (Phase 2.3). If the API blocks a
 * >$25k close for lack of a premortem, offer a reasoned override (audited).
 * Returns true if the transition went through, false if the operator declined
 * the gate. Non-gate errors re-throw so callers classify them as before.
 */
export async function transitionDealWithGate(
  id: string,
  body: { stage: string; winReason?: string; lossReason?: string; lossCategory?: string },
): Promise<boolean> {
  try {
    await transitionDealStage(id, body);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'PREMORTEM_REQUIRED') {
      const reason = window.prompt(
        'This deal is over $25k and has no premortem.\n\n' +
          'Best practice: add a Premortem in Analytic Reviews on the project first.\n\n' +
          'To override the gate now, type a reason (it will be logged to the audit trail). ' +
          'Cancel to go add the premortem instead.',
      );
      if (reason && reason.trim()) {
        await transitionDealStage(id, { ...body, overridePremortem: true, overrideReason: reason.trim() });
        toast('info', 'Premortem gate overridden — logged to the audit trail');
        return true;
      }
      toast('error', 'Blocked: add a Premortem (Analytic Reviews) before closing this deal.');
      return false;
    }
    throw err;
  }
}
