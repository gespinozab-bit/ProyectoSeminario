import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  user: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  role: { findMany: vi.fn() },
  refreshSession: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn());
vi.mock('../lib/prisma.js', () => ({ prisma: db }));
vi.mock('../services/audit.js', () => ({ writeAudit: audit }));
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn() } }));

import { errorHandler } from '../middleware/error-handler.js';
import { ACCESS_COOKIE, signAccessToken } from '../security/tokens.js';
import { verifyPassword } from '../security/password.js';
import { usersRouter } from './users.js';

const actorId = 'f9a8298e-66cd-4eb4-b9b2-55f3c8387cba';
const targetId = '2f2484db-d95d-4b50-aa7d-e193776078c3';
const app = express();
app.use(express.json(), cookieParser());
app.use('/api/users', usersRouter);
app.use(errorHandler);
const cookie = async () =>
  `${ACCESS_COOKIE}=${await signAccessToken({ sub: actorId, version: 0 })}`;
const permissions = [
  'users.read',
  'users.create',
  'users.update',
  'users.status',
  'users.roles.assign',
  'users.password.reset',
];
const account = () => ({
  id: targetId,
  email: 'docente@example.com',
  firstName: 'Ana',
  lastName: 'López',
  status: 'ACTIVE',
  mustChangePassword: true,
  lockedUntil: null,
  lastLoginAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  passwordHash: 'private-hash',
  tokenVersion: 0,
  roles: [{ role: { code: 'DOCENTE', permissions: [] } }],
});

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => {
    if (where.id !== actorId) return null;
    return {
      ...account(),
      id: actorId,
      mustChangePassword: false,
      roles: [
        {
          role: {
            code: 'ADMINISTRADOR',
            permissions: permissions.map((code) => ({ permission: { code } })),
          },
        },
      ],
    };
  });
  db.user.count.mockResolvedValue(21);
  db.user.findMany.mockResolvedValue([account()]);
  db.$transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
  db.role.findMany.mockResolvedValue([{ id: 'role-docente', code: 'DOCENTE' }]);
  db.user.create.mockResolvedValue(account());
  db.user.update.mockResolvedValue(account());
  db.refreshSession.updateMany.mockResolvedValue({ count: 1 });
  audit.mockResolvedValue(undefined);
});

describe('user management screens API', () => {
  it('rejects anonymous requests', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects teachers with valid sessions but no user permissions', async () => {
    db.user.findUnique.mockResolvedValue({ ...account(), id: actorId, mustChangePassword: false });
    expect(
      (
        await request(app)
          .get('/api/users')
          .set('Cookie', await cookie())
      ).status,
    ).toBe(403);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('requires the initial password change before user administration', async () => {
    db.user.findUnique.mockResolvedValue({ ...account(), id: actorId });
    const response = await request(app)
      .get('/api/users')
      .set('Cookie', await cookie());
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('paginates filtered accounts and never exposes password hashes', async () => {
    const response = await request(app)
      .get('/api/users?page=2&pageSize=20&search=Ana&role=DOCENTE&status=ACTIVE')
      .set('Cookie', await cookie());
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 2, pageSize: 20, total: 21, pages: 2 });
    expect(response.body.users[0].roles).toEqual(['DOCENTE']);
    expect(response.body.users[0]).not.toHaveProperty('passwordHash');
    expect(response.body.users[0]).not.toHaveProperty('tokenVersion');
    const query = db.user.findMany.mock.calls[0]![0];
    expect(query.skip).toBe(20);
    expect(query.take).toBe(20);
    expect(query.where).toEqual({
      status: 'ACTIVE',
      roles: { some: { role: { code: 'DOCENTE' } } },
      OR: [
        { firstName: { contains: 'Ana', mode: 'insensitive' } },
        { lastName: { contains: 'Ana', mode: 'insensitive' } },
        { email: { contains: 'Ana', mode: 'insensitive' } },
      ],
    });
    expect(db.user.count).toHaveBeenCalledWith({ where: query.where });
  });

  it.each(['page=0', 'pageSize=101', 'role=ESTUDIANTE', 'status=PUBLISHED'])(
    'rejects invalid filter %s',
    async (query) => {
      expect(
        (
          await request(app)
            .get(`/api/users?${query}`)
            .set('Cookie', await cookie())
        ).status,
      ).toBe(400);
      expect(db.user.findMany).not.toHaveBeenCalled();
    },
  );

  it('creates a teacher with a hashed temporary password and mandatory change', async () => {
    const password = 'TemporalDocente!42';
    const response = await request(app)
      .post('/api/users')
      .set('Cookie', await cookie())
      .send({
        firstName: 'Ana',
        lastName: 'López',
        email: ' DOCENTE@example.com ',
        roles: ['DOCENTE'],
        temporaryPassword: password,
      });
    expect(response.status).toBe(201);
    const created = db.user.create.mock.calls[0]![0].data;
    expect(created.email).toBe('docente@example.com');
    expect(created.mustChangePassword).toBe(true);
    expect(created.passwordHash).not.toBe(password);
    expect(await verifyPassword(created.passwordHash, password)).toBe(true);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(audit.mock.calls)).not.toContain(password);
  });

  it('rejects a duplicate email without creating another account', async () => {
    const original = db.user.findUnique.getMockImplementation()!;
    db.user.findUnique.mockImplementation((input) =>
      input.where.email ? Promise.resolve(account()) : original(input),
    );
    const response = await request(app)
      .post('/api/users')
      .set('Cookie', await cookie())
      .send({
        firstName: 'Ana',
        lastName: 'López',
        email: 'docente@example.com',
        roles: ['DOCENTE'],
        temporaryPassword: 'TemporalDocente!42',
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EMAIL_EXISTS');
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('prevents deactivation of the acting administrator', async () => {
    const response = await request(app)
      .patch(`/api/users/${actorId}/status`)
      .set('Cookie', await cookie())
      .send({ status: 'INACTIVE' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SELF_DEACTIVATION');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('prevents removal of the acting administrator role', async () => {
    const response = await request(app)
      .put(`/api/users/${actorId}/roles`)
      .set('Cookie', await cookie())
      .send({ roles: ['DOCENTE'] });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SELF_ROLE_CHANGE');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('resets a password, unlocks attempts, and revokes previous sessions', async () => {
    const original = db.user.findUnique.getMockImplementation()!;
    db.user.findUnique.mockImplementation((input) =>
      input.where.id === targetId ? Promise.resolve(account()) : original(input),
    );
    const password = 'NuevaTemporal!42';
    const response = await request(app)
      .post(`/api/users/${targetId}/reset-password`)
      .set('Cookie', await cookie())
      .send({ temporaryPassword: password });
    expect(response.status).toBe(204);
    const update = db.user.update.mock.calls[0]![0];
    expect(update.where).toEqual({ id: targetId });
    expect(update.data).toMatchObject({
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    });
    expect(await verifyPassword(update.data.passwordHash, password)).toBe(true);
    expect(db.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET', entityId: targetId }),
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain(password);
  });
});
