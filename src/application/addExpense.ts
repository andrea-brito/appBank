import { addMonths } from 'date-fns';
import { z } from 'zod';

import { addTransaction, addTransactions } from '@/data/transactionRepository';
import {
  installmentDates,
  installmentLabel,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  splitInstallments,
} from '@/domain/installments';
import { isValidCents, parseToCents } from '@/domain/money';
import { TEXT_MAX } from '@/domain/types';

// Trust boundary: everything from the UI is validated here before it touches
// the DB. The amount arrives as the raw string the user typed.
const rawInput = z.object({
  amountText: z.string().min(1, 'Informe um valor'),
  kind: z.enum(['expense', 'income']),
  description: z.string().max(TEXT_MAX, `Descrição com no máximo ${TEXT_MAX} caracteres.`).default(''),
  categoryId: z.string().nullable().default(null),
  occurredAt: z.number().int().positive().default(() => Date.now()),
  source: z.enum(['manual', 'ofx', 'openfinance', 'boleto', 'pix']).default('manual'),
  /** Expense paid in N monthly installments; amountText is the TOTAL. */
  installments: z
    .object({
      count: z
        .number()
        .int('Número de parcelas inválido')
        .min(MIN_INSTALLMENTS, `Mínimo de ${MIN_INSTALLMENTS} parcelas`)
        .max(MAX_INSTALLMENTS, `Máximo de ${MAX_INSTALLMENTS} parcelas`),
      /** true = first installment next month (e.g. card statement closed). */
      startNextMonth: z.boolean().default(false),
    })
    .nullable()
    .default(null),
});

export type AddExpenseInput = z.input<typeof rawInput>;

export async function addExpense(input: AddExpenseInput): Promise<void> {
  const parsed = rawInput.parse(input);
  const amountCents = parseToCents(parsed.amountText);

  if (!isValidCents(amountCents) || amountCents <= 0) {
    throw new Error('Valor inválido. Use um número maior que zero, ex: 19,99');
  }

  const base = {
    kind: parsed.kind,
    categoryId: parsed.categoryId,
    source: parsed.source,
  };

  if (parsed.installments == null) {
    await addTransaction({ ...base, amountCents, description: parsed.description.trim(), occurredAt: parsed.occurredAt });
    return;
  }

  if (parsed.kind !== 'expense') throw new Error('Só despesas podem ser parceladas.');
  const { count, startNextMonth } = parsed.installments;
  const first = startNextMonth ? addMonths(parsed.occurredAt, 1) : new Date(parsed.occurredAt);
  const amounts = splitInstallments(amountCents, count);
  const dates = installmentDates(first, count);

  await addTransactions(
    amounts.map((cents, i) => ({
      ...base,
      amountCents: cents,
      description: installmentLabel(parsed.description, i, count),
      occurredAt: dates[i],
    })),
  );
}
