import { z } from 'zod';

import { addDeposit, createGoal } from '@/data/goalRepository';
import { isValidCents, parseToCents } from '@/domain/money';

const createGoalSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à meta').max(80),
  targetText: z.string().min(1, 'Informe o valor-alvo'),
  icon: z.string().default('🎯'),
  color: z.string().default('#6366f1'),
  startAt: z.number().int().positive().default(() => Date.now()),
  endAt: z.number().int().positive().nullable().default(null),
});

export type CreateGoalInput = z.input<typeof createGoalSchema>;

export async function createGoalUseCase(input: CreateGoalInput): Promise<string> {
  const parsed = createGoalSchema.parse(input);
  const targetCents = parseToCents(parsed.targetText);

  if (!isValidCents(targetCents) || targetCents <= 0) {
    throw new Error('Valor-alvo inválido. Ex: 5.000,00');
  }
  if (parsed.endAt != null && parsed.endAt < parsed.startAt) {
    throw new Error('A data final não pode ser antes da inicial');
  }

  return createGoal({
    name: parsed.name,
    icon: parsed.icon,
    color: parsed.color,
    targetCents,
    startAt: parsed.startAt,
    endAt: parsed.endAt,
  });
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
