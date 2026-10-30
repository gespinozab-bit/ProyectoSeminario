import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { educationalCatalog } from './education/catalog.js';

async function main() {
  const destination = path.resolve('../../docs/materiales');
  await mkdir(destination, { recursive: true });
  const header =
    '# Catálogo educativo inicial\n\nMaterial original de apoyo a la lectoescritura y asociación de conceptos. Estado: borrador.\nNo describe ni certifica la ejecución de señas. Requiere demostraciones y revisión de LENSEGUA.\n\n';
  const catalog =
    header +
    educationalCatalog
      .map(
        (module) =>
          `## ${module.code}\n\n${module.description}\n\n${module.lessons.map((lesson) => `### ${lesson.title}\n\nClave: \`${lesson.slug}\`\n\n${lesson.summary}\n\n**Objetivo:** ${lesson.learningObjective}\n\n${lesson.content}\n`).join('\n')}`,
      )
      .join('\n');
  const filming =
    '# Fichas de producción y revisión\n\nTodas las fichas están pendientes de grabación y revisión lingüística. No son material listo para publicar.\n\n' +
    educationalCatalog
      .map(
        (module) =>
          `## ${module.code}\n\n${module.lessons.map((lesson) => `### ${lesson.title}\n\nClave: \`${lesson.slug}\`\n\n${lesson.mediaBrief}\n\n- Archivo: pendiente.\n- Persona que realiza la demostración: pendiente.\n- Revisión LENSEGUA (nombre, fecha y observaciones): pendiente.\n- Autorización de uso: pendiente.\n- Correspondencia entre rótulo, demostración y objetivo: pendiente.\n- Texto alternativo o descripción, contraste y subtítulos explicativos cuando correspondan: pendiente.\n- Decisión editorial: mantener en borrador.\n`).join('\n')}`,
      )
      .join('\n');
  await writeFile(path.join(destination, 'catalogo.md'), catalog, 'utf8');
  await writeFile(path.join(destination, 'fichas-multimedia.md'), filming, 'utf8');
  console.log(`Catálogo y fichas exportados a ${destination}`);
}

main().catch(() => {
  console.error('No se pudieron exportar los materiales.');
  process.exitCode = 1;
});
