export const publicSourcePage = 'https://lensegua.com/material-lensegua-kitsord';
export interface SourceSign {
  name: string;
  type: 'jpg' | 'webm';
  url: string;
}

export async function fetchWithRetry(url: string | URL, init: RequestInit = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (response.status >= 500 && attempt < 2) continue;
      return response;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('No se pudo conectar con la fuente.');
}

export function assertSourceUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'firebasestorage.googleapis.com' ||
    !url.pathname.startsWith('/v0/b/lensegua-20316.appspot.com/o/') ||
    url.username ||
    url.password
  )
    throw new Error('La URL no pertenece al almacenamiento público de esta fuente.');
  return url;
}

export function sourceName(moduleCode: string, slug: string) {
  if (moduleCode === 'VOCALES') return slug.replace('vocal-', '');
  if (moduleCode === 'ABECEDARIO') return slug.replace('letra-', '').replace('enie', 'ñ');
  if (moduleCode === 'NUMEROS') return slug.replace('numero-', '');
  if (moduleCode === 'COLORES') return slug.replace('color-', '').replace(/^cafe$/, 'café');
  throw new Error('Módulo fuera del catálogo permitido.');
}

export async function fetchSourceSigns(
  category: string,
  exactName?: string,
): Promise<SourceSign[]> {
  if (!['abecedario', 'numeros', 'colores'].includes(category))
    throw new Error('Categoría no permitida.');
  // Same public collection and filters used by the source's search form. No authentication.
  const response = await fetchWithRetry(
    'https://firestore.googleapis.com/v1/projects/lensegua-20316/databases/(default)/documents:runQuery',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'contenido' }],
          where: {
            fieldFilter: {
              field: { fieldPath: exactName ? 'nombre' : 'leccion' },
              op: 'EQUAL',
              value: { stringValue: exactName ?? category },
            },
          },
        },
      }),
    },
  );
  if (!response.ok) throw new Error('No se pudo consultar el catálogo público de la fuente.');
  const rows = (await response.json()) as {
    document?: { fields: Record<string, { stringValue?: string }> };
  }[];
  return rows.flatMap(({ document }) => {
    if (!document) return [];
    const name = document.fields.nombre?.stringValue;
    const type = document.fields.tipo?.stringValue;
    const url = document.fields.ubicacion?.stringValue;
    if (!name || !url || (type !== 'jpg' && type !== 'webm')) return [];
    assertSourceUrl(url);
    return [{ name: name.trim().toLowerCase(), type, url }];
  });
}
