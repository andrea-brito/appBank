/**
 * Runnable self-check for the web vault. Run: npx tsx src/domain/vault.test.ts
 * Proves: seal/open round-trip, wrong key / tampering / swapped blobs
 * rejected, the recovery flow restores the same data key, and the login
 * password sent to the server is not the key-wrapping key.
 * deriveAccount runs with a small scrypt cost (production cost is too slow under tsx).
 */
import { bytesToHex } from '@noble/hashes/utils.js';

import { NONCE_BYTES } from './backupCrypto';
import { deriveAccount, formatRecoveryKey, open, recoveryKek, RECOVERY_BYTES, seal } from './vault';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}
function throws(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
const n = (b: number) => new Uint8Array(NONCE_BYTES).fill(b);
const same = (a: Uint8Array, b: Uint8Array) => bytesToHex(a) === bytesToHex(b);

async function main() {
  const dek = new Uint8Array(32).fill(1);
  const other = new Uint8Array(32).fill(2);
  const plain = new TextEncoder().encode('SQLite format 3 João 12345');

  const data = seal(dek, plain, n(5), 'data');
  check('no plaintext in stored text', !data.includes('João') && !data.includes('SQLite'));
  check('round-trip', new TextDecoder().decode(open(dek, data, 'data')) === 'SQLite format 3 João 12345');
  check('wrong key rejected', throws(() => open(other, data, 'data'))?.includes('Senha incorreta') === true);
  const o = JSON.parse(data);
  const flipped = JSON.stringify({ ...o, data: (o.data[0] === 'a' ? 'b' : 'a') + o.data.slice(1) });
  check('tampered data rejected', throws(() => open(dek, flipped, 'data')) != null);
  // A wrapped key relabelled as data must not open (purpose is authenticated).
  const wrap = seal(dek, other, n(6), 'wrap-pass');
  const relabelled = JSON.stringify({ ...JSON.parse(wrap), purpose: 'data' });
  check('swapped blob purpose rejected', throws(() => open(dek, relabelled, 'data')) != null);
  check('junk rejected', throws(() => open(dek, 'nope', 'data'))?.includes('corrompidos') === true);

  // Recovery key: format, forgiving parsing, strict length.
  const raw = new Uint8Array(RECOVERY_BYTES).map((_, i) => i * 17);
  const code = formatRecoveryKey(raw);
  check('recovery key is 8 groups of 4', /^([0-9A-F]{4}-){7}[0-9A-F]{4}$/.test(code));
  const sloppy = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o');
  check('recovery key parsing is forgiving', same(recoveryKek(code), recoveryKek(sloppy)));
  check('short recovery key rejected', throws(() => recoveryKek(code.slice(0, -2)))?.includes('inválida') === true);

  // Full flow with small scrypt cost.
  const fast = { N: 2 ** 10, r: 8, p: 1 };
  const acc = await deriveAccount(' Eu@Exemplo.com ', 'senha longa de teste', fast);
  const again = await deriveAccount('eu@exemplo.com', 'senha longa de teste', fast);
  const wrong = await deriveAccount('eu@exemplo.com', 'senha errada de teste', fast);
  check('email normalized', acc.email === 'eu@exemplo.com');
  check('deterministic (same login on any device)', acc.authPassword === again.authPassword && same(acc.kek, again.kek));
  check('login password is not the wrapping key', acc.authPassword !== bytesToHex(acc.kek));
  check('different passphrase -> different secrets', wrong.authPassword !== acc.authPassword);

  const wrapPass = seal(acc.kek, dek, n(7), 'wrap-pass');
  const wrapRecovery = seal(recoveryKek(code), dek, n(8), 'wrap-recovery');
  check('passphrase unwraps the data key', same(open(again.kek, wrapPass, 'wrap-pass'), dek));
  check('wrong passphrase cannot unwrap', throws(() => open(wrong.kek, wrapPass, 'wrap-pass')) != null);

  // Forgot passphrase: recovery key -> same data key -> re-wrap with a new one.
  const recovered = open(recoveryKek(sloppy), wrapRecovery, 'wrap-recovery');
  const fresh = await deriveAccount('eu@exemplo.com', 'nova senha bem longa', fast);
  const newWrap = seal(fresh.kek, recovered, n(9), 'wrap-pass');
  check('recovered key still opens the old data', new TextDecoder().decode(open(open(fresh.kek, newWrap, 'wrap-pass'), data, 'data')).startsWith('SQLite'));
  const otherCode = formatRecoveryKey(new Uint8Array(RECOVERY_BYTES).fill(9));
  check('wrong recovery key rejected', throws(() => open(recoveryKek(otherCode), wrapRecovery, 'wrap-recovery')) != null);

  if (failures) {
    console.error(`vault.test.ts: ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('vault.test.ts: all checks passed');
}

main();
