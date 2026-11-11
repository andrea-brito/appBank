import { parseBoleto } from '@/domain/boleto';
import { isValidCents } from '@/domain/money';
import { parsePixReceipt } from '@/domain/pixReceipt';

export interface ParsedDocument {
  amountCents: number | null;
  occurredAt: number | null; // boleto: due date; pix: receipt date
  description: string | null;
  confident: boolean; // true for boleto (exact), false for pix text (heuristic)
}

/**
 * Turn a raw boleto line or pasted PIX receipt text into pre-filled fields.
 * This never saves on its own — the UI shows the result for confirmation,
 * because PIX text parsing is a heuristic and even a boleto may need a category.
 */
export function parseBoletoLine(raw: string): ParsedDocument {
  const info = parseBoleto(raw); // throws on invalid input; caller shows the message
  if (!isValidCents(info.amountCents)) {
    throw new Error('Não consegui ler o valor do boleto');
  }
  return {
    amountCents: info.amountCents > 0 ? info.amountCents : null,
    occurredAt: info.dueDate,
    description: 'Boleto',
    confident: true,
  };
}

export function parsePixText(text: string): ParsedDocument {
  if (text.trim() === '') {
    throw new Error('Cole o texto do comprovante');
  }
  const guess = parsePixReceipt(text);
  return {
    amountCents: guess.amountCents,
    occurredAt: guess.occurredAt,
    description: guess.payee ? `PIX ${guess.payee}` : 'PIX',
    confident: false,
  };
}
