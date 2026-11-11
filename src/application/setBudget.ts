import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, schema } from '@/data/db/client';
import { isValidCents, parseToCents } from '@/domain/money';

const schemaIn = z.object({
  categoryId: z.string().min(1),
  budgetText: z.string(), // empty string clears the budget
});

export type SetBudgetInput = z.input<typeof schemaIn>;

/** Set or clear the monthly budget for a category. Empty input removes it. */
export async function setBudgetUseCase(input: SetBudgetInput): Promise<void> {
  const parsed = schemaIn.parse(input);
  const trimmed = parsed.budgetText.trim();

  let budgetCents: number | null;
  if (trimmed === '') {
    budgetCents = null;
  } else {
    budgetCents = parseToCents(trimmed);
    if (!isValidCents(budgetCents) || budgetCents < 0) {
      throw new Error('Orçamento inválido. Ex: 800,00 (ou deixe vazio para remover)');
    }
  }

  await db
    .update(schema.categories)
    .set({ budgetCents })
    .where(eq(schema.categories.id, parsed.categoryId));
}
