import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getAchievements } from '@/application/achievementsInsight';
import { db, schema } from '@/data/db/client';
import type { Achievement } from '@/domain/achievements';

export default function AchievementsScreen() {
  // Recompute whenever transactions or deposits change.
  const { data: txns } = useLiveQuery(db.select({ id: schema.transactions.id }).from(schema.transactions));
  const { data: deposits } = useLiveQuery(db.select({ id: schema.goalDeposits.id }).from(schema.goalDeposits));

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  useEffect(() => {
    getAchievements()
      .then(setAchievements)
      .catch((e) => console.error('achievements failed', e));
  }, [txns, deposits]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.progress}>
        {unlockedCount} de {achievements.length} conquistas desbloqueadas
      </Text>

      {achievements.map((a) => (
        <View key={a.id} style={[styles.card, !a.unlocked && styles.locked]}>
          <Text style={[styles.icon, !a.unlocked && styles.iconLocked]}>
            {a.unlocked ? a.icon : '🔒'}
          </Text>
          <View style={styles.info}>
            <Text style={[styles.cardTitle, !a.unlocked && styles.textLocked]}>{a.title}</Text>
            <Text style={[styles.cardDesc, !a.unlocked && styles.textLocked]}>{a.description}</Text>
          </View>
          {a.unlocked && <Text style={styles.check}>✓</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 10 },
  progress: { color: '#6b7280', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  locked: { backgroundColor: '#f3f4f6' },
  icon: { fontSize: 30 },
  iconLocked: { opacity: 0.6 },
  info: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  textLocked: { color: '#9ca3af' },
  check: { color: '#22c55e', fontSize: 20, fontWeight: '800' },
});
