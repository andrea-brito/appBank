import type { Cents } from './money';
import { parseToCents } from './money';

/**
 * Best-effort extraction of amount and date from PIX receipt TEXT the user
 * pasted (not an image). Bank receipts vary wildly, so this is a heuristic:
 * it returns its best guess and the UI must let the user confirm/edit.
 *
 * ponytail: regex heuristic over free text. Ceiling: unusual bank layouts or
 * multiple money figures (e.g. fee + total) may pick the wrong one. Upgrade
 * path: per-bank templates, or on-device OCR for image receipts.
 */

export interface PixReceiptGuess {
  amountCents: Cents | null;
  occurredAt: number | null; // epoch ms
  payee: string | null;
}

// Matches "R$ 1.234,56", "1.234,56", "150,00" — captures the numeric part.
const MONEY_RE = /R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g;
// dd/mm/yyyy or dd/mm/yy, optionally followed by time.
const DATE_RE = /(\d{2})\/(\d{2})\/(\d{2,4})/;

export function parsePixReceipt(text: string): PixReceiptGuess {
  const amountCents = pickAmount(text);
  const occurredAt = pickDate(text);
  const payee = pickPayee(text);
  return { amountCents, occurredAt, payee };
}

function pickAmount(text: string): Cents | null {
  const matches = [...text.matchAll(MONEY_RE)].map((m) => parseToCents(m[1]));
  const valid = matches.filter((c) => Number.isInteger(c) && c > 0);
  if (valid.length === 0) return null;
  // Receipts usually show the transferred value as the largest figure
  // (vs. fees). Largest is the safest single guess; user confirms anyway.
  return Math.max(...valid);
}

function pickDate(text: string): number | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ts = new Date(year, month - 1, day).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function pickPayee(text: string): string | null {
  // Look for a line labelled with a common payee keyword.
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /(para|destinat|recebedor|favorecido)/i.test(l));
  if (!line) return null;
  const after = line.replace(/.*?(para|destinat\w*|recebedor|favorecido)[:\s-]*/i, '').trim();
  return after.length > 0 ? after.slice(0, 80) : null;
}
