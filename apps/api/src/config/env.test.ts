import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

const valid = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:password@postgres:5432/app',
  WEB_ORIGIN: 'https://school.example.org',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
};

describe('production configuration', () => {
  it('accepts HTTPS with distinct secrets and one explicitly trusted proxy', () => {
    expect(envSchema.parse({ ...valid, TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS).toBe(1);
  });
  it('does not trust forwarded headers unless configured', () => {
    expect(envSchema.parse(valid).TRUST_PROXY_HOPS).toBe(0);
  });
  it.each([
    { WEB_ORIGIN: 'http://school.example.org' },
    { WEB_ORIGIN: 'invalid' },
    { DATABASE_URL: undefined },
    { JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET },
    { JWT_ACCESS_SECRET: 'CHANGE_ME_' + 'a'.repeat(40) },
    { TRUST_PROXY_HOPS: '2' },
  ])('rejects unsafe or invalid production values: %j', (override) => {
    expect(envSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});
