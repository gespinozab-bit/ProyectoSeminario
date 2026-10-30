# Modelo de datos

## Entidades

- `users`: cuentas internas para administradores y docentes.
- `roles`, `permissions`, `user_roles`, `role_permissions`: autorización normalizada.
- `educational_modules`: categorías educativas ordenables.
- `educational_contents`: unidades de contenido con cuerpo JSON flexible y ciclo editorial.
- `media_assets`: imágenes y videos asociados a un contenido.
- `audit_logs`: bitácora inmutable de acciones y cambios, con actor opcional.
- `refresh_sessions`: sesiones de renovación rotatorias; conserva hashes, nunca JWT en texto.

Todas las entidades mutables incluyen fechas de creación y actualización. Las relaciones
definen políticas explícitas de eliminación, y los índices cubren códigos, estados, orden,
publicación y búsquedas de auditoría.

## Decisiones de alcance

No se modelan estudiantes, evaluaciones ni progreso. Tampoco se persisten archivos binarios:
`media_assets` conserva metadatos y ubicaciones para integrar almacenamiento posteriormente.
