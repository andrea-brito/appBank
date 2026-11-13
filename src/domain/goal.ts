import { differenceInCalendarMonths } from 'date-fns';

import { parseDateBR } from './dates';
import type { Cents } from './money';

export interface GoalProgress {
  savedCents: Cents;
  targetCents: Cents;
  remainingCents: Cents; // >= 0
  ratio: number; // 0..1 (clamped)
  isComplete: boolean;
  /** Months left until endAt from `now`, or null when there is no deadline. */
  monthsLeft: number | null;
  /** Suggested per-month deposit to hit the target by endAt, or null. */
  monthlyTargetCents: Cents | null;
}

/**
 * Goal period from the form. Start is required, end optional ("sem prazo").
 * Throws a message meant for the user.
 */
export function parseGoalPeriod(startText: string, endText: string): { startAt: number; endAt: number | null } {
  const startAt = parseDateBR(startText);
  if (startAt == null) throw new Error('Data de início inválida. Use dd/mm/aaaa.');
  if (endText.trim() === '') return { startAt, endAt: null };
  const endAt = parseDateBR(endText);
  if (endAt == null) throw new Error('Data final inválida. Use dd/mm/aaaa, ou deixe em branco para sem prazo.');
  if (endAt < startAt) throw new Error('A data final não pode ser antes do início.');
  return { startAt, endAt };
}

/**
 * Pure goal math. savedCents is the summed deposits (can exceed or, via
 * withdrawals, dip below zero). All money stays integer cents.
 */
export function goalProgress(
  savedCents: Cents,
  targetCents: Cents,
  endAt: number | null,
  now: Date = new Date(),
): GoalProgress {
  const remainingCents = Math.max(0, targetCents - savedCents);
  const ratio = targetCents <= 0 ? 1 : Math.min(1, Math.max(0, savedCents / targetCents));
  const isComplete = savedCents >= targetCents && targetCents > 0;

  let monthsLeft: number | null = null;
  let monthlyTargetCents: Cents | null = null;

  if (endAt != null) {
    // At least 1 month so we never divide by zero and the last month still counts.
    monthsLeft = Math.max(1, differenceInCalendarMonths(new Date(endAt), now) + 1);
    monthlyTargetCents = isComplete ? 0 : Math.ceil(remainingCents / monthsLeft);
  }

  return {
    savedCents,
    targetCents,
    remainingCents,
    ratio,
    isComplete,
    monthsLeft,
    monthlyTargetCents,
  };
}
