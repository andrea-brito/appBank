import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db, schema } from '@/data/db/client';
import { allDepositsQuery } from '@/data/goalRepository';
import { categoriesQuery } from '@/data/transactionRepository';
import { printHtml, saveTextFile } from '@/data/webFiles';
import { buildMonthlyHistory, buildYearlyHistory } from '@/domain/monthlyHistory';
import { buildReport, periodRange, toCsv, toHtml } from '@/domain/report';

/** Month or year report, as a spreadsheet (CSV) or a printable page (PDF). */
export default function ReportScreen() {
  const { data: txns } = useLiveQuery(db.select().from(schema.transactions));
  const { data: deposits } = useLiveQuery(allDepositsQuery());
  const { data: categories } = useLiveQuery(categoriesQuery());
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [picked, setPicked] = useState<string | null>(null);

  const { past } = useMemo(() => buildMonthlyHistory(txns ?? [], deposits ?? []), [txns, deposits]);
  const options = useMemo(
    () =>
      mode === 'month'
        ? past.map((m) => ({ key: m.key, label: m.label }))
        : buildYearlyHistory(past).map((y) => ({ key: String(y.year), label: String(y.year) })),
    [mode, past],
  );
  // The pick only counts while it belongs to the current list (month/year switch).
  const key = options.find((o) => o.key === picked)?.key ?? options[0]?.key;

  function report() {
    const range = key ? periodRange(key) : null;
    return range ? buildReport(txns ?? [], deposits ?? [], categories ?? [], range) : null;
  }

  async function exportCsv() {
    const r = report();
    if (!r || !key) return;
    if (r.rows.length === 0) return Alert.alert('Sem lançamentos', 'Esse período não tem lançamentos para exportar.');
    await saveTextFile(`appbank-${key}.csv`, toCsv(r));
  }

  function exportPdf() {
    const r = report();
    if (!r) return;
    if (r.rows.length === 0) return Alert.alert('Sem lançamentos', 'Esse período não tem lançamentos para exportar.');
    printHtml(toHtml(r));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.segment} role="tablist">
        {(['month', 'year'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.segmentItem, mode === m && styles.segmentItemActive]}
            role="tab"
            accessibilityState={{ selected: mode === m }}
          >
            <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>{m === 'month' ? 'Mês' : 'Ano'}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => setPicked(o.key)}
            style={styles.option}
            accessibilityRole="radio"
            accessibilityState={{ selected: o.key === key }}
          >
            <Text style={styles.radio}>{o.key === key ? '◉' : '○'}</Text>
            <Text style={styles.optionText}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.button} onPress={exportCsv} accessibilityRole="button">
        <Text style={styles.buttonText}>📊 Baixar planilha (CSV)</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.buttonAlt]} onPress={exportPdf} accessibilityRole="button">
        <Text style={[styles.buttonText, styles.buttonAltText]}>📄 Gerar PDF</Text>
      </Pressable>
      <Text style={styles.hint}>
        O CSV abre no Excel e no Google Planilhas (separado por ponto e vírgula). No PDF, escolha &quot;Salvar como PDF&quot; na janela de
        impressão. O arquivo fica no seu aparelho e não é cifrado: guarde com cuidado.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  segment: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 10, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentItemActive: { backgroundColor: '#fff' },
  segmentText: { color: '#6b7280', fontWeight: '600' },
  segmentTextActive: { color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  radio: { color: '#4338ca', fontSize: 16 },
  optionText: { color: '#111827', fontSize: 15 },
  button: { backgroundColor: '#4338ca', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonAlt: { backgroundColor: '#eef2ff' },
  buttonAltText: { color: '#4338ca' },
  hint: { color: '#6b7280', fontSize: 12 },
});
