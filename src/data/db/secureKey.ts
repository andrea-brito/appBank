import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_NAME = 'appbank_db_key_v1';

/**
 * Get the SQLCipher database key, creating it on first run. The key is a
 * 256-bit random value stored in the iOS Keychain (hardware-protected) via
 * expo-secure-store, requiring the device to be unlocked to read it.
 *
 * The key never leaves the device and is never logged.
 */
export async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;

  const bytes = Crypto.getRandomBytes(32); // 256-bit
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  await SecureStore.setItemAsync(KEY_NAME, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}
