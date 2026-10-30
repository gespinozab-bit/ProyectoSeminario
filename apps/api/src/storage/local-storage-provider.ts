import { createReadStream, type ReadStream } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { StorageProvider, StoredFileInfo } from './storage-provider.js';

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(rootPath: string) {
    this.root = path.resolve(rootPath);
  }

  private resolve(storageKey: string) {
    if (!/^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(storageKey)) throw new Error('Invalid storage key');
    const target = path.resolve(this.root, storageKey);
    if (path.dirname(target) !== this.root) throw new Error('Invalid storage path');
    return target;
  }

  async saveFromTemporaryFile(temporaryPath: string, storageKey: string) {
    await mkdir(this.root, { recursive: true });
    const target = this.resolve(storageKey);
    try {
      await rename(temporaryPath, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyFile(temporaryPath, target);
      await rm(temporaryPath, { force: true });
    }
  }

  async delete(storageKey: string) {
    await rm(this.resolve(storageKey), { force: true });
  }

  async stat(storageKey: string): Promise<StoredFileInfo> {
    const info = await stat(this.resolve(storageKey));
    return { size: info.size };
  }

  createReadStream(storageKey: string, range?: { start: number; end: number }): ReadStream {
    return createReadStream(this.resolve(storageKey), range);
  }
}
