import * as profile from '../services/profile.service';
import { bmiSummary, computeMetrics } from '../services/nutrition.service';
import { dashboard } from '../services/dashboard.service';
import { asyncHandler } from '../utils/asyncHandler';

export const get = asyncHandler(async (req, res) => res.json(await profile.getProfile(req.user!.id)));
export const onboard = asyncHandler(async (req, res) => res.status(201).json(await profile.completeOnboarding(req.user!.id, req.body)));
export const update = asyncHandler(async (req, res) => res.json(await profile.updateProfile(req.user!.id, req.body)));
export const bmi = asyncHandler(async (req, res) => res.json(bmiSummary(req.body.weightKg, req.body.heightCm)));
export const metrics = asyncHandler(async (req, res) => res.json((await profile.getProfile(req.user!.id)).metrics));
export const dash = asyncHandler(async (req, res) => res.json(await dashboard(req.user!.id, req.query.date as string | undefined)));
export { computeMetrics };
