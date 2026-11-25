import { eq } from 'drizzle-orm';

import type { AllocationKind } from '@/domain/leftover';
import type { Cents } from '@/domain/money';
import { db, schema } from './db/client';

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function allocationsQuery() {
  return db.select().from(schema.leftoverAllocations);
}

export interface NewAllocationInput {
  monthKey: string;
  kind: AllocationKind;
  goalId: string | null; // required for kind 'goal'
  amountCents: Cents;
  note: string;
}

/**
 * Record what part of a month's leftover was used for. For a goal this also
 * creates the goal deposit (tagged with the allocation id), both or neither.
 * The amount is validated by the caller against what is left (domain/leftover).
 */
export async function addAllocation(input: NewAllocationInput): Promise<void> {
  if (input.kind === 'goal' && !input.goalId) throw new Error('Escolha a meta.');
  const id = randomId();
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(schema.leftoverAllocations)
      .values({
        id,
        monthKey: input.monthKey,
        kind: input.kind,
        goalId: input.kind === 'goal' ? input.goalId : null,
        amountCents: input.amountCents,
        note: input.kind === 'other' ? input.note : '',
        createdAt: now,
      })
      .run();
    if (input.kind === 'goal') {
      tx.insert(schema.goalDeposits)
        .values({ id: randomId(), goalId: input.goalId!, amountCents: input.amountCents, occurredAt: now, createdAt: now, allocationId: id })
        .run();
    }
  });
}

/** Remove an allocation and the goal deposit it created (the money goes back to "sem destino"). */
export async function deleteAllocation(id: string): Promise<void> {
  db.transaction((tx) => {
    tx.delete(schema.goalDeposits).where(eq(schema.goalDeposits.allocationId, id)).run();
    tx.delete(schema.leftoverAllocations).where(eq(schema.leftoverAllocations.id, id)).run();
  });
}
