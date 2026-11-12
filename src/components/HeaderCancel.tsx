import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

/**
 * "Cancelar" for modal screens. On the web (and the iPhone home-screen app)
 * there is no browser back button, and after a reload there is no history to
 * go back to, so fall back to the dashboard.
 */
export function HeaderCancel({ label = 'Cancelar' }: { label?: string }) {
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      hitSlop={12}
      style={styles.button}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 16, paddingVertical: 8 },
  text: { color: '#4338ca', fontSize: 16, fontWeight: '600' },
});
