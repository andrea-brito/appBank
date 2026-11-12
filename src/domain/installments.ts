import { addMonths } from 'date-fns';

import type { Cents } from './money';

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 48;

export function isValidInstallmentCount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_INSTALLMENTS && n <= MAX_INSTALLMENTS;
}

/**
 * Split a total into n integer-cent installments that add up EXACTLY to the
 * total. The leftover cents go to the first installment, as card statements do
 * (R$ 100,00 / 3 = 33,34 + 33,33 + 33,33).
 */
export function splitInstallments(totalCents: Cents, n: number): Cents[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error('Valor inválido.');
  if (!isValidInstallmentCount(n)) {
    throw new Error(`Número de parcelas deve ser entre ${MIN_INSTALLMENTS} e ${MAX_INSTALLMENTS}.`);
  }
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base));
}

/**
 * One date per installment, a month apart, keeping the day of the month
 * (clamped: a purchase on 31/01 pays on 28 or 29/02).
 */
export function installmentDates(first: Date, n: number): number[] {
  return Array.from({ length: n }, (_, i) => addMonths(first, i).getTime());
}

/** "TV (3/10)" */
export function installmentLabel(description: string, index: number, n: number): string {
  return `${description.trim() || 'Compra parcelada'} (${index + 1}/${n})`;
}

/** Inverse of installmentLabel: "TV (3/10)" -> { base: 'TV', index: 2, count: 10 }. */
export function parseInstallment(description: string): { base: string; index: number; count: number } | null {
  const m = /^(.*) \((\d{1,2})\/(\d{1,2})\)$/.exec(description);
  if (!m) return null;
  const index = Number(m[2]) - 1;
  const count = Number(m[3]);
  if (!isValidInstallmentCount(count) || index < 0 || index >= count) return null;
  return { base: m[1], index, count };
}

interface Row {
  id: string;
  description: string;
  createdAt: number;
}

/**
 * The rows of the same installment purchase as `tx`: all installments are
 * written in one insert with the same createdAt, so same createdAt + same
 * base description + same count identifies the purchase.
 */
export function installmentSiblings<T extends Row>(tx: Row, rows: readonly T[]): T[] {
  const me = parseInstallment(tx.description);
  if (!me) return rows.filter((r) => r.id === tx.id);
  return rows.filter((r) => {
    if (r.createdAt !== tx.createdAt) return false;
    const p = parseInstallment(r.description);
    return p != null && p.base === me.base && p.count === me.count;
  });
}
