import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import * as ai from '../services/ai.service';
import * as ml from '../services/ml.service';
import { prisma } from '../config/db';

export const chat = asyncHandler(async (req, res) => res.json(await ai.chat(req.user!.id, req.body.message, req.query.date as string | undefined)));
export const history = asyncHandler(async (req, res) => res.json(await ai.chatHistory(req.user!.id)));
export const daily = asyncHandler(async (req, res) => res.json(await ai.dailyRecommendation(req.user!.id, req.query.date as string | undefined)));
export const analysis = asyncHandler(async (req, res) => res.json(await ai.progressAnalysis(req.user!.id)));
export const foodPhoto = asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('Attach an image in the "image" field');
  res.json(await ai.recognizeFood(req.file.buffer, req.file.mimetype));
});

const mlNote = 'Model output is a statistical estimate based on your logged data, not a guarantee.';
const wrap = (data: unknown) => (data ? { available: true, ...(data as object), note: mlNote } : { available: false, note: 'ML service is unavailable right now.' });
export const weightForecast = asyncHandler(async (req, res) => res.json(wrap(await ml.weightForecast(req.user!.id, (req.query as any).days))));
export const adherence = asyncHandler(async (req, res) => res.json(wrap(await ml.adherence(req.user!.id))));
export const workoutRecs = asyncHandler(async (req, res) => res.json(wrap(await ml.workoutRecommendations(req.user!.id))));
export const insights = asyncHandler(async (req, res) => res.json(wrap(await ml.insights(req.user!.id))));

export const notifications = asyncHandler(async (req, res) =>
  res.json(await prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 30 })));
export const readNotifications = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
  res.status(204).end();
});
export const achievements = asyncHandler(async (req, res) =>
  res.json(await prisma.achievement.findMany({ where: { userId: req.user!.id }, orderBy: { unlockedAt: 'desc' } })));
