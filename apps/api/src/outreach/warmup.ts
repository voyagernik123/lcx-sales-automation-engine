/**
 * 4-8 — LinkedIn account warmup automation (bookkeeping only).
 *
 * LOCKED RULE: no sending happens here or anywhere for LinkedIn. This produces a
 * deterministic ramp schedule of daily *targets* an operator warms an account up
 * to over ~3 weeks. It's guidance for the human, not an auto-sender.
 */

export interface WarmupAccount {
  id?: string;
  name?: string;
  dailyWarmupTarget: number; // the steady-state daily target to ramp toward
  warmupDay: number; // which day of the ramp the account is currently on
  status?: string;
}

export interface WarmupDay {
  day: number;
  week: number;
  target: number;
  isCurrent: boolean;
  isComplete: boolean;
}

export interface WarmupPlanResult {
  accountId: string | null;
  finalTarget: number;
  startTarget: number;
  totalDays: number;
  currentDay: number;
  todayTarget: number;
  complete: boolean;
  schedule: WarmupDay[];
}

const RAMP_DAYS = 21; // 3-week ramp
const MIN_START = 3; // never start below a few actions/day

/**
 * Deterministic ramp: linear interpolation from a conservative start up to the
 * account's steady-state target over RAMP_DAYS. Same input → same plan.
 */
export function warmupPlan(account: WarmupAccount): WarmupPlanResult {
  const finalTarget = Math.max(1, Math.floor(account.dailyWarmupTarget || 20));
  // Start at ~15% of the target (at least MIN_START, never above the target).
  const startTarget = Math.min(finalTarget, Math.max(MIN_START, Math.round(finalTarget * 0.15)));
  const totalDays = RAMP_DAYS;
  const currentDay = Math.max(1, Math.floor(account.warmupDay || 1));

  const schedule: WarmupDay[] = [];
  for (let day = 1; day <= totalDays; day++) {
    // Linear ramp; day 1 = startTarget, day totalDays = finalTarget.
    const frac = totalDays > 1 ? (day - 1) / (totalDays - 1) : 1;
    const target = Math.round(startTarget + (finalTarget - startTarget) * frac);
    schedule.push({
      day,
      week: Math.ceil(day / 7),
      target,
      isCurrent: day === currentDay,
      isComplete: day < currentDay,
    });
  }

  const todayTarget = currentDay <= totalDays ? schedule[currentDay - 1].target : finalTarget;

  return {
    accountId: account.id ?? null,
    finalTarget,
    startTarget,
    totalDays,
    currentDay,
    todayTarget,
    complete: currentDay > totalDays,
    schedule,
  };
}
