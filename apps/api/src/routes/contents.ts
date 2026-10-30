import { Router } from 'express';
import { z } from 'zod';

import { AuditAction, Prisma, PublicationStatus } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import {
  requireAuthentication,
  requirePasswordChanged,
  requirePermission,
} from '../middleware/auth.js';
import { HttpError } from '../middleware/error-handler.js';
import { writeAudit } from '../services/audit.js';
import { requestMetadata } from '../utils/request.js';

export const contentsRouter = Router();
contentsRouter.use(requireAuthentication, requirePasswordChanged);

const idSchema = z.string().uuid();
const contentSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().max(500).optional().nullable(),
  learningObjective: z.string().trim().max(500).optional().nullable(),
  content: z.string().trim().max(10_000).optional().default(''),
  sortOrder: z.number().int().min(0),
});
const updateSchema = contentSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Debe enviar al menos un campo.' });
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  moduleId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'INACTIVE']).optional(),
  search: z.string().trim().max(100).optional(),
});
const orderSchema = z.object({
  moduleId: z.string().uuid(),
  items: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) }))
    .min(1)
    .max(200),
});
const statusSchema = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'INACTIVE']) });
const include = {
  module: { select: { id: true, code: true, title: true, status: true } },
  _count: { select: { media: { where: { status: PublicationStatus.PUBLISHED } } } },
} as const;

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const bodyFromText = (content: string): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  content ? { text: content } : Prisma.JsonNull;
const bodyText = (body: Prisma.JsonValue | null) => {
  if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.text === 'string')
    return body.text.trim();
  return '';
};
const serialize = <T extends { body: Prisma.JsonValue | null }>(item: T) => {
  const { body, ...content } = item;
  return { ...content, content: bodyText(body) };
};

async function assertModule(moduleId: string) {
  const module = await prisma.educationalModule.findUnique({ where: { id: moduleId } });
  if (!module) throw new HttpError(400, 'El módulo seleccionado no existe.', 'INVALID_MODULE');
  return module;
}
async function uniqueSlug(moduleId: string, title: string, excludeId?: string) {
  const base = slugify(title) || 'contenido';
  let slug = base;
  for (
    let suffix = 2;
    await prisma.educationalContent.findFirst({
      where: { moduleId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    suffix += 1
  )
    slug = `${base}-${suffix}`;
  return slug;
}

contentsRouter.get('/', requirePermission('content.read'), async (req, res) => {
  const query = listSchema.parse(req.query);
  const where: Prisma.EducationalContentWhereInput = {
    ...(query.moduleId ? { moduleId: query.moduleId } : {}),
    ...(query.status ? { status: query.status as PublicationStatus } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { summary: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, contents] = await prisma.$transaction([
    prisma.educationalContent.count({ where }),
    prisma.educationalContent.findMany({
      where,
      include,
      orderBy: [{ module: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { title: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  res.json({
    contents: contents.map(serialize),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      pages: Math.ceil(total / query.pageSize),
    },
  });
});

contentsRouter.get('/:id', requirePermission('content.read'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const content = await prisma.educationalContent.findUnique({ where: { id }, include });
  if (!content) throw new HttpError(404, 'Contenido no encontrado.', 'CONTENT_NOT_FOUND');
  res.json({ content: serialize(content) });
});

contentsRouter.post('/', requirePermission('content.create'), async (req, res) => {
  const input = contentSchema.parse(req.body);
  await assertModule(input.moduleId);
  const conflict = await prisma.educationalContent.findUnique({
    where: { moduleId_sortOrder: { moduleId: input.moduleId, sortOrder: input.sortOrder } },
  });
  if (conflict) throw new HttpError(409, 'Ya existe contenido con ese orden.', 'ORDER_CONFLICT');
  const content = await prisma.educationalContent.create({
    data: {
      moduleId: input.moduleId,
      title: input.title,
      slug: await uniqueSlug(input.moduleId, input.title),
      summary: input.summary || null,
      learningObjective: input.learningObjective || null,
      body: bodyFromText(input.content),
      sortOrder: input.sortOrder,
      status: PublicationStatus.DRAFT,
      createdById: req.auth!.id,
      updatedById: req.auth!.id,
    },
    include,
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: AuditAction.CREATE,
    entityType: 'EducationalContent',
    entityId: content.id,
    afterData: {
      moduleId: content.moduleId,
      title: content.title,
      status: content.status,
      sortOrder: content.sortOrder,
    },
    ...requestMetadata(req),
  });
  res.status(201).json({ content: serialize(content) });
});

contentsRouter.patch('/:id', requirePermission('content.update'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const input = updateSchema.parse(req.body);
  const existing = await prisma.educationalContent.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Contenido no encontrado.', 'CONTENT_NOT_FOUND');
  const moduleId = input.moduleId ?? existing.moduleId;
  const sortOrder = input.sortOrder ?? existing.sortOrder;
  if (input.moduleId) await assertModule(input.moduleId);
  if (sortOrder !== existing.sortOrder || moduleId !== existing.moduleId) {
    const conflict = await prisma.educationalContent.findFirst({
      where: { moduleId, sortOrder, id: { not: id } },
    });
    if (conflict) throw new HttpError(409, 'Ya existe contenido con ese orden.', 'ORDER_CONFLICT');
  }
  const content = await prisma.educationalContent.update({
    where: { id },
    data: {
      ...(input.moduleId ? { moduleId: input.moduleId } : {}),
      ...(input.title
        ? { title: input.title, slug: await uniqueSlug(moduleId, input.title, id) }
        : {}),
      ...(input.summary !== undefined ? { summary: input.summary || null } : {}),
      ...(input.learningObjective !== undefined
        ? { learningObjective: input.learningObjective || null }
        : {}),
      ...(input.content !== undefined ? { body: bodyFromText(input.content) } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedById: req.auth!.id,
    },
    include,
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: AuditAction.UPDATE,
    entityType: 'EducationalContent',
    entityId: id,
    beforeData: {
      moduleId: existing.moduleId,
      title: existing.title,
      status: existing.status,
      sortOrder: existing.sortOrder,
    },
    afterData: {
      moduleId: content.moduleId,
      title: content.title,
      status: content.status,
      sortOrder: content.sortOrder,
    },
    ...requestMetadata(req),
  });
  res.json({ content: serialize(content) });
});

contentsRouter.put('/order/batch', requirePermission('content.update'), async (req, res) => {
  const input = orderSchema.parse(req.body);
  if (
    new Set(input.items.map(({ id }) => id)).size !== input.items.length ||
    new Set(input.items.map(({ sortOrder }) => sortOrder)).size !== input.items.length
  )
    throw new HttpError(400, 'Los contenidos y órdenes no pueden repetirse.', 'DUPLICATE_ORDER');
  const existing = await prisma.educationalContent.findMany({
    where: { moduleId: input.moduleId, id: { in: input.items.map(({ id }) => id) } },
  });
  if (existing.length !== input.items.length)
    throw new HttpError(400, 'Lista de contenidos inválida.', 'INVALID_CONTENTS');
  const highestOrder = await prisma.educationalContent.aggregate({
    where: { moduleId: input.moduleId },
    _max: { sortOrder: true },
  });
  const temporaryBase = (highestOrder._max.sortOrder ?? 0) + input.items.length + 1;
  await prisma.$transaction(async (tx) => {
    for (const [index, item] of input.items.entries())
      await tx.educationalContent.update({
        where: { id: item.id },
        data: { sortOrder: temporaryBase + index },
      });
    for (const item of input.items)
      await tx.educationalContent.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder, updatedById: req.auth!.id },
      });
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: AuditAction.UPDATE,
    entityType: 'EducationalContentOrder',
    entityId: input.moduleId,
    beforeData: existing.map(({ id, sortOrder }) => ({ id, sortOrder })),
    afterData: input.items,
    ...requestMetadata(req),
  });
  res.status(204).send();
});

contentsRouter.patch('/:id/status', async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const permission =
    status === 'PUBLISHED'
      ? 'content.publish'
      : status === 'INACTIVE'
        ? 'content.deactivate'
        : 'content.update';
  if (!req.auth!.permissions.includes(permission))
    throw new HttpError(403, 'Permisos insuficientes.', 'FORBIDDEN');
  const id = idSchema.parse(req.params.id);
  const existing = await prisma.educationalContent.findUnique({
    where: { id },
    include: {
      module: true,
      media: {
        where: { type: { in: ['IMAGE', 'VIDEO'] }, status: PublicationStatus.PUBLISHED },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!existing) throw new HttpError(404, 'Contenido no encontrado.', 'CONTENT_NOT_FOUND');
  if (status === 'PUBLISHED') {
    if (!bodyText(existing.body))
      throw new HttpError(400, 'Agrega contenido antes de publicar.', 'EMPTY_CONTENT');
    if (existing.media.length === 0)
      throw new HttpError(
        400,
        'Agrega al menos una imagen o video antes de publicar.',
        'MEDIA_REQUIRED',
      );
    if (existing.module.status !== PublicationStatus.PUBLISHED)
      throw new HttpError(
        400,
        'No se puede publicar dentro de un módulo inactivo.',
        'INACTIVE_MODULE',
      );
  }
  const content = await prisma.educationalContent.update({
    where: { id },
    data: {
      status: status as PublicationStatus,
      publishedAt:
        status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      updatedById: req.auth!.id,
    },
    include,
  });
  await writeAudit({
    actorId: req.auth!.id,
    action:
      status === 'PUBLISHED'
        ? AuditAction.PUBLISH
        : status === 'INACTIVE'
          ? AuditAction.DEACTIVATE
          : AuditAction.UPDATE,
    entityType: 'EducationalContent',
    entityId: id,
    beforeData: { status: existing.status },
    afterData: { status },
    ...requestMetadata(req),
  });
  res.json({ content: serialize(content) });
});
