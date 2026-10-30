import { randomUUID } from 'node:crypto';

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { AuditAction, UserStatus } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { requireAuthentication } from '../middleware/auth.js';
import { HttpError } from '../middleware/error-handler.js';
import { hashPassword, passwordSchema, verifyPassword } from '../security/password.js';
import {
  clearAuthCookies,
  hashToken,
  newTokenId,
  REFRESH_COOKIE,
  refreshCookieMaxAge,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../security/tokens.js';
import { writeAudit } from '../services/audit.js';
import { requestMetadata } from '../utils/request.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.', code: 'RATE_LIMITED' },
});

const authUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  mustChangePassword: true,
  tokenVersion: true,
  status: true,
  passwordHash: true,
  lockedUntil: true,
  failedLoginAttempts: true,
  roles: {
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  },
} as const;

const publicUser = (user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  roles: {
    role: { code: string; permissions: { permission: { code: string } }[] };
  }[];
}) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  mustChangePassword: user.mustChangePassword,
  roles: user.roles.map(({ role }) => role.code),
  permissions: [
    ...new Set(
      user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code)),
    ),
  ],
});

async function issueSession(
  user: { id: string; tokenVersion: number },
  req: Parameters<typeof requestMetadata>[0],
  familyId: string = randomUUID(),
) {
  const sessionId = newTokenId();
  const accessToken = await signAccessToken({ sub: user.id, version: user.tokenVersion });
  const refreshToken = await signRefreshToken({
    type: 'refresh',
    sub: user.id,
    version: user.tokenVersion,
    sessionId,
    familyId,
  });

  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + refreshCookieMaxAge),
      ...requestMetadata(req),
    },
  });

  return { accessToken, refreshToken };
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: authUserSelect,
  });
  const invalid = () => new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

  if (!user || !user.passwordHash || user.status !== UserStatus.ACTIVE) {
    await writeAudit({
      action: AuditAction.LOGIN_FAILURE,
      entityType: 'User',
      entityId: user?.id ?? input.email,
      metadata: { reason: 'invalid_credentials' },
      ...requestMetadata(req),
    });
    throw invalid();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new HttpError(423, 'Account temporarily locked', 'ACCOUNT_LOCKED');
  }

  const validPassword = await verifyPassword(user.passwordHash, input.password);
  if (!validPassword) {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
    await writeAudit({
      actorId: user.id,
      action: AuditAction.LOGIN_FAILURE,
      entityType: 'User',
      entityId: user.id,
      metadata: { reason: 'invalid_credentials', attempts },
      ...requestMetadata(req),
    });
    if (lockedUntil) throw new HttpError(423, 'Account temporarily locked', 'ACCOUNT_LOCKED');
    throw invalid();
  }

  const allowed = user.roles.some(({ role }) => ['ADMINISTRADOR', 'DOCENTE'].includes(role.code));
  if (!allowed) throw invalid();

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  const tokens = await issueSession(user, req);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  await writeAudit({
    actorId: user.id,
    action: AuditAction.LOGIN_SUCCESS,
    entityType: 'User',
    entityId: user.id,
    ...requestMetadata(req),
  });
  res.json({ user: publicUser(user) });
});

authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw new HttpError(401, 'Refresh session required', 'SESSION_EXPIRED');

  let claims;
  try {
    claims = await verifyRefreshToken(token);
  } catch {
    clearAuthCookies(res);
    throw new HttpError(401, 'Refresh session expired', 'SESSION_EXPIRED');
  }

  const session = await prisma.refreshSession.findUnique({
    where: { id: claims.sessionId },
    include: { user: { select: authUserSelect } },
  });
  const invalidSession =
    !session ||
    session.tokenHash !== hashToken(token) ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date() ||
    session.user.status !== UserStatus.ACTIVE ||
    session.user.tokenVersion !== claims.version;

  if (invalidSession) {
    if (session) {
      await prisma.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearAuthCookies(res);
    throw new HttpError(401, 'Refresh session expired', 'SESSION_EXPIRED');
  }

  await prisma.refreshSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date(), lastUsedAt: new Date() },
  });
  const tokens = await issueSession(session.user, req, session.familyId);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.json({ user: publicUser(session.user) });
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  let actorId: string | undefined;

  if (token) {
    try {
      const claims = await verifyRefreshToken(token);
      actorId = claims.sub;
      await prisma.refreshSession.updateMany({
        where: { id: claims.sessionId, tokenHash: hashToken(token) },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Invalid cookies are still cleared without exposing verification details.
    }
  }

  clearAuthCookies(res);
  if (actorId) {
    await writeAudit({
      actorId,
      action: AuditAction.LOGOUT,
      entityType: 'User',
      entityId: actorId,
      ...requestMetadata(req),
    });
  }
  res.status(204).send();
});

authRouter.get('/me', requireAuthentication, (req, res) => {
  res.json({ user: req.auth });
});

authRouter.post('/change-password', requireAuthentication, async (req, res) => {
  const input = changePasswordSchema.parse(req.body);
  const auth = req.auth!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.id } });

  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new HttpError(400, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }
  if (await verifyPassword(user.passwordHash, input.newPassword)) {
    throw new HttpError(400, 'New password must be different', 'PASSWORD_REUSED');
  }

  const passwordHash = await hashPassword(input.newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    select: authUserSelect,
  });
  await prisma.refreshSession.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const tokens = await issueSession(updated, req);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  await writeAudit({
    actorId: user.id,
    action: AuditAction.PASSWORD_CHANGE,
    entityType: 'User',
    entityId: user.id,
    ...requestMetadata(req),
  });
  res.json({ user: publicUser(updated) });
});
