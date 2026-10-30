// Run ONLY inside the maintenance container of the isolated rehearsal stack.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import https from 'node:https';
import argon2 from 'argon2';
import { prisma } from '../apps/api/dist/lib/prisma.js';

if (process.env.WEB_ORIGIN !== 'https://localhost:18443') {
  throw new Error('Esta prueba solo acepta el entorno de ensayo localhost:18443.');
}
const marker = randomUUID();
const ids = [];
const temporaryPassword = `Lg!7${randomBytes(24).toString('hex')}`;
const newPassword = `Lg!8${randomBytes(24).toString('hex')}`;

function call(method, pathname, body, cookies = '') {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: 'web',
        port: 443,
        path: pathname,
        method,
        // The local Caddy certificate is private to this disposable rehearsal.
        servername: 'localhost',
        rejectUnauthorized: false,
        headers: {
          Host: 'localhost',
          ...(cookies ? { Cookie: cookies } : {}),
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
          const setCookies = res.headers['set-cookie'] ?? [];
          resolve({
            status: res.statusCode,
            data,
            setCookies,
            cookies: setCookies.map((cookie) => cookie.split(';')[0]).join('; '),
          });
        });
      },
    );
    req.setTimeout(15_000, () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', reject);
    req.end(payload);
  });
}

try {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMINISTRADOR' } });
  const admin = await prisma.user.create({
    data: {
      email: `${marker}-admin@rehearsal.example`,
      firstName: 'Ensayo',
      lastName: 'Administrador',
      mustChangePassword: false,
      passwordHash: await argon2.hash(temporaryPassword),
      roles: { create: { roleId: role.id } },
    },
  });
  ids.push(admin.id);
  assert.equal((await call('GET', '/')).status, 200);
  assert.equal((await call('GET', '/admin/usuarios')).status, 200);
  assert.equal((await call('GET', '/api/health')).data.database, 'connected');
  assert.equal((await call('GET', '/api/public/modules')).status, 200);
  assert.equal((await call('GET', '/api/users')).status, 401);

  const login = await call('POST', '/api/auth/login', {
    email: admin.email,
    password: temporaryPassword,
  });
  assert.equal(login.status, 200);
  assert.ok(
    login.setCookies.every(
      (cookie) =>
        /; Secure/i.test(cookie) && /; HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie),
    ),
  );
  const adminCookies = login.cookies;
  const teacherEmail = `${marker}-teacher@rehearsal.example`;
  const created = await call(
    'POST',
    '/api/users',
    {
      email: teacherEmail,
      firstName: 'Ensayo',
      lastName: 'Docente',
      temporaryPassword,
      roles: ['DOCENTE'],
    },
    adminCookies,
  );
  assert.equal(created.status, 201);
  const teacherId = created.data.user.id;
  ids.push(teacherId);
  const listed = await call(
    'GET',
    `/api/users?search=${encodeURIComponent(teacherEmail)}`,
    undefined,
    adminCookies,
  );
  assert.equal(listed.data.pagination.total, 1);
  const teacherLogin = await call('POST', '/api/auth/login', {
    email: teacherEmail,
    password: temporaryPassword,
  });
  assert.equal(teacherLogin.status, 200);
  assert.equal(teacherLogin.data.user.mustChangePassword, true);
  let teacherCookies = teacherLogin.cookies;
  assert.equal((await call('GET', '/api/modules', undefined, teacherCookies)).status, 403);
  const changed = await call(
    'POST',
    '/api/auth/change-password',
    { currentPassword: temporaryPassword, newPassword },
    teacherCookies,
  );
  assert.equal(changed.status, 200);
  teacherCookies = changed.cookies || teacherCookies;
  const denied = await call('GET', '/api/users', undefined, teacherCookies);
  assert.equal(denied.status, 403);
  assert.equal(denied.data.code, 'FORBIDDEN');
  assert.equal(
    (
      await call(
        'POST',
        `/api/users/${teacherId}/reset-password`,
        { temporaryPassword },
        adminCookies,
      )
    ).status,
    204,
  );
  assert.equal((await call('GET', '/api/auth/me', undefined, teacherCookies)).status, 401);
  assert.equal(
    (await call('POST', '/api/auth/login', { email: teacherEmail, password: newPassword })).status,
    401,
  );
  assert.equal(
    (await call('POST', '/api/auth/login', { email: teacherEmail, password: temporaryPassword }))
      .status,
    200,
  );
  assert.equal(
    (await call('PATCH', `/api/users/${teacherId}/status`, { status: 'INACTIVE' }, adminCookies))
      .status,
    200,
  );
  assert.equal(
    (await call('POST', '/api/auth/login', { email: teacherEmail, password: temporaryPassword }))
      .status,
    401,
  );
  assert.equal(
    (await call('PATCH', `/api/users/${teacherId}/status`, { status: 'ACTIVE' }, adminCookies))
      .status,
    200,
  );
  assert.equal(
    (
      await call(
        'PUT',
        `/api/users/${teacherId}/roles`,
        { roles: ['DOCENTE', 'ADMINISTRADOR'] },
        adminCookies,
      )
    ).status,
    200,
  );
  console.log(
    'Ensayo HTTPS aprobado: web, rutas internas, base, cookies Secure/HttpOnly, creación, permisos, cambio y recuperación de contraseña, estados y roles.',
  );
} finally {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }, { entityId: { contains: marker } }],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
