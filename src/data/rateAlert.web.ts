import { isFxPair } from '@/domain/fx';

import { supabase } from './db/client.web';
import type { RateAlert } from './rateAlert';

export type { RateAlert } from './rateAlert';

export const alertsSupported = true;

/** The signed-in user's alert (table rate_alerts, RLS: own row only), or null if none yet. */
export async function getRateAlert(): Promise<RateAlert | null> {
  const { data, error } = await supabase()
    .from('rate_alerts')
    .select('pair, target_cents, enabled, last_notified_at')
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o alerta: ${error.message}`);
  if (!data || !isFxPair(data.pair)) return null;
  return { pair: data.pair, targetCents: data.target_cents, enabled: data.enabled, lastNotifiedAt: data.last_notified_at };
}

export async function saveRateAlert(alert: Omit<RateAlert, 'lastNotifiedAt'>): Promise<void> {
  if (!isFxPair(alert.pair)) throw new Error('Cotação inválida.');
  if (!Number.isInteger(alert.targetCents) || alert.targetCents < 1 || alert.targetCents > 100000) {
    throw new Error('Informe um preço-alvo entre R$ 0,01 e R$ 1.000,00.');
  }
  const row = {
    pair: alert.pair,
    target_cents: alert.targetCents,
    enabled: alert.enabled,
    updated_at: new Date().toISOString(),
  };
  const userId = (await supabase().auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('Sessão expirada. Saia e entre de novo.');
  const existing = await getRateAlert();
  const { error } = existing
    ? // A new target or pair starts fresh: the next time the rate is at/below it, e-mail again.
      await supabase().from('rate_alerts').update({ ...row, was_below: false }).eq('user_id', userId)
    : await supabase().from('rate_alerts').insert(row);
  if (error) throw new Error(`Não foi possível salvar o alerta: ${error.message}`);
}
