import { endOfMonth, startOfMonth, subMonths } from 'date-fns';

export interface Period {
  from: number; // epoch ms, inclusive
  to: number; // epoch ms, inclusive
}

/** The current calendar month as an inclusive epoch-ms range. */
export function currentMonth(now: Date = new Date()): Period {
  return {
    from: startOfMonth(now).getTime(),
    to: endOfMonth(now).getTime(),
  };
}

/** The `count` completed months before the current one, oldest first. */
export function previousMonths(count: number, now: Date = new Date()): Period[] {
  const periods: Period[] = [];
  for (let i = count; i >= 1; i--) {
    const d = subMonths(now, i);
    periods.push({ from: startOfMonth(d).getTime(), to: endOfMonth(d).getTime() });
  }
  return periods;
}
