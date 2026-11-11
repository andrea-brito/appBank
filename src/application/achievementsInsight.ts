import { sql } from 'drizzle-orm';

import { db, schema } from '@/data/db/client';
import { budgetStatus } from '@/domain/budgetStatus';
import { computeAchievements, type Achievement } from '@/domain/achievements';
import { currentMonth } from '@/domain/period';

/** Build the achievement context from current DB state and derive the badges. */
export async function getAchievements(now: Date = new Date()): Promise<Achievement[]> {
  const period = currentMonth(now);

  const [[{ txCount }], [{ goalsCreated }], goals, savedRows, categories, monthExpenses] =
    await Promise.all([
      db.select({ txCount: sql<number>`count(*)` }).from(schema.transactions),
      db.select({ goalsCreated: sql<number>`count(*)` }).from(schema.goals),
      db.select({ id: schema.goals.id, target: schema.goals.targetCents }).from(schema.goals),
      db
        .select({
          goalId: schema.goalDeposits.goalId,
          saved: sql<number>`coalesce(sum(${schema.goalDeposits.amountCents}), 0)`,
        })
        .from(schema.goalDeposits)
        .groupBy(schema.goalDeposits.goalId),
      db.select().from(schema.categories),
      db
        .select({
          categoryId: schema.transactions.categoryId,
          spent: sql<number>`coalesce(sum(${schema.transactions.amountCents}), 0)`,
        })
        .from(schema.transactions)
        .where(
          sql`${schema.transactions.kind} = 'expense' and ${schema.transactions.occurredAt} between ${period.from} and ${period.to}`,
        )
        .groupBy(schema.transactions.categoryId),
    ]);

  const savedMap = new Map(savedRows.map((r) => [r.goalId, r.saved]));
  const totalSavedCents = savedRows.reduce((acc, r) => acc + r.saved, 0);
  const goalsCompleted = goals.filter(
    (g) => (savedMap.get(g.id) ?? 0) >= g.target && g.target > 0,
  ).length;

  // Within budget = every category that has a budget stayed at ok/warning
  // (i.e. not over) this month, and at least one budget exists.
  const spentMap = new Map(monthExpenses.map((r) => [r.categoryId, r.spent]));
  const budgeted = categories.filter((c) => c.budgetCents != null);
  const withinBudgetThisMonth =
    budgeted.length > 0 &&
    budgeted.every((c) => budgetStatus(spentMap.get(c.id) ?? 0, c.budgetCents).level !== 'over');

  return computeAchievements({
    goalsCreated,
    goalsCompleted,
    totalSavedCents,
    withinBudgetThisMonth,
    transactionCount: txCount,
  });
}
