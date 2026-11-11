/**
 * Runnable self-check for the web vault. Run: npx tsx src/domain/vault.test.ts
 * Proves: round-trip, wrong passphrase / tampering rejected, no plaintext leak.
 * The seal/open path is exercised with a hand-built key (scrypt at production
 * cost is too slow under tsx); deriveVaultKey is covered by backupCrypto.test.
 */
import { NONCE_BYTES, SALT_BYTES, SCRYPT } from './backupCrypto';
import { openVault, readVaultHeader, sealVault, type VaultKey } from './vault';

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

const salt = new Uint8Array(SALT_BYTES).fill(3);
const nonce = new Uint8Array(NONCE_BYTES).fill(5);
const good: VaultKey = { key: new Uint8Array(32).fill(1), salt, cost: SCRYPT };
const bad: VaultKey = { ...good, key: new Uint8Array(32).fill(2) };
const plain = new TextEncoder().encode('SQLite format 3 João 12345');

const text = sealVault(good, plain, nonce);
check('no plaintext in stored text', !text.includes('João') && !text.includes('SQLite'));
check('round-trip', new TextDecoder().decode(openVault(text, good)) === 'SQLite format 3 João 12345');
check('wrong key rejected', throws(() => openVault(text, bad))?.includes('Senha incorreta') === true);

const o = JSON.parse(text);
const flipped = JSON.stringify({ ...o, data: (o.data[0] === 'a' ? 'b' : 'a') + o.data.slice(1) });
check('tampered data rejected', throws(() => openVault(flipped, good)) != null);
const swapped = JSON.stringify({ ...o, kdf: { ...o.kdf, salt: 'f'.repeat(32) } });
check('tampered header rejected', throws(() => openVault(swapped, good)) != null);
check('junk rejected', throws(() => readVaultHeader('nope'))?.includes('corrompidos') === true);
check('header salt readable', readVaultHeader(text).salt.every((b) => b === 3));

if (failures) {
  console.error(`vault.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('vault.test.ts: all checks passed');
