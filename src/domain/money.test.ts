/**
 * Runnable self-check for the money module. No test framework.
 * Run with: npx tsx src/domain/money.test.ts
 * Proves the one thing that must never break: money math is exact.
 */
import { formatCentsInput, parseToCents, sumCents, formatBRL, isValidCents, maskCurrencyInput } from './money';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

// parsing
check('19,99 -> 1999', parseToCents('19,99') === 1999);
check('19.99 -> 1999', parseToCents('19.99') === 1999);
check('R$ 10 -> 1000', parseToCents('R$ 10') === 1000);
check('1.234,56 -> 123456', parseToCents('1.234,56') === 123456);
// pt-BR: dot before 3 digits is a thousands separator, so 19.999 = R$ 19.999,00
check('19.999 -> 1999900 (thousands)', parseToCents('19.999') === 1999900);
// rounding of a 3rd decimal digit uses the comma form
check('rounds 19,999 -> 2000', parseToCents('19,999') === 2000);
check('rounds 0,005 -> 1', parseToCents('0,005') === 1);
check('truncation-safe 1,004 -> 100', parseToCents('1,004') === 100);
check('empty -> NaN', Number.isNaN(parseToCents('')));
check('garbage -> NaN', Number.isNaN(parseToCents('abc')));

// the float trap: 0.1 + 0.2 must be exact in cents
check('0.1 + 0.2 = 0.30 exactly', sumCents([parseToCents('0,10'), parseToCents('0,20')]) === 30);

// accumulating many values stays exact
const many = Array.from({ length: 10000 }, () => parseToCents('0,01'));
check('10000 x 1 cent = 100,00', sumCents(many) === 10000);

// validity guard
check('1999 is valid cents', isValidCents(1999));
check('1.5 is not valid cents', !isValidCents(1.5));

// formatting round-trips the value
check('formatBRL(1999) contains 19,99', formatBRL(1999).includes('19,99'));

// input mask: digits typed one by one are read as cents
const typed: string[] = [];
let field = '';
for (const d of '12345') typed.push((field = maskCurrencyInput(field + d)));
check('typing 12345 -> 0,01 0,12 1,23 12,34 123,45', typed.join(' ') === '0,01 0,12 1,23 12,34 123,45');
check('thousands separators', maskCurrencyInput('123456789') === '1.234.567,89');
check('backspace removes last digit', maskCurrencyInput('123,4') === '12,34');
check('erasing to zero clears the field', maskCurrencyInput('0,0') === '' && maskCurrencyInput('') === '');
check('pasted "R$ 1.234,56" keeps value', maskCurrencyInput('R$ 1.234,56') === '1.234,56');
check('letters ignored', maskCurrencyInput('a1b2') === '0,12');
check('capped length', maskCurrencyInput('9'.repeat(20)) === '99.999.999.999,99');
for (const c of [1, 99, 100, 123456, 1000000, 9999999999999]) {
  check(`mask -> parse round-trip ${c}`, parseToCents(formatCentsInput(c)) === c && maskCurrencyInput(formatCentsInput(c)) === formatCentsInput(c));
}

if (failures === 0) {
  console.log('money.test.ts: all checks passed');
} else {
  console.error(`money.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
