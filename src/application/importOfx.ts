import { importTransactions, type ImportRow } from '@/data/transactionRepository';
import { parseOfx } from '@/domain/ofx';

export interface OfxImportResult {
  parsed: number; // transactions found in the file
  inserted: number; // new rows actually added (duplicates skipped)
}

/**
 * Parse OFX text and import its transactions. OFX amounts are signed: negative
 * is a debit (expense), positive a credit (income). We store the magnitude in
 * integer cents and carry direction in `kind`. Re-importing is safe: rows with
 * a known FITID are skipped by the unique (source, externalId) index.
 */
export async function importOfx(content: string): Promise<OfxImportResult> {
  const txns = parseOfx(content);
  if (txns.length === 0) {
    throw new Error('Não encontrei transações no arquivo. Confirme que é um extrato OFX.');
  }

  const rows: ImportRow[] = txns.map((t) => ({
    amountCents: Math.abs(t.amountCents),
    kind: t.amountCents < 0 ? 'expense' : 'income',
    description: t.memo || 'Importado',
    occurredAt: t.occurredAt,
    externalId: t.fitId,
  }));

  const inserted = await importTransactions(rows, 'ofx');
  return { parsed: txns.length, inserted };
}
