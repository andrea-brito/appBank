import { router } from 'expo-router';
import { addMonths } from 'date-fns';
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

import { createGoalUseCase } from '@/application/manageGoals';

const ICONS = ['🎯', '✈️', '🏖️', '🏠', '🚗', '🐷', '💍', '🎓', '🚨'];

// Deadline presets keep the UI dependency-free: no native date picker needed
// for the common "save by N months" case. "Sem prazo" = open-ended goal.
const DEADLINES: { label: string; months: number | null }[] = [
  { label: 'Sem prazo', months: null },
  { label: '3 meses', months: 3 },
  { label: '6 meses', months: 6 },
  { label: '1 ano', months: 12 },
  { label: '2 anos', months: 24 },
];

export default function GoalNewScreen() {
  const [name, setName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [deadlineIdx, setDeadlineIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const months = DEADLINES[deadlineIdx].months;
      const endAt = months == null ? null : addMonths(new Date(), months).getTime();
      await createGoalUseCase({ name, targetText, icon, endAt });
      router.back();
    } catch (e) {
      Alert.alert('Não foi possível criar', e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nome da meta</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Ex: Viagem para a praia"
        autoFocus
        maxLength={80}
      />

      <Text style={styles.label}>Valor-alvo</Text>
      <TextInput
        style={styles.amountInput}
        value={targetText}
        onChangeText={setTargetText}
        placeholder="5.000,00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Ícone</Text>
      <View style={styles.iconRow}>
        {ICONS.map((i) => (
          <Pressable
            key={i}
            onPress={() => setIcon(i)}
            style={[styles.iconChip, icon === i && styles.iconChipActive]}
          >
            <Text style={styles.iconText}>{i}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Prazo</Text>
      <View style={styles.deadlineRow}>
        {DEADLINES.map((d, idx) => (
          <Pressable
            key={d.label}
            onPress={() => setDeadlineIdx(idx)}
            style={[styles.deadlineChip, deadlineIdx === idx && styles.deadlineChipActive]}
          >
            <Text style={[styles.deadlineText, deadlineIdx === idx && styles.deadlineTextActive]}>
              {d.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveText}>{saving ? 'Criando…' : 'Criar meta'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 8 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, color: '#111827' },
  amountInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  iconChipActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  iconText: { fontSize: 20 },
  deadlineRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
});
