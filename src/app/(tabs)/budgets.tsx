import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { setBudgetUseCase } from '@/application/setBudget';
import { ProgressBar } from '@/components/ProgressBar';
import { db, schema } from '@/data/db/client';
import { budgetStatus } from '@/domain/budgetStatus';
import { formatBRL, formatCentsInput, maskCurrencyInput } from '@/domain/money';
import { currentMonth } from '@/domain/period';

export default function BudgetsScreen() {
  const { data: categories } = useLiveQuery(db.select().from(schema.categories));
  const { data: txns } = useLiveQuery(db.select().from(schema.transactions));
  const period = useMemo(() => currentMonth(), []);

  // Spend per category this month, integer cents.
  const spendByCat = useMemo(() => {
    const m = new Map<string, number>();
    (txns ?? [])
      .filter(
        (t) =>
          t.kind === 'expense' &&
          t.categoryId != null &&
          t.occurredAt >= period.from &&
          t.occurredAt <= period.to,
      )
      .forEach((t) => m.set(t.categoryId!, (m.get(t.categoryId!) ?? 0) + t.amountCents));
    return m;
  }, [txns, period]);

  const expenseCategories = (categories ?? []).filter((c) => c.kind === 'expense');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Orçamento mensal</Text>
          <Pressable onPress={() => router.push('/categories')} accessibilityRole="link" hitSlop={8}>
            <Text style={styles.manage}>Gerenciar categorias</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Defina um limite por categoria. Avisamos se estourar.</Text>

        {expenseCategories.map((c) => {
          const spent = spendByCat.get(c.id) ?? 0;
          const status = budgetStatus(spent, c.budgetCents);
          return (
            <BudgetRow
              key={c.id}
              categoryId={c.id}
              icon={c.icon}
              name={c.name}
              // Bar keeps the category color until warning/over recolors it.
              color={status.level === 'ok' || status.level === 'none' ? c.color : status.color}
              spent={spent}
              budget={c.budgetCents}
              ratio={status.ratio}
              message={status.message}
              level={status.level}
            />
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function BudgetRow({
  categoryId,
  icon,
  name,
  color,
  spent,
  budget,
  ratio,
  message,
  level,
}: {
  categoryId: string;
  icon: string;
  name: string;
  color: string;
  spent: number;
  budget: number | null;
  ratio: number;
  message: string | null;
  level: 'none' | 'ok' | 'warning' | 'over';
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(budget != null ? formatCentsInput(budget) : '');

  async function save() {
    try {
      await setBudgetUseCase({ categoryId, budgetText: text });
      setEditing(false);
    } catch (e) {
      Alert.alert('Valor inválido', e instanceof Error ? e.message : 'Erro');
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.catName}>
          {icon} {name}
        </Text>
        <Pressable onPress={() => setEditing((v) => !v)}>
          <Text style={styles.editLink}>{budget == null ? '+ definir' : 'editar'}</Text>
        </Pressable>
      </View>

      {budget != null && (
        <>
          <ProgressBar ratio={ratio} color={color} />
          <View style={styles.row}>
            <Text style={styles.spent}>{formatBRL(spent)} gastos</Text>
            <Text style={[styles.budget, level === 'over' && styles.overText]}>
              limite {formatBRL(budget)}
            </Text>
          </View>
          {message && (
            <Text
              style={[
                styles.alert,
                level === 'warning' ? styles.alertWarning : styles.alertOver,
              ]}
            >
              {level === 'over' ? '🚫 ' : '⚠️ '}
              {message}
            </Text>
          )}
        </>
      )}

      {editing && (
        <View style={styles.editRow}>
          <TextInput
            style={styles.editInput}
            value={text}
            onChangeText={(t) => setText(maskCurrencyInput(t))}
            placeholder="0,00 (vazio = remover)"
            keyboardType="number-pad"
            autoFocus
          />
          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>OK</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  manage: { color: '#4338ca', fontSize: 14, fontWeight: '700' },
  subtitle: { color: '#6b7280', fontSize: 13, marginTop: -6 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  editLink: { color: '#6366f1', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  spent: { color: '#374151', fontSize: 13 },
  budget: { color: '#6b7280', fontSize: 13 },
  overText: { color: '#ef4444', fontWeight: '700' },
  alert: { fontSize: 13, fontWeight: '600', borderRadius: 8, padding: 8, overflow: 'hidden' },
  alertWarning: { backgroundColor: '#fef3c7', color: '#92400e' },
  alertOver: { backgroundColor: '#fee2e2', color: '#991b1b' },
  editRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editInput: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#111827',
  },
  saveBtn: { backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
