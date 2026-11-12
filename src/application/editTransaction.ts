import { z } from 'zod';

import { getTransaction, updatePurchase, updateTransaction } from '@/data/transactionRepository';
import { parseInstallment } from '@/domain/installments';
import { isValidCents, parseToCents } from '@/domain/money';

// Trust boundary: same validation as adding.
const rawInput = z.object({
  id: z.string().min(1),
  amountText: z.string().min(1, 'Informe um valor'),
  kind: z.enum(['expense', 'income']),
  description: z.string().max(140).default(''),
  categoryId: z.string().nullable().default(null),
  occurredAt: z.number().int().positive(),
});

export type EditTransactionInput = z.input<typeof rawInput>;

/**
 * Save an edited entry. For an installment, description and category apply to
 * the whole purchase (so it stays one purchase), amount and date only to this
 * installment.
 */
export async function editTransaction(input: EditTransactionInput): Promise<void> {
  const p = rawInput.parse(input);
  const amountCents = parseToCents(p.amountText);
  if (!isValidCents(amountCents) || amountCents <= 0) {
    throw new Error('Valor inválido. Use um número maior que zero, ex: 19,99');
  }

  const tx = await getTransaction(p.id);
  if (!tx) throw new Error('Lançamento não encontrado (talvez já tenha sido excluído).');

  if (parseInstallment(tx.description)) {
    if (p.kind !== 'expense') throw new Error('Uma parcela não pode virar receita.');
    await updatePurchase(tx, p.description.trim(), p.categoryId);
    await updateTransaction(tx.id, { amountCents, occurredAt: p.occurredAt });
    return;
  }

  await updateTransaction(tx.id, {
    amountCents,
    kind: p.kind,
    description: p.description.trim(),
    categoryId: p.categoryId,
    occurredAt: p.occurredAt,
  });
}
