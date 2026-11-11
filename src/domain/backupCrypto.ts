import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Passphrase-encrypted backup envelope.
 *
 * Key = scrypt(passphrase, salt). Cipher = XChaCha20-Poly1305 (authenticated:
 * a wrong passphrase or any tampering makes decryption fail, never returns
 * garbage). The header fields are bound as associated data, so editing the
 * KDF parameters in the file also fails authentication.
 *
 * Pure compute, no I/O. Randomness (salt, nonce) is injected by the caller so
 * this stays testable and does not depend on a crypto polyfill in Hermes.
 */

const FORMAT = 'appbank-backup-encrypted';
const VERSION = 1;
const CIPHER = 'xchacha20poly1305';

// scrypt cost. N=2^15, r=8 -> ~32 MB of memory. Stored in the file so it can
// be raised later without breaking old backups.
export const SCRYPT = { N: 2 ** 15, r: 8, p: 1 };
export type ScryptCost = typeof SCRYPT;
// Accepted range when reading a file. The header is authenticated, so a weak N
// can't be forced onto a real backup; this only rejects nonsense and caps memory
// (N=2^16, r=8 is ~64 MB) against a hostile file.
const MIN_N = 2 ** 10;
const MAX_N = 2 ** 16;

export const SALT_BYTES = 16;
export const NONCE_BYTES = 24;

interface Envelope {
  format: typeof FORMAT;
  version: typeof VERSION;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  cipher: typeof CIPHER;
  nonce: string;
  data: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function header(e: Pick<Envelope, 'format' | 'version' | 'kdf' | 'cipher'>): Uint8Array {
  const { N, r, p, salt } = e.kdf;
  return enc.encode(`${e.format}|${e.version}|${e.kdf.name}|${N}|${r}|${p}|${salt}|${e.cipher}`);
}

async function deriveKey(passphrase: string, salt: Uint8Array, N: number, r: number, p: number) {
  // NFKC: the same typed passphrase gives the same bytes on any keyboard/OS.
  return scryptAsync(enc.encode(passphrase.normalize('NFKC')), salt, {
    N,
    r,
    p,
    dkLen: 32,
    asyncTick: 10, // yield to the UI thread so the screen does not freeze
  });
}

export async function encryptBackup(
  plaintext: string,
  passphrase: string,
  salt: Uint8Array,
  nonce: Uint8Array,
  cost: ScryptCost = SCRYPT, // tests pass a small N; the app always uses the default
): Promise<string> {
  if (salt.length !== SALT_BYTES) throw new Error('salt inválido');
  if (nonce.length !== NONCE_BYTES) throw new Error('nonce inválido');

  const meta: Pick<Envelope, 'format' | 'version' | 'kdf' | 'cipher'> = {
    format: FORMAT,
    version: VERSION,
    kdf: { name: 'scrypt', N: cost.N, r: cost.r, p: cost.p, salt: bytesToHex(salt) },
    cipher: CIPHER,
  };
  const key = await deriveKey(passphrase, salt, cost.N, cost.r, cost.p);
  const data = xchacha20poly1305(key, nonce, header(meta)).encrypt(enc.encode(plaintext));

  const envelope: Envelope = { ...meta, nonce: bytesToHex(nonce), data: bytesToHex(data) };
  return JSON.stringify(envelope);
}

export async function decryptBackup(fileText: string, passphrase: string): Promise<string> {
  const e = parseEnvelope(fileText);
  const key = await deriveKey(passphrase, hexToBytes(e.kdf.salt), e.kdf.N, e.kdf.r, e.kdf.p);
  try {
    const plain = xchacha20poly1305(key, hexToBytes(e.nonce), header(e)).decrypt(hexToBytes(e.data));
    return dec.decode(plain);
  } catch {
    throw new Error('Senha incorreta ou arquivo de backup corrompido.');
  }
}

function parseEnvelope(fileText: string): Envelope {
  const invalid = new Error('Este arquivo não é um backup do appBank.');
  let e: Envelope;
  try {
    e = JSON.parse(fileText);
  } catch {
    throw invalid;
  }
  const k = e?.kdf;
  const ok =
    e?.format === FORMAT &&
    e.version === VERSION &&
    e.cipher === CIPHER &&
    k?.name === 'scrypt' &&
    Number.isInteger(k.N) &&
    k.N >= MIN_N &&
    k.N <= MAX_N &&
    (k.N & (k.N - 1)) === 0 && // power of two
    k.r === 8 &&
    k.p >= 1 &&
    k.p <= 4 &&
    isHex(k.salt, SALT_BYTES) &&
    isHex(e.nonce, NONCE_BYTES) &&
    typeof e.data === 'string' &&
    /^([0-9a-f]{2})+$/.test(e.data);
  if (!ok) throw invalid;
  return e;
}

function isHex(v: unknown, bytes: number): v is string {
  return typeof v === 'string' && v.length === bytes * 2 && /^[0-9a-f]+$/.test(v);
}
