import type { TransactionKind } from './types';

export const CATEGORY_NAME_MAX = 30;

/** Quick picks; any emoji can also be typed. */
export const CATEGORY_ICONS = [
  '🍔', '🛒', '🚗', '⛽', '🏠', '💡', '📱', '🎮', '🎬', '✈️', '👕', '💊',
  '🏋️', '🎓', '🐶', '👶', '🎁', '💳', '🍺', '☕', '💼', '💰', '📈', '💸',
] as const;

/** Quick picks for savings goals; any emoji can also be typed. */
export const GOAL_ICONS = [
  '🎯', '🐷', '💰', '🚨', '✈️', '🏖️', '🏝️', '🌎', '🏠', '🛋️', '🚗', '🏍️',
  '💍', '👶', '🎓', '📚', '💻', '📱', '🎮', '🎸', '🐶', '🏥', '🎁', '🎉',
] as const;

/** Readable on white and as a 10% tint. */
export const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280',
] as const;

export interface CategoryDraft {
  name: string;
  icon: string;
  color: string;
  kind: TransactionKind;
}

interface Existing {
  id: string;
  name: string;
  kind: TransactionKind;
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;

/** Visible characters (an emoji like 🏋️ or 👨‍👩‍👧 counts as one). */
function graphemes(s: string): number {
  return segmenter ? [...segmenter.segment(s)].length : [...s].length;
}

/** Exactly one emoji (multi-codepoint ones like 🏋️ or 👨‍👩‍👧 count as one). */
export function isSingleEmoji(s: string): boolean {
  const icon = s.trim();
  return icon !== '' && graphemes(icon) === 1 && !/[\p{L}\p{N}]/u.test(icon);
}

const key = (name: string) => name.trim().toLocaleLowerCase('pt-BR').normalize('NFKC');

/**
 * Validate and normalize a category. `editingId` skips itself in the
 * duplicate check. Throws a message meant for the user.
 */
export function validateCategory(
  draft: CategoryDraft,
  existing: readonly Existing[],
  editingId: string | null = null,
): CategoryDraft {
  const name = draft.name.trim().replace(/\s+/g, ' ');
  const icon = draft.icon.trim();
  if (name === '') throw new Error('Dê um nome para a categoria.');
  if (graphemes(name) > CATEGORY_NAME_MAX) throw new Error(`Nome com no máximo ${CATEGORY_NAME_MAX} caracteres.`);
  if (!isSingleEmoji(icon)) {
    throw new Error('Escolha um emoji para o ícone.');
  }
  if (!/^#[0-9a-f]{6}$/i.test(draft.color)) throw new Error('Cor inválida.');
  if (draft.kind !== 'expense' && draft.kind !== 'income') throw new Error('Tipo inválido.');
  const dup = existing.some((c) => c.id !== editingId && c.kind === draft.kind && key(c.name) === key(name));
  if (dup) throw new Error(`Já existe uma categoria "${name}" de ${draft.kind === 'expense' ? 'despesa' : 'receita'}.`);
  return { name, icon, color: draft.color.toLowerCase(), kind: draft.kind };
}
