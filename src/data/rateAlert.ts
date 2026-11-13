// Native app: no server, so no e-mail alerts. The web build uses rateAlert.web.ts.
import type { FxPair } from '@/domain/fx';

export interface RateAlert {
  pair: FxPair;
  targetCents: number;
  enabled: boolean;
  lastNotifiedAt: string | null;
}

export const alertsSupported = false;

export async function getRateAlert(): Promise<RateAlert | null> {
  return null;
}

export async function saveRateAlert(_alert: Omit<RateAlert, 'lastNotifiedAt'>): Promise<void> {
  throw new Error('Alertas por e-mail só existem na versão web.');
}
