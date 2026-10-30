import { createRequire } from 'node:module';

import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';

import { env } from '../config/env.js';
import { educationTypeDefs, educationResolvers, type EducationContext } from './education.js';
import { mutationTypeDefs, mutationResolvers } from './mutations.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

export interface SystemInfo {
  name: string;
  version: string;
  status: 'OK';
}

export const typeDefs = `#graphql
  enum SystemStatus {
    OK
  }

  type SystemInfo {
    name: String!
    version: String!
    status: SystemStatus!
  }

  type Query {
    systemInfo: SystemInfo!
  }
`;

export function createGraphQLServer(options = env) {
  const production = options.NODE_ENV === 'production';
  return new ApolloServer<EducationContext>({
    typeDefs: [typeDefs, educationTypeDefs, mutationTypeDefs],
    resolvers: {
      ...educationResolvers,
      Mutation: mutationResolvers,
      Query: {
        ...educationResolvers.Query,
        systemInfo: (): SystemInfo => ({ name: options.SYSTEM_NAME, version, status: 'OK' }),
      },
    },
    introspection: !production && options.GRAPHQL_INTROSPECTION === 'true',
    plugins: [ApolloServerPluginLandingPageDisabled()],
    includeStacktraceInErrorResponses: false,
    formatError(error) {
      if (error.extensions?.code === 'BAD_USER_INPUT') {
        return {
          message: 'Argumentos inválidos.',
          extensions: {
            code: 'BAD_USER_INPUT',
            ...(Array.isArray(error.extensions.fields) ? { fields: error.extensions.fields } : {}),
          },
        };
      }
      return error.extensions?.code === 'INTERNAL_SERVER_ERROR'
        ? { message: 'Error interno del servidor.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }
        : error;
    },
    // El proceso Express conserva su propio cierre ordenado.
    stopOnTerminationSignals: false,
  });
}
