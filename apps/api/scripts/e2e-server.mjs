import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import argon2 from 'argon2';

// No se carga dotenv ni se acepta una conexión externa para preparar datos.
if (process.env.NODE_ENV !== 'test' || process.env.LENSEGUA_E2E !== '1') {
  throw new Error('E2E requiere NODE_ENV=test y LENSEGUA_E2E=1. Producción está bloqueada.');
}

const root = fileURLToPath(new URL('../../../', import.meta.url));
const webUrl = 'http://127.0.0.1:5174';
const apiUrl = 'http://127.0.0.1:3101';
const mediaDirectory = await mkdtemp(join(tmpdir(), 'lensegua-e2e-'));
const db = await PGlite.create(); // Siempre memoria: nunca un directorio ni DATABASE_URL.
const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 20 });
let api;
let web;
let prisma;
let closing = false;
let schemaReady = false;

async function close() {
  if (closing) return;
  closing = true;
  if (web && web.exitCode === null) {
    const exited = once(web, 'exit');
    web.kill();
    await exited;
  }
  if (api) await new Promise((resolve) => api.close(resolve));
  await prisma?.$disconnect();
  await socket.stop();
  await db.close();
  await rm(mediaDirectory, { recursive: true, force: true });
}

const permissions = [
  'users.manage',
  'users.read',
  'users.create',
  'users.update',
  'users.status',
  'users.roles.assign',
  'users.password.reset',
  'modules.read',
  'modules.order',
  'modules.status',
  'roles.manage',
  'content.read',
  'content.create',
  'content.update',
  'content.publish',
  'content.deactivate',
  'media.read',
  'media.create',
  'media.update',
  'media.deactivate',
];
const teacherPermissions = new Set([
  'modules.read',
  'content.read',
  'content.create',
  'content.update',
  'content.publish',
  'media.read',
  'media.create',
  'media.update',
  'media.deactivate',
]);

function password(name) {
  const value = process.env[name] ?? `Aa1!${randomBytes(24).toString('hex')}`;
  if (
    value.length < 12 ||
    value.length > 128 ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/[0-9]/.test(value) ||
    !/[^A-Za-z0-9]/.test(value)
  ) {
    throw new Error(`${name} debe cumplir la política de contraseñas (12–128 caracteres).`);
  }
  return value;
}

const administratorPassword = password('E2E_ADMIN_PASSWORD');
const teacherPassword = password('E2E_TEACHER_PASSWORD');

async function reset() {
  if (process.env.NODE_ENV !== 'test' || process.env.LENSEGUA_E2E !== '1') {
    throw new Error('Reinicio permitido únicamente en pruebas.');
  }
  await prisma?.$disconnect();
  // Solo la instancia privada en memoria creada arriba puede recibir este SQL.
  // Conservar los tipos evita invalidar sus OID en las consultas preparadas de Prisma.
  if (!schemaReady) {
    const migrations = join(root, 'apps/api/prisma/migrations');
    for (const entry of (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await db.exec(await readFile(join(migrations, entry.name, 'migration.sql'), 'utf8'));
    }
    schemaReady = true;
  }
  await db.exec(
    'TRUNCATE users, roles, permissions, educational_modules, educational_contents, media_assets, audit_logs, refresh_sessions, user_roles, role_permissions RESTART IDENTITY CASCADE;',
  );
  const adminId = randomUUID();
  const teacherId = randomUUID();
  const moduleId = randomUUID();
  const contentId = randomUUID();
  await db.transaction(async (tx) => {
    const roles = [randomUUID(), randomUUID()];
    for (const [index, code] of ['ADMINISTRADOR', 'DOCENTE'].entries()) {
      await tx.query(
        'INSERT INTO roles (id, code, name, is_system, updated_at) VALUES ($1,$2,$2,true,now())',
        [roles[index], code],
      );
    }
    for (const code of permissions) {
      const id = randomUUID();
      await tx.query(
        'INSERT INTO permissions (id, code, name, updated_at) VALUES ($1,$2,$2,now())',
        [id, code],
      );
      await tx.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)', [
        roles[0],
        id,
      ]);
      if (teacherPermissions.has(code))
        await tx.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)', [
          roles[1],
          id,
        ]);
    }
    for (const [index, [id, email, name, secret]] of [
      [adminId, 'admin@e2e.lensegua.test', 'Administrador', administratorPassword],
      [teacherId, 'docente@e2e.lensegua.test', 'Docente', teacherPassword],
    ].entries()) {
      const hash = await argon2.hash(secret, { type: argon2.argon2id });
      await tx.query(
        "INSERT INTO users (id,email,first_name,last_name,password_hash,status,must_change_password,updated_at) VALUES ($1,$2,$3,'E2E',$4,'ACTIVE',false,now())",
        [id, email, name, hash],
      );
      await tx.query('INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2)', [id, roles[index]]);
    }
    await tx.query(
      "INSERT INTO educational_modules (id,code,slug,title,status,sort_order,updated_at) VALUES ($1,'VOCALES','vocales','Vocales','PUBLISHED',1,now())",
      [moduleId],
    );
    await tx.query(
      "INSERT INTO educational_contents (id,module_id,slug,title,body,status,sort_order,created_by_id,updated_by_id,updated_at) VALUES ($1,$2,'la-vocal-a','La vocal A',$3,'DRAFT',1,$4,$4,now())",
      [contentId, moduleId, JSON.stringify({ text: 'Aprendemos la vocal A.' }), teacherId],
    );
  });
  // Solo identificadores públicos; las contraseñas nunca salen por IPC o logs.
  return { adminId, teacherId, moduleId, contentId };
}

try {
  await socket.start();
  const connection = socket.getServerConn();
  Object.assign(process.env, {
    // Marca interna: la integración solo corre cuando este proceso creó PGlite.
    LENSEGUA_TEST_DATABASE: 'pglite-memory',
    DATABASE_URL: connection.startsWith('postgres')
      ? connection
      : `postgresql://postgres:postgres@${connection}/postgres`,
    PORT: '3101',
    WEB_ORIGIN: webUrl,
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    MEDIA_STORAGE_PATH: mediaDirectory,
    LOG_LEVEL: 'fatal',
    LOG_PRETTY: 'false',
  });
  const { createApp } = await import('../src/app.ts');
  ({ prisma } = await import('../src/lib/prisma.ts'));
  await reset();
  if (process.argv.includes('--verify-project-tests')) {
    if (!process.env.npm_execpath) throw new Error('Ejecuta esta opción mediante npm.');
    const verification = spawn(process.execPath, [process.env.npm_execpath, 'test'], {
      cwd: root,
      env: { ...process.env },
      stdio: 'inherit',
      windowsHide: true,
    });
    const [code] = await once(verification, 'exit');
    await close();
    process.exit(code ?? 1);
  }
  api = createApp().listen(3101, '127.0.0.1');
  await once(api, 'listening');
  web = spawn(
    process.execPath,
    [
      join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5174',
      '--strictPort',
      '--mode',
      'test',
    ],
    {
      cwd: join(root, 'apps/web'),
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'development', VITE_API_URL: apiUrl },
    },
  );
  web.on('error', (error) => {
    console.error(error.message);
    void close().finally(() => process.exit(1));
  });
  const deadline = Date.now() + 30000;
  while (true) {
    if (web.exitCode !== null)
      throw new Error('El frontend E2E no pudo iniciar; comprueba el puerto 5174.');
    try {
      const [frontend, backend] = await Promise.all([
        fetch(webUrl, { signal: AbortSignal.timeout(1000) }),
        fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(1000) }),
      ]);
      if (frontend.ok && backend.ok) break;
    } catch {
      /* Esperar hasta que frontend y backend estén disponibles. */
    }
    if (Date.now() > deadline) throw new Error('El frontend o backend E2E no respondió.');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  process.send?.({ ready: true });
  console.log(`Entorno E2E en memoria listo: ${webUrl} / ${apiUrl}`);
  let queue = Promise.resolve();
  process.on('message', (message) => {
    if (message !== 'reset') return;
    queue = queue.then(async () => {
      try {
        process.send?.({ data: await reset() });
      } catch {
        process.send?.({ error: 'No se pudieron reiniciar los datos E2E.' });
      }
    });
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'disconnect']) {
    process.on(signal, () => {
      void close().finally(() => process.exit());
    });
  }
} catch (error) {
  console.error(error.message);
  await close();
  process.exitCode = 1;
}
