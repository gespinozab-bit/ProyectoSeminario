import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { writeAudit } from './audit.js';
import { contentSelect, moduleSelect } from './public-education.js';

export type WriteCode = 'BAD_USER_INPUT' | 'NOT_FOUND' | 'CONFLICT';
export class EducationWriteError extends Error {
  constructor(
    message: string,
    public readonly code: WriteCode,
  ) {
    super(message);
  }
}
const status = z.enum(['DRAFT', 'PUBLISHED', 'INACTIVE']);
const fields = z
  .object({
    moduleId: z.uuid(),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(500).nullable().optional(),
    content: z.string().trim().max(10000).optional(),
    learningObjective: z.string().trim().max(500).nullable().optional(),
    order: z.number().int().min(0),
    status: status.optional(),
  })
  .strict();
export const createContentSchema = fields.extend({ status: z.literal('DRAFT').optional() });
export const updateContentSchema = fields
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Se requiere al menos un campo.');
export const updateModuleSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    active: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Se requiere al menos un campo.');
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export interface WriteActor {
  id: string;
  metadata: { ipAddress?: string; userAgent?: string };
}
const selection = {
  ...contentSelect,
  body: true,
  sortOrder: true,
  publishedAt: true,
  module: { select: moduleSelect },
  media: {
    where: { status: 'PUBLISHED', type: { in: ['IMAGE', 'VIDEO'] } },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.EducationalContentSelect;
type ContentRecord = Prisma.EducationalContentGetPayload<{ select: typeof selection }>;
const snapshot = (row: ContentRecord) => ({
  moduleId: row.moduleId,
  title: row.title,
  status: row.status,
  sortOrder: row.sortOrder,
});
const result = (row: ContentRecord) => ({
  content: {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    moduleId: row.moduleId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  },
  module: row.module,
});
const body = (text: string) => (text ? { text } : Prisma.JsonNull);
const text = (value: Prisma.JsonValue) =>
  value && typeof value === 'object' && !Array.isArray(value) && typeof value.text === 'string'
    ? value.text.trim()
    : '';

// Serialización y reintento de conflictos concurrentes; auditoría y escritura comparten tx.
async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
}
async function moduleById(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.educationalModule.findUnique({ where: { id }, select: moduleSelect });
  if (!row) throw new EducationWriteError('Módulo no encontrado.', 'NOT_FOUND');
  return row;
}
async function contentById(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.educationalContent.findUnique({ where: { id }, select: selection });
  if (!row) throw new EducationWriteError('Contenido no encontrado.', 'NOT_FOUND');
  return row;
}
async function availableOrder(
  tx: Prisma.TransactionClient,
  moduleId: string,
  sortOrder: number,
  excludeId?: string,
) {
  if (
    await tx.educationalContent.findFirst({
      where: { moduleId, sortOrder, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    throw new EducationWriteError('Ya existe contenido con ese orden.', 'CONFLICT');
  }
}
async function slug(
  tx: Prisma.TransactionClient,
  moduleId: string,
  title: string,
  excludeId?: string,
) {
  const base =
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 140) || 'contenido';
  for (let suffix = 1; suffix <= 100; suffix++) {
    const value = suffix === 1 ? base : `${base}-${suffix}`;
    if (
      !(await tx.educationalContent.findFirst({
        where: { moduleId, slug: value, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      }))
    )
      return value;
  }
  throw new EducationWriteError(
    'No se pudo asignar un identificador único al contenido.',
    'CONFLICT',
  );
}
function publishable(row: ContentRecord) {
  if (!text(row.body))
    throw new EducationWriteError('Agrega contenido antes de publicar.', 'BAD_USER_INPUT');
  if (!row.media.length)
    throw new EducationWriteError(
      'Agrega al menos una imagen o video activo antes de publicar.',
      'BAD_USER_INPUT',
    );
  if (row.module.status !== 'PUBLISHED')
    throw new EducationWriteError(
      'No se puede publicar dentro de un módulo inactivo.',
      'BAD_USER_INPUT',
    );
}

export const educationWrite = {
  async create(input: CreateContentInput, actor: WriteActor) {
    const data = createContentSchema.parse(input);
    return transaction(async (tx) => {
      await moduleById(tx, data.moduleId);
      await availableOrder(tx, data.moduleId, data.order);
      const row = await tx.educationalContent.create({
        data: {
          moduleId: data.moduleId,
          title: data.title,
          slug: await slug(tx, data.moduleId, data.title),
          summary: data.description || null,
          learningObjective: data.learningObjective || null,
          body: body(data.content ?? ''),
          sortOrder: data.order,
          status: 'DRAFT',
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: selection,
      });
      await writeAudit(
        {
          actorId: actor.id,
          action: 'CREATE',
          entityType: 'EducationalContent',
          entityId: row.id,
          afterData: snapshot(row),
          ...actor.metadata,
        },
        tx,
      );
      return result(row);
    });
  },
  async update(id: string, input: UpdateContentInput, actor: WriteActor) {
    z.uuid().parse(id);
    const data = updateContentSchema.parse(input);
    return transaction(async (tx) => {
      const existing = await contentById(tx, id);
      if (Object.keys(data).length === 1 && data.status === existing.status)
        return result(existing);
      const moduleId = data.moduleId ?? existing.moduleId;
      const sortOrder = data.order ?? existing.sortOrder;
      const module = data.moduleId ? await moduleById(tx, moduleId) : existing.module;
      if (moduleId !== existing.moduleId || sortOrder !== existing.sortOrder)
        await availableOrder(tx, moduleId, sortOrder, id);
      const nextStatus = data.status ?? existing.status;
      const nextBody =
        data.content === undefined ? existing.body : data.content ? { text: data.content } : null;
      if (nextStatus === 'PUBLISHED') publishable({ ...existing, module, body: nextBody });
      const row = await tx.educationalContent.update({
        where: { id },
        data: {
          ...(data.moduleId !== undefined ? { moduleId } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.title !== undefined || data.moduleId !== undefined
            ? { slug: await slug(tx, moduleId, data.title ?? existing.title, id) }
            : {}),
          ...(data.description !== undefined ? { summary: data.description || null } : {}),
          ...(data.learningObjective !== undefined
            ? { learningObjective: data.learningObjective || null }
            : {}),
          ...(data.content !== undefined ? { body: body(data.content) } : {}),
          ...(data.order !== undefined ? { sortOrder } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(nextStatus === 'PUBLISHED'
            ? { publishedAt: existing.publishedAt ?? new Date() }
            : {}),
          updatedById: actor.id,
        },
        select: selection,
      });
      await writeAudit(
        {
          actorId: actor.id,
          action:
            nextStatus !== existing.status
              ? nextStatus === 'PUBLISHED'
                ? 'PUBLISH'
                : nextStatus === 'INACTIVE'
                  ? 'DEACTIVATE'
                  : 'UPDATE'
              : 'UPDATE',
          entityType: 'EducationalContent',
          entityId: id,
          beforeData: snapshot(existing),
          afterData: snapshot(row),
          ...actor.metadata,
        },
        tx,
      );
      return result(row);
    });
  },
  async changeStatus(id: string, next: 'PUBLISHED' | 'INACTIVE', actor: WriteActor) {
    z.uuid().parse(id);
    return transaction(async (tx) => {
      const existing = await contentById(tx, id);
      if (existing.status === next) return result(existing);
      if (next === 'PUBLISHED') publishable(existing);
      const row = await tx.educationalContent.update({
        where: { id },
        data: {
          status: next,
          publishedAt:
            next === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
          updatedById: actor.id,
        },
        select: selection,
      });
      await writeAudit(
        {
          actorId: actor.id,
          action: next === 'PUBLISHED' ? 'PUBLISH' : 'DEACTIVATE',
          entityType: 'EducationalContent',
          entityId: id,
          beforeData: { status: existing.status },
          afterData: { status: next },
          ...actor.metadata,
        },
        tx,
      );
      return result(row);
    });
  },
  async updateModule(id: string, input: UpdateModuleInput, actor: WriteActor) {
    z.uuid().parse(id);
    const data = updateModuleSchema.parse(input);
    return transaction(async (tx) => {
      const existing = await moduleById(tx, id);
      const row = await tx.educationalModule.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { title: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description || null } : {}),
          ...(data.active !== undefined ? { status: data.active ? 'PUBLISHED' : 'INACTIVE' } : {}),
          ...(data.order !== undefined ? { sortOrder: data.order } : {}),
        },
        select: moduleSelect,
      });
      await writeAudit(
        {
          actorId: actor.id,
          action:
            data.active === false ? 'DEACTIVATE' : data.active === true ? 'PUBLISH' : 'UPDATE',
          entityType: 'EducationalModule',
          entityId: id,
          beforeData: existing,
          afterData: row,
          ...actor.metadata,
        },
        tx,
      );
      return row;
    });
  },
};
