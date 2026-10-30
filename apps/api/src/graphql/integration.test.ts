import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp, graphqlServer } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../security/password.js';
import { signAccessToken, ACCESS_COOKIE } from '../security/tokens.js';

const isolated =
  process.env.NODE_ENV === 'test' &&
  process.env.LENSEGUA_E2E === '1' &&
  process.env.LENSEGUA_TEST_DATABASE === 'pglite-memory';
const app = createApp();
afterAll(async () => {
  await graphqlServer.stop();
  await prisma.$disconnect();
});

describe.skipIf(!isolated)('integración GraphQL + REST en PostgreSQL temporal', () => {
  let adminId: string;
  let teacherId: string;
  let adminToken: string;
  let teacherToken: string;
  let moduleId: string;
  let hiddenModuleId: string;
  let draftId: string;
  let publishedId: string;
  let marker: string;
  beforeAll(async () => {
    const passwordHash = await hashPassword(`Aa1!${randomUUID()}`);
    for (const roleCode of ['ADMINISTRADOR', 'DOCENTE']) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
      const user = await prisma.user.create({
        data: {
          email: `graphql-${randomUUID()}@e2e.lensegua.test`,
          firstName: 'GraphQL',
          lastName: roleCode,
          passwordHash,
          mustChangePassword: false,
          roles: { create: { roleId: role.id } },
        },
      });
      const token = await signAccessToken({ sub: user.id, version: 0 });
      if (roleCode === 'ADMINISTRADOR') {
        adminId = user.id;
        adminToken = token;
      } else {
        teacherId = user.id;
        teacherToken = token;
      }
    }
  });
  beforeEach(async () => {
    marker = `gql-${randomUUID()}`;
    const module = await prisma.educationalModule.create({
      data: {
        code: marker,
        slug: marker,
        title: `${marker} Vocales`,
        description: 'Introducción a las vocales',
        status: 'PUBLISHED',
        sortOrder: 10,
      },
    });
    const hidden = await prisma.educationalModule.create({
      data: {
        code: `${marker}-hidden`,
        slug: `${marker}-hidden`,
        title: 'Módulo inactivo',
        status: 'INACTIVE',
      },
    });
    moduleId = module.id;
    hiddenModuleId = hidden.id;
    const draft = await prisma.educationalContent.create({
      data: {
        moduleId,
        slug: 'draft',
        title: 'Borrador base',
        body: { text: 'Observa y practica.' },
        status: 'DRAFT',
        sortOrder: 1,
        createdById: teacherId,
      },
    });
    draftId = draft.id;
    const published = await prisma.educationalContent.create({
      data: {
        moduleId,
        slug: 'vocal-a',
        title: 'La vocal A',
        summary: 'Reconoce A',
        body: { text: 'Aprende A' },
        status: 'PUBLISHED',
        publishedAt: new Date(),
        sortOrder: 2,
      },
    });
    publishedId = published.id;
    await prisma.educationalContent.create({
      data: {
        moduleId,
        slug: 'vocal-e',
        title: 'La vocal E',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        sortOrder: 3,
      },
    });
    await prisma.educationalContent.create({
      data: {
        moduleId,
        slug: 'inactive',
        title: 'Contenido inactivo',
        status: 'INACTIVE',
        sortOrder: 4,
      },
    });
  });
  const graph = async (
    query: string,
    variables: Record<string, unknown> = {},
    token?: string,
    cookie = false,
  ) => {
    const call = request(app).post('/graphql').send({ query, variables });
    if (token)
      call.set(
        cookie ? 'Cookie' : 'Authorization',
        cookie ? `${ACCESS_COOKIE}=${token}` : `Bearer ${token}`,
      );
    return call;
  };
  const code = (response: { body: { errors: { extensions: { code: string } }[] } }) =>
    response.body.errors[0]!.extensions.code;
  const create =
    'mutation($input:CreateEducationalContentInput!){createEducationalContent(input:$input){id title status module{name}}}';
  const publish =
    'mutation($id:ID!){publishEducationalContent(id:$id){id status createdAt updatedAt}}';

  it('systemInfo público y salud REST funcionan en el mismo servidor', async () => {
    const response = await graph('{systemInfo{name version status}}');
    expect(response.status).toBe(200);
    expect(response.body.data.systemInfo).toEqual({
      name: 'LENSEGUA',
      version: '0.1.0',
      status: 'OK',
    });
    expect((await request(app).get('/api/health')).body.database).toBe('connected');
  });
  it('lista módulos con paginación, búsqueda y filtro activo', async () => {
    await prisma.educationalModule.create({
      data: {
        code: `${marker}-other`,
        slug: `${marker}-other`,
        title: `${marker} Números`,
        status: 'PUBLISHED',
        sortOrder: 11,
      },
    });
    const result = await graph(
      'query($search:String){modules(search:$search,active:true,page:2,pageSize:1){items{id name} pagination{page pageSize total pages}}}',
      { search: marker.toUpperCase() },
    );
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.modules.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      pages: 2,
    });
    expect(result.body.data.modules.items).toHaveLength(1);
    expect(result.body.data.modules.items[0].name).toContain('Números');
    expect((await graph('{modules(active:false){items{id}}}')).body.data.modules.items).toEqual([]);
  });
  it('relaciona módulo y contenidos con fechas y filtra borradores e inactivos', async () => {
    const result = await graph(
      'query($id:ID!){module(id:$id){contents{title status createdAt module{id}}} contents(moduleId:$id,status:PUBLISHED,pageSize:1){items{id} pagination{total pages}}}',
      { id: moduleId },
    );
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.module.contents.map((item: { title: string }) => item.title)).toEqual([
      'La vocal A',
      'La vocal E',
    ]);
    expect(result.body.data.module.contents[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(result.body.data.module.contents[0].module.id).toBe(moduleId);
    expect(result.body.data.contents.items).toEqual([{ id: publishedId }]);
    expect(result.body.data.contents.pagination).toEqual({ total: 2, pages: 2 });
    expect(
      (
        await graph('query($id:ID!){contents(moduleId:$id,status:DRAFT){items{id}}}', {
          id: moduleId,
        })
      ).body.data.contents.items,
    ).toEqual([]);
  });
  it('devuelve un error claro para contenido inexistente u oculto', async () => {
    for (const id of [randomUUID(), draftId]) {
      const result = await graph('query($id:ID!){content(id:$id){id}}', { id });
      expect(code(result)).toBe('CONTENT_NOT_FOUND');
      expect(result.body.data.content).toBeNull();
    }
    const hidden = await prisma.educationalContent.create({
      data: {
        moduleId: hiddenModuleId,
        slug: 'hidden',
        publishedAt: new Date(),
        title: 'Oculto',
        status: 'PUBLISHED',
        sortOrder: 1,
      },
    });
    expect(code(await graph('query($id:ID!){content(id:$id){id}}', { id: hidden.id }))).toBe(
      'CONTENT_NOT_FOUND',
    );
  });
  it('permite consultas públicas y rechaza escritura pública sin cambiar datos', async () => {
    expect(
      (await graph('query($id:ID!){content(id:$id){title}}', { id: publishedId })).body.data.content
        .title,
    ).toBe('La vocal A');
    expect(code(await graph(publish, { id: draftId }))).toBe('UNAUTHENTICATED');
    expect(
      (await prisma.educationalContent.findUniqueOrThrow({ where: { id: draftId } })).status,
    ).toBe('DRAFT');
  });
  it('autoriza al administrador con Bearer y mantiene el acceso REST por cookie', async () => {
    const result = await graph(
      'mutation($id:ID!){updateEducationalModule(id:$id,input:{name:"Vocales revisadas",active:false}){name active}}',
      { id: moduleId },
      adminToken,
    );
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.updateEducationalModule).toEqual({
      name: 'Vocales revisadas',
      active: false,
    });
    const rest = await request(app)
      .get('/api/modules')
      .set('Cookie', `${ACCESS_COOKIE}=${adminToken}`);
    expect(rest.status).toBe(200);
    expect(rest.body.modules.find((item: { id: string }) => item.id === moduleId).status).toBe(
      'INACTIVE',
    );
    expect(
      (await request(app).get('/api/modules').set('Authorization', `Bearer ${adminToken}`)).status,
    ).toBe(401);
  });
  it('crea datos válidos como docente y REST puede leer el borrador', async () => {
    const result = await graph(
      create,
      {
        input: {
          moduleId,
          title: '  Nueva vocal  ',
          description: 'Descripción',
          content: 'Texto educativo',
          order: 5,
        },
      },
      teacherToken,
    );
    expect(result.body.errors).toBeUndefined();
    const content = result.body.data.createEducationalContent;
    expect(content.title).toBe('Nueva vocal');
    expect(content.status).toBe('DRAFT');
    const record = await prisma.educationalContent.findUniqueOrThrow({ where: { id: content.id } });
    expect(record.createdById).toBe(teacherId);
    const rest = await request(app)
      .get(`/api/contents/${content.id}`)
      .set('Cookie', `${ACCESS_COOKIE}=${adminToken}`);
    expect(rest.status).toBe(200);
    expect(rest.body.content.content).toBe('Texto educativo');
    expect(rest.body.content.summary).toBe('Descripción');
  });
  it('rechaza datos inválidos y conflictos sin crear registros', async () => {
    const before = await prisma.educationalContent.count({ where: { moduleId } });
    for (const input of [
      { moduleId, title: '', order: 5 },
      { moduleId, title: 'Nueva', order: -1 },
      { moduleId, title: 'Nueva', order: 5, description: 'x'.repeat(501) },
    ])
      expect(code(await graph(create, { input }, adminToken))).toBe('BAD_USER_INPUT');
    expect(
      code(await graph(create, { input: { moduleId, title: 'Conflicto', order: 1 } }, adminToken)),
    ).toBe('CONFLICT');
    expect(await prisma.educationalContent.count({ where: { moduleId } })).toBe(before);
  });
  it('actualiza contenido como docente sin permitir eludir permisos de desactivación', async () => {
    const result = await graph(
      'mutation($id:ID!){updateEducationalContent(id:$id,input:{title:"Borrador editado",description:"Cambio"}){title description}}',
      { id: draftId },
      teacherToken,
      true,
    );
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.updateEducationalContent.title).toBe('Borrador editado');
    const denied = await graph(
      'mutation($id:ID!){updateEducationalContent(id:$id,input:{status:INACTIVE}){id}}',
      { id: draftId },
      teacherToken,
    );
    expect(code(denied)).toBe('FORBIDDEN');
    expect(
      (await prisma.educationalContent.findUniqueOrThrow({ where: { id: draftId } })).status,
    ).toBe('DRAFT');
  });
  it('publica de forma idempotente tras subir multimedia por REST', async () => {
    expect(code(await graph(publish, { id: draftId }, teacherToken))).toBe('BAD_USER_INPUT');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6n8AAAAASUVORK5CYII=',
      'base64',
    );
    const upload = await request(app)
      .post(`/api/contents/${draftId}/media`)
      .set('Cookie', `${ACCESS_COOKIE}=${adminToken}`)
      .attach('file', png, { filename: 'vocal.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    const first = await graph(publish, { id: draftId }, teacherToken);
    expect(first.body.errors).toBeUndefined();
    const stored = await prisma.educationalContent.findUniqueOrThrow({ where: { id: draftId } });
    const again = await graph(publish, { id: draftId }, adminToken);
    expect(again.body.data).toEqual(first.body.data);
    const repeated = await prisma.educationalContent.findUniqueOrThrow({ where: { id: draftId } });
    expect(repeated.updatedAt).toEqual(stored.updatedAt);
    expect(repeated.publishedAt).toEqual(stored.publishedAt);
    expect(await prisma.auditLog.count({ where: { entityId: draftId, action: 'PUBLISH' } })).toBe(
      1,
    );
    const portal = await request(app).get(`/api/public/modules/${moduleId}/lessons/${draftId}`);
    expect(portal.status).toBe(200);
    expect(portal.body.lesson.title).toBe('Borrador base');
  });
  it('rechaza permisos del docente y desactiva como administrador sin eliminar', async () => {
    const mutation = 'mutation($id:ID!){deactivateEducationalContent(id:$id){id status}}';
    expect(code(await graph(mutation, { id: publishedId }, teacherToken))).toBe('FORBIDDEN');
    expect(
      code(
        await graph(
          'mutation($id:ID!){updateEducationalModule(id:$id,input:{active:false}){id}}',
          { id: moduleId },
          teacherToken,
        ),
      ),
    ).toBe('FORBIDDEN');
    const result = await graph(mutation, { id: publishedId }, adminToken);
    expect(result.body.data.deactivateEducationalContent.status).toBe('INACTIVE');
    expect(await prisma.educationalContent.count({ where: { id: publishedId } })).toBe(1);
    expect(
      (await request(app).get(`/api/public/modules/${moduleId}/lessons/${publishedId}`)).status,
    ).toBe(404);
  });
  it('rechaza un Bearer inválido sin usar una cookie válida de respaldo', async () => {
    const result = await request(app)
      .post('/graphql')
      .set('Authorization', 'Bearer invalid')
      .set('Cookie', `${ACCESS_COOKIE}=${adminToken}`)
      .send({ query: publish, variables: { id: draftId } });
    expect(code(result)).toBe('UNAUTHENTICATED');
    expect(
      (await prisma.educationalContent.findUniqueOrThrow({ where: { id: draftId } })).status,
    ).toBe('DRAFT');
    expect(adminId).toBeTruthy();
  });
});
