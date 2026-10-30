import type { Request, Response } from 'express';
import { GraphQLError } from 'graphql';
import { requireAuthentication, type AuthenticatedUser } from '../middleware/auth.js';
import { requestMetadata } from '../utils/request.js';
import { ACCESS_COOKIE } from '../security/tokens.js';

export type MutationAccess = () => Promise<{
  user: AuthenticatedUser;
  metadata: ReturnType<typeof requestMetadata>;
}>;
// Reutiliza la comprobación JWT de REST; solo consulta usuarios al ejecutar mutaciones.
export function createMutationAccess(req: Request, res: Response): MutationAccess {
  let access: ReturnType<MutationAccess> | undefined;
  const unauthenticated = () =>
    new GraphQLError('Se requiere una sesión válida.', { extensions: { code: 'UNAUTHENTICATED' } });
  return () => {
    access ??= new Promise((resolve, reject) => {
      // Adaptación local a GraphQL: el middleware REST sigue verificando el JWT.
      // Un header explícito inválido nunca retrocede a una cookie válida.
      let authRequest = req;
      const authorization = req.get('authorization');
      if (authorization !== undefined) {
        const match = /^Bearer ([^\s]+)$/i.exec(authorization);
        if (!match || authorization.length > 8192) {
          reject(unauthenticated());
          return;
        }
        authRequest = Object.create(req) as Request;
        authRequest.cookies = { ...req.cookies, [ACCESS_COOKIE]: match[1] };
      }
      void Promise.resolve(
        requireAuthentication(authRequest, res, (error?: unknown) => {
          if (error || !authRequest.auth) reject(unauthenticated());
          else if (authRequest.auth.mustChangePassword)
            reject(
              new GraphQLError('Debes cambiar tu contraseña antes de continuar.', {
                extensions: { code: 'FORBIDDEN' },
              }),
            );
          else resolve({ user: authRequest.auth, metadata: requestMetadata(req) });
        }),
      ).catch(() => reject(unauthenticated()));
    });
    return access;
  };
}
