import { Router } from 'express';
import { z } from 'zod';

import { AuditAction, type Prisma, UserStatus } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import {
  requireAuthentication,
  requirePasswordChanged,
  requirePermission,
} from '../middleware/auth.js';
import { HttpError } from '../middleware/error-handler.js';
import { hashPassword, passwordSchema } from '../security/password.js';
import { writeAudit } from '../services/audit.js';
import { requestMetadata } from '../utils/request.js';

export const usersRouter = Router();

usersRouter.use(requireAuthentication, requirePasswordChanged);

const roleCodeSchema = z.enum(['ADMINISTRADOR', 'DOCENTE']);
const idSchema = z.string().uuid();
const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  temporaryPassword: passwordSchema,
  roles: z.array(roleCodeSchema).min(1).max(2),
});
const updateUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320).optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one field is required');
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
const rolesSchema = z.object({ roles: z.array(roleCodeSchema).min(1).max(2) });
const resetPasswordSchema = z.object({ temporaryPassword: passwordSchema });
const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: roleCodeSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const userInclude = { roles: { include: { role: true } } } as const;
const serializeUser = (user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: { role: { code: string } }[];
}) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  status: user.status,
  mustChangePassword: user.mustChangePassword,
  lockedUntil: user.lockedUntil,
  lastLoginAt: user.lastLoginAt,
  roles: user.roles.map(({ role }) => role.code),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

async function getRoles(codes: string[]) {
  const uniqueCodes = [...new Set(codes)];
  const roles = await prisma.role.findMany({ where: { code: { in: uniqueCodes } } });
  if (roles.length !== uniqueCodes.length) throw new HttpError(400, 'Invalid role', 'INVALID_ROLE');
  return roles;
}

usersRouter.get('/', requirePermission('users.read'), async (req, res) => {
  const query = listUsersSchema.parse(req.query);
  const where: Prisma.UserWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { roles: { some: { role: { code: query.role } } } } : {}),
    ...(query.search
      ? {
          OR: ['firstName', 'lastName', 'email'].map((field) => ({
            [field]: { contains: query.search, mode: 'insensitive' },
          })),
        }
      : {}),
  };
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  res.json({
    users: users.map(serializeUser),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      pages: Math.ceil(total / query.pageSize),
    },
  });
});

usersRouter.get('/:id', requirePermission('users.read'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!user) throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
  res.json({ user: serializeUser(user) });
});

usersRouter.post('/', requirePermission('users.create'), async (req, res) => {
  const input = createUserSchema.parse(req.body);
  const roles = await getRoles(input.roles);
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw new HttpError(409, 'Email already exists', 'EMAIL_EXISTS');
  }
  const passwordHash = await hashPassword(input.temporaryPassword);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
      mustChangePassword: true,
      roles: { create: roles.map(({ id }) => ({ roleId: id, assignedById: req.auth!.id })) },
    },
    include: userInclude,
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: AuditAction.CREATE,
    entityType: 'User',
    entityId: user.id,
    afterData: { email: user.email, roles: input.roles },
    ...requestMetadata(req),
  });
  res.status(201).json({ user: serializeUser(user) });
});

usersRouter.patch('/:id', requirePermission('users.update'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const input = updateUserSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!existing) throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
  if (input.email && input.email !== existing.email) {
    const duplicate = await prisma.user.findUnique({ where: { email: input.email } });
    if (duplicate) throw new HttpError(409, 'Email already exists', 'EMAIL_EXISTS');
  }
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.email ? { email: input.email } : {}),
      ...(input.firstName ? { firstName: input.firstName } : {}),
      ...(input.lastName ? { lastName: input.lastName } : {}),
    },
    include: userInclude,
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: AuditAction.UPDATE,
    entityType: 'User',
    entityId: id,
    beforeData: {
      email: existing.email,
      firstName: existing.firstName,
      lastName: existing.lastName,
    },
    afterData: input,
    ...requestMetadata(req),
  });
  res.json({ user: serializeUser(user) });
});

usersRouter.patch('/:id/status', requirePermission('users.status'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const input = statusSchema.parse(req.body);
  if (id === req.auth!.id && input.status === 'INACTIVE') {
    throw new HttpError(400, 'You cannot deactivate your own account', 'SELF_DEACTIVATION');
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
  const user = await prisma.user.update({
    where: { id },
    data: {
      status: input.status,
      ...(input.status === 'INACTIVE' ? { tokenVersion: { increment: 1 } } : {}),
    },
    include: userInclude,
  });
  if (input.status === 'INACTIVE') {
    await prisma.refreshSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await writeAudit({
    actorId: req.auth!.id,
    action: input.status === 'ACTIVE' ? AuditAction.UPDATE : AuditAction.DEACTIVATE,
    entityType: 'User',
    entityId: id,
    beforeData: { status: existing.status },
    afterData: { status: input.status },
    ...requestMetadata(req),
  });
  res.json({ user: serializeUser(user) });
});

usersRouter.put('/:id/roles', requirePermission('users.roles.assign'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const input = rolesSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!existing) throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
  if (id === req.auth!.id && !input.roles.includes('ADMINISTRADOR')) {
    throw new HttpError(400, 'You cannot remove your own administrator role', 'SELF_ROLE_CHANGE');
  }
  const roles = await getRoles(input.roles);
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: id } }),
    prisma.userRole.createMany({
      data: roles.map(({ id: roleId }) => ({ userId: id, roleId, assignedById: req.auth!.id })),
    }),
    prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } }),
    prisma.refreshSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: userInclude });
  await writeAudit({
    actorId: req.auth!.id,
    action: AuditAction.ASSIGN,
    entityType: 'UserRole',
    entityId: id,
    beforeData: { roles: existing.roles.map(({ role }) => role.code) },
    afterData: { roles: input.roles },
    ...requestMetadata(req),
  });
  res.json({ user: serializeUser(user) });
});

usersRouter.post(
  '/:id/reset-password',
  requirePermission('users.password.reset'),
  async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = resetPasswordSchema.parse(req.body);
    if (!(await prisma.user.findUnique({ where: { id } }))) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }
    const passwordHash = await hashPassword(input.temporaryPassword);
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await prisma.refreshSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit({
      actorId: req.auth!.id,
      action: AuditAction.PASSWORD_RESET,
      entityType: 'User',
      entityId: id,
      ...requestMetadata(req),
    });
    res.status(204).send();
  },
);
