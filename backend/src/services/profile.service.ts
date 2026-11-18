import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/AppError';
import { toDate } from '../utils/dates';
import { computeMetrics } from './nutrition.service';
import { GoalKey } from '../config/nutrition';
import { generatePlan } from './workout.service';
import { generateMealPlan } from './diet.service';
import { upsertWeight } from './tracking.service';
import { logger } from '../config/logger';

export async function getProfile(userId: string) {
  const [profile, goal] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.fitnessGoal.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  if (!profile) return { profile: null, goal: null, metrics: null };
  const metrics = computeMetrics(profile, (goal?.type ?? 'GENERAL_FITNESS') as GoalKey);
  return { profile, goal, metrics };
}

type OnboardingInput = Prisma.ProfileUncheckedCreateInput & {
  name?: string; goal: GoalKey; targetWeightKg?: number;
  measurements?: { waistCm?: number; chestCm?: number; armsCm?: number; thighsCm?: number };
};

export async function completeOnboarding(userId: string, input: OnboardingInput) {
  const { name, goal, targetWeightKg, measurements, ...fields } = input;
  const data = { ...fields, onboardingCompleted: true };
  delete (data as any).userId;
  await prisma.$transaction(async (tx) => {
    await tx.profile.upsert({ where: { userId }, create: { ...data, userId }, update: data });
    if (name) await tx.user.update({ where: { id: userId }, data: { name } });
    await tx.fitnessGoal.updateMany({ where: { userId, active: true }, data: { active: false } });
    await tx.fitnessGoal.create({ data: { userId, type: goal, startWeightKg: fields.weightKg, targetWeightKg } });
  });
  await upsertWeight(userId, fields.weightKg);
  if (measurements && Object.values(measurements).some((v) => v !== undefined)) {
    await prisma.bodyMeasurement.create({ data: { userId, date: toDate(), ...measurements, bodyFatPct: fields.bodyFatPct } });
  }
  // Initial plans. A failure here must not block the user from finishing onboarding.
  const warnings: string[] = [];
  const [plan, mealPlan] = await Promise.all([
    generatePlan(userId).catch((e) => { logger.warn({ e }, 'plan generation failed'); warnings.push(String(e.message)); return null; }),
    generateMealPlan(userId).catch((e) => { logger.warn({ e }, 'meal plan generation failed'); warnings.push(String(e.message)); return null; }),
  ]);
  return { ...(await getProfile(userId)), plan, mealPlan, warnings };
}

export async function updateProfile(userId: string, input: Partial<OnboardingInput>) {
  const existing = await prisma.profile.findUnique({ where: { userId } });
  if (!existing) throw AppError.badRequest('Complete onboarding first');
  const { name, goal, targetWeightKg, ...fields } = input;
  delete (fields as any).measurements;
  if (Object.keys(fields).length) await prisma.profile.update({ where: { userId }, data: fields });
  if (name) await prisma.user.update({ where: { id: userId }, data: { name } });
  if (fields.weightKg) await upsertWeight(userId, fields.weightKg as number);
  if (goal || targetWeightKg !== undefined) {
    const current = await prisma.fitnessGoal.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' } });
    if (current && (!goal || goal === current.type)) {
      await prisma.fitnessGoal.update({ where: { id: current.id }, data: { targetWeightKg: targetWeightKg ?? current.targetWeightKg } });
    } else {
      await prisma.fitnessGoal.updateMany({ where: { userId, active: true }, data: { active: false } });
      await prisma.fitnessGoal.create({ data: { userId, type: goal ?? current?.type ?? 'GENERAL_FITNESS', startWeightKg: (fields.weightKg as number) ?? existing.weightKg, targetWeightKg } });
    }
  }
  return getProfile(userId);
}
