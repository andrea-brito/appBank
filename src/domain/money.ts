/**
 * Money is always stored and computed as an integer number of cents.
 * Floating point never touches a monetary value except at the final
 * formatting step for display. "Cada centavo conta."
 */

export type Cents = number; // integer; e.g. R$ 19,99 -> 1999

const CENTS_PER_UNIT = 100;

/** Parse user input like "19,99", "19.99", "1.234,56", "R$ 10" into integer cents. */
export function parseToCents(input: string): Cents {
  const cleaned = input
    .trim()
    .replace(/[R$\s\u00A0]/g, '') // currency symbol + spaces (incl. nbsp)
    .replace(/\.(?=\d{3}(\D|$))/g, '') // drop thousands separators: 1.234,56 -> 1234,56
    .replace(',', '.'); // decimal comma -> dot

  const m = /^(-?)(\d*)(?:\.(\d+))?$/.exec(cleaned);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return NaN;

  const sign = m[1] === '-' ? -1 : 1;
  const whole = m[2] === '' ? 0 : Number(m[2]);
  const frac = m[3] ?? '';

  // Build cents from integer parts only — never multiply a float by 100.
  // Take 2 decimal digits, rounding the third (banker-agnostic half-up).
  const centsFromFrac = frac === '' ? 0 : Math.round(Number(frac.slice(0, 3).padEnd(3, '0')) / 10);
  return sign * (whole * CENTS_PER_UNIT + centsFromFrac);
}

/** Exact integer sum. No float, no drift, regardless of how many values. */
export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((acc, c) => acc + c, 0);
}

/** Format integer cents for display as Brazilian Real. Float only lives here. */
export function formatBRL(cents: Cents): string {
  return (cents / CENTS_PER_UNIT).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

// R$ 99.999.999.999,99: far above any personal amount, well inside Number's exact range.
const MAX_INPUT_DIGITS = 13;

/** Integer cents as the money inputs show them: 123456 -> "1.234,56". */
export function formatCentsInput(cents: Cents): string {
  const whole = Math.floor(cents / CENTS_PER_UNIT);
  const frac = String(cents % CENTS_PER_UNIT).padStart(2, '0');
  return `${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

/**
 * Bank-app style mask for money inputs: only digits are kept and read as
 * cents, so typing 1 2 3 4 5 shows 0,01 -> 0,12 -> 1,23 -> 12,34 -> 123,45.
 * No dot/comma to type on the phone keyboard. Empty or zero -> '' (placeholder).
 */
export function maskCurrencyInput(text: string): string {
  const digits = text.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_INPUT_DIGITS);
  return digits === '' ? '' : formatCentsInput(Number(digits));
}

export function isValidCents(cents: Cents): boolean {
  return Number.isInteger(cents) && Number.isFinite(cents);
}
