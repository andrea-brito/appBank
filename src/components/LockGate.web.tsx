import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MIN_PASSPHRASE_LENGTH } from '@/application/backup';
import { hasVault, unlockVault } from '@/data/db/client.web';

// Ask for the passphrase again after the page was hidden this long.
const RELOCK_AFTER_MS = 60_000;

/**
 * Web lock screen. Replaces Face ID: the passphrase IS the encryption key, so
 * it also unlocks (first run: creates) the encrypted local data. Same overlay
 * strategy as the native gate: children stay mounted while re-locked.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [creating] = useState(() => !hasVault());
  const [unlocked, setUnlocked] = useState(false);
  const [everUnlocked, setEverUnlocked] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const submit = useCallback(async () => {
    if (busy) return;
    if (creating && !everUnlocked) {
      if (pass.length < MIN_PASSPHRASE_LENGTH) {
        setError(`A senha precisa ter pelo menos ${MIN_PASSPHRASE_LENGTH} caracteres.`);
        return;
      }
      if (pass !== pass2) {
        setError('As senhas não conferem.');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await unlockVault(pass);
      setPass('');
      setPass2('');
      setUnlocked(true);
      setEverUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível desbloquear.');
    } finally {
      setBusy(false);
    }
  }, [busy, creating, everUnlocked, pass, pass2]);

  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current != null && Date.now() - hiddenAt.current >= RELOCK_AFTER_MS) {
        hiddenAt.current = null;
        setUnlocked(false);
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const firstRun = creating && !everUnlocked;

  return (
    <View style={styles.root}>
      <View
        style={styles.root}
        aria-hidden={!unlocked}
        pointerEvents={unlocked ? 'auto' : 'none'}
      >
        {everUnlocked && children}
      </View>
      {!unlocked && (
        <View style={styles.lock} accessibilityViewIsModal>
          <View style={styles.card}>
            <Text style={styles.icon}>🔒</Text>
            <Text style={styles.title}>{firstRun ? 'Crie sua senha' : 'appBank bloqueado'}</Text>
            {firstRun && (
              <Text style={styles.hint}>
                Ela protege e criptografa seus dados neste aparelho. Não há como recuperá-la: se
                esquecer, só o backup restaura. Faça backups com frequência.
              </Text>
            )}
            <TextInput
              style={styles.input}
              value={pass}
              onChangeText={setPass}
              placeholder="Senha"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={firstRun ? 'new-password' : 'current-password'}
              editable={!busy}
              onSubmitEditing={submit}
              accessibilityLabel="Senha"
            />
            {firstRun && (
              <TextInput
                style={styles.input}
                value={pass2}
                onChangeText={setPass2}
                placeholder="Repita a senha"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                editable={!busy}
                onSubmitEditing={submit}
                accessibilityLabel="Repita a senha"
              />
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={[styles.button, busy && styles.disabled]}
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{firstRun ? 'Criar e entrar' : 'Desbloquear'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  lock: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  card: { width: '100%', maxWidth: 400, gap: 12, alignItems: 'stretch' },
  icon: { fontSize: 48, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  hint: { color: '#6b7280', fontSize: 13, textAlign: 'center' },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, color: '#111827' },
  error: { color: '#ef4444', textAlign: 'center' },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 4,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
