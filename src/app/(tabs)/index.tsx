import { addMonths } from 'date-fns';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { db, schema } from '@/data/db/client';
import { allDepositsQuery } from '@/data/goalRepository';
import { useQuotes } from '@/components/useQuotes';
import { alertsSupported, getRateAlert, type RateAlert } from '@/data/rateAlert';
import { canSignOut, signOut } from '@/data/session';
import { categoriesQuery, recentTransactionsQuery } from '@/data/transactionRepository';
import { budgetStatus } from '@/domain/budgetStatus';
import { centsToRate4, formatRate, FX_PAIR_LABEL, isAtOrBelowTarget, type FxPair, type Rate4 } from '@/domain/fx';
import { formatBRL, sumCents } from '@/domain/money';
import { availableCents } from '@/domain/monthlyHistory';
import { currentMonth } from '@/domain/period';

function confirmSignOut() {
  Alert.alert('Sair da conta', 'Seus dados ficam salvos no servidor. Para voltar, entre com seu e-mail e senha.', [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Sair',
      style: 'destructive',
      onPress: () => {
        signOut().catch((e) => Alert.alert('Não foi possível sair', e instanceof Error ? e.message : 'Erro'));
      },
    },
  ]);
}

/** The user's enabled rate alert, when the current rate is at or below its target (web only). */
function useFxHit(): { pair: FxPair; rate: Rate4; targetCents: number } | null {
  const quotes = useQuotes();
  const [alert, setAlert] = useState<RateAlert | null>(null);
  // Tabs stay mounted: re-read on every focus so a target saved on the Câmbio
  // screen shows up as soon as you come back to Resumo.
  useFocusEffect(
    useCallback(() => {
      if (alertsSupported) getRateAlert().then(setAlert, () => setAlert(null));
    }, []),
  );
  if (!alert?.enabled || !quotes) return null;
  const rate = quotes[alert.pair].ask;
  return isAtOrBelowTarget(rate, alert.targetCents) ? { pair: alert.pair, rate, targetCents: alert.targetCents } : null;
}

export default function Dashboard() {
  const period = useMemo(() => currentMonth(), []);
  const nextPeriod = useMemo(() => currentMonth(addMonths(new Date(), 1)), []);
  const { data: txns } = useLiveQuery(recentTransactionsQuery(100, period.to), [period.to]);
  // Full-table query: month totals and budget alerts must count every entry,
  // not just the 100 shown in the recent list.
  const { data: allTxns } = useLiveQuery(db.select().from(schema.transactions));
  const { data: categories } = useLiveQuery(categoriesQuery());
  const { data: deposits } = useLiveQuery(allDepositsQuery());
  const fxHit = useFxHit();

  const monthTxns = (allTxns ?? []).filter(
    (t) => t.occurredAt >= period.from && t.occurredAt <= period.to,
  );
  // Installments already scheduled for next month.
  const committedNextCents = sumCents(
    (allTxns ?? [])
      .filter((t) => t.kind === 'expense' && t.occurredAt >= nextPeriod.from && t.occurredAt <= nextPeriod.to)
      .map((t) => t.amountCents),
  );
  const expenseCents = sumCents(
    monthTxns.filter((t) => t.kind === 'expense').map((t) => t.amountCents),
  );
  const incomeCents = sumCents(
    monthTxns.filter((t) => t.kind === 'income').map((t) => t.amountCents),
  );
  // Net moved into goals this month (withdrawals are negative): not free to spend.
  const savedCents = sumCents(
    (deposits ?? []).filter((d) => d.occurredAt >= period.from && d.occurredAt <= period.to).map((d) => d.amountCents),
  );
  const balanceCents = availableCents(incomeCents, expenseCents, savedCents);

  // Budget alerts: categories at warning (>=70%) or over (>100%) this month.
  const alerts = useMemo(() => {
    const spend = new Map<string, number>();
    (allTxns ?? [])
      .filter(
        (t) =>
          t.kind === 'expense' &&
          t.categoryId != null &&
          t.occurredAt >= period.from &&
          t.occurredAt <= period.to,
      )
      .forEach((t) => spend.set(t.categoryId!, (spend.get(t.categoryId!) ?? 0) + t.amountCents));

    return (categories ?? [])
      .map((c) => ({ category: c, status: budgetStatus(spend.get(c.id) ?? 0, c.budgetCents) }))
      .filter((x) => x.status.level === 'warning' || x.status.level === 'over');
  }, [allTxns, categories, period]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Este mês</Text>
          {canSignOut && (
            <Pressable onPress={confirmSignOut} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.signOut}>Sair</Text>
            </Pressable>
          )}
          {/* Web saves to the server automatically; backup lives at the end of Histórico there. */}
          {Platform.OS !== 'web' && (
            <Link href="/backup" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="Backup" hitSlop={12}>
                <Text style={styles.backupIcon}>💾</Text>
              </Pressable>
            </Link>
          )}
        </View>
        <View style={styles.cards}>
          <Stat label="Entradas" value={formatBRL(incomeCents)} color="#22c55e" />
          <Stat label="Saídas" value={formatBRL(expenseCents)} color="#ef4444" />
        </View>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Disponível para gastar</Text>
          <Text style={[styles.balanceValue, { color: balanceCents >= 0 ? '#22c55e' : '#ef4444' }]}>
            {formatBRL(balanceCents)}
          </Text>
          {savedCents !== 0 && (
            <Text style={styles.savedNote}>
              {savedCents > 0
                ? `🐷 ${formatBRL(savedCents)} já foram para as metas este mês`
                : `🐷 ${formatBRL(-savedCents)} voltaram das metas este mês`}
            </Text>
          )}
        </View>

        {fxHit && (
          <Pressable style={styles.fxHit} onPress={() => router.push('/fx')} accessibilityRole="link">
            <Text style={styles.fxHitText}>
              💶 {FX_PAIR_LABEL[fxHit.pair]} a {formatRate(fxHit.rate)}: está no seu preço (até{' '}
              {formatRate(centsToRate4(fxHit.targetCents))}). Ver câmbio ›
            </Text>
          </Pressable>
        )}

        {committedNextCents > 0 && (
          <Link href="/history" asChild>
            <Pressable style={styles.committed} accessibilityRole="link">
              <Text style={styles.committedText}>
                💳 Mês que vem você já tem <Text style={styles.committedValue}>{formatBRL(committedNextCents)}</Text>{' '}
                comprometidos. Ver histórico ›
              </Text>
            </Pressable>
          </Link>
        )}

        {alerts.map(({ category, status }) => (
          <View
            key={category.id}
            style={[
              styles.alert,
              status.level === 'warning' ? styles.alertWarning : styles.alertOver,
            ]}
          >
            <Text style={styles.alertText}>
              {status.level === 'over' ? '🚫' : '⚠️'} {category.icon} {category.name}:{' '}
              {status.message}
            </Text>
          </View>
        ))}
      </View>

      <FlatList
        data={txns ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.sectionTitle}>Lançamentos recentes</Text>}
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhum lançamento ainda. Toque em + para começar.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/add', params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Editar ${item.description || 'lançamento'}, ${formatBRL(item.amountCents)}`}
          >
            <Text style={styles.rowDesc} numberOfLines={1}>
              {item.description || 'Sem descrição'}
            </Text>
            <Text style={[styles.rowAmount, { color: item.kind === 'income' ? '#22c55e' : '#ef4444' }]}>
              {item.kind === 'income' ? '+' : '-'}
              {formatBRL(item.amountCents)}
            </Text>
          </Pressable>
        )}
      />

      <Link href="/import" asChild>
        <Pressable style={StyleSheet.flatten([styles.fab, styles.fabSecondary])}>
          <Text style={styles.fabSecondaryText}>🧾</Text>
        </Pressable>
      </Link>

      <Link href="/add" asChild>
        <Pressable style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </Link>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backupIcon: { fontSize: 22 },
  signOut: { color: '#4338ca', fontSize: 15, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  cards: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4 },
  statLabel: { color: '#6b7280', fontSize: 13 },
  statValue: { fontSize: 18, fontWeight: '700' },
  balanceCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4 },
  balanceLabel: { color: '#6b7280', fontSize: 13 },
  balanceValue: { fontSize: 26, fontWeight: '800' },
  savedNote: { color: '#4338ca', fontSize: 13, fontWeight: '600', marginTop: 2 },
  committed: { backgroundColor: '#eef2ff', borderRadius: 10, padding: 12 },
  fxHit: { backgroundColor: '#dcfce7', borderRadius: 10, padding: 12 },
  fxHitText: { color: '#166534', fontSize: 13, fontWeight: '700' },
  committedText: { color: '#3730a3', fontSize: 13, fontWeight: '600' },
  committedValue: { fontWeight: '800' },
  alert: { borderRadius: 10, padding: 12 },
  alertWarning: { backgroundColor: '#fef3c7' },
  alertOver: { backgroundColor: '#fee2e2' },
  alertText: { fontSize: 13, fontWeight: '600', color: '#92400e' },
  list: { paddingHorizontal: 16, paddingBottom: 96, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 4 },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
  },
  rowDesc: { flex: 1, color: '#111827', marginRight: 12 },
  rowAmount: { fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36 },
  fabSecondary: { bottom: 100, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  fabSecondaryText: { fontSize: 26 },
});
