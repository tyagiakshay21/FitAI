import { prisma } from '../config/db';
import { addDays, isoDate, toDate } from '../utils/dates';

/** Consecutive-workout streak: sessions at most 3 days apart (≤2 rest days) count as one streak. */
export async function workoutStreak(userId: string) {
  const rows = await prisma.workoutSession.findMany({
    where: { userId, completed: true, date: { gte: addDays(toDate(), -120) } },
    select: { date: true },
    orderBy: { date: 'desc' },
  });
  const dates = [...new Set(rows.map((r) => isoDate(r.date)))];
  if (!dates.length) return 0;
  const gap = (a: string, b: string) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / 86_400_000);
  if (gap(isoDate(toDate()), dates[0]) > 3) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length && gap(dates[i - 1], dates[i]) <= 3; i++) streak++;
  return streak;
}

const RULES: { code: string; title: string; description: string; check: (s: Stats) => boolean }[] = [
  { code: 'FIRST_WORKOUT', title: 'First workout', description: 'You completed your first session.', check: (s) => s.sessions >= 1 },
  { code: 'WORKOUTS_10', title: '10 workouts', description: 'Ten sessions completed.', check: (s) => s.sessions >= 10 },
  { code: 'WORKOUTS_50', title: '50 workouts', description: 'Fifty sessions completed.', check: (s) => s.sessions >= 50 },
  { code: 'STREAK_7', title: '7-session streak', description: 'Seven sessions in a row without a long break.', check: (s) => s.streak >= 7 },
  { code: 'FIRST_WEIGHT', title: 'Tracking started', description: 'Logged your first weigh-in.', check: (s) => s.weights >= 1 },
  { code: 'FOOD_LOG_7', title: 'Food diary habit', description: 'Logged food on 7 different days.', check: (s) => s.foodDays >= 7 },
  { code: 'FORM_CHECK', title: 'Form check', description: 'Completed an AI form-analysis set.', check: (s) => s.analyses >= 1 },
];
interface Stats { sessions: number; streak: number; weights: number; foodDays: number; analyses: number }

export async function evaluateAchievements(userId: string) {
  const [sessions, streak, weights, foodRows, analyses, have] = await Promise.all([
    prisma.workoutSession.count({ where: { userId, completed: true } }),
    workoutStreak(userId),
    prisma.weightLog.count({ where: { userId } }),
    prisma.nutritionLog.findMany({ where: { userId }, distinct: ['date'], select: { date: true } }),
    prisma.exerciseAnalysis.count({ where: { userId } }),
    prisma.achievement.findMany({ where: { userId }, select: { code: true } }),
  ]);
  const stats: Stats = { sessions, streak, weights, foodDays: foodRows.length, analyses };
  const owned = new Set(have.map((h) => h.code));
  const fresh = RULES.filter((r) => !owned.has(r.code) && r.check(stats));
  for (const r of fresh) {
    await prisma.achievement.create({ data: { userId, code: r.code, title: r.title, description: r.description } });
    await prisma.notification.create({ data: { userId, type: 'ACHIEVEMENT', title: `Achievement: ${r.title}`, body: r.description } });
  }
  return fresh.map((r) => r.title);
}
