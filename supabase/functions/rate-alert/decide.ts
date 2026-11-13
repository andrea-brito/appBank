// Pure decision logic for the rate-alert Edge Function (no Deno, no I/O), so
// it can be tested with `npx tsx supabase/functions/rate-alert/decide.test.ts`.

export type Pair = 'EUR-BRL' | 'EUR-BRLT' | 'USD-BRL' | 'USD-BRLT';
export const PAIRS: readonly Pair[] = ['EUR-BRL', 'EUR-BRLT', 'USD-BRL', 'USD-BRLT'];

export const PAIR_LABEL: Record<Pair, string> = {
  'EUR-BRL': 'Euro comercial',
  'EUR-BRLT': 'Euro turismo',
  'USD-BRL': 'Dólar comercial',
  'USD-BRLT': 'Dólar turismo',
};

/** "6.2420" -> 62420 (1/10000 of a real). NaN if invalid. Same rule as the app's domain/fx.ts. */
export function parseRate(text: unknown): number {
  if (typeof text !== 'string') return NaN;
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(text);
  if (!m) return NaN;
  const r = Number(m[1]) * 10_000 + Number((m[2] ?? '').slice(0, 4).padEnd(4, '0'));
  return r > 0 ? r : NaN;
}

export function formatRate(rate: number): string {
  const frac = String(rate % 10_000).padStart(4, '0').replace(/0{1,2}$/, '');
  return `R$ ${Math.floor(rate / 10_000)},${frac}`;
}

/** Weekdays 9:00-17:59 in Brasília (UTC-3, no DST since 2019). */
export function isMarketHours(now: Date): boolean {
  const br = new Date(now.getTime() - 3 * 3600_000);
  const day = br.getUTCDay();
  const hour = br.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

export interface AlertRow {
  user_id: string;
  pair: string;
  target_cents: number;
  enabled: boolean;
  was_below: boolean;
  last_notified_at: string | null;
}

export interface Decision {
  /** Send the e-mail now. */
  notify: boolean;
  /** New value for was_below. */
  wasBelow: boolean;
  rate: number;
}

const MIN_HOURS_BETWEEN_EMAILS = 20;

/**
 * E-mail when the rate is at/below the target AND it was not already below at
 * the last check (one e-mail per crossing, not one per check), and never more
 * than once per ~day even if it oscillates around the target.
 */
export function decide(alert: AlertRow, rate: number, now: Date): Decision {
  const below = alert.enabled && rate > 0 && rate <= alert.target_cents * 100;
  const last = alert.last_notified_at ? Date.parse(alert.last_notified_at) : NaN;
  const cooledDown = Number.isNaN(last) || now.getTime() - last >= MIN_HOURS_BETWEEN_EMAILS * 3600_000;
  return { notify: below && !alert.was_below && cooledDown, wasBelow: below, rate };
}

export function emailFor(pair: Pair, rate: number, targetCents: number, appUrl: string) {
  const label = PAIR_LABEL[pair];
  const target = formatRate(targetCents * 100);
  return {
    subject: `💶 ${label} a ${formatRate(rate)}: chegou no seu preço`,
    text:
      `O ${label.toLowerCase()} está em ${formatRate(rate)} (venda), no seu alvo de até ${target}.\n\n` +
      `Ver no appBank: ${appUrl}/fx\n\n` +
      'Cotação de referência (AwesomeAPI). Confira o valor final na casa de câmbio ou no banco antes de comprar.\n' +
      'Para parar estes avisos, desligue o alerta na tela Câmbio.',
  };
}
