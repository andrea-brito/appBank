import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { installmentLabel, installmentSiblings, parseInstallment } from '@/domain/installments';
import type { Cents } from '@/domain/money';
import type { TransactionKind, TransactionSourceKind } from '@/domain/types';

import { db, schema } from './db/client';
import type { TransactionRow } from './db/schema';

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

/** Several rows in ONE insert statement: all or nothing (used for installments). */
export async function addTransactions(inputs: readonly NewTransactionInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const now = Date.now();
  await db.insert(schema.transactions).values(
    inputs.map((input) => ({
      id: randomId(),
      amountCents: input.amountCents,
      kind: input.kind,
      description: input.description,
      categoryId: input.categoryId,
      occurredAt: input.occurredAt,
      source: input.source ?? 'manual',
      externalId: input.externalId ?? null,
      createdAt: now,
    })),
  );
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
}

export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const [row] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, id)).limit(1);
  return row ?? null;
}

export type TransactionPatch = Partial<
  Pick<TransactionRow, 'amountCents' | 'kind' | 'description' | 'categoryId' | 'occurredAt'>
>;

export async function updateTransaction(id: string, patch: TransactionPatch): Promise<void> {
  await db.update(schema.transactions).set(patch).where(eq(schema.transactions.id, id));
}

/** Rename / recategorize every installment of the purchase `tx` belongs to (keeps each "(i/n)"). */
export async function updatePurchase(tx: TransactionRow, base: string, categoryId: string | null): Promise<void> {
  const sameBatch = await db.select().from(schema.transactions).where(eq(schema.transactions.createdAt, tx.createdAt));
  for (const row of installmentSiblings(tx, sameBatch)) {
    const p = parseInstallment(row.description);
    if (!p) continue;
    await updateTransaction(row.id, { description: installmentLabel(base, p.index, p.count), categoryId });
  }
}

/** Delete a transaction, or the whole purchase if it is an installment (one statement). */
export async function deleteTransactionOrPurchase(tx: TransactionRow): Promise<number> {
  const sameBatch = await db
    .select({ id: schema.transactions.id, description: schema.transactions.description, createdAt: schema.transactions.createdAt })
    .from(schema.transactions)
    .where(eq(schema.transactions.createdAt, tx.createdAt));
  const ids = installmentSiblings(tx, sameBatch).map((r) => r.id);
  if (ids.length === 0) return 0;
  await db.delete(schema.transactions).where(inArray(schema.transactions.id, ids));
  return ids.length;
}

export function monthTransactionsQuery(from: number, to: number) {
  return db
    .select()
    .from(schema.transactions)
    .where(and(gte(schema.transactions.occurredAt, from), lte(schema.transactions.occurredAt, to)))
    .orderBy(desc(schema.transactions.occurredAt));
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

/**
 * Newest first, up to `until` (epoch ms) so future installments don't crowd
 * out what already happened. Pass the end of the current month, not "now":
 * entries added after the screen mounted must still show up.
 */
export function recentTransactionsQuery(limit: number, until: number) {
  return db
    .select()
    .from(schema.transactions)
    .where(lte(schema.transactions.occurredAt, until))
    .orderBy(desc(schema.transactions.occurredAt))
    .limit(limit);
}

export function categoriesQuery() {
  return db.select().from(schema.categories);
}
