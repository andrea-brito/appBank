// Supabase Edge Function (Deno): checks the exchange rate and e-mails users
// whose alert target was reached. Called by pg_cron (see supabase/rate_alerts_cron.sql).
//
// Deployed with --no-verify-jwt: the caller is a cron job, not a signed-in
// user. Instead, every request must carry the shared secret CRON_SECRET in the
// x-cron-secret header; anything else gets 401 before touching data.
//
// Secrets (supabase secrets set ...): CRON_SECRET, RESEND_API_KEY, APP_URL,
// optional ALERT_FROM. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
// by the platform. Never logs e-mail addresses.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import { decide, emailFor, isMarketHours, PAIRS, parseRate, type AlertRow, type Pair } from './decide.ts';

const env = (name: string) => Deno.env.get(name) ?? '';
const QUOTES_URL = `https://economia.awesomeapi.com.br/json/last/${PAIRS.join(',')}`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Constant-time string comparison for the shared secret. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function sendEmail(to: string, mail: { subject: string; text: string }): Promise<boolean> {
  const res = await fetch(env('RESEND_URL') || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('ALERT_FROM') || 'appBank <onboarding@resend.dev>', to: [to], ...mail }),
  });
  if (!res.ok) console.error('resend failed', res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!sameSecret(req.headers.get('x-cron-secret') ?? '', env('CRON_SECRET'))) return json({ error: 'unauthorized' }, 401);

  const now = new Date();
  // ?force=1 runs outside market hours (manual test); still needs the secret.
  if (new URL(req.url).searchParams.get('force') !== '1' && !isMarketHours(now)) {
    return json({ skipped: 'outside market hours' });
  }

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: alerts, error } = await sb
    .from('rate_alerts')
    .select('user_id, pair, target_cents, enabled, was_below, last_notified_at')
    .eq('enabled', true);
  if (error) return json({ error: 'db read failed' }, 500);
  if (!alerts?.length) return json({ checked: 0 });

  const res = await fetch(QUOTES_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) return json({ error: `quotes HTTP ${res.status}` }, 502);
  const body = await res.json().catch(() => null);
  const rates: Partial<Record<Pair, number>> = {};
  for (const pair of PAIRS) rates[pair] = parseRate(body?.[pair.replace('-', '')]?.ask);

  let sent = 0;
  for (const alert of alerts as AlertRow[]) {
    const rate = rates[alert.pair as Pair];
    if (!rate || !(rate > 0)) continue;
    const d = decide(alert, rate, now);

    let notifiedAt: string | null = null;
    if (d.notify) {
      const { data } = await sb.auth.admin.getUserById(alert.user_id);
      const email = data?.user?.email;
      if (email && (await sendEmail(email, emailFor(alert.pair as Pair, rate, alert.target_cents, env('APP_URL'))))) {
        notifiedAt = now.toISOString();
        sent++;
      }
    }

    await sb
      .from('rate_alerts')
      .update({
        // If the e-mail failed, stay "not below" so the next check tries again.
        was_below: d.notify && !notifiedAt ? false : d.wasBelow,
        last_rate: rate / 10_000,
        last_checked_at: now.toISOString(),
        ...(notifiedAt ? { last_notified_at: notifiedAt } : {}),
      })
      .eq('user_id', alert.user_id);
  }

  return json({ checked: alerts.length, sent });
});
