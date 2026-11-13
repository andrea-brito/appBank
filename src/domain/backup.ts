import { z } from 'zod';

/**
 * Shape of a backup, validated before anything is written to the database.
 * A backup file is untrusted input (it can be old, hand-edited or corrupted),
 * so every field is checked and references between tables must resolve.
 *
 * Mirrors the tables in data/db/schema.ts. If a column is added there, add it
 * here (backup.test.ts guards the round-trip). New columns should be optional
 * with a default so older files keep restoring; bump BACKUP_VERSION only for
 * changes old files can't satisfy.
 */

export const BACKUP_FORMAT = 'appbank-backup';
export const BACKUP_VERSION = 1;

const kind = z.enum(['expense', 'income']);
const source = z.enum(['manual', 'ofx', 'openfinance', 'boleto', 'pix']);
const id = z.string().min(1);
const int = z.number().int();

const category = z.object({
  id,
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  kind,
  budgetCents: int.nonnegative().nullable(),
});

const transaction = z.object({
  id,
  categoryId: id.nullable(),
  amountCents: int.positive(),
  kind,
  description: z.string(),
  occurredAt: int,
  source,
  externalId: z.string().nullable(),
  createdAt: int,
});

const goal = z.object({
  id,
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  targetCents: int.positive(),
  startAt: int,
  endAt: int.nullable(),
  archivedAt: int.nullable(),
  createdAt: int,
  // Added after v1 shipped: optional with a default, so older backup files
  // (without it) still restore. No version bump needed for additive fields.
  currency: z.enum(['BRL', 'EUR', 'USD']).default('BRL'),
});

const goalDeposit = z.object({
  id,
  goalId: id,
  amountCents: int.refine((n) => n !== 0, 'depósito não pode ser zero'),
  occurredAt: int,
  createdAt: int,
});

const snapshot = z
  .object({
    categories: z.array(category),
    transactions: z.array(transaction),
    goals: z.array(goal),
    goalDeposits: z.array(goalDeposit),
  })
  .superRefine((s, ctx) => {
    const categoryIds = new Set(s.categories.map((c) => c.id));
    const goalIds = new Set(s.goals.map((g) => g.id));
    s.transactions.forEach((t, i) => {
      if (t.categoryId != null && !categoryIds.has(t.categoryId)) {
        ctx.addIssue({ code: 'custom', path: ['transactions', i, 'categoryId'], message: 'categoria inexistente no backup' });
      }
    });
    s.goalDeposits.forEach((d, i) => {
      if (!goalIds.has(d.goalId)) {
        ctx.addIssue({ code: 'custom', path: ['goalDeposits', i, 'goalId'], message: 'meta inexistente no backup' });
      }
    });
  });

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: int,
  data: snapshot,
});

export type BackupSnapshot = z.infer<typeof snapshot>;
export type BackupFile = z.infer<typeof backupSchema>;

export function buildBackup(data: BackupSnapshot, now: number = Date.now()): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, data };
}

/** Parse the decrypted JSON text. Throws a readable Portuguese message on any problem. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('O conteúdo do backup está corrompido.');
  }
  const result = backupSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first.path.length > 0 ? ` (${first.path.join('.')})` : '';
    throw new Error(`Backup inválido ou de uma versão não suportada${where}: ${first.message}`);
  }
  return result.data;
}

export function countRows(s: BackupSnapshot) {
  return {
    categories: s.categories.length,
    transactions: s.transactions.length,
    goals: s.goals.length,
    goalDeposits: s.goalDeposits.length,
  };
}
