import { isNotNull, sql } from 'drizzle-orm';

import type { Cents } from '@/domain/money';
import type { MonthlyFlow } from '@/domain/savingsSuggestion';
import { previousMonths } from '@/domain/period';

import { db, schema } from './db/client';
import { sumByKind } from './transactionRepository';

/** income - expense for each of the last `count` complete months, oldest first. */
export async function monthlyFlows(count: number, now: Date = new Date()): Promise<MonthlyFlow[]> {
  const periods = previousMonths(count, now);
  return Promise.all(
    periods.map(async (p) => ({
      incomeCents: await sumByKind('income', p.from, p.to),
      expenseCents: await sumByKind('expense', p.from, p.to),
    })),
  );
}

/** Total of all defined category budgets (null budgets excluded). */
export async function totalBudgetCents(): Promise<Cents> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.categories.budgetCents}), 0)` })
    .from(schema.categories)
    .where(isNotNull(schema.categories.budgetCents));
  return row?.total ?? 0;
}
