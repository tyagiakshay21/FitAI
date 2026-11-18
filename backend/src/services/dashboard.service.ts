import { prisma } from '../config/db';
import { addDays, isoDate, round, toDate, weekStart } from '../utils/dates';
import { computeMetrics, progressPct } from './nutrition.service';
import { GoalKey } from '../config/nutrition';
import { nutritionDay, nutritionRange, waterTotal } from './tracking.service';
import { strengthSeries, weeklyVolume } from './progress.service';
import { workoutStreak } from './achievement.service';
import { todayWorkout } from './workout.service';
import { dailyRecommendation } from './ai.service';
import { AppError } from '../utils/AppError';

export async function dashboard(userId: string, dateIso?: string) {
  const date = toDate(dateIso);
  const [profile, goal] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.fitnessGoal.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  if (!profile) throw AppError.badRequest('Complete onboarding first');
  const metrics = computeMetrics(profile, (goal?.type ?? 'GENERAL_FITNESS') as GoalKey);
  const from30 = addDays(date, -29);
  const wkStart = weekStart(date);

  const [day, water, stepRow, sleepRow, range, weights, measurements, sessionsWeek, vol, strength, streak, today, recommendation, calLogs, steps30, sessions8w] = await Promise.all([
    nutritionDay(userId, isoDate(date)),
    waterTotal(userId, date),
    prisma.stepLog.findUnique({ where: { userId_date: { userId, date } } }),
    prisma.sleepLog.findUnique({ where: { userId_date: { userId, date } } }),
    nutritionRange(userId, from30, date),
    prisma.weightLog.findMany({ where: { userId, date: { gte: addDays(date, -120) } }, orderBy: { date: 'asc' }, select: { date: true, weightKg: true } }),
    prisma.bodyMeasurement.findMany({ where: { userId, date: { gte: addDays(date, -180) } }, orderBy: { date: 'asc' } }),
    prisma.workoutSession.count({ where: { userId, completed: true, date: { gte: wkStart, lte: date } } }),
    weeklyVolume(userId, 8),
    strengthSeries(userId),
    workoutStreak(userId),
    todayWorkout(userId, isoDate(date)),
    dailyRecommendation(userId, isoDate(date)),
    prisma.calorieLog.findMany({ where: { userId, date: { gte: from30 } } }),
    prisma.stepLog.findMany({ where: { userId, date: { gte: from30 } }, orderBy: { date: 'asc' } }),
    prisma.workoutSession.findMany({ where: { userId, completed: true, date: { gte: addDays(wkStart, -49) } }, select: { date: true } }),
  ]);

  const t = metrics.macros;
  const consumed = day.totals;
  const weeklyConsistency = Array.from({ length: 8 }, (_, i) => {
    const ws = addDays(wkStart, (i - 7) * 7);
    const done = sessions8w.filter((s) => s.date >= ws && s.date <= addDays(ws, 6)).length;
    return { weekStart: isoDate(ws), completed: done, planned: profile.workoutDaysPerWeek };
  });
  const burned = calLogs.find((c) => isoDate(c.date) === isoDate(date))?.caloriesBurned ?? 0;

  return {
    date: isoDate(date),
    cards: {
      currentWeightKg: profile.weightKg,
      targetWeightKg: goal?.targetWeightKg ?? null,
      goal: goal?.type ?? null,
      bmi: metrics.bmi,
      bmr: metrics.bmr,
      tdee: metrics.tdee,
      calorieTarget: metrics.calorieTarget,
      caloriesConsumed: consumed.calories,
      caloriesBurned: Math.round(burned),
      caloriesRemaining: metrics.calorieTarget - consumed.calories,
      protein: { target: t.protein, consumed: consumed.protein, remaining: round(t.protein - consumed.protein), pct: progressPct(consumed.protein, t.protein) },
      carbs: { target: t.carbs, consumed: consumed.carbs, remaining: round(t.carbs - consumed.carbs), pct: progressPct(consumed.carbs, t.carbs) },
      fat: { target: t.fat, consumed: consumed.fat, remaining: round(t.fat - consumed.fat), pct: progressPct(consumed.fat, t.fat) },
      fiber: { target: t.fiber, consumed: consumed.fiber, pct: progressPct(consumed.fiber, t.fiber) },
      water: { targetMl: t.waterMl, consumedMl: water, pct: progressPct(water, t.waterMl) },
      steps: { target: profile.stepTarget, count: stepRow?.steps ?? 0, pct: progressPct(stepRow?.steps ?? 0, profile.stepTarget) },
      sleepHours: sleepRow?.hours ?? null,
      workoutStreak: streak,
      weeklyWorkouts: { completed: sessionsWeek, planned: profile.workoutDaysPerWeek },
    },
    metrics,
    today: { restDay: today.restDay, workout: today.workout ? { id: today.workout.id, dayName: today.workout.dayName, focus: today.workout.focus, exercises: today.workout.exercises.length, estimatedMinutes: today.workout.estimatedMinutes } : null },
    recommendation,
    charts: {
      weight: weights.map((w) => ({ date: isoDate(w.date), weightKg: w.weightKg })),
      calories: range.daily.map((d) => ({ date: d.date, calories: d.calories, target: metrics.calorieTarget })),
      protein: range.daily.map((d) => ({ date: d.date, protein: d.protein, target: t.protein })),
      workoutVolume: vol.map((v) => ({ weekStart: v.weekStart, volumeKg: v.volumeKg })),
      steps: steps30.map((s) => ({ date: isoDate(s.date), steps: s.steps, target: profile.stepTarget })),
      measurements: measurements.map((m) => ({ date: isoDate(m.date), waistCm: m.waistCm, chestCm: m.chestCm, armsCm: m.armsCm, thighsCm: m.thighsCm })),
      consistency: weeklyConsistency,
      strength,
    },
    averages30d: range.averages,
    macroDistributionPct: range.macroDistributionPct,
  };
}
