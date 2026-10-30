import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { hashPassword } from './security/password.js';
import { storage } from './storage/index.js';

const app = createApp();
const password = 'TestPassword!42';
const changedPassword = 'ChangedPassword!84';
const marker = `auth-test-${Date.now()}`;
const emails = {
  admin: `${marker}-admin@example.com`,
  teacher: `${marker}-teacher@example.com`,
  firstLogin: `${marker}-first@example.com`,
  lock: `${marker}-lock@example.com`,
};
const createdIds: string[] = [];
const createdContentIds: string[] = [];
const createdModuleIds: string[] = [];

async function createUser(
  email: string,
  roleCode: 'ADMINISTRADOR' | 'DOCENTE',
  mustChangePassword: boolean,
) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Auth',
      lastName: 'Test',
      passwordHash: await hashPassword(password),
      mustChangePassword,
      roles: { create: { roleId: role.id } },
    },
  });
  createdIds.push(user.id);
  return user;
}

beforeAll(async () => {
  await createUser(emails.admin, 'ADMINISTRADOR', false);
  await createUser(emails.teacher, 'DOCENTE', false);
  await createUser(emails.firstLogin, 'DOCENTE', true);
  await createUser(emails.lock, 'DOCENTE', false);
});

afterAll(async () => {
  const storedFiles = await prisma.mediaAsset.findMany({
    where: { contentId: { in: createdContentIds } },
    select: { storageKey: true },
  });
  await Promise.all(
    storedFiles.map(({ storageKey }) =>
      storageKey ? storage.delete(storageKey) : Promise.resolve(),
    ),
  );
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: createdIds } },
        { entityId: { in: [...createdIds, ...createdContentIds, ...Object.values(emails)] } },
      ],
    },
  });
  await prisma.educationalContent.deleteMany({ where: { id: { in: createdContentIds } } });
  await prisma.educationalModule.deleteMany({ where: { id: { in: createdModuleIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.$disconnect();
});

describe('authentication and authorization', () => {
  it('checks publication of the module, lesson and file against the real database', async () => {
    const module = await prisma.educationalModule.create({
      data: {
        code: `${marker}-public`,
        slug: `${marker}-public`,
        title: 'Módulo de prueba pública',
        status: 'PUBLISHED',
      },
    });
    createdModuleIds.push(module.id);
    const teacher = request.agent(app);
    await teacher.post('/api/auth/login').send({ email: emails.teacher, password });
    const created = await teacher.post('/api/contents').send({
      moduleId: module.id,
      title: 'Lección de prueba pública',
      content: 'Texto de prueba.',
      sortOrder: 0,
    });
    expect(created.status).toBe(201);
    const id = created.body.content.id as string;
    createdContentIds.push(id);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6n8AAAAASUVORK5CYII=',
      'base64',
    );
    const uploaded = await teacher
      .post(`/api/contents/${id}/media`)
      .field('altText', 'Imagen de prueba')
      .attach('file', png, { filename: 'test.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    const fileUrl = `/api/public/media/${uploaded.body.media.id}/file`;
    expect((await request(app).get(fileUrl)).status).toBe(404);
    expect((await request(app).get(`/api/public/modules/${module.id}`)).body.lessons).toHaveLength(
      0,
    );
    expect(
      (await teacher.patch(`/api/contents/${id}/status`).send({ status: 'PUBLISHED' })).status,
    ).toBe(200);
    const lesson = await request(app).get(`/api/public/modules/${module.id}/lessons/${id}`);
    expect(lesson.status).toBe(200);
    expect(lesson.body.lesson.media[0].url).toBe(fileUrl);
    expect(lesson.body.lesson.media[0]).not.toHaveProperty('storageKey');
    const modulePreview = await request(app).get(`/api/public/modules/${module.id}`);
    expect(modulePreview.body.module.image.url).toBe(fileUrl);
    expect(modulePreview.body.lessons[0].image.url).toBe(fileUrl);
    expect(modulePreview.body.lessons[0]).not.toHaveProperty('media');
    const file = await request(app).get(fileUrl);
    expect(file.status).toBe(200);
    expect(file.body).toEqual(png);
    expect(file.headers['cache-control']).toBe('no-store');
    await prisma.educationalModule.update({
      where: { id: module.id },
      data: { status: 'INACTIVE' },
    });
    expect((await request(app).get(`/api/public/modules/${module.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/modules/${module.id}/lessons/${id}`)).status).toBe(
      404,
    );
    expect((await request(app).get(fileUrl)).status).toBe(404);
    await prisma.educationalModule.update({
      where: { id: module.id },
      data: { status: 'PUBLISHED' },
    });
    expect(
      (await teacher.patch(`/api/contents/${id}/status`).send({ status: 'DRAFT' })).status,
    ).toBe(200);
    expect((await request(app).get(fileUrl)).status).toBe(404);
  });
  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTH_REQUIRED');
  });

  it('uses HttpOnly cookies and authorizes an administrator', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: emails.admin, password });
    expect(login.status).toBe(200);
    expect(login.body).not.toHaveProperty('accessToken');
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
    expect((await agent.get('/api/users')).status).toBe(200);
  });

  it('denies user administration to a teacher', async () => {
    const agent = request.agent(app);
    expect(
      (await agent.post('/api/auth/login').send({ email: emails.teacher, password })).status,
    ).toBe(200);
    const response = await agent.get('/api/users');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('requires and completes the first-login password change', async () => {
    const agent = request.agent(app);
    expect(
      (await agent.post('/api/auth/login').send({ email: emails.firstLogin, password })).status,
    ).toBe(200);
    const blocked = await agent.get('/api/users');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const changed = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: password, newPassword: changedPassword });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('rotates refresh tokens and rejects replay', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: emails.admin, password });
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const oldRefresh = cookies.find((cookie) => cookie.startsWith('lensegua_refresh='));
    expect(oldRefresh).toBeDefined();
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', oldRefresh!);
    expect(refreshed.status).toBe(200);
    expect(String(refreshed.headers['set-cookie'])).toContain('lensegua_refresh=');
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', oldRefresh!);
    expect(replay.status).toBe(401);
  });

  it('clears cookies on logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: emails.admin, password });
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('locks an account after five failed attempts', async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: emails.lock, password: 'WrongPassword!42' });
      expect(response.status).toBe(401);
    }
    const fifth = await request(app)
      .post('/api/auth/login')
      .send({ email: emails.lock, password: 'WrongPassword!42' });
    expect(fifth.status).toBe(423);
    expect(fifth.body.code).toBe('ACCOUNT_LOCKED');
    expect(
      (await request(app).post('/api/auth/login').send({ email: emails.lock, password })).status,
    ).toBe(423);
  });

  it('validates and manages educational content according to permissions', async () => {
    const module = await prisma.educationalModule.findUniqueOrThrow({
      where: { code: 'VOCALES' },
    });
    const teacher = request.agent(app);
    await teacher.post('/api/auth/login').send({ email: emails.teacher, password });
    expect((await teacher.get('/api/modules')).status).toBe(200);
    expect(
      (await teacher.patch(`/api/modules/${module.id}/status`).send({ status: 'INACTIVE' })).status,
    ).toBe(403);
    expect(
      (await teacher.post('/api/contents').send({ moduleId: module.id, title: '', sortOrder: 900 }))
        .status,
    ).toBe(400);

    const first = await teacher.post('/api/contents').send({
      moduleId: module.id,
      title: 'Contenido de prueba A',
      summary: 'Borrador de integración',
      learningObjective: 'Reconocer una letra escrita y practicar con un modelo revisado.',
      content: '',
      sortOrder: 900,
    });
    expect(first.status).toBe(201);
    expect(first.body.content.learningObjective).toBe(
      'Reconocer una letra escrita y practicar con un modelo revisado.',
    );
    createdContentIds.push(first.body.content.id);
    const emptyPublish = await teacher
      .patch(`/api/contents/${first.body.content.id}/status`)
      .send({ status: 'PUBLISHED' });
    expect(emptyPublish.status).toBe(400);
    expect(emptyPublish.body.code).toBe('EMPTY_CONTENT');
    expect(
      (
        await teacher.patch(`/api/contents/${first.body.content.id}`).send({
          content: 'Material educativo listo para publicarse.',
          title: 'Contenido actualizado A',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await teacher
          .patch(`/api/contents/${first.body.content.id}/status`)
          .send({ status: 'PUBLISHED' })
      ).body.code,
    ).toBe('MEDIA_REQUIRED');
    await prisma.mediaAsset.create({
      data: {
        contentId: first.body.content.id,
        type: 'IMAGE',
        url: 'https://example.test/vocal-a.png',
        mimeType: 'image/png',
        status: 'PUBLISHED',
      },
    });
    expect(
      (
        await teacher
          .patch(`/api/contents/${first.body.content.id}/status`)
          .send({ status: 'PUBLISHED' })
      ).status,
    ).toBe(200);
    expect(
      (
        await teacher
          .patch(`/api/contents/${first.body.content.id}/status`)
          .send({ status: 'INACTIVE' })
      ).status,
    ).toBe(403);

    const second = await teacher.post('/api/contents').send({
      moduleId: module.id,
      title: 'Contenido de prueba B',
      content: 'Segundo contenido.',
      sortOrder: 901,
    });
    expect(second.status).toBe(201);
    createdContentIds.push(second.body.content.id);
    expect(
      (
        await teacher.put('/api/contents/order/batch').send({
          moduleId: module.id,
          items: [
            { id: first.body.content.id, sortOrder: 901 },
            { id: second.body.content.id, sortOrder: 900 },
          ],
        })
      ).status,
    ).toBe(204);
    const filtered = await teacher.get(
      `/api/contents?moduleId=${module.id}&status=PUBLISHED&page=1&pageSize=5`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.pagination).toMatchObject({ page: 1, pageSize: 5 });

    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ email: emails.admin, password });
    expect(
      (
        await admin
          .patch(`/api/contents/${first.body.content.id}/status`)
          .send({ status: 'INACTIVE' })
      ).status,
    ).toBe(200);
  });

  it('does not publish a lesson without an image or video', async () => {
    const module = await prisma.educationalModule.findUniqueOrThrow({ where: { code: 'VOCALES' } });
    const teacher = request.agent(app);
    await teacher.post('/api/auth/login').send({ email: emails.teacher, password });
    const created = await teacher.post('/api/contents').send({
      moduleId: module.id,
      title: 'Vocal sin multimedia de prueba',
      content: 'Texto de prueba sin archivo asociado.',
      sortOrder: 930,
    });
    expect(created.status).toBe(201);
    const vocalA = created.body.content;
    createdContentIds.push(vocalA.id);
    expect(vocalA.status).toBe('DRAFT');
    const publish = await teacher
      .patch(`/api/contents/${vocalA.id}/status`)
      .send({ status: 'PUBLISHED' });

    expect(publish.status).toBe(400);
    expect(publish.body).toMatchObject({
      code: 'MEDIA_REQUIRED',
      error: 'Agrega al menos una imagen o video antes de publicar.',
    });
    expect(
      (await prisma.educationalContent.findUniqueOrThrow({ where: { id: vocalA.id } })).status,
    ).toBe('DRAFT');
  });

  it('uploads, validates, manages and streams multimedia', async () => {
    const module = await prisma.educationalModule.findUniqueOrThrow({ where: { code: 'VOCALES' } });
    const teacher = request.agent(app);
    await teacher.post('/api/auth/login').send({ email: emails.teacher, password });
    expect(
      (
        await request(app)
          .post(`/api/contents/${randomUUID()}/media`)
          .attach('file', Buffer.from('not-an-image'), {
            filename: 'unsafe.png',
            contentType: 'image/png',
          })
      ).status,
    ).toBe(401);

    const created = await teacher.post('/api/contents').send({
      moduleId: module.id,
      title: 'Multimedia de prueba',
      content: 'Contenido con recursos.',
      sortOrder: 920,
    });
    expect(created.status).toBe(201);
    const contentId = created.body.content.id as string;
    createdContentIds.push(contentId);

    const invalid = await teacher
      .post(`/api/contents/${contentId}/media`)
      .attach('file', Buffer.from('contenido falso'), {
        filename: '../peligroso.png',
        contentType: 'image/png',
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_FILE_CONTENT');

    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
    const image = await teacher
      .post(`/api/contents/${contentId}/media`)
      .field('altText', 'Vocal ilustrada')
      .attach('file', png, { filename: 'vocal.png', contentType: 'image/png' });
    expect(image.status).toBe(201);
    expect(image.body.media).toMatchObject({ type: 'IMAGE', isPrimary: true, status: 'PUBLISHED' });
    expect(image.body.media.storageKey).toBeUndefined();

    const mp4 = Buffer.alloc(24);
    mp4.writeUInt32BE(20, 0);
    mp4.write('ftyp', 4, 'ascii');
    mp4.write('isom', 8, 'ascii');
    const video = await teacher
      .post(`/api/contents/${contentId}/media`)
      .attach('file', mp4, { filename: 'vocal.mp4', contentType: 'video/mp4' });
    expect(video.status).toBe(201);
    expect(video.body.media.type).toBe('VIDEO');

    const partial = await teacher
      .get(`/api/media/${video.body.media.id}/file`)
      .set('Range', 'bytes=0-7');
    expect(partial.status).toBe(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-7/${mp4.length}`);
    expect(Number(partial.headers['content-length'])).toBe(8);

    expect(
      (
        await teacher.patch(`/api/media/${video.body.media.id}`).send({
          altText: 'Video de la vocal',
          caption: 'Descripción accesible',
          isPrimary: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await teacher.put(`/api/contents/${contentId}/media/order`).send({
          items: [
            { id: video.body.media.id, sortOrder: 0 },
            { id: image.body.media.id, sortOrder: 1 },
          ],
        })
      ).status,
    ).toBe(204);
    expect(
      (await teacher.patch(`/api/media/${image.body.media.id}/status`).send({ status: 'INACTIVE' }))
        .status,
    ).toBe(200);
    expect(
      (await teacher.patch(`/api/contents/${contentId}/status`).send({ status: 'PUBLISHED' }))
        .status,
    ).toBe(200);
  });
});
