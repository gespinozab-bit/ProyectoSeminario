import { defineConfig } from 'cypress';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
let server: ChildProcess | undefined;

function message(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Tiempo agotado al preparar E2E.')), 60000);
    const onExit = () => finish(new Error('El entorno E2E terminó inesperadamente.'));
    const onError = (error: Error) => finish(error);
    const onMessage = (value: Record<string, unknown>) => {
      if (value.error) finish(new Error(String(value.error)));
      else finish(undefined, value);
    };
    function finish(error?: Error, value?: Record<string, unknown>) {
      clearTimeout(timer);
      server?.off('exit', onExit);
      server?.off('error', onError);
      server?.off('message', onMessage);
      if (error) reject(error);
      else resolve(value!);
    }
    server!.once('exit', onExit);
    server!.once('error', onError);
    server!.once('message', onMessage);
  });
}

export default defineConfig({
  e2e: {
    // Cypress permite sobrescribir este valor mediante CYPRESS_BASE_URL.
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    async setupNodeEvents(on, config) {
      if (process.env.NODE_ENV === 'test' && process.env.LENSEGUA_E2E === '1') {
        if (config.baseUrl !== 'http://127.0.0.1:5174') {
          throw new Error('El entorno aislado requiere CYPRESS_BASE_URL=http://127.0.0.1:5174.');
        }
        process.env.E2E_ADMIN_PASSWORD ??= `Aa1!${randomBytes(24).toString('hex')}`;
        server = fork(
          fileURLToPath(new URL('../api/scripts/e2e-server.mjs', import.meta.url)),
          [],
          {
            execArgv: ['--import', pathToFileURL(require.resolve('tsx')).href],
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
            windowsHide: true,
          },
        );
        process.once('exit', () => {
          if (server?.connected) server.disconnect();
        });
        await message();
      }
      on('task', {
        'auth:adminPassword'() {
          if (
            process.env.NODE_ENV !== 'test' ||
            process.env.LENSEGUA_E2E !== '1' ||
            config.baseUrl !== 'http://127.0.0.1:5174' ||
            !server?.connected
          ) {
            throw new Error('Credenciales disponibles únicamente en el entorno E2E aislado.');
          }
          return process.env.E2E_ADMIN_PASSWORD!;
        },
        async 'db:reset'() {
          if (
            process.env.NODE_ENV !== 'test' ||
            process.env.LENSEGUA_E2E !== '1' ||
            config.baseUrl !== 'http://127.0.0.1:5174'
          ) {
            throw new Error(
              'Datos E2E: exige NODE_ENV=test, LENSEGUA_E2E=1 y CYPRESS_BASE_URL=http://127.0.0.1:5174.',
            );
          }
          if (!server?.connected) throw new Error('El entorno E2E no está iniciado.');
          const result = message();
          server.send('reset');
          return (await result).data;
        },
      });
      const stop = () => {
        if (server?.connected) server.disconnect();
        server = undefined;
      };
      on('after:run', stop);
      process.once('exit', stop);
      return config;
    },
  },
});
