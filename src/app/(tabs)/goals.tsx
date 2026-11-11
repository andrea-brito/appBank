import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSavingsSuggestion } from '@/application/savingsInsight';
import { ProgressBar } from '@/components/ProgressBar';
import { activeGoalsQuery, allDepositsQuery, savedPerGoalQuery } from '@/data/goalRepository';
import { goalProgress } from '@/domain/goal';
import { goalAlerts } from '@/domain/goalAlert';
import { formatBRL } from '@/domain/money';
import { currentMonth } from '@/domain/period';
import type { SavingsSuggestion } from '@/domain/savingsSuggestion';

export default function GoalsScreen() {
  const { data: goals } = useLiveQuery(activeGoalsQuery());
  const { data: saved } = useLiveQuery(savedPerGoalQuery());
  const { data: deposits } = useLiveQuery(allDepositsQuery());
  const period = useMemo(() => currentMonth(), []);

  const savedMap = useMemo(() => {
    const m = new Map<string, number>();
    (saved ?? []).forEach((r) => m.set(r.goalId, r.saved));
    return m;
  }, [saved]);

  // How much was deposited into each goal during the current month.
  const savedThisMonthMap = useMemo(() => {
    const m = new Map<string, number>();
    (deposits ?? [])
      .filter((d) => d.occurredAt >= period.from && d.occurredAt <= period.to)
      .forEach((d) => m.set(d.goalId, (m.get(d.goalId) ?? 0) + d.amountCents));
    return m;
  }, [deposits, period]);

  const [suggestion, setSuggestion] = useState<SavingsSuggestion | null>(null);
  // Recompute the suggestion whenever goals or deposits change.
  useEffect(() => {
    getSavingsSuggestion()
      .then(setSuggestion)
      .catch((e) => console.error('suggestion failed', e));
  }, [goals, saved]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Metas</Text>

        {suggestion && (
          <View style={styles.suggestCard}>
            <Text style={styles.suggestLabel}>💡 Sugestão de economia este mês</Text>
            <Text style={styles.suggestValue}>{formatBRL(suggestion.suggestedCents)}</Text>
            <Text style={styles.suggestHint}>
              {suggestion.lowConfidence
                ? 'Poucos meses de histórico — a estimativa melhora com o uso.'
                : `Baseado na média de ${suggestion.sampleMonths} meses do seu fluxo.`}
            </Text>
            <Text style={styles.disclaimer}>
              Estimativa para te orientar, não é recomendação de investimento.
            </Text>
          </View>
        )}

        {(goals ?? []).length === 0 && (
          <Text style={styles.empty}>
            Nenhuma meta ainda. Crie uma viagem, reserva ou cofrinho 👇
          </Text>
        )}

        {(goals ?? []).map((g) => {
          const progress = goalProgress(savedMap.get(g.id) ?? 0, g.targetCents, g.endAt);
          const alerts = goalAlerts(progress, savedThisMonthMap.get(g.id) ?? 0);
          return (
            <Link key={g.id} href={{ pathname: '/deposit', params: { goalId: g.id } }} asChild>
              <Pressable style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalName}>
                    {g.icon} {g.name}
                  </Text>
                  {progress.isComplete && <Text style={styles.doneBadge}>✓ Concluída</Text>}
                </View>
                <ProgressBar ratio={progress.ratio} color={g.color} />
                <View style={styles.goalRow}>
                  <Text style={styles.goalSaved}>
                    {formatBRL(progress.savedCents)} de {formatBRL(g.targetCents)}
                  </Text>
                  <Text style={styles.goalRemaining}>
                    faltam {formatBRL(progress.remainingCents)}
                  </Text>
                </View>
                {progress.monthlyTargetCents != null && !progress.isComplete && (
                  <Text style={styles.goalPace}>
                    Guarde {formatBRL(progress.monthlyTargetCents)}/mês para chegar no prazo
                  </Text>
                )}
                {alerts.map((a, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.alert,
                      a.level === 'warning' && styles.alertWarning,
                      a.level === 'success' && styles.alertSuccess,
                      a.level === 'info' && styles.alertInfo,
                    ]}
                  >
                    {a.message}
                  </Text>
                ))}
              </Pressable>
            </Link>
          );
        })}

        <Link href="/achievements" asChild>
          <Pressable style={styles.trophyButton}>
            <Text style={styles.trophyText}>🏆 Ver conquistas</Text>
          </Pressable>
        </Link>

        <Link href="/goal-new" asChild>
          <Pressable style={styles.addButton}>
            <Text style={styles.addText}>+ Nova meta</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  suggestCard: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 16, gap: 4 },
  suggestLabel: { color: '#4338ca', fontWeight: '600' },
  suggestValue: { fontSize: 26, fontWeight: '800', color: '#4338ca' },
  suggestHint: { color: '#6b7280', fontSize: 13 },
  disclaimer: { color: '#9ca3af', fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 16 },
  goalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  doneBadge: { color: '#22c55e', fontWeight: '700', fontSize: 12 },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  goalSaved: { color: '#374151', fontSize: 13 },
  goalRemaining: { color: '#6b7280', fontSize: 13 },
  goalPace: { color: '#6366f1', fontSize: 12, fontWeight: '600' },
  alert: { fontSize: 12, fontWeight: '600', borderRadius: 8, padding: 8, overflow: 'hidden' },
  alertWarning: { backgroundColor: '#fef3c7', color: '#92400e' },
  alertSuccess: { backgroundColor: '#dcfce7', color: '#166534' },
  alertInfo: { backgroundColor: '#eef2ff', color: '#4338ca' },
  trophyButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 8,
  },
  trophyText: { color: '#374151', fontSize: 15, fontWeight: '700' },
  addButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  addText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
