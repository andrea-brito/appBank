import { desc, eq, isNull, sql } from 'drizzle-orm';

import type { Cents } from '@/domain/money';

import { db, schema } from './db/client';

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface NewGoalInput {
  name: string;
  icon?: string;
  color?: string;
  targetCents: Cents;
  startAt: number;
  endAt: number | null;
}

export async function createGoal(input: NewGoalInput): Promise<string> {
  const id = randomId();
  await db.insert(schema.goals).values({
    id,
    name: input.name,
    icon: input.icon ?? '🎯',
    color: input.color ?? '#6366f1',
    targetCents: input.targetCents,
    startAt: input.startAt,
    endAt: input.endAt,
    createdAt: Date.now(),
  });
  return id;
}

export async function getGoal(id: string) {
  const [row] = await db.select().from(schema.goals).where(eq(schema.goals.id, id)).limit(1);
  return row ?? null;
}

export async function updateGoal(id: string, input: NewGoalInput): Promise<void> {
  await db
    .update(schema.goals)
    .set({
      name: input.name,
      icon: input.icon ?? '🎯',
      color: input.color ?? '#6366f1',
      targetCents: input.targetCents,
      startAt: input.startAt,
      endAt: input.endAt,
    })
    .where(eq(schema.goals.id, id));
}

export async function addDeposit(goalId: string, amountCents: Cents, occurredAt: number) {
  await db.insert(schema.goalDeposits).values({
    id: randomId(),
    goalId,
    amountCents,
    occurredAt,
    createdAt: Date.now(),
  });
}

export async function archiveGoal(goalId: string) {
  await db.update(schema.goals).set({ archivedAt: Date.now() }).where(eq(schema.goals.id, goalId));
}

/** Active goals (not archived), newest first. */
export function activeGoalsQuery() {
  return db
    .select()
    .from(schema.goals)
    .where(isNull(schema.goals.archivedAt))
    .orderBy(desc(schema.goals.createdAt));
}

/** Saved amount per goal = sum of its deposits. Returned as a map-friendly list. */
export function savedPerGoalQuery() {
  return db
    .select({
      goalId: schema.goalDeposits.goalId,
      saved: sql<number>`coalesce(sum(${schema.goalDeposits.amountCents}), 0)`,
    })
    .from(schema.goalDeposits)
    .groupBy(schema.goalDeposits.goalId);
}

/** All deposits (for computing per-period sums like "saved this month"). */
export function allDepositsQuery() {
  return db.select().from(schema.goalDeposits);
}
