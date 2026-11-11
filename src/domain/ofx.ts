import type { Cents } from './money';

export interface OfxTransaction {
  fitId: string; // bank's unique id for the transaction -> dedupe key
  amountCents: Cents; // signed: negative = debit (expense), positive = credit (income)
  occurredAt: number; // epoch ms (DTPOSTED)
  memo: string; // description (MEMO, falling back to NAME)
}

/**
 * Parse an OFX statement (SGML-style, tags often unclosed) into transactions.
 * OFX is a standard format, so this is exact, not heuristic: every bank emits
 * the same STMTTRN/TRNAMT/DTPOSTED/FITID tags.
 *
 * ponytail: tolerant tag reader via regex rather than a full SGML parser.
 * Ceiling: ignores OFX structure beyond STMTTRN blocks (balances, multiple
 * accounts are flattened). Upgrade path: a real OFX/SGML parser if we ever
 * need account separation.
 */
export function parseOfx(content: string): OfxTransaction[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi);
  if (!blocks) return [];

  const txns: OfxTransaction[] = [];
  for (const block of blocks) {
    const amountRaw = tag(block, 'TRNAMT');
    const dateRaw = tag(block, 'DTPOSTED');
    if (amountRaw == null || dateRaw == null) continue;

    const amountCents = moneyToCents(amountRaw);
    if (amountCents == null) continue;

    const occurredAt = parseOfxDate(dateRaw);
    if (occurredAt == null) continue;

    const memo = tag(block, 'MEMO') ?? tag(block, 'NAME') ?? '';
    // FITID is the dedupe key; if a bank omits it, synthesize a stable one.
    const fitId = tag(block, 'FITID') ?? `${dateRaw}-${amountRaw}-${memo}`;

    txns.push({ fitId, amountCents, occurredAt, memo: memo.trim() });
  }
  return txns;
}

/** Read a single OFX tag value (value runs until the next tag or newline). */
function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim() : null;
}

/** "-45.90" or "1234,56" -> integer cents (signed). Never uses float math. */
export function moneyToCents(raw: string): Cents | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  const m = /^(-?)(\d*)(?:\.(\d+))?$/.exec(cleaned);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;

  const sign = m[1] === '-' ? -1 : 1;
  const whole = m[2] === '' ? 0 : Number(m[2]);
  const frac = (m[3] ?? '').slice(0, 2).padEnd(2, '0');
  return sign * (whole * 100 + Number(frac));
}

/** OFX date "YYYYMMDD" or "YYYYMMDDHHMMSS[...]" -> epoch ms (local date). */
export function parseOfxDate(raw: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ts = new Date(year, month - 1, day).getTime();
  return Number.isNaN(ts) ? null : ts;
}
