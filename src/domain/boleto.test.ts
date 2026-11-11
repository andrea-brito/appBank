/**
 * Runnable self-check for boleto + PIX receipt parsing.
 * Run with: npx tsx src/domain/boleto.test.ts
 */
import { isLikelyBoleto, parseBoleto } from './boleto';
import { parsePixReceipt } from './pixReceipt';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

// --- boleto ---
// A real-world style 47-digit linha digitável. Amount is the last 10 digits of
// the value block: "0000015000" = 15000 cents = R$ 150,00. Due factor "9999".
// Fields are formatted with the check digits in positions 10, 21, 32.
// 34191.79001 01043.510047 91020.150008 9 99990000015000
const line = '34191790010104351004791020150008999990000015000';
check('47-digit line is recognized as boleto', isLikelyBoleto(line));
check('formatted line with dots/spaces still recognized', isLikelyBoleto('34191.79001 01043.510047 91020.150008 9 99990000015000'));
check('8-leading is not a bank boleto', !isLikelyBoleto('8'.repeat(47)));

const info = parseBoleto(line);
check('amount parsed as integer cents 15000', info.amountCents === 15000);
check('due date is a timestamp', typeof info.dueDate === 'number' && (info.dueDate ?? 0) > 0);
check('normalized digits length 47', info.digits.length === 47);

// due factor 9999 from base 1997-10-07
const expectedDue = Date.UTC(1997, 9, 7) + 9999 * 86_400_000;
check('due date matches factor math', info.dueDate === expectedDue);

// zero amount boleto (no fixed value): last 10 digits all zero
const noAmount = '34191790010104351004791020150008999990000000000';
check('zero amount -> 0 cents', parseBoleto(noAmount).amountCents === 0);

// wrong length rejected
let threw = false;
try {
  parseBoleto('123');
} catch {
  threw = true;
}
check('short input throws', threw);

// --- pix receipt (text) ---
const receipt = `Comprovante de transferência PIX
Valor: R$ 1.250,90
Data: 03/02/2026 14:22
Para: João da Silva
Tarifa: R$ 0,00`;
const guess = parsePixReceipt(receipt);
check('pix amount picks the transfer value', guess.amountCents === 125090);
check('pix date parsed', guess.occurredAt === new Date(2026, 1, 3).getTime());
check('pix payee extracted', guess.payee === 'João da Silva');

const empty = parsePixReceipt('nada de útil aqui');
check('no money -> null amount', empty.amountCents === null);
check('no date -> null date', empty.occurredAt === null);

if (failures === 0) {
  console.log('boleto.test.ts: all checks passed');
} else {
  console.error(`boleto.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
