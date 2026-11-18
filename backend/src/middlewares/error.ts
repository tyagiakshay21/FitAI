import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { isProd } from '../config/env';

export const notFound = (req: Request, _res: Response, next: NextFunction) =>
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten().fieldErrors },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'Record already exists' } });
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL', message: isProd ? 'Something went wrong' : String((err as Error)?.message ?? err) },
  });
}
