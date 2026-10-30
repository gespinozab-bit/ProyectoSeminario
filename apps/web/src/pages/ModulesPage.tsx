import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import type { EducationalModule } from '../types/content';

export function ModulesPage() {
  const { user } = useAuth();
  const [modules, setModules] = useState<EducationalModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canOrder = user?.permissions?.includes('modules.order');
  const canStatus = user?.permissions?.includes('modules.status');
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setModules((await apiFetch<{ modules: EducationalModule[] }>('/api/modules')).modules);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cargar los módulos.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= modules.length) return;
    const next = [...modules];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const ordered = next.map((module, position) => ({ ...module, sortOrder: position + 1 }));
    setModules(ordered);
    setMessage('');
    try {
      await apiFetch('/api/modules/order', {
        method: 'PUT',
        body: JSON.stringify({ items: ordered.map(({ id, sortOrder }) => ({ id, sortOrder })) }),
      });
      setMessage('Orden actualizado.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cambiar el orden.');
      void load();
    }
  };
  const toggleStatus = async (module: EducationalModule) => {
    const status = module.status === 'PUBLISHED' ? 'INACTIVE' : 'PUBLISHED';
    if (
      !window.confirm(
        `¿Deseas ${status === 'PUBLISHED' ? 'activar' : 'desactivar'} el módulo ${module.title}?`,
      )
    )
      return;
    try {
      const result = await apiFetch<{ module: EducationalModule }>(
        `/api/modules/${module.id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
      );
      setModules((items) =>
        items.map((item) => (item.id === module.id ? { ...item, ...result.module } : item)),
      );
      setMessage('Estado actualizado.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cambiar el estado.');
    }
  };
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Material educativo</span>
          <h1>Módulos</h1>
          <p>Organiza y controla la disponibilidad de las categorías principales.</p>
        </div>
      </header>
      {message && <div className="notice">{message}</div>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="loading">Cargando módulos…</div>
      ) : modules.length === 0 ? (
        <div className="empty">No hay módulos configurados.</div>
      ) : (
        <div className="module-grid">
          {modules.map((module, index) => (
            <article className="card module-card" key={module.id}>
              <div className="module-card__top">
                <span className="order-number">{module.sortOrder}</span>
                <span className={`status status--${module.status.toLowerCase()}`}>
                  {module.status === 'PUBLISHED' ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <h2>{module.title}</h2>
              <p>{module.description ?? 'Módulo educativo de LENSEGUA.'}</p>
              <small>{module._count?.contents ?? 0} contenidos</small>
              <div className="actions">
                {canOrder && (
                  <>
                    <button
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                      aria-label="Subir"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-button"
                      disabled={index === modules.length - 1}
                      onClick={() => void move(index, 1)}
                      aria-label="Bajar"
                    >
                      ↓
                    </button>
                  </>
                )}
                {canStatus && (
                  <button className="button-secondary" onClick={() => void toggleStatus(module)}>
                    {module.status === 'PUBLISHED' ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
