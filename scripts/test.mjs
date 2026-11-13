// Runs every src/**/*.test.ts as its own process (each is a self-checking
// script that exits non-zero on failure). Exits 1 if any file fails.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// src/ (app) and supabase/functions/ (Edge Function pure logic).
const files = ['src', join('supabase', 'functions')]
  .flatMap((dir) =>
    readdirSync(dir, { recursive: true })
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => join(dir, f)),
  )
  .sort();

let failed = 0;
for (const file of files) {
  const r = spawnSync('npx', ['tsx', file], { stdio: 'inherit', shell: true });
  if (r.status !== 0) failed++;
}

console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
