import rateLimit from 'express-rate-limit';

const base = { standardHeaders: true, legacyHeaders: false };
export const globalLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300 });
export const authLimiter = rateLimit({
  ...base, windowMs: 15 * 60_000, limit: 30,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});
export const aiLimiter = rateLimit({
  ...base, windowMs: 60_000, limit: 20,
  message: { error: { code: 'RATE_LIMITED', message: 'AI request limit reached, slow down a little' } },
});
