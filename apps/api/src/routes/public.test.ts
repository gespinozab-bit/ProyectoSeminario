import { Readable } from 'node:stream';

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  educationalModule: { findMany: vi.fn(), findFirst: vi.fn() },
  educationalContent: { findMany: vi.fn(), findFirst: vi.fn() },
  mediaAsset: { findFirst: vi.fn() },
}));
const files = vi.hoisted(() => ({ stat: vi.fn(), createReadStream: vi.fn() }));
vi.mock('../lib/prisma.js', () => ({ prisma: db }));
vi.mock('../storage/index.js', () => ({ storage: files }));

import { errorHandler } from '../middleware/error-handler.js';
import { publicRouter } from './public.js';

const moduleId = 'f9a8298e-66cd-4eb4-b9b2-55f3c8387cba';
const lessonId = '2f2484db-d95d-4b50-aa7d-e193776078c3';
const mediaId = 'bb5d0d27-1531-4595-a429-122e593047af';
const app = express();
app.use('/api/public', publicRouter);
app.use(errorHandler);

beforeEach(() => {
  vi.resetAllMocks();
  db.educationalModule.findFirst.mockResolvedValue({
    id: moduleId,
    code: 'VOCALES',
    title: 'Vocales',
    description: null,
    _count: { contents: 1 },
  });
  db.educationalContent.findMany.mockResolvedValue([
    { id: lessonId, title: 'La A', summary: null },
  ]);
  db.mediaAsset.findFirst.mockResolvedValue({
    storageKey: `${mediaId}.mp4`,
    mimeType: 'video/mp4',
  });
  files.stat.mockResolvedValue({ size: 10 });
  files.createReadStream.mockImplementation((_key, range?: { start: number; end: number }) =>
    Readable.from([
      Buffer.from('0123456789').subarray(range?.start ?? 0, range ? range.end + 1 : 10),
    ]),
  );
});

describe('public learning portal', () => {
  it('lists modules anonymously and counts only published lessons', async () => {
    const module = await db.educationalModule.findFirst();
    db.educationalModule.findMany.mockResolvedValue([module]);
    const response = await request(app).get('/api/public/modules');
    expect(response.status).toBe(200);
    expect(response.body.modules[0]).toEqual({
      id: moduleId,
      code: 'VOCALES',
      title: 'Vocales',
      description: null,
      lessonCount: 1,
    });
    expect(db.educationalModule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED' },
        select: expect.objectContaining({
          _count: { select: { contents: { where: { status: 'PUBLISHED' } } } },
        }),
      }),
    );
  });

  it('does not look up lessons inside an unavailable module', async () => {
    db.educationalModule.findFirst.mockResolvedValue(null);
    const response = await request(app).get(`/api/public/modules/${moduleId}/lessons/${lessonId}`);
    expect(response.status).toBe(404);
    expect(db.educationalContent.findFirst).not.toHaveBeenCalled();
    expect(db.educationalModule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: moduleId, status: 'PUBLISHED' },
      }),
    );
  });

  it('returns 404 for unavailable lessons or lessons from another module', async () => {
    db.educationalContent.findFirst.mockResolvedValue(null);
    expect(
      (await request(app).get(`/api/public/modules/${moduleId}/lessons/${lessonId}`)).status,
    ).toBe(404);
    expect(db.educationalContent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: lessonId, moduleId, status: 'PUBLISHED', module: { status: 'PUBLISHED' } },
      }),
    );
  });

  it('uses public media URLs and renders stored text without returning the raw body', async () => {
    db.educationalContent.findFirst.mockResolvedValue({
      id: lessonId,
      title: 'La A',
      summary: null,
      learningObjective: null,
      body: { text: '<script>example</script>' },
      media: [{ id: mediaId, type: 'VIDEO', title: 'La A', altText: null, caption: null }],
    });
    const response = await request(app).get(`/api/public/modules/${moduleId}/lessons/${lessonId}`);
    expect(response.status).toBe(200);
    expect(response.body.lesson.content).toBe('<script>example</script>');
    expect(response.body.lesson).not.toHaveProperty('body');
    expect(response.body.lesson.media[0].url).toBe(`/api/public/media/${mediaId}/file`);
    expect(db.educationalContent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          media: expect.objectContaining({
            where: { status: 'PUBLISHED', storageKey: { not: null } },
          }),
        }),
      }),
    );
  });

  it('requires publication of the resource and both parents before opening any file', async () => {
    db.mediaAsset.findFirst.mockResolvedValue(null);
    const response = await request(app).get(`/api/public/media/${mediaId}/file`);
    expect(response.status).toBe(404);
    expect(files.stat).not.toHaveBeenCalled();
    expect(db.mediaAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: mediaId,
          status: 'PUBLISHED',
          storageKey: { not: null },
          content: { status: 'PUBLISHED', module: { status: 'PUBLISHED' } },
        },
      }),
    );
  });

  it.each([
    ['bytes=2-5', 'bytes 2-5/10', '2345'],
    ['bytes=7-', 'bytes 7-9/10', '789'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
    ['bytes=8-99', 'bytes 8-9/10', '89'],
  ])('streams video range %s', async (range, expectedRange, expectedBytes) => {
    const response = await request(app)
      .get(`/api/public/media/${mediaId}/file`)
      .set('Range', range);
    expect(response.status).toBe(206);
    expect(response.headers['content-range']).toBe(expectedRange);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Buffer.from(response.body).toString()).toBe(expectedBytes);
  });

  it.each(['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-6', 'garbage'])(
    'rejects invalid range %s',
    async (range) => {
      const response = await request(app)
        .get(`/api/public/media/${mediaId}/file`)
        .set('Range', range);
      expect(response.status).toBe(416);
      expect(response.headers['content-range']).toBe('bytes */10');
      expect(files.createReadStream).not.toHaveBeenCalled();
    },
  );

  it('returns 404 when a published file is missing on disk', async () => {
    files.stat.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    expect((await request(app).get(`/api/public/media/${mediaId}/file`)).status).toBe(404);
  });

  it('validates identifiers before accessing the database', async () => {
    expect((await request(app).get('/api/public/modules/invalid')).status).toBe(400);
    expect(db.educationalModule.findFirst).not.toHaveBeenCalled();
  });
});
