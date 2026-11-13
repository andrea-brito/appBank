/**
 * Runnable self-check for the rate-alert decision.
 * Run with: npx tsx supabase/functions/rate-alert/decide.test.ts
 */
import { decide, emailFor, formatRate, isMarketHours, parseRate, type AlertRow } from './decide';

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

check('parse like the app', parseRate('6.19267') === 61926 && Number.isNaN(parseRate(6.2)) && Number.isNaN(parseRate('x')));
const mail = emailFor('EUR-BRL', 59800, 600, 'https://appbank-omega.vercel.app');
check('email mentions rate, target and link', mail.subject.includes('R$ 5,98') && mail.text.includes('R$ 6,00') && mail.text.includes('/fx'));
check('format', formatRate(59800) === 'R$ 5,98');

if (failures) {
  console.error(`decide.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('decide.test.ts: all checks passed');
