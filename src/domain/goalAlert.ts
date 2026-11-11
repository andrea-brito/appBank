import type { GoalProgress } from './goal';

export type GoalAlertLevel = 'info' | 'success' | 'warning';

export interface GoalAlert {
  level: GoalAlertLevel;
  message: string;
}

// Progress milestones we celebrate once crossed.
const MILESTONES = [0.9, 0.75, 0.5, 0.25] as const;

/**
 * Human-facing nudges for a single goal based on its progress and whether the
 * user has saved anything this month. Pure function: UI passes in the facts.
 *
 * - savedThisMonth: did any deposit land in the current month?
 * - Returns at most the most relevant alerts, highest priority first.
 */
export function goalAlerts(progress: GoalProgress, savedThisMonthCents: number): GoalAlert[] {
  const alerts: GoalAlert[] = [];

  if (progress.isComplete) {
    alerts.push({ level: 'success', message: 'Meta concluída! 🎉' });
    return alerts;
  }

  const pct = Math.floor(progress.ratio * 100);

  // Highest milestone reached drives the main "you're at X%" message.
  const reached = MILESTONES.find((m) => progress.ratio >= m);
  if (reached != null) {
    alerts.push({
      level: 'info',
      message: `Você está a ${pct}% da sua meta. Continue assim!`,
    });
  }

  // Deadline pressure: nothing saved this month but a deadline is ticking.
  if (savedThisMonthCents <= 0 && progress.monthsLeft != null) {
    alerts.push({
      level: 'warning',
      message:
        progress.monthlyTargetCents != null
          ? 'Você não guardou nada este mês. Para manter o prazo, faça um aporte.'
          : 'Você não guardou nada este mês.',
    });
  } else if (savedThisMonthCents <= 0) {
    alerts.push({ level: 'warning', message: 'Você não guardou nada este mês.' });
  }

  return alerts;
}
