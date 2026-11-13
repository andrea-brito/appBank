import { z } from 'zod';

import { addDeposit, createGoal, getGoal, updateGoal } from '@/data/goalRepository';
import { isSingleEmoji } from '@/domain/category';
import { isValidCents, parseToCents } from '@/domain/money';
import { TEXT_MAX } from '@/domain/types';

const createGoalSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à meta').max(TEXT_MAX, `Nome com no máximo ${TEXT_MAX} caracteres.`),
  targetText: z.string().min(1, 'Informe o valor-alvo'),
  icon: z.string().trim().refine(isSingleEmoji, 'Escolha um emoji para o ícone.').default('🎯'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.').default('#6366f1'),
  currency: z.enum(['BRL', 'EUR', 'USD']).default('BRL'),
  startAt: z.number().int().positive().default(() => Date.now()),
  endAt: z.number().int().positive().nullable().default(null),
});

export type CreateGoalInput = z.input<typeof createGoalSchema>;

function validGoal(input: CreateGoalInput) {
  const parsed = createGoalSchema.parse(input);
  const targetCents = parseToCents(parsed.targetText);

  if (!isValidCents(targetCents) || targetCents <= 0) {
    throw new Error('Valor-alvo inválido. Ex: 5.000,00');
  }
  if (parsed.endAt != null && parsed.endAt < parsed.startAt) {
    throw new Error('A data final não pode ser antes da inicial');
  }
  return {
    name: parsed.name,
    icon: parsed.icon,
    color: parsed.color.toLowerCase(),
    currency: parsed.currency,
    targetCents,
    startAt: parsed.startAt,
    endAt: parsed.endAt,
  };
}

/** zod issue -> the user-facing message, instead of the raw JSON dump. */
function friendly<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof z.ZodError) throw new Error(e.issues[0]?.message ?? 'Dados inválidos.');
    throw e;
  }
}

export async function createGoalUseCase(input: CreateGoalInput): Promise<string> {
  return createGoal(friendly(() => validGoal(input)));
}

export async function updateGoalUseCase(id: string, input: CreateGoalInput): Promise<void> {
  const goal = friendly(() => validGoal(input));
  if (!(await getGoal(id))) throw new Error('Meta não encontrada.');
  await updateGoal(id, goal);
}

const depositSchema = z.object({
  goalId: z.string().min(1),
  amountText: z.string().min(1, 'Informe um valor'),
  occurredAt: z.number().int().positive().default(() => Date.now()),
});

export type DepositInput = z.input<typeof depositSchema>;

export async function addDepositUseCase(input: DepositInput): Promise<void> {
  const parsed = depositSchema.parse(input);
  const amountCents = parseToCents(parsed.amountText);

  // Deposits must be non-zero; negative is allowed (a withdrawal from the goal).
  if (!isValidCents(amountCents) || amountCents === 0) {
    throw new Error('Valor inválido. Ex: 100,00');
  }

  await addDeposit(parsed.goalId, amountCents, parsed.occurredAt);
}
