/** dd/mm/aaaa in local time. */
export function formatDateBR(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Parse "dd/mm/aaaa" (also d/m/aaaa, with - or .) to noon local time, or null
 * if it is not a real calendar date (31/02 is rejected, not rolled over).
 */
export function parseDateBR(text: string): number | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 2000 || year > 2100) return null;
  const d = new Date(year, month - 1, day, 12);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d.getTime();
}

/** Cents as the user types them back: 123456 -> "1234,56". Integer math only. */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}
