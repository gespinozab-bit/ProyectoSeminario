import { spawnSync } from 'node:child_process';
import { prisma } from './lib/prisma.js';

async function main() {
  const [users, roles, modules] = await Promise.all([
    prisma.user.count(),
    prisma.role.count(),
    prisma.educationalModule.count(),
  ]);
  if (users === 0 && roles === 0 && modules === 0) {
    const seeded = spawnSync('npm', ['run', 'db:seed'], { stdio: 'inherit' });
    if (seeded.status !== 0) throw new Error('No se pudo inicializar la base nueva.');
  } else {
    console.log('Base existente: se conservan usuarios, contraseñas, módulos y sus estados.');
  }
  const imported = spawnSync(process.execPath, ['dist/import-materials.js', '--apply'], {
    stdio: 'inherit',
  });
  if (imported.status !== 0) throw new Error('No se pudo comprobar el catálogo educativo.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'No se pudo preparar la base local.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
