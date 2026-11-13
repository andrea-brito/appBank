// Fails the build if an inline <script> in dist/ is not allowed by the CSP in
// vercel.json. Expo writes one inline script; if an SDK update changes it, the
// hash in the CSP must be updated or the page breaks silently in production.
// Run after `expo export -p web` (vercel.json buildCommand does).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const csp = JSON.parse(readFileSync('vercel.json', 'utf8'))
  .headers.flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy')?.value;
if (!csp) throw new Error('vercel.json has no Content-Security-Policy');
const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';

const htmlFiles = readdirSync('dist', { recursive: true }).filter((f) => f.endsWith('.html'));
const missing = new Set();
for (const f of htmlFiles) {
  const html = readFileSync(join('dist', f), 'utf8');
  for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
    if (!scriptSrc.includes(hash)) missing.add(`${hash}  (${f}: ${body.slice(0, 60)})`);
  }
}

if (missing.size) {
  console.error('Inline scripts not allowed by the CSP script-src in vercel.json. Add these hashes:');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}
console.log(`check-csp: ${htmlFiles.length} HTML files, every inline script allowed by the CSP`);
