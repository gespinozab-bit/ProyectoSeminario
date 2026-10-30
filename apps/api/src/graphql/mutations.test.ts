import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  educationalModule: { findMany: vi.fn().mockResolvedValue([]) },
  educationalContent: { findMany: vi.fn().mockResolvedValue([]) },
}));
const write = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  changeStatus: vi.fn(),
  updateModule: vi.fn(),
}));
vi.mock('../lib/prisma.js', () => ({ prisma: db }));
vi.mock('../services/education-write.js', async (original) => ({
  ...(await original<typeof import('../services/education-write.js')>()),
  educationWrite: write,
}));

import { createApp, graphqlServer } from '../app.js';
import { signAccessToken, ACCESS_COOKIE } from '../security/tokens.js';
import { EducationWriteError } from '../services/education-write.js';
import { Prisma } from '../generated/prisma/client.js';
import { SignJWT } from 'jose';
import { env } from '../config/env.js';

const app = createApp();
afterAll(() => graphqlServer.stop());
const userId = '11111111-1111-4111-8111-111111111111';
const moduleId = '22222222-2222-4222-8222-222222222222';
const contentId = '33333333-3333-4333-8333-333333333333';
const moduleRow = {
  id: moduleId,
  title: 'Vocales',
  description: null,
  status: 'PUBLISHED',
  sortOrder: 1,
};
const row = {
  id: contentId,
  moduleId,
  title: 'La vocal A',
  summary: null,
  status: 'DRAFT',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const input = { title: 'La vocal A', moduleId, order: 1, content: 'Aprendemos la A.' };
const calls = {
  create:
    'mutation($input:CreateEducationalContentInput!){createEducationalContent(input:$input){id title status module{name}}}',
  update:
    'mutation($id:ID!,$input:UpdateEducationalContentInput!){updateEducationalContent(id:$id,input:$input){id title status module{name}}}',
  publish: 'mutation($id:ID!){publishEducationalContent(id:$id){id status}}',
  deactivate: 'mutation($id:ID!){deactivateEducationalContent(id:$id){id status}}',
  module:
    'mutation($id:ID!,$input:UpdateEducationalModuleInput!){updateEducationalModule(id:$id,input:$input){id name active}}',
};
const variables = (kind: keyof typeof calls) =>
  kind === 'create'
    ? { input }
    : kind === 'update'
      ? { id: contentId, input: { title: 'Actualizado' } }
      : kind === 'module'
        ? { id: moduleId, input: { active: false } }
        : { id: contentId };
const account = (role = 'ADMINISTRADOR', permissions: string[] = []) => ({
  id: userId,
  email: 'admin@unit.test',
  firstName: 'Prueba',
  lastName: 'GraphQL',
  status: 'ACTIVE',
  tokenVersion: 0,
  mustChangePassword: false,
  passwordHash: 'HASH_PRIVATE',
  roles: [
    { role: { code: role, permissions: permissions.map((code) => ({ permission: { code } })) } },
  ],
});
async function cookie() {
  return `${ACCESS_COOKIE}=${await signAccessToken({ sub: userId, version: 0 })}`;
}
async function run(
  kind: keyof typeof calls,
  value: unknown = variables(kind),
  authenticated = true,
) {
  const call = request(app).post('/graphql').send({ query: calls[kind], variables: value });
  if (authenticated) call.set('Cookie', await cookie());
  return call;
}
const errorCode = (response: { body: { errors: { extensions: { code: string } }[] } }) =>
  response.body.errors[0]!.extensions.code;
beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(account());
  db.educationalModule.findMany.mockResolvedValue([]);
  db.educationalContent.findMany.mockResolvedValue([]);
  write.create.mockResolvedValue({ content: { ...row }, module: moduleRow });
  write.update.mockResolvedValue({ content: { ...row }, module: moduleRow });
  write.changeStatus.mockResolvedValue({
    content: { ...row, status: 'PUBLISHED' },
    module: moduleRow,
  });
  write.updateModule.mockResolvedValue({ ...moduleRow, status: 'INACTIVE' });
});

describe('autorización y validación de mutaciones por HTTP', () => {
  it('acepta Bearer solo en GraphQL y conserva REST con cookies', async () => {
    const token = await signAccessToken({ sub: userId, version: 0 });
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: calls.create, variables: { input } });
    expect(response.body.errors).toBeUndefined();
    expect(write.create).toHaveBeenCalledTimes(1);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(401);
  });
  it('Bearer válido tiene prioridad sobre una cookie inválida sin modificar la autenticación REST', async () => {
    const token = await signAccessToken({ sub: userId, version: 0 });
    const response = await request(app)
      .post('/graphql')
      .set('Cookie', `${ACCESS_COOKIE}=invalid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ query: calls.publish, variables: { id: contentId } });
    expect(response.body.errors).toBeUndefined();
  });
  it.each(['Bearer invalid', 'Basic invalid', 'Bearer first second'])(
    'no retrocede a cookies con un header inválido: %s',
    async (header) => {
      const response = await request(app)
        .post('/graphql')
        .set('Cookie', await cookie())
        .set('Authorization', header)
        .send({ query: calls.publish, variables: { id: contentId } });
      expect(errorCode(response)).toBe('UNAUTHENTICATED');
      expect(write.changeStatus).not.toHaveBeenCalled();
    },
  );
  it('rechaza JWT expirado y roles ajenos aunque tengan un permiso con el mismo nombre', async () => {
    const token = await new SignJWT({ type: 'access', version: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setExpirationTime(0)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
    const response = await request(app)
      .post('/graphql')
      .set('Cookie', `${ACCESS_COOKIE}=${token}`)
      .send({ query: calls.publish, variables: { id: contentId } });
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
    db.user.findUnique.mockResolvedValue(account('OTRO_ROL', ['content.create']));
    expect(errorCode(await run('create'))).toBe('FORBIDDEN');
    expect(write.create).not.toHaveBeenCalled();
  });
  it('invalida cargas públicas entre mutaciones seriales sin repetir autenticación', async () => {
    write.changeStatus.mockImplementation(async (_id, next) => {
      const content = { ...row, status: next };
      db.educationalModule.findMany.mockResolvedValue([
        { id: moduleId, contents: next === 'PUBLISHED' ? [content] : [] },
      ]);
      return { content, module: moduleRow };
    });
    const response = await request(app)
      .post('/graphql')
      .set('Cookie', await cookie())
      .send({
        query:
          'mutation($id:ID!){ first:publishEducationalContent(id:$id){module{contents{id}}} second:deactivateEducationalContent(id:$id){module{contents{id}}} }',
        variables: { id: contentId },
      });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.first.module.contents).toEqual([{ id: contentId }]);
    expect(response.body.data.second.module.contents).toEqual([]);
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
    expect(db.educationalModule.findMany).toHaveBeenCalledTimes(2);
    write.changeStatus.mockReset();
  });
  it.each(Object.keys(calls) as (keyof typeof calls)[])('bloquea al público: %s', async (kind) => {
    expect(errorCode(await run(kind, variables(kind), false))).toBe('UNAUTHENTICATED');
    expect(db.user.findUnique).not.toHaveBeenCalled();
    for (const method of Object.values(write)) expect(method).not.toHaveBeenCalled();
  });
  it.each(Object.keys(calls) as (keyof typeof calls)[])(
    'permite al administrador sin depender de permisos adicionales: %s',
    async (kind) => {
      const response = await run(kind);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data).toBeDefined();
      expect(db.user.findUnique).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(response.body)).not.toMatch(
        /HASH_PRIVATE|passwordHash|lensegua_access|tokenVersion/,
      );
    },
  );
  it.each(['create', 'update', 'publish'] as const)(
    'permite al docente con permisos: %s',
    async (kind) => {
      db.user.findUnique.mockResolvedValue(
        account('DOCENTE', ['content.create', 'content.update', 'content.publish']),
      );
      expect((await run(kind)).body.errors).toBeUndefined();
    },
  );
  it('rechaza cookie JWT inválida, versión revocada, usuario inactivo o inexistente', async () => {
    const invalid = await request(app)
      .post('/graphql')
      .set('Cookie', `${ACCESS_COOKIE}=invalid-token`)
      .send({ query: calls.publish, variables: { id: contentId } });
    expect(errorCode(invalid)).toBe('UNAUTHENTICATED');
    for (const user of [
      { ...account(), tokenVersion: 1 },
      { ...account(), status: 'INACTIVE' },
      null,
    ]) {
      db.user.findUnique.mockResolvedValue(user);
      expect(errorCode(await run('publish'))).toBe('UNAUTHENTICATED');
    }
    expect(write.changeStatus).not.toHaveBeenCalled();
  });
  it('exige el cambio obligatorio de contraseña también al administrador', async () => {
    db.user.findUnique.mockResolvedValue({ ...account(), mustChangePassword: true });
    expect(errorCode(await run('create'))).toBe('FORBIDDEN');
    expect(write.create).not.toHaveBeenCalled();
  });
  it('bloquea a un docente sin permiso y no le permite administrar módulos', async () => {
    db.user.findUnique.mockResolvedValue(account('DOCENTE', ['content.update', 'modules.status']));
    for (const kind of ['create', 'publish', 'deactivate', 'module'] as const)
      expect(errorCode(await run(kind))).toBe('FORBIDDEN');
    for (const method of Object.values(write)) expect(method).not.toHaveBeenCalled();
  });
  it('respeta content.deactivate cuando sí está asignado a un docente', async () => {
    db.user.findUnique.mockResolvedValue(account('DOCENTE', ['content.deactivate']));
    expect((await run('deactivate')).body.errors).toBeUndefined();
    expect(write.changeStatus).toHaveBeenCalledWith(contentId, 'INACTIVE', expect.any(Object));
  });
  it.each(['PUBLISHED', 'INACTIVE'])(
    'impide eludir permisos enviando status %s en update',
    async (status) => {
      db.user.findUnique.mockResolvedValue(account('DOCENTE', ['content.update']));
      expect(errorCode(await run('update', { id: contentId, input: { status } }))).toBe(
        'FORBIDDEN',
      );
      expect(write.update).not.toHaveBeenCalled();
    },
  );
  it.each([
    { title: '' },
    { title: 'x'.repeat(181) },
    { description: 'x'.repeat(501) },
    { moduleId: 'invalid' },
    { order: -1 },
    { status: 'PUBLISHED' },
    { content: 'x'.repeat(10001) },
  ])('valida creación: %j', async (invalid) => {
    expect(errorCode(await run('create', { input: { ...input, ...invalid } }))).toBe(
      'BAD_USER_INPUT',
    );
    expect(write.create).not.toHaveBeenCalled();
  });
  it.each([{}, { title: null }, { order: null }, { status: null }])(
    'rechaza actualizaciones vacías o nulos inválidos: %j',
    async (invalid) => {
      expect(errorCode(await run('update', { id: contentId, input: invalid }))).toBe(
        'BAD_USER_INPUT',
      );
      expect(write.update).not.toHaveBeenCalled();
    },
  );
  it.each([
    {},
    { name: '' },
    { name: 'x'.repeat(121) },
    { description: 'x'.repeat(501) },
    { order: -1 },
  ])('valida actualización de módulos: %j', async (invalid) => {
    expect(errorCode(await run('module', { id: moduleId, input: invalid }))).toBe('BAD_USER_INPUT');
    expect(write.updateModule).not.toHaveBeenCalled();
  });
  it.each(['NOT_FOUND', 'CONFLICT', 'BAD_USER_INPUT'] as const)(
    'conserva códigos seguros del servicio: %s',
    async (code) => {
      write.changeStatus.mockRejectedValue(
        new EducationWriteError('Operación no disponible.', code),
      );
      expect(errorCode(await run('publish'))).toBe(code);
    },
  );
  it.each([
    ['P2002', 'CONFLICT'],
    ['P2034', 'CONFLICT'],
    ['P2025', 'NOT_FOUND'],
    ['P2003', 'BAD_USER_INPUT'],
  ])('traduce el error Prisma %s a %s sin metadatos internos', async (databaseCode, expected) => {
    write.changeStatus.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('SQL_PRIVATE token=SECRET_PRIVATE', {
        code: databaseCode!,
        clientVersion: 'test',
        meta: { passwordHash: 'HASH_PRIVATE' },
      }),
    );
    const response = await run('publish');
    expect(errorCode(response)).toBe(expected);
    expect(JSON.stringify(response.body)).not.toMatch(
      /SQL_PRIVATE|SECRET_PRIVATE|HASH_PRIVATE|stacktrace|clientVersion/,
    );
  });
  it('oculta errores inesperados y valores secretos de variables inválidas', async () => {
    write.changeStatus.mockRejectedValue(new Error('SQL_PRIVATE passwordHash=HASH_PRIVATE'));
    const response = await run('publish');
    expect(errorCode(response)).toBe('INTERNAL_SERVER_ERROR');
    expect(response.body.errors[0].message).toBe('Error interno del servidor.');
    const invalid = await run('create', { input: { ...input, order: 'SECRET_PRIVATE' } });
    expect(errorCode(invalid)).toBe('BAD_USER_INPUT');
    expect(JSON.stringify([response.body, invalid.body])).not.toMatch(
      /SQL_PRIVATE|HASH_PRIVATE|SECRET_PRIVATE/,
    );
  });
  it('mantiene públicas las consultas aun con una cookie inválida', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Cookie', `${ACCESS_COOKIE}=invalid`)
      .send({ query: '{systemInfo{name}}' });
    expect(response.body.errors).toBeUndefined();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it('no inserta borradores ni módulos privados en consultas públicas tras una mutación', async () => {
    write.create.mockResolvedValue({
      content: { ...row },
      module: { ...moduleRow, status: 'INACTIVE' },
    });
    const response = await run('create');
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createEducationalContent.status).toBe('DRAFT');
    expect(response.body.data.createEducationalContent.module.name).toBe('Vocales');
    expect(db.educationalModule.findMany).not.toHaveBeenCalled();
    const publicResult = await request(app)
      .post('/graphql')
      .send({ query: 'query($id:ID!){content(id:$id){id}}', variables: { id: contentId } });
    expect(publicResult.body.data.content).toBeNull();
    expect(errorCode(publicResult)).toBe('CONTENT_NOT_FOUND');
  });
});
