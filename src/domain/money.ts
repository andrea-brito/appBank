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

export function isValidCents(cents: Cents): boolean {
  return Number.isInteger(cents) && Number.isFinite(cents);
}
