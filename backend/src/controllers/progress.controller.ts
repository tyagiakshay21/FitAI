import { asyncHandler } from '../utils/asyncHandler';
import * as t from '../services/tracking.service';
import * as p from '../services/progress.service';
import { evaluateAchievements } from '../services/achievement.service';

export const addWeight = asyncHandler(async (req, res) => {
  const row = await t.upsertWeight(req.user!.id, req.body.weightKg, req.body.date);
  await evaluateAchievements(req.user!.id);
  res.status(201).json(row);
});
export const weights = asyncHandler(async (req, res) => res.json(await t.listWeights(req.user!.id, (req.query as any).days)));
export const addMeasurement = asyncHandler(async (req, res) => {
  const photoUrl = req.file ? `/uploads/progress/${req.file.filename}` : undefined;
  res.status(201).json(await t.addMeasurement(req.user!.id, { ...req.body, photoUrl }));
});
export const measurements = asyncHandler(async (req, res) => res.json(await t.listMeasurements(req.user!.id, (req.query as any).days)));
export const timeline = asyncHandler(async (req, res) => res.json(await p.timeline(req.user!.id)));
export const strength = asyncHandler(async (req, res) => res.json(await p.strengthSeries(req.user!.id, (req.query as any).days ?? 120, 6)));
export const volume = asyncHandler(async (req, res) => res.json(await p.weeklyVolume(req.user!.id, 12)));
