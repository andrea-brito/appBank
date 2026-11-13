import { eq } from 'drizzle-orm';

import { validateCategory, type CategoryDraft } from '@/domain/category';

import { db, schema } from './db/client';

async function all() {
  return db.select({ id: schema.categories.id, name: schema.categories.name, kind: schema.categories.kind }).from(schema.categories);
}

export async function addCategory(draft: CategoryDraft): Promise<string> {
  const c = validateCategory(draft, await all());
  // Not a security token; unique enough for a single user's categories.
  const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.categories).values({ id, ...c, budgetCents: null });
  return id;
}

/** Kind is fixed after creation: existing entries were filed under it. */
export async function updateCategory(id: string, draft: Omit<CategoryDraft, 'kind'>): Promise<void> {
  const [current] = await db.select().from(schema.categories).where(eq(schema.categories.id, id)).limit(1);
  if (!current) throw new Error('Categoria não encontrada.');
  const c = validateCategory({ ...draft, kind: current.kind }, await all(), id);
  await db
    .update(schema.categories)
    .set({ name: c.name, icon: c.icon, color: c.color })
    .where(eq(schema.categories.id, id));
}

/** Entries of the category become "Sem categoria"; nothing else is deleted. */
export async function deleteCategory(id: string): Promise<void> {
  // Explicit instead of relying on ON DELETE SET NULL (needs PRAGMA foreign_keys).
  // Sync transaction, same pattern as backupRepository (expo-sqlite driver).
  db.transaction((tx) => {
    tx.update(schema.transactions).set({ categoryId: null }).where(eq(schema.transactions.categoryId, id)).run();
    tx.delete(schema.categories).where(eq(schema.categories.id, id)).run();
  });
}
