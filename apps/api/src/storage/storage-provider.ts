import type { ReadStream } from 'node:fs';

export interface StoredFileInfo {
  size: number;
}

export interface StorageProvider {
  saveFromTemporaryFile(temporaryPath: string, storageKey: string): Promise<void>;
  delete(storageKey: string): Promise<void>;
  stat(storageKey: string): Promise<StoredFileInfo>;
  createReadStream(storageKey: string, range?: { start: number; end: number }): ReadStream;
}
