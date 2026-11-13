import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useQuotes } from '@/components/useQuotes';
import { fetchAverage } from '@/data/quotes';
import { alertsSupported, getRateAlert, saveRateAlert } from '@/data/rateAlert';
import { formatDateBR } from '@/domain/dates';
import { centsToRate4, FX_PAIR_LABEL, FX_PAIRS, formatRate, isAtOrBelowTarget, type FxPair, type Rate4 } from '@/domain/fx';
import { formatCentsInput, isValidCents, maskCurrencyInput, parseToCents } from '@/domain/money';

const DEFAULT_TARGET_CENTS = 600; // R$ 6,00: "euro abaixo de 6 é um bom preço"

export default function FxScreen() {
  const quotes = useQuotes();
  const [pair, setPair] = useState<FxPair>('EUR-BRL');
  const [targetText, setTargetText] = useState(formatCentsInput(DEFAULT_TARGET_CENTS));
  const [enabled, setEnabled] = useState(true);
  const [lastNotifiedAt, setLastNotifiedAt] = useState<string | null>(null);
  const [avg, setAvg] = useState<{ pair: FxPair; value: Rate4 | null } | null>(null);
  const [loadingAlert, setLoadingAlert] = useState(alertsSupported);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!alertsSupported) return;
    getRateAlert()
      .then((a) => {
        if (a) {
          setPair(a.pair);
          setTargetText(formatCentsInput(a.targetCents));
          setEnabled(a.enabled);
          setLastNotifiedAt(a.lastNotifiedAt);
        }
      })
      .catch((e) => Alert.alert('Alerta de câmbio', e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoadingAlert(false));
  }, []);

  useEffect(() => {
    let alive = true;
    fetchAverage(pair).then((value) => alive && setAvg({ pair, value }));
    return () => {
      alive = false;
    };
  }, [pair]);
  // Only show the average of the pair currently selected (a slow response for a
  // previous pair is ignored).
  const average = avg?.pair === pair ? avg.value : null;

  const targetCents = parseToCents(targetText);
  const validTarget = isValidCents(targetCents) && targetCents > 0;
  const current = quotes?.[pair].ask ?? null;
  const below = current != null && validTarget && isAtOrBelowTarget(current, targetCents);

  async function save() {
    setSaving(true);
    try {
      if (!validTarget) throw new Error('Informe o preço-alvo, ex: 6,00.');
      await saveRateAlert({ pair, targetCents, enabled });
      Alert.alert(
        'Alerta salvo',
        enabled
          ? `Você recebe um e-mail quando o ${FX_PAIR_LABEL[pair].toLowerCase()} estiver em ${formatRate(centsToRate4(targetCents))} ou menos. Consultamos nos dias úteis, das 9h às 18h.`
          : 'Alerta desligado. Nenhum e-mail será enviado.',
      );
    } catch (e) {
      Alert.alert('Não foi possível salvar', e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.section} role="heading">
          Cotação agora (venda)
        </Text>
        {quotes == null ? (
          <Text style={styles.muted}>Carregando… (ou sem conexão com o serviço de cotações)</Text>
        ) : (
          FX_PAIRS.map((p) => (
            <View key={p} style={styles.row}>
              <Text style={styles.rowLabel}>{FX_PAIR_LABEL[p]}</Text>
              <Text style={styles.rowValue}>{formatRate(quotes[p].ask)}</Text>
            </View>
          ))
        )}
        {quotes && (
          <Text style={styles.muted}>
            Atualizado em {new Date(quotes[pair].at).toLocaleString('pt-BR')}. Comercial é a referência do mercado (a do
            Google); turismo é o que casas de câmbio e cartões cobram, em geral mais caro.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.section} role="heading">
          Alerta de preço
        </Text>

        <Text style={styles.label}>Vigiar</Text>
        <View style={styles.wrap} role="radiogroup">
          {FX_PAIRS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setPair(p)}
              style={[styles.chip, pair === p && styles.chipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: pair === p }}
            >
              <Text style={[styles.chipText, pair === p && styles.chipTextActive]}>{FX_PAIR_LABEL[p]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Avisar quando estiver em até (R$)</Text>
        <TextInput
          style={styles.input}
          value={targetText}
          onChangeText={(t) => setTargetText(maskCurrencyInput(t))}
          keyboardType="number-pad"
          placeholder="6,00"
          accessibilityLabel="Preço-alvo em reais"
        />

        {current != null && validTarget && (
          <Text style={[styles.status, below ? styles.good : styles.wait]}>
            {below
              ? `✅ Agora: ${formatRate(current)}. Está no seu preço!`
              : `⏳ Agora: ${formatRate(current)}. Faltam ${formatRate(current - centsToRate4(targetCents))} para o alvo.`}
          </Text>
        )}
        {average != null && (
          <Text style={styles.muted}>
            Média dos últimos 30 dias: {formatRate(average)}
            {current != null ? (current < average ? ' (hoje está abaixo da média).' : ' (hoje está acima da média).') : '.'}
          </Text>
        )}

        {alertsSupported ? (
          loadingAlert ? (
            <ActivityIndicator />
          ) : (
            <>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Me avisar por e-mail</Text>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={{ true: '#6366f1' }}
                  accessibilityLabel="Me avisar por e-mail"
                />
              </View>
              <Text style={styles.muted}>
                Consultamos a cada 30 minutos, nos dias úteis das 9h às 18h. Você recebe um e-mail quando a cotação
                chega ao alvo, e outro só depois que ela subir e cair de novo (no máximo um por dia).
                {lastNotifiedAt ? ` Último aviso: ${formatDateBR(new Date(lastNotifiedAt).getTime())}.` : ''}
              </Text>
              <Pressable
                style={[styles.button, saving && styles.disabled]}
                onPress={save}
                disabled={saving}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>{saving ? 'Salvando…' : 'Salvar alerta'}</Text>
              </Pressable>
            </>
          )
        ) : (
          <Text style={styles.muted}>Avisos por e-mail estão disponíveis na versão web.</Text>
        )}
      </View>

      <Text style={styles.source}>Cotações: AwesomeAPI (economia.awesomeapi.com.br). Valores de referência.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8 },
  section: { fontSize: 16, fontWeight: '700', color: '#111827' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowLabel: { color: '#374151', fontSize: 15 },
  rowValue: { color: '#111827', fontSize: 15, fontWeight: '700' },
  muted: { color: '#4b5563', fontSize: 12, lineHeight: 17 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600', marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  chipText: { color: '#374151', fontSize: 13 },
  chipTextActive: { color: '#4338ca', fontWeight: '700' },
  input: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 14, fontSize: 20, fontWeight: '700', color: '#111827' },
  status: { fontSize: 14, fontWeight: '700', borderRadius: 8, padding: 10, overflow: 'hidden' },
  good: { backgroundColor: '#dcfce7', color: '#166534' },
  wait: { backgroundColor: '#eef2ff', color: '#3730a3' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  switchLabel: { color: '#111827', fontSize: 15, fontWeight: '600' },
  button: { backgroundColor: '#6366f1', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  source: { color: '#6b7280', fontSize: 11, textAlign: 'center' },
});
