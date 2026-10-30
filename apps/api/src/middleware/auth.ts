import type { RequestHandler } from 'express';

import { UserStatus } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../security/tokens.js';
import { HttpError } from './error-handler.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
}

export const requireAuthentication: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) return next(new HttpError(401, 'Authentication required', 'AUTH_REQUIRED'));

  try {
    const claims = await verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.tokenVersion !== claims.version) {
      return next(new HttpError(401, 'Session expired', 'SESSION_EXPIRED'));
    }

    req.auth = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      mustChangePassword: user.mustChangePassword,
      roles: user.roles.map(({ role }) => role.code),
      permissions: [
        ...new Set(
          user.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          ),
        ),
      ],
    };
    next();
  } catch {
    next(new HttpError(401, 'Session expired', 'SESSION_EXPIRED'));
  }
};

export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.auth?.mustChangePassword) {
    return next(new HttpError(403, 'Password change required', 'PASSWORD_CHANGE_REQUIRED'));
  }
  next();
};

export const requirePermission =
  (permission: string): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth?.permissions.includes(permission)) {
      return next(new HttpError(403, 'Insufficient permissions', 'FORBIDDEN'));
    }
    next();
  };

export const requireRole =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth?.roles.some((role) => roles.includes(role))) {
      return next(new HttpError(403, 'Role not allowed', 'FORBIDDEN'));
    }
    next();
  };
