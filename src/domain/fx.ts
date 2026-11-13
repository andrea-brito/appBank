import type { Cents } from './money';

/**
 * Exchange rates as integers in 1/10000 of a real (6.2420 -> 62420), the
 * precision the quote APIs return. No float ever touches the math: parsing is
 * done on the string, conversion on integers.
 */
export type Rate4 = number;

export const FX_PAIRS = ['EUR-BRL', 'EUR-BRLT', 'USD-BRL', 'USD-BRLT'] as const;
export type FxPair = (typeof FX_PAIRS)[number];
export type GoalCurrency = 'BRL' | 'EUR' | 'USD';

export const FX_PAIR_LABEL: Record<FxPair, string> = {
  'EUR-BRL': 'Euro comercial',
  'EUR-BRLT': 'Euro turismo',
  'USD-BRL': 'Dólar comercial',
  'USD-BRLT': 'Dólar turismo',
};

export const CURRENCY_SYMBOL: Record<Exclude<GoalCurrency, 'BRL'>, string> = { EUR: '€', USD: 'US$' };

/** What it actually costs to buy the foreign currency (the "venda"/tourist rate). */
export const BUY_PAIR: Record<Exclude<GoalCurrency, 'BRL'>, FxPair> = { EUR: 'EUR-BRLT', USD: 'USD-BRLT' };

export const isFxPair = (s: string): s is FxPair => (FX_PAIRS as readonly string[]).includes(s);

/** "6.2420" -> 62420. Up to 4 decimals (more are truncated). NaN if not a positive number. */
export function parseRate(text: string): Rate4 {
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(text);
  if (!m) return NaN;
  const r = Number(m[1]) * 10_000 + Number((m[2] ?? '').slice(0, 4).padEnd(4, '0'));
  return r > 0 ? r : NaN;
}

/** Target typed in cents (R$ 6,00 -> 600) to the same 1/10000 scale. */
export const centsToRate4 = (cents: Cents): Rate4 => cents * 100;

/** 62420 -> "R$ 6,2420" trimmed to "R$ 6,242" (at least 2 decimals). */
export function formatRate(rate: Rate4): string {
  const whole = Math.floor(rate / 10_000);
  const frac = String(rate % 10_000).padStart(4, '0').replace(/0{1,2}$/, '');
  return `R$ ${whole},${frac}`;
}

/** How many foreign cents `brlCents` buys at `rate` (rounded down: never promise more). */
export function brlToForeignCents(brlCents: Cents, rate: Rate4): Cents {
  if (!(rate > 0) || brlCents <= 0) return 0;
  return Math.floor((brlCents * 10_000) / rate);
}

/** Integer mean, rounded. */
export function averageRate(rates: readonly Rate4[]): Rate4 | null {
  const ok = rates.filter((r) => r > 0);
  return ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
}

export function isAtOrBelowTarget(rate: Rate4, targetCents: Cents): boolean {
  return rate > 0 && rate <= centsToRate4(targetCents);
}

/** "€ 1.234,56" */
export function formatForeign(cents: Cents, currency: Exclude<GoalCurrency, 'BRL'>): string {
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${CURRENCY_SYMBOL[currency]} ${whole},${String(cents % 100).padStart(2, '0')}`;
}
