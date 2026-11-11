import type { Cents } from './money';

export type BudgetLevel = 'none' | 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  level: BudgetLevel;
  ratio: number; // spent / budget, 0 when no budget
  color: string; // UI color for the level
  message: string | null; // user-facing alert, null when nothing to say
}

// Warn once spending reaches this share of the budget.
export const WARNING_THRESHOLD = 0.7;

const COLORS: Record<BudgetLevel, string> = {
  none: '#6b7280',
  ok: '#22c55e',
  warning: '#f59e0b',
  over: '#ef4444',
};

/**
 * Classify spending against a category budget into ok / warning (>=70%) / over
 * (>100%). All money is integer cents; the ratio is the only float and is used
 * for display, not for the threshold comparisons (those stay integer).
 */
export function budgetStatus(spentCents: Cents, budgetCents: Cents | null): BudgetStatus {
  if (budgetCents == null || budgetCents <= 0) {
    return { level: 'none', ratio: 0, color: COLORS.none, message: null };
  }

  const ratio = spentCents / budgetCents;

  // Integer comparisons avoid float edge cases at the exact threshold:
  // 70% of budget is compared as spent*100 >= budget*70.
  const over = spentCents > budgetCents;
  const warning = !over && spentCents * 100 >= budgetCents * Math.round(WARNING_THRESHOLD * 100);

  let level: BudgetLevel;
  let message: string | null;
  if (over) {
    level = 'over';
    message = 'Você estourou o limite deste mês.';
  } else if (warning) {
    level = 'warning';
    message = 'Você está chegando ao limite, cuidado.';
  } else {
    level = 'ok';
    message = null;
  }

  return { level, ratio, color: COLORS[level], message };
}
