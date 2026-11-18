import { z } from 'zod';

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const optionalDateQuery = z.object({ date: dateStr.optional() });
export const idParam = z.object({ id: z.string().uuid() });
export const stringList = z.array(z.string().trim().min(1).max(60)).max(30).default([]);

export const goalTypes = [
  'WEIGHT_LOSS', 'FAT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS', 'BODY_RECOMPOSITION',
] as const;
export const mealTypes = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'] as const;
