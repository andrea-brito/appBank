import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

/**
 * Leave a pushed/modal screen. On the web (and the iPhone home-screen app)
 * a reload leaves no history, so router.back() would silently do nothing:
 * the save worked but the screen stayed. Fall back to a tab instead.
 */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** "Cancelar"/"Voltar" header button for non-tab screens. */
export function HeaderCancel({ label = 'Cancelar' }: { label?: string }) {
  return (
    <Pressable onPress={() => goBack()} accessibilityRole="button" hitSlop={12} style={styles.button}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 16, paddingVertical: 8 },
  text: { color: '#4338ca', fontSize: 16, fontWeight: '600' },
});
