import { educationalCatalog } from './education/catalog.js';
import { prisma } from './lib/prisma.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const total = educationalCatalog.reduce((sum, module) => sum + module.lessons.length, 0);
  if (!apply) {
    for (const module of educationalCatalog)
      console.log(`${module.code}: ${module.lessons.length} lecciones`);
    console.log(
      `${total} lecciones preparadas. Sin cambios en la base. Usa --apply para crear los borradores que falten.`,
    );
    return;
  }
  // One transaction: preserve existing lessons, media, module status and editorial order.
  const result = await prisma.$transaction(
    async (tx) => {
      let created = 0;
      let skipped = 0;
      for (const material of educationalCatalog) {
        const module = await tx.educationalModule.findUnique({ where: { code: material.code } });
        if (!module) throw new Error(`Falta el módulo ${material.code}. Ejecuta primero db:seed.`);
        if (!module.description)
          await tx.educationalModule.update({
            where: { id: module.id },
            data: { description: material.description },
          });
        const existing = await tx.educationalContent.findMany({
          where: { moduleId: module.id },
          select: { slug: true, title: true, sortOrder: true },
        });
        const normalize = (value: string) => value.trim().toLocaleLowerCase('es');
        const slugs = new Set(existing.map((lesson) => lesson.slug));
        const titles = new Set(existing.map((lesson) => normalize(lesson.title)));
        let order = existing.reduce((max, lesson) => Math.max(max, lesson.sortOrder), -1) + 1;
        for (const lesson of material.lessons) {
          if (slugs.has(lesson.slug) || titles.has(normalize(lesson.title))) {
            skipped++;
            continue;
          }
          const createdLesson = await tx.educationalContent.create({
            data: {
              moduleId: module.id,
              slug: lesson.slug,
              title: lesson.title,
              summary: lesson.summary,
              learningObjective: lesson.learningObjective,
              body: { text: lesson.content },
              sortOrder: order++,
              status: 'DRAFT',
            },
          });
          await tx.auditLog.create({
            data: {
              action: 'CREATE',
              entityType: 'EducationalContent',
              entityId: createdLesson.id,
              metadata: {
                source: 'educational-catalog-v1',
                linguisticReview: 'PENDING',
                media: 'PENDING',
              },
            },
          });
          created++;
        }
      }
      return { created, skipped };
    },
    { timeout: 60_000 },
  );
  console.log(
    `Borradores creados: ${result.created}. Contenidos existentes conservados: ${result.skipped}.`,
  );
  console.log('No se publicó material. Faltan demostraciones y revisión de LENSEGUA.');
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error && error.message.startsWith('Falta el módulo')
        ? error.message
        : 'No se pudo importar el material. Comprueba PostgreSQL y las migraciones. No se aplicaron cambios parciales.';
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
