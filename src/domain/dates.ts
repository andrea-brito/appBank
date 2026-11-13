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

/** Date input mask: only digits are kept and slashes added, "05032026" -> "05/03/2026". */
export function maskDateInput(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Cents prefilled into a (masked) money input: 123456 -> "1.234,56". */
export { formatCentsInput as centsToInput } from './money';
