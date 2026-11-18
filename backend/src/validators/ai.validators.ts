import { z } from 'zod';

export const chatBody = z.object({ message: z.string().trim().min(1).max(1000) });
export const forecastQuery = z.object({ days: z.coerce.number().int().min(7).max(90).default(28) });
