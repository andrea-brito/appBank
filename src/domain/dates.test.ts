/**
 * Runnable self-check for date input and the cents round-trip used when editing.
 * Run with: npx tsx src/domain/dates.test.ts
 */
import { centsToInput, formatDateBR, maskDateInput, parseDateBR } from './dates';
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
check('centsToInput format', centsToInput(123405) === '1.234,05');

// date mask while typing
let typed = '';
const steps: string[] = [];
for (const c of '05032026') steps.push((typed = maskDateInput(typed + c)));
check('typing 05032026 adds slashes', steps.join(' ') === '0 05 05/0 05/03 05/03/2 05/03/20 05/03/202 05/03/2026');
check('extra digits ignored', maskDateInput('050320261') === '05/03/2026');
check('backspace over slash', maskDateInput('05/0') === '05/0' && maskDateInput('05/') === '05');
check('masked result parses', parseDateBR(maskDateInput('31122026')) != null);

if (failures) {
  console.error(`dates.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('dates.test.ts: all checks passed');
