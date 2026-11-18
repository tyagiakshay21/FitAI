import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { randomToken, sha256, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens';
import { sendMail } from '../utils/mailer';

const publicUser = (u: { id: string; email: string; name: string; role: string }) => ({
  id: u.id, email: u.email, name: u.name, role: u.role,
});

async function issueTokens(user: { id: string; role: 'USER' | 'ADMIN' | 'TRAINER' }) {
  const refreshToken = signRefreshToken(user.id);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    },
  });
  return { accessToken: signAccessToken(user.id, user.role), refreshToken };
}

export async function register(input: { name: string; email: string; password: string }) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw AppError.conflict('An account with this email already exists');
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      subscription: { create: {} },
    },
  });
  return { user: publicUser(user), onboardingCompleted: false, ...(await issueTokens(user)) };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  // Same message for unknown email / wrong password to avoid account enumeration.
  const ok = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) throw AppError.unauthorized('Invalid email or password');
  return {
    user: publicUser(user),
    onboardingCompleted: !!user.profile?.onboardingCompleted,
    ...(await issueTokens(user)),
  };
}

/** Rotating refresh tokens; re-use of a revoked token revokes the whole family (theft signal). */
export async function refresh(token?: string) {
  if (!token) throw AppError.unauthorized('Missing refresh token');
  let payload;
  try { payload = verifyRefreshToken(token); } catch { throw AppError.unauthorized('Invalid refresh token'); }
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!stored) throw AppError.unauthorized('Invalid refresh token');
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw AppError.unauthorized('Refresh token reuse detected — please sign in again');
  }
  if (stored.expiresAt < new Date()) throw AppError.unauthorized('Refresh token expired');
  const user = await prisma.user.findUnique({ where: { id: payload.sub as string }, include: { profile: true } });
  if (!user || !user.isActive) throw AppError.unauthorized();
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return {
    user: publicUser(user),
    onboardingCompleted: !!user.profile?.onboardingCompleted,
    ...(await issueTokens(user)),
  };
}

export async function logout(token?: string) {
  if (!token) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // never reveal whether the email exists
  const token = randomToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  await sendMail(
    user.email,
    'Reset your FitAI password',
    `Hi ${user.name},\n\nUse this link to set a new password (valid for 30 minutes):\n${env.CLIENT_URL}/reset-password?token=${token}\n\nIf you didn't request this, ignore this email.`,
  );
}

export async function resetPassword(token: string, password: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) throw AppError.badRequest('Reset link is invalid or has expired');
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true, subscription: true } });
  if (!user) throw AppError.unauthorized();
  return {
    user: publicUser(user),
    onboardingCompleted: !!user.profile?.onboardingCompleted,
    plan: user.subscription?.plan ?? 'FREE',
  };
}
