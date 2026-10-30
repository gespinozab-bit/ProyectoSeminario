import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/error-handler.js';

import { storage } from '../storage/index.js';

export const publicRouter = Router();
publicRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
const idSchema = z.string().uuid();
const published = 'PUBLISHED' as const;
const lessonSummary = { id: true, title: true, summary: true } as const;
const previewMedia = {
  where: { type: 'IMAGE' as const, status: published, storageKey: { not: null } },
  orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
  select: { id: true, altText: true },
  take: 1,
};
const lessonCard = { ...lessonSummary, media: previewMedia } as const;
const summaryView = <T extends { media?: { id: string; altText: string | null }[] }>(item: T) => {
  const { media, ...lesson } = item;
  const image = media?.[0];
  return {
    ...lesson,
    ...(image
      ? { image: { url: `/api/public/media/${image.id}/file`, altText: image.altText } }
      : {}),
  };
};
const moduleSelect = {
  id: true,
  code: true,
  title: true,
  description: true,
  _count: { select: { contents: { where: { status: published } } } },
  contents: {
    where: {
      status: published,
      media: { some: { type: 'IMAGE' as const, status: published, storageKey: { not: null } } },
    },
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { media: previewMedia },
  },
} as const;
const moduleView = <
  T extends {
    _count: { contents: number };
    contents?: { media: { id: string; altText: string | null }[] }[];
  },
>(
  item: T,
) => {
  const { _count, contents, ...module } = item;
  const image = contents?.[0]?.media[0];
  return {
    ...module,
    lessonCount: _count.contents,
    ...(image
      ? { image: { url: `/api/public/media/${image.id}/file`, altText: image.altText } }
      : {}),
  };
};

async function findModule(id: string) {
  const module = await prisma.educationalModule.findFirst({
    where: { id, status: published },
    select: moduleSelect,
  });
  if (!module) throw new HttpError(404, 'Módulo no disponible.', 'MODULE_NOT_FOUND');
  return moduleView(module);
}

publicRouter.get('/modules', async (_req, res) => {
  const modules = await prisma.educationalModule.findMany({
    where: { status: published },
    select: moduleSelect,
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  });
  res.json({ modules: modules.map(moduleView) });
});

publicRouter.get('/modules/:id', async (req, res) => {
  const module = await findModule(idSchema.parse(req.params.id));
  const lessons = await prisma.educationalContent.findMany({
    where: { moduleId: module.id, status: published, module: { status: published } },
    select: lessonCard,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  res.json({ module, lessons: lessons.map(summaryView) });
});

publicRouter.get('/modules/:moduleId/lessons/:id', async (req, res) => {
  const moduleId = idSchema.parse(req.params.moduleId);
  const id = idSchema.parse(req.params.id);
  const module = await findModule(moduleId);
  const lesson = await prisma.educationalContent.findFirst({
    where: { id, moduleId, status: published, module: { status: published } },
    select: {
      ...lessonSummary,
      body: true,
      learningObjective: true,
      media: {
        where: { status: published, storageKey: { not: null } },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, type: true, title: true, altText: true, caption: true },
      },
    },
  });
  if (!lesson) throw new HttpError(404, 'Lección no disponible.', 'CONTENT_NOT_FOUND');
  const lessons = await prisma.educationalContent.findMany({
    where: { moduleId, status: published, module: { status: published } },
    select: lessonCard,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  const { body, media, ...details } = lesson;
  const content =
    body && typeof body === 'object' && !Array.isArray(body) && typeof body.text === 'string'
      ? body.text
      : '';
  res.json({
    module,
    lessons: lessons.map(summaryView),
    lesson: {
      ...details,
      content,
      media: media.map((item) => ({ ...item, url: `/api/public/media/${item.id}/file` })),
    },
  });
});

publicRouter.get('/media/:id/file', async (req, res) => {
  const media = await prisma.mediaAsset.findFirst({
    where: {
      id: idSchema.parse(req.params.id),
      status: published,
      content: { status: published, module: { status: published } },
      storageKey: { not: null },
    },
    select: { storageKey: true, mimeType: true },
  });
  if (!media?.storageKey) throw new HttpError(404, 'Recurso no disponible.', 'MEDIA_NOT_FOUND');
  let size: number;
  try {
    ({ size } = await storage.stat(media.storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new HttpError(404, 'Archivo no disponible.', 'FILE_NOT_FOUND');
    throw error;
  }
  // Recheck publication on every request, including video range requests.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  let range: { start: number; end: number } | undefined;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    let start = 0;
    let end = size - 1;
    if (match?.[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), size - 1);
    } else if (match?.[2]) {
      start = Math.max(0, size - Number(match[2]));
      if (Number(match[2]) === 0) start = size;
    }
    if (
      !match ||
      (!match[1] && !match[2]) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= size
    ) {
      res.status(416).set('Content-Range', `bytes */${size}`).end();
      return;
    }
    range = { start, end };
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.setHeader('Content-Length', range ? range.end - range.start + 1 : size);
  try {
    await pipeline(storage.createReadStream(media.storageKey, range), res);
  } catch (error) {
    if (!req.destroyed && !res.destroyed) throw error;
  }
});
