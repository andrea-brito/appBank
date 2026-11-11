/**
 * Runnable self-check for budget status thresholds.
 * Run with: npx tsx src/domain/budgetStatus.test.ts
 */
import { budgetStatus } from './budgetStatus';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

// no budget -> none
check('null budget -> none', budgetStatus(5000, null).level === 'none');
check('zero budget -> none', budgetStatus(5000, 0).level === 'none');

// budget 1000,00 (100000 cents)
const B = 100_000;
check('0% -> ok', budgetStatus(0, B).level === 'ok');
check('69,99% -> ok', budgetStatus(69_999, B).level === 'ok');
// exact 70% is the warning boundary (inclusive)
check('exactly 70% -> warning', budgetStatus(70_000, B).level === 'warning');
check('85% -> warning', budgetStatus(85_000, B).level === 'warning');
// exact 100% is still warning, not over (over is strictly greater)
check('exactly 100% -> warning', budgetStatus(100_000, B).level === 'warning');
check('100,01% -> over', budgetStatus(100_001, B).level === 'over');
check('150% -> over', budgetStatus(150_000, B).level === 'over');

// messages present only when there is something to warn about
check('ok has no message', budgetStatus(1000, B).message === null);
check('warning has a message', (budgetStatus(70_000, B).message ?? '').length > 0);
check('over has a message', (budgetStatus(200_000, B).message ?? '').length > 0);

// small-budget integer edge: budget 3 cents, 70% -> 2.1 cents; spent 2 is <70%, spent 3 is >=70%
check('tiny budget below threshold -> ok', budgetStatus(2, 3).level === 'ok');
check('tiny budget at/over threshold -> warning', budgetStatus(3, 3).level === 'warning');

if (failures === 0) {
  console.log('budgetStatus.test.ts: all checks passed');
} else {
  console.error(`budgetStatus.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
