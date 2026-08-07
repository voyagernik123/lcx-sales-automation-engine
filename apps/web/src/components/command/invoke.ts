/**
 * The command line's one write path (TERMINAL Phase 3).
 *
 * It calls the SAME endpoint every other governed write in the app calls —
 * POST /v1/actions/:id/invoke. The command line is a faster mouth, not a new
 * door: no new endpoint, no new validation, no bypass. `invokeAction` on the
 * server re-checks subject type, role, workspace entitlement and params, and
 * writes the ledger and audit rows exactly as it does for a button click.
 *
 * What this module adds is refusal HANDLING: turning a structured error into the
 * remedy the operator should reach for next, using `code` rather than the message
 * text. Three places in the app currently classify gate failures by regex over
 * server prose (DistributionCampaigns being the worst), which is fragile and —
 * once a cache can synthesise strings — a governance hazard.
 */

import { request, ApiError } from '@/lib/apiClient';

export interface InvokeResult {
  ok: true;
  result: Record<string, unknown>;
}

/** A refusal, classified by code, with the concrete next step. */
export interface Refusal {
  ok: false;
  code: string;
  message: string;
  /** What the operator should do now, in plain words. */
  remedy: string;
  /** A follow-up command to offer, when the remedy IS an action. */
  next?: { actionId: string; subjectType: string; subjectId: string };
  /** Structured detail from ActionError.data, when present. */
  detail?: Record<string, unknown>;
  /** True when re-running with an override + reason is a legitimate option. */
  overridable?: boolean;
}

export async function invoke(
  actionId: string,
  subjectType: string,
  subjectId: string,
  params: Record<string, unknown>,
): Promise<InvokeResult | Refusal> {
  try {
    const res = await request<{ data: { action: string; result: Record<string, unknown> } }>(
      `/v1/actions/${actionId}/invoke`,
      { method: 'POST', body: { subjectType, subjectId, params }, auth: true },
    );
    return { ok: true, result: res.data.result };
  } catch (err) {
    if (err instanceof ApiError) return classify(err, subjectType);
    return {
      ok: false,
      code: 'NETWORK',
      message: err instanceof Error ? err.message : 'Request failed',
      // Governed writes stay online by design — gates read their inputs at write
      // time and three of them fail open, so a queued write would be judged
      // against truth that has since changed.
      //
      // But "try again" was the whole remedy until Phase 7, and it is unsafe on
      // its own: a transport failure means the RESPONSE was lost, which does not
      // prove the write was. There is no idempotency key on
      // `/v1/actions/:id/invoke`, so a blind retry of an appending action writes a
      // second row and a second audit entry. Check first, then retry.
      remedy: 'The desk could not reach the server. Governed actions require a live connection — but the write may still have landed, so re-open the subject to check before running it again.',
    };
  }
}

/**
 * Map a refusal code to its remedy.
 *
 * Keyed on `code` ONLY. Never on the message: prose changes without warning, and
 * a message-matching client will silently start mis-classifying refusals — or
 * offering an override for a write the server never rejected.
 */
function classify(err: ApiError, subjectType: string): Refusal {
  const detail = err.data;
  const base = { ok: false as const, code: err.code ?? 'UNKNOWN', message: err.message, detail };

  switch (err.code) {
    case 'SAT_REQUIRED': {
      const missing = Array.isArray(detail?.missing) ? (detail!.missing as string[]) : [];
      return {
        ...base,
        remedy: missing.length
          ? `This decision needs ${missing.join(' and ')} on file first. File the missing tradecraft, or override with a recorded reason.`
          : 'Run the missing tradecraft first, or override with a recorded reason.',
        // The remedy is a real surface, not an action in the registry: reviews are
        // created through /v1/reviews, so the command line hands off rather than
        // pretending it can chain.
        overridable: true,
      };
    }

    case 'COMPLIANCE_GATE': {
      const blockers = Array.isArray(detail?.blockers) ? (detail!.blockers as string[]) : [];
      return {
        ...base,
        remedy: blockers.length
          ? `Blocked by: ${blockers.join('; ')}. Clear the blockers, or override with a recorded reason.`
          : 'Clear the compliance blockers, or override with a recorded reason.',
        overridable: true,
      };
    }

    /*
     * THE EMISSION WARRANT (2026-08-07). Neither is overridable, and that is the whole
     * point: a compliance blocker is a risk an approver can accept with a recorded reason,
     * but a missing emission cap is a figure only the owner can state, and a missing holdings
     * declaration attaches to a named person under Art 91(3)(c). There is nothing an operator
     * can type that substitutes for either, so the remedy names WHO must act instead of
     * offering a door.
     */
    case 'EMISSION_WARRANT_REFUSED':
      return {
        ...base,
        remedy: 'This launch has no emission warrant. Nobody can override it: the owner must declare the quarterly LCX cap, and the launcher must declare their own LCX position, before a token-incentivised campaign goes live.',
        overridable: false,
      };

    case 'CAMPAIGN_TRIGGER_NOT_STATED':
      return {
        ...base,
        remedy: 'This campaign does not say whether it emits LCX. Unknown is not no — set token_incentivized to a real boolean before advancing it.',
        overridable: false,
      };

    case 'APPROVER_REQUIRED':
      return {
        ...base,
        // Deliberately NOT overridable. Authority is not a risk you can accept on
        // your own behalf — this was a real escalation until Phase 3 closed it.
        remedy: 'This needs approver authority. Ask an approver to run it — an override cannot grant authority you do not hold.',
        overridable: false,
      };

    case 'OVERRIDE_REASON_REQUIRED':
      return { ...base, remedy: 'Add a reason for the override — it is recorded in the audit.', overridable: true };

    case 'STEP_UP_REQUIRED':
    case 'STEP_UP_FAILED':
      return { ...base, remedy: 'Re-enter the desk passcode to confirm this action. It is verified server-side and never stored.' };

    case 'PURPOSE_REQUIRED':
      return { ...base, remedy: 'State why you need to see this. The reason is recorded against the read.' };

    case 'WORKSPACE_FORBIDDEN': {
      const ws = typeof detail?.workspace === 'string' ? detail.workspace : 'that workspace';
      const needed = typeof detail?.needed === 'string' ? detail.needed : 'access';
      return { ...base, remedy: `You need '${needed}' on ${ws}. Request it from the workspace switcher.` };
    }

    case 'SECOND_TIER_FORBIDDEN': {
      // An approver tried to grant a second-tier `ext:` colleague something the
      // ceiling in access/entitlements.ts will not honour — an elevated compartment,
      // or the approve tier. The server refuses at grant time rather than storing a
      // row that gets silently capped on read, so the approver is not left believing
      // they granted access that does nothing.
      //
      // NOT overridable, and this is the one where that matters most: the ceiling
      // exists because the second-tier passcode is SHARED and unattributable. No
      // recorded reason from one approver can make it attributable, so an override
      // would be a signature on somebody else's behalf.
      const ws = typeof detail?.workspace === 'string' ? detail.workspace : null;
      return {
        ...base,
        remedy: `${ws ? `${ws} is elevated. ` : ''}A second-tier sign-in is a shared passcode, so it cannot hold this. Put them on the roster, or grant a non-elevated compartment at operate.`,
        overridable: false,
      };
    }

    case 'VALIDATION': {
      const issues = Array.isArray(detail?.issues)
        ? (detail!.issues as Array<{ path?: string; message?: string }>)
        : [];
      return {
        ...base,
        remedy: issues.length
          ? `Fix: ${issues.map((i) => `${i.path || 'input'} — ${i.message}`).join('; ')}`
          : 'One of the values is not acceptable. Check the highlighted field.',
      };
    }

    case 'NOT_FOUND':
      return {
        ...base,
        // Usually a state race, not a typo: the object moved on between the read
        // that offered the verb and the write.
        remedy: `That ${subjectType} is not in the state this action needs any more — someone may have changed it. Re-open it to see where it stands.`,
      };

    default:
      return { ...base, remedy: 'The server refused this action. Nothing was changed.' };
  }
}

/** Did the operator succeed but change nothing? Several actions no-op silently. */
export function wasNoOp(result: Record<string, unknown>): boolean {
  // `track` returns { tier: 'tracked', promoted: false } with HTTP 200 when the
  // project was already tracked. Reporting that as success would be a lie.
  return result.promoted === false;
}
