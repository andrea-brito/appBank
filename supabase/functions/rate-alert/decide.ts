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

/** Pairs the Banco Central PTAX API can answer (commercial only, no tourist rate). */
export const PTAX_CURRENCY: Partial<Record<Pair, 'EUR' | 'USD'>> = { 'EUR-BRL': 'EUR', 'USD-BRL': 'USD' };

/** BCB OData date format, MM-DD-YYYY, for a day in Brasília (UTC-3). */
export function ptaxDate(d: Date): string {
  const br = new Date(d.getTime() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(br.getUTCMonth() + 1)}-${p(br.getUTCDate())}-${br.getUTCFullYear()}`;
}

export function ptaxUrl(currency: 'EUR' | 'USD', now: Date): string {
  const from = ptaxDate(new Date(now.getTime() - 7 * 86_400_000)); // covers weekends/holidays
  const to = ptaxDate(now);
  return (
    'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
    'CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)' +
    `?@moeda='${currency}'&@dataInicial='${from}'&@dataFinalCotacao='${to}'` +
    '&$format=json&$orderby=dataHoraCotacao%20desc&$top=1'
  );
}

/**
 * Selling rate of the latest PTAX bulletin, as Rate4, or NaN. The API returns
 * numbers (6.2133); toFixed(4) keeps the 4 decimals it publishes before the
 * same string parsing used for every other rate.
 */
export function parsePtax(body: unknown): number {
  const row = (body as { value?: { cotacaoVenda?: unknown }[] } | null)?.value?.[0];
  const v = row?.cotacaoVenda;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? parseRate(v.toFixed(4)) : NaN;
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
  /** Rate (in reais) of the last e-mail sent; null before the first one. */
  last_notified_rate: number | null;
}

export interface Decision {
  /** Send the e-mail now. */
  notify: boolean;
  /** 'target': just crossed the target. 'falling': keeps dropping after an e-mail. */
  kind: 'target' | 'falling';
  /** New value for was_below. */
  wasBelow: boolean;
  rate: number;
}

const MIN_HOURS_BETWEEN_EMAILS = 20;
/** While below target, e-mail again when the rate is this much under the last e-mailed rate (R$ 0,05). */
const FALLING_STEP = 500;

/**
 * E-mail when the rate is at/below the target AND it was not already below at
 * the last check (one e-mail per crossing, not one per check). While it stays
 * below, e-mail again each time it drops FALLING_STEP under the last e-mailed
 * rate. Never more than once per ~day.
 */
export function decide(alert: AlertRow, rate: number, now: Date): Decision {
  const below = alert.enabled && rate > 0 && rate <= alert.target_cents * 100;
  const last = alert.last_notified_at ? Date.parse(alert.last_notified_at) : NaN;
  const cooledDown = Number.isNaN(last) || now.getTime() - last >= MIN_HOURS_BETWEEN_EMAILS * 3600_000;
  const lastRate = alert.last_notified_rate == null ? NaN : Math.round(alert.last_notified_rate * 10_000);
  const crossed = below && !alert.was_below;
  const falling = below && alert.was_below && rate <= lastRate - FALLING_STEP; // NaN compares false
  return { notify: (crossed || falling) && cooledDown, kind: crossed ? 'target' : 'falling', wasBelow: below, rate };
}

export type QuoteSource = 'awesomeapi' | 'ptax';

const SOURCE_LABEL: Record<QuoteSource, string> = {
  awesomeapi: 'AwesomeAPI',
  ptax: 'PTAX do Banco Central',
};

/** Minimal HTML escaping for values interpolated into the e-mail body. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** "13/11/2026 às 14:30" in Brasília time (UTC-3). */
export function formatWhenBR(d: Date): string {
  const br = new Date(d.getTime() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(br.getUTCDate())}/${p(br.getUTCMonth() + 1)}/${br.getUTCFullYear()} às ${p(br.getUTCHours())}:${p(br.getUTCMinutes())}`;
}

/**
 * The alert e-mail: a plain-text version (also helps deliverability) and an
 * HTML version with inline styles and tables only, the layout every mail
 * client renders (Gmail, Outlook, Apple Mail, dark mode).
 */
export function emailFor(
  pair: Pair,
  rate: number,
  targetCents: number,
  appUrl: string,
  source: QuoteSource = 'awesomeapi',
  at: Date = new Date(),
  kind: 'target' | 'falling' = 'target',
) {
  const label = PAIR_LABEL[pair];
  const target = targetCents * 100;
  const below = Math.max(0, target - rate);
  const link = `${appUrl.replace(/\/+$/, '')}/fx`;
  const when = formatWhenBR(at);
  const sourceLabel = SOURCE_LABEL[source];
  const safeLink = escapeHtml(link);

  const falling = kind === 'falling';
  const headline = falling ? '📉 Segue em baixa!' : '💶 Chegou no seu preço!';

  const text =
    (falling
      ? `O ${label.toLowerCase()} segue em baixa e está em ${formatRate(rate)} (venda). Pode ser um bom momento para comprar.\n`
      : `O ${label.toLowerCase()} está em ${formatRate(rate)} (venda), no seu alvo de até ${formatRate(target)}.\n`) +
    (below > 0 ? `São ${formatRate(below)} abaixo do alvo.\n` : '') +
    `\nCotação de ${when} (${sourceLabel}).\n\n` +
    `Ver no appBank: ${link}\n\n` +
    'Valor de referência: confira o preço final na casa de câmbio ou no banco antes de comprar.\n' +
    'Para parar estes avisos, desligue o alerta na tela Câmbio.';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(label)} no seu preço</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(falling ? `${label} segue em baixa: ${formatRate(rate)}. Bom momento para comprar.` : `${label} a ${formatRate(rate)}, no seu alvo de até ${formatRate(target)}.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="background:#4f46e5;padding:20px 24px;color:#ffffff;">
        <div style="font-size:14px;font-weight:600;opacity:.9;">appBank · Câmbio</div>
        <div style="font-size:22px;font-weight:800;margin-top:4px;">${headline}</div>
      </td></tr>
      <tr><td style="padding:24px;">
        <div style="font-size:14px;color:#4b5563;">${escapeHtml(label)} agora (venda)</div>
        <div style="font-size:40px;line-height:1.1;font-weight:800;color:#166534;margin:6px 0 4px;">${escapeHtml(formatRate(rate))}</div>
        <div style="font-size:13px;color:#6b7280;">Cotação de ${escapeHtml(when)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f0fdf4;border-radius:12px;">
          <tr>
            <td style="padding:14px 16px;">
              <div style="font-size:12px;color:#166534;">Seu alvo</div>
              <div style="font-size:18px;font-weight:700;color:#14532d;">até ${escapeHtml(formatRate(target))}</div>
            </td>
            <td style="padding:14px 16px;text-align:right;">
              <div style="font-size:12px;color:#166534;">Abaixo do alvo</div>
              <div style="font-size:18px;font-weight:700;color:#14532d;">${below > 0 ? escapeHtml(formatRate(below)) : 'no alvo'}</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="${safeLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:12px;">Ver no appBank</a>
        </td></tr></table>
        <p style="font-size:13px;line-height:1.5;color:#4b5563;margin:20px 0 0;">Valor de referência (${escapeHtml(sourceLabel)}). Confira o preço final na casa de câmbio ou no banco antes de comprar.</p>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;">
        Você recebe este aviso porque ligou o alerta de câmbio no appBank. Para parar, desligue o alerta na tela <a href="${safeLink}" style="color:#4f46e5;">Câmbio</a>.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const subject = falling
    ? `📉 ${label} segue em baixa: ${formatRate(rate)}`
    : `💶 ${label} a ${formatRate(rate)}: chegou no seu preço`;
  return { subject, text, html };
}
