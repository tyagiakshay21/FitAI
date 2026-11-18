import { z } from 'zod';
import { dateStr } from './common';

export const weightBody = z.object({ weightKg: z.number().min(30).max(300), date: dateStr.optional() });
const cm = (min: number, max: number) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(min).max(max).optional());
// Fields arrive as multipart strings when a photo is attached, hence the preprocess.
export const measurementBody = z
  .object({
    date: dateStr.optional(),
    waistCm: cm(30, 200), chestCm: cm(30, 200), armsCm: cm(10, 80),
    thighsCm: cm(20, 120), hipsCm: cm(30, 200), bodyFatPct: cm(3, 60),
  })
  .refine((v) => Object.entries(v).some(([k, val]) => k !== 'date' && val !== undefined), {
    message: 'Enter at least one measurement',
  });
export const daysQuery = z.object({ days: z.coerce.number().int().min(7).max(730).default(90) });
