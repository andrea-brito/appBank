import { addMonths } from 'date-fns';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createGoalUseCase, updateGoalUseCase } from '@/application/manageGoals';
import { goBack } from '@/components/HeaderCancel';
import { deleteGoal, getGoal } from '@/data/goalRepository';
import { CATEGORY_COLORS, GOAL_ICONS } from '@/domain/category';
import { centsToInput, formatDateBR, maskDateInput, parseDateBR } from '@/domain/dates';
import type { GoalCurrency } from '@/domain/fx';
import { parseGoalPeriod } from '@/domain/goal';
import { maskCurrencyInput } from '@/domain/money';
import { TEXT_MAX } from '@/domain/types';

const CURRENCIES: { value: GoalCurrency; label: string }[] = [
  { value: 'BRL', label: '🇧🇷 Reais' },
  { value: 'EUR', label: '🇪🇺 Euros' },
  { value: 'USD', label: '🇺🇸 Dólares' },
];

// Presets fill the end date from the start date; the field stays editable.
const DEADLINES: { label: string; months: number | null }[] = [
  { label: 'Sem prazo', months: null },
  { label: '3 meses', months: 3 },
  { label: '6 meses', months: 6 },
  { label: '1 ano', months: 12 },
  { label: '2 anos', months: 24 },
];

/** New goal, or edit when opened with ?id=<goal id>. */
export default function GoalFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof id === 'string' && id !== '' ? id : null;

  const [name, setName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('#6366f1');
  const [currency, setCurrency] = useState<GoalCurrency>('BRL');
  const [startText, setStartText] = useState(() => formatDateBR(Date.now()));
  const [endText, setEndText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!editingId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (!editingId || once.current) return;
    once.current = true;
    getGoal(editingId)
      .then((g) => {
        if (!g) {
          setLoadError('Meta não encontrada.');
          return;
        }
        setName(g.name);
        setTargetText(centsToInput(g.targetCents));
        setIcon(g.icon);
        setColor(g.color);
        setCurrency(g.currency);
        setStartText(formatDateBR(g.startAt));
        setEndText(g.endAt != null ? formatDateBR(g.endAt) : '');
        setLoaded(true);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, [editingId]);

  function applyPreset(months: number | null) {
    if (months == null) {
      setEndText('');
      return;
    }
    const start = parseDateBR(startText);
    if (start == null) {
      Alert.alert('Data de início inválida', 'Preencha o início (dd/mm/aaaa) antes de escolher o prazo.');
      return;
    }
    setEndText(formatDateBR(addMonths(start, months).getTime()));
  }

  // Which preset matches the current dates (for highlighting), if any.
  const start = parseDateBR(startText);
  const activePreset = DEADLINES.findIndex((d) =>
    d.months == null
      ? endText.trim() === ''
      : start != null && endText.trim() === formatDateBR(addMonths(start, d.months).getTime()),
  );

  async function handleSave() {
    setSaving(true);
    try {
      const { startAt, endAt } = parseGoalPeriod(startText, endText);
      const input = { name, targetText, icon, color, currency, startAt, endAt };
      if (editingId) await updateGoalUseCase(editingId, input);
      else await createGoalUseCase(input);
      goBack('/goals'); // always leaves the form, even after a reload
    } catch (e) {
      Alert.alert('Não foi possível salvar', e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!editingId) return;
    Alert.alert(
      'Excluir meta',
      `Excluir "${name.trim() || 'esta meta'}" e todo o histórico de depósitos dela? Não dá para desfazer. ` +
        'Se quiser só tirá-la da lista e manter o histórico, use "Arquivar" na tela da meta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            deleteGoal(editingId)
              .then(() => goBack('/goals'))
              .catch((e) => Alert.alert('Não foi possível excluir', e instanceof Error ? e.message : 'Erro'));
          },
        },
      ],
    );
  }

  const title = editingId ? 'Editar meta' : 'Nova meta';

  if (!loaded) {
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

      <View style={styles.preview}>
        <View style={[styles.previewIcon, { backgroundColor: `${color}1a`, borderColor: color }]}>
          <Text style={styles.previewEmoji}>{icon || '❔'}</Text>
        </View>
        <TextInput
          style={[styles.input, styles.flex]}
          value={name}
          onChangeText={setName}
          placeholder="Ex: Viagem para a praia"
          autoFocus={!editingId}
          maxLength={TEXT_MAX}
          accessibilityLabel="Nome da meta"
        />
      </View>

      <Text style={styles.label}>Valor-alvo</Text>
      <TextInput
        style={styles.amountInput}
        value={targetText}
        onChangeText={(t) => setTargetText(maskCurrencyInput(t))}
        placeholder="5.000,00"
        keyboardType="number-pad"
        accessibilityLabel="Valor-alvo"
      />

      <Text style={styles.label}>Juntando para comprar</Text>
      <View style={styles.wrap} role="radiogroup">
        {CURRENCIES.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => setCurrency(c.value)}
            style={[styles.deadlineChip, currency === c.value && styles.deadlineChipActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: currency === c.value }}
          >
            <Text style={[styles.deadlineText, currency === c.value && styles.deadlineTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      {currency !== 'BRL' && (
        <Text style={styles.small}>
          O valor continua em reais. A meta mostra quanto em {currency === 'EUR' ? 'euros' : 'dólares'} o que você
          guardou compra hoje, pela cotação turismo.
        </Text>
      )}

      <Text style={styles.label}>Ícone</Text>
      <View style={styles.wrap}>
        {GOAL_ICONS.map((i) => (
          <Pressable
            key={i}
            onPress={() => setIcon(i)}
            style={[styles.iconChip, icon === i && { borderColor: color, backgroundColor: `${color}1a` }]}
            accessibilityRole="radio"
            accessibilityLabel={`Ícone ${i}`}
            accessibilityState={{ selected: icon === i }}
          >
            <Text style={styles.iconText}>{i}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={icon}
        onChangeText={setIcon}
        placeholder="ou digite/cole um emoji"
        maxLength={16}
        accessibilityLabel="Emoji da meta"
      />

      <Text style={styles.label}>Cor</Text>
      <View style={styles.wrap}>
        {CATEGORY_COLORS.map((c, idx) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
            accessibilityRole="radio"
            accessibilityLabel={`Cor ${idx + 1}`}
            accessibilityState={{ selected: color === c }}
          />
        ))}
      </View>

      <Text style={styles.label}>Prazo</Text>
      <View style={styles.dates}>
        <View style={styles.flex}>
          <Text style={styles.small}>Início</Text>
          <TextInput
            style={styles.input}
            value={startText}
            onChangeText={(t) => setStartText(maskDateInput(t))}
            placeholder="dd/mm/aaaa"
            keyboardType="number-pad"
            maxLength={10}
            accessibilityLabel="Data de início, dia barra mês barra ano"
          />
        </View>
        <View style={styles.flex}>
          <Text style={styles.small}>Fim (vazio = sem prazo)</Text>
          <TextInput
            style={styles.input}
            value={endText}
            onChangeText={(t) => setEndText(maskDateInput(t))}
            placeholder="dd/mm/aaaa"
            keyboardType="number-pad"
            maxLength={10}
            accessibilityLabel="Data final, dia barra mês barra ano. Vazio para sem prazo"
          />
        </View>
      </View>
      <View style={styles.wrap}>
        {DEADLINES.map((d, idx) => (
          <Pressable
            key={d.label}
            onPress={() => applyPreset(d.months)}
            style={[styles.deadlineChip, activePreset === idx && styles.deadlineChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: activePreset === idx }}
          >
            <Text style={[styles.deadlineText, activePreset === idx && styles.deadlineTextActive]}>{d.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>
          {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar meta'}
        </Text>
      </Pressable>

      {editingId && (
        <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={saving} accessibilityRole="button">
          <Text style={styles.deleteText}>Excluir meta</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#b91c1c', textAlign: 'center' },
  flex: { flex: 1 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  previewEmoji: { fontSize: 26, lineHeight: 30 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600', marginTop: 8 },
  small: { color: '#4b5563', fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, color: '#111827' },
  amountInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  iconText: { fontSize: 22, lineHeight: 26 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: '#fff' },
  colorDotActive: { borderColor: '#111827' },
  dates: { flexDirection: 'row', gap: 12 },
  deadlineChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  deadlineChipActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  deadlineText: { color: '#374151', fontSize: 13 },
  deadlineTextActive: { color: '#4338ca', fontWeight: '700' },
  saveButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteButton: { padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: '#fecaca', marginTop: 8 },
  deleteText: { color: '#b91c1c', fontSize: 15, fontWeight: '700' },
});
