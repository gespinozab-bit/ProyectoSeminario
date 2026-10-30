import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  educationalModule: { findUnique: vi.fn(), update: vi.fn() },
  educationalContent: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma.js', () => ({ prisma: db }));
import { Prisma, type PublicationStatus } from '../generated/prisma/client.js';
import { educationWrite } from './education-write.js';

const userId = '11111111-1111-4111-8111-111111111111';
const moduleId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const date = new Date('2026-10-30T12:00:00Z');
const fixture = () => ({
  id,
  moduleId,
  title: 'La vocal A',
  summary: null as string | null,
  status: 'DRAFT' as PublicationStatus,
  createdAt: date,
  updatedAt: date,
  publishedAt: null as Date | null,
  sortOrder: 1,
  body: { text: 'Aprendemos la A.' } as Prisma.JsonValue,
  module: {
    id: moduleId,
    title: 'Vocales',
    description: null,
    status: 'PUBLISHED' as PublicationStatus,
    sortOrder: 1,
  },
  media: [{ id: 'media' }],
});
let current = fixture();
const actor = { id: userId, metadata: { ipAddress: '127.0.0.1', userAgent: 'unit-test' } };
beforeEach(() => {
  vi.resetAllMocks();
  current = fixture();
  db.$transaction.mockImplementation(async (work: (tx: typeof db) => Promise<unknown>) => work(db));
  db.educationalModule.findUnique.mockImplementation(async () => current.module);
  db.educationalContent.findUnique.mockImplementation(async () => current);
  db.educationalContent.findFirst.mockResolvedValue(null);
  db.educationalContent.create.mockResolvedValue(current);
  db.educationalContent.update.mockImplementation(
    async ({ data }: { data: Partial<typeof current> }) => {
      current = { ...current, ...data };
      return current;
    },
  );
  db.educationalModule.update.mockImplementation(
    async ({ data }: { data: Partial<typeof current.module> }) => ({ ...current.module, ...data }),
  );
  db.auditLog.create.mockResolvedValue({});
});
const createInput = {
  moduleId,
  title: '  La vocal A  ',
  description: '  Breve  ',
  content: 'Texto',
  order: 1,
};

describe('servicio de escritura educativa transaccional', () => {
  it('crea un borrador y audita dentro de la misma transacción', async () => {
    const value = await educationWrite.create(createInput, actor);
    expect(value.content.status).toBe('DRAFT');
    expect(db.educationalContent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'La vocal A',
          summary: 'Breve',
          body: { text: 'Texto' },
          status: 'DRAFT',
          createdById: userId,
          updatedById: userId,
        }),
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: userId,
          action: 'CREATE',
          ipAddress: '127.0.0.1',
        }),
      }),
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('rechaza un módulo inexistente antes de escribir', async () => {
    db.educationalModule.findUnique.mockResolvedValue(null);
    await expect(educationWrite.create(createInput, actor)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(db.educationalContent.create).not.toHaveBeenCalled();
  });
  it('detecta conflictos de orden y no elimina registros', async () => {
    db.educationalContent.findFirst.mockResolvedValue({ id: 'occupied' });
    await expect(educationWrite.create(createInput, actor)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(educationWrite.update(id, { order: 2 }, actor)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(db.educationalContent.create).not.toHaveBeenCalled();
    expect(db.educationalContent.update).not.toHaveBeenCalled();
  });
  it('genera un slug alternativo y limita la longitud', async () => {
    db.educationalContent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'duplicate' })
      .mockResolvedValueOnce(null);
    await educationWrite.create({ ...createInput, title: 'A'.repeat(180) }, actor);
    const slug = db.educationalContent.create.mock.calls[0]![0].data.slug;
    expect(slug).toHaveLength(142);
    expect(slug).toMatch(/-2$/);
  });
  it('publica una sola vez y conserva publishedAt, updatedAt y auditoría al repetir', async () => {
    const first = await educationWrite.changeStatus(id, 'PUBLISHED', actor);
    const timestamp = current.publishedAt;
    const modified = current.updatedAt;
    const second = await educationWrite.changeStatus(id, 'PUBLISHED', actor);
    expect(first.content.status).toBe('PUBLISHED');
    expect(second.content).toEqual(first.content);
    expect(current.publishedAt).toBe(timestamp);
    expect(current.updatedAt).toBe(modified);
    expect(db.educationalContent.update).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it('también es idempotente actualizar únicamente el mismo estado publicado', async () => {
    current.status = 'PUBLISHED';
    current.publishedAt = date;
    const value = await educationWrite.update(id, { status: 'PUBLISHED' }, actor);
    expect(value.content.status).toBe('PUBLISHED');
    expect(db.educationalContent.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it.each(['text', 'media', 'module'])(
    'impide publicar si falta una condición: %s',
    async (condition) => {
      if (condition === 'text') current.body = { text: '   ' };
      if (condition === 'media') current.media = [];
      if (condition === 'module') current.module.status = 'INACTIVE';
      await expect(educationWrite.changeStatus(id, 'PUBLISHED', actor)).rejects.toMatchObject({
        code: 'BAD_USER_INPUT',
      });
      expect(db.educationalContent.update).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
    },
  );
  it('rechaza referencias inexistentes al actualizar contenido o módulo', async () => {
    db.educationalContent.findUnique.mockResolvedValue(null);
    await expect(educationWrite.update(id, { title: 'Nuevo' }, actor)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(educationWrite.changeStatus(id, 'INACTIVE', actor)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    db.educationalModule.findUnique.mockResolvedValue(null);
    await expect(
      educationWrite.updateModule(moduleId, { active: false }, actor),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('valida también las condiciones al publicar por update', async () => {
    await expect(
      educationWrite.update(id, { content: '', status: 'PUBLISHED' }, actor),
    ).rejects.toMatchObject({ code: 'BAD_USER_INPUT' });
    expect(db.educationalContent.update).not.toHaveBeenCalled();
  });
  it('impide vaciar texto de un contenido que permanece publicado', async () => {
    current.status = 'PUBLISHED';
    await expect(educationWrite.update(id, { content: '' }, actor)).rejects.toMatchObject({
      code: 'BAD_USER_INPUT',
    });
    expect(db.educationalContent.update).not.toHaveBeenCalled();
  });
  it('actualiza los campos permitidos y conserva la trazabilidad', async () => {
    await educationWrite.update(
      id,
      {
        title: 'La vocal E',
        description: null,
        content: 'Texto E',
        order: 2,
        learningObjective: 'Reconocer E',
      },
      actor,
    );
    expect(db.educationalContent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'La vocal E',
          summary: null,
          body: { text: 'Texto E' },
          sortOrder: 2,
          updatedById: userId,
          learningObjective: 'Reconocer E',
        }),
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it('desactiva sin eliminar ni borrar la fecha de publicación', async () => {
    current.status = 'PUBLISHED';
    current.publishedAt = date;
    await educationWrite.changeStatus(id, 'INACTIVE', actor);
    expect(db.educationalContent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'INACTIVE', publishedAt: date, updatedById: userId },
      }),
    );
    expect(db.auditLog.create.mock.calls[0]![0].data.action).toBe('DEACTIVATE');
  });
  it('actualiza un módulo usando los campos existentes', async () => {
    const result = await educationWrite.updateModule(
      moduleId,
      { name: 'Vocales iniciales', description: 'Nuevo texto', active: false, order: 2 },
      actor,
    );
    expect(result).toMatchObject({
      title: 'Vocales iniciales',
      description: 'Nuevo texto',
      status: 'INACTIVE',
      sortOrder: 2,
    });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it('registra como publicación la activación de un módulo', async () => {
    current.module.status = 'INACTIVE';
    await educationWrite.updateModule(moduleId, { active: true }, actor);
    expect(db.auditLog.create.mock.calls[0]![0].data.action).toBe('PUBLISH');
  });
  it('propaga fallos de auditoría para abortar la transacción', async () => {
    db.auditLog.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(educationWrite.create(createInput, actor)).rejects.toThrow('audit unavailable');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it('reintenta un conflicto serializable', async () => {
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('retry', { code: 'P2034', clientVersion: 'test' }),
    );
    await educationWrite.changeStatus(id, 'PUBLISHED', actor);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.educationalContent.update).toHaveBeenCalledTimes(1);
  });
});
