import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

type Target = 'body' | 'query' | 'params';

/** Validates and REPLACES req[target] with the parsed (coerced, stripped) value. */
export const validate =
  (schema: ZodSchema, target: Target = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) return next(result.error);
    (req as any)[target] = result.data;
    next();
  };
