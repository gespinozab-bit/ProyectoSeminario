# Ejemplos ejecutables de GraphQL

## Iniciar sin tocar datos reales

Usa dos terminales en la raíz del proyecto. Se requiere Node.js 22. Este ejemplo
utiliza exclusivamente `e2e:start`: PostgreSQL en memoria, API en el puerto 3101
y frontend en 5174. No ejecutes a la vez Cypress u otro `e2e:start` en esos puertos.

En la primera terminal PowerShell, introduce una contraseña nueva y exclusiva
para esta ejecución de pruebas (12–128 caracteres, mayúscula, minúscula, número y símbolo):

```powershell
$env:NODE_ENV = 'test'
$env:LENSEGUA_E2E = '1'
$securePassword = Read-Host 'Contraseña temporal de pruebas' -AsSecureString
$env:E2E_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
npm.cmd run build -w @lensegua/shared
npm.cmd run e2e:start -w @lensegua/api
```

En la segunda terminal, introduce la misma contraseña temporal y ejecuta:

```powershell
$env:NODE_ENV = 'test'
$env:LENSEGUA_E2E = '1'
$securePassword = Read-Host 'Misma contraseña temporal de pruebas' -AsSecureString
$env:E2E_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
try {
  npm.cmd run graphql:examples -w @lensegua/api
} finally {
  Remove-Item Env:E2E_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable securePassword -ErrorAction SilentlyContinue
}
```

El script `apps/api/scripts/graphql-examples.mjs` se conecta únicamente a
`http://127.0.0.1:3101`; rechaza entornos distintos de pruebas. Inicia sesión por
REST, conserva el JWT y las cookies solo en memoria y ejecuta las consultas y las
cinco mutaciones siguientes. Usa IDs existentes y calcula un orden libre mediante
REST. Sube una imagen de fixture por REST, publica dos veces, verifica la lectura
pública y desactiva el contenido. También verifica dos errores esperados.

Imprime resultados GraphQL, nunca contraseñas, cookies ni tokens. Termina con
`Ejemplos GraphQL: OK`. La prueba `npm.cmd run e2e:verify -w @lensegua/api` ejecuta
este mismo script automáticamente con una contraseña aleatoria.

Detén la primera terminal con Ctrl+C para descartar todo. Después retira
`E2E_ADMIN_PASSWORD`, `NODE_ENV` y `LENSEGUA_E2E` de ambas terminales si continúas
trabajando en desarrollo normal. No se utilizan credenciales ni datos de producción.

## Autenticación Bearer y cookies

Para clientes GraphQL nativos:

```http
POST /graphql
Content-Type: application/json
Authorization: Bearer <JWT_DE_ACCESO>
```

El JWT es el mismo que entrega el login REST en la cookie `lensegua_access`.
El login no devuelve tokens nuevos en su JSON. Un cliente nativo puede obtener el
valor de `Set-Cookie` y conservarlo en memoria, como hace el script. El navegador
debe usar las cookies HttpOnly existentes con `credentials: 'include'`; JavaScript
del navegador no debe intentar leerlas.

Bearer se admite únicamente en GraphQL. REST sigue usando cookies. Si llegan ambos,
Bearer tiene prioridad; uno inválido no recurre a la cookie. Se comprueban la firma,
expiración, estado activo, versión del token, cambio obligatorio de contraseña y
permisos. La renovación de sesión sigue en el endpoint REST existente; tras renovar,
un cliente nativo debe actualizar el Bearer con la nueva cookie de acceso.
El encabezado `Authorization` se oculta en los logs del servidor, al igual que cookies.

## Consultas

Se envían como JSON `{ "query": "…", "variables": {…} }`. La consulta pública más simple,
también ejecutable contra el servidor de desarrollo normal en el puerto 3000:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/graphql -Method Post -ContentType 'application/json' -Body '{"query":"{ systemInfo { name version status } }"}'
```

```graphql
query Catalog($search: String, $page: Int!, $pageSize: Int!) {
  modules(search: $search, active: true, page: $page, pageSize: $pageSize) {
    items {
      id
      name
      description
      active
      order
      contents(pageSize: 5) {
        id
        title
        status
        module {
          name
        }
      }
    }
    pagination {
      page
      pageSize
      total
      pages
    }
  }
}
```

Variables: `{"search":"Vocales","page":1,"pageSize":10}`.

```graphql
query Contents($moduleId: ID!) {
  contents(moduleId: $moduleId, status: PUBLISHED, page: 1, pageSize: 10) {
    items {
      id
      title
      description
      status
      createdAt
      updatedAt
      module {
        id
        name
      }
    }
    pagination {
      total
      pages
    }
  }
}
```

Usa como `moduleId` el ID devuelto por `Catalog`. Para detalles individuales:

```graphql
query Details($moduleId: ID!, $contentId: ID!) {
  module(id: $moduleId) {
    id
    name
    contents {
      id
      title
    }
  }
  content(id: $contentId) {
    id
    title
    status
    createdAt
    updatedAt
  }
}
```

Solo son públicos los contenidos `PUBLISHED` dentro de módulos `PUBLISHED`.
Los filtros `DRAFT`, `INACTIVE` y `active: false` devuelven listas vacías.
Esto también se aplica a consultas autenticadas. Un ID oculto o inexistente
devuelve `null` con `CONTENT_NOT_FOUND` o `MODULE_NOT_FOUND`.

## Mutaciones

Usa IDs devueltos por las operaciones anteriores; el script ejecutable los asigna
automáticamente. Crear exige un orden libre en el módulo y siempre produce `DRAFT`:

```graphql
mutation Create($input: CreateEducationalContentInput!) {
  createEducationalContent(input: $input) {
    id
    title
    status
    module {
      name
    }
  }
}
```

Variables, sustituyendo el módulo y el orden por valores del entorno temporal:

```json
{
  "input": {
    "moduleId": "UUID_DEL_MODULO",
    "title": "La vocal A",
    "description": "Reconoce A",
    "content": "Observa y practica la vocal A.",
    "order": 2
  }
}
```

```graphql
mutation Update($id: ID!) {
  updateEducationalContent(id: $id, input: { description: "Descripción revisada" }) {
    id
    description
    status
  }
}
```

Después de subir una imagen o video activo mediante REST/multimedia, con módulo activo:

```graphql
mutation Publish($id: ID!) {
  publishEducationalContent(id: $id) {
    id
    status
    updatedAt
  }
}
```

Repetir `Publish` conserva fechas y auditorías. El script compara ambas respuestas.

```graphql
mutation Deactivate($id: ID!) {
  deactivateEducationalContent(id: $id) {
    id
    status
  }
}
```

```graphql
mutation Module($id: ID!) {
  updateEducationalModule(id: $id, input: { active: true }) {
    id
    name
    active
  }
}
```

El administrador puede ejecutar las cinco operaciones. El docente necesita los
permisos `content.create`, `content.update`, `content.publish` o `content.deactivate`
correspondientes; no puede actualizar módulos. El docente inicial carece de
`content.deactivate`. Las ediciones con `status` tampoco eluden estos permisos.

## Errores esperados

Con sesión válida, un título vacío en `Create` produce:

```json
{
  "data": null,
  "errors": [
    {
      "message": "Argumentos inválidos.",
      "extensions": { "code": "BAD_USER_INPUT", "fields": ["title"] }
    }
  ]
}
```

Publicar sin sesión produce `UNAUTHENTICATED`; desactivar sin permiso, `FORBIDDEN`;
repetir un orden ocupado, `CONFLICT`; mutar un ID inexistente, `NOT_FOUND`.
Lee siempre `errors`: una respuesta HTTP 200 no implica que la mutación haya tenido éxito.
No se devuelven SQL, hashes, tokens ni stacktraces.

## Ejecutar toda la verificación

Desde la raíz, con los servicios de la demostración detenidos:

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

`test:isolated` ejecuta todas las pruebas de API, incluidas las de GraphQL y su
integración real con Prisma. El proceso crea PGlite en memoria e ignora cualquier
URL externa. Las migraciones existentes se aplican únicamente a esa base temporal.
La nueva integración exige la marca interna `LENSEGUA_TEST_DATABASE=pglite-memory`,
asignada por el proceso seguro; fuera de él se omite. No configures manualmente esa
marca ni ejecutes pruebas de integración contra una base real.

El workflow existente `.github/workflows/cypress.yml` usa esos mismos comandos y
recoge las pruebas nuevas sin crear otro workflow. Cypress comprueba REST, GraphQL
y el portal sobre el mismo servidor, además del flujo completo de publicación.

| Cobertura                                                         | Archivos                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `systemInfo`, configuración y convivencia REST                    | `src/graphql/server.test.ts`, `src/graphql/integration.test.ts`           |
| Paginación, búsqueda, filtros, relaciones y contenido inexistente | `src/graphql/education.test.ts`, `src/graphql/integration.test.ts`        |
| Público, administrador, docente, Bearer y permisos                | `src/graphql/mutations.test.ts`, `src/graphql/integration.test.ts`        |
| Creación válida, validación, conflictos y publicación idempotente | `src/services/education-write.test.ts`, `src/graphql/integration.test.ts` |
| REST, GraphQL y portal en navegador                               | `apps/web/cypress/e2e/interoperability.cy.ts`, `publication.cy.ts`        |
