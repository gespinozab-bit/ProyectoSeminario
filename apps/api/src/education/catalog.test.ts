import { describe, expect, it } from 'vitest';
import { educationalCatalog } from './catalog.js';

describe('educational catalog review', () => {
  it('covers the four introductory modules with 53 lessons', () => {
    expect(educationalCatalog.map(({ code, lessons }) => [code, lessons.length])).toEqual([
      ['VOCALES', 5],
      ['NUMEROS', 11],
      ['ABECEDARIO', 27],
      ['COLORES', 10],
    ]);
  });
  it('includes all Spanish letters including Ñ with unique stable slugs', () => {
    const alphabet = educationalCatalog.find(({ code }) => code === 'ABECEDARIO')!;
    expect(alphabet.lessons.map(({ title }) => title.replace('Letra ', '')).join('')).toBe(
      'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ',
    );
    expect(alphabet.lessons.find(({ title }) => title === 'Letra Ñ')?.slug).toBe('letra-enie');
    for (const module of educationalCatalog)
      expect(new Set(module.lessons.map(({ slug }) => slug)).size).toBe(module.lessons.length);
  });
  it('provides bounded text, objectives, practice, and a required LENSEGUA production brief', () => {
    for (const module of educationalCatalog) {
      expect(module.description.length).toBeLessThanOrEqual(500);
      for (const lesson of module.lessons) {
        expect(lesson.title.length).toBeLessThanOrEqual(180);
        expect(lesson.summary.length).toBeLessThanOrEqual(500);
        expect(lesson.learningObjective.length).toBeGreaterThan(30);
        expect(lesson.learningObjective.length).toBeLessThanOrEqual(500);
        expect(lesson.content.length).toBeLessThanOrEqual(10_000);
        expect(lesson.content).toContain('OBSERVA Y PRACTICA');
        expect(lesson.content).toContain('COMPRUEBA LO APRENDIDO');
        expect(lesson.mediaBrief).toContain('LENSEGUA');
        expect(lesson.mediaBrief).toContain('antes de publicarla');
        expect(lesson.content).not.toContain('<');
      }
    }
  });
  it('uses exact quantities from zero through ten and labels for every color', () => {
    const numbers = educationalCatalog.find(({ code }) => code === 'NUMEROS')!;
    expect(numbers.lessons.map(({ slug }) => slug)).toEqual(
      Array.from({ length: 11 }, (_, number) => `numero-${number}`),
    );
    expect(numbers.lessons[0]!.content).toContain('caja vacía');
    expect(numbers.lessons[1]!.content).toContain('una sola ficha');
    expect(numbers.lessons[1]!.content).not.toContain('1 fichas');
    const colors = educationalCatalog.find(({ code }) => code === 'COLORES')!;
    for (const lesson of colors.lessons) {
      expect(lesson.content).toContain('etiquetas');
      expect(lesson.mediaBrief).toContain('no transmitir la respuesta solo mediante el color');
    }
  });
});
