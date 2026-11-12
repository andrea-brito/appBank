import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ProgressBar';
import { allDepositsQuery } from '@/data/goalRepository';
import {
  categoriesQuery,
  deleteTransactionOrPurchase,
  monthTransactionsQuery,
} from '@/data/transactionRepository';
import type { TransactionRow } from '@/data/db/schema';
import { parseInstallment } from '@/domain/installments';
import { formatBRL, sumCents } from '@/domain/money';
import { buildMonthlyHistory, monthRange, spendByCategory } from '@/domain/monthlyHistory';

export default function MonthScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  // Untrusted route param: an invalid key falls back to an empty range.
  const range = useMemo(() => monthRange(String(key)) ?? { from: 0, to: -1 }, [key]);
  const { data: txns } = useLiveQuery(monthTransactionsQuery(range.from, range.to), [range.from, range.to]);
  const { data: categories } = useLiveQuery(categoriesQuery());
  const { data: deposits } = useLiveQuery(allDepositsQuery());

  const summary = useMemo(() => {
    const monthDeposits = (deposits ?? []).filter((d) => d.occurredAt >= range.from && d.occurredAt <= range.to);
    return buildMonthlyHistory(txns ?? [], monthDeposits, new Date(range.from)).past[0];
  }, [txns, deposits, range]);
  const byCategory = useMemo(() => spendByCategory(txns ?? []), [txns]);
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  if (range.to < range.from) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Mês inválido.</Text>
      </View>
    );
  }

  function confirmDelete(tx: TransactionRow) {
    const inst = parseInstallment(tx.description);
    const what = inst
      ? `a compra "${inst.base}" inteira (${inst.count} parcelas, de todos os meses)`
      : `"${tx.description || 'Sem descrição'}" (${formatBRL(tx.amountCents)})`;
    Alert.alert('Excluir lançamento', `Excluir ${what}? Não dá para desfazer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          deleteTransactionOrPurchase(tx).catch((e) =>
            Alert.alert('Não foi possível excluir', e instanceof Error ? e.message : 'Erro'),
          );
        },
      },
    ]);
  }

  const totalExpense = sumCents(byCategory.map((c) => c.totalCents));

  return (
    <>
      <Stack.Screen options={{ title: summary.label }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.grid}>
            <Cell label="Entradas" value={formatBRL(summary.incomeCents)} color="#16a34a" />
            <Cell label="Saídas" value={formatBRL(summary.expenseCents)} color="#dc2626" />
            <Cell
              label={summary.balanceCents >= 0 ? 'Sobrou' : 'Faltou'}
              value={formatBRL(Math.abs(summary.balanceCents))}
              color={summary.balanceCents >= 0 ? '#16a34a' : '#dc2626'}
            />
            <Cell label="Guardado em metas" value={formatBRL(summary.savedCents)} color="#4338ca" />
          </View>
        </View>

        {byCategory.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.section}>Para onde foi o dinheiro</Text>
            {byCategory.map((c) => {
              const cat = c.categoryId ? catMap.get(c.categoryId) : undefined;
              return (
                <View key={c.categoryId ?? 'none'} style={styles.catRow}>
                  <View style={styles.catHead}>
                    <Text style={styles.catName}>
                      {cat ? `${cat.icon} ${cat.name}` : '❔ Sem categoria'}
                    </Text>
                    <Text style={styles.catValue}>
                      {formatBRL(c.totalCents)} · {c.percent}%
                    </Text>
                  </View>
                  <ProgressBar ratio={totalExpense > 0 ? c.totalCents / totalExpense : 0} color={cat?.color ?? '#9ca3af'} />
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.section}>Lançamentos ({(txns ?? []).length})</Text>
        {(txns ?? []).length === 0 && <Text style={styles.empty}>Nenhum lançamento neste mês.</Text>}
        {(txns ?? []).map((t) => {
          const cat = t.categoryId ? catMap.get(t.categoryId) : undefined;
          return (
            <View key={t.id} style={styles.row}>
              <Pressable
                style={styles.rowTap}
                onPress={() => router.push({ pathname: '/add', params: { id: t.id } })}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${t.description || 'lançamento'}, ${formatBRL(t.amountCents)}`}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowDesc} numberOfLines={1}>
                    {cat?.icon ?? '•'} {t.description || 'Sem descrição'}
                  </Text>
                  <Text style={styles.rowDate}>{new Date(t.occurredAt).toLocaleDateString('pt-BR')}</Text>
                </View>
                <Text style={[styles.rowAmount, { color: t.kind === 'income' ? '#16a34a' : '#dc2626' }]}>
                  {t.kind === 'income' ? '+' : '-'}
                  {formatBRL(t.amountCents)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(t)}
                style={styles.delete}
                accessibilityRole="button"
                accessibilityLabel={`Excluir ${t.description || 'lançamento'}`}
                hitSlop={8}
              >
                <Text style={styles.deleteIcon}>🗑️</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cell: { width: '50%', gap: 2 },
  cellLabel: { color: '#6b7280', fontSize: 12 },
  cellValue: { fontSize: 16, fontWeight: '700' },
  section: { fontSize: 15, fontWeight: '700', color: '#374151' },
  catRow: { gap: 4 },
  catHead: { flexDirection: 'row', justifyContent: 'space-between' },
  catName: { color: '#111827', fontSize: 14 },
  catValue: { color: '#374151', fontSize: 13, fontWeight: '600' },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 8 },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowMain: { flex: 1, gap: 2 },
  rowDesc: { color: '#111827' },
  rowDate: { color: '#6b7280', fontSize: 12 },
  rowAmount: { fontWeight: '700' },
  delete: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  deleteIcon: { fontSize: 16 },
});
