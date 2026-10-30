import type { PublicLessonDetail, PublicModule, PublicModuleDetail } from '@lensegua/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';

import './learning-portal.css';

const apiOrigin = import.meta.env.VITE_API_URL ?? '';

function usePublicData<T>(path: string) {
  const [state, setState] = useState<{ path: string; data?: T; error?: string }>({ path });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ path });
    void fetch(`${apiOrigin}/api/public${path}`, { signal: controller.signal, credentials: 'omit' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? 'Este material ya no está disponible. Puedes elegir otro módulo.'
              : 'No pudimos cargar el material. Intenta nuevamente en un momento.',
          );
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            path,
            error:
              error instanceof Error && !(error instanceof TypeError)
                ? error.message
                : 'Revisa tu conexión e intenta nuevamente.',
          });
      });
    return () => controller.abort();
  }, [path, attempt]);
  return {
    ...(state.path === path ? state : { path }),
    retry: () => setAttempt((value) => value + 1),
  };
}

function LoadState({ error, retry }: { error: string | undefined; retry: () => void }) {
  return (
    <div className="learn-state" role={error ? 'alert' : 'status'} data-cy="portal-load-state">
      <span className="learn-state__symbol" aria-hidden="true">
        {error ? '↻' : '…'}
      </span>
      <h2>{error ? 'Vamos a intentarlo otra vez' : 'Preparando tu espacio para aprender'}</h2>
      <p>{error ?? 'Estamos buscando el material disponible.'}</p>
      {error && <button onClick={retry}>Volver a intentar</button>}
    </div>
  );
}

const moduleArt = (code: string) => {
  const key = code.toLowerCase();
  if (key.includes('vocal'))
    return { symbol: 'Aa', tone: 'peach', hint: 'Una letra, muchas posibilidades' };
  if (key.includes('numer'))
    return { symbol: '123', tone: 'lavender', hint: 'Descubre cómo contar' };
  if (key.includes('color')) return { symbol: '●', tone: 'mint', hint: 'Un mundo lleno de color' };
  return { symbol: 'ABC', tone: 'sky', hint: 'Explora cada letra' };
};

export function LearningLayout() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    document.title = 'Aprende a tu ritmo | LENSEGUA';
    if (previousPath.current !== pathname) {
      window.scrollTo(0, 0);
      main.current?.focus();
      previousPath.current = pathname;
    }
  }, [pathname]);
  return (
    <div className="learn-shell">
      <a className="learn-skip" href="#learning-main">
        Saltar al contenido
      </a>
      <header className="learn-header">
        <Link className="learn-brand" to="/" aria-label="LENSEGUA, inicio">
          <span aria-hidden="true">
            L<span>↗</span>
          </span>
          LENSEGUA
        </Link>
        <nav aria-label="Navegación principal">
          <Link to="/">Explorar módulos</Link>
          <Link to="/admin/login">Acceso docente</Link>
        </nav>
      </header>
      <main id="learning-main" ref={main} tabIndex={-1} className="learn-main">
        <Outlet />
      </main>
      <footer className="learn-footer">
        <Link className="learn-brand" to="/">
          LENSEGUA
        </Link>
        <p>Aprendemos, nos expresamos y conectamos.</p>
        <span>Un espacio para aprender a tu ritmo.</span>
      </footer>
    </div>
  );
}

export function LearningHome() {
  const { data, error, retry } = usePublicData<{ modules: PublicModule[] }>('/modules');
  return (
    <>
      <section className="learn-hero">
        <div>
          <span className="learn-eyebrow">BIENVENIDO A TU ESPACIO DE APRENDIZAJE</span>
          <h1>
            Un nuevo lenguaje.
            <br />
            <em>Un mundo por descubrir.</em>
          </h1>
          <p>
            Explora la lengua de señas de Guatemala con imágenes y videos. Mira, repite y aprende a
            tu propio ritmo.
          </p>
          <a className="learn-cta" href="#modulos">
            ¡Vamos a aprender! <span aria-hidden="true">↗</span>
          </a>
          <span className="learn-hero__note">Sin cuentas. Sin prisas. Con muchas ganas.</span>
        </div>
        <div className="learn-art" aria-hidden="true">
          <span className="learn-art__tag">Cada aprendizaje nos acerca</span>
          <div className="learn-art__tiles">
            <span>
              Aa<small>VOCALES</small>
            </span>
            <span>
              123<small>NÚMEROS</small>
            </span>
            <span>
              ABC<small>ABECEDARIO</small>
            </span>
            <span>
              <i className="learn-dots">● ● ●</i>
              <small>COLORES</small>
            </span>
          </div>
          <span className="learn-art__star">✳</span>
          <span className="learn-art__bottom">Mira. Practica. Descubre.</span>
        </div>
      </section>
      <section id="modulos" className="learn-modules" aria-labelledby="modules-title">
        <div className="learn-section-heading">
          <div>
            <span className="learn-eyebrow">ELIGE POR DÓNDE EMPEZAR</span>
            <h2 id="modules-title">¿Qué aprenderemos hoy?</h2>
          </div>
          <p>Cada pequeño paso cuenta.</p>
        </div>
        {!data ? (
          <LoadState error={error} retry={retry} />
        ) : data.modules.length === 0 ? (
          <div className="learn-state">
            <h3>Pronto habrá nuevas aventuras</h3>
            <p>Estamos preparando los módulos. Vuelve a visitarnos para descubrirlos.</p>
          </div>
        ) : (
          <div className="learn-module-grid">
            {data.modules.map((module, index) => {
              const art = moduleArt(module.code);
              return (
                <Link
                  data-cy="student-module"
                  className={`learn-module learn-tone--${art.tone}`}
                  key={module.id}
                  to={`/aprender/${module.id}`}
                >
                  <div className="learn-module__art" aria-hidden="true">
                    {module.image ? (
                      <img loading="lazy" src={`${apiOrigin}${module.image.url}`} alt="" />
                    ) : (
                      <span>{art.symbol}</span>
                    )}
                    <small>0{index + 1}</small>
                  </div>
                  <div className="learn-module__body">
                    <span className="learn-eyebrow">
                      {module.lessonCount} {module.lessonCount === 1 ? 'LECCIÓN' : 'LECCIONES'}
                    </span>
                    <h3>
                      {module.title}
                      <span aria-hidden="true">↗</span>
                    </h3>
                    <p>{module.description || art.hint}</p>
                    <span className="learn-module__action">
                      Explorar módulo <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <section className="learn-guide" aria-labelledby="guide-title">
        <div>
          <span className="learn-eyebrow">A TU PROPIO RITMO</span>
          <h2 id="guide-title">
            Aprender empieza
            <br />
            con la curiosidad.
          </h2>
        </div>
        <ol>
          <li>
            <span>01</span>
            <div>
              <h3>Elige un módulo</h3>
              <p>Empieza por lo que más te guste.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Observa con atención</h3>
              <p>Explora las imágenes y mira los videos.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Repite y practica</h3>
              <p>Puedes volver a cada lección las veces que quieras.</p>
            </div>
          </li>
        </ol>
      </section>
    </>
  );
}

export function LearningModule() {
  const { moduleId } = useParams();
  const { data, error, retry } = usePublicData<PublicModuleDetail>(`/modules/${moduleId}`);
  if (!data) return <LoadState error={error} retry={retry} />;
  const art = moduleArt(data.module.code);
  return (
    <>
      <nav className="learn-breadcrumb" aria-label="Ruta de navegación">
        <Link to="/">Todos los módulos</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{data.module.title}</span>
      </nav>
      <section className={`learn-module-intro learn-tone--${art.tone}`}>
        <div>
          <span className="learn-eyebrow">EXPLORA Y PRACTICA</span>
          <h1>{data.module.title}</h1>
          <p>{data.module.description || art.hint}</p>
          <span>
            {data.lessons.length}{' '}
            {data.lessons.length === 1 ? 'lección para descubrir' : 'lecciones para descubrir'}
          </span>
        </div>
        <span className="learn-module-intro__symbol" aria-hidden="true">
          {art.symbol}
        </span>
      </section>
      <section className="learn-lessons" aria-labelledby="lessons-title" data-cy="student-lessons">
        <h2 id="lessons-title">Tu recorrido de aprendizaje</h2>
        <p>Elige una lección. Puedes seguir el orden o empezar por tu favorita.</p>
        {data.lessons.length === 0 ? (
          <div className="learn-state">
            <h3>Las lecciones están en camino</h3>
            <p>Mientras preparamos este módulo, puedes explorar los demás.</p>
            <Link className="learn-cta" to="/">
              Ver otros módulos →
            </Link>
          </div>
        ) : (
          <ol className="learn-lesson-list">
            {data.lessons.map((lesson, index) => (
              <li key={lesson.id}>
                <Link to={`/aprender/${data.module.id}/${lesson.id}`}>
                  {lesson.image ? (
                    <img
                      className="learn-lesson-thumbnail"
                      loading="lazy"
                      src={`${apiOrigin}${lesson.image.url}`}
                      alt={lesson.image.altText || `Referencia de ${lesson.title}`}
                    />
                  ) : (
                    <span className="learn-lesson-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  )}
                  <div>
                    <h3>{lesson.title}</h3>
                    {lesson.summary && <p>{lesson.summary}</p>}
                  </div>
                  <span className="learn-lesson-open">
                    Ver lección <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function LessonMedia({ item }: { item: PublicLessonDetail['lesson']['media'][number] }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="learn-media">
      {failed ? (
        <div className="learn-state" role="alert">
          <p>No se pudo cargar este recurso.</p>
          <button onClick={() => setFailed(false)}>Volver a cargar</button>
        </div>
      ) : item.type === 'VIDEO' ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={`${apiOrigin}${item.url}`}
          aria-label={item.title || 'Video de la lección'}
          onError={() => setFailed(true)}
        />
      ) : (
        <img
          loading="lazy"
          src={`${apiOrigin}${item.url}`}
          alt={item.altText || item.title || 'Imagen de la lección'}
          onError={() => setFailed(true)}
        />
      )}
      {(item.title || item.caption) && (
        <figcaption>
          {item.title && <strong>{item.title}</strong>}
          {item.caption && <p>{item.caption}</p>}
        </figcaption>
      )}
    </figure>
  );
}

export function LearningLesson() {
  const { moduleId, contentId } = useParams();
  const { data, error, retry } = usePublicData<PublicLessonDetail>(
    `/modules/${moduleId}/lessons/${contentId}`,
  );
  if (!data) return <LoadState error={error} retry={retry} />;
  const index = data.lessons.findIndex((lesson) => lesson.id === data.lesson.id);
  const previous = data.lessons[index - 1];
  const next = data.lessons[index + 1];
  return (
    <>
      <nav className="learn-breadcrumb" aria-label="Ruta de navegación">
        <Link to="/">Módulos</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/aprender/${data.module.id}`}>{data.module.title}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{data.lesson.title}</span>
      </nav>
      <div className="learn-lesson-layout">
        <article>
          <header className="learn-lesson-heading">
            <span className="learn-eyebrow">
              {data.module.title} · LECCIÓN {index + 1} DE {data.lessons.length}
            </span>
            <h1 data-cy="student-lesson-title">{data.lesson.title}</h1>
            {data.lesson.summary && <p>{data.lesson.summary}</p>}
          </header>
          {data.lesson.learningObjective && (
            <div className="learn-objective">
              <strong>En esta lección aprenderás</strong>
              <p>{data.lesson.learningObjective}</p>
            </div>
          )}
          <div className="learn-media-list">
            {data.lesson.media.map((item) => (
              <LessonMedia key={item.id} item={item} />
            ))}
          </div>
          {data.lesson.content && (
            <section className="learn-lesson-text" data-cy="student-lesson-body">
              <h2>Observa y practica</h2>
              <p>{data.lesson.content}</p>
            </section>
          )}
          <div className="learn-practice">
            <span aria-hidden="true">✳</span>
            <div>
              <h3>Tómate tu tiempo</h3>
              <p>Pausa el video, observa los movimientos y vuelve a intentarlo cuando quieras.</p>
            </div>
          </div>
          <nav className="learn-lesson-pagination" aria-label="Cambiar lección">
            {previous ? (
              <Link to={`/aprender/${data.module.id}/${previous.id}`}>
                <small>← ANTERIOR</small>
                {previous.title}
              </Link>
            ) : (
              <Link to={`/aprender/${data.module.id}`}>
                <small>← VOLVER</small>Ver todas las lecciones
              </Link>
            )}
            {next ? (
              <Link to={`/aprender/${data.module.id}/${next.id}`}>
                <small>SIGUIENTE →</small>
                {next.title}
              </Link>
            ) : (
              <Link to="/">
                <small>¡SIGUE EXPLORANDO! →</small>Elegir otro módulo
              </Link>
            )}
          </nav>
        </article>
        <aside className="learn-lesson-sidebar">
          <h2>En este módulo</h2>
          <nav aria-label="Lecciones del módulo">
            {data.lessons.map((lesson, lessonIndex) => (
              <Link
                key={lesson.id}
                aria-current={lesson.id === data.lesson.id ? 'page' : undefined}
                to={`/aprender/${data.module.id}/${lesson.id}`}
              >
                <span>{String(lessonIndex + 1).padStart(2, '0')}</span>
                {lesson.title}
              </Link>
            ))}
          </nav>
          <Link className="learn-back" to={`/aprender/${data.module.id}`}>
            ← Volver al módulo
          </Link>
        </aside>
      </div>
    </>
  );
}

export function LearningNotFound() {
  return (
    <div className="learn-state">
      <span className="learn-eyebrow">404</span>
      <h1>Este camino no existe</h1>
      <p>Volvamos a los módulos para seguir aprendiendo.</p>
      <Link className="learn-cta" to="/">
        Explorar módulos →
      </Link>
    </div>
  );
}
