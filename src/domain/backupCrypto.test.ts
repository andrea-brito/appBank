/**
 * Runnable self-check for backup encryption.
 * Run with: npx tsx src/domain/backupCrypto.test.ts
 * Proves: round-trip works, a wrong passphrase / tampering never decrypts.
 *
 * Uses a small scrypt N so the suite stays fast (under tsx the pure-JS scrypt
 * runs in CommonJS mode and is ~20x slower than the real app build). The
 * production cost (SCRYPT) is only asserted, never executed, here.
 */
import { decryptBackup, encryptBackup, NONCE_BYTES, SALT_BYTES, SCRYPT } from './backupCrypto';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}
async function rejects(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const salt = new Uint8Array(SALT_BYTES).fill(7);
const nonce = new Uint8Array(NONCE_BYTES).fill(9);
const plain = JSON.stringify({ nome: 'João', valor: 12345, emoji: '🐷' });
const fast = { N: 2 ** 10, r: 8, p: 1 };
const PASS = 'minha senha forte';

async function main() {
  check('production scrypt cost is at least 2^15', SCRYPT.N >= 2 ** 15 && SCRYPT.r === 8);

  const file = await encryptBackup(plain, PASS, salt, nonce, fast);

  check('ciphertext does not contain the plaintext', !file.includes('João') && !file.includes('12345'));
  check('round-trip returns the original text', (await decryptBackup(file, PASS)) === plain);

  const wrong = await rejects(decryptBackup(file, 'senha errada'));
  check('wrong passphrase is rejected', wrong != null && wrong.includes('Senha incorreta'));

  // NFKC: "é" typed as one char vs "e" + combining accent is the same passphrase.
  const composed = await encryptBackup(plain, 'caf\u00e9-secreto', salt, nonce, fast);
  check('unicode-equivalent passphrase decrypts', (await decryptBackup(composed, 'cafe\u0301-secreto')) === plain);

  // Flip one hex digit of the ciphertext.
  const obj = JSON.parse(file);
  const flipped = { ...obj, data: (obj.data[0] === 'a' ? 'b' : 'a') + obj.data.slice(1) };
  check('tampered ciphertext is rejected', (await rejects(decryptBackup(JSON.stringify(flipped), PASS))) != null);

  // Header is authenticated: changing p (cost) must fail even with the right passphrase.
  const lowered = { ...obj, kdf: { ...obj.kdf, p: 2 } };
  check('tampered header is rejected', (await rejects(decryptBackup(JSON.stringify(lowered), PASS))) != null);

  // Parameters outside the accepted range are refused before any expensive work.
  const tiny = { ...obj, kdf: { ...obj.kdf, N: 2 ** 4 } };
  const bomb = { ...obj, kdf: { ...obj.kdf, N: 2 ** 22 } };
  const tinyMsg = await rejects(decryptBackup(JSON.stringify(tiny), 'x'));
  check('nonsense scrypt cost refused', tinyMsg != null && tinyMsg.includes('não é um backup'));
  const bombMsg = await rejects(decryptBackup(JSON.stringify(bomb), 'x'));
  check('huge scrypt cost refused', bombMsg != null && bombMsg.includes('não é um backup'));

  const junk = await rejects(decryptBackup('isto não é json', 'x'));
  check('non-backup file gives a clear message', junk != null && junk.includes('não é um backup'));

  if (failures === 0) {
    console.log('backupCrypto.test.ts: all checks passed');
  } else {
    console.error(`backupCrypto.test.ts: ${failures} check(s) failed`);
    process.exit(1);
  }
}

main();
