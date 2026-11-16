/**
 * Runnable self-check for the rate-alert decision.
 * Run with: npx tsx supabase/functions/rate-alert/decide.test.ts
 */
import {
  decide,
  emailFor,
  escapeHtml,
  formatRate,
  formatWhenBR,
  isMarketHours,
  parsePtax,
  parseRate,
  PTAX_CURRENCY,
  ptaxDate,
  ptaxUrl,
  type AlertRow,
} from './decide';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

const base: AlertRow = { user_id: 'u', pair: 'EUR-BRL', target_cents: 600, enabled: true, was_below: false, last_notified_at: null };
const now = new Date('2026-11-16T14:00:00Z'); // Monday 11:00 in Brasília

check('above target: no e-mail', !decide(base, 62420, now).notify && !decide(base, 62420, now).wasBelow);
check('crosses below: e-mail', decide(base, 59800, now).notify && decide(base, 59800, now).wasBelow);
check('exactly at target counts', decide(base, 60000, now).notify);
check('still below at next check: no repeat', !decide({ ...base, was_below: true }, 59500, now).notify);
check('goes back above: resets', decide({ ...base, was_below: true }, 60100, now).wasBelow === false);
const notifiedAnHourAgo = { ...base, last_notified_at: new Date(now.getTime() - 3600_000).toISOString() };
check('crosses again within 20h: no e-mail', !decide(notifiedAnHourAgo, 59000, now).notify);
const notifiedYesterday = { ...base, last_notified_at: new Date(now.getTime() - 21 * 3600_000).toISOString() };
check('crosses again next day: e-mail', decide(notifiedYesterday, 59000, now).notify);
check('disabled: never', !decide({ ...base, enabled: false }, 50000, now).notify);
check('bad rate: never', !decide(base, NaN, now).notify);

check('Monday 11h BRT open', isMarketHours(now));
check('Monday 8h59 BRT closed', !isMarketHours(new Date('2026-11-16T11:59:00Z')));
check('Monday 18h BRT closed', !isMarketHours(new Date('2026-11-16T21:00:00Z')));
check('Saturday closed', !isMarketHours(new Date('2026-11-14T14:00:00Z')));
check('Friday 17h30 BRT open', isMarketHours(new Date('2026-11-20T20:30:00Z')));

// PTAX fallback (Banco Central): real response shape.
const ptaxBody = { value: [{ paridadeCompra: 1.1066, paridadeVenda: 1.1067, cotacaoCompra: 6.2121, cotacaoVenda: 6.2133, dataHoraCotacao: '2026-11-12 13:08:21.353', tipoBoletim: 'Fechamento' }] };
check('ptax selling rate', parsePtax(ptaxBody) === 62133);
check('ptax float noise', parsePtax({ value: [{ cotacaoVenda: 5.99999999999 }] }) === 60000 && parsePtax({ value: [{ cotacaoVenda: 6.2 }] }) === 62000);
check('ptax empty/garbage', [parsePtax({ value: [] }), parsePtax(null), parsePtax({ value: [{ cotacaoVenda: '6.2' }] }), parsePtax({ value: [{ cotacaoVenda: -1 }] })].every(Number.isNaN));
check('ptax date in Brasília', ptaxDate(new Date('2026-11-17T02:30:00Z')) === '11-16-2026');
const pu = ptaxUrl('EUR', new Date('2026-11-16T14:00:00Z'));
check('ptax url', pu.includes("@moeda='EUR'") && pu.includes("@dataInicial='11-09-2026'") && pu.includes("@dataFinalCotacao='11-16-2026'") && pu.includes('$top=1'));
check('ptax only commercial pairs', PTAX_CURRENCY['EUR-BRL'] === 'EUR' && PTAX_CURRENCY['EUR-BRLT'] === undefined);

check('parse like the app', parseRate('6.19267') === 61926 && Number.isNaN(parseRate(6.2)) && Number.isNaN(parseRate('x')));
const at = new Date('2026-11-16T17:30:00Z'); // 14:30 in Brasília
const mail = emailFor('EUR-BRL', 59800, 600, 'https://appbank-omega.vercel.app/', 'ptax', at);
check('email mentions rate, target and link', mail.subject.includes('R$ 5,98') && mail.text.includes('R$ 6,00') && mail.text.includes('https://appbank-omega.vercel.app/fx'));
check('text has distance, time and source', mail.text.includes('R$ 0,02 abaixo') && mail.text.includes('16/11/2026 às 14:30') && mail.text.includes('PTAX'));
check('html has rate, target, button and source', ['R$ 5,98', 'até R$ 6,00', 'R$ 0,02', 'href="https://appbank-omega.vercel.app/fx"', 'Ver no appBank', 'PTAX do Banco Central'].every((s) => mail.html.includes(s)));
check('html is a full document', mail.html.startsWith('<!doctype html>') && mail.html.includes('lang="pt-BR"') && mail.html.trimEnd().endsWith('</html>'));
const atTarget = emailFor('EUR-BRL', 60000, 600, 'https://x', 'awesomeapi', at);
check('exactly at target says so', atTarget.html.includes('no alvo') && !atTarget.text.includes('abaixo do alvo'));
check('escapes injected url', escapeHtml('"><script>') === '&quot;&gt;&lt;script&gt;' && !emailFor('EUR-BRL', 59800, 600, 'https://x/"><script>', 'ptax', at).html.includes('<script>'));
check('when in Brasília', formatWhenBR(new Date('2026-11-17T02:05:00Z')) === '16/11/2026 às 23:05');
check('format', formatRate(59800) === 'R$ 5,98');

if (failures) {
  console.error(`decide.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('decide.test.ts: all checks passed');
