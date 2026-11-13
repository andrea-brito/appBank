/**
 * Runnable self-check for installments and the monthly history.
 * Run with: npx tsx src/domain/installments.test.ts
 * Proves: installments always add up to the exact total, dates clamp at
 * month ends, and history splits past / committed months correctly.
 */
import {
  installmentDates,
  installmentLabel,
  installmentSiblings,
  parseInstallment,
  splitInstallments,
} from './installments';
import { availableCents, buildMonthlyHistory, buildYearlyHistory, monthRange, spendByCategory } from './monthlyHistory';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Split: exact, remainder on the first, never float.
check('100,00 / 3 = 33,34 + 33,33 + 33,33', JSON.stringify(splitInstallments(10000, 3)) === '[3334,3333,3333]');
check('even split', JSON.stringify(splitInstallments(120000, 12)) === JSON.stringify(Array(12).fill(10000)));
for (const [total, n] of [[1, 2], [99999, 7], [123457, 48], [250, 3]]) {
  const parts = splitInstallments(total, n);
  check(`sum exact ${total}/${n}`, sum(parts) === total && parts.length === n);
  check(`integers ${total}/${n}`, parts.every(Number.isInteger));
  check(`max diff 1 installment ${total}/${n}`, Math.max(...parts) - Math.min(...parts) <= n);
}
check('1 installment rejected', throws(() => splitInstallments(1000, 1)));
check('49 installments rejected', throws(() => splitInstallments(1000, 49)));
check('fractional count rejected', throws(() => splitInstallments(1000, 2.5)));
check('zero total rejected', throws(() => splitInstallments(0, 3)));

// Dates: same day each month, clamped at month end.
const d = installmentDates(new Date(2026, 0, 31, 12), 3).map((ms) => new Date(ms));
check('31/01 -> 28/02 -> 31/03', d[1].getMonth() === 1 && d[1].getDate() === 28 && d[2].getMonth() === 2 && d[2].getDate() === 31);
check('label', installmentLabel(' TV ', 2, 10) === 'TV (3/10)' && installmentLabel('', 0, 2) === 'Compra parcelada (1/2)');

// History: now = 15/11/2026.
const now = new Date(2026, 10, 15, 12);
const at = (y: number, m: number, day = 10) => new Date(y, m, day, 12).getTime();
const h = buildMonthlyHistory(
  [
    { kind: 'income', amountCents: 500000, occurredAt: at(2026, 10) },
    { kind: 'expense', amountCents: 120000, occurredAt: at(2026, 10) },
    { kind: 'expense', amountCents: 30000, occurredAt: at(2026, 7) }, // August: gap in Sep/Oct
    // installments in Dec and Jan
    { kind: 'expense', amountCents: 3334, occurredAt: at(2026, 11) },
    { kind: 'expense', amountCents: 3333, occurredAt: at(2027, 0) },
  ],
  [
    { amountCents: 20000, occurredAt: at(2026, 10) },
    { amountCents: -5000, occurredAt: at(2026, 10, 12) },
  ],
  now,
);
check('past newest first, no gaps (Nov..Aug = 4 months)', h.past.map((m) => m.key).join() === '2026-11,2026-10,2026-09,2026-08');
const nov = h.past[0];
// available = 5.000 in - 1.200 spent - 150 net into goals (200 saved, 50 withdrawn)
check('Nov totals, available discounts goals', nov.incomeCents === 500000 && nov.expenseCents === 120000 && nov.balanceCents === 365000);
check('her case: 5.000 in, 3.000 spent, 1.000 saved -> 1.000 free', availableCents(500000, 300000, 100000) === 100000);
check('withdrawal from a goal gives money back', availableCents(500000, 300000, -20000) === 220000);
check('Nov saved is net of withdrawal', nov.savedCents === 15000);
check('empty month is zero', h.past[1].expenseCents === 0 && h.past[1].balanceCents === 0);
check('Aug negative balance', h.past[3].balanceCents === -30000);
check('label in pt-BR, only first letter upper', nov.label === 'Novembro de 2026');
check('upcoming soonest first', h.upcoming.map((m) => `${m.key}:${m.expenseCents}`).join() === '2026-12:3334,2027-01:3333');
check('no data -> just current month', buildMonthlyHistory([], [], now).past.length === 1);

// Parsing installments back and finding the whole purchase.
check('parse', JSON.stringify(parseInstallment('TV (3/10)')) === '{"base":"TV","index":2,"count":10}');
check('parse keeps parentheses in base', parseInstallment('Loja (centro) (1/2)')?.base === 'Loja (centro)');
check('not an installment', parseInstallment('Mercado') === null && parseInstallment('X (11/10)') === null);
const purchase = [1, 2, 3].map((i) => ({ id: `a${i}`, description: `TV (${i}/3)`, createdAt: 100 }));
const rows = [
  ...purchase,
  { id: 'b1', description: 'TV (1/3)', createdAt: 200 }, // another TV bought later
  { id: 'c1', description: 'TV (1/2)', createdAt: 100 }, // different count
  { id: 'd1', description: 'Mercado', createdAt: 100 },
];
check('siblings = whole purchase only', installmentSiblings(purchase[1], rows).map((r) => r.id).join() === 'a1,a2,a3');
check('non-installment -> itself', installmentSiblings(rows[5], rows).map((r) => r.id).join() === 'd1');

// Years: Nov/2026 back to Aug/2026 from the history above + a 2025 month.
const h2 = buildMonthlyHistory(
  [
    { kind: 'income', amountCents: 100000, occurredAt: at(2026, 10) },
    { kind: 'expense', amountCents: 40000, occurredAt: at(2026, 10) },
    { kind: 'expense', amountCents: 20000, occurredAt: at(2026, 9) },
    { kind: 'income', amountCents: 50000, occurredAt: at(2025, 11) },
  ],
  [{ amountCents: 10000, occurredAt: at(2026, 10) }],
  now,
);
const years = buildYearlyHistory(h2.past);
check('years newest first', years.map((y) => y.year).join() === '2026,2025');
const y26 = years[0];
check('2026 months Jan..Nov present (gap-filled)', y26.months.length === 11 && y26.months[0].key === '2026-11');
check('2026 totals, available discounts goals', y26.incomeCents === 100000 && y26.expenseCents === 60000 && y26.balanceCents === 30000 && y26.savedCents === 10000);
check('2026 avg expense over 11 months, integer', y26.avgExpenseCents === Math.round(60000 / 11));
check('best/worst month', y26.best.key === '2026-11' && y26.worst.key === '2026-10');
check('2025 has only December', years[1].months.map((m) => m.key).join() === '2025-12');

// Category breakdown.
const cats = spendByCategory([
  { kind: 'expense', amountCents: 7500, occurredAt: 0, categoryId: 'food' },
  { kind: 'expense', amountCents: 2500, occurredAt: 0, categoryId: null },
  { kind: 'income', amountCents: 99999, occurredAt: 0, categoryId: 'salary' },
]);
check('category breakdown biggest first, % of expenses', JSON.stringify(cats) === '[{"categoryId":"food","totalCents":7500,"percent":75},{"categoryId":null,"totalCents":2500,"percent":25}]');

// Month key -> range.
const r = monthRange('2026-02')!;
check('month range Feb 2026', new Date(r.from).getDate() === 1 && new Date(r.to).getMonth() === 1 && new Date(r.to).getDate() === 28 && new Date(r.to + 1).getMonth() === 2);
check('bad month keys rejected', monthRange('2026-13') === null && monthRange('../x') === null);

if (failures) {
  console.error(`installments.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('installments.test.ts: all checks passed');
