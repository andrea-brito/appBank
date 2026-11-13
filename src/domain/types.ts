import type { Cents } from './money';

export type TransactionKind = 'expense' | 'income';

/** Max length of free-text fields (descriptions, goal names). */
export const TEXT_MAX = 250;

/** Where a transaction came from. The pluggable-source seam: manual and OFX
 *  today, 'openfinance' reserved for the Pluggy/Belvo phase. */
export type TransactionSourceKind = 'manual' | 'ofx' | 'openfinance' | 'boleto' | 'pix';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: TransactionKind;
  budgetCents: Cents | null;
}

export interface Transaction {
  id: string;
  categoryId: string | null;
  amountCents: Cents; // always positive; `kind` carries the direction
  kind: TransactionKind;
  description: string;
  occurredAt: number; // epoch ms: when the money moved
  source: TransactionSourceKind;
  externalId: string | null; // dedupe key for imported transactions
  createdAt: number; // epoch ms: when it was recorded
}
