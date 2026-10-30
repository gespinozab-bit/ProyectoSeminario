import 'dotenv/config';
import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    SYSTEM_NAME: z.string().trim().min(1).max(120).default('LENSEGUA'),
    GRAPHQL_INTROSPECTION: z.enum(['true', 'false']).default('true'),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: z.enum(['true', 'false']).default('true'),
    DATABASE_URL: z.string().min(1).optional(),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    MEDIA_STORAGE_PATH: z.string().min(1).default('../../storage/media'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return;
    if (!value.DATABASE_URL)
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Production requires DATABASE_URL',
      });
    if (!value.WEB_ORIGIN.startsWith('https://'))
      context.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: 'Production requires an HTTPS origin',
      });
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET)
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT secrets must be different',
      });
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (/CHANGE_ME|GENERATE_|REPLACE_ME/i.test(value[key]))
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Replace placeholder secrets before deploying',
        });
    }
  });

export const env = envSchema.parse(process.env);
