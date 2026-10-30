import type { AuditAction, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

interface AuditInput {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

export const writeAudit = async (
  input: AuditInput,
  database: Pick<Prisma.TransactionClient, 'auditLog'> = prisma,
) => {
  await database.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.beforeData !== undefined ? { beforeData: input.beforeData } : {}),
      ...(input.afterData !== undefined ? { afterData: input.afterData } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    },
  });
};
