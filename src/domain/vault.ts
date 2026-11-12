import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { deriveKey, NONCE_BYTES, SALT_BYTES, SCRYPT, type ScryptCost } from './backupCrypto';

/**
 * End-to-end encryption for the web build (data stored in Supabase).
 *
 * Envelope scheme, as in password managers:
 * - The data is sealed with a random DATA KEY (never changes).
 * - The data key is stored twice, each copy sealed ("wrapped") with a
 *   different key: one derived from the passphrase, one from the recovery key.
 * - Forgetting the passphrase: unwrap with the recovery key, re-wrap with a
 *   new passphrase. The data itself is not re-encrypted.
 * The server only ever sees sealed blobs. Pure compute: randomness injected.
 */

const FORMAT = 'appbank-vault';
const VERSION = 2;
const enc = new TextEncoder();

export const DATA_KEY_BYTES = 32;
export const RECOVERY_BYTES = 16; // 128 bits: random, so no slow KDF needed

/** Bound into each blob's authentication, so a blob can't be swapped for another kind. */
export type Purpose = 'data' | 'wrap-pass' | 'wrap-recovery';

interface Sealed {
  format: typeof FORMAT;
  version: typeof VERSION;
  purpose: Purpose;
  nonce: string;
  data: string;
}

export interface Account {
  email: string;
  /** Sent to Supabase Auth. Cannot be turned back into the passphrase key. */
  authPassword: string;
  /** Unwraps the data key. Never leaves the device. */
  kek: Uint8Array;
}

/**
 * One passphrase, two independent secrets: scrypt once (salt bound to the
 * e-mail, so it is known before login), then HKDF splits it into the login
 * password and the key-wrapping key. The server only sees the login one.
 */
export async function deriveAccount(
  email: string,
  passphrase: string,
  cost: ScryptCost = SCRYPT,
): Promise<Account> {
  const id = email.trim().toLowerCase();
  const salt = sha256(enc.encode(`appbank-account|${id}`)).slice(0, SALT_BYTES);
  const master = await deriveKey(passphrase, salt, cost.N, cost.r, cost.p);
  return {
    email: id,
    authPassword: bytesToHex(hkdf(sha256, master, undefined, enc.encode('appbank-login-v1'), 32)),
    kek: hkdf(sha256, master, undefined, enc.encode('appbank-kek-v1'), 32),
  };
}

function aad(purpose: Purpose): Uint8Array {
  return enc.encode(`${FORMAT}|${VERSION}|${purpose}`);
}

export function seal(key: Uint8Array, plain: Uint8Array, nonce: Uint8Array, purpose: Purpose): string {
  if (key.length !== 32) throw new Error('chave inválida');
  if (nonce.length !== NONCE_BYTES) throw new Error('nonce inválido');
  const data = xchacha20poly1305(key, nonce, aad(purpose)).encrypt(plain);
  const out: Sealed = { format: FORMAT, version: VERSION, purpose, nonce: bytesToHex(nonce), data: bytesToHex(data) };
  return JSON.stringify(out);
}

/** Throws 'Senha incorreta.' when the key is wrong or the blob was altered. */
export function open(key: Uint8Array, text: string, purpose: Purpose): Uint8Array {
  const bad = new Error('Dados corrompidos.');
  let s: Sealed;
  try {
    s = JSON.parse(text);
  } catch {
    throw bad;
  }
  const ok =
    s?.format === FORMAT &&
    s.version === VERSION &&
    s.purpose === purpose &&
    /^[0-9a-f]{48}$/.test(s.nonce) &&
    /^([0-9a-f]{2})+$/.test(s.data);
  if (!ok) throw bad;
  try {
    return xchacha20poly1305(key, hexToBytes(s.nonce), aad(purpose)).decrypt(hexToBytes(s.data));
  } catch {
    throw new Error('Senha incorreta.');
  }
}

/** "3F9A-07C2-..." : 32 hex digits in groups of 4, easy to write down. */
export function formatRecoveryKey(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_BYTES) throw new Error('chave de recuperação inválida');
  return bytesToHex(bytes).toUpperCase().match(/.{4}/g)!.join('-');
}

/**
 * Key-wrapping key from a typed recovery key. Forgiving with how it was
 * written down: case, spaces/dashes, and O/I/L typed for 0/1.
 */
export function recoveryKek(code: string): Uint8Array {
  const hex = code
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[\s-]/g, '');
  if (!/^[0-9A-F]+$/.test(hex) || hex.length !== RECOVERY_BYTES * 2) {
    throw new Error('Chave de recuperação inválida: confira se digitou os 32 caracteres.');
  }
  return hkdf(sha256, hexToBytes(hex.toLowerCase()), undefined, enc.encode('appbank-recovery-kek-v1'), 32);
}
