# Dominio educativo público en GraphQL

Para ejecutar la cobertura completa con Prisma real sobre PostgreSQL temporal,
consulta [Ejemplos ejecutables y verificación conjunta](graphql-examples.md).

El endpoint continúa en `/graphql` y conserva `systemInfo`. REST no se modifica.
Este bloque solo incorpora lecturas públicas; no añade mutaciones ni acceso
administrativo a borradores, aunque la petición incluya cookies de una sesión.

Las rutas educativas existentes consultan directamente el cliente Prisma compartido.
No había un repositorio o servicio de lectura independiente. El nuevo servicio
`src/services/public-education.ts` utiliza ese cliente y las mismas restricciones
de publicación que `routes/public.ts`. Los resolvers solo llaman al servicio y a
sus cargas agrupadas; no consultan Prisma directamente.

## Contrato y límites

- Estados reales: `DRAFT`, `PUBLISHED`, `INACTIVE`.
- `name` representa `EducationalModule.title`; `order`, su `sortOrder`;
  `active` significa estado `PUBLISHED`.
- `EducationalContent.description` representa `summary`.
- Toda lectura pública de contenido exige `PUBLISHED` tanto en el contenido
  como en su módulo. Las listas y las relaciones aplican la misma regla.
- `module(id: ID!)` y `content(id: ID!)` devuelven `null` con un error
  `MODULE_NOT_FOUND` o `CONTENT_NOT_FOUND` si el registro falta o no es público.
  No distinguen un ID oculto de uno inexistente.
- `modules(page: Int! = 1, pageSize: Int! = 10, search: String, active: Boolean)`
  busca sin distinguir mayúsculas en título y descripción.
- `contents(page: Int! = 1, pageSize: Int! = 10, moduleId: ID, status: ContentStatus)`
  filtra los contenidos públicos. `status: DRAFT`, `status: INACTIVE` y
  `modules(active: false)` producen listas vacías; no exponen datos privados.
- Las listas devuelven `items` y `pagination { page pageSize total pages }`.
  El orden es estable; el ID desempata. Página mínima 1, máxima 100000;
  tamaño de página entre 1 y 50. La búsqueda admite hasta 100 caracteres.
- `EducationalModule.contents(page: Int! = 1, pageSize: Int! = 10)` devuelve
  una lista con los mismos límites de paginación para cada módulo.
- Los IDs deben ser UUID válidos. Los argumentos inválidos producen
  `BAD_USER_INPUT`; los valores no definidos en el enum fallan la validación GraphQL.
- `DateTime` acepta exclusivamente texto ISO 8601 con milisegundos y zona horaria
  conocida. Rechaza fechas inexistentes, números, objetos, fechas sin zona y
  el offset desconocido `-00:00`. La salida se normaliza a UTC con tres decimales.

DataLoader agrupa IDs y relaciones dentro de cada petición. Los módulos recuperados
por una lista se reutilizan en la relación inversa; los contenidos por módulo se
agrupan por combinación de página y tamaño. La consulta anidada de varios padres
no ejecuta una búsqueda individual por padre. Las cachés nunca cruzan peticiones.

## Ejemplos verificados

Los resultados siguientes corresponden a fixtures de pruebas en memoria, sin
conectar ni modificar una base de datos real. En la instalación real los IDs,
fechas y cantidades dependen de los registros publicados disponibles.

```graphql
query {
  modules(page: 1, pageSize: 1, search: "VOCALES", active: true) {
    items {
      name
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

```json
{
  "data": {
    "modules": {
      "items": [{ "name": "Vocales" }],
      "pagination": { "page": 1, "pageSize": 1, "total": 1, "pages": 1 }
    }
  }
}
```

```graphql
query {
  content(id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
    id
    title
    description
    status
    module {
      name
    }
    createdAt
    updatedAt
  }
}
```

```json
{
  "data": {
    "content": {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "title": "La vocal A",
      "description": "Reconoce la A",
      "status": "PUBLISHED",
      "module": { "name": "Vocales" },
      "createdAt": "2026-10-30T12:00:00.000Z",
      "updatedAt": "2026-10-30T12:00:00.000Z"
    }
  }
}
```

```graphql
query {
  module(id: "11111111-1111-4111-8111-111111111111") {
    name
    active
    order
    contents(pageSize: 1) {
      title
      module {
        name
      }
    }
  }
  contents(
    moduleId: "11111111-1111-4111-8111-111111111111"
    status: PUBLISHED
    page: 2
    pageSize: 1
  ) {
    items {
      title
    }
    pagination {
      total
      pages
    }
  }
}
```

```json
{
  "data": {
    "module": {
      "name": "Vocales",
      "active": true,
      "order": 1,
      "contents": [{ "title": "La vocal A", "module": { "name": "Vocales" } }]
    },
    "contents": {
      "items": [{ "title": "La vocal E" }],
      "pagination": { "total": 2, "pages": 2 }
    }
  }
}
```

## Verificación sin base de datos

```powershell
$env:NODE_ENV = 'test'
$env:SYSTEM_NAME = 'LENSEGUA'
$env:GRAPHQL_INTROSPECTION = 'true'
$env:JWT_ACCESS_SECRET = 'a' * 64
$env:JWT_REFRESH_SECRET = 'b' * 64
$env:DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/no_connection'
$env:LOG_LEVEL = 'fatal'
npm.cmd run test -w @lensegua/api -- --exclude src/app.test.ts
npm.cmd run typecheck
npm.cmd run build
```

Los valores anteriores son exclusivamente de pruebas. La URL no se conecta:
Prisma está simulado en estas pruebas. `src/app.test.ts` se excluye porque requiere
una base escribible. No se ejecutan migraciones ni se cambia el esquema Prisma.
