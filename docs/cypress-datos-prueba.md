# Datos aislados para Cypress

El mecanismo E2E crea PostgreSQL en memoria con PGlite. No utiliza la base de
desarrollo, Docker ni una conexión suministrada por `DATABASE_URL`. Aplica las
migraciones existentes únicamente a esa instancia privada y temporal.
No agrega endpoints de preparación ni cambia las rutas de la API habitual.

## Ejecutar Cypress con preparación automática

Desde la raíz, en PowerShell:

```powershell
$env:NODE_ENV = 'test'
$env:LENSEGUA_E2E = '1'
$env:CYPRESS_BASE_URL = 'http://127.0.0.1:5174'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm.cmd run cypress:run -w @lensegua/web
```

Para la interfaz gráfica, usa las mismas variables y ejecuta:

```powershell
npm.cmd run cypress:open -w @lensegua/web
```

No inicies manualmente el frontend ni el backend para esta modalidad. Cypress
inicia Vite en `127.0.0.1:5174`, la API real en `127.0.0.1:3101` y la base en memoria
en un puerto local asignado por el sistema. Los puertos 5174 y 3101 deben estar
libres. La API E2E usa secretos JWT nuevos y una carpeta temporal de multimedia.
La configuración del frontend de pruebas apunta explícitamente a la API E2E.

## Variables

| Variable               | Valor / finalidad                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`             | Obligatorio: `test`. Cualquier otro valor, incluido `production`, bloquea el mecanismo.                               |
| `LENSEGUA_E2E`         | Obligatorio: `1`. Habilitación explícita del entorno temporal.                                                        |
| `CYPRESS_BASE_URL`     | Para Cypress: exactamente `http://127.0.0.1:5174`. Impide usar la tarea contra una página de producción o desarrollo. |
| `E2E_ADMIN_PASSWORD`   | Opcional, exclusivamente de pruebas. Se genera aleatoriamente si se omite.                                            |
| `E2E_TEACHER_PASSWORD` | Opcional, exclusivamente de pruebas. Se genera aleatoriamente si se omite.                                            |

Las contraseñas deben tener 12–128 caracteres, mayúscula, minúscula, número y
símbolo. Puedes suministrar valores exclusivos desde variables del proceso o el
almacén de secretos de CI. No uses contraseñas reales ni las guardes en archivos
versionados. Cypress genera una contraseña aleatoria de administrador si se omite;
la tarea `auth:adminPassword` la entrega únicamente a las pruebas del entorno aislado
para completar el formulario real de inicio de sesión. La llamada y la escritura
usan `log: false`. La base almacena hashes Argon2id. No se cargan archivos `.env` de
credenciales para preparar los datos. La conexión y los secretos de la API
temporal se establecen internamente antes de importar la aplicación.

## Datos iniciales y reinicio por suite

- `admin@e2e.lensegua.test`: usuario activo con rol `ADMINISTRADOR` y los permisos del panel.
- `docente@e2e.lensegua.test`: usuario activo con rol `DOCENTE` y permisos de contenidos, multimedia y lectura de módulos.
- Módulo `Vocales`, código `VOCALES`, activo (`PUBLISHED`, estado usado por el proyecto).
- Contenido `La vocal A`, del docente, en estado `DRAFT`, dentro de Vocales.

Las cuentas están listas para iniciar sesión sin cambio obligatorio de contraseña.
El borrador no aparece entre las lecciones públicas, como corresponde al comportamiento
actual de la aplicación.

La suite principal ya ejecuta lo siguiente. Añádelo a cada nueva suite que necesite
una base inicial limpia:

```typescript
before(() => {
  cy.task('db:reset', null, { timeout: 60000 });
});
```

Si cada caso modifica datos y necesita aislamiento individual, usa `beforeEach`
en lugar de `before`. La tarea no acepta URLs, SQL ni identificadores de bases.
Limpia las tablas únicamente dentro de la instancia en memoria que creó el proceso
de pruebas y vuelve a insertar los datos. Conserva el esquema y sus tipos para
evitar invalidar consultas preparadas de Prisma entre pruebas. Devuelve `adminId`, `teacherId`,
`moduleId` y `contentId`. Los IDs cambian en cada reinicio: no los fijes en las pruebas.
El reinicio elimina también las sesiones y auditorías de esa instancia temporal;
vuelve a iniciar sesión después de reiniciar. Ejecuta las suites de este entorno
secuencialmente; no compartas sus puertos entre procesos paralelos.

Al terminar la ejecución headless, o al cerrar Cypress, se apagan los servicios y
se descarta la base en memoria. Los archivos temporales se retiran al cerrar el
proceso. Reiniciar no borra archivos de multimedia de la aplicación real.

Para inspección manual, con `NODE_ENV=test` y `LENSEGUA_E2E=1`, ejecuta:

```powershell
npm.cmd run e2e:start -w @lensegua/api
```

Este comando prepara los mismos datos. Detén con Ctrl+C y vuelve a ejecutarlo
para reiniciarlos. No lo ejecutes simultáneamente con Cypress.

## Verificar el mecanismo y compilar

La suite `apps/web/cypress/e2e/publication.cy.ts` contiene diez pruebas independientes
del flujo de publicación, cada una con `db:reset` en `beforeEach`:

1. Inicio de sesión del administrador.
2. Rechazo de credenciales incorrectas.
3. Acceso al módulo de contenidos.
4. Validación nativa de título obligatorio, sin enviar el formulario vacío.
5. Creación de un borrador nuevo.
6. Publicación de un borrador con texto e imagen activa.
7. Mensaje de éxito de la publicación desde el listado.
8. Lectura de la lección publicada sin sesión de usuario.
9. Desactivación, desaparición del listado público y rechazo del enlace directo.
10. Mensaje visible ante una respuesta 503 de la lista de contenidos.

La imagen mínima de prueba está en `cypress/fixtures/vocal-a.png` y se sube
por el control real de archivos. Solo el caso de error 503 sustituye una respuesta;
las operaciones de autenticación, creación, multimedia, publicación y desactivación
usan el backend real del entorno en memoria. Los selectores `data-cy` no dependen
del diseño. La carga multipart no se intercepta para conservar intactos sus bytes;
se verifica mediante la confirmación de éxito y la tarjeta del recurso guardado.
El servidor temporal admite las conexiones simultáneas del navegador.
Las pruebas esperan respuestas HTTP y estados verificables, sin
esperas de duración fija. El título es el campo obligatorio vacío en el formulario
nuevo: módulo y orden ya tienen valores predeterminados en la aplicación.

El caso `home.cy.ts` anterior se conserva y también se ejecuta con el comando completo.

```powershell
npm.cmd run e2e:verify -w @lensegua/api
npm.cmd run build
```

Para ejecutar también las 55 pruebas existentes de la API con datos temporales,
sin depender de su base externa, usa:

```powershell
$env:NODE_ENV = 'test'
$env:LENSEGUA_E2E = '1'
npm.cmd run test:isolated -w @lensegua/api
```

Este comando prepara la misma base en memoria, pasa su conexión y la carpeta
temporal al comando de pruebas existente y descarta todo al terminar.

La verificación comprueba el bloqueo en producción, que una `DATABASE_URL` externa
se ignora, los accesos de administrador y docente, el borrador y su restauración
después de modificarlo, y la invalidación de sesiones anteriores.

Al finalizar, retira las variables de esa terminal si vas a seguir trabajando en
desarrollo normal:

```powershell
Remove-Item Env:NODE_ENV, Env:LENSEGUA_E2E, Env:CYPRESS_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:E2E_ADMIN_PASSWORD, Env:E2E_TEACHER_PASSWORD -ErrorAction SilentlyContinue
```
