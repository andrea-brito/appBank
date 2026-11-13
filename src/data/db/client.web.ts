import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { getRandomBytes } from 'expo-crypto';
import {
  addDatabaseChangeListener,
  backupDatabaseAsync,
  deserializeDatabaseAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';

import { NONCE_BYTES } from '@/domain/backupCrypto';
import {
  DATA_KEY_BYTES,
  deriveAccount,
  formatRecoveryKey,
  open,
  recoveryKek,
  RECOVERY_BYTES,
  seal,
} from '@/domain/vault';
import * as schema from './schema';

/**
 * Web build: the DB lives in memory; every change is sealed on the device
 * (domain/vault.ts) and uploaded as one encrypted row to Supabase
 * (supabase/schema.sql). Supabase only ever stores ciphertext.
 *
 * ponytail: needs a connection (no offline cache), and the whole DB is
 * uploaded on each save. Fine for a personal ledger; upgrade path is a local
 * encrypted cache + incremental sync.
 */
// The CSP (vercel.json) forbids eval. zod probes `new Function` once to pick a
// faster path; it falls back on its own, but the probe logs a CSP violation.
// jitless skips the probe so real violations are not drowned out.
z.config({ jitless: true });

const SAVE_DELAY_MS = 800;
const RETRY_MS = 10_000;
const EMAIL_KEY = 'appbank_email';

// Drizzle only uses expo-sqlite's *sync* API. On web each sync call busy-waits
// on the worker with a short timeout, so the first call (worker boot + wasm
// load) would time out. Open the DB async first; `db` is assigned once that
// resolves, and the root layout renders nothing that queries before then.
// ponytail: sync results go through a 1 MB shared buffer; a single query
// returning more than that fails. Upgrade path is paging large reads.
let expoDb: SQLiteDatabase;
export let db: ReturnType<typeof drizzle<typeof schema>>;
export { schema };

export async function initSecureDb(): Promise<void> {
  if (expoDb) return;
  expoDb = await openDatabaseAsync(':memory:', { enableChangeListener: true });
  db = drizzle(expoDb, { schema });
}

// Captured before the Supabase client reads (and clears) the URL fragment.
const startHash = typeof window === 'undefined' ? '' : window.location.hash;

/** Did the page open from a "reset password" e-mail link? */
export function recoveryLinkState(): 'none' | 'valid' | 'expired' {
  if (/type=recovery/.test(startHash)) return 'valid';
  if (/error_code=otp_expired|error=access_denied/.test(startHash)) return 'expired';
  return 'none';
}

let client: SupabaseClient | null = null;
/** The signed-in Supabase client (for other web-only data modules, e.g. rate alerts). */
export const supabase = (): SupabaseClient => sb();
function sb(): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase não configurado: defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  // No session is stored on the device: each visit logs in again from the
  // passphrase. detectSessionInUrl picks up the reset-password link.
  return (client ??= createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true },
  }));
}

/** Last e-mail used on this device (not secret), to prefill the lock screen. */
export function lastEmail(): string {
  return localStorage.getItem(EMAIL_KEY) ?? '';
}

interface Row {
  version: number;
  data: string;
  wrap_pass: string;
  wrap_recovery: string;
}

let dek: Uint8Array | null = null; // data key, memory only
let kek: Uint8Array | null = null; // passphrase key, memory only (re-lock check)
let version = 0; // row version on the server
let dirty = false;
let inFlight = false;
let conflict = false;
let warned = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();

const nonce = () => getRandomBytes(NONCE_BYTES);

function authError(message: string): Error {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return new Error('E-mail ou senha incorretos.');
  if (m.includes('already registered')) return new Error('Já existe uma conta com esse e-mail. Use "Entrar".');
  if (m.includes('not confirmed')) return new Error('Confirme seu e-mail (link enviado pelo Supabase) e depois entre.');
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return new Error('Criação de contas está desativada.');
  }
  if (m.includes('rate limit') || m.includes('security purposes')) {
    return new Error('Muitas tentativas. Espere alguns minutos e tente de novo.');
  }
  return new Error(`Não foi possível concluir: ${message}`);
}

function sameKey(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function fetchRow(): Promise<Row | null> {
  const { data, error } = await sb().from('vaults').select('version, data, wrap_pass, wrap_recovery').maybeSingle();
  if (error) throw new Error(`Não foi possível baixar seus dados: ${error.message}`);
  return data as Row | null;
}

async function loadData(key: Uint8Array, row: Row) {
  const tmp = await deserializeDatabaseAsync(open(key, row.data, 'data'));
  await backupDatabaseAsync({ sourceDatabase: tmp, destDatabase: expoDb });
  await tmp.closeAsync();
  dek = key;
  version = row.version;
}

/** First save of a new account: data key + both wraps. Returns the recovery key to show. */
async function createVault(passKek: Uint8Array): Promise<string> {
  const newDek = getRandomBytes(DATA_KEY_BYTES);
  const code = formatRecoveryKey(getRandomBytes(RECOVERY_BYTES));
  const { error } = await sb()
    .from('vaults')
    .insert({
      version: 1,
      data: seal(newDek, await expoDb.serializeAsync(), nonce(), 'data'),
      wrap_pass: seal(passKek, newDek, nonce(), 'wrap-pass'),
      wrap_recovery: seal(recoveryKek(code), newDek, nonce(), 'wrap-recovery'),
    });
  if (error) {
    throw new Error(
      error.code === '23505'
        ? 'Seus dados já existem no servidor. Recarregue a página e entre.'
        : `Não foi possível criar seus dados no servidor: ${error.message}`,
    );
  }
  dek = newDek;
  version = 1;
  return code;
}

/**
 * Logs in (or creates the account) and loads the encrypted data. Returns the
 * new recovery key when the vault was just created (must be shown once), else
 * null. After the first unlock, later calls only re-check the passphrase.
 */
export async function unlockVault(
  email: string,
  passphrase: string,
  mode: 'signin' | 'signup',
): Promise<string | null> {
  const acc = await deriveAccount(email, passphrase);

  if (kek) {
    if (!sameKey(acc.kek, kek)) throw new Error('Senha incorreta.');
    return null;
  }

  const auth = sb().auth;
  if (mode === 'signup') {
    const { data, error } = await auth.signUp({ email: acc.email, password: acc.authPassword });
    if (error) throw authError(error.message);
    if (!data.session) {
      throw new Error('Conta criada. Confirme o e-mail que o Supabase enviou e depois toque em "Entrar".');
    }
  } else {
    const { error } = await auth.signInWithPassword({ email: acc.email, password: acc.authPassword });
    if (error) throw authError(error.message);
  }
  localStorage.setItem(EMAIL_KEY, acc.email);

  const row = await fetchRow();
  let code: string | null = null;
  if (row) {
    await loadData(open(acc.kek, row.wrap_pass, 'wrap-pass'), row);
  } else {
    code = await createVault(acc.kek);
  }
  kek = acc.kek;
  startAutosave();
  return code;
}

/**
 * Pull changes made on another device. The page can stay alive for days (iOS
 * freezes it in the background), so the data loaded at login goes stale.
 * Local unsaved changes are pushed first; if the server then has a newer
 * version, it replaces the in-memory DB. Returns true when data changed (the
 * caller remounts the screens, since loading a DB this way does not notify
 * live queries).
 */
export async function syncFromServer(): Promise<boolean> {
  if (!dek || conflict) return false;
  if (dirty) flush();
  await saving;
  if (dirty || conflict) return false; // save failed or conflicted: keep local state

  let row: Row | null;
  try {
    row = await fetchRow();
  } catch {
    return false; // offline: keep what we have, try again next time
  }
  if (!row || row.version === version) return false;

  await loadData(dek, row);
  // Loading fires change events for every row; they arrive before the load
  // resolves, so cancel the save they scheduled (nothing changed locally).
  clearTimeout(timer);
  dirty = false;
  return true;
}

/**
 * Sign out: push pending changes first (refuse if they can't be saved, so
 * nothing is lost), end the Supabase session, then reload the page, which
 * drops the in-memory database and keys.
 */
export async function signOut(): Promise<void> {
  if (dirty) flush();
  await saving;
  if (dirty) {
    throw new Error('Há mudanças que ainda não foram salvas no servidor (sem internet?). Tente sair quando a conexão voltar.');
  }
  await sb().auth.signOut({ scope: 'local' }).catch(() => {}); // local session only; the page reload clears the rest
  window.location.replace('/');
}

/** Sends the Supabase "reset password" e-mail. The link reopens this app. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await sb().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/`,
  });
  if (error) throw authError(error.message);
}

/**
 * Opened from the reset link (session comes from the URL): the recovery key
 * unwraps the data key, which is re-wrapped with the new passphrase; then the
 * login password is updated. The data itself is untouched.
 */
export async function recoverAccount(code: string, newPassphrase: string): Promise<void> {
  const rKek = recoveryKek(code); // validates the format before any network call
  const {
    data: { session },
  } = await sb().auth.getSession();
  const email = session?.user.email;
  if (!email) throw new Error('O link de recuperação expirou. Peça um novo em "Esqueci a senha".');

  const row = await fetchRow();
  if (!row) throw new Error('Não há dados salvos nesta conta.');
  let key: Uint8Array;
  try {
    key = open(rKek, row.wrap_recovery, 'wrap-recovery');
  } catch {
    throw new Error('Chave de recuperação incorreta.');
  }

  const acc = await deriveAccount(email, newPassphrase);
  const { data: rows, error } = await sb()
    .from('vaults')
    .update({
      version: row.version + 1,
      wrap_pass: seal(acc.kek, key, nonce(), 'wrap-pass'),
      updated_at: new Date().toISOString(),
    })
    .eq('version', row.version)
    .select('version');
  if (error || !rows?.length) throw new Error('Não foi possível salvar a nova senha. Tente de novo.');

  // If this fails the wrap already uses the new passphrase but login doesn't:
  // repeating the recovery (new link + same recovery key) fixes it.
  const { error: authErr } = await sb().auth.updateUser({ password: acc.authPassword });
  if (authErr) {
    throw new Error(`A chave foi aceita, mas a nova senha não foi registrada (${authErr.message}). Peça um novo link e repita.`);
  }

  window.history.replaceState(null, '', window.location.pathname);
  await loadData(key, { ...row, version: row.version + 1 });
  kek = acc.kek;
  localStorage.setItem(EMAIL_KEY, email);
  startAutosave();
}

function startAutosave() {
  addDatabaseChangeListener(schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) flush();
  });
  // Unsaved changes: ask before closing the tab.
  addEventListener('beforeunload', (e) => {
    if (dirty || inFlight) e.preventDefault();
  });
}

function schedule() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY_MS);
}

function flush() {
  clearTimeout(timer);
  saving = saving.then(persist);
}

async function persist(): Promise<void> {
  if (!dek || conflict || !dirty) return;
  dirty = false;
  inFlight = true;
  try {
    const data = seal(dek, await expoDb.serializeAsync(), nonce(), 'data');
    const next = version + 1;
    // Optimistic lock: only overwrite the version we loaded. Zero rows back
    // means another device saved first.
    const { data: rows, error } = await sb()
      .from('vaults')
      .update({ version: next, data, updated_at: new Date().toISOString() })
      .eq('version', version)
      .select('version');
    if (error) throw error;
    if (!rows?.length) {
      conflict = true;
      alert(
        'Seus dados foram alterados em outro aparelho. As mudanças feitas aqui desde então NÃO foram ' +
          'salvas. Se quiser guardá-las, faça um backup agora; depois recarregue a página.',
      );
      return;
    }
    version = next;
    warned = false;
  } catch (e) {
    console.error('save failed', e);
    dirty = true;
    timer = setTimeout(flush, RETRY_MS);
    if (!warned) {
      warned = true; // one warning per outage, not one per change
      alert('Sem conexão com o servidor: suas últimas mudanças ainda não foram salvas. Vou tentar de novo.');
    }
  } finally {
    inFlight = false;
  }
}
