import { prisma } from '../config/db';
import * as w from '../services/workout.service';
import { evaluateAchievements } from '../services/achievement.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

export const listExercises = asyncHandler(async (req, res) => {
  const { q, category, equipment, difficulty, page, pageSize } = req.query as any;
  const where: any = {
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { muscleGroups: { has: String(q).toLowerCase() } }] } : {}),
    ...(category ? { category } : {}), ...(difficulty ? { difficulty } : {}), ...(equipment ? { equipment: { has: equipment } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.exercise.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.exercise.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});
export const getExercise = asyncHandler(async (req, res) => {
  const ex = await prisma.exercise.findUnique({ where: { id: req.params.id } });
  if (!ex) throw AppError.notFound('Exercise not found');
  res.json(ex);
});
export const createExercise = asyncHandler(async (req, res) => res.status(201).json(await prisma.exercise.create({ data: req.body })));
export const updateExercise = asyncHandler(async (req, res) => res.json(await prisma.exercise.update({ where: { id: req.params.id }, data: req.body })));
export const deleteExercise = asyncHandler(async (req, res) => {
  await prisma.exercise.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export const generate = asyncHandler(async (req, res) => res.status(201).json(await w.generatePlan(req.user!.id)));
export const activePlan = asyncHandler(async (req, res) => res.json(await w.getActivePlan(req.user!.id)));
export const today = asyncHandler(async (req, res) => {
  const t = await w.todayWorkout(req.user!.id, req.query.date as string | undefined);
  res.json({ restDay: t.restDay, workout: t.workout, planId: t.plan?.id ?? null });
});
export const adapt = asyncHandler(async (req, res) => res.json(await w.adaptPlan(req.user!.id)));

export const startSession = asyncHandler(async (req, res) => res.status(201).json(await w.startSession(req.user!.id, req.body.workoutId, req.body.date)));
export const logSet = asyncHandler(async (req, res) => res.status(201).json(await w.logSet(req.user!.id, req.params.id, req.body)));
export const finishSession = asyncHandler(async (req, res) => {
  const s = await w.finishSession(req.user!.id, req.params.id, req.body);
  res.json({ session: s, newAchievements: await evaluateAchievements(req.user!.id) });
});
export const sessions = asyncHandler(async (req, res) => res.json(await w.listSessions(req.user!.id)));

export const saveFormAnalysis = asyncHandler(async (req, res) => {
  const row = await prisma.exerciseAnalysis.create({
    data: { userId: req.user!.id, ...req.body, breakdown: req.body.breakdown, feedbackSummary: req.body.feedbackSummary },
  });
  res.status(201).json({ analysis: row, newAchievements: await evaluateAchievements(req.user!.id) });
});
export const formHistory = asyncHandler(async (req, res) =>
  res.json(await prisma.exerciseAnalysis.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 30 })));
