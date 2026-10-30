import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { rm } from 'node:fs/promises';

import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { AuditAction, PublicationStatus } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import {
  requireAuthentication,
  requirePasswordChanged,
  requirePermission,
} from '../middleware/auth.js';
import { HttpError } from '../middleware/error-handler.js';
import { validateMediaFile } from '../services/media-file.js';
import { writeAudit } from '../services/audit.js';
import { storage } from '../storage/index.js';
import { requestMetadata } from '../utils/request.js';

export const mediaRouter = Router();
mediaRouter.use(requireAuthentication, requirePasswordChanged);

const idSchema = z.string().uuid();
const metadataSchema = z
  .object({
    title: z.string().trim().max(180).optional().nullable(),
    altText: z.string().trim().max(300).optional().nullable(),
    caption: z.string().trim().max(500).optional().nullable(),
    isPrimary: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Debe enviar algún cambio.' });
const statusSchema = z.object({ status: z.enum(['PUBLISHED', 'INACTIVE']) });
const uploadFieldsSchema = z.object({
  title: z.string().trim().max(180).optional(),
  altText: z.string().trim().max(300).optional(),
  caption: z.string().trim().max(500).optional(),
  isPrimary: z.enum(['true', 'false']).optional(),
});
const orderSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) }))
    .min(1)
    .max(100),
});

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 10 },
});
const receiveFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        new HttpError(
          400,
          error.code === 'LIMIT_FILE_SIZE'
            ? 'El archivo supera el límite máximo permitido.'
            : 'No fue posible procesar el archivo.',
          error.code,
        ),
      );
      return;
    }
    next(error);
  });
};

const serialize = <T extends { sizeBytes: bigint | null; storageKey: string | null }>(media: T) => {
  const { storageKey, ...publicMedia } = media;
  void storageKey;
  return {
    ...publicMedia,
    sizeBytes: media.sizeBytes === null ? null : Number(media.sizeBytes),
  };
};

async function findMedia(id: string) {
  const media = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!media) throw new HttpError(404, 'Recurso multimedia no encontrado.', 'MEDIA_NOT_FOUND');
  return media;
}

mediaRouter.get('/contents/:contentId/media', requirePermission('media.read'), async (req, res) => {
  const contentId = idSchema.parse(req.params.contentId);
  const content = await prisma.educationalContent.findUnique({
    where: { id: contentId },
    select: { id: true },
  });
  if (!content) throw new HttpError(404, 'Contenido no encontrado.', 'CONTENT_NOT_FOUND');
  const media = await prisma.mediaAsset.findMany({
    where: { contentId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ media: media.map(serialize) });
});

mediaRouter.post(
  '/contents/:contentId/media',
  requirePermission('media.create'),
  receiveFile,
  async (req, res) => {
    const contentId = idSchema.parse(req.params.contentId);
    if (!req.file) throw new HttpError(400, 'Selecciona un archivo.', 'FILE_REQUIRED');
    const content = await prisma.educationalContent.findUnique({
      where: { id: contentId },
      select: { id: true },
    });
    if (!content) {
      await rm(req.file.path, { force: true });
      throw new HttpError(404, 'Contenido no encontrado.', 'CONTENT_NOT_FOUND');
    }
    const parsedFields = uploadFieldsSchema.safeParse(req.body);
    if (!parsedFields.success) {
      await rm(req.file.path, { force: true });
      throw parsedFields.error;
    }
    const fields = parsedFields.data;
    const validated = await validateMediaFile(req.file);
    const id = randomUUID();
    const last = await prisma.mediaAsset.aggregate({
      where: { contentId },
      _max: { sortOrder: true },
      _count: { id: true },
    });
    const isPrimary = last._count.id === 0 || fields.isPrimary === 'true';
    await storage.saveFromTemporaryFile(req.file.path, validated.storageKey);
    try {
      const media = await prisma.$transaction(async (tx) => {
        if (isPrimary)
          await tx.mediaAsset.updateMany({ where: { contentId }, data: { isPrimary: false } });
        return tx.mediaAsset.create({
          data: {
            id,
            contentId,
            type: validated.type,
            url: `/api/media/${id}/file`,
            storageKey: validated.storageKey,
            mimeType: validated.mimeType,
            sizeBytes: validated.size,
            title: fields.title || null,
            altText: fields.altText || null,
            caption: fields.caption || null,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
            isPrimary,
            status: PublicationStatus.PUBLISHED,
          },
        });
      });
      await writeAudit({
        actorId: req.auth!.id,
        action: AuditAction.CREATE,
        entityType: 'MediaAsset',
        entityId: media.id,
        afterData: { contentId, type: media.type, mimeType: media.mimeType, isPrimary },
        ...requestMetadata(req),
      });
      res.status(201).json({ media: serialize(media) });
    } catch (error) {
      await storage.delete(validated.storageKey);
      throw error;
    }
  },
);

mediaRouter.patch('/media/:id', requirePermission('media.update'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const input = metadataSchema.parse(req.body);
  const existing = await findMedia(id);
  const media = await prisma.$transaction(async (tx) => {
    if (input.isPrimary)
      await tx.mediaAsset.updateMany({
        where: { contentId: existing.contentId, id: { not: id } },
        data: { isPrimary: false },
      });
    return tx.mediaAsset.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title || null } : {}),
        ...(input.altText !== undefined ? { altText: input.altText || null } : {}),
        ...(input.caption !== undefined ? { caption: input.caption || null } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      },
    });
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: AuditAction.UPDATE,
    entityType: 'MediaAsset',
    entityId: id,
    beforeData: { title: existing.title, altText: existing.altText, isPrimary: existing.isPrimary },
    afterData: { title: media.title, altText: media.altText, isPrimary: media.isPrimary },
    ...requestMetadata(req),
  });
  res.json({ media: serialize(media) });
});

mediaRouter.put(
  '/contents/:contentId/media/order',
  requirePermission('media.update'),
  async (req, res) => {
    const contentId = idSchema.parse(req.params.contentId);
    const { items } = orderSchema.parse(req.body);
    if (
      new Set(items.map(({ id }) => id)).size !== items.length ||
      new Set(items.map(({ sortOrder }) => sortOrder)).size !== items.length
    )
      throw new HttpError(400, 'Los recursos y órdenes no pueden repetirse.', 'DUPLICATE_ORDER');
    const existing = await prisma.mediaAsset.findMany({
      where: { contentId, id: { in: items.map(({ id }) => id) } },
    });
    if (existing.length !== items.length)
      throw new HttpError(400, 'Lista de recursos inválida.', 'INVALID_MEDIA');
    const maximum = await prisma.mediaAsset.aggregate({
      where: { contentId },
      _max: { sortOrder: true },
    });
    const temporaryBase = (maximum._max.sortOrder ?? 0) + items.length + 1;
    await prisma.$transaction(async (tx) => {
      for (const [index, item] of items.entries())
        await tx.mediaAsset.update({
          where: { id: item.id },
          data: { sortOrder: temporaryBase + index },
        });
      for (const item of items)
        await tx.mediaAsset.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
    });
    await writeAudit({
      actorId: req.auth!.id,
      action: AuditAction.UPDATE,
      entityType: 'MediaAssetOrder',
      entityId: contentId,
      beforeData: existing.map(({ id, sortOrder }) => ({ id, sortOrder })),
      afterData: items,
      ...requestMetadata(req),
    });
    res.status(204).send();
  },
);

mediaRouter.patch('/media/:id/status', requirePermission('media.deactivate'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { status } = statusSchema.parse(req.body);
  const existing = await findMedia(id);
  if (status === 'INACTIVE') {
    const [content, activeCount] = await Promise.all([
      prisma.educationalContent.findUnique({
        where: { id: existing.contentId },
        select: { status: true },
      }),
      prisma.mediaAsset.count({
        where: { contentId: existing.contentId, status: PublicationStatus.PUBLISHED },
      }),
    ]);
    if (content?.status === PublicationStatus.PUBLISHED && activeCount <= 1)
      throw new HttpError(
        409,
        'No puedes desactivar el último recurso activo de un contenido publicado.',
        'LAST_ACTIVE_MEDIA',
      );
  }
  const media = await prisma.mediaAsset.update({
    where: { id },
    data: {
      status: status as PublicationStatus,
      ...(status === 'INACTIVE' ? { isPrimary: false } : {}),
    },
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: status === 'INACTIVE' ? AuditAction.DEACTIVATE : AuditAction.UPDATE,
    entityType: 'MediaAsset',
    entityId: id,
    beforeData: { status: existing.status },
    afterData: { status },
    ...requestMetadata(req),
  });
  res.json({ media: serialize(media) });
});

mediaRouter.post(
  '/media/:id/replace',
  requirePermission('media.update'),
  receiveFile,
  async (req, res) => {
    const id = idSchema.parse(req.params.id);
    if (!req.file) throw new HttpError(400, 'Selecciona un archivo.', 'FILE_REQUIRED');
    let existing;
    try {
      existing = await findMedia(id);
    } catch (error) {
      await rm(req.file.path, { force: true });
      throw error;
    }
    const validated = await validateMediaFile(req.file);
    await storage.saveFromTemporaryFile(req.file.path, validated.storageKey);
    let media;
    try {
      media = await prisma.mediaAsset.update({
        where: { id },
        data: {
          type: validated.type,
          mimeType: validated.mimeType,
          storageKey: validated.storageKey,
          sizeBytes: validated.size,
          status: PublicationStatus.PUBLISHED,
        },
      });
    } catch (error) {
      await storage.delete(validated.storageKey);
      throw error;
    }
    if (existing.storageKey) await storage.delete(existing.storageKey);
    await writeAudit({
      actorId: req.auth!.id,
      action: AuditAction.UPDATE,
      entityType: 'MediaAsset',
      entityId: id,
      beforeData: { type: existing.type, mimeType: existing.mimeType },
      afterData: { type: media.type, mimeType: media.mimeType, replaced: true },
      ...requestMetadata(req),
    });
    res.json({ media: serialize(media) });
  },
);

mediaRouter.get('/media/:id/file', requirePermission('media.read'), async (req, res) => {
  const media = await findMedia(idSchema.parse(req.params.id));
  if (!media.storageKey) throw new HttpError(404, 'Archivo no disponible.', 'FILE_NOT_FOUND');
  const { size } = await storage.stat(media.storageKey);
  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const rangeHeader = req.headers.range;
  if (!rangeHeader) {
    res.setHeader('Content-Length', size);
    storage.createReadStream(media.storageKey).pipe(res);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    res.status(416).setHeader('Content-Range', `bytes */${size}`).send();
    return;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    res.status(416).setHeader('Content-Range', `bytes */${size}`).send();
    return;
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  storage.createReadStream(media.storageKey, { start, end }).pipe(res);
});
