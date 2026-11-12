/**
 * Runnable self-check for date input and the cents round-trip used when editing.
 * Run with: npx tsx src/domain/dates.test.ts
 */
import { centsToInput, formatDateBR, parseDateBR } from './dates';
import { parseToCents } from './money';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

const d = new Date(parseDateBR('05/03/2026')!);
check('parse dd/mm/aaaa at noon', d.getDate() === 5 && d.getMonth() === 2 && d.getFullYear() === 2026 && d.getHours() === 12);
check('short and dashed forms', parseDateBR('5-3-2026') === parseDateBR('05/03/2026') && parseDateBR(' 5.3.2026 ') != null);
check('31/02 rejected', parseDateBR('31/02/2026') === null);
check('29/02 only in leap years', parseDateBR('29/02/2028') != null && parseDateBR('29/02/2026') === null);
check('garbage rejected', parseDateBR('ontem') === null && parseDateBR('2026-03-05') === null && parseDateBR('') === null);
check('format round-trip', formatDateBR(parseDateBR('09/12/2026')!) === '09/12/2026');

for (const c of [0, 5, 100, 1999, 123456, 100001]) {
  check(`cents round-trip ${c}`, parseToCents(centsToInput(c)) === c);
}
check('centsToInput format', centsToInput(123405) === '1234,05');

if (failures) {
  console.error(`dates.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('dates.test.ts: all checks passed');
