import { format } from 'date-fns';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { db, schema } from '@/data/db/client';
import { activeGoalsQuery, allDepositsQuery } from '@/data/goalRepository';
import { addAllocation, allocationsQuery, deleteAllocation } from '@/data/leftoverRepository';
import {
  ALLOCATION_LABEL,
  allocationsOf,
  checkAllocation,
  unallocated,
  type AllocationKind,
} from '@/domain/leftover';
import { formatBRL, maskCurrencyInput, parseToCents } from '@/domain/money';
import { buildMonthlyHistory } from '@/domain/monthlyHistory';
import { TEXT_MAX } from '@/domain/types';

const KINDS: AllocationKind[] = ['goal', 'carry', 'other'];

/** "Fechar o mês": say what was done with the money that was left over. */
export default function CloseMonthScreen() {
  const key = String(useLocalSearchParams<{ key: string }>().key);
  const { data: txns } = useLiveQuery(db.select().from(schema.transactions));
  const { data: deposits } = useLiveQuery(allDepositsQuery());
  const { data: allocations } = useLiveQuery(allocationsQuery());
  const { data: goals } = useLiveQuery(activeGoalsQuery());
  const goalName = useMemo(() => new Map((goals ?? []).map((g) => [g.id, g.name])), [goals]);

  const [kind, setKind] = useState<AllocationKind>('goal');
  const [goalId, setGoalId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const month = useMemo(
    () => buildMonthlyHistory(txns ?? [], deposits ?? []).past.find((m) => m.key === key),
    [txns, deposits, key],
  );
  const mine = allocationsOf(allocations ?? [], key);

  if (!month || key >= format(new Date(), 'yyyy-MM')) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Só dá para fechar um mês que já terminou.</Text>
      </View>
    );
  }

  const leftover = month.balanceCents;
  const remaining = unallocated(leftover, allocations ?? [], key);

  async function save(k: AllocationKind, amountCents: number) {
    const problem = checkAllocation(remaining, amountCents) ?? (k === 'goal' && !goalId ? 'Escolha a meta.' : null);
    if (problem) return Alert.alert('Não foi possível registrar', problem);
    setBusy(true);
    try {
      await addAllocation({ monthKey: key, kind: k, goalId, amountCents, note: note.trim() });
      setAmountText('');
      setNote('');
    } catch (e) {
      Alert.alert('Não foi possível registrar', e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(id: string, what: string) {
    Alert.alert('Remover destino', `Remover "${what}"? O valor volta para "sem destino".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          deleteAllocation(id).catch((e) => Alert.alert('Não foi possível remover', e instanceof Error ? e.message : 'Erro'));
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: `Fechar ${month.label}` }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Sobrou em {month.label}</Text>
          <Text style={styles.big}>{formatBRL(leftover)}</Text>
          <Text style={[styles.remaining, remaining < 0 && styles.over]}>
            {remaining < 0
              ? `Já destinado passa da sobra em ${formatBRL(-remaining)}. Remova ou ajuste um destino.`
              : remaining === 0
                ? 'Tudo tem destino.'
                : `Sem destino: ${formatBRL(remaining)} (continua no seu saldo, mas não sei para onde foi)`}
          </Text>
        </View>

        {mine.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.section}>Para onde foi</Text>
            {mine.map((a) => {
              const what =
                a.kind === 'goal'
                  ? `Meta: ${(a.goalId && goalName.get(a.goalId)) || 'meta arquivada'}`
                  : a.kind === 'other'
                    ? `Outro${a.note ? `: ${a.note}` : ''}`
                    : ALLOCATION_LABEL.carry;
              return (
                <View key={a.id} style={styles.row}>
                  <Text style={styles.rowText} numberOfLines={2}>
                    {what}
                  </Text>
                  <Text style={styles.rowAmount}>{formatBRL(a.amountCents)}</Text>
                  <Pressable onPress={() => confirmDelete(a.id, what)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remover ${what}`}>
                    <Text style={styles.delete}>🗑️</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {remaining > 0 && (
          <View style={styles.card}>
            <Text style={styles.section}>Destinar</Text>
            <View style={styles.chips}>
              {KINDS.map((k) => (
                <Pressable key={k} onPress={() => setKind(k)} style={[styles.chip, kind === k && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: kind === k }}>
                  <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>{ALLOCATION_LABEL[k]}</Text>
                </Pressable>
              ))}
            </View>

            {kind === 'goal' &&
              ((goals ?? []).length === 0 ? (
                <Text style={styles.hint}>Você ainda não tem metas ativas. Crie uma na aba Metas.</Text>
              ) : (
                <View style={styles.chips}>
                  {(goals ?? []).map((g) => (
                    <Pressable key={g.id} onPress={() => setGoalId(g.id)} style={[styles.chip, goalId === g.id && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: goalId === g.id }}>
                      <Text style={[styles.chipText, goalId === g.id && styles.chipTextOn]}>
                        {g.icon} {g.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}

            {kind === 'other' && (
              <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Ex.: presente, conserto do carro" maxLength={TEXT_MAX} />
            )}

            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={(t) => setAmountText(maskCurrencyInput(t))}
              placeholder={`${formatBRL(remaining)} (máx.)`}
              keyboardType="number-pad"
            />
            <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => save(kind, parseToCents(amountText))} accessibilityRole="button">
              <Text style={styles.buttonText}>Adicionar</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.buttonAlt, busy && styles.disabled]} disabled={busy} onPress={() => save('carry', remaining)} accessibilityRole="button">
              <Text style={[styles.buttonText, styles.buttonAltText]}>Deixar o resto na conta ({formatBRL(remaining)})</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.hint}>
          O que ficou na conta soma ao &quot;Disponível&quot; dos meses seguintes. O que foi para uma meta vira um depósito nela. &quot;Outro&quot; tira o
          valor do saldo (você gastou ou separou fora do app).
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#6b7280' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  label: { color: '#6b7280', fontSize: 13 },
  big: { fontSize: 28, fontWeight: '800', color: '#16a34a' },
  remaining: { color: '#4338ca', fontSize: 13, fontWeight: '600' },
  over: { color: '#dc2626' },
  section: { fontSize: 15, fontWeight: '700', color: '#374151' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1, color: '#111827' },
  rowAmount: { fontWeight: '700', color: '#111827' },
  delete: { fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#f3f4f6' },
  chipOn: { backgroundColor: '#4338ca' },
  chipText: { color: '#374151', fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  input: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  button: { backgroundColor: '#4338ca', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonAlt: { backgroundColor: '#eef2ff' },
  buttonAltText: { color: '#4338ca' },
  disabled: { opacity: 0.6 },
  hint: { color: '#6b7280', fontSize: 12 },
});
