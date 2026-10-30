import { describe, expect, it } from 'vitest';
import { assertSourceUrl, sourceName } from './public-sources.js';

describe('public LENSEGUA source mapping', () => {
  it('maps only exact lesson names, including Ñ and café', () => {
    expect(sourceName('VOCALES', 'vocal-a')).toBe('a');
    expect(sourceName('ABECEDARIO', 'letra-enie')).toBe('ñ');
    expect(sourceName('NUMEROS', 'numero-0')).toBe('0');
    expect(sourceName('COLORES', 'color-cafe')).toBe('café');
  });
  it('only accepts HTTPS assets in the public source bucket', () => {
    expect(
      assertSourceUrl(
        'https://firebasestorage.googleapis.com/v0/b/lensegua-20316.appspot.com/o/letter.jpg?alt=media',
      ).protocol,
    ).toBe('https:');
    for (const url of [
      'http://firebasestorage.googleapis.com/v0/b/lensegua-20316.appspot.com/o/a.jpg',
      'https://example.org/a.jpg',
      'https://firebasestorage.googleapis.com/v0/b/another-bucket/o/a.jpg',
      'https://user:pass@firebasestorage.googleapis.com/v0/b/lensegua-20316.appspot.com/o/a.jpg',
    ])
      expect(() => assertSourceUrl(url)).toThrow();
  });
});
