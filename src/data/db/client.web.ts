import { getRandomBytes } from 'expo-crypto';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import {
  addDatabaseChangeListener,
  backupDatabaseAsync,
  deserializeDatabaseAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';

import { NONCE_BYTES, SALT_BYTES } from '@/domain/backupCrypto';
import { deriveVaultKey, openVault, readVaultHeader, sealVault, type VaultKey } from '@/domain/vault';
import * as schema from './schema';

/**
 * Web build: no SQLCipher / Keychain, so the DB lives in memory and is saved
 * as one encrypted blob (see domain/vault.ts) in localStorage. The key comes
 * from the user's passphrase and only ever exists in memory.
 */
const STORE_KEY = 'appbank_vault_v1';
const SAVE_DELAY_MS = 800;

// Drizzle only uses expo-sqlite's *sync* API. On web each sync call busy-waits
// on the worker with a short timeout, so the first call (worker boot + wasm
// load) would time out. Open the DB async first; `db` is assigned once that
// resolves, and the root layout renders nothing that queries before then.
// ponytail: sync results go through a 1 MB shared buffer; a single query
// returning more than that fails. Fine for a personal ledger; upgrade path is
// paging large reads.
let expoDb: SQLiteDatabase;
export let db: ReturnType<typeof drizzle<typeof schema>>;
export { schema };

export async function initSecureDb(): Promise<void> {
  if (expoDb) return;
  expoDb = await openDatabaseAsync(':memory:', { enableChangeListener: true });
  db = drizzle(expoDb, { schema });
}

let vault: VaultKey | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();
let warned = false;

export function hasVault(): boolean {
  return localStorage.getItem(STORE_KEY) != null;
}

/**
 * First run: sets the passphrase and creates the vault.
 * Later runs: derives the key, decrypts and loads the data. On the first
 * unlock in a session it loads the DB; afterwards it only re-verifies the
 * passphrase (used when the screen re-locks).
 * Throws 'Senha incorreta.' on a wrong passphrase.
 */
export async function unlockVault(passphrase: string): Promise<void> {
  const stored = localStorage.getItem(STORE_KEY);

  if (stored == null) {
    vault = await deriveVaultKey(passphrase, getRandomBytes(SALT_BYTES));
    startAutosave();
    await persist();
    // Ask the browser not to evict this data under storage pressure.
    void navigator.storage?.persist?.();
    return;
  }

  const { salt, cost } = readVaultHeader(stored);
  const key = await deriveVaultKey(passphrase, salt, cost);
  const bytes = openVault(stored, key); // throws on a wrong passphrase
  if (vault) return; // re-lock check only: data is already loaded

  const tmp = await deserializeDatabaseAsync(bytes);
  await backupDatabaseAsync({ sourceDatabase: tmp, destDatabase: expoDb });
  await tmp.closeAsync();
  vault = key;
  startAutosave();
}

function startAutosave() {
  addDatabaseChangeListener(schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  addEventListener('pagehide', flush);
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY_MS);
}

function flush() {
  clearTimeout(timer);
  saving = saving.then(persist);
}

async function persist(): Promise<void> {
  if (!vault) return;
  try {
    const bytes = await expoDb.serializeAsync();
    localStorage.setItem(STORE_KEY, sealVault(vault, bytes, getRandomBytes(NONCE_BYTES)));
  } catch (e) {
    console.error('save failed', e);
    if (!warned) {
      warned = true; // one warning, not one per keystroke
      alert('Não foi possível salvar seus dados neste aparelho. Faça um backup agora.');
    }
  }
}
