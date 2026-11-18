import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';

export const users = asyncHandler(async (_req, res) =>
  res.json(await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 200 })));
export const setRole = asyncHandler(async (req, res) =>
  res.json(await prisma.user.update({ where: { id: req.params.id }, data: { role: req.body.role }, select: { id: true, role: true } })));
export const setActive = asyncHandler(async (req, res) =>
  res.json(await prisma.user.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive }, select: { id: true, isActive: true } })));
