import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { addExpense } from '@/application/addExpense';
import { categoriesQuery } from '@/data/transactionRepository';
import type { TransactionKind } from '@/domain/types';

export default function AddScreen() {
  const { data: categories } = useLiveQuery(categoriesQuery());
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const visibleCategories = (categories ?? []).filter((c) => c.kind === kind);

  async function handleSave() {
    setSaving(true);
    try {
      await addExpense({ amountText, kind, description, categoryId });
      router.back();
    } catch (e) {
      Alert.alert('Não foi possível salvar', e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.segment}>
        {(['expense', 'income'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setKind(k);
              setCategoryId(null);
            }}
            style={[styles.segmentItem, kind === k && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, kind === k && styles.segmentTextActive]}>
              {k === 'expense' ? 'Despesa' : 'Receita'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Valor</Text>
      <TextInput
        style={styles.amountInput}
        value={amountText}
        onChangeText={setAmountText}
        placeholder="0,00"
        keyboardType="decimal-pad"
        autoFocus
      />

      <Text style={styles.label}>Descrição</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="Ex: Mercado, Uber, Salário"
        maxLength={140}
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
          >
            <Text style={styles.categoryIcon}>{c.icon}</Text>
            <Text style={styles.categoryName}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 8 },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentItemActive: { backgroundColor: '#fff' },
  segmentText: { color: '#6b7280', fontWeight: '600' },
  segmentTextActive: { color: '#111827' },
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
});
