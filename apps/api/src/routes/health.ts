import type { HealthResponse } from '@lensegua/shared';
import { Router } from 'express';

import { prisma } from '../lib/prisma.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;

  const response: HealthResponse = {
    status: 'ok',
    service: 'lensegua-api',
    database: 'connected',
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(response);
});
