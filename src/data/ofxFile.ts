import { File } from 'expo-file-system';

/**
 * Open the system file picker and read the chosen statement as text.
 * Returns null if the user cancels. Uses the SDK 58 File API (the old
 * FileSystem.readAsStringAsync throws at runtime in this SDK).
 *
 * OFX files come with varied MIME types across banks, so we don't filter
 * strictly — '*' plus common types keeps the BB export selectable.
 */
export async function pickAndReadOfx(): Promise<string | null> {
  const picked = await File.pickFileAsync({
    mimeTypes: ['application/x-ofx', 'application/ofx', 'text/plain', '*/*'],
  });

  if (picked.canceled || picked.result == null) return null;

  const file = picked.result;
  return file.text();
}
