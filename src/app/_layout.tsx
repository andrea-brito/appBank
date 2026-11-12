import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import '@/webAlert';
import { LockGate } from '@/components/LockGate';
import { PwaHead } from '@/components/PwaHead';
import { db, initSecureDb } from '@/data/db/client';
import migrations from '@/data/db/migrations/migrations';
import { seedDefaultCategories } from '@/data/seed';

export default function RootLayout() {
  return (
    <View style={styles.page}>
      <PwaHead />
      {/* Phone-width column on large screens (web/tablet); no-op on phones. */}
      <View style={styles.column}>
        <Root />
      </View>
    </View>
  );
}

function Root() {
  // Unlock the encrypted DB before anything touches it. Until this resolves,
  // migrations and queries must not run.
  const [dbReady, setDbReady] = useState(false);
  const [secureError, setSecureError] = useState<string | null>(null);

  useEffect(() => {
    initSecureDb()
      .then(() => setDbReady(true))
      .catch((e) => setSecureError(e instanceof Error ? e.message : 'Erro de segurança'));
  }, []);

  if (secureError) {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.error}>{secureError}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loading}>Protegendo seus dados…</Text>
      </View>
    );
  }

  return (
    <LockGate>
      <AppContent />
    </LockGate>
  );
}

function AppContent() {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (success) {
      seedDefaultCategories()
        .then(() => setSeeded(true))
        .catch((e) => console.error('seed failed', e));
    }
  }, [success]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Erro ao preparar o banco: {error.message}</Text>
      </View>
    );
  }

  if (!success || !seeded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loading}>Preparando seus dados…</Text>
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add" options={{ presentation: 'modal', title: 'Novo lançamento' }} />
      <Stack.Screen name="goal-new" options={{ presentation: 'modal', title: 'Nova meta' }} />
      <Stack.Screen name="deposit" options={{ presentation: 'modal', title: 'Guardar na meta' }} />
      <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Importar boleto / PIX' }} />
      <Stack.Screen name="achievements" options={{ title: 'Conquistas' }} />
      <Stack.Screen name="month/[key]" options={{ title: 'Mês' }} />
      <Stack.Screen name="backup" options={{ presentation: 'modal', title: 'Backup' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#e5e7eb' },
  column: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  icon: { fontSize: 48 },
  loading: { color: '#6b7280' },
  error: { color: '#ef4444', textAlign: 'center' },
});
