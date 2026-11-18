import { z } from 'zod';
import { goalTypes, stringList } from './common';

const profileFields = {
  age: z.number().int().min(13).max(90),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']).default('MODERATE'),
  experience: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  workoutDaysPerWeek: z.number().int().min(1).max(7),
  workoutDurationMin: z.number().int().min(20).max(180).default(60),
  location: z.enum(['GYM', 'HOME', 'BOTH', 'OUTDOOR']).transform((value) => value === 'OUTDOOR' ? 'BOTH' : value),
  equipment: stringList,
  injuries: stringList,
  dietType: z.enum(['VEGETARIAN', 'VEGAN', 'NON_VEGETARIAN', 'EGGETARIAN']),
  allergies: stringList,
  foodPreferences: stringList,
  dislikedFoods: stringList,
  budgetPerDayInr: z.number().int().min(50).max(5000).optional(),
  mealsPerDay: z.number().int().min(3).max(6).default(4),
  cookingPreference: z.enum(['QUICK', 'STANDARD', 'ELABORATE']).default('STANDARD'),
  stepTarget: z.number().int().min(500).max(40000).default(8000),
  sleepHours: z.number().min(3).max(12).default(7.5),
  bodyFatPct: z.number().min(3).max(60).optional(),
};

export const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  ...profileFields,
  goal: z.enum(goalTypes),
  targetWeightKg: z.number().min(30).max(300).optional(),
  measurements: z
    .object({
      waistCm: z.number().min(30).max(200).optional(),
      chestCm: z.number().min(30).max(200).optional(),
      armsCm: z.number().min(10).max(80).optional(),
      thighsCm: z.number().min(20).max(120).optional(),
    })
    .optional(),
});

export const updateProfileSchema = z.object(profileFields).partial().extend({
  name: z.string().trim().min(2).max(80).optional(),
  goal: z.enum(goalTypes).optional(),
  targetWeightKg: z.number().min(30).max(300).optional(),
});

export const bmiSchema = z.object({ heightCm: z.number().min(100).max(250), weightKg: z.number().min(30).max(300) });
