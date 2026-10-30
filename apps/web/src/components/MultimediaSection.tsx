import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { MediaAsset } from '../types/content';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const accepted = '.jpg,.jpeg,.png,.webp,.mp4,.webm';

interface Props {
  contentId: string;
  onActiveCountChange: (count: number) => void;
}

function uploadFile(contentId: string, file: File, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_URL}/api/contents/${contentId}/media`);
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        const body = JSON.parse(request.responseText || '{}') as { error?: string };
        reject(new Error(body.error ?? 'No fue posible subir el archivo.'));
      }
    };
    request.onerror = () => reject(new Error('No fue posible conectar con el servidor.'));
    const data = new FormData();
    data.append('file', file);
    request.send(data);
  });
}

export function MultimediaSection({ contentId, onActiveCountChange }: Props) {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const replacementId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ media: MediaAsset[] }>(`/api/contents/${contentId}/media`);
      setItems(result.media);
      onActiveCountChange(result.media.filter(({ status }) => status === 'PUBLISHED').length);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cargar los recursos.');
    } finally {
      setLoading(false);
    }
  }, [contentId, onActiveCountChange]);

  useEffect(() => void load(), [load]);

  const validateClient = (file: File) => {
    const image = file.type.startsWith('image/');
    const limit = image ? 5 * 1024 * 1024 : 100 * 1024 * 1024;
    if (file.size > limit)
      return image ? 'La imagen supera el límite de 5 MB.' : 'El video supera el límite de 100 MB.';
    return '';
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    setNotice('');
    try {
      for (const file of Array.from(files)) {
        const validation = validateClient(file);
        if (validation) throw new Error(validation);
        setProgress(0);
        if (replacementId.current) {
          const data = new FormData();
          data.append('file', file);
          await new Promise<void>((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open('POST', `${API_URL}/api/media/${replacementId.current}/replace`);
            request.withCredentials = true;
            request.upload.onprogress = (event) =>
              event.lengthComputable && setProgress(Math.round((event.loaded / event.total) * 100));
            request.onload = () =>
              request.status >= 200 && request.status < 300
                ? resolve()
                : reject(
                    new Error(
                      (JSON.parse(request.responseText || '{}') as { error?: string }).error ??
                        'No fue posible reemplazar el archivo.',
                    ),
                  );
            request.onerror = () => reject(new Error('No fue posible conectar con el servidor.'));
            request.send(data);
          });
          replacementId.current = null;
        } else await uploadFile(contentId, file, setProgress);
      }
      setNotice('Archivo multimedia guardado correctamente.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible subir el archivo.');
    } finally {
      setProgress(null);
    }
  };

  const update = async (item: MediaAsset, changes: Partial<MediaAsset>) => {
    setError('');
    try {
      await apiFetch(`/api/media/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      setNotice('Recurso actualizado correctamente.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible actualizar el recurso.');
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (!items[target]) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    await apiFetch(`/api/contents/${contentId}/media/order`, {
      method: 'PUT',
      body: JSON.stringify({
        items: reordered.map((item, sortOrder) => ({ id: item.id, sortOrder })),
      }),
    });
    await load();
  };

  return (
    <section className="card multimedia-section">
      <div>
        <span className="eyebrow">Multimedia</span>
        <h2>Imágenes y videos</h2>
        <p>Imágenes JPG, PNG o WEBP (máx. 5 MB). Videos MP4 o WEBM (máx. 100 MB).</p>
      </div>
      {error && <div className="error">{error}</div>}
      {notice && (
        <div className="notice" data-cy="media-success">
          {notice}
        </div>
      )}
      <label className="upload-zone">
        <strong>Seleccionar archivos</strong>
        <span>Puedes cargar varios recursos.</span>
        <input
          type="file"
          data-cy="media-upload"
          accept={accepted}
          multiple
          onChange={(event) => void upload(event.target.files)}
        />
      </label>
      {progress !== null && (
        <div className="upload-progress" aria-label={`Carga ${progress}%`}>
          <div style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}
      {loading ? (
        <div className="loading">Cargando multimedia…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Aún no hay imágenes o videos asociados.</div>
      ) : (
        <div className="media-grid">
          {items.map((item, index) => (
            <article
              data-cy="media-resource"
              className={`media-card ${item.status === 'INACTIVE' ? 'media-card--inactive' : ''}`}
              key={item.id}
            >
              <div className="media-preview">
                {item.type === 'IMAGE' ? (
                  <img src={`${API_URL}${item.url}`} alt={item.altText ?? item.title ?? ''} />
                ) : (
                  <video src={`${API_URL}${item.url}`} controls preload="metadata" />
                )}
              </div>
              <div className="media-card__body">
                <div className="badges">
                  <span>{item.type === 'IMAGE' ? 'Imagen' : 'Video'}</span>
                  {item.isPrimary && <span>Principal</span>}
                  {item.status === 'INACTIVE' && <span>Inactivo</span>}
                </div>
                <label>
                  Texto alternativo
                  <input
                    defaultValue={item.altText ?? ''}
                    maxLength={300}
                    onBlur={(event) =>
                      event.target.value !== (item.altText ?? '') &&
                      void update(item, { altText: event.target.value })
                    }
                  />
                </label>
                <label>
                  Descripción
                  <textarea
                    rows={2}
                    defaultValue={item.caption ?? ''}
                    maxLength={500}
                    onBlur={(event) =>
                      event.target.value !== (item.caption ?? '') &&
                      void update(item, { caption: event.target.value })
                    }
                  />
                </label>
                <div className="actions media-actions">
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                    aria-label="Mover arriba"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === items.length - 1}
                    onClick={() => void move(index, 1)}
                    aria-label="Mover abajo"
                  >
                    ↓
                  </button>
                  {!item.isPrimary && item.status === 'PUBLISHED' && (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void update(item, { isPrimary: true })}
                    >
                      Marcar principal
                    </button>
                  )}
                  <label className="button-link button-link--secondary replace-button">
                    Reemplazar
                    <input
                      type="file"
                      accept={accepted}
                      onChange={(event) => {
                        replacementId.current = item.id;
                        void upload(event.target.files);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() =>
                      void apiFetch(`/api/media/${item.id}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          status: item.status === 'INACTIVE' ? 'PUBLISHED' : 'INACTIVE',
                        }),
                      })
                        .then(load)
                        .catch((reason: unknown) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : 'No fue posible cambiar el estado.',
                          ),
                        )
                    }
                  >
                    {item.status === 'INACTIVE' ? 'Activar' : 'Desactivar'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
