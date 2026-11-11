import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Pressable, StyleSheet, Text, View } from 'react-native';

import { authenticate } from '@/data/auth';

interface Props {
  children: React.ReactNode;
}

/**
 * Blocks the app behind Face ID. Requires auth on launch and again whenever the
 * app returns to the foreground from background. If biometrics/passcode aren't
 * set up on the device, it lets the user through (nothing to authenticate
 * against) rather than locking them out permanently.
 */
export function LockGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);
  const prompting = useRef(false);

  const runAuth = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setError(null);
    try {
      const outcome = await authenticate();
      if (outcome === 'success' || outcome === 'unavailable') {
        setUnlocked(true);
      } else {
        setUnlocked(false);
        setError('Autenticação necessária para acessar seus dados.');
      }
    } finally {
      prompting.current = false;
    }
  }, []);

  // Initial unlock on mount.
  useEffect(() => {
    runAuth();
  }, [runAuth]);

  // Re-lock when returning to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (prev != null && /inactive|background/.test(prev) && next === 'active') {
        setUnlocked(false);
        runAuth();
      }
    });
    return () => sub.remove();
  }, [runAuth]);

  if (unlocked) return <>{children}</>;

  return (
    <View style={styles.lock}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.title}>appBank bloqueado</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={runAuth}>
        <Text style={styles.buttonText}>Desbloquear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  icon: { fontSize: 48 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  error: { color: '#ef4444', textAlign: 'center' },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
