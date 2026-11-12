import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

type Props = Omit<TextInputProps, 'secureTextEntry'>;

/** Password field with a show/hide (eye) toggle. Hidden by default. */
export function PasswordInput({ style, accessibilityLabel, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const label = accessibilityLabel ?? props.placeholder ?? 'Senha';
  return (
    <View style={styles.wrap}>
      <TextInput
        {...props}
        style={[style, styles.input]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
      />
      <Pressable
        style={styles.eye}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        accessibilityState={{ checked: visible }}
        hitSlop={8}
      >
        <Text style={styles.eyeIcon}>{visible ? '🙈' : '👁️'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  input: { paddingRight: 52 },
  eye: { position: 'absolute', right: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eyeIcon: { fontSize: 20, lineHeight: 24 },
});
