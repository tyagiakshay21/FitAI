import { z } from 'zod';
import { dateStr, mealTypes } from './common';

export const foodQuery = z.object({
  q: z.string().trim().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const foodBody = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.enum(['PROTEIN', 'CARB', 'VEGETABLE', 'FRUIT', 'DAIRY', 'FAT', 'SNACK', 'MIXED']).default('MIXED'),
  dietType: z.enum(['VEGETARIAN', 'VEGAN', 'NON_VEGETARIAN', 'EGGETARIAN']).default('VEGETARIAN'),
  servingG: z.number().min(1).max(2000).default(100),
  servingLabel: z.string().max(40).optional(),
  calories: z.number().min(0).max(950),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(100).default(0),
  allergens: z.array(z.string()).default([]),
});

const macro = z.number().min(0).max(5000);
export const nutritionLogBody = z
  .object({
    date: dateStr.optional(),
    mealType: z.enum(mealTypes),
    foodId: z.string().uuid().optional(),
    foodName: z.string().trim().min(1).max(120).optional(),
    quantityG: z.number().min(1).max(5000),
    calories: macro.optional(),
    protein: macro.optional(),
    carbs: macro.optional(),
    fat: macro.optional(),
    fiber: macro.optional(),
    source: z.enum(['MANUAL', 'DATABASE', 'AI_PHOTO', 'MEAL_PLAN']).optional(),
  })
  .refine((v) => v.foodId || (v.foodName && v.calories !== undefined), {
    message: 'Provide foodId, or foodName with calories for manual entry',
  });

export const rangeQuery = z.object({ from: dateStr.optional(), to: dateStr.optional(), days: z.coerce.number().int().min(1).max(365).optional(), date: dateStr.optional() });
export const waterBody = z.object({ amountMl: z.number().int().min(50).max(3000), date: dateStr.optional() });
export const sleepBody = z.object({ hours: z.number().min(0).max(24), quality: z.number().int().min(1).max(5).optional(), date: dateStr.optional() });
export const stepsBody = z.object({ steps: z.number().int().min(0).max(100000), date: dateStr.optional() });
export const mealPlanBody = z.object({ calories: z.number().int().min(1000).max(6000).optional(), useAI: z.boolean().default(true) }).default({});
