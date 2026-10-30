import { env } from '../config/env.js';
import { LocalStorageProvider } from './local-storage-provider.js';

export const storage = new LocalStorageProvider(env.MEDIA_STORAGE_PATH);
export type { StorageProvider } from './storage-provider.js';
