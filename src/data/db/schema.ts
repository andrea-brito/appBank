import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Money columns are INTEGER cents. No REAL/float column ever holds money.

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('💸'),
  color: text('color').notNull().default('#6366f1'),
  kind: text('kind', { enum: ['expense', 'income'] }).notNull(),
  budgetCents: integer('budget_cents'), // null = no budget
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    amountCents: integer('amount_cents').notNull(), // always > 0
    kind: text('kind', { enum: ['expense', 'income'] }).notNull(),
    description: text('description').notNull().default(''),
    occurredAt: integer('occurred_at').notNull(), // epoch ms
    source: text('source', { enum: ['manual', 'ofx', 'openfinance', 'boleto', 'pix'] })
      .notNull()
      .default('manual'),
    externalId: text('external_id'), // dedupe key for imports
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    occurredIdx: index('idx_tx_occurred').on(t.occurredAt),
    // Idempotent imports: same source+external_id never inserted twice.
    sourceExternalIdx: uniqueIndex('uq_tx_source_external').on(t.source, t.externalId),
  }),
);

// Savings goals: trip, emergency fund, "cofrinho". targetCents in integer cents.
export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('🎯'),
    color: text('color').notNull().default('#6366f1'),
    targetCents: integer('target_cents').notNull(), // > 0
    startAt: integer('start_at').notNull(), // epoch ms
    endAt: integer('end_at'), // epoch ms, null = no deadline
    archivedAt: integer('archived_at'), // null = active
    // What the money is saved for. Amounts stay in BRL cents; EUR/USD only
    // changes how the goal shows "how much foreign currency this buys today".
    currency: text('currency', { enum: ['BRL', 'EUR', 'USD'] }).notNull().default('BRL'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    activeIdx: index('idx_goal_active').on(t.archivedAt),
  }),
);

// Each deposit a user puts toward a goal. Sum of deposits = saved amount.
export const goalDeposits = sqliteTable(
  'goal_deposits',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(), // may be negative (withdrawal)
    occurredAt: integer('occurred_at').notNull(), // epoch ms
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    goalIdx: index('idx_deposit_goal').on(t.goalId),
  }),
);

export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type GoalRow = typeof goals.$inferSelect;
export type GoalDepositRow = typeof goalDeposits.$inferSelect;
