import type { Cents } from './money';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export interface AchievementContext {
  goalsCreated: number;
  goalsCompleted: number;
  totalSavedCents: Cents;
  /** True when every category with a budget stayed within it this month. */
  withinBudgetThisMonth: boolean;
  transactionCount: number;
}

// Simple, derived badges. No persistence: recomputed from current state each
// time, so there's nothing to migrate or keep in sync.
export function computeAchievements(ctx: AchievementContext): Achievement[] {
  return [
    {
      id: 'first-transaction',
      title: 'Primeiro passo',
      description: 'Registrou seu primeiro lançamento',
      icon: '👣',
      unlocked: ctx.transactionCount >= 1,
    },
    {
      id: 'first-goal',
      title: 'Sonhador',
      description: 'Criou sua primeira meta',
      icon: '🌟',
      unlocked: ctx.goalsCreated >= 1,
    },
    {
      id: 'goal-completed',
      title: 'Objetivo alcançado',
      description: 'Concluiu uma meta',
      icon: '🏆',
      unlocked: ctx.goalsCompleted >= 1,
    },
    {
      id: 'within-budget',
      title: 'No controle',
      description: 'Ficou dentro do orçamento no mês',
      icon: '🧘',
      unlocked: ctx.withinBudgetThisMonth,
    },
    {
      id: 'saved-1k',
      title: 'Cofrinho cheio',
      description: 'Guardou mais de R$ 1.000 no total',
      icon: '🐷',
      unlocked: ctx.totalSavedCents >= 100_000,
    },
  ];
}
