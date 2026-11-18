import { z } from 'zod';
import { dateStr } from './common';

export const exerciseQuery = z.object({
  q: z.string().trim().optional(),
  category: z.string().optional(),
  equipment: z.string().optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const exerciseBody = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().min(5),
  category: z.enum(['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'LEGS', 'GLUTES', 'CORE', 'CARDIO', 'FULL_BODY', 'MOBILITY', 'STRETCHING']),
  muscleGroups: z.array(z.string()).min(1),
  equipment: z.array(z.string()).default([]),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  isCompound: z.boolean().default(false),
  instructions: z.array(z.string()).min(1),
  defaultSets: z.number().int().min(1).max(10).default(3),
  repMin: z.number().int().min(1).max(60).default(8),
  repMax: z.number().int().min(1).max(60).default(12),
  restSec: z.number().int().min(0).max(600).default(90),
  caloriesPerMin: z.number().min(1).max(25).default(5),
  mediaUrl: z.string().url().optional(),
  safetyNotes: z.string().optional(),
  jointStress: z.array(z.string()).default([]),
});

export const startSessionSchema = z.object({ workoutId: z.string().uuid().optional(), date: dateStr.optional() });
export const logSetSchema = z.object({
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1).max(30),
  reps: z.number().int().min(0).max(200),
  weightKg: z.number().min(0).max(1000).optional(),
  rpe: z.number().min(1).max(10).optional(),
  formScore: z.number().min(0).max(100).optional(),
  durationSec: z.number().int().min(0).max(7200).optional(),
});
export const finishSessionSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
});
export const formAnalysisSchema = z.object({
  exerciseName: z.string().min(2).max(60),
  reps: z.number().int().min(0).max(500),
  targetReps: z.number().int().min(1).max(500).optional(),
  avgFormScore: z.number().min(0).max(100),
  breakdown: z.record(z.number()),
  feedbackSummary: z.array(z.object({ message: z.string(), count: z.number() })).default([]),
  durationSec: z.number().int().min(0).max(7200),
  caloriesEstimate: z.number().min(0).max(2000).optional(),
});
