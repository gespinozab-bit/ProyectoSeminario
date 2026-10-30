import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';

import { PrismaClient, PublicationStatus } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const permissions = [
  ['users.manage', 'Administrar usuarios', 'Crear, editar y desactivar usuarios internos.'],
  ['users.read', 'Consultar usuarios', 'Consultar usuarios internos.'],
  ['users.create', 'Crear usuarios', 'Crear cuentas administrativas y docentes.'],
  ['users.update', 'Editar usuarios', 'Modificar datos de usuarios internos.'],
  ['users.status', 'Cambiar estado de usuarios', 'Activar o desactivar cuentas internas.'],
  ['users.roles.assign', 'Asignar roles', 'Asignar roles administrativos o docentes.'],
  ['users.password.reset', 'Restablecer contraseñas', 'Asignar contraseñas temporales.'],
  ['modules.read', 'Consultar módulos', 'Consultar módulos educativos.'],
  ['modules.order', 'Ordenar módulos', 'Cambiar el orden de los módulos educativos.'],
  ['modules.status', 'Cambiar estado de módulos', 'Activar o desactivar módulos educativos.'],
  ['roles.manage', 'Administrar roles', 'Configurar roles y sus permisos.'],
  ['content.read', 'Consultar contenido', 'Consultar módulos, contenidos y recursos.'],
  ['content.create', 'Crear contenido', 'Crear contenido educativo en borrador.'],
  ['content.update', 'Editar contenido', 'Modificar contenido educativo existente.'],
  ['content.publish', 'Publicar contenido', 'Publicar contenido educativo.'],
  ['content.deactivate', 'Desactivar contenido', 'Retirar contenido educativo publicado.'],
  ['media.read', 'Consultar multimedia', 'Consultar y previsualizar recursos multimedia.'],
  ['media.create', 'Subir multimedia', 'Subir imágenes y videos educativos.'],
  ['media.update', 'Editar multimedia', 'Editar, ordenar o reemplazar recursos multimedia.'],
  ['media.deactivate', 'Desactivar multimedia', 'Desactivar recursos multimedia.'],
] as const;

const modules = [
  ['VOCALES', 'vocales', 'Vocales', 1],
  ['NUMEROS', 'numeros', 'Números', 2],
  ['ABECEDARIO', 'abecedario', 'Abecedario', 3],
  ['COLORES', 'colores', 'Colores', 4],
] as const;

async function main() {
  const permissionRecords = await Promise.all(
    permissions.map(([code, name, description]) =>
      prisma.permission.upsert({
        where: { code },
        update: { name, description },
        create: { code, name, description },
      }),
    ),
  );

  const administrator = await prisma.role.upsert({
    where: { code: 'ADMINISTRADOR' },
    update: { name: 'Administrador', description: 'Acceso completo al panel.', isSystem: true },
    create: {
      code: 'ADMINISTRADOR',
      name: 'Administrador',
      description: 'Acceso completo al panel.',
      isSystem: true,
    },
  });

  const teacher = await prisma.role.upsert({
    where: { code: 'DOCENTE' },
    update: { name: 'Docente', description: 'Gestión de contenido educativo.', isSystem: true },
    create: {
      code: 'DOCENTE',
      name: 'Docente',
      description: 'Gestión de contenido educativo.',
      isSystem: true,
    },
  });

  await prisma.rolePermission.createMany({
    data: permissionRecords.map(({ id }) => ({ roleId: administrator.id, permissionId: id })),
    skipDuplicates: true,
  });

  const teacherPermissionCodes = new Set([
    'content.read',
    'content.create',
    'content.update',
    'content.publish',
    'media.read',
    'media.create',
    'media.update',
    'media.deactivate',
    'modules.read',
  ]);

  await prisma.rolePermission.createMany({
    data: permissionRecords
      .filter(({ code }) => teacherPermissionCodes.has(code))
      .map(({ id }) => ({ roleId: teacher.id, permissionId: id })),
    skipDuplicates: true,
  });

  await Promise.all(
    modules.map(([code, slug, title, sortOrder]) =>
      prisma.educationalModule.upsert({
        where: { code },
        update: { slug, title, sortOrder, status: PublicationStatus.PUBLISHED },
        create: { code, slug, title, sortOrder, status: PublicationStatus.PUBLISHED },
      }),
    ),
  );

  const adminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        firstName: process.env.INITIAL_ADMIN_FIRST_NAME?.trim() || 'Administrador',
        lastName: process.env.INITIAL_ADMIN_LAST_NAME?.trim() || 'LENSEGUA',
        passwordHash,
        mustChangePassword: true,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: administrator.id } },
      update: {},
      create: { userId: adminUser.id, roleId: administrator.id },
    });
  } else {
    console.warn('Initial administrator skipped: seed environment variables are not configured.');
  }

  console.log(`Seed completed: 2 roles, ${permissions.length} permissions and 4 modules.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
