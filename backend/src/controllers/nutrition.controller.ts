import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { addDays, toDate } from '../utils/dates';
import * as t from '../services/tracking.service';
import * as diet from '../services/diet.service';
import { evaluateAchievements } from '../services/achievement.service';

export const foods = asyncHandler(async (req, res) => {
  const { q, category, limit } = req.query as any;
  res.json(await diet.searchFoods(req.user!.id, q, category, limit));
});
export const createFood = asyncHandler(async (req, res) =>
  res.status(201).json(await prisma.food.create({ data: { ...req.body, createdById: req.user!.id, isIndian: false, mealTypes: [] } })));

export const addLog = asyncHandler(async (req, res) => {
  const log = await t.addNutritionLog(req.user!.id, req.body);
  await evaluateAchievements(req.user!.id);
  res.status(201).json(log);
});
export const deleteLog = asyncHandler(async (req, res) => { await t.deleteNutritionLog(req.user!.id, req.params.id); res.status(204).end(); });
export const day = asyncHandler(async (req, res) => res.json(await t.nutritionDay(req.user!.id, req.query.date as string | undefined)));
export const summary = asyncHandler(async (req, res) => {
  const q = req.query as any;
  const to = toDate(q.to);
  const from = q.from ? toDate(q.from) : addDays(to, -((q.days ?? 7) - 1));
  res.json(await t.nutritionRange(req.user!.id, from, to));
});

export const generatePlan = asyncHandler(async (req, res) => res.status(201).json(await diet.generateMealPlan(req.user!.id, req.body)));
export const activePlan = asyncHandler(async (req, res) => res.json(await diet.activeMealPlan(req.user!.id)));
/** Logs one planned meal (all its items) in one tap. */
export const logPlannedMeal = asyncHandler(async (req, res) => {
  const meal = await prisma.meal.findFirst({ where: { id: req.params.id, mealPlan: { userId: req.user!.id } }, include: { items: true } });
  if (!meal) throw AppError.notFound('Meal not found');
  for (const i of meal.items) {
    await t.addNutritionLog(req.user!.id, { date: req.body?.date, mealType: meal.type, foodId: i.foodId ?? undefined, foodName: i.foodName, quantityG: i.quantityG, calories: i.calories, protein: i.protein, carbs: i.carbs, fat: i.fat, fiber: i.fiber, source: 'MEAL_PLAN' });
  }
  res.status(201).json({ logged: meal.items.length });
});

export const water = asyncHandler(async (req, res) => res.status(201).json({ totalMl: await t.addWater(req.user!.id, req.body.amountMl, req.body.date) }));
export const sleep = asyncHandler(async (req, res) => res.status(201).json(await t.upsertSleep(req.user!.id, req.body.hours, req.body.quality, req.body.date)));
export const steps = asyncHandler(async (req, res) => res.status(201).json(await t.upsertSteps(req.user!.id, req.body.steps, req.body.date)));
