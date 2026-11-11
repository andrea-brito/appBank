import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addDepositUseCase } from '@/application/manageGoals';
import { archiveGoal } from '@/data/goalRepository';

export default function DepositScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const [amountText, setAmountText] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleDeposit(sign: 1 | -1) {
    if (!goalId) return;
    setSaving(true);
    try {
      const text = sign === -1 ? `-${amountText}` : amountText;
      await addDepositUseCase({ goalId, amountText: text });
      router.back();
    } catch (e) {
      Alert.alert('Não foi possível registrar', e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  }

  function handleArchive() {
    if (!goalId) return;
    Alert.alert('Arquivar meta', 'A meta sai da lista ativa. Confirmar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Arquivar',
        style: 'destructive',
        onPress: async () => {
          await archiveGoal(goalId);
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.label}>Valor</Text>
      <TextInput
        style={styles.amountInput}
        value={amountText}
        onChangeText={setAmountText}
        placeholder="100,00"
        keyboardType="decimal-pad"
        autoFocus
      />

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.deposit, saving && styles.disabled]}
          onPress={() => handleDeposit(1)}
          disabled={saving}
        >
          <Text style={styles.btnText}>Guardar</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.withdraw, saving && styles.disabled]}
          onPress={() => handleDeposit(-1)}
          disabled={saving}
        >
          <Text style={styles.btnText}>Retirar</Text>
        </Pressable>
      </View>

      <Pressable style={styles.archiveBtn} onPress={handleArchive}>
        <Text style={styles.archiveText}>Arquivar meta</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb', padding: 16, gap: 12 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600' },
  amountInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  deposit: { backgroundColor: '#22c55e' },
  withdraw: { backgroundColor: '#f59e0b' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  archiveBtn: { padding: 14, alignItems: 'center', marginTop: 'auto' },
  archiveText: { color: '#ef4444', fontWeight: '600' },
});
