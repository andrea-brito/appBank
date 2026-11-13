import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { addCategory, deleteCategory, updateCategory } from '@/data/categoryRepository';
import type { CategoryRow } from '@/data/db/schema';
import { categoriesQuery } from '@/data/transactionRepository';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_NAME_MAX } from '@/domain/category';
import type { TransactionKind } from '@/domain/types';

type Form = { id: string | null; kind: TransactionKind; name: string; icon: string; color: string };

const blank = (kind: TransactionKind): Form => ({
  id: null,
  kind,
  name: '',
  icon: kind === 'expense' ? '🛒' : '💼',
  color: CATEGORY_COLORS[8],
});

export default function CategoriesScreen() {
  // ?kind=income opens straight into creating an income category.
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const { data: categories } = useLiveQuery(categoriesQuery());
  const [form, setForm] = useState<Form | null>(() =>
    kindParam === 'income' || kindParam === 'expense' ? blank(kindParam) : null,
  );
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      if (form.id) await updateCategory(form.id, form);
      else await addCategory(form);
      setForm(null);
    } catch (e) {
      Alert.alert('Não foi possível salvar', e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  }

  function remove(c: CategoryRow) {
    Alert.alert(
      'Excluir categoria',
      `Excluir "${c.name}"? Os lançamentos dela continuam, mas ficam "Sem categoria", e o orçamento dela é apagado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            deleteCategory(c.id)
              .then(() => setForm(null))
              .catch((e) => Alert.alert('Não foi possível excluir', e instanceof Error ? e.message : 'Erro'));
          },
        },
      ],
    );
  }

  const section = (kind: TransactionKind) => {
    const list = (categories ?? []).filter((c) => c.kind === kind);
    return (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle} role="heading">
            {kind === 'expense' ? 'Despesas' : 'Receitas'}
          </Text>
          <Pressable onPress={() => setForm(blank(kind))} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.addLink}>+ Nova</Text>
          </Pressable>
        </View>
        {list.length === 0 && <Text style={styles.empty}>Nenhuma categoria.</Text>}
        {list.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.row, form?.id === c.id && styles.rowActive]}
            onPress={() => setForm({ id: c.id, kind: c.kind, name: c.name, icon: c.icon, color: c.color })}
            accessibilityRole="button"
            accessibilityLabel={`Editar categoria ${c.name}`}
          >
            <View style={[styles.swatch, { backgroundColor: `${c.color}1a`, borderColor: c.color }]}>
              <Text style={styles.rowIcon}>{c.icon}</Text>
            </View>
            <Text style={styles.rowName}>{c.name}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {form && (
        <View style={styles.card}>
          <Text style={styles.formTitle}>
            {form.id ? 'Editar categoria' : `Nova categoria de ${form.kind === 'expense' ? 'despesa' : 'receita'}`}
          </Text>

          <View style={styles.preview}>
            <View style={[styles.swatchBig, { backgroundColor: `${form.color}1a`, borderColor: form.color }]}>
              <Text style={styles.previewIcon}>{form.icon || '❔'}</Text>
            </View>
            <TextInput
              style={styles.nameInput}
              value={form.name}
              onChangeText={(name) => set({ name })}
              placeholder="Nome, ex: Pets"
              maxLength={CATEGORY_NAME_MAX + 10}
              autoFocus={!form.id}
              accessibilityLabel="Nome da categoria"
            />
          </View>

          <Text style={styles.label}>Ícone</Text>
          <View style={styles.wrap}>
            {CATEGORY_ICONS.map((icon) => (
              <Pressable
                key={icon}
                onPress={() => set({ icon })}
                style={[styles.iconChip, form.icon === icon && { borderColor: form.color, backgroundColor: `${form.color}1a` }]}
                accessibilityRole="radio"
                accessibilityLabel={`Ícone ${icon}`}
                accessibilityState={{ selected: form.icon === icon }}
              >
                <Text style={styles.iconText}>{icon}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={form.icon}
            onChangeText={(icon) => set({ icon })}
            placeholder="ou digite/cole um emoji"
            maxLength={16}
            accessibilityLabel="Emoji da categoria"
          />

          <Text style={styles.label}>Cor</Text>
          <View style={styles.wrap}>
            {CATEGORY_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => set({ color })}
                style={[styles.colorDot, { backgroundColor: color }, form.color === color && styles.colorDotActive]}
                accessibilityRole="radio"
                accessibilityLabel={`Cor ${CATEGORY_COLORS.indexOf(color) + 1}`}
                accessibilityState={{ selected: form.color === color }}
              />
            ))}
          </View>

          <Pressable
            style={[styles.saveButton, saving && styles.disabled]}
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{saving ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Criar categoria'}</Text>
          </Pressable>
          <View style={styles.formActions}>
            <Pressable onPress={() => setForm(null)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.cancel}>Cancelar</Text>
            </Pressable>
            {form.id && (
              <Pressable
                onPress={() => {
                  const c = (categories ?? []).find((x) => x.id === form.id);
                  if (c) remove(c);
                }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.delete}>Excluir categoria</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {section('expense')}
      {section('income')}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatchBig: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  previewIcon: { fontSize: 26, lineHeight: 30 },
  nameInput: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 14, fontSize: 16, color: '#111827' },
  label: { color: '#374151', fontSize: 14, fontWeight: '600', marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChip: { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22, lineHeight: 26 },
  input: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827' },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: '#fff' },
  colorDotActive: { borderColor: '#111827' },
  saveButton: { backgroundColor: '#6366f1', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  formActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  cancel: { color: '#4b5563', fontWeight: '600' },
  delete: { color: '#b91c1c', fontWeight: '700' },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  addLink: { color: '#4338ca', fontWeight: '700', fontSize: 15 },
  empty: { color: '#6b7280' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 10 },
  rowActive: { borderWidth: 1.5, borderColor: '#6366f1' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rowIcon: { fontSize: 18, lineHeight: 22 },
  rowName: { flex: 1, color: '#111827', fontSize: 15 },
  chevron: { color: '#9ca3af', fontSize: 22, lineHeight: 24 },
});
