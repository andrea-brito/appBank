/**
 * Runnable self-check for goal progress and savings suggestion math.
 * Run with: npx tsx src/domain/goal.test.ts
 */
import { goalProgress } from './goal';
import { suggestSavings } from './savingsSuggestion';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

// --- goalProgress ---
const now = new Date('2026-01-15T00:00:00Z');

// no deadline: pace fields stay null
const g1 = goalProgress(50_000, 200_000, null, now);
check('remaining is exact cents', g1.remainingCents === 150_000);
check('ratio is 0.25', Math.abs(g1.ratio - 0.25) < 1e-9);
check('not complete', !g1.isComplete);
check('no deadline -> monthsLeft null', g1.monthsLeft === null);
check('no deadline -> monthlyTarget null', g1.monthlyTargetCents === null);

// with deadline 3 calendar months ahead (Jan -> Apr = 3 diff, +1 = 4 months incl current)
const g2 = goalProgress(0, 120_000, new Date('2026-04-20T00:00:00Z').getTime(), now);
check('monthsLeft counts current month', g2.monthsLeft === 4);
check('monthly target rounds up', g2.monthlyTargetCents === 30_000);

// complete goal: remaining 0, monthly target 0, ratio clamped to 1
const g3 = goalProgress(250_000, 200_000, new Date('2026-04-20T00:00:00Z').getTime(), now);
check('complete -> remaining 0', g3.remainingCents === 0);
check('complete -> ratio clamped 1', g3.ratio === 1);
check('complete -> isComplete', g3.isComplete);
check('complete -> monthly target 0', g3.monthlyTargetCents === 0);

// past deadline never divides by zero (clamped to >=1 month)
const g4 = goalProgress(0, 100_000, new Date('2025-12-01T00:00:00Z').getTime(), now);
check('past deadline -> monthsLeft >= 1', (g4.monthsLeft ?? 0) >= 1);
check('past deadline -> whole remaining due', g4.monthlyTargetCents === 100_000);

// --- suggestSavings ---
// two months, avg leftover = (100000 + 80000)/2 = 90000; no budget
const s1 = suggestSavings(
  [
    { incomeCents: 500_000, expenseCents: 400_000 },
    { incomeCents: 480_000, expenseCents: 400_000 },
  ],
  0,
  0,
);
check('avg leftover exact', s1.avgLeftoverCents === 90_000);
check('suggests half of leftover', s1.suggestedCents === 45_000);
check('two months -> confident', !s1.lowConfidence);

// budget room: budget 200000, spent 150000 -> room 50000; half added
const s2 = suggestSavings([{ incomeCents: 300_000, expenseCents: 250_000 }], 200_000, 150_000);
check('one month -> low confidence', s2.lowConfidence);
check('budget room computed', s2.budgetRoomCents === 50_000);
// base leftover 50000 -> half 25000; budget room half 25000 -> total 50000
check('suggestion blends leftover + budget room', s2.suggestedCents === 50_000);

// negative leftover never suggests a negative save
const s3 = suggestSavings([{ incomeCents: 100_000, expenseCents: 150_000 }], 0, 0);
check('negative leftover -> suggest 0', s3.suggestedCents === 0);

// empty history
const s4 = suggestSavings([], 0, 0);
check('no history -> suggest 0, low confidence', s4.suggestedCents === 0 && s4.lowConfidence);

if (failures === 0) {
  console.log('goal.test.ts: all checks passed');
} else {
  console.error(`goal.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
