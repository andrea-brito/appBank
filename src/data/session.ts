// Native app: no account (local-first, Face ID), so nothing to sign out of.
// The web build swaps this file for session.web.ts.
export const canSignOut = false;

export async function signOut(): Promise<void> {}
