import { createHash, randomUUID } from 'node:crypto';

import type { Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';

import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'lensegua_access';
export const REFRESH_COOKIE = 'lensegua_refresh';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

interface BaseClaims {
  sub: string;
  version: number;
}

export interface AccessClaims extends BaseClaims {
  type: 'access';
}

export interface RefreshClaims extends BaseClaims {
  type: 'refresh';
  sessionId: string;
  familyId: string;
}

export const accessCookieMaxAge = env.JWT_ACCESS_TTL_MINUTES * 60 * 1000;
export const refreshCookieMaxAge = env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

const cookieBase = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? ('strict' as const) : ('lax' as const),
};

export const signAccessToken = ({ sub, version }: BaseClaims) =>
  new SignJWT({ type: 'access', version })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_MINUTES}m`)
    .sign(accessSecret);

export const signRefreshToken = ({ sub, version, sessionId, familyId }: RefreshClaims) =>
  new SignJWT({ type: 'refresh', version, sessionId, familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_REFRESH_TTL_DAYS}d`)
    .sign(refreshSecret);

export const verifyAccessToken = async (token: string): Promise<AccessClaims> => {
  const { payload } = await jwtVerify(token, accessSecret);
  if (
    payload.type !== 'access' ||
    typeof payload.sub !== 'string' ||
    typeof payload.version !== 'number'
  ) {
    throw new Error('Invalid access token');
  }
  return { type: 'access', sub: payload.sub, version: payload.version };
};

export const verifyRefreshToken = async (token: string): Promise<RefreshClaims> => {
  const { payload } = await jwtVerify(token, refreshSecret);
  if (
    payload.type !== 'refresh' ||
    typeof payload.sub !== 'string' ||
    typeof payload.version !== 'number' ||
    typeof payload.sessionId !== 'string' ||
    typeof payload.familyId !== 'string'
  ) {
    throw new Error('Invalid refresh token');
  }
  return {
    type: 'refresh',
    sub: payload.sub,
    version: payload.version,
    sessionId: payload.sessionId,
    familyId: payload.familyId,
  };
};

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newTokenId = () => randomUUID();

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase, path: '/', maxAge: accessCookieMaxAge });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBase,
    path: '/api/auth',
    maxAge: refreshCookieMaxAge,
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: '/api/auth' });
};
