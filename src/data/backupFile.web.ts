import { pickTextFile, saveTextFile } from './webFiles';

export const pickBackupFile = pickTextFile;

/** Web: share sheet / download. Returns the file name, or null if dismissed. */
export async function saveBackupFile(content: string, now: Date = new Date()): Promise<string | null> {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const name = `appbank-backup-${stamp}.appbank`;
  return (await saveTextFile(name, content)) ? name : null;
}
