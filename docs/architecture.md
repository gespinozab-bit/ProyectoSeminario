# Arquitectura

LENSEGUA utiliza un monorepo con npm workspaces. `apps/web` contiene la interfaz web,
`apps/api` expone la API HTTP y `packages/shared` aloja contratos TypeScript reutilizables.
`infra` reúne la infraestructura local y `docs` la documentación técnica.

La separación permite añadir un manifiesto y service worker a la web para convertirla en
PWA, y reutilizar contratos y lógica independiente de plataforma desde una futura aplicación
móvil, sin acoplarla a React DOM o Express.

## Persistencia

La API es propietaria del esquema Prisma y del acceso a PostgreSQL. El modelo separa usuarios
internos, roles, permisos, módulos, contenidos, recursos multimedia y bitácora. Las relaciones
muchos-a-muchos usan tablas explícitas para conservar metadatos de asignación.

Los estudiantes consumen el material sin cuentas, por lo que no existe una entidad de
estudiante, evaluación o progreso. Los estados editoriales se representan con el enum
`PublicationStatus`: `DRAFT`, `PUBLISHED` e `INACTIVE`.
