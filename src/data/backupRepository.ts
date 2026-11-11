import { sql } from 'drizzle-orm';

import type { BackupSnapshot } from '@/domain/backup';

import { db, schema } from './db/client';

/** Read every table. Order of keys matches BackupSnapshot. */
export async function readSnapshot(): Promise<BackupSnapshot> {
  const [categories, transactions, goals, goalDeposits] = await Promise.all([
    db.select().from(schema.categories),
    db.select().from(schema.transactions),
    db.select().from(schema.goals),
    db.select().from(schema.goalDeposits),
  ]);
  return { categories, transactions, goals, goalDeposits };
}

export interface RestoreResult {
  categories: number; // upserted
  transactions: number; // newly inserted (existing ones are kept)
  goals: number;
  goalDeposits: number;
}

// Stay far below SQLite's bound-parameter limit (9 columns x 50 rows = 450).
const CHUNK = 50;
function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/**
 * Merge a snapshot into the database, all-or-nothing.
 *
 * - Categories: upsert by id, so budgets come back on a fresh install (the
 *   default categories were already seeded with the same ids and no budget).
 * - Everything else: insert-or-ignore. Rows already present are untouched, so
 *   restoring twice, or on top of existing data, never duplicates or deletes.
 *
 * Drizzle's expo-sqlite driver runs transactions synchronously (begin ->
 * callback -> commit, rollback on throw), hence .run()/.all() and no await.
 */
export function restoreSnapshot(s: BackupSnapshot): RestoreResult {
  return db.transaction((tx) => {
    for (const rows of chunks(s.categories)) {
      tx.insert(schema.categories)
        .values(rows)
        .onConflictDoUpdate({
          target: schema.categories.id,
          set: {
            name: sql`excluded.name`,
            icon: sql`excluded.icon`,
            color: sql`excluded.color`,
            kind: sql`excluded.kind`,
            budgetCents: sql`excluded.budget_cents`,
          },
        })
        .run();
    }

    let goals = 0;
    for (const rows of chunks(s.goals)) {
      goals += tx.insert(schema.goals).values(rows).onConflictDoNothing().returning({ id: schema.goals.id }).all().length;
    }

    let transactions = 0;
    for (const rows of chunks(s.transactions)) {
      transactions += tx
        .insert(schema.transactions)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: schema.transactions.id })
        .all().length;
    }

    let goalDeposits = 0;
    for (const rows of chunks(s.goalDeposits)) {
      goalDeposits += tx
        .insert(schema.goalDeposits)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: schema.goalDeposits.id })
        .all().length;
    }

    return { categories: s.categories.length, transactions, goals, goalDeposits };
  });
}
