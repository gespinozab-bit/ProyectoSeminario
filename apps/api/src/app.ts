import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { expressMiddleware } from '@as-integrations/express5';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.js';
import { contentsRouter } from './routes/contents.js';
import { healthRouter } from './routes/health.js';
import { mediaRouter } from './routes/media.js';
import { modulesRouter } from './routes/modules.js';
import { publicRouter } from './routes/public.js';
import { usersRouter } from './routes/users.js';
import { createGraphQLServer } from './graphql/server.js';
import { createEducationContext } from './graphql/education.js';
import { createMutationAccess } from './graphql/mutation-auth.js';

export const graphqlServer = createGraphQLServer();
await graphqlServer.start();

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.use(
    '/graphql',
    expressMiddleware(graphqlServer, {
      context: async ({ req, res }) =>
        createEducationContext(undefined, createMutationAccess(req, res)),
    }),
  );

  app.use('/api/health', healthRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/modules', modulesRouter);
  app.use('/api/contents', contentsRouter);
  app.use('/api', mediaRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
