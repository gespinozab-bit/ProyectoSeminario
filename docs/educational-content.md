# Gestión del material educativo

Los módulos Vocales, Números, Abecedario y Colores son registros ordenables. Pueden estar
activos (`PUBLISHED`) o inactivos (`INACTIVE`), pero no se eliminan.

Los contenidos tienen módulo, título, descripción breve opcional, objetivo de aprendizaje opcional, texto educativo, orden y
estado editorial. Se crean como `DRAFT`, pueden pasar a `PUBLISHED` si contienen texto y al
menos un recurso multimedia activo, y pueden desactivarse con `INACTIVE`. No existe una ruta
`DELETE`.

La API ofrece paginación y filtros por módulo, estado y texto. Las operaciones de creación,
edición, orden y estado generan entradas en `audit_logs`. Los docentes administran contenido
con sus permisos editoriales; los cambios estructurales de módulos quedan reservados a cuentas
con permisos `modules.order` y `modules.status`.

La interfaz administrativa se encuentra en `/admin/modulos` y `/admin/contenidos`. Incluye
navegación responsive, filtros, formularios, confirmaciones y estados de carga, vacío y error.

La edición de contenido integra la sección Multimedia descrita en
[`multimedia.md`](./multimedia.md).

El catálogo inicial incluye 53 lecciones con textos y objetivos. La herramienta de importación
las crea como borradores sin reemplazar el trabajo existente. Consulta
[Material educativo](materiales/README.md) para revisar textos, fichas multimedia y pendientes.
