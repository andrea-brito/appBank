import { useEffect, useState } from 'react';

import { fetchQuotes, type Quote } from '@/data/quotes';
import type { FxPair } from '@/domain/fx';

/** Latest quotes, fetched once per mount (the data layer caches for 5 min). null while loading or offline. */
export function useQuotes(): Record<FxPair, Quote> | null {
  const [quotes, setQuotes] = useState<Record<FxPair, Quote> | null>(null);
  useEffect(() => {
    let alive = true;
    fetchQuotes().then((q) => alive && setQuotes(q));
    return () => {
      alive = false;
    };
  }, []);
  return quotes;
}
