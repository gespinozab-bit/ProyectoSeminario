import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const script = fileURLToPath(new URL('./e2e-server.mjs', import.meta.url));
const execArgv = ['--import', pathToFileURL(require.resolve('tsx')).href];

test('bloquea producción incluso con la bandera E2E', () => {
  const result = spawnSync(process.execPath, [...execArgv, script], {
    env: { ...process.env, NODE_ENV: 'production', LENSEGUA_E2E: '1' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Producción está bloqueada/);
});

test(
  'usuarios utilizables, borrador aislado y reinicio de los datos',
  { timeout: 90000 },
  async () => {
    const secret = `Aa1!${randomBytes(24).toString('hex')}`;
    const child = fork(script, [], {
      execArgv,
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      windowsHide: true,
      // Si el mecanismo usara DATABASE_URL, este destino inválido haría fallar la prueba.
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LENSEGUA_E2E: '1',
        DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/never_touch',
        E2E_ADMIN_PASSWORD: secret,
        E2E_TEACHER_PASSWORD: secret,
      },
    });
    async function receive() {
      const [value] = await once(child, 'message', { signal: AbortSignal.timeout(60000) });
      assert.equal(value.error, undefined);
      return value;
    }
    async function reset() {
      const response = receive();
      child.send('reset');
      return (await response).data;
    }
    const origin = 'http://127.0.0.1:3101';
    async function login(email, role) {
      const response = await fetch(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: secret }),
      });
      assert.equal(response.status, 200);
      const { user } = await response.json();
      assert.deepEqual(user.roles, [role]);
      assert.equal(user.mustChangePassword, false);
      return response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
    }
    try {
      assert.equal((await receive()).ready, true);
      const first = await reset();
      await login('admin@e2e.lensegua.test', 'ADMINISTRADOR');
      const cookie = await login('docente@e2e.lensegua.test', 'DOCENTE');
      const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
      const modules = await (await fetch(`${origin}/api/public/modules`)).json();
      assert.equal(modules.modules.length, 1);
      assert.equal(modules.modules[0].title, 'Vocales');
      assert.equal(modules.modules[0].lessonCount, 0);
      const initial = await fetch(`${origin}/api/contents/${first.contentId}`, { headers });
      assert.equal(initial.status, 200);
      assert.match(await initial.text(), /DRAFT/);
      const upload = new FormData();
      upload.append(
        'file',
        new Blob(
          [await readFile(new URL('../../web/cypress/fixtures/vocal-a.png', import.meta.url))],
          { type: 'image/png' },
        ),
        'vocal-a.png',
      );
      const uploaded = await fetch(`${origin}/api/contents/${first.contentId}/media`, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: upload,
      });
      assert.equal(uploaded.status, 201, await uploaded.text());
      const changed = await fetch(`${origin}/api/contents/${first.contentId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title: 'Modificado durante la prueba' }),
      });
      assert.equal(changed.status, 200);
      const second = await reset();
      assert.notEqual(first.contentId, second.contentId);
      const freshCookie = await login('docente@e2e.lensegua.test', 'DOCENTE');
      const content = await fetch(`${origin}/api/contents/${second.contentId}`, {
        headers: { Cookie: freshCookie },
      });
      assert.equal(content.status, 200);
      const text = await content.text();
      assert.match(text, /La vocal A/);
      assert.match(text, /DRAFT/);
      assert.doesNotMatch(text, /Modificado durante/);
      assert.equal(
        (
          await fetch(`${origin}/api/contents/${first.contentId}`, {
            headers: { Cookie: freshCookie },
          })
        ).status,
        404,
      );
      assert.equal(
        (await fetch(`${origin}/api/auth/me`, { headers: { Cookie: cookie } })).status,
        401,
      );
      const examples = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('./graphql-examples.mjs', import.meta.url))],
        {
          env: { ...process.env, NODE_ENV: 'test', LENSEGUA_E2E: '1', E2E_ADMIN_PASSWORD: secret },
          encoding: 'utf8',
          windowsHide: true,
          timeout: 30000,
        },
      );
      assert.equal(examples.status, 0, examples.stderr || examples.stdout);
      assert.match(examples.stdout, /Ejemplos GraphQL: OK/);
    } finally {
      const exited = once(child, 'exit');
      if (child.connected) child.disconnect();
      await exited;
    }
  },
);
