import { randomBytes } from 'node:crypto';

import { prisma } from './lib/prisma.js';
import { hashPassword } from './security/password.js';

async function main() {
  const email = (process.argv[2] ?? process.env.INITIAL_ADMIN_EMAIL)?.trim().toLowerCase();
  if (!email) throw new Error('Indica el correo del administrador.');

  const temporaryPassword = `Lg!7${randomBytes(24).toString('base64url')}`;
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.roles.some(({ role }) => role.code === 'ADMINISTRADOR')) {
      throw new Error('No existe un administrador con ese correo.');
    }
    if (user.status !== 'ACTIVE') throw new Error('La cuenta está inactiva.');
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    await tx.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        action: 'PASSWORD_RESET',
        entityType: 'User',
        entityId: user.id,
        metadata: { source: 'local-admin-recovery' },
      },
    });
  });
  console.log(`Administrador: ${email}\nContraseña temporal: ${temporaryPassword}`);
  console.log('Debes cambiarla al ingresar. Las sesiones anteriores fueron revocadas.');
}

main()
  .catch(() => {
    console.error(
      'No se pudo recuperar el acceso. Verifica PostgreSQL y el correo de una cuenta administrativa activa.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
