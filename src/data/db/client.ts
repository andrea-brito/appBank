import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { getOrCreateDbKey } from './secureKey';
import * as schema from './schema';

// Single shared connection. enableChangeListener powers useLiveQuery so the
// dashboard and lists re-render automatically when data changes.
const expoDb: SQLiteDatabase = openDatabaseSync('appbank.db', { enableChangeListener: true });

export const db = drizzle(expoDb, { schema });
export { schema };

let initialized = false;

/**
 * Unlock the encrypted database. MUST run before any query (the root layout
 * calls it before rendering the app). Applies the SQLCipher key, then verifies
 * encryption is actually active — if SQLCipher is NOT compiled into the binary
 * (e.g. Expo Go, or a build without `useSQLCipher`), PRAGMA key is silently
 * ignored and the data would be stored UNENCRYPTED. We refuse to continue in
 * that case rather than give a false sense of security.
 */
export async function initSecureDb(): Promise<void> {
  if (initialized) return;

  const key = await getOrCreateDbKey();
  // Escape single quotes defensively, though the key is hex-only.
  const safeKey = key.replace(/'/g, "''");
  await expoDb.execAsync(`PRAGMA key = '${safeKey}'`);

  const cipher = await expoDb.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (cipher == null) {
    throw new Error(
      'Criptografia (SQLCipher) não está ativa neste build. Rode um development build com ' +
        '`useSQLCipher` habilitado — o app não vai abrir sem criptografia para proteger seus dados.',
    );
  }

  // Confirm the key is correct and the DB is readable before proceeding.
  await expoDb.getFirstAsync('SELECT count(*) FROM sqlite_master');
  initialized = true;
}
