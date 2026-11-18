import { MealType, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/AppError';
import { addDays, eachDay, isoDate, round, toDate } from '../utils/dates';

/* ───────────── Nutrition logging ───────────── */

export interface LogInput {
  date?: string;
  mealType: MealType;
  foodId?: string;
  foodName?: string;
  quantityG: number;
  calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number;
  source?: string;
}

export async function addNutritionLog(userId: string, input: LogInput) {
  let food = null;
  if (input.foodId) {
    food = await prisma.food.findFirst({
      where: { id: input.foodId, OR: [{ createdById: null }, { createdById: userId }] },
    });
    if (!food) throw AppError.notFound('Food not found');
  }
  const f = input.quantityG / 100;
  // Nutrient values for database foods are always derived server-side from per-100 g values.
  const data = food
    ? {
        foodName: food.name, calories: food.calories * f, protein: food.protein * f,
        carbs: food.carbs * f, fat: food.fat * f, fiber: food.fiber * f,
      }
    : {
        foodName: input.foodName!, calories: input.calories ?? 0, protein: input.protein ?? 0,
        carbs: input.carbs ?? 0, fat: input.fat ?? 0, fiber: input.fiber ?? 0,
      };
  const date = toDate(input.date);
  const log = await prisma.nutritionLog.create({
    data: {
      userId, date, mealType: input.mealType, foodId: food?.id, quantityG: input.quantityG,
      source: input.source ?? (food ? 'DATABASE' : 'MANUAL'),
      ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'number' ? round(v, 1) : v])),
    } as Prisma.NutritionLogUncheckedCreateInput,
  });
  await syncCalorieLog(userId, date);
  return log;
}

export async function deleteNutritionLog(userId: string, id: string) {
  const log = await prisma.nutritionLog.findFirst({ where: { id, userId } });
  if (!log) throw AppError.notFound('Log entry not found');
  await prisma.nutritionLog.delete({ where: { id } });
  await syncCalorieLog(userId, log.date);
}

const sumLogs = (logs: { calories: number; protein: number; carbs: number; fat: number; fiber: number }[]) =>
  logs.reduce(
    (t, l) => ({
      calories: t.calories + l.calories, protein: t.protein + l.protein,
      carbs: t.carbs + l.carbs, fat: t.fat + l.fat, fiber: t.fiber + l.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
const roundTotals = (t: ReturnType<typeof sumLogs>) => ({
  calories: Math.round(t.calories), protein: round(t.protein), carbs: round(t.carbs), fat: round(t.fat), fiber: round(t.fiber),
});

export async function nutritionDay(userId: string, dateIso?: string) {
  const date = toDate(dateIso);
  const logs = await prisma.nutritionLog.findMany({ where: { userId, date }, orderBy: { loggedAt: 'asc' } });
  return { date: isoDate(date), logs, totals: roundTotals(sumLogs(logs)) };
}

/** Daily totals for a date range + averages and macro split. */
export async function nutritionRange(userId: string, from: Date, to: Date) {
  const logs = await prisma.nutritionLog.findMany({ where: { userId, date: { gte: from, lte: to } } });
  const byDay = new Map<string, ReturnType<typeof sumLogs>>();
  for (const l of logs) {
    const k = isoDate(l.date);
    byDay.set(k, sumLogs([byDay.get(k) ?? sumLogs([]), l]));
  }
  const daily = eachDay(from, to).map((d) => ({ date: isoDate(d), ...roundTotals(byDay.get(isoDate(d)) ?? sumLogs([])), logged: byDay.has(isoDate(d)) }));
  const loggedDays = daily.filter((d) => d.logged);
  const avg = (k: 'calories' | 'protein' | 'carbs' | 'fat') =>
    loggedDays.length ? Math.round(loggedDays.reduce((s, d) => s + d[k], 0) / loggedDays.length) : 0;
  const totalKcal = avg('protein') * 4 + avg('carbs') * 4 + avg('fat') * 9;
  const pct = (kcal: number) => (totalKcal ? Math.round((kcal / totalKcal) * 100) : 0);
  return {
    daily,
    loggedDays: loggedDays.length,
    averages: { calories: avg('calories'), protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') },
    macroDistributionPct: { protein: pct(avg('protein') * 4), carbs: pct(avg('carbs') * 4), fat: pct(avg('fat') * 9) },
  };
}

export async function syncCalorieLog(userId: string, date: Date) {
  const [logs, sessions] = await Promise.all([
    prisma.nutritionLog.findMany({ where: { userId, date } }),
    prisma.workoutSession.findMany({ where: { userId, date, completed: true } }),
  ]);
  const consumed = logs.reduce((s, l) => s + l.calories, 0);
  const burned = sessions.reduce((s, x) => s + (x.caloriesBurned ?? 0), 0);
  await prisma.calorieLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, caloriesConsumed: consumed, caloriesBurned: burned },
    update: { caloriesConsumed: consumed, caloriesBurned: burned },
  });
}

/* ───────────── Water / sleep / steps ───────────── */

export async function addWater(userId: string, amountMl: number, dateIso?: string) {
  await prisma.waterLog.create({ data: { userId, amountMl, date: toDate(dateIso) } });
  return waterTotal(userId, toDate(dateIso));
}
export async function waterTotal(userId: string, date: Date) {
  const agg = await prisma.waterLog.aggregate({ where: { userId, date }, _sum: { amountMl: true } });
  return agg._sum.amountMl ?? 0;
}
export const upsertSleep = (userId: string, hours: number, quality: number | undefined, dateIso?: string) => {
  const date = toDate(dateIso);
  return prisma.sleepLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, hours, quality }, update: { hours, quality },
  });
};
export const upsertSteps = (userId: string, steps: number, dateIso?: string) => {
  const date = toDate(dateIso);
  return prisma.stepLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, steps }, update: { steps },
  });
};

/* ───────────── Weight & measurements ───────────── */

export async function upsertWeight(userId: string, weightKg: number, dateIso?: string) {
  const date = toDate(dateIso);
  const log = await prisma.weightLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, weightKg }, update: { weightKg },
  });
  // Keep the profile's current weight in sync with the most recent entry.
  const latest = await prisma.weightLog.findFirst({ where: { userId }, orderBy: { date: 'desc' } });
  if (latest) await prisma.profile.updateMany({ where: { userId }, data: { weightKg: latest.weightKg } });
  return log;
}

export const listWeights = (userId: string, days: number) =>
  prisma.weightLog.findMany({
    where: { userId, date: { gte: addDays(toDate(), -days) } },
    orderBy: { date: 'asc' },
    select: { date: true, weightKg: true },
  });

export const addMeasurement = (userId: string, data: Omit<Prisma.BodyMeasurementUncheckedCreateInput, 'userId' | 'date'> & { date?: string }) => {
  const { date, ...rest } = data;
  return prisma.bodyMeasurement.create({ data: { ...rest, userId, date: toDate(date) } });
};

export const listMeasurements = (userId: string, days: number) =>
  prisma.bodyMeasurement.findMany({
    where: { userId, date: { gte: addDays(toDate(), -days) } },
    orderBy: { date: 'asc' },
  });
