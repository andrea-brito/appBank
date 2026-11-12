import { addMonths, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import type { Cents } from './money';
import type { TransactionKind } from './types';

export interface MonthSummary {
  key: string; // '2026-11'
  label: string; // 'Novembro de 2026'
  from: number; // epoch ms, start of month (local time)
  incomeCents: Cents;
  expenseCents: Cents;
  /** income - expense: what was left over this month. */
  balanceCents: Cents;
  /** Net deposits into goals (withdrawals subtract). */
  savedCents: Cents;
}

export interface YearSummary {
  year: number;
  incomeCents: Cents;
  expenseCents: Cents;
  balanceCents: Cents;
  savedCents: Cents;
  /** Average spend per month over the months of this year in the history. */
  avgExpenseCents: Cents;
  /** Months of this year in the history, newest first. */
  months: MonthSummary[];
  best: MonthSummary; // highest balance
  worst: MonthSummary; // lowest balance
}

export interface MonthlyHistory {
  /** Current month back to the first month with any data, newest first. */
  past: MonthSummary[];
  /** Months after the current one that already have entries (installments), soonest first. */
  upcoming: MonthSummary[];
}

interface Tx {
  amountCents: Cents;
  kind: TransactionKind;
  occurredAt: number;
}
interface Deposit {
  amountCents: Cents;
  occurredAt: number;
}

const keyOf = (ms: number) => format(ms, 'yyyy-MM');

function empty(from: Date): MonthSummary {
  const label = format(from, "MMMM 'de' yyyy", { locale: ptBR });
  return {
    key: keyOf(from.getTime()),
    label: label[0].toUpperCase() + label.slice(1), // 'Novembro de 2026'
    from: from.getTime(),
    incomeCents: 0,
    expenseCents: 0,
    balanceCents: 0,
    savedCents: 0,
  };
}

/**
 * Month-by-month totals in integer cents. Months with no entries inside the
 * range still appear (as zeros) so the history has no gaps.
 */
export function buildMonthlyHistory(
  txns: readonly Tx[],
  deposits: readonly Deposit[],
  now: Date = new Date(),
): MonthlyHistory {
  const months = new Map<string, MonthSummary>();
  const current = startOfMonth(now);
  const at = (ms: number) => {
    const k = keyOf(ms);
    let m = months.get(k);
    if (!m) months.set(k, (m = empty(startOfMonth(ms))));
    return m;
  };

  for (const t of txns) {
    const m = at(t.occurredAt);
    if (t.kind === 'income') m.incomeCents += t.amountCents;
    else m.expenseCents += t.amountCents;
  }
  for (const d of deposits) at(d.occurredAt).savedCents += d.amountCents;
  for (const m of months.values()) m.balanceCents = m.incomeCents - m.expenseCents;

  // Past: fill every month from the oldest entry up to now.
  const oldest = Math.min(current.getTime(), ...[...months.values()].map((m) => m.from));
  const past: MonthSummary[] = [];
  for (let d = current; d.getTime() >= oldest; d = addMonths(d, -1)) {
    past.push(months.get(keyOf(d.getTime())) ?? empty(d));
  }

  const upcoming = [...months.values()]
    .filter((m) => m.from > current.getTime())
    .sort((a, b) => a.from - b.from);

  return { past, upcoming };
}

/** Group the (newest-first) past months by calendar year, newest year first. */
export function buildYearlyHistory(past: readonly MonthSummary[]): YearSummary[] {
  const byYear = new Map<number, MonthSummary[]>();
  for (const m of past) {
    const y = new Date(m.from).getFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => {
      const sum = (f: (m: MonthSummary) => Cents) => months.reduce((acc, m) => acc + f(m), 0);
      const expenseCents = sum((m) => m.expenseCents);
      const incomeCents = sum((m) => m.incomeCents);
      // Ties keep the most recent month (months are newest first).
      const best = months.reduce((a, b) => (b.balanceCents > a.balanceCents ? b : a));
      const worst = months.reduce((a, b) => (b.balanceCents < a.balanceCents ? b : a));
      return {
        year,
        incomeCents,
        expenseCents,
        balanceCents: incomeCents - expenseCents,
        savedCents: sum((m) => m.savedCents),
        avgExpenseCents: Math.round(expenseCents / months.length),
        months,
        best,
        worst,
      };
    });
}

export interface CategorySpend {
  categoryId: string | null;
  totalCents: Cents;
  /** Integer percent of the month's expenses. */
  percent: number;
}

/** Expenses per category, biggest first, with their share of the total. */
export function spendByCategory(txns: readonly (Tx & { categoryId: string | null })[]): CategorySpend[] {
  const totals = new Map<string | null, Cents>();
  for (const t of txns) {
    if (t.kind === 'expense') totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountCents);
  }
  const all = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([categoryId, totalCents]) => ({
      categoryId,
      totalCents,
      percent: all > 0 ? Math.round((totalCents * 100) / all) : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** '2026-11' -> start/end of that month (local time), or null if malformed. */
export function monthRange(key: string): { from: number; to: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  const from = new Date(Number(m[1]), month, 1);
  return { from: from.getTime(), to: addMonths(from, 1).getTime() - 1 };
}
