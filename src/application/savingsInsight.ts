import { monthlyFlows, totalBudgetCents } from '@/data/analyticsRepository';
import { sumByKind } from '@/data/transactionRepository';
import { currentMonth } from '@/domain/period';
import { suggestSavings, type SavingsSuggestion } from '@/domain/savingsSuggestion';

const HISTORY_MONTHS = 3;

/**
 * Builds the savings suggestion from the last few months of cash flow plus
 * the current month's budget headroom. This is a heuristic to guide saving,
 * not financial advice — the UI must say so.
 */
export async function getSavingsSuggestion(now: Date = new Date()): Promise<SavingsSuggestion> {
  const month = currentMonth(now);
  const [flows, budget, currentExpense] = await Promise.all([
    monthlyFlows(HISTORY_MONTHS, now),
    totalBudgetCents(),
    sumByKind('expense', month.from, month.to),
  ]);

  return suggestSavings(flows, budget, currentExpense);
}
