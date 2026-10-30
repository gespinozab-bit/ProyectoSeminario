import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { env } from './config/env.js';
import { educationalCatalog } from './education/catalog.js';
import {
  assertSourceUrl,
  fetchSourceSigns,
  fetchWithRetry,
  publicSourcePage,
  sourceName,
} from './education/public-sources.js';
import { prisma } from './lib/prisma.js';
import { validateMediaFile } from './services/media-file.js';
import { storage } from './storage/index.js';

const marker = '[Kitsord/LENSEGUA]';
async function attach(
  contentId: string,
  title: string,
  filePath: string,
  type: 'jpg' | 'webm',
  caption: string,
  originalUrl: string,
) {
  const mime = type === 'jpg' ? 'image/jpeg' : 'video/webm';
  const validated = await validateMediaFile({
    path: filePath,
    originalname: `source.${type}`,
    mimetype: mime,
    size: (await stat(filePath)).size,
  } as Express.Multer.File);
  await storage.saveFromTemporaryFile(filePath, validated.storageKey);
  const id = randomUUID();
  try {
    return await prisma.$transaction(async (tx) => {
      const maximum = await tx.mediaAsset.aggregate({
        where: { contentId },
        _max: { sortOrder: true },
        _count: { id: true },
      });
      const media = await tx.mediaAsset.create({
        data: {
          id,
          contentId,
          type: validated.type,
          url: `/api/media/${id}/file`,
          storageKey: validated.storageKey,
          mimeType: mime,
          sizeBytes: validated.size,
          title,
          altText: title,
          caption,
          sortOrder: (maximum._max.sortOrder ?? -1) + 1,
          isPrimary: maximum._count.id === 0,
          status: 'PUBLISHED',
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          entityType: 'MediaAsset',
          entityId: id,
          metadata: {
            source: 'public-kitsord-v1',
            sourcePage: publicSourcePage,
            originalUrl,
            contentId,
            review: 'source-name-matched; not independently linguistically certified',
          },
        },
      });
      return media;
    });
  } catch (error) {
    await storage.delete(validated.storageKey);
    throw error;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const publish = process.argv.includes('--publish');
  const groups = await Promise.all(
    ['abecedario', 'numeros', 'colores'].map(
      async (category) => [category, await fetchSourceSigns(category)] as const,
    ),
  );
  const signs = new Map(groups);
  // Search by exact name, also offered on the original site. This includes records whose
  // category metadata is incomplete (for example P), without guessing a different sign.
  for (const [category, name] of [
    ['abecedario', 'p'],
    ['colores', 'amarillo'],
  ] as const) {
    if (!signs.get(category)!.some((item) => item.name === name))
      signs.get(category)!.push(...(await fetchSourceSigns(category, name)));
  }
  let attached = 0;
  let published = 0;
  const missing: string[] = [];
  const failures: string[] = [];
  for (const module of educationalCatalog) {
    const category = module.code === 'VOCALES' ? 'abecedario' : module.code.toLowerCase();
    for (const lesson of module.lessons) {
      const source = signs
        .get(category)
        ?.find((item) => item.name === sourceName(module.code, lesson.slug));
      if (!source) {
        missing.push(`${module.code}/${lesson.slug}`);
        continue;
      }
      if (!apply) continue;
      const record = await prisma.educationalContent.findFirst({
        where: { slug: lesson.slug, module: { code: module.code } },
        include: { module: true, media: true },
      });
      if (!record || record.status === 'INACTIVE') {
        failures.push(`${lesson.title}: ficha ausente o inactiva`);
        continue;
      }
      const directory = await mkdtemp(path.join(os.tmpdir(), 'lensegua-source-'));
      try {
        let original = record.media.find((item) => item.caption?.startsWith(`${marker} Original.`));
        if (!original) {
          const response = await fetchWithRetry(assertSourceUrl(source.url), {
            signal: AbortSignal.timeout(60_000),
            redirect: 'error',
          });
          if (!response.ok) throw new Error('Recurso original no disponible');
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 100 * 1024 * 1024) throw new Error('Archivo demasiado grande');
          const file = path.join(directory, `original.${source.type}`);
          await writeFile(file, bytes);
          original = await attach(
            record.id,
            `Seña de ${lesson.title} — Kitsord`,
            file,
            source.type,
            `${marker} Original. Material de LENSEGUA publicado por Kitsord. Fuente: ${publicSourcePage}`,
            source.url,
          );
          attached++;
        }
        if (
          source.type === 'webm' &&
          !record.media.some((item) => item.caption?.startsWith(`${marker} Fotograma.`))
        ) {
          const poster = path.join(directory, 'reference.jpg');
          execFileSync(
            'ffmpeg',
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-ss',
              '0.8',
              '-i',
              path.resolve(env.MEDIA_STORAGE_PATH, original.storageKey!),
              '-frames:v',
              '1',
              '-q:v',
              '3',
              poster,
            ],
            { timeout: 30_000, stdio: 'pipe' },
          );
          const image = await attach(
            record.id,
            `Referencia visual: ${lesson.title}`,
            poster,
            'jpg',
            `${marker} Fotograma. Es una imagen de referencia; reproduce el video para observar el movimiento completo. Fuente: ${publicSourcePage}`,
            source.url,
          );
          // Use the image in grids, while retaining the complete moving demonstration.
          if (original.isPrimary)
            await prisma.$transaction([
              prisma.mediaAsset.update({ where: { id: original.id }, data: { isPrimary: false } }),
              prisma.mediaAsset.update({ where: { id: image.id }, data: { isPrimary: true } }),
            ]);
          attached++;
        }
        if (
          publish &&
          record.status === 'DRAFT' &&
          record.module.status === 'PUBLISHED' &&
          record.body &&
          typeof record.body === 'object' &&
          !Array.isArray(record.body) &&
          typeof record.body.text === 'string' &&
          record.body.text.trim()
        ) {
          await prisma.$transaction(async (tx) => {
            const count = await tx.mediaAsset.count({
              where: { contentId: record.id, type: 'IMAGE', status: 'PUBLISHED' },
            });
            if (count === 0) return;
            await tx.educationalContent.update({
              where: { id: record.id },
              data: { status: 'PUBLISHED', publishedAt: record.publishedAt ?? new Date() },
            });
            await tx.auditLog.create({
              data: {
                action: 'PUBLISH',
                entityType: 'EducationalContent',
                entityId: record.id,
                metadata: {
                  source: 'public-kitsord-v1',
                  reason:
                    'Local portal material requested by owner; source-matched images with original attribution',
                },
              },
            });
            published++;
          });
        }
        console.log(
          `${module.code}: ${lesson.title} — recurso comprobado${publish ? ' y disponible' : ''}`,
        );
      } catch {
        failures.push(`${module.code}/${lesson.slug}: no se pudo completar la importación`);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
  console.log(JSON.stringify({ apply, attached, published, missing, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main()
  .catch(() => {
    console.error('No se pudo consultar o importar la fuente pública.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
