/**
 * Runnable self-check for leftover allocation ("Fechar o mês").
 * Run with: npx tsx src/domain/leftover.test.ts
 */
import { carryInto, checkAllocation, isClosed, pendingMonths, unallocated, type Allocation } from './leftover';
import { buildMonthlyHistory } from './monthlyHistory';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const tx = (kind: 'income' | 'expense', amountCents: number, when: number) => ({ kind, amountCents, occurredAt: when });
const now = new Date(2026, 10, 20); // 20 Nov 2026

// Oct: in 1000, out 400 -> leftover 600. Sep: in 500, out 600 -> -100. Nov: in 300, out 100 -> 200.
const txns = [
  tx('income', 100000, at(2026, 10, 5)),
  tx('expense', 40000, at(2026, 10, 9)),
  tx('income', 50000, at(2026, 9, 5)),
  tx('expense', 60000, at(2026, 9, 9)),
  tx('income', 30000, at(2026, 11, 5)),
  tx('expense', 10000, at(2026, 11, 9)),
];
// A deposit made by allocating October's leftover must NOT lower any month's own leftover.
const deposits = [
  { amountCents: 25000, occurredAt: at(2026, 11, 10), allocationId: 'a1' },
  { amountCents: 5000, occurredAt: at(2026, 11, 12), allocationId: null }, // a normal deposit still counts
];
const { past } = buildMonthlyHistory(txns, deposits, now);
const by = (k: string) => past.find((m) => m.key === k)!;

check('oct leftover', by('2026-10').balanceCents === 60000);
check('nov leftover ignores allocation deposit, keeps normal one', by('2026-11').balanceCents === 20000 - 5000);
check('nov saved only the normal deposit', by('2026-11').savedCents === 5000);

const alloc = (monthKey: string, kind: Allocation['kind'], amountCents: number): Allocation => ({
  id: `${monthKey}-${kind}-${amountCents}`,
  monthKey,
  kind,
  goalId: kind === 'goal' ? 'g1' : null,
  amountCents,
  note: '',
});

// Nothing closed yet: no carry (turning the feature on does not move "Disponível").
check('no carry before any decision', carryInto(past, [], '2026-11') === 0);
check('oct is pending, sep (negative) is not', pendingMonths(past, [], '2026-11').map((m) => m.key).join() === '2026-10');

// Close October: 250 to a goal, 100 outside the app, 100 kept; 150 still without destination.
const allocs = [alloc('2026-10', 'goal', 25000), alloc('2026-10', 'other', 10000), alloc('2026-10', 'carry', 10000)];
check('closed month detected', isClosed(allocs, '2026-10') && !isClosed(allocs, '2026-09'));
check('carry = leftover - goal - other (carry/undecided stay)', carryInto(past, allocs, '2026-11') === 60000 - 25000 - 10000);
check('no longer pending once closed', pendingMonths(past, allocs, '2026-11').length === 0);
check('unallocated', unallocated(60000, allocs, '2026-10') === 15000);
check('carry only counts months before the current one', carryInto(past, allocs, '2026-10') === 0);

// Available in Nov = carry + own leftover = 250 + 150 = 400; goal got 250 -> nothing is created or lost.
const available = carryInto(past, allocs, '2026-11') + by('2026-11').balanceCents;
check('available november', available === 25000 + 15000);

check('allocation > remaining rejected', checkAllocation(15000, 15001) != null);
check('allocation = remaining ok', checkAllocation(15000, 15000) === null);
check('allocation 0 / fraction rejected', checkAllocation(100, 0) != null && checkAllocation(100, 1.5) != null);

if (failures > 0) process.exit(1);
console.log('leftover.test.ts: all checks passed');
