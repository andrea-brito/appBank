import { format } from 'date-fns';

import { formatBRL, type Cents } from './money';
import {
  availableCents,
  buildMonthlyHistory,
  monthRange,
  spendByCategory,
  type CategorySpend,
  type MonthSummary,
} from './monthlyHistory';
import type { TransactionKind } from './types';

/** A month ('2026-11') or a whole year ('2026'), as a local-time range. */
export function periodRange(key: string): { from: number; to: number; label: string } | null {
  const month = monthRange(key);
  if (month) {
    const label = format(month.from, 'MM/yyyy');
    return { ...month, label };
  }
  const y = /^(\d{4})$/.exec(key);
  if (!y) return null;
  const year = Number(y[1]);
  return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() - 1, label: String(year) };
}

interface Tx {
  categoryId: string | null;
  amountCents: Cents;
  kind: TransactionKind;
  description: string;
  occurredAt: number;
}
interface Cat {
  id: string;
  name: string;
}

export interface Report {
  label: string;
  incomeCents: Cents;
  expenseCents: Cents;
  savedCents: Cents;
  balanceCents: Cents;
  months: MonthSummary[]; // oldest first
  categories: (CategorySpend & { name: string })[];
  rows: { date: number; kind: TransactionKind; category: string; description: string; cents: Cents }[]; // cents signed
}

export function buildReport(
  txns: readonly Tx[],
  deposits: readonly { amountCents: Cents; occurredAt: number }[],
  categories: readonly Cat[],
  range: { from: number; to: number; label: string },
): Report {
  const inRange = <T extends { occurredAt: number }>(x: T) => x.occurredAt >= range.from && x.occurredAt <= range.to;
  const t = txns.filter(inRange).sort((a, b) => a.occurredAt - b.occurredAt);
  const d = deposits.filter(inRange);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const nameOf = (id: string | null) => (id && names.get(id)) || 'Sem categoria';
  const income = t.reduce((s, x) => s + (x.kind === 'income' ? x.amountCents : 0), 0);
  const expense = t.reduce((s, x) => s + (x.kind === 'expense' ? x.amountCents : 0), 0);
  const saved = d.reduce((s, x) => s + x.amountCents, 0);
  return {
    label: range.label,
    incomeCents: income,
    expenseCents: expense,
    savedCents: saved,
    balanceCents: availableCents(income, expense, saved),
    months: t.length || d.length ? buildMonthlyHistory(t, d, new Date(range.to)).past.reverse() : [],
    categories: spendByCategory(t).map((c) => ({ ...c, name: nameOf(c.categoryId) })),
    rows: t.map((x) => ({
      date: x.occurredAt,
      kind: x.kind,
      category: nameOf(x.categoryId),
      description: x.description,
      cents: x.kind === 'income' ? x.amountCents : -x.amountCents,
    })),
  };
}

/** "-1234,56": plain number with a decimal comma, so Excel (pt-BR) reads it as a number. */
export function centsToCsv(cents: Cents): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Text cell: quoted, and neutralised if a spreadsheet would run it as a formula. */
function textCell(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Semicolon-separated with a UTF-8 BOM: opens correctly in Excel pt-BR. */
export function toCsv(r: Report): string {
  const lines = ['Data;Tipo;Categoria;Descrição;Valor (R$)'];
  for (const x of r.rows) {
    lines.push(
      [
        format(x.date, 'dd/MM/yyyy'),
        x.kind === 'income' ? 'Entrada' : 'Saída',
        textCell(x.category),
        textCell(x.description),
        centsToCsv(x.cents),
      ].join(';'),
    );
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Print-ready page (no scripts): "Save as PDF" from the print dialog. */
export function toHtml(r: Report): string {
  const money = (c: Cents) => esc(formatBRL(c));
  const tr = (cells: string[], tag = 'td') => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  const monthly =
    r.months.length > 1
      ? `<h2>Mês a mês</h2><table>${tr(['Mês', 'Entradas', 'Saídas', 'Guardado', 'Disponível'], 'th')}${r.months
          .map((m) => tr([esc(m.label), money(m.incomeCents), money(m.expenseCents), money(m.savedCents), money(m.balanceCents)]))
          .join('')}</table>`
      : '';
  const cats = r.categories.length
    ? `<h2>Gastos por categoria</h2><table>${tr(['Categoria', 'Total', '%'], 'th')}${r.categories
        .map((c) => tr([esc(c.name), money(c.totalCents), `${c.percent}%`]))
        .join('')}</table>`
    : '';
  const rows = `<h2>Lançamentos (${r.rows.length})</h2><table>${tr(['Data', 'Categoria', 'Descrição', 'Valor'], 'th')}${r.rows
    .map((x) => tr([format(x.date, 'dd/MM/yyyy'), esc(x.category), esc(x.description), `<span class="${x.cents < 0 ? 'neg' : 'pos'}">${money(x.cents)}</span>`]))
    .join('')}</table>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>appBank ${esc(r.label)}</title><style>
body{font:13px system-ui,sans-serif;color:#111827;margin:24px}h1{font-size:20px;margin:0 0 12px}h2{font-size:15px;margin:22px 0 6px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e5e7eb}tr{break-inside:avoid}
.sum{display:flex;gap:24px;flex-wrap:wrap}.sum div{display:flex;flex-direction:column}.sum b{font-size:16px}.neg{color:#dc2626}.pos{color:#16a34a}
</style></head><body><h1>appBank · ${esc(r.label)}</h1><div class="sum">
<div>Entradas<b>${money(r.incomeCents)}</b></div><div>Saídas<b>${money(r.expenseCents)}</b></div>
<div>Guardado em metas<b>${money(r.savedCents)}</b></div><div>Disponível<b>${money(r.balanceCents)}</b></div></div>
${monthly}${cats}${rows}</body></html>`;
}
