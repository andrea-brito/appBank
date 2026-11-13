import { sql } from 'drizzle-orm';

import { db, schema } from './db/client';

const DEFAULT_CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação', icon: '🍔', color: '#ef4444', kind: 'expense' as const },
  { id: 'cat-transport', name: 'Transporte', icon: '🚗', color: '#f59e0b', kind: 'expense' as const },
  { id: 'cat-home', name: 'Moradia', icon: '🏠', color: '#3b82f6', kind: 'expense' as const },
  { id: 'cat-leisure', name: 'Lazer', icon: '🎮', color: '#8b5cf6', kind: 'expense' as const },
  { id: 'cat-health', name: 'Saúde', icon: '💊', color: '#10b981', kind: 'expense' as const },
  { id: 'cat-other', name: 'Outros', icon: '💸', color: '#6b7280', kind: 'expense' as const },
  { id: 'cat-salary', name: 'Salário', icon: '💰', color: '#22c55e', kind: 'income' as const },
];

/**
 * Insert the default categories on a brand-new database only. Categories are
 * user-editable now, so re-inserting on every launch would bring back the ones
 * the user deleted.
 * ponytail: "empty table" stands in for "first run"; deleting every category
 * brings the defaults back, which is a fine outcome for an empty list.
 */
export async function seedDefaultCategories(): Promise<void> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.categories);
  if (n > 0) return;
  await db
    .insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, budgetCents: null })))
    .onConflictDoNothing();
}
