import pino from 'pino';

import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers.set-cookie',
      'password',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development' && env.LOG_PRETTY === 'true'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }
    : {}),
});
