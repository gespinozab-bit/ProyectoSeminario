import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import type { EducationalContent, EducationalModule, PublicationStatus } from '../types/content';
import { MultimediaSection } from '../components/MultimediaSection';

interface FormState {
  moduleId: string;
  title: string;
  summary: string;
  content: string;
  learningObjective: string;
  sortOrder: number;
  status: PublicationStatus;
}
const initial: FormState = {
  moduleId: '',
  title: '',
  summary: '',
  content: '',
  learningObjective: '',
  sortOrder: 0,
  status: 'DRAFT',
};

export function ContentFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [form, setForm] = useState<FormState>(initial);
  const [modules, setModules] = useState<EducationalModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mediaCount, setMediaCount] = useState(0);
  useEffect(() => {
    void (async () => {
      try {
        const moduleResult = await apiFetch<{ modules: EducationalModule[] }>('/api/modules');
        setModules(moduleResult.modules);
        if (id) {
          const result = await apiFetch<{ content: EducationalContent }>(`/api/contents/${id}`);
          setForm({
            moduleId: result.content.moduleId,
            title: result.content.title,
            summary: result.content.summary ?? '',
            content: result.content.content,
            learningObjective: result.content.learningObjective ?? '',
            sortOrder: result.content.sortOrder,
            status: result.content.status,
          });
          setMediaCount(result.content._count?.media ?? 0);
        } else if (moduleResult.modules[0])
          setForm((value) => ({ ...value, moduleId: moduleResult.modules[0]!.id }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No fue posible cargar el formulario.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);
  const save = async (desiredStatus: PublicationStatus) => {
    if (desiredStatus === 'PUBLISHED' && !form.content.trim()) {
      setError('Agrega contenido antes de publicar. Puedes guardarlo como borrador.');
      return;
    }
    if (desiredStatus === 'PUBLISHED' && mediaCount === 0) {
      setError(
        'No se puede publicar sin una imagen o video. Guarda el contenido como borrador hasta asociar un recurso multimedia.',
      );
      return;
    }
    if (
      desiredStatus === 'PUBLISHED' &&
      !window.confirm('¿Confirmas que deseas publicar este contenido?')
    )
      return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        moduleId: form.moduleId,
        title: form.title,
        summary: form.summary || null,
        content: form.content,
        learningObjective: form.learningObjective || null,
        sortOrder: Number(form.sortOrder),
      };
      const result = editing
        ? await apiFetch<{ content: EducationalContent }>(`/api/contents/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ content: EducationalContent }>('/api/contents', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      if (desiredStatus !== result.content.status)
        await apiFetch(`/api/contents/${result.content.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: desiredStatus }),
        });
      navigate('/admin/contenidos', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible guardar el contenido.');
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return (
      <main className="page">
        <div className="loading">Cargando formulario…</div>
      </main>
    );
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Contenidos</span>
          <h1>{editing ? 'Editar contenido' : 'Nuevo contenido'}</h1>
          <p>Los borradores pueden completarse y publicarse más adelante.</p>
        </div>
      </header>
      {error && (
        <div className="error" role="alert" data-cy="content-error">
          {error}
        </div>
      )}
      <form
        data-cy="content-form"
        className="card content-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save('DRAFT');
        }}
      >
        <div className="form-grid">
          <label>
            Módulo
            <select
              data-cy="content-module"
              value={form.moduleId}
              onChange={(event) => setForm({ ...form, moduleId: event.target.value })}
              required
            >
              {modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.title}
                  {module.status === 'INACTIVE' ? ' (inactivo)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Orden
            <input
              type="number"
              data-cy="content-order"
              min="0"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
              required
            />
          </label>
        </div>
        <label>
          Título
          <input
            data-cy="content-title"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            maxLength={180}
            required
          />
        </label>
        <label>
          Descripción breve <span className="optional">Opcional</span>
          <textarea
            rows={3}
            value={form.summary}
            onChange={(event) => setForm({ ...form, summary: event.target.value })}
            maxLength={500}
          />
        </label>
        <label>
          Contenido educativo <span className="optional">Necesario para publicar</span>
          <textarea
            rows={8}
            data-cy="content-body"
            value={form.content}
            onChange={(event) => setForm({ ...form, content: event.target.value })}
            maxLength={10000}
            placeholder="Escribe aquí el contenido textual. Los recursos multimedia se agregarán en el siguiente bloque."
          />
        </label>
        <label>
          Objetivo de aprendizaje <span className="optional">Opcional</span>
          <textarea
            rows={3}
            value={form.learningObjective}
            onChange={(event) => setForm({ ...form, learningObjective: event.target.value })}
            maxLength={500}
            placeholder="¿Qué podrá reconocer o practicar el estudiante al terminar?"
          />
        </label>
        <p className="form-help">Para publicar se requiere al menos una imagen o video activo.</p>
        {editing && (
          <p>
            Estado actual:{' '}
            <strong>
              {form.status === 'DRAFT'
                ? 'Borrador'
                : form.status === 'PUBLISHED'
                  ? 'Publicado'
                  : 'Inactivo'}
            </strong>
          </p>
        )}
        <div className="form-actions">
          <Link className="button-link button-link--secondary" to="/admin/contenidos">
            Cancelar
          </Link>
          <button className="button-secondary" type="submit" disabled={saving} data-cy="save-draft">
            Guardar borrador
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save('PUBLISHED')}
            data-cy="save-publish"
          >
            {saving ? 'Guardando…' : 'Guardar y publicar'}
          </button>
        </div>
      </form>
      {id && <MultimediaSection contentId={id} onActiveCountChange={setMediaCount} />}
    </main>
  );
}
