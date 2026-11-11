import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { deriveKey, NONCE_BYTES, SALT_BYTES, SCRYPT, type ScryptCost } from './backupCrypto';

/**
 * Encrypted at-rest storage for the web build (no Keychain / SQLCipher there).
 *
 * The whole serialized database is sealed with XChaCha20-Poly1305 using a key
 * derived ONCE from the user's passphrase (scrypt) and kept in memory, so each
 * save is just a fast AEAD pass. Pure compute: salt and nonce are injected.
 *
 * ponytail: the whole DB is re-sealed on every save (fine for a personal
 * ledger: tens/hundreds of KB). Upgrade path: per-table or incremental pages.
 */

const FORMAT = 'appbank-vault';
const VERSION = 1;
const enc = new TextEncoder();

export interface VaultKey {
  key: Uint8Array;
  salt: Uint8Array;
  cost: ScryptCost;
}

interface Stored {
  format: typeof FORMAT;
  version: typeof VERSION;
  kdf: { N: number; r: number; p: number; salt: string };
  nonce: string;
  data: string;
}

function aad(salt: string, c: ScryptCost): Uint8Array {
  return enc.encode(`${FORMAT}|${VERSION}|${c.N}|${c.r}|${c.p}|${salt}`);
}

export async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  cost: ScryptCost = SCRYPT,
): Promise<VaultKey> {
  if (salt.length !== SALT_BYTES) throw new Error('salt inválido');
  return { key: await deriveKey(passphrase, salt, cost.N, cost.r, cost.p), salt, cost };
}

export function sealVault(v: VaultKey, plain: Uint8Array, nonce: Uint8Array): string {
  if (nonce.length !== NONCE_BYTES) throw new Error('nonce inválido');
  const salt = bytesToHex(v.salt);
  const data = xchacha20poly1305(v.key, nonce, aad(salt, v.cost)).encrypt(plain);
  const out: Stored = {
    format: FORMAT,
    version: VERSION,
    kdf: { ...v.cost, salt },
    nonce: bytesToHex(nonce),
    data: bytesToHex(data),
  };
  return JSON.stringify(out);
}

function parse(text: string): Stored {
  const bad = new Error('Dados locais corrompidos.');
  let s: Stored;
  try {
    s = JSON.parse(text);
  } catch {
    throw bad;
  }
  // Only the production cost is accepted: the file is ours, not user input.
  const ok =
    s?.format === FORMAT &&
    s.version === VERSION &&
    s.kdf?.N === SCRYPT.N &&
    s.kdf.r === SCRYPT.r &&
    s.kdf.p === SCRYPT.p &&
    /^[0-9a-f]{32}$/.test(s.kdf.salt) &&
    /^[0-9a-f]{48}$/.test(s.nonce) &&
    /^([0-9a-f]{2})+$/.test(s.data);
  if (!ok) throw bad;
  return s;
}

/** Salt (and cost) needed to derive the key before the first open. */
export function readVaultHeader(text: string): { salt: Uint8Array; cost: ScryptCost } {
  const s = parse(text);
  return { salt: hexToBytes(s.kdf.salt), cost: { N: s.kdf.N, r: s.kdf.r, p: s.kdf.p } };
}

export function openVault(text: string, v: VaultKey): Uint8Array {
  const s = parse(text);
  try {
    return xchacha20poly1305(v.key, hexToBytes(s.nonce), aad(s.kdf.salt, v.cost)).decrypt(
      hexToBytes(s.data),
    );
  } catch {
    throw new Error('Senha incorreta.');
  }
}
