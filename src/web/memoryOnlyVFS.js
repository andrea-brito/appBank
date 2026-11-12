// Web build only (swapped in by metro.config.js for expo-sqlite's worker).
//
// expo-sqlite's worker always opens an OPFS "access handle pool" on startup,
// even when only ':memory:' databases are used. OPFS access handles are
// exclusive per origin, so a second tab, the iPhone home-screen app plus a
// Safari tab, or a stale page kept alive after an update makes startup fail
// with "Access Handles cannot be created if there is another open Access
// Handle". The web build keeps its data in memory and syncs it to Supabase,
// so the persistent VFS is replaced by an in-memory one: no OPFS, no lock.
//
// ponytail: if the web build ever needs on-device persistent SQLite again,
// remove this swap and handle the single-tab OPFS lock instead.
import { MemoryVFS } from '../../node_modules/expo-sqlite/web/wa-sqlite/MemoryVFS.js';

export class AccessHandlePoolVFS {
  static create(name, module) {
    return MemoryVFS.create(name, module);
  }
}
