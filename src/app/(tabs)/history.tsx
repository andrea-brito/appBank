import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { db, schema } from '@/data/db/client';
import { allDepositsQuery } from '@/data/goalRepository';
import { formatBRL, sumCents } from '@/domain/money';
import {
  buildMonthlyHistory,
  buildYearlyHistory,
  type MonthSummary,
  type YearSummary,
} from '@/domain/monthlyHistory';

type View_ = 'months' | 'years';

const openMonth = (key: string) => router.push({ pathname: '/month/[key]', params: { key } });

export default function HistoryScreen() {
  const { data: txns } = useLiveQuery(db.select().from(schema.transactions));
  const { data: deposits } = useLiveQuery(allDepositsQuery());
  const [view, setView] = useState<View_>('months');

  const { past, upcoming } = useMemo(
    () => buildMonthlyHistory(txns ?? [], deposits ?? []),
    [txns, deposits],
  );
  const years = useMemo(() => buildYearlyHistory(past), [past]);
  const committedTotal = sumCents(upcoming.map((m) => m.expenseCents));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.segment} role="tablist">
          {(['months', 'years'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[styles.segmentItem, view === v && styles.segmentItemActive]}
              role="tab"
              accessibilityState={{ selected: view === v }}
            >
              <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
                {v === 'months' ? 'Meses' : 'Anos'}
              </Text>
            </Pressable>
          ))}
        </View>

        {upcoming.length > 0 && (
          <View style={styles.committedCard}>
            <Text style={styles.committedTitle}>💳 Já comprometido (parcelas)</Text>
            <Text style={styles.committedTotal}>{formatBRL(committedTotal)}</Text>
            {upcoming.map((m) => (
              <Pressable
                key={m.key}
                style={styles.committedRow}
                onPress={() => openMonth(m.key)}
                accessibilityRole="link"
                accessibilityLabel={`${m.label}: ${formatBRL(m.expenseCents)} comprometidos`}
              >
                <Text style={styles.committedMonth}>{m.label}</Text>
                <Text style={styles.committedValue}>{formatBRL(m.expenseCents)} ›</Text>
              </Pressable>
            ))}
          </View>
        )}

        {view === 'months'
          ? past.map((m, i) => <MonthCard key={m.key} month={m} current={i === 0} />)
          : years.map((y) => <YearCard key={y.year} year={y} />)}

        <Pressable
          style={styles.backupLink}
          onPress={() => router.push('/backup')}
          accessibilityRole="link"
        >
          <Text style={styles.backupText}>💾 Exportar ou restaurar backup</Text>
          <Text style={styles.backupHint}>
            Uma cópia em arquivo, para desfazer um erro ou se perder a senha e a chave de recuperação.
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MonthCard({ month: m, current }: { month: MonthSummary; current: boolean }) {
  const positive = m.balanceCents >= 0;
  // Share of income left over, integer percent (only meaningful with income).
  const rate = m.incomeCents > 0 ? Math.round((m.balanceCents * 100) / m.incomeCents) : null;

  return (
    <Pressable
      style={styles.card}
      onPress={() => openMonth(m.key)}
      accessibilityRole="link"
      accessibilityLabel={`Ver detalhes de ${m.label}`}
    >
      <View style={styles.cardHead}>
        <Text style={styles.month}>
          {m.label}
          {current ? ' · atual' : ''}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
      <View style={styles.grid}>
        <Cell label="Entradas" value={formatBRL(m.incomeCents)} color="#16a34a" />
        <Cell label="Saídas" value={formatBRL(m.expenseCents)} color="#dc2626" />
        <Cell
          label={positive ? 'Sobrou' : 'Faltou'}
          value={formatBRL(Math.abs(m.balanceCents))}
          color={positive ? '#16a34a' : '#dc2626'}
        />
        <Cell label="Guardado em metas" value={formatBRL(m.savedCents)} color="#4338ca" />
      </View>
      {rate != null && (
        <Text style={[styles.rate, { color: positive ? '#166534' : '#991b1b' }]}>
          {positive
            ? `Ficou livre ${rate}% do que entrou, já descontando o que foi para as metas.`
            : `Gastos + metas passaram ${-rate}% do que entrou.`}
        </Text>
      )}
    </Pressable>
  );
}

function YearCard({ year: y }: { year: YearSummary }) {
  const positive = y.balanceCents >= 0;
  // Bars are relative to the year's biggest month, so months compare at a glance.
  const max = Math.max(1, ...y.months.map((m) => Math.max(m.incomeCents, m.expenseCents)));
  const multi = y.months.length > 1;

  return (
    <View style={styles.card}>
      <Text style={styles.year} role="heading">
        {y.year}
      </Text>
      <View style={styles.grid}>
        <Cell label="Entradas" value={formatBRL(y.incomeCents)} color="#16a34a" />
        <Cell label="Saídas" value={formatBRL(y.expenseCents)} color="#dc2626" />
        <Cell
          label={positive ? 'Sobrou no ano' : 'Faltou no ano'}
          value={formatBRL(Math.abs(y.balanceCents))}
          color={positive ? '#16a34a' : '#dc2626'}
        />
        <Cell label="Guardado em metas" value={formatBRL(y.savedCents)} color="#4338ca" />
        <Cell label="Gasto médio por mês" value={formatBRL(y.avgExpenseCents)} color="#111827" />
      </View>
      {multi && (
        <View style={styles.highlights}>
          <Text style={styles.highlight}>
            🏆 Melhor mês: {y.best.label.split(' ')[0]} ({formatBRL(y.best.balanceCents)})
          </Text>
          <Text style={styles.highlight}>
            📉 Pior mês: {y.worst.label.split(' ')[0]} ({formatBRL(y.worst.balanceCents)})
          </Text>
        </View>
      )}

      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: '#86efac' }]} />
        <Text style={styles.legendText}>Entradas</Text>
        <View style={[styles.dot, { backgroundColor: '#fca5a5' }]} />
        <Text style={styles.legendText}>Saídas</Text>
      </View>
      {y.months.map((m) => (
        <Pressable
          key={m.key}
          style={styles.yearRow}
          onPress={() => openMonth(m.key)}
          accessibilityRole="link"
          accessibilityLabel={`${m.label}: entradas ${formatBRL(m.incomeCents)}, saídas ${formatBRL(m.expenseCents)}`}
        >
          <Text style={styles.yearMonth}>{m.label.slice(0, 3)}</Text>
          <View style={styles.bars}>
            <View style={[styles.bar, styles.barIncome, { width: `${(m.incomeCents / max) * 100}%` }]} />
            <View style={[styles.bar, styles.barExpense, { width: `${(m.expenseCents / max) * 100}%` }]} />
          </View>
          <Text style={[styles.yearBalance, { color: m.balanceCents >= 0 ? '#16a34a' : '#dc2626' }]}>
            {formatBRL(m.balanceCents)}
          </Text>
        </Pressable>
      ))}
    </View>
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
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  segment: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 10, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentItemActive: { backgroundColor: '#fff' },
  segmentText: { color: '#4b5563', fontWeight: '600' },
  segmentTextActive: { color: '#111827' },
  committedCard: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 16, gap: 6 },
  committedTitle: { color: '#3730a3', fontWeight: '700', fontSize: 14 },
  committedTotal: { color: '#312e81', fontWeight: '800', fontSize: 24, marginBottom: 4 },
  committedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  committedMonth: { color: '#3730a3' },
  committedValue: { color: '#312e81', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { fontSize: 16, fontWeight: '700', color: '#111827' },
  chevron: { fontSize: 22, color: '#9ca3af', lineHeight: 24 },
  year: { fontSize: 22, fontWeight: '800', color: '#111827' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cell: { width: '50%', gap: 2 },
  cellLabel: { color: '#6b7280', fontSize: 12 },
  cellValue: { fontSize: 16, fontWeight: '700' },
  rate: { fontSize: 13, fontWeight: '600' },
  highlights: { gap: 2 },
  highlight: { fontSize: 13, color: '#374151' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#6b7280', marginRight: 8 },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  yearMonth: { width: 34, fontSize: 13, color: '#374151', fontWeight: '600' },
  bars: { flex: 1, gap: 3 },
  bar: { height: 7, borderRadius: 4, minWidth: 2 },
  barIncome: { backgroundColor: '#86efac' },
  barExpense: { backgroundColor: '#fca5a5' },
  backupLink: { padding: 12, marginTop: 12, alignItems: 'center', gap: 4 },
  backupText: { color: '#4338ca', fontWeight: '600' },
  backupHint: { color: '#6b7280', fontSize: 12, textAlign: 'center' },
  yearBalance: { width: 104, textAlign: 'right', fontSize: 13, fontWeight: '700' },
});
