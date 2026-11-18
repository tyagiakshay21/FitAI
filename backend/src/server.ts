import { createApp } from './app';
import { prisma } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';

const app = createApp();
const server = app.listen(env.PORT, () => logger.info(`FitAI API listening on :${env.PORT}`));

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
