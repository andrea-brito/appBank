/**
 * Runnable self-check for the CSV/PDF report.
 * Run with: npx tsx src/domain/report.test.ts
 */
import { buildReport, centsToCsv, periodRange, toCsv, toHtml } from './report';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const tx = (id: string, kind: 'income' | 'expense', cents: number, when: number, description: string, categoryId: string | null = 'c1') => ({
  id,
  kind,
  amountCents: cents,
  occurredAt: when,
  description,
  categoryId,
});
const txns = [
  tx('1', 'income', 500000, at(2026, 11, 5), 'Salário', null),
  tx('2', 'expense', 12345, at(2026, 11, 10), '=HYPERLINK("x")'),
  tx('3', 'expense', 99, at(2026, 10, 30), 'Fora do mês'),
  tx('4', 'expense', 1000, at(2026, 12, 1), 'Say "hi" <b>'),
];
const cats = [{ id: 'c1', name: 'Mercado' }];
const deposits = [{ amountCents: 20000, occurredAt: at(2026, 11, 15) }];

check('range month', periodRange('2026-11')?.label === '11/2026');
check('range year', periodRange('2026')?.label === '2026');
check('range invalid', periodRange('abc') === null && periodRange('2026-13') === null);

check('csv number', centsToCsv(-12345) === '-123,45' && centsToCsv(5) === '0,05' && centsToCsv(100000) === '1000,00');

const month = buildReport(txns, deposits, cats, periodRange('2026-11')!);
check('month rows only that month', month.rows.length === 2);
check('month totals', month.incomeCents === 500000 && month.expenseCents === 12345 && month.savedCents === 20000);
check('month balance = in - out - saved', month.balanceCents === 500000 - 12345 - 20000);
check('category name', month.categories[0]?.name === 'Mercado');

const csv = toCsv(month);
check('csv BOM + header', csv.startsWith('\uFEFFData;Tipo;Categoria;Descrição;Valor (R$)'));
check('csv formula neutralised', csv.includes(`"'=HYPERLINK(""x"")"`));
check('csv signed amount', csv.includes(';-123,45'));
check('csv uncategorised', csv.includes('"Sem categoria"'));

const year = buildReport(txns, deposits, cats, periodRange('2026')!);
check('year has all four entries', year.rows.length === 4);
check('year monthly table oldest first', year.months[0]?.key === '2026-10' && year.months.at(-1)?.key === '2026-12');

const html = toHtml(year);
check('html escapes text', html.includes('Say &quot;hi&quot; &lt;b&gt;') && !html.includes('<b>"'));
check('html has no script', !/<script/i.test(html));

const empty = buildReport([], [], [], periodRange('2025-01')!);
check('empty period', empty.rows.length === 0 && empty.months.length === 0 && toCsv(empty).split('\r\n').length === 2);

if (failures > 0) process.exit(1);
console.log('report.test.ts: all checks passed');
