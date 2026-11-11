import { getRandomBytes } from 'expo-crypto';

import { readSnapshot, restoreSnapshot, type RestoreResult } from '@/data/backupRepository';
import { buildBackup, parseBackup } from '@/domain/backup';
import { decryptBackup, encryptBackup, NONCE_BYTES, SALT_BYTES } from '@/domain/backupCrypto';

export const MIN_PASSPHRASE_LENGTH = 8;

/** Snapshot the database and return the encrypted backup file contents. */
export async function createBackup(passphrase: string): Promise<string> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`A senha do backup precisa ter pelo menos ${MIN_PASSPHRASE_LENGTH} caracteres.`);
  }
  const snapshot = await readSnapshot();
  const plaintext = JSON.stringify(buildBackup(snapshot));
  // Fresh salt and nonce for every backup (never reuse a nonce with the same key).
  return encryptBackup(plaintext, passphrase, getRandomBytes(SALT_BYTES), getRandomBytes(NONCE_BYTES));
}

/** Decrypt, validate and merge a backup file into the database. */
export async function restoreBackup(fileText: string, passphrase: string): Promise<RestoreResult> {
  const plaintext = await decryptBackup(fileText, passphrase);
  const backup = parseBackup(plaintext);
  return restoreSnapshot(backup.data);
}
