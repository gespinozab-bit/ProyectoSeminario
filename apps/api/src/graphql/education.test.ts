import express from 'express';
import { expressMiddleware } from '@as-integrations/express5';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kind } from 'graphql';

const state = vi.hoisted(() => {
  const moduleId = '11111111-1111-4111-8111-111111111111';
  const secondId = '22222222-2222-4222-8222-222222222222';
  const hiddenId = '33333333-3333-4333-8333-333333333333';
  const contentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const date = new Date('2026-10-30T12:00:00.000Z');
  const modules = [
    {
      id: moduleId,
      title: 'Vocales',
      description: 'Aprende las vocales',
      status: 'PUBLISHED',
      sortOrder: 1,
    },
    { id: secondId, title: 'Números', description: null, status: 'PUBLISHED', sortOrder: 2 },
    { id: hiddenId, title: 'Oculto', description: null, status: 'INACTIVE', sortOrder: 3 },
  ];
  const contents = [
    {
      id: contentId,
      title: 'La vocal A',
      summary: 'Reconoce la A',
      status: 'PUBLISHED',
      moduleId,
      sortOrder: 1,
      createdAt: date,
      updatedAt: date,
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'La vocal E',
      summary: null,
      status: 'PUBLISHED',
      moduleId,
      sortOrder: 2,
      createdAt: date,
      updatedAt: date,
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Borrador',
      summary: null,
      status: 'DRAFT',
      moduleId,
      sortOrder: 3,
      createdAt: date,
      updatedAt: date,
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      title: 'Inactivo',
      summary: null,
      status: 'INACTIVE',
      moduleId,
      sortOrder: 4,
      createdAt: date,
      updatedAt: date,
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      title: 'Número uno',
      summary: null,
      status: 'PUBLISHED',
      moduleId: secondId,
      sortOrder: 1,
      createdAt: date,
      updatedAt: date,
    },
    {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      title: 'Módulo oculto',
      summary: null,
      status: 'PUBLISHED',
      moduleId: hiddenId,
      sortOrder: 1,
      createdAt: date,
      updatedAt: date,
    },
  ];
  return { modules, contents, moduleId, secondId, hiddenId, contentId };
});
const db = vi.hoisted(() => ({
  educationalModule: { findMany: vi.fn(), count: vi.fn() },
  educationalContent: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock('../lib/prisma.js', () => ({ prisma: db }));

import { createGraphQLServer } from './server.js';
import { createEducationContext } from './education.js';
import { DateTime } from './date-time.js';

type Where = {
  id?: { in: string[] };
  status?: string;
  moduleId?: string;
  module?: { status: string };
  OR?: Array<Record<string, { contains: string }>>;
};
function modules(where: Where) {
  return state.modules.filter(
    (row) =>
      (!where.id || where.id.in.includes(row.id)) &&
      (!where.status || row.status === where.status) &&
      (!where.OR ||
        where.OR.some((clause) =>
          Object.entries(clause).some(([field, condition]) =>
            String(row[field as 'title' | 'description'] ?? '')
              .toLowerCase()
              .includes(condition.contains.toLowerCase()),
          ),
        )),
  );
}
function contents(where: Where) {
  return state.contents.filter(
    (row) =>
      (!where.id || where.id.in.includes(row.id)) &&
      (!where.status || row.status === where.status) &&
      (!where.moduleId || row.moduleId === where.moduleId) &&
      (!where.module ||
        state.modules.some(
          (module) => module.id === row.moduleId && module.status === where.module!.status,
        )),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  db.educationalModule.count.mockImplementation(
    async ({ where }: { where: Where }) => modules(where).length,
  );
  db.educationalModule.findMany.mockImplementation(
    async ({
      where,
      skip = 0,
      take,
      select,
    }: {
      where: Where;
      skip?: number;
      take?: number;
      select: { contents?: { where: Where; skip: number; take: number } };
    }) =>
      modules(where)
        .slice(skip, take === undefined ? undefined : skip + take)
        .map((row) =>
          select.contents
            ? {
                ...row,
                contents: contents({ ...select.contents.where, moduleId: row.id }).slice(
                  select.contents.skip,
                  select.contents.skip + select.contents.take,
                ),
              }
            : row,
        ),
  );
  db.educationalContent.count.mockImplementation(
    async ({ where }: { where: Where }) => contents(where).length,
  );
  db.educationalContent.findMany.mockImplementation(
    async ({ where, skip = 0, take }: { where: Where; skip?: number; take?: number }) =>
      contents(where).slice(skip, take === undefined ? undefined : skip + take),
  );
});
const server = createGraphQLServer();
await server.start();
const app = express()
  .use(express.json())
  .use('/graphql', expressMiddleware(server, { context: async () => createEducationContext() }));
afterAll(() => server.stop());
const query = (text: string, variables = {}) =>
  request(app).post('/graphql').send({ query: text, variables });

describe('dominio educativo público GraphQL', () => {
  it('consulta un contenido y agrupa IDs repetidos en una sola lectura', async () => {
    const result = await query(
      'query($id:ID!){ first:content(id:$id){ id title status module { name } } second:content(id:$id){ id } }',
      { id: state.contentId },
    );
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.first).toEqual({
      id: state.contentId,
      title: 'La vocal A',
      status: 'PUBLISHED',
      module: { name: 'Vocales' },
    });
    expect(result.body.data.second.id).toBe(state.contentId);
    expect(db.educationalContent.findMany).toHaveBeenCalledTimes(1);
    expect(db.educationalModule.findMany).toHaveBeenCalledTimes(1);
    expect(db.educationalContent.findMany.mock.calls[0]![0].where).toMatchObject({
      status: 'PUBLISHED',
      module: { status: 'PUBLISHED' },
    });
  });
  it('mapea nombres, relaciones y fechas sin exponer borradores ni inactivos', async () => {
    const result = await query(
      'query($id:ID!){ module(id:$id){ id name description active order contents { id title description status createdAt updatedAt module { id name } } } }',
      { id: state.moduleId },
    );
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.module).toMatchObject({
      id: state.moduleId,
      name: 'Vocales',
      active: true,
      order: 1,
    });
    expect(result.body.data.module.contents).toHaveLength(2);
    expect(result.body.data.module.contents[0]).toEqual({
      id: state.contentId,
      title: 'La vocal A',
      description: 'Reconoce la A',
      status: 'PUBLISHED',
      createdAt: '2026-10-30T12:00:00.000Z',
      updatedAt: '2026-10-30T12:00:00.000Z',
      module: { id: state.moduleId, name: 'Vocales' },
    });
    expect(db.educationalContent.findMany).not.toHaveBeenCalled();
  });
  it('pagina módulos y busca por nombre o descripción', async () => {
    const result = await query(
      '{ modules(page:1,pageSize:1,search:"VOCALES",active:true){ items { name } pagination { page pageSize total pages } } }',
    );
    expect(result.body.data.modules).toEqual({
      items: [{ name: 'Vocales' }],
      pagination: { page: 1, pageSize: 1, total: 1, pages: 1 },
    });
    const second = await query(
      '{ modules(page:2,pageSize:1){ items { name } pagination { total pages } } }',
    );
    expect(second.body.data.modules.items).toEqual([{ name: 'Números' }]);
    expect(second.body.data.modules.pagination).toEqual({ total: 2, pages: 2 });
  });
  it('pagina y filtra contenidos por módulo y estado', async () => {
    const result = await query(
      'query($id:ID!){ contents(moduleId:$id,status:PUBLISHED,page:2,pageSize:1){ items { title module { name } } pagination { total pages } } }',
      { id: state.moduleId },
    );
    expect(result.body.data.contents).toEqual({
      items: [{ title: 'La vocal E', module: { name: 'Vocales' } }],
      pagination: { total: 2, pages: 2 },
    });
    expect(db.educationalContent.findMany.mock.calls[0]![0].where).toMatchObject({
      status: 'PUBLISHED',
      module: { status: 'PUBLISHED' },
      moduleId: state.moduleId,
    });
  });
  it.each(['DRAFT', 'INACTIVE'])(
    'no revela el estado %s mediante filtros públicos',
    async (status) => {
      const result = await query(
        'query($status:ContentStatus){ contents(status:$status){ items { id } pagination { total } } }',
        { status },
      );
      expect(result.body.data.contents).toEqual({ items: [], pagination: { total: 0 } });
      expect(db.educationalContent.findMany).not.toHaveBeenCalled();
    },
  );
  it('no revela módulos inactivos ni contenidos de módulos inactivos', async () => {
    const result = await query(
      '{ modules(active:false){ items { id } pagination { total } } contents { items { title } pagination { total } } }',
    );
    expect(result.body.data.modules).toEqual({ items: [], pagination: { total: 0 } });
    expect(result.body.data.contents.pagination.total).toBe(3);
    expect(JSON.stringify(result.body.data)).not.toContain('Módulo oculto');
  });
  it.each([
    ['module', '99999999-9999-4999-8999-999999999999', 'MODULE_NOT_FOUND'],
    ['module', state.hiddenId, 'MODULE_NOT_FOUND'],
    ['content', '99999999-9999-4999-8999-999999999999', 'CONTENT_NOT_FOUND'],
    ['content', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'CONTENT_NOT_FOUND'],
    ['content', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'CONTENT_NOT_FOUND'],
  ])('devuelve errores claros para %s no disponible (%s)', async (field, id, code) => {
    const result = await query(`query($id:ID!){ ${field}(id:$id){ id } }`, { id });
    expect(result.body.data[field]).toBeNull();
    expect(result.body.errors[0].extensions.code).toBe(code);
  });
  it.each([
    '{ modules(page:0){ items{id} } }',
    '{ contents(pageSize:51){ items{id} } }',
    '{ module(id:"invalid"){id} }',
    '{ contents(moduleId:"invalid"){items{id}} }',
  ])('valida argumentos: %s', async (text) => {
    const result = await query(text);
    expect(result.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(db.educationalModule.findMany).not.toHaveBeenCalled();
    expect(db.educationalContent.findMany).not.toHaveBeenCalled();
  });
  it('agrupa ambas relaciones y limita contenidos por módulo sin N+1', async () => {
    const result = await query(
      '{ modules { items { name contents(pageSize:1) { title module { name contents(pageSize:1) { title } } } } } }',
    );
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.modules.items).toHaveLength(2);
    expect(result.body.data.modules.items[0].contents).toHaveLength(1);
    expect(db.educationalModule.findMany).toHaveBeenCalledTimes(2); // lista y una carga agrupada
    expect(db.educationalContent.findMany).not.toHaveBeenCalled();
  });
  it('agrupa módulos para múltiples contenidos y no comparte caché entre peticiones', async () => {
    const text = '{ contents { items { module { name } } } }';
    expect((await query(text)).body.errors).toBeUndefined();
    expect(db.educationalModule.findMany).toHaveBeenCalledTimes(1);
    expect((await query(text)).body.errors).toBeUndefined();
    expect(db.educationalModule.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('DateTime seguro', () => {
  it('normaliza fechas válidas y offsets a UTC', () => {
    expect(DateTime.serialize(new Date('2026-10-30T12:00:00Z'))).toBe('2026-10-30T12:00:00.000Z');
    expect(DateTime.parseValue('2026-10-30T06:00:00.000-06:00')).toEqual(
      new Date('2026-10-30T12:00:00Z'),
    );
    expect(
      DateTime.parseLiteral({ kind: Kind.STRING, value: '2026-10-30T12:00:00.000Z' }, {}),
    ).toEqual(new Date('2026-10-30T12:00:00Z'));
  });
  it.each([
    null,
    123,
    {},
    '2026-02-30T12:00:00.000Z',
    '2026-10-30',
    '2026-10-30T12:00:00.000',
    '2026-10-30T12:00:00.000-00:00',
    'invalid',
  ])('rechaza valores inválidos: %j', (value) => {
    expect(() => DateTime.parseValue(value)).toThrow();
  });
  it('rechaza literales numéricos y fechas almacenadas inválidas', () => {
    expect(() => DateTime.parseLiteral({ kind: Kind.INT, value: '123' }, {})).toThrow();
    expect(() => DateTime.serialize(new Date('invalid'))).toThrow();
  });
});
