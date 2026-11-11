import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { db, schema } from '@/data/db/client';
import { categoriesQuery, recentTransactionsQuery } from '@/data/transactionRepository';
import { budgetStatus } from '@/domain/budgetStatus';
import { formatBRL, sumCents } from '@/domain/money';
import { currentMonth } from '@/domain/period';

export default function Dashboard() {
  const { data: txns } = useLiveQuery(recentTransactionsQuery(100));
  // Separate full-table query so budget alerts count every expense this month,
  // not just the 100 shown in the recent list.
  const { data: allTxns } = useLiveQuery(db.select().from(schema.transactions));
  const { data: categories } = useLiveQuery(categoriesQuery());
  const period = useMemo(() => currentMonth(), []);

  const monthTxns = (txns ?? []).filter(
    (t) => t.occurredAt >= period.from && t.occurredAt <= period.to,
  );
  const expenseCents = sumCents(
    monthTxns.filter((t) => t.kind === 'expense').map((t) => t.amountCents),
  );
  const incomeCents = sumCents(
    monthTxns.filter((t) => t.kind === 'income').map((t) => t.amountCents),
  );
  const balanceCents = incomeCents - expenseCents;

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
        <Text style={styles.title}>Este mês</Text>
        <View style={styles.cards}>
          <Stat label="Entradas" value={formatBRL(incomeCents)} color="#22c55e" />
          <Stat label="Saídas" value={formatBRL(expenseCents)} color="#ef4444" />
        </View>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Saldo</Text>
          <Text style={[styles.balanceValue, { color: balanceCents >= 0 ? '#22c55e' : '#ef4444' }]}>
            {formatBRL(balanceCents)}
          </Text>
        </View>

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
          <View style={styles.row}>
            <Text style={styles.rowDesc} numberOfLines={1}>
              {item.description || 'Sem descrição'}
            </Text>
            <Text style={[styles.rowAmount, { color: item.kind === 'income' ? '#22c55e' : '#ef4444' }]}>
              {item.kind === 'income' ? '+' : '-'}
              {formatBRL(item.amountCents)}
            </Text>
          </View>
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
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  cards: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4 },
  statLabel: { color: '#6b7280', fontSize: 13 },
  statValue: { fontSize: 18, fontWeight: '700' },
  balanceCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4 },
  balanceLabel: { color: '#6b7280', fontSize: 13 },
  balanceValue: { fontSize: 26, fontWeight: '800' },
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
