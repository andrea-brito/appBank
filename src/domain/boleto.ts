import type { Cents } from './money';

/**
 * Parse a Brazilian boleto "linha digitável" (47 digits, bank boletos) into
 * amount and due date. Everything is extracted by fixed positions defined by
 * the FEBRABAN layout — no OCR, no guessing, exact and offline.
 *
 * ponytail: handles only the 47-digit bank boleto. Ceiling: the 48-digit
 * "arrecadação" / concessionária format (utilities, taxes, starts with 8) is
 * NOT parsed here. Upgrade path: add the segment-based layout for leading-8.
 */

export interface BoletoInfo {
  amountCents: Cents; // 0 when the boleto has no fixed amount
  dueDate: number | null; // epoch ms, or null when no due factor encoded
  digits: string; // normalized 47 digits
}

// Boletos count days from this base date (FEBRABAN "fator de vencimento").
const DUE_FACTOR_BASE = Date.UTC(1997, 9, 7); // 1997-10-07
const MS_PER_DAY = 86_400_000;
// The factor is 4 digits: after 9999 (2025-02-21) it restarts at 1000, so
// factors 1000..9999 repeat every 9000 days.
const FACTOR_CYCLE_DAYS = 9000;

/**
 * Resolve a due factor to a date. A factor in 1000..9999 is ambiguous between
 * cycles; pick the date closest to `now` (boletos are paid near their due
 * date). Factors below 1000 only exist in the first cycle.
 */
function dueDateFromFactor(factor: number, now: number): number {
  const first = DUE_FACTOR_BASE + factor * MS_PER_DAY;
  if (factor < 1000) return first;
  const second = first + FACTOR_CYCLE_DAYS * MS_PER_DAY;
  return Math.abs(second - now) < Math.abs(first - now) ? second : first;
}

export function isLikelyBoleto(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 47 && digits[0] !== '8';
}

export function parseBoleto(raw: string, now: number = Date.now()): BoletoInfo {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 47) {
    throw new Error('Linha digitável deve ter 47 dígitos (boleto bancário)');
  }
  if (digits[0] === '8') {
    throw new Error('Boletos de concessionária (iniciando em 8) ainda não são suportados');
  }

  // Linha digitável (47 digits) -> 44-digit barcode. Each of the first three
  // fields carries a trailing check digit (positions 10, 21, 32) that is
  // dropped. Field 4 (pos 33) is the barcode's general check digit; field 5
  // (pos 34-47) holds the 4-digit due factor + 10-digit amount (in cents).
  const field1 = digits.slice(0, 9); // drop DV1 at index 9
  const field2 = digits.slice(10, 20); // drop DV2 at index 20
  const field3 = digits.slice(21, 31); // drop DV3 at index 31
  const generalCheck = digits.slice(32, 33);
  const dueFactor = digits.slice(33, 37); // 4 digits
  const amountDigits = digits.slice(37, 47); // 10 digits, value in cents

  // Barcode layout: bank+currency (field1[0..4]) + general DV + due factor +
  // amount + free field (field1[4..9] + field2 + field3).
  const barcode =
    field1.slice(0, 4) +
    generalCheck +
    dueFactor +
    amountDigits +
    field1.slice(4) +
    field2 +
    field3;

  // sanity: reconstructed barcode must be 44 digits
  if (barcode.length !== 44) {
    throw new Error('Linha digitável inválida');
  }

  const amountCents = Number(amountDigits); // already in cents, integer
  if (!Number.isInteger(amountCents)) {
    throw new Error('Valor do boleto inválido');
  }

  const factor = Number(dueFactor);
  const dueDate = factor === 0 ? null : dueDateFromFactor(factor, now);

  return { amountCents, dueDate, digits };
}
