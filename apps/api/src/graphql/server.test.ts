import { expressMiddleware } from '@as-integrations/express5';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) }));
vi.mock('../lib/prisma.js', () => ({ prisma: database }));

import { createApp, graphqlServer } from '../app.js';
import { env } from '../config/env.js';
import { createGraphQLServer } from './server.js';
import { createEducationContext } from './education.js';

const app = createApp();
const productionServer = createGraphQLServer({
  ...env,
  NODE_ENV: 'production',
  GRAPHQL_INTROSPECTION: 'true',
});
await productionServer.start();
const production = express()
  .use(express.json())
  .use(
    '/graphql',
    expressMiddleware(productionServer, { context: async () => createEducationContext() }),
  );
const disabledServer = createGraphQLServer({
  ...env,
  NODE_ENV: 'test',
  GRAPHQL_INTROSPECTION: 'false',
});
await disabledServer.start();
const disabled = express()
  .use(express.json())
  .use(
    '/graphql',
    expressMiddleware(disabledServer, { context: async () => createEducationContext() }),
  );

afterAll(async () => {
  await Promise.all([graphqlServer.stop(), productionServer.stop(), disabledServer.stop()]);
});

describe('GraphQL adicional a REST', () => {
  it('devuelve systemInfo por HTTP sin sesión ni acceso a PostgreSQL', async () => {
    database.$queryRaw.mockClear();
    const response = await request(app)
      .post('/graphql')
      .send({ query: '{ systemInfo { name version status } }' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { systemInfo: { name: 'LENSEGUA', version: '0.1.0', status: 'OK' } },
    });
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  it('conserva la ruta REST de salud y su comprobación de base de datos', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'lensegua-api',
      database: 'connected',
    });
    expect(database.$queryRaw).toHaveBeenCalled();
  });

  it('conserva la protección REST de autenticación y contenidos', async () => {
    for (const path of ['/api/auth/me', '/api/users', '/api/modules', '/api/contents']) {
      const response = await request(app).get(path);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTH_REQUIRED');
    }
  });

  it('rechaza campos inexistentes sin exponer stacktraces', async () => {
    const response = await request(app)
      .post('/graphql')
      .send({ query: '{ systemInfo { unknown } }' });
    expect(response.status).toBe(400);
    expect(response.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
    expect(response.body.errors[0].extensions).not.toHaveProperty('stacktrace');
  });

  it('permite introspección fuera de producción cuando está habilitada', async () => {
    const response = await request(app)
      .post('/graphql')
      .send({ query: '{ __schema { queryType { name } } }' });
    expect(response.status).toBe(200);
    expect(response.body.data.__schema.queryType.name).toBe('Query');
  });

  it.each(['{ __schema { queryType { name } } }', '{ __type(name: "SystemInfo") { name } }'])(
    'bloquea introspección en producción aunque la variable esté habilitada: %s',
    async (query) => {
      const response = await request(production).post('/graphql').send({ query });
      expect(response.status).toBe(400);
      expect(response.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
      expect(response.body).not.toHaveProperty('data');
    },
  );

  it('permite systemInfo también en producción', async () => {
    const response = await request(production)
      .post('/graphql')
      .send({ query: '{ systemInfo { status } }' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { systemInfo: { status: 'OK' } } });
  });

  it('no sirve un explorador HTML en producción', async () => {
    const response = await request(production).get('/graphql').set('Accept', 'text/html');
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.text).not.toMatch(/<html|Apollo Sandbox|GraphQL Playground/);
  });

  it('permite desactivar introspección también fuera de producción', async () => {
    const response = await request(disabled)
      .post('/graphql')
      .send({ query: '{ __schema { queryType { name } } }' });
    expect(response.status).toBe(400);
    expect(response.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
  });
});
