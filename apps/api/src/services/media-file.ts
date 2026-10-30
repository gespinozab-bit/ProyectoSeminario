import { open, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { HttpError } from '../middleware/error-handler.js';

const definitions = {
  '.jpg': { mime: ['image/jpeg'], type: 'IMAGE', max: 5 * 1024 * 1024 },
  '.jpeg': { mime: ['image/jpeg'], type: 'IMAGE', max: 5 * 1024 * 1024 },
  '.png': { mime: ['image/png'], type: 'IMAGE', max: 5 * 1024 * 1024 },
  '.webp': { mime: ['image/webp'], type: 'IMAGE', max: 5 * 1024 * 1024 },
  '.mp4': { mime: ['video/mp4'], type: 'VIDEO', max: 100 * 1024 * 1024 },
  '.webm': { mime: ['video/webm'], type: 'VIDEO', max: 100 * 1024 * 1024 },
} as const;

export type ValidatedMediaFile = {
  extension: keyof typeof definitions;
  mimeType: string;
  type: 'IMAGE' | 'VIDEO';
  size: number;
  storageKey: string;
};

const matchesSignature = (extension: keyof typeof definitions, bytes: Buffer) => {
  if (extension === '.jpg' || extension === '.jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === '.png')
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.webp')
    return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (extension === '.mp4') return bytes.toString('ascii', 4, 8) === 'ftyp';
  return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
};

export async function validateMediaFile(file: Express.Multer.File): Promise<ValidatedMediaFile> {
  const extension = path.extname(path.basename(file.originalname)).toLowerCase();
  const definition = definitions[extension as keyof typeof definitions];
  try {
    if (!definition)
      throw new HttpError(400, 'Extensión de archivo no permitida.', 'INVALID_FILE_EXTENSION');
    if (!(definition.mime as readonly string[]).includes(file.mimetype))
      throw new HttpError(400, 'El tipo MIME no coincide con la extensión.', 'INVALID_FILE_MIME');
    if (file.size > definition.max)
      throw new HttpError(
        400,
        definition.type === 'IMAGE'
          ? 'La imagen supera el límite de 5 MB.'
          : 'El video supera el límite de 100 MB.',
        'FILE_TOO_LARGE',
      );
    const handle = await open(file.path, 'r');
    const bytes = Buffer.alloc(16);
    await handle.read(bytes, 0, bytes.length, 0);
    await handle.close();
    if (!matchesSignature(extension as keyof typeof definitions, bytes))
      throw new HttpError(
        400,
        'El contenido real del archivo no es válido.',
        'INVALID_FILE_CONTENT',
      );
    return {
      extension: extension as keyof typeof definitions,
      mimeType: definition.mime[0],
      type: definition.type,
      size: file.size,
      storageKey: `${randomUUID()}${extension === '.jpeg' ? '.jpg' : extension}`,
    };
  } catch (error) {
    await rm(file.path, { force: true });
    throw error;
  }
}
