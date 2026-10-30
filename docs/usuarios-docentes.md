# Usuarios y docentes

La sección está disponible en `/admin/usuarios`, en la barra lateral y en Inicio para
cuentas con `users.read`. Las cuentas docentes no tienen ese permiso en el seed.
Una cuenta con contraseña temporal debe completar su cambio desde Inicio antes de entrar.

## Operaciones

- Buscar por nombre, apellido o correo, filtrar por rol y estado y recorrer páginas de 20 cuentas.
- Crear cuentas con nombres, apellidos, correo, uno o ambos roles y contraseña temporal.
  El rol predeterminado es Docente.
- Editar los nombres, apellidos y correo. Los correos duplicados muestran un error.
- Asignar los roles Docente y Administrador. Debe existir al menos un rol; la asignación
  cierra las sesiones anteriores de la persona.
- Activar o desactivar cuentas desde un diálogo de confirmación. Al desactivar, se
  revoca el acceso sin borrar sus contenidos.
- Restablecer una contraseña con confirmación, mostrarla u obtener una temporal generada.
  Se exige entre 12 y 128 caracteres, mayúscula, minúscula, número y símbolo. Debe
  entregarse antes de cerrar el formulario: no se conserva en el listado ni en almacenamiento
  del navegador. El restablecimiento desbloquea los intentos fallidos, revoca sesiones y
  obliga a cambiar la contraseña en el siguiente acceso.

Cada acción se muestra según su permiso específico. La API mantiene la comprobación de
permisos aunque se invoque directamente. La interfaz identifica la cuenta propia y permite
editar sus datos; para cambiar sus roles, estado o restablecer su contraseña se utiliza otro
administrador. La recuperación local de una cuenta sin acceso se explica en el README.
El listado muestra estado, roles, último ingreso en hora de Guatemala, cambio obligatorio
de contraseña y bloqueo temporal, cuando corresponde.

## Listado REST

`GET /api/users` acepta `page`, `pageSize` (máximo 100), `search` (máximo 100 caracteres),
`role` (`DOCENTE` o `ADMINISTRADOR`) y `status` (`ACTIVE` o `INACTIVE`). Devuelve `users`
y `pagination` con `page`, `pageSize`, `total` y `pages`. No devuelve hashes de contraseñas.
No se requieren migraciones nuevas.

## Validación

```powershell
npm.cmd exec -w @lensegua/api -- vitest run src/routes/users.test.ts src/routes/public.test.ts --configLoader runner
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build
```

Las pruebas de usuarios usan el middleware real de sesión y permisos con JWT firmado,
sustituyen Prisma y verifican paginación, filtros, rechazo de docentes, contraseñas temporales,
correos duplicados y protección de la propia cuenta. No sustituyen la validación con PostgreSQL.

Con PostgreSQL iniciado, probar desde el navegador:

1. Ingresar como administrador y crear un docente con contraseña temporal.
2. Entrar con ese docente en otra ventana y completar el cambio obligatorio. Comprobar que
   no ve el menú de usuarios y que `/admin/usuarios` muestra acceso restringido.
3. Editar sus datos y buscarlo por correo y apellido. Comprobar filtros, lista vacía y páginas.
4. Cambiar sus roles y comprobar que la sesión anterior ya no funciona.
5. Restablecer su contraseña, probar que la anterior ya no funciona y completar el nuevo cambio.
6. Desactivar su cuenta, comprobar el rechazo del acceso y volver a activarla.
7. Revisar diálogos con Tab, Escape, confirmación de contraseña y pantalla móvil.

En esta sesión PostgreSQL no estaba iniciado y la comprobación visual en navegador no se
realizó. Queda pendiente validar estos recorridos con datos reales.
