import type { Cents } from './money';
import type { MonthSummary } from './monthlyHistory';

/**
 * What a month's leftover ("sobra") was used for.
 * - goal:  moved into a goal (a tagged deposit is created, see allocationId).
 * - other: spent or set aside outside the app; it leaves the running balance.
 * - carry: kept as available money; it stays in the running balance.
 * Money not allocated yet is simply still in the balance, shown as "sem destino".
 */
export type AllocationKind = 'goal' | 'carry' | 'other';

export interface Allocation {
  id: string;
  monthKey: string; // '2026-10'
  kind: AllocationKind;
  goalId: string | null;
  amountCents: Cents; // > 0
  note: string;
}

export const ALLOCATION_LABEL: Record<AllocationKind, string> = {
  goal: 'Meta',
  carry: 'Ficou na conta',
  other: 'Outro',
};

const sum = (xs: readonly Allocation[]) => xs.reduce((s, a) => s + a.amountCents, 0);

export const allocationsOf = (all: readonly Allocation[], monthKey: string) => all.filter((a) => a.monthKey === monthKey);

/** A month counts as "closed" once at least one allocation exists for it. */
export const isClosed = (all: readonly Allocation[], monthKey: string) => all.some((a) => a.monthKey === monthKey);

/** Money from a closed month that left the running balance (to a goal or outside the app). */
const leftBalance = (all: readonly Allocation[], monthKey: string) =>
  sum(allocationsOf(all, monthKey).filter((a) => a.kind !== 'carry'));

/**
 * Running balance brought into `currentKey`: for every CLOSED earlier month,
 * what it left over minus what was moved out of the balance. Months not closed
 * yet do not carry (the user has not decided what happened to that money), so
 * turning this feature on never makes "Disponível" jump on its own.
 * `months` are month summaries whose balanceCents already excludes allocation
 * deposits (see buildMonthlyHistory).
 */
export function carryInto(months: readonly MonthSummary[], all: readonly Allocation[], currentKey: string): Cents {
  return months
    .filter((m) => m.key < currentKey && isClosed(all, m.key))
    .reduce((s, m) => s + m.balanceCents - leftBalance(all, m.key), 0);
}

/** Earlier months with a leftover and no decision yet, newest first. */
export function pendingMonths(months: readonly MonthSummary[], all: readonly Allocation[], currentKey: string): MonthSummary[] {
  return months
    .filter((m) => m.key < currentKey && m.balanceCents > 0 && !isClosed(all, m.key))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** Leftover not allocated yet (negative when allocations exceed the leftover, e.g. after an edit). */
export const unallocated = (leftover: Cents, all: readonly Allocation[], monthKey: string): Cents =>
  leftover - sum(allocationsOf(all, monthKey));

/** Readable error, or null when `amount` can be allocated from what is left. */
export function checkAllocation(remaining: Cents, amount: Cents): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return 'Informe um valor maior que zero.';
  if (amount > remaining) return 'O valor é maior do que o que ainda não tem destino.';
  return null;
}
