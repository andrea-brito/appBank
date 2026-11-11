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

/** Insert default categories once. onConflictDoNothing keeps this idempotent. */
export async function seedDefaultCategories(): Promise<void> {
  await db
    .insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, budgetCents: null })))
    .onConflictDoNothing();
}
