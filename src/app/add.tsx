import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { addExpense } from '@/application/addExpense';
import { editTransaction } from '@/application/editTransaction';
import { goBack } from '@/components/HeaderCancel';
import {
  categoriesQuery,
  deleteTransactionOrPurchase,
  getTransaction,
} from '@/data/transactionRepository';
import type { TransactionRow } from '@/data/db/schema';
import { centsToInput, formatDateBR, maskDateInput, parseDateBR } from '@/domain/dates';
import {
  isValidInstallmentCount,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  parseInstallment,
  splitInstallments,
} from '@/domain/installments';
import { formatBRL, isValidCents, maskCurrencyInput, parseToCents } from '@/domain/money';
import { TEXT_MAX, type TransactionKind } from '@/domain/types';

/** New entry, or edit when opened with ?id=<transaction id>. */
export default function AddScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof id === 'string' && id !== '' ? id : null;

  const { data: categories } = useLiveQuery(categoriesQuery());
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dateText, setDateText] = useState(() => formatDateBR(Date.now()));
  const [saving, setSaving] = useState(false);

  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [countText, setCountText] = useState('');
  const [startNextMonth, setStartNextMonth] = useState(false);

  const [original, setOriginal] = useState<TransactionRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loaded = useRef(false);

  // Edit mode: load the entry once and prefill the form.
  useEffect(() => {
    if (!editingId || loaded.current) return;
    loaded.current = true;
    getTransaction(editingId)
      .then((tx) => {
        if (!tx) {
          setLoadError('Lançamento não encontrado.');
          return;
        }
        setOriginal(tx);
        setKind(tx.kind);
        setAmountText(centsToInput(tx.amountCents));
        setDescription(parseInstallment(tx.description)?.base ?? tx.description);
        setCategoryId(tx.categoryId);
        setDateText(formatDateBR(tx.occurredAt));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, [editingId]);

  const installment = original ? parseInstallment(original.description) : null;
  const visibleCategories = (categories ?? []).filter((c) => c.kind === kind);
  const parcelled = !editingId && kind === 'expense' && installmentsOn;
  const count = Number(countText);

  // Live "10x de R$ 150,00" preview; nothing shown until the input is valid.
  const preview = useMemo(() => {
    const total = parseToCents(amountText);
    if (!parcelled || !isValidInstallmentCount(count) || !isValidCents(total) || total <= 0) return null;
    const parts = splitInstallments(total, count);
    return parts[0] === parts[1]
      ? `${count}x de ${formatBRL(parts[1])}`
      : `1x de ${formatBRL(parts[0])} + ${count - 1}x de ${formatBRL(parts[1])}`;
  }, [parcelled, count, amountText]);

  /** Date field -> epoch ms. Unchanged date keeps the exact original time (list order). */
  function occurredAt(): number {
    const today = formatDateBR(Date.now());
    if (original && dateText.trim() === formatDateBR(original.occurredAt)) return original.occurredAt;
    if (!original && dateText.trim() === today) return Date.now();
    const ms = parseDateBR(dateText);
    if (ms == null) throw new Error('Data inválida. Use o formato dd/mm/aaaa, ex: 05/03/2026.');
    return ms;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const when = occurredAt();
      if (editingId) {
        await editTransaction({ id: editingId, amountText, kind, description, categoryId, occurredAt: when });
      } else {
        if (parcelled && !isValidInstallmentCount(count)) {
          throw new Error(`Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`);
        }
        await addExpense({
          amountText,
          kind,
          description,
          categoryId,
          occurredAt: when,
          installments: parcelled ? { count, startNextMonth } : null,
        });
      }
      goBack();
    } catch (e) {
      Alert.alert('Não foi possível salvar', e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!original) return;
    const what = installment
      ? `a compra "${installment.base}" inteira (${installment.count} parcelas, de todos os meses)`
      : `"${original.description || 'Sem descrição'}" (${formatBRL(original.amountCents)})`;
    Alert.alert('Excluir lançamento', `Excluir ${what}? Não dá para desfazer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          deleteTransactionOrPurchase(original)
            .then(() => goBack())
            .catch((e) => Alert.alert('Não foi possível excluir', e instanceof Error ? e.message : 'Erro'));
        },
      },
    ]);
  }

  const title = !editingId
    ? 'Novo lançamento'
    : installment
      ? `Editar parcela ${installment.index + 1}/${installment.count}`
      : 'Editar lançamento';

  if (editingId && !original) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        {loadError ? <Text style={styles.error}>{loadError}</Text> : <ActivityIndicator size="large" />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />

      {installment && (
        <Text style={styles.hint}>
          Descrição e categoria mudam em todas as {installment.count} parcelas. Valor e data mudam só nesta.
        </Text>
      )}

      <View style={styles.segment}>
        {(['expense', 'income'] as const).map((k) => {
          const locked = installment != null && k === 'income';
          return (
            <Pressable
              key={k}
              disabled={locked}
              onPress={() => {
                setKind(k);
                setCategoryId(null);
              }}
              style={[styles.segmentItem, kind === k && styles.segmentItemActive, locked && styles.disabled]}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k, disabled: locked }}
            >
              <Text style={[styles.segmentText, kind === k && styles.segmentTextActive]}>
                {k === 'expense' ? 'Despesa' : 'Receita'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>
        {parcelled ? 'Valor total da compra' : installment ? 'Valor desta parcela' : 'Valor'}
      </Text>
      <TextInput
        style={styles.amountInput}
        value={amountText}
        onChangeText={(t) => setAmountText(maskCurrencyInput(t))}
        placeholder="0,00"
        keyboardType="number-pad"
        autoFocus={!editingId}
        accessibilityLabel="Valor"
      />

      {!editingId && kind === 'expense' && (
        <View style={styles.installmentsBox}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Parcelado no cartão</Text>
            <Switch
              value={installmentsOn}
              onValueChange={setInstallmentsOn}
              accessibilityLabel="Parcelado no cartão"
              trackColor={{ true: '#6366f1' }}
            />
          </View>
          {installmentsOn && (
            <>
              <Text style={styles.label}>Número de parcelas</Text>
              <TextInput
                style={styles.input}
                value={countText}
                onChangeText={(t) => setCountText(t.replace(/\D/g, '').slice(0, 2))}
                placeholder="Ex: 10"
                keyboardType="number-pad"
                accessibilityLabel="Número de parcelas"
              />
              <Text style={styles.label}>Primeira parcela</Text>
              <View style={styles.segment}>
                {([false, true] as const).map((next) => (
                  <Pressable
                    key={String(next)}
                    onPress={() => setStartNextMonth(next)}
                    style={[styles.segmentItem, startNextMonth === next && styles.segmentItemActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: startNextMonth === next }}
                  >
                    <Text style={[styles.segmentText, startNextMonth === next && styles.segmentTextActive]}>
                      {next ? 'Mês que vem' : 'Este mês'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {preview && <Text style={styles.preview}>{preview}</Text>}
            </>
          )}
        </View>
      )}

      <Text style={styles.label}>{parcelled ? 'Data da compra' : 'Data'}</Text>
      <TextInput
        style={styles.input}
        value={dateText}
        onChangeText={(t) => setDateText(maskDateInput(t))}
        placeholder="dd/mm/aaaa"
        keyboardType="number-pad"
        maxLength={10}
        accessibilityLabel="Data, no formato dia barra mês barra ano"
      />

      <Text style={styles.label}>Descrição</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="Ex: Mercado, Uber, Salário"
        maxLength={TEXT_MAX}
        accessibilityLabel="Descrição"
      />

      <Text style={styles.label}>Categoria</Text>
      <View style={styles.categoryGrid}>
        {visibleCategories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCategoryId(c.id === categoryId ? null : c.id)}
            style={[
              styles.categoryChip,
              categoryId === c.id && { borderColor: c.color, backgroundColor: `${c.color}1a` },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: categoryId === c.id }}
          >
            <Text style={styles.categoryIcon}>{c.icon}</Text>
            <Text style={styles.categoryName}>{c.name}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => router.push({ pathname: '/categories', params: { kind } })}
          style={[styles.categoryChip, styles.newCategoryChip]}
          accessibilityRole="button"
          accessibilityLabel="Criar nova categoria"
        >
          <Text style={styles.newCategoryText}>+ Nova</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>{saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar'}</Text>
      </Pressable>

      {original && (
        <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={saving} accessibilityRole="button">
          <Text style={styles.deleteText}>{installment ? 'Excluir compra inteira' : 'Excluir lançamento'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#b91c1c', textAlign: 'center' },
  hint: { backgroundColor: '#eef2ff', color: '#3730a3', borderRadius: 10, padding: 12, fontSize: 13 },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentItemActive: { backgroundColor: '#fff' },
  segmentText: { color: '#4b5563', fontWeight: '600' },
  segmentTextActive: { color: '#111827' },
  disabled: { opacity: 0.4 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600', marginTop: 8 },
  amountInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, color: '#111827' },
  installmentsBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8, marginTop: 8 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { color: '#111827', fontSize: 15, fontWeight: '600' },
  preview: { color: '#4338ca', fontWeight: '700', fontSize: 15, marginTop: 4 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  newCategoryChip: { borderStyle: 'dashed', borderColor: '#a5b4fc' },
  newCategoryText: { color: '#4338ca', fontSize: 13, fontWeight: '700' },
  categoryIcon: { fontSize: 16 },
  categoryName: { color: '#374151', fontSize: 13 },
  saveButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteButton: { padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: '#fecaca' },
  deleteText: { color: '#b91c1c', fontSize: 15, fontWeight: '700' },
});
