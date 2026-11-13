import { z } from 'zod';

import { averageRate, FX_PAIRS, parseRate, type FxPair, type Rate4 } from '@/domain/fx';

/**
 * Exchange rates from AwesomeAPI (free, no key, CORS-enabled). Chosen over the
 * BCB PTAX API because it has the tourist rate (what buying cash/card actually
 * costs) and near-real-time quotes; PTAX only has 4 official bulletins a day.
 * Responses are untrusted input: validated before use, failures return null.
 */
const BASE = 'https://economia.awesomeapi.com.br/json';
const CACHE_MS = 5 * 60_000; // the API itself caches unauthenticated calls

export interface Quote {
  pair: FxPair;
  /** Selling rate ("venda"/ask): the price to buy the foreign currency. */
  ask: Rate4;
  at: number; // epoch ms of the quote
}

const rateText = z.string().regex(/^\d+(\.\d+)?$/);
const lastSchema = z.record(z.string(), z.object({ ask: rateText, timestamp: z.string().regex(/^\d+$/) }));
const dailySchema = z.array(z.object({ ask: rateText })).max(400);

let cache: { at: number; quotes: Record<FxPair, Quote> } | null = null;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Latest quote of every pair the app uses, or null when the API is unreachable/invalid. */
export async function fetchQuotes(): Promise<Record<FxPair, Quote> | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.quotes;
  try {
    const parsed = lastSchema.parse(await getJson(`${BASE}/last/${FX_PAIRS.join(',')}`));
    const quotes = {} as Record<FxPair, Quote>;
    for (const pair of FX_PAIRS) {
      const q = parsed[pair.replace('-', '')]; // the API keys "EUR-BRLT" as "EURBRLT"
      const ask = q ? parseRate(q.ask) : NaN;
      if (!q || !(ask > 0)) return null;
      quotes[pair] = { pair, ask, at: Number(q.timestamp) * 1000 };
    }
    cache = { at: Date.now(), quotes };
    return quotes;
  } catch {
    return null;
  }
}

/** Average selling rate over the last `days` daily closes, or null. */
export async function fetchAverage(pair: FxPair, days = 30): Promise<Rate4 | null> {
  try {
    const rows = dailySchema.parse(await getJson(`${BASE}/daily/${pair}/${days}`));
    return averageRate(rows.map((r) => parseRate(r.ask)));
  } catch {
    return null;
  }
}
