import { prisma } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { addDays, isoDate, toDate } from '../utils/dates';
import { computeMetrics } from './nutrition.service';
import { GoalKey } from '../config/nutrition';
import { scheduleWeekdays } from './schedule';
import { selectExercises } from './workout.service';
import { epley1RM } from './progress.service';

async function call<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { logger.warn({ path, status: res.status }, 'ML service error'); return null; }
    return (await res.json()) as T;
  } catch (err) {
    logger.warn({ path, err: String(err) }, 'ML service unreachable');
    return null;
  }
}

/** One row per day joining every signal the models use. */
export async function dailyRows(userId: string, days: number) {
  const from = addDays(toDate(), -days);
  const [weights, cal, steps, sleep, sessions, nutrition] = await Promise.all([
    prisma.weightLog.findMany({ where: { userId, date: { gte: from } } }),
    prisma.calorieLog.findMany({ where: { userId, date: { gte: from } } }),
    prisma.stepLog.findMany({ where: { userId, date: { gte: from } } }),
    prisma.sleepLog.findMany({ where: { userId, date: { gte: from } } }),
    prisma.workoutSession.findMany({ where: { userId, completed: true, date: { gte: from } }, select: { date: true } }),
    prisma.nutritionLog.groupBy({ by: ['date'], where: { userId, date: { gte: from } }, _sum: { protein: true } }),
  ]);
  const rows = new Map<string, Record<string, number | string | null>>();
  const row = (d: Date) => {
    const k = isoDate(d);
    if (!rows.has(k)) rows.set(k, { date: k, weight_kg: null, calories: null, protein: null, steps: null, sleep_hours: null, workouts: 0 });
    return rows.get(k)!;
  };
  weights.forEach((w) => (row(w.date).weight_kg = w.weightKg));
  cal.forEach((c) => c.caloriesConsumed > 0 && (row(c.date).calories = Math.round(c.caloriesConsumed)));
  nutrition.forEach((n) => (row(n.date).protein = Math.round(n._sum.protein ?? 0)));
  steps.forEach((s) => (row(s.date).steps = s.steps));
  sleep.forEach((s) => (row(s.date).sleep_hours = s.hours));
  sessions.forEach((s) => ((row(s.date).workouts as number) += 1));
  return [...rows.values()].sort((a, b) => (a.date! < b.date! ? -1 : 1));
}

export async function weightForecast(userId: string, horizonDays: number) {
  const [profile, goal, rows] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.fitnessGoal.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' } }),
    dailyRows(userId, 180),
  ]);
  if (!profile || !goal) return null;
  const m = computeMetrics(profile, goal.type as GoalKey);
  return call('/predict/weight-trend', { rows, horizon_days: horizonDays, tdee: m.tdee, target_weight_kg: goal.targetWeightKg });
}

export async function adherence(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) return null;
  const planned = new Set(scheduleWeekdays(profile.workoutDaysPerWeek));
  const today = toDate();
  const [sessions, sleep] = await Promise.all([
    prisma.workoutSession.findMany({ where: { userId, completed: true, date: { gte: addDays(today, -90) } }, select: { date: true } }),
    prisma.sleepLog.findMany({ where: { userId, date: { gte: addDays(today, -90) } } }),
  ]);
  const done = new Set(sessions.map((s) => isoDate(s.date)));
  const sleepBy = new Map(sleep.map((s) => [isoDate(s.date), s.hours]));
  const history = [];
  for (let i = 90; i >= 1; i--) {
    const d = addDays(today, -i);
    if (planned.has(d.getUTCDay())) history.push({ date: isoDate(d), completed: done.has(isoDate(d)), sleep_hours: sleepBy.get(isoDate(d)) ?? null });
  }
  let next = today;
  for (let i = 0; i < 7 && !planned.has(next.getUTCDay()); i++) next = addDays(next, 1);
  return call('/predict/adherence', {
    history, target: { date: isoDate(next), sleep_hours: sleepBy.get(isoDate(today)) ?? profile.sleepHours, planned_minutes: profile.workoutDurationMin },
  });
}

export async function workoutRecommendations(userId: string) {
  const [profile, sets, catalog] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.exerciseSet.findMany({
      where: { session: { userId, completed: true, date: { gte: addDays(toDate(), -90) } } },
      select: { reps: true, weightKg: true, rpe: true, session: { select: { date: true } }, exercise: { select: { name: true, category: true, muscleGroups: true, repMax: true } } },
    }),
    prisma.exercise.findMany(),
  ]);
  if (!profile) return null;
  const { usable } = selectExercises(catalog, {
    goal: 'GENERAL_FITNESS', experience: profile.experience, age: profile.age, daysPerWeek: profile.workoutDaysPerWeek,
    durationMin: profile.workoutDurationMin, location: profile.location, equipment: profile.equipment, injuries: profile.injuries,
  });
  const grouped = new Map<string, { date: string; exercise: string; category: string; muscles: string[]; target_rep_max: number; sets: { reps: number; weight_kg: number | null; rpe: number | null; e1rm: number | null }[] }>();
  for (const s of sets) {
    const key = `${isoDate(s.session.date)}|${s.exercise.name}`;
    const g = grouped.get(key) ?? { date: isoDate(s.session.date), exercise: s.exercise.name, category: s.exercise.category, muscles: s.exercise.muscleGroups, target_rep_max: s.exercise.repMax, sets: [] };
    g.sets.push({ reps: s.reps, weight_kg: s.weightKg, rpe: s.rpe, e1rm: s.weightKg ? epley1RM(s.weightKg, s.reps) : null });
    grouped.set(key, g);
  }
  return call('/recommend/workout', {
    history: [...grouped.values()],
    // Only exercises that already pass the equipment/limitation filters may be recommended.
    catalog: usable.map((e) => ({ name: e.name, category: e.category, muscles: e.muscleGroups, equipment: e.equipment, difficulty: e.difficulty })),
  });
}

export async function insights(userId: string) {
  return call('/analyze/correlations', { rows: await dailyRows(userId, 120) });
}
