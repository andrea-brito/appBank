/**
 * Runnable self-check for category validation.
 * Run with: npx tsx src/domain/category.test.ts
 */
import { validateCategory } from './category';

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}
function err(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const existing = [
  { id: 'a', name: 'Alimentação', kind: 'expense' as const },
  { id: 'b', name: 'Salário', kind: 'income' as const },
];
const base = { name: 'Pets', icon: '🐶', color: '#3B82F6', kind: 'expense' as const };

const ok = validateCategory({ ...base, name: '  Pets   e  vet ' }, existing);
check('trims and collapses spaces', ok.name === 'Pets e vet');
check('lowercases color', ok.color === '#3b82f6');
check('multi-codepoint emoji is one icon', validateCategory({ ...base, icon: '🏋️' }, existing).icon === '🏋️');
check('family emoji is one icon', validateCategory({ ...base, icon: '👨‍👩‍👧' }, existing).icon === '👨‍👩‍👧');

check('empty name', err(() => validateCategory({ ...base, name: '   ' }, existing)).includes('nome'));
check('too long', err(() => validateCategory({ ...base, name: 'x'.repeat(31) }, existing)).includes('30'));
check('letters are not an icon', err(() => validateCategory({ ...base, icon: 'A' }, existing)).includes('emoji'));
check('two emojis rejected', err(() => validateCategory({ ...base, icon: '🐶🐱' }, existing)).includes('emoji'));
check('bad color', err(() => validateCategory({ ...base, color: 'red' }, existing)).includes('Cor'));

check('duplicate same kind, any case', err(() => validateCategory({ ...base, name: 'alimentação' }, existing)).includes('Já existe'));
check('same name other kind is fine', validateCategory({ ...base, name: 'Salário' }, existing).name === 'Salário');
check('editing itself is not a duplicate', validateCategory({ ...base, name: 'Alimentação' }, existing, 'a').name === 'Alimentação');

if (failures) {
  console.error(`category.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('category.test.ts: all checks passed');
