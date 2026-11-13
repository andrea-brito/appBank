/**
 * Runnable self-check for exchange-rate math. Run: npx tsx src/domain/fx.test.ts
 * Proves: rates parse exactly from the API strings, conversion never uses
 * float and never overstates, and the target comparison is exact at the edge.
 */
import {
  averageRate,
  brlToForeignCents,
  formatForeign,
  formatRate,
  isAtOrBelowTarget,
  isFxPair,
  parseRate,
} from './fx';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

check('parse 6.2420', parseRate('6.2420') === 62420);
check('parse 6.24 pads', parseRate('6.24') === 62400);
check('parse 6.19267 truncates to 4 decimals', parseRate('6.19267') === 61926);
check('parse integer', parseRate('6') === 60000);
check('garbage / zero / negative -> NaN', [parseRate('abc'), parseRate('0'), parseRate('-6.2'), parseRate('')].every(Number.isNaN));

check('format trims trailing zeros, keeps 2', formatRate(62420) === 'R$ 6,242' && formatRate(60000) === 'R$ 6,00' && formatRate(61926) === 'R$ 6,1926');

// R$ 1.000,00 at 6,2420 = 160,2050... -> € 160,20 (floor, never promise more)
check('convert floors', brlToForeignCents(100000, 62420) === 16020);
check('convert exact', brlToForeignCents(60000, 60000) === 10000);
check('convert guards', brlToForeignCents(0, 62420) === 0 && brlToForeignCents(100, NaN) === 0);
check('big amount stays exact', brlToForeignCents(1_234_567_89, 66788) === Math.floor((123456789 * 10000) / 66788));

check('target edge: 6,0000 <= 6,00 alerts', isAtOrBelowTarget(60000, 600));
check('target edge: 6,0001 does not', !isAtOrBelowTarget(60001, 600));
check('target: NaN never alerts', !isAtOrBelowTarget(NaN, 600));

check('average', averageRate([62000, 63000, 64001]) === 63000 && averageRate([]) === null);
check('format foreign', formatForeign(123456, 'EUR') === '€ 1.234,56' && formatForeign(5, 'USD') === 'US$ 0,05');
check('pair guard', isFxPair('EUR-BRLT') && !isFxPair('BTC-BRL'));

if (failures) {
  console.error(`fx.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('fx.test.ts: all checks passed');
