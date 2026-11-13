import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
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
import {
  parseBoletoLine,
  parsePixText,
  type ParsedDocument,
} from '@/application/importFromDocument';
import { importOfx } from '@/application/importOfx';
import { goBack } from '@/components/HeaderCancel';
import { categoriesQuery } from '@/data/transactionRepository';
import { formatBRL, parseToCents } from '@/domain/money';
import { pickAndReadOfx } from '@/data/ofxFile';

type Mode = 'boleto' | 'pix' | 'ofx';

export default function ImportScreen() {
  const { data: categories } = useLiveQuery(categoriesQuery());
  const [mode, setMode] = useState<Mode>('boleto');
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const expenseCategories = (categories ?? []).filter((c) => c.kind === 'expense');

  async function handleOfxImport() {
    setImporting(true);
    try {
      const content = await pickAndReadOfx();
      if (content == null) return; // user canceled
      const { parsed: found, inserted } = await importOfx(content);
      Alert.alert(
        'Extrato importado',
        `${found} transações lidas. ${inserted} novas adicionadas` +
          (found - inserted > 0 ? `, ${found - inserted} já existiam.` : '.'),
        [{ text: 'OK', onPress: () => goBack() }],
      );
    } catch (e) {
      Alert.alert('Não foi possível importar', e instanceof Error ? e.message : 'Erro');
    } finally {
      setImporting(false);
    }
  }

  function handleParse() {
    try {
      const result = mode === 'boleto' ? parseBoletoLine(raw) : parsePixText(raw);
      setParsed(result);
      setAmountText(
        result.amountCents != null ? (result.amountCents / 100).toFixed(2).replace('.', ',') : '',
      );
      setDescription(result.description ?? '');
    } catch (e) {
      Alert.alert('Não consegui ler', e instanceof Error ? e.message : 'Erro');
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await addExpense({
        amountText,
        kind: 'expense',
        description,
        categoryId,
        occurredAt: parsed?.occurredAt ?? Date.now(),
        source: mode,
      });
      goBack();
    } catch (e) {
      Alert.alert('Não foi possível salvar', e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setParsed(null);
    setRaw('');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.segment}>
        {(['boleto', 'pix', 'ofx'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => switchMode(m)}
            style={[styles.segmentItem, mode === m && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
              {m === 'boleto' ? 'Boleto' : m === 'pix' ? 'PIX' : 'Extrato OFX'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'ofx' ? (
        <View style={styles.ofxBox}>
          <Text style={styles.ofxTitle}>Importar extrato do banco (OFX)</Text>
          <Text style={styles.ofxHint}>
            No app ou site do banco, exporte o extrato no formato OFX e selecione o arquivo aqui. As
            transações entram com data, valor e descrição exatos. Importar o mesmo arquivo de novo
            não duplica nada.
          </Text>
          <Pressable
            style={[styles.parseButton, importing && styles.disabled]}
            onPress={handleOfxImport}
            disabled={importing}
          >
            <Text style={styles.parseText}>
              {importing ? 'Importando…' : 'Escolher arquivo OFX'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.label}>
            {mode === 'boleto' ? 'Linha digitável (47 dígitos)' : 'Cole o texto do comprovante'}
          </Text>
          <TextInput
            style={[styles.input, mode === 'pix' && styles.inputMultiline]}
            value={raw}
            onChangeText={setRaw}
            placeholder={
              mode === 'boleto'
                ? '34191.79001 01043...'
                : 'Cole aqui o comprovante copiado do banco'
            }
            keyboardType={mode === 'boleto' ? 'number-pad' : 'default'}
            multiline={mode === 'pix'}
            autoFocus
          />

          <Pressable style={styles.parseButton} onPress={handleParse}>
            <Text style={styles.parseText}>Ler dados</Text>
          </Pressable>
        </>
      )}

      {parsed && mode !== 'ofx' && (
        <View style={styles.result}>
          {!parsed.confident && (
            <Text style={styles.warning}>
              ⚠️ Leitura automática do comprovante pode errar. Confira os campos antes de salvar.
            </Text>
          )}

          <Text style={styles.label}>Valor</Text>
          <TextInput
            style={styles.amountInput}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0,00"
          />
          {amountText !== '' && (
            <Text style={styles.preview}>{formatBRL(parseToCents(amountText))}</Text>
          )}

          <Text style={styles.label}>Descrição</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            maxLength={140}
          />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.categoryGrid}>
            {expenseCategories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id === categoryId ? null : c.id)}
                style={[
                  styles.categoryChip,
                  categoryId === c.id && { borderColor: c.color, backgroundColor: `${c.color}1a` },
                ]}
              >
                <Text>{c.icon}</Text>
                <Text style={styles.categoryName}>{c.name}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.saveButton, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar lançamento'}</Text>
          </Pressable>
        </View>
      )}
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
  segmentText: { color: '#6b7280', fontWeight: '600', fontSize: 13 },
  segmentTextActive: { color: '#111827' },
  ofxBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 12 },
  ofxTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  ofxHint: { color: '#6b7280', fontSize: 13, lineHeight: 19 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 15, color: '#111827' },
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },
  parseButton: {
    backgroundColor: '#374151',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  parseText: { color: '#fff', fontWeight: '700' },
  result: { gap: 8, marginTop: 8 },
  warning: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
  },
  amountInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  preview: { color: '#6b7280', fontSize: 13 },
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
  categoryName: { color: '#374151', fontSize: 13 },
  saveButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  disabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
