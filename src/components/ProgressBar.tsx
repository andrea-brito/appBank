import { StyleSheet, View } from 'react-native';

interface Props {
  ratio: number; // 0..1
  color?: string;
}

/** Simple clamped progress bar. ratio outside 0..1 is clamped. */
export function ProgressBar({ ratio, color = '#6366f1' }: Props) {
  const pct = Math.min(1, Math.max(0, ratio)) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
