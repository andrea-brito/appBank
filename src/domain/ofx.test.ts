/**
 * Runnable self-check for OFX parsing.
 * Run with: npx tsx src/domain/ofx.test.ts
 */
import { moneyToCents, parseOfx, parseOfxDate } from './ofx';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

// --- moneyToCents ---
check('-45.90 -> -4590', moneyToCents('-45.90') === -4590);
check('1234,56 -> 123456', moneyToCents('1234,56') === 123456);
check('100 -> 10000', moneyToCents('100') === 10000);
check('0.01 -> 1', moneyToCents('0.01') === 1);
check('garbage -> null', moneyToCents('abc') === null);

// --- parseOfxDate ---
check('20260203 parses', parseOfxDate('20260203') === new Date(2026, 1, 3).getTime());
check('with time parses to the day', parseOfxDate('20260203120000[-3:BRT]') === new Date(2026, 1, 3).getTime());
check('bad month -> null', parseOfxDate('20261503') === null);
check('short -> null', parseOfxDate('2026') === null);

// --- parseOfx (SGML, unclosed tags, typical BB layout) ---
const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260203120000[-3:BRT]
<TRNAMT>-45.90
<FITID>2026020301
<MEMO>Compra PADARIA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260205
<TRNAMT>3500.00
<FITID>2026020502
<MEMO>Salario
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const txns = parseOfx(ofx);
check('parsed two transactions', txns.length === 2);
check('debit amount is negative cents', txns[0].amountCents === -4590);
check('debit memo', txns[0].memo === 'Compra PADARIA');
check('debit fitid', txns[0].fitId === '2026020301');
check('debit date', txns[0].occurredAt === new Date(2026, 1, 3).getTime());
check('credit amount positive', txns[1].amountCents === 350000);
check('credit memo', txns[1].memo === 'Salario');

// empty / non-ofx input yields nothing, not a crash
check('empty input -> []', parseOfx('').length === 0);
check('no STMTTRN -> []', parseOfx('<OFX>nothing here</OFX>').length === 0);

// sum of parsed amounts is exact integer math
const total = txns.reduce((a, t) => a + t.amountCents, 0);
check('exact signed total', total === -4590 + 350000);

if (failures === 0) {
  console.log('ofx.test.ts: all checks passed');
} else {
  console.error(`ofx.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
