# Portal educativo

El portal público está integrado en la aplicación existente. No necesita cuentas de
estudiantes ni cambios de esquema o migraciones.

## Navegación

- `/`: presentación y módulos publicados, con el número de lecciones disponibles.
- `/aprender/:moduleId`: lecciones publicadas del módulo en su orden editorial.
- `/aprender/:moduleId/:contentId`: texto, objetivo si existe, imágenes y videos,
  navegación anterior/siguiente y listado de lecciones del módulo.
- `/admin/login`: acceso de docentes y administradores. También hay un enlace al portal
  desde la barra lateral administrativa.

La interfaz incluye estados de carga, errores con reintento, módulos sin lecciones,
página no encontrada, controles de video, navegación por teclado y diseño adaptable.
El texto educativo se muestra como texto, sin interpretar HTML.
La portada usa elementos tipográficos decorativos; las demostraciones de señas provienen
exclusivamente de los archivos publicados por los docentes.

## API pública

```text
GET /api/public/modules
GET /api/public/modules/:id
GET /api/public/modules/:moduleId/lessons/:id
GET /api/public/media/:id/file
```

Cada consulta filtra los estados de publicación. El archivo solo se entrega cuando el
recurso, la lección y el módulo están publicados. Una lección de otro módulo devuelve 404.
Se seleccionan campos explícitos para no entregar hashes, autores, bitácoras, claves de
almacenamiento ni otros datos internos. Las rutas administrativas conservan sus permisos.
Los videos admiten rangos de bytes completos, abiertos y de sufijo; los rangos inválidos
devuelven 416. Las respuestas públicas usan `Cache-Control: no-store` para consultar de
nuevo la publicación después de cambios editoriales.

## Probar localmente

1. Abrir Docker Desktop e iniciar PostgreSQL con el comando del README.
2. Comprobar migraciones y recuperar el administrador si es necesario.
3. Ejecutar `npm.cmd run dev` y abrir http://localhost:5173/.
4. Desde administración, activar un módulo y crear una lección con texto y una imagen o
   video. Publicar la lección. Debe aparecer en el portal sin iniciar sesión.
5. Abrir una ventana privada y recorrer módulo y lección. Comprobar imagen, reproducción,
   pausa, búsqueda dentro del video, anterior/siguiente y regreso al módulo.
6. Cambiar la lección a borrador o desactivar el módulo. Recargar sus enlaces públicos y
   la URL del archivo: ya no deben permitir acceso.
7. Comprobar un módulo vacío, una URL inexistente, conexión interrumpida y pantallas
   pequeñas, además de recorrer los controles con Tab y Enter.

Las pruebas del router se ejecutan sin base de datos usando sustitutos de Prisma y
almacenamiento. Cubren contratos públicos, filtros de publicación, identificadores,
recursos no disponibles y streaming por rangos:

```powershell
npm.cmd exec -w @lensegua/api -- vitest run src/routes/public.test.ts --configLoader runner
```

## Resultado de la verificación inicial

- 17 pruebas del router aprobadas con Prisma y almacenamiento sustituidos.
- Compilación, tipos, ESLint y formato aprobados.
- Vista previa de producción: HTTP 200 en inicio y en una ruta interna del portal.
- PostgreSQL no estaba disponible: queda pendiente el recorrido con datos reales.
- Chrome no pudo arrancar su proceso gráfico en esta sesión restringida: queda pendiente
  la comprobación visual de escritorio y móvil. No se verificó reproducción en navegador.
