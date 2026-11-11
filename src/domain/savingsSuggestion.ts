import type { Cents } from './money';

export interface MonthlyFlow {
  incomeCents: Cents;
  expenseCents: Cents;
}

export interface SavingsSuggestion {
  /** Average monthly leftover (income - expense) across the sample. */
  avgLeftoverCents: Cents;
  /** Extra room if the user stays within defined budgets, vs. actual spend. */
  budgetRoomCents: Cents;
  /** What we suggest setting aside this month. Never negative. */
  suggestedCents: Cents;
  /** How many months of history backed the suggestion. */
  sampleMonths: number;
  /** True when there isn't enough history to be meaningful. */
  lowConfidence: boolean;
}

// ponytail: deliberately simple heuristic, not a forecast. Ceiling: ignores
// seasonality and one-off spikes beyond the averaging window. Upgrade path:
// swap in a median/trimmed-mean or a proper time-series model later.
const SUGGEST_FRACTION = 0.5; // suggest banking half of the realistic leftover

/**
 * Suggest a monthly amount to save from recent cash flow.
 *
 * - Averages leftover across the provided months to smooth out atypical months.
 * - `budgetRoomCents` rewards staying under budget: total budget minus what was
 *   actually spent (only counted when positive) nudges the suggestion up.
 * - Result is clamped to >= 0: we never suggest "saving" a negative amount.
 */
export function suggestSavings(
  months: readonly MonthlyFlow[],
  totalBudgetCents: Cents,
  currentMonthExpenseCents: Cents,
): SavingsSuggestion {
  const sampleMonths = months.length;
  const lowConfidence = sampleMonths < 2;

  const totalLeftover = months.reduce((acc, m) => acc + (m.incomeCents - m.expenseCents), 0);
  const avgLeftoverCents = sampleMonths === 0 ? 0 : Math.round(totalLeftover / sampleMonths);

  // Staying under budget frees up room; overspending contributes nothing (not a penalty here).
  const budgetRoomCents =
    totalBudgetCents > 0 ? Math.max(0, totalBudgetCents - currentMonthExpenseCents) : 0;

  const base = Math.max(0, avgLeftoverCents);
  const suggestedCents = Math.max(
    0,
    Math.round(base * SUGGEST_FRACTION) + Math.round(budgetRoomCents * SUGGEST_FRACTION),
  );

  return { avgLeftoverCents, budgetRoomCents, suggestedCents, sampleMonths, lowConfidence };
}
