import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert is a no-op, and every screen reports errors and
// confirmations through it. Route it to the browser's native dialogs instead.
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length < 2) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const cancel = buttons.find((b) => b.style === 'cancel');
    const action = buttons.find((b) => b !== cancel);
    (window.confirm(text) ? action : cancel)?.onPress?.();
  };
}
