import * as LocalAuthentication from 'expo-local-authentication';

export type AuthOutcome = 'success' | 'failed' | 'unavailable';

/**
 * Prompt for Face ID (or Touch ID). With disableDeviceFallback=false the iOS
 * prompt falls back to the device passcode after failed biometric attempts,
 * which is what we want: Face ID first, device password if it fails.
 */
export async function authenticate(): Promise<AuthOutcome> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  // No biometrics/passcode set up at all — can't gate. Caller decides policy.
  if (!hasHardware || !isEnrolled) return 'unavailable';

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Desbloqueie o appBank',
    fallbackLabel: 'Usar senha do celular',
    disableDeviceFallback: false, // allow device passcode fallback
    cancelLabel: 'Cancelar',
  });

  return result.success ? 'success' : 'failed';
}
