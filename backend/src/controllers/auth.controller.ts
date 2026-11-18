import { CookieOptions, Request, Response } from 'express';
import * as auth from '../services/auth.service';
import { env, isProd } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';

const COOKIE = 'refresh_token';
const cookieOpts: CookieOptions = {
  httpOnly: true, secure: isProd, sameSite: isProd ? 'strict' : 'lax', path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};
const send = (res: Response, status: number, r: { refreshToken: string } & Record<string, unknown>) => {
  const { refreshToken, ...body } = r;
  res.cookie(COOKIE, refreshToken, cookieOpts).status(status).json(body);
};

export const register = asyncHandler(async (req, res) => send(res, 201, await auth.register(req.body)));
export const login = asyncHandler(async (req, res) => send(res, 200, await auth.login(req.body.email, req.body.password)));
export const refresh = asyncHandler(async (req, res) => send(res, 200, await auth.refresh(req.cookies?.[COOKIE])));
export const logout = asyncHandler(async (req, res) => {
  await auth.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined }).status(204).end();
});
export const forgot = asyncHandler(async (req, res) => {
  await auth.forgotPassword(req.body.email);
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});
export const reset = asyncHandler(async (req, res) => {
  await auth.resetPassword(req.body.token, req.body.password);
  res.json({ message: 'Password updated. Please sign in.' });
});
export const me = asyncHandler(async (req: Request, res) => res.json(await auth.me(req.user!.id)));
