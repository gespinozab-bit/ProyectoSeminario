# LENSEGUA

La preparación y el reinicio aislado de datos E2E se describen en
[Datos de prueba para Cypress](docs/cypress-datos-prueba.md). Esta modalidad inicia
servicios temporales propios y requiere las variables indicadas en esa guía.

Base de LENSEGUA: monorepo TypeScript con React/Vite, Express, Prisma ORM y PostgreSQL.

## Uso local en Windows

Abre **Iniciar LENSEGUA.cmd**. El iniciador prepara Docker y abre http://localhost:8080/.
Incluye accesos para detener, respaldar y recuperar el administrador. Consulta
[Windows local](docs/windows-local.md). Esta es la modalidad de uso seleccionada para el proyecto.

## Requisitos (Windows)

- Node.js 20.19 o superior (recomendado Node.js 22 LTS)
- npm 10 o superior
- Docker Desktop con Docker Compose

En PowerShell, use `npm.cmd` si la política de ejecución impide ejecutar `npm.ps1`.

## Instalación

```powershell
npm.cmd install
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item infra/.env.example infra/.env
```

Reemplace `CHANGE_ME` en los archivos `.env` locales con una contraseña de desarrollo y
genere secretos JWT distintos de al menos 32 caracteres.
Los archivos `.env` están ignorados por Git y no deben confirmarse en el repositorio.

## Desarrollo

Inicie PostgreSQL:

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

Inicie frontend y backend juntos:

```powershell
npm.cmd run dev
```

- Web: http://localhost:5173
- API: http://localhost:3000
- Salud: http://localhost:3000/api/health
- Acceso administrativo: http://localhost:5173/admin/login
- PostgreSQL: `localhost:5434`

También puede ejecutar cada aplicación con `npm.cmd run dev:web` y
`npm.cmd run dev:api`.

## Prueba básica E2E con Cypress

### Suite completa y GitHub Actions

La suite actual necesita el entorno aislado de datos. Para ejecutarla localmente,
desde la raíz y sin iniciar servicios manualmente:

```powershell
$env:NODE_ENV = 'test'
$env:LENSEGUA_E2E = '1'
$env:CYPRESS_BASE_URL = 'http://127.0.0.1:5174'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm.cmd run build
npm.cmd run e2e:verify -w @lensegua/api
npm.cmd run test:isolated -w @lensegua/api
npm.cmd run cypress:run -w @lensegua/web
```

Para abrir Cypress, sustituye el último comando por
`npm.cmd run cypress:open -w @lensegua/web`.

El workflow [LENSEGUA CI](.github/workflows/cypress.yml) se ejecuta en cada push,
pull request y desde **Actions → LENSEGUA CI → Run workflow**. Usa Node.js 22 y
Ubuntu 24.04; instala con `npm ci --include=dev`, genera Prisma, compila y ejecuta
las verificaciones y pruebas. Estos son los comandos equivalentes en Bash para CI:

```bash
export NODE_ENV=test
export LENSEGUA_E2E=1
export CYPRESS_BASE_URL=http://127.0.0.1:5174
npm ci --include=dev
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/generate_only npm run db:generate
npm run build
npm run lint
npm run typecheck
npx tsc --noEmit -p apps/web/cypress/tsconfig.json
npm run e2e:verify -w @lensegua/api
npm run test:isolated -w @lensegua/api
npm run cypress:run -w @lensegua/web -- --browser chrome --config video=true
```

La URL del paso `db:generate` es ficticia: ese comando no conecta una base.
El entorno E2E crea PostgreSQL en memoria con PGlite, prepara los datos e inicia
la API en 3101 y Vite en 5174. Antes de ejecutar las pruebas, espera respuestas
HTTP correctas de ambos servicios, con un límite de 30 segundos.
No se necesita Docker ni un servicio PostgreSQL de GitHub Actions.

No hacen falta secrets: las contraseñas de prueba y los secretos JWT se generan
aleatoriamente. No configures credenciales ni URLs de producción para este workflow.
Los datos, conexiones y archivos multimedia son temporales y aislados.
Si Cypress falla, el workflow sube las capturas y videos disponibles como artefacto
`cypress-failures-…` durante siete días; las ejecuciones exitosas no suben artefactos.

### Configuración inicial de referencia

Los comandos siguientes describen el frontend de desarrollo y la URL configurable.
Para ejecutar las suites existentes con preparación de datos, usa el bloque anterior.

Cypress está instalado como dependencia de desarrollo de `@lensegua/web`.
En una terminal inicia el frontend (no ejecuta migraciones ni seed):

```powershell
npm.cmd run dev -w @lensegua/web -- --host 127.0.0.1 --strictPort
```

En otra terminal, ejecuta la prueba o abre la interfaz de Cypress:

```powershell
npm.cmd run cypress:run -w @lensegua/web
npm.cmd run cypress:open -w @lensegua/web
```

La URL predeterminada es `http://localhost:5173`. Para probar la instalación
del iniciador de Windows u otro entorno, usa una variable de entorno de PowerShell:

```powershell
$env:CYPRESS_BASE_URL = 'http://localhost:8080'
npm.cmd run cypress:run -w @lensegua/web
Remove-Item Env:CYPRESS_BASE_URL
```

La prueba visita `/` y comprueba que la marca LENSEGUA sea visible en el encabezado.
No valida los contenidos de la API, no necesita iniciar PostgreSQL y no modifica datos.
La configuración de TypeScript de Cypress está aislada de la compilación del frontend.

Si el entorno define `ELECTRON_RUN_AS_NODE` y Cypress falla con `bad option: --smoke-test`,
retira esa variable de la terminal de pruebas antes de ejecutar Cypress:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

## GraphQL adicional

### Inicio, autenticación y contrato

Con `apps/api/.env` configurado según su ejemplo, ejecuta `npm.cmd run dev:api`.
GraphQL está en **http://localhost:3000/graphql** y comparte el proceso con REST.
Para probar sin una base real, usa `NODE_ENV=test`, `LENSEGUA_E2E=1` y
`npm.cmd run e2e:start -w @lensegua/api`: la URL es **http://127.0.0.1:3101/graphql**.

Las consultas públicas no requieren sesión. Para mutaciones, GraphQL acepta
`Authorization: Bearer <JWT_DE_ACCESO>` o la cookie HttpOnly `lensegua_access` que
ya entrega `/api/auth/login`. El login REST no cambia ni devuelve tokens en JSON.
Bearer tiene prioridad cuando se envía; si es inválido no se usa la cookie de
respaldo. REST continúa autenticándose por cookies. En navegador usa
`credentials: 'include'`; no intentes leer cookies HttpOnly desde JavaScript.

Consultas: `systemInfo`, `module(id)`, `modules`, `content(id)` y `contents`.
Mutaciones: `createEducationalContent`, `updateEducationalContent`,
`publishEducationalContent`, `deactivateEducationalContent` y `updateEducationalModule`.
Las mutaciones de contenido requieren los permisos actuales del docente o rol de
administrador; actualizar módulos requiere administrador.

Las listas devuelven `items` y `pagination { page pageSize total pages }`.
La página comienza en 1 y el tamaño predeterminado es 10, con máximo 50.
`modules` admite `search` (nombre y descripción, sin distinguir mayúsculas) y `active`;
`contents`, `moduleId` y `status`. Solo se muestran registros publicados dentro
de módulos publicados; filtros de borrador/inactivo devuelven listas vacías.

| Código de error                         | Significado                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| `UNAUTHENTICATED`                       | Sesión ausente, inválida o expirada                         |
| `FORBIDDEN`                             | Rol/permiso insuficiente o cambio obligatorio de contraseña |
| `BAD_USER_INPUT`                        | Validación o condiciones de publicación incumplidas         |
| `NOT_FOUND`                             | Registro inexistente en una mutación                        |
| `CONFLICT`                              | Orden/identificador ocupado o cambio concurrente            |
| `CONTENT_NOT_FOUND`, `MODULE_NOT_FOUND` | Registro no disponible en consultas públicas                |
| `INTERNAL_SERVER_ERROR`                 | Error inesperado con detalles internos ocultos              |

El protocolo GraphQL conserva sus errores de análisis y validación de esquema.
Comprueba `errors` además del estado HTTP. La introspección y el explorador siguen
deshabilitados en producción.

La guía [Ejemplos ejecutables de GraphQL](docs/graphql-examples.md) incluye login
seguro, Bearer, consultas, las cinco mutaciones y errores esperados. El comando
`npm.cmd run graphql:examples -w @lensegua/api` ejecuta la demostración sobre el
servidor temporal de pruebas, sin imprimir credenciales ni escribir tokens a disco.

Para verificar REST, GraphQL y Cypress juntos, con los servicios de demostración
detenidos, desde PowerShell:

```powershell
$env:NODE_ENV = 'test'
$env:LENSEGUA_E2E = '1'
$env:CYPRESS_BASE_URL = 'http://127.0.0.1:5174'
$env:SYSTEM_NAME = 'LENSEGUA'
$env:GRAPHQL_INTROSPECTION = 'true'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run e2e:verify -w @lensegua/api
npm.cmd run test:isolated -w @lensegua/api
npm.cmd run cypress:run -w @lensegua/web -- --browser chrome --config video=true
```

`test:isolated` incluye pruebas unitarias y de integración de GraphQL con Prisma
real sobre PGlite en memoria. No utiliza producción. GitHub Actions ejecuta la
misma suite en el workflow existente, sin workflows adicionales.

### Detalles de la integración inicial

Las operaciones de escritura protegidas, los permisos y ejemplos se describen en
[Mutaciones GraphQL](docs/graphql-mutaciones.md).

El dominio educativo público, sus filtros, relaciones y ejemplos están documentados
en [GraphQL educativo](docs/graphql-educacion.md).

La API incorpora Apollo Server 5 con la integración de Express 5 en
`http://localhost:3000/graphql`, junto a todos los endpoints REST existentes.
Reutiliza CORS, Helmet, el límite JSON y los registros de Express. La integración
sigue la [documentación de Apollo para Express](https://www.apollographql.com/docs/apollo-server/api/express-middleware).

Las variables nuevas en `apps/api/.env.example` son `SYSTEM_NAME=LENSEGUA` y
`GRAPHQL_INTROSPECTION=true`. La versión procede de `apps/api/package.json`.
Con `NODE_ENV=production` la introspección siempre queda desactivada, aunque su
variable sea `true`. El explorador HTML está desactivado en todos los entornos.

Consulta inicial, pública y sin acceso a Prisma ni PostgreSQL:

```graphql
query {
  systemInfo {
    name
    version
    status
  }
}
```

Con la API iniciada, puede ejecutarse desde PowerShell:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/graphql -Method Post -ContentType 'application/json' -Body '{"query":"{ systemInfo { name version status } }"}'
```

Respuesta predeterminada:

```json
{
  "data": {
    "systemInfo": {
      "name": "LENSEGUA",
      "version": "0.1.0",
      "status": "OK"
    }
  }
}
```

`OK` indica que el proceso responde a esta consulta de metadatos. La comprobación
REST de conectividad a PostgreSQL continúa en `/api/health`. La autenticación JWT
en cookies, roles y permisos de REST mantiene su comportamiento. Este bloque no
añade operaciones de datos ni modifica el esquema de Prisma.

## Base de datos

Prisma está configurado dentro de `apps/api`. Para generar el cliente, aplicar migraciones,
cargar los datos iniciales y consultar el estado:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:status
```

El seed es idempotente. Crea los roles `ADMINISTRADOR` y `DOCENTE`, veinte permisos y
los módulos Vocales, Números, Abecedario y Colores. Si están definidas las variables
`INITIAL_ADMIN_*`, también crea el administrador inicial con cambio obligatorio de contraseña.
No crea usuarios estudiantes.

## Autenticación y usuarios

Para recuperar una cuenta administrativa existente desde el equipo con acceso a PostgreSQL:

```powershell
npm.cmd run admin:reset -w @lensegua/api -- admin@lensegua.local
```

Genera una contraseña temporal y exige cambiarla al ingresar. Consulta el diagnóstico y los
pendientes en [Revisión del proyecto](docs/revision-proyecto.md).

Las sesiones usan tokens de acceso y renovación en cookies HttpOnly. El servidor rota cada
token de renovación y almacena únicamente su hash. Las cuentas se bloquean temporalmente al
quinto intento fallido y las contraseñas temporales deben cambiarse en el primer ingreso.

Rutas de autenticación:

```text
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/change-password
GET  /api/auth/me
```

La administración REST de usuarios se encuentra bajo `/api/users` y exige permisos
específicos. No existe registro público.

La pantalla `/admin/usuarios` permite crear y editar cuentas, buscar docentes, asignar roles,
activar o desactivar usuarios y restablecer contraseñas temporales. Consulta
[Usuarios y docentes](docs/usuarios-docentes.md) para su uso y validación.

## Material educativo

El panel permite ordenar, activar y desactivar los cuatro módulos, y gestionar contenidos sin
eliminación física. Los contenidos se guardan inicialmente como borradores y solo pueden
publicarse cuando tienen contenido textual y al menos una imagen o video activo.

```text
GET   /api/modules
PUT   /api/modules/order
PATCH /api/modules/:id/status
GET   /api/contents
GET   /api/contents/:id
POST  /api/contents
PATCH /api/contents/:id
PUT   /api/contents/order/batch
PATCH /api/contents/:id/status
```

`GET /api/contents` acepta `page`, `pageSize`, `moduleId`, `status` y `search`.

## Multimedia

El [catálogo de material educativo](docs/materiales/README.md) contiene 53 fichas de Vocales,
Números, Abecedario y Colores, con objetivos y actividades. Se importan como borradores;
faltan demostraciones y revisión de LENSEGUA antes de su publicación.

Abra un contenido existente desde `/admin/contenidos` para acceder a su sección Multimedia.
Los archivos se guardan fuera de `src`, en la ruta configurada por `MEDIA_STORAGE_PATH`, usando
nombres UUID. La base de datos conserva únicamente metadatos y la clave de almacenamiento.

- Imágenes: JPG, PNG o WEBP, máximo 5 MB.
- Videos: MP4 o WEBM, máximo 100 MB.
- La extensión, MIME declarado y firma binaria deben coincidir.
- El streaming de video admite solicitudes HTTP `Range` y respuestas `206`.

```text
GET   /api/contents/:contentId/media
POST  /api/contents/:contentId/media
PUT   /api/contents/:contentId/media/order
GET   /api/media/:id/file
PATCH /api/media/:id
PATCH /api/media/:id/status
POST  /api/media/:id/replace
```

Para probar desde el panel, edite primero un contenido guardado, seleccione una imagen válida,
espere a que la barra llegue al 100 % y repita con un video. Use los controles de cada tarjeta
para previsualizar, ordenar, marcar como principal, describir, reemplazar o desactivar.

## Verificación

Para producción, consulta [Despliegue, respaldo y restauración](docs/despliegue.md).
Los resultados del ensayo están en [Validación del despliegue](docs/validacion-despliegue.md).
La configuración está en `infra/compose.production.yml`; no sustituye el PostgreSQL de desarrollo.

```powershell
npm.cmd run lint
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd audit
```

## Estructura

```text
apps/
  api/          API Express, esquema, migraciones y cliente Prisma
  web/          Aplicación React
packages/
  shared/       Contratos compartidos
infra/          Docker Compose y configuración de PostgreSQL
docs/           Documentación técnica
```

El portal educativo está disponible en `/`, sin cuentas estudiantiles. Muestra módulos,
lecciones, imágenes y videos publicados; la administración continúa en `/admin`.
Consulta [Portal educativo](docs/portal-educativo.md) para su uso y validación.
El proyecto aún no incluye evaluaciones ni seguimiento de progreso estudiantil.
