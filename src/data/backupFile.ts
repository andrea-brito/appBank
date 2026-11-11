import { Directory, File } from 'expo-file-system';

/**
 * Save the encrypted backup into a folder the user picks (Files app / iCloud
 * Drive on iOS, any storage provider on Android). Returns the file name, or
 * null if the user cancelled the folder picker.
 */
export async function saveBackupFile(content: string, now: Date = new Date()): Promise<string | null> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return null; // cancelled
  }
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = dir.createFile(`appbank-backup-${stamp}.appbank`, 'application/octet-stream');
  await file.write(content);
  return file.name;
}

/** Let the user pick a backup file and read it as text. Returns null if cancelled. */
export async function pickBackupFile(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
  if (picked.canceled || picked.result == null) return null;
  return picked.result.text();
}
