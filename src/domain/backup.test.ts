/**
 * Runnable self-check for the backup format.
 * Run with: npx tsx src/domain/backup.test.ts
 */
import { buildBackup, countRows, parseBackup, type BackupSnapshot } from './backup';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}
function throwsWith(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const data: BackupSnapshot = {
  categories: [{ id: 'cat-food', name: 'Alimentação', icon: '🍔', color: '#ef4444', kind: 'expense', budgetCents: 80000 }],
  transactions: [
    {
      id: 't1', categoryId: 'cat-food', amountCents: 1999, kind: 'expense', description: 'Pizza',
      occurredAt: 1_700_000_000_000, source: 'manual', externalId: null, createdAt: 1_700_000_000_000,
    },
    {
      id: 't2', categoryId: null, amountCents: 500000, kind: 'income', description: 'Salário',
      occurredAt: 1_700_000_100_000, source: 'ofx', externalId: 'FIT-1', createdAt: 1_700_000_100_000,
    },
  ],
  goals: [
    { id: 'g1', name: 'Viagem', icon: '✈️', color: '#6366f1', targetCents: 500000, startAt: 1, endAt: null, archivedAt: null, createdAt: 1, currency: 'EUR' },
  ],
  goalDeposits: [
    { id: 'd1', goalId: 'g1', amountCents: 10000, occurredAt: 2, createdAt: 2 },
    { id: 'd2', goalId: 'g1', amountCents: -2500, occurredAt: 3, createdAt: 3 },
  ],
};

// Round-trip through JSON text keeps every value, including integer cents and nulls.
const text = JSON.stringify(buildBackup(data, 123));
const back = parseBackup(text);
check('round-trip keeps the data', JSON.stringify(back.data) === JSON.stringify(data));
check('exportedAt kept', back.exportedAt === 123);
const counts = countRows(back.data);
check('counts', counts.categories === 1 && counts.transactions === 2 && counts.goals === 1 && counts.goalDeposits === 2);
check('negative deposit (withdrawal) allowed', back.data.goalDeposits[1].amountCents === -2500);

// Files made before goals had a currency still restore, as BRL.
const old = JSON.parse(text);
delete old.data.goals[0].currency;
check('old backup without currency restores as BRL', parseBackup(JSON.stringify(old)).data.goals[0].currency === 'BRL');
check('unknown currency rejected', throwsWith(() => parseBackup(JSON.stringify({ ...old, data: { ...old.data, goals: [{ ...old.data.goals[0], currency: 'BTC' }] } }))) != null);

// Corrupted / wrong input.
check('not json -> clear message', (throwsWith(() => parseBackup('xxx')) ?? '').includes('corrompido'));
check('wrong format rejected', throwsWith(() => parseBackup(JSON.stringify({ ...JSON.parse(text), format: 'outro' }))) != null);
check('future version rejected', throwsWith(() => parseBackup(JSON.stringify({ ...JSON.parse(text), version: 2 }))) != null);

// Field-level validation (the invariants the database itself does not enforce).
const bad = (mutate: (d: BackupSnapshot) => void) => {
  const copy: BackupSnapshot = JSON.parse(JSON.stringify(data));
  mutate(copy);
  return throwsWith(() => parseBackup(JSON.stringify(buildBackup(copy))));
};
check('amount 0 rejected', bad((d) => (d.transactions[0].amountCents = 0)) != null);
check('negative amount rejected', bad((d) => (d.transactions[0].amountCents = -5)) != null);
check('float cents rejected', bad((d) => (d.transactions[0].amountCents = 19.99)) != null);
check('unknown kind rejected', bad((d) => ((d.transactions[0] as { kind: string }).kind = 'transfer')) != null);
check('goal target 0 rejected', bad((d) => (d.goals[0].targetCents = 0)) != null);
check('zero deposit rejected', bad((d) => (d.goalDeposits[0].amountCents = 0)) != null);

// References must resolve inside the file.
const orphanTx = bad((d) => (d.transactions[0].categoryId = 'nao-existe'));
check('transaction with unknown category rejected', orphanTx != null && orphanTx.includes('categoria inexistente'));
const orphanDep = bad((d) => (d.goalDeposits[0].goalId = 'nao-existe'));
check('deposit with unknown goal rejected', orphanDep != null && orphanDep.includes('meta inexistente'));

// An empty backup (new install) is valid.
const empty = parseBackup(JSON.stringify(buildBackup({ categories: [], transactions: [], goals: [], goalDeposits: [] })));
check('empty backup is valid', countRows(empty.data).transactions === 0);

if (failures === 0) {
  console.log('backup.test.ts: all checks passed');
} else {
  console.error(`backup.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
