import type { Config } from 'drizzle-kit';

// Generates SQL migrations from the schema. The app runs them at startup
// via drizzle-orm/expo-sqlite/migrator (see src/data/db/client.ts).
export default {
  schema: './src/data/db/schema.ts',
  out: './src/data/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
