import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { Cents } from '@/domain/money';
import type { TransactionKind, TransactionSourceKind } from '@/domain/types';

import { db, schema } from './db/client';

export interface NewTransactionInput {
  amountCents: Cents;
  kind: TransactionKind;
  description: string;
  categoryId: string | null;
  occurredAt: number;
  source?: TransactionSourceKind;
  externalId?: string | null;
}

function randomId(): string {
  // Good enough for a single-user local DB; not a security token.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function addTransaction(input: NewTransactionInput): Promise<string> {
  const id = randomId();
  await db.insert(schema.transactions).values({
    id,
    amountCents: input.amountCents,
    kind: input.kind,
    description: input.description,
    categoryId: input.categoryId,
    occurredAt: input.occurredAt,
    source: input.source ?? 'manual',
    externalId: input.externalId ?? null,
    createdAt: Date.now(),
  });
  return id;
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
}

export interface ImportRow {
  amountCents: Cents; // positive magnitude
  kind: TransactionKind;
  description: string;
  occurredAt: number;
  externalId: string; // dedupe key (e.g. OFX FITID)
}

/**
 * Bulk-insert imported transactions, skipping any whose (source, externalId)
 * already exists. onConflictDoNothing makes re-importing the same file a
 * no-op, so you can import an overlapping statement safely.
 * Returns how many rows were actually inserted.
 */
export async function importTransactions(
  rows: readonly ImportRow[],
  source: TransactionSourceKind,
): Promise<number> {
  if (rows.length === 0) return 0;

  const before = await countTransactions();
  await db
    .insert(schema.transactions)
    .values(
      rows.map((r) => ({
        id: `${randomId()}`,
        amountCents: r.amountCents,
        kind: r.kind,
        description: r.description,
        categoryId: null,
        occurredAt: r.occurredAt,
        source,
        externalId: r.externalId,
        createdAt: Date.now(),
      })),
    )
    .onConflictDoNothing();
  const after = await countTransactions();
  return after - before;
}

async function countTransactions(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.transactions);
  return row?.n ?? 0;
}

/** Sum of a kind within [from, to] (epoch ms). Done in SQL with integer cents. */
export async function sumByKind(
  kind: TransactionKind,
  from: number,
  to: number,
): Promise<Cents> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.transactions.amountCents}), 0)` })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.kind, kind),
        gte(schema.transactions.occurredAt, from),
        lte(schema.transactions.occurredAt, to),
      ),
    );
  return row?.total ?? 0;
}

/** Spend per category for expenses within a period. */
export async function spendByCategory(from: number, to: number) {
  return db
    .select({
      categoryId: schema.transactions.categoryId,
      total: sql<number>`coalesce(sum(${schema.transactions.amountCents}), 0)`,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.kind, 'expense'),
        gte(schema.transactions.occurredAt, from),
        lte(schema.transactions.occurredAt, to),
      ),
    )
    .groupBy(schema.transactions.categoryId);
}

export function recentTransactionsQuery(limit = 50) {
  return db
    .select()
    .from(schema.transactions)
    .orderBy(desc(schema.transactions.occurredAt))
    .limit(limit);
}

export function categoriesQuery() {
  return db.select().from(schema.categories);
}
