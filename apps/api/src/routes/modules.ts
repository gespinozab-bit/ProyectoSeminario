import { Router } from 'express';
import { z } from 'zod';

import { AuditAction, PublicationStatus } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import {
  requireAuthentication,
  requirePasswordChanged,
  requirePermission,
} from '../middleware/auth.js';
import { HttpError } from '../middleware/error-handler.js';
import { writeAudit } from '../services/audit.js';
import { requestMetadata } from '../utils/request.js';

export const modulesRouter = Router();
modulesRouter.use(requireAuthentication, requirePasswordChanged);

const idSchema = z.string().uuid();
const orderSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) }))
    .min(1)
    .max(20),
});
const statusSchema = z.object({ status: z.enum(['PUBLISHED', 'INACTIVE']) });

modulesRouter.get('/', requirePermission('modules.read'), async (_req, res) => {
  const modules = await prisma.educationalModule.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: { _count: { select: { contents: true } } },
  });
  res.json({ modules });
});

modulesRouter.put('/order', requirePermission('modules.order'), async (req, res) => {
  const { items } = orderSchema.parse(req.body);
  if (new Set(items.map(({ id }) => id)).size !== items.length)
    throw new HttpError(400, 'Los módulos no pueden repetirse.', 'DUPLICATE_MODULE');
  if (new Set(items.map(({ sortOrder }) => sortOrder)).size !== items.length)
    throw new HttpError(400, 'Los valores de orden no pueden repetirse.', 'DUPLICATE_ORDER');
  const existing = await prisma.educationalModule.findMany({
    where: { id: { in: items.map(({ id }) => id) } },
  });
  if (existing.length !== items.length)
    throw new HttpError(400, 'Uno o más módulos no existen.', 'INVALID_MODULE');
  await prisma.$transaction(
    items.map(({ id, sortOrder }) =>
      prisma.educationalModule.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  await writeAudit({
    actorId: req.auth!.id,
    action: AuditAction.UPDATE,
    entityType: 'EducationalModuleOrder',
    entityId: 'all',
    beforeData: existing.map(({ id, sortOrder }) => ({ id, sortOrder })),
    afterData: items,
    ...requestMetadata(req),
  });
  const modules = await prisma.educationalModule.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ modules });
});

modulesRouter.patch('/:id/status', requirePermission('modules.status'), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { status } = statusSchema.parse(req.body);
  const existing = await prisma.educationalModule.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Módulo no encontrado.', 'MODULE_NOT_FOUND');
  const module = await prisma.educationalModule.update({
    where: { id },
    data: { status: status as PublicationStatus },
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: status === 'INACTIVE' ? AuditAction.DEACTIVATE : AuditAction.PUBLISH,
    entityType: 'EducationalModule',
    entityId: id,
    beforeData: { status: existing.status },
    afterData: { status },
    ...requestMetadata(req),
  });
  res.json({ module });
});
