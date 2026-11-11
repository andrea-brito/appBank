import { z } from 'zod';

import { addTransaction } from '@/data/transactionRepository';
import { isValidCents, parseToCents } from '@/domain/money';

// Trust boundary: everything from the UI is validated here before it touches
// the DB. The amount arrives as the raw string the user typed.
const rawInput = z.object({
  amountText: z.string().min(1, 'Informe um valor'),
  kind: z.enum(['expense', 'income']),
  description: z.string().max(140).default(''),
  categoryId: z.string().nullable().default(null),
  occurredAt: z.number().int().positive().default(() => Date.now()),
  source: z.enum(['manual', 'ofx', 'openfinance', 'boleto', 'pix']).default('manual'),
});

export type AddExpenseInput = z.input<typeof rawInput>;

export async function addExpense(input: AddExpenseInput): Promise<string> {
  const parsed = rawInput.parse(input);
  const amountCents = parseToCents(parsed.amountText);

  if (!isValidCents(amountCents) || amountCents <= 0) {
    throw new Error('Valor inválido. Use um número maior que zero, ex: 19,99');
  }

  return addTransaction({
    amountCents,
    kind: parsed.kind,
    description: parsed.description.trim(),
    categoryId: parsed.categoryId,
    occurredAt: parsed.occurredAt,
    source: parsed.source,
  });
}
