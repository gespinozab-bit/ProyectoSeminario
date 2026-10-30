# Mutaciones educativas protegidas

El endpoint sigue siendo `/graphql`. Las consultas públicas y todos los endpoints
REST conservan su comportamiento. No se añade eliminación física ni se cambia
el esquema de Prisma.

GraphQL también acepta ahora `Authorization: Bearer <JWT_DE_ACCESO>`, manteniendo
cookies como alternativa y sin cambiar REST. La prioridad, ejemplos ejecutables y
verificación conjunta están en [Ejemplos GraphQL](graphql-examples.md).

## Sesión y autorización

El contexto GraphQL reutiliza el middleware `requireAuthentication` de REST:
verifica la cookie HttpOnly `lensegua_access`, firma y expiración JWT, estado
`ACTIVE` del usuario y `tokenVersion`. No se aceptan roles, permisos o IDs del
actor desde el input. La verificación se hace solo cuando una mutación la necesita
y se reutiliza durante esa petición. Las lecturas públicas no requieren sesión.

Inicia sesión mediante el endpoint REST existente `/api/auth/login`; el navegador
debe enviar las cookies (`credentials: 'include'`). No copies tokens al cuerpo
GraphQL ni los guardes en archivos. Una sesión inválida produce `UNAUTHENTICATED`.
Las cuentas con cambio obligatorio de contraseña reciben `FORBIDDEN` hasta
completar el cambio mediante el flujo existente.

| Operación                      | ADMINISTRADOR | DOCENTE                       |
| ------------------------------ | ------------- | ----------------------------- |
| `createEducationalContent`     | Permitida     | Requiere `content.create`     |
| `updateEducationalContent`     | Permitida     | Requiere `content.update`     |
| `publishEducationalContent`    | Permitida     | Requiere `content.publish`    |
| `deactivateEducationalContent` | Permitida     | Requiere `content.deactivate` |
| `updateEducationalModule`      | Permitida     | No permitida                  |

El docente inicial no tiene `content.deactivate`; esa operación exige que el
permiso esté asignado. No se añade una restricción de autoría que REST no tenga:
se respetan los permisos actuales. Si `updateEducationalContent` incluye un estado
`PUBLISHED` o `INACTIVE`, también se exige `content.publish` o `content.deactivate`,
respectivamente. Esto impide evitar la autorización mediante el input de edición.
Los usuarios públicos y otros roles no pueden ejecutar mutaciones.

## Validaciones y transacciones

Las rutas REST no tenían un servicio independiente de escritura. El nuevo servicio
`services/education-write.ts` usa el mismo cliente Prisma y el servicio `writeAudit`.
Este último admite una transacción opcional; las llamadas REST existentes con un
solo argumento mantienen su comportamiento.

- Crear siempre genera un borrador. `status` puede omitirse o ser `DRAFT`.
- Título: texto sin espacios exteriores, entre 1 y 180 caracteres.
- Descripción: hasta 500 caracteres; `null` permite retirarla.
- Objetivo: hasta 500 caracteres; texto educativo: hasta 10000.
- El módulo debe existir, el orden debe ser un entero no negativo y no puede
  estar ocupado por otro contenido del mismo módulo.
- Los IDs deben ser UUID válidos. Las actualizaciones vacías se rechazan.
  `null` se permite únicamente en descripción y objetivo, no en título, módulo,
  orden, contenido o estado.
- Publicar requiere texto no vacío, al menos una imagen o video `PUBLISHED` y
  módulo `PUBLISHED`, como en REST. Las mismas condiciones se verifican al
  publicar mediante `updateEducationalContent`. Tampoco se permite vaciar el
  texto de un contenido que permanece publicado.
- Para módulos: nombre entre 1 y 120 caracteres, descripción hasta 500,
  orden entero no negativo y `active` booleano. El slug no se cambia al renombrar.
- Desactivar cambia el estado a `INACTIVE`; conserva la fecha de publicación.

Cada escritura y su auditoría se ejecutan en una transacción `Serializable`.
Los conflictos serializables se reintentan hasta tres intentos; un conflicto
persistente se devuelve como `CONFLICT`. Los fallos de auditoría abortan la misma
transacción. Publicar un registro ya publicado no escribe, no cambia `publishedAt`
ni `updatedAt` y no duplica auditoría. Esto también se aplica a una edición cuyo
único campo sea el mismo estado actual.

Los resultados incluyen solo campos del esquema. El módulo de un resultado de
mutación se devuelve como instantánea autorizada, incluso si está inactivo;
no se introduce en cachés públicas. Las cargas se invalidan después de cada
mutación y siguen siendo exclusivas de la petición. Las consultas públicas
continúan ocultando borradores, inactivos y contenidos de módulos inactivos.

## Errores

Los errores de ejecución de mutaciones usan `extensions.code`:

| Código            | Significado                                                  |
| ----------------- | ------------------------------------------------------------ |
| `UNAUTHENTICATED` | Falta sesión o el JWT/usuario ya no es válido                |
| `FORBIDDEN`       | Rol o permiso insuficiente; cambio de contraseña pendiente   |
| `BAD_USER_INPUT`  | Campos o condiciones de publicación inválidos                |
| `NOT_FOUND`       | Contenido o módulo inexistente                               |
| `CONFLICT`        | Orden/identificador ocupado o cambio concurrente persistente |

Los errores inesperados se ocultan como `INTERNAL_SERVER_ERROR`, sin mensajes
Prisma, SQL, metadatos ni stacktraces. Los errores de variables no devuelven sus
valores originales. Las validaciones del protocolo GraphQL conservan sus códigos
estándar. Los errores de ejecución normalmente usan HTTP 200 y deben comprobarse
en `errors`, además del código HTTP.

## Ejemplos válidos

Estos ejemplos requieren una sesión autorizada y UUID de registros de prueba
existentes. No se ejecutan automáticamente contra una base real.

```graphql
mutation {
  createEducationalContent(
    input: {
      moduleId: "22222222-2222-4222-8222-222222222222"
      title: "La vocal A"
      description: "Reconoce la vocal A"
      content: "Observa y practica la vocal A."
      learningObjective: "Reconocer la vocal A"
      order: 2
    }
  ) {
    id
    title
    status
    module {
      name
    }
  }
}
```

Resultado ilustrativo con fixtures autorizadas:

```json
{
  "data": {
    "createEducationalContent": {
      "id": "33333333-3333-4333-8333-333333333333",
      "title": "La vocal A",
      "status": "DRAFT",
      "module": { "name": "Vocales" }
    }
  }
}
```

```graphql
mutation {
  updateEducationalContent(
    id: "33333333-3333-4333-8333-333333333333"
    input: { description: "Practica con tu docente", content: "Observa la demostración." }
  ) {
    id
    title
    status
    updatedAt
  }
}
```

Después de asociar una imagen o video activo mediante el flujo REST/multimedia
existente, se puede publicar. Repetir esta mutación conserva el mismo resultado
y las fechas almacenadas:

```graphql
mutation {
  publishEducationalContent(id: "33333333-3333-4333-8333-333333333333") {
    id
    status
    updatedAt
  }
}
```

Con administrador o un docente que tenga `content.deactivate`:

```graphql
mutation {
  deactivateEducationalContent(id: "33333333-3333-4333-8333-333333333333") {
    id
    status
  }
}
```

Resultado: estado `INACTIVE`, sin eliminación. Solo para administrador:

```graphql
mutation {
  updateEducationalModule(
    id: "22222222-2222-4222-8222-222222222222"
    input: { name: "Vocales iniciales", description: "Introducción", active: true, order: 1 }
  ) {
    id
    name
    active
    order
  }
}
```

## Ejemplos inválidos

Con sesión válida, un título vacío falla antes de escribir:

```graphql
mutation {
  createEducationalContent(
    input: { moduleId: "22222222-2222-4222-8222-222222222222", title: "", order: 2 }
  ) {
    id
  }
}
```

```json
{
  "errors": [
    {
      "message": "Argumentos inválidos.",
      "extensions": { "code": "BAD_USER_INPUT", "fields": ["title"] }
    }
  ],
  "data": null
}
```

Sin sesión, publicar devuelve `UNAUTHENTICATED`. Con un docente que solo tenga
`content.update`, esta edición devuelve `FORBIDDEN`, sin escribir:

```graphql
mutation {
  updateEducationalContent(
    id: "33333333-3333-4333-8333-333333333333"
    input: { status: INACTIVE }
  ) {
    id
    status
  }
}
```

Un UUID válido sin registro devuelve `NOT_FOUND`. Un orden ya ocupado devuelve
`CONFLICT`. Publicar sin texto, multimedia activa o módulo activo devuelve
`BAD_USER_INPUT` y conserva el registro anterior.

## Pruebas sin escrituras reales

La configuración de pruebas unitarias de [GraphQL educativo](graphql-educacion.md)
también ejecuta `graphql/mutations.test.ts` y `services/education-write.test.ts`.
Se verifican JWT reales firmados con secretos de prueba, permisos, validaciones,
idempotencia, auditoría transaccional, errores seguros y limpieza de cachés,
con Prisma simulado. No se ejecutan migraciones ni se modifican datos reales.

```powershell
npm.cmd run test -w @lensegua/api -- --exclude src/app.test.ts
npm.cmd run typecheck
npm.cmd run build
npm.cmd run lint
```
