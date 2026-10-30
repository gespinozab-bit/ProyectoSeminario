import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('oculta Bearer y cookies al escribir logs reales', () => {
  const require = createRequire(import.meta.url);
  const source = `
    const { logger } = await import(${JSON.stringify(new URL('./logger.ts', import.meta.url).href)});
    logger.info({ req: { headers: { authorization: 'Bearer PRIVATE_TEST_TOKEN', cookie: 'PRIVATE_TEST_COOKIE' } }, res: { headers: { 'set-cookie': 'PRIVATE_TEST_SESSION' } } }, 'redaction test');
  `;
  const result = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(require.resolve('tsx')).href, '--input-type=module', '-e', source],
    {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        LOG_PRETTY: 'false',
        JWT_ACCESS_SECRET: 'a'.repeat(64),
        JWT_REFRESH_SECRET: 'b'.repeat(64),
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).not.toMatch(/PRIVATE_TEST_TOKEN|PRIVATE_TEST_COOKIE|PRIVATE_TEST_SESSION/);
  const output = JSON.parse(result.stdout.trim());
  expect(output.req.headers.authorization).toBe('[REDACTED]');
  expect(output.req.headers.cookie).toBe('[REDACTED]');
  expect(output.res.headers['set-cookie']).toBe('[REDACTED]');
}, 15000);
