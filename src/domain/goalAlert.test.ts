/**
 * Runnable self-check for goal alerts.
 * Run with: npx tsx src/domain/goalAlert.test.ts
 */
import type { GoalProgress } from './goal';
import { goalAlerts } from './goalAlert';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

function progress(ratio: number, extra: Partial<GoalProgress> = {}): GoalProgress {
  return {
    savedCents: Math.round(ratio * 100_000),
    targetCents: 100_000,
    remainingCents: Math.max(0, 100_000 - Math.round(ratio * 100_000)),
    ratio,
    isComplete: ratio >= 1,
    monthsLeft: null,
    monthlyTargetCents: null,
    ...extra,
  };
}

// complete goal -> single success, nothing else
const done = goalAlerts(progress(1), 0);
check('complete -> one success alert', done.length === 1 && done[0].level === 'success');

// at 60% with a deposit this month -> "a 60%" info, no "nothing saved" warning
const at60 = goalAlerts(progress(0.6), 5000);
check('60% shows milestone info', at60.some((a) => a.level === 'info' && a.message.includes('60%')));
check('60% with deposit -> no warning', !at60.some((a) => a.level === 'warning'));

// at 30% with nothing saved this month -> info + warning
const at30 = goalAlerts(progress(0.3), 0);
check('30% info present', at30.some((a) => a.message.includes('30%')));
check('nothing saved -> warning present', at30.some((a) => a.level === 'warning'));

// below first milestone (10%) with a deposit -> no info milestone, no warning
const at10 = goalAlerts(progress(0.1), 1000);
check('10% below milestone -> no info', !at10.some((a) => a.level === 'info'));
check('10% with deposit -> no warning', at10.length === 0);

// deadline pressure wording when monthsLeft + monthlyTarget present and nothing saved
const withDeadline = goalAlerts(
  progress(0.4, { monthsLeft: 3, monthlyTargetCents: 20_000 }),
  0,
);
check(
  'deadline + no savings -> aporte wording',
  withDeadline.some((a) => a.level === 'warning' && a.message.includes('aporte')),
);

if (failures === 0) {
  console.log('goalAlert.test.ts: all checks passed');
} else {
  console.error(`goalAlert.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
