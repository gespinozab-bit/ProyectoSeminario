# Despliegue de LENSEGUA

La instalación preparada usa un servidor Linux con Docker Engine y Compose: Caddy sirve
la web y dirige `/api` a Express. PostgreSQL y la API no publican puertos al exterior.
Web y API comparten dominio, por lo que las cookies de sesión funcionan sin configurar
dominios cruzados. Caddy gestiona HTTPS cuando el DNS y los puertos del dominio lo permiten.
No se ha contratado alojamiento ni publicado el proyecto en internet.

## Preparación del servidor

Necesitas un servidor con Docker y Compose, Node.js 22 para la herramienta de respaldo,
un dominio cuyo DNS apunte al servidor y acceso a los puertos 80 y 443. Conserva esta carpeta
en control de versiones antes de entregar; actualmente no contiene un repositorio Git.

Desde la raíz del proyecto, en el servidor Linux:

```sh
cp infra/production/.env.example infra/production/.env
chmod 600 infra/production/.env
```

Edita ese archivo: configura `DOMAIN`, `WEB_ORIGIN=https://tu-dominio`, correo del
administrador y una contraseña temporal fuerte. Genera una contraseña PostgreSQL en HEX y
dos secretos JWT diferentes; repite este comando por cada valor:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Los valores de ejemplo `CHANGE_ME` no sirven para producción. No compartas el archivo
`.env`, sus copias ni el contenido de `docker compose config`, que expande los secretos.
La aplicación rechaza secretos JWT de ejemplo, secretos iguales y orígenes HTTP en modo
producción. `TRUST_PROXY_HOPS=1` corresponde exclusivamente al montaje con un Caddy delante
de la API. Si añades otro proxy, revisa esta configuración antes de cambiarla.

## Primera instalación en una base nueva

```sh
docker compose --env-file infra/production/.env -f infra/compose.production.yml config --quiet
docker compose --env-file infra/production/.env -f infra/compose.production.yml build
docker compose --env-file infra/production/.env -f infra/compose.production.yml up -d
docker compose --env-file infra/production/.env -f infra/compose.production.yml run --rm maintenance npm run db:seed
docker compose --env-file infra/production/.env -f infra/compose.production.yml run --rm maintenance node dist/import-materials.js --apply
```

El servicio `migrate` aplica las migraciones versionadas con `prisma migrate deploy` antes
de arrancar la API. No se usa `migrate dev` ni `db push` en producción. El seed crea roles,
permisos, módulos y el administrador inicial; úsalo solo en una base nueva, ya que activa
y reordena los módulos. La importación crea 53 lecciones como borradores, sin multimedia.
No copia los datos ni la contraseña administrativa del equipo de desarrollo.

Abre `https://tu-dominio/admin/login`, entra con la cuenta inicial y cambia su contraseña.
Retira `INITIAL_ADMIN_PASSWORD` del archivo después de completar la instalación. Antes
de invitar estudiantes, revisa y publica los materiales que ya tengan demostraciones
válidas. Los videos externos encontrados se documentan en `docs/materiales/fuentes-internet.md`;
todavía no están integrados como recursos multimedia de las lecciones.

## Comprobación posterior

```sh
docker compose --env-file infra/production/.env -f infra/compose.production.yml ps -a
curl --fail https://tu-dominio/api/health
curl --fail https://tu-dominio/api/public/modules
```

Comprueba el certificado HTTPS sin omitir su validación, la recarga de `/admin/usuarios`
y una ruta `/aprender/...`, entrada y salida de sesión, gestión de un docente de prueba,
subida de un archivo, video por rangos y retirada de un material publicado. Las cookies
deben indicar `Secure`, `HttpOnly` y `SameSite=Strict`. El acceso directo a la base o API
desde internet no es necesario.

## Persistencia y respaldo

Compose conserva PostgreSQL, multimedia y certificados en volúmenes. Actualizar o detener
contenedores no borra esos datos; no uses `down -v` en una instalación con datos.

El siguiente respaldo pausa brevemente API y web para mantener coherentes base y archivos,
genera un dump PostgreSQL, un archivo de multimedia y un manifiesto SHA-256, y vuelve a
iniciar los servicios que estaban funcionando. El directorio padre debe existir; el destino
de cada respaldo debe ser nuevo:

```sh
mkdir -p backups
node infra/backup.mjs infra/production/.env backups/lensegua-2026-10-29
```

Programa respaldos según el volumen de cambios, conserva copias cifradas fuera del servidor
y ensaya restauraciones. El respaldo no incluye secretos ni certificados: conserva de forma
segura la configuración necesaria para recuperar la instalación. Si falla, no asumas que
los archivos parciales constituyen un respaldo válido; comprueba el manifiesto y los errores.

## Restauración de ensayo sin tocar producción

Crea un entorno separado con `DOMAIN=localhost`, `WEB_ORIGIN=https://localhost:18443`,
`BIND_ADDRESS=127.0.0.1`, `HTTP_PORT=18080`, `HTTPS_PORT=18443`, secretos propios y el proyecto
Compose `lensegua-rehearsal`. No copies los secretos de producción al informe de pruebas.

```sh
docker compose --env-file infra/production/.env.rehearsal -f infra/compose.production.yml -p lensegua-rehearsal up -d
docker compose --env-file infra/production/.env.rehearsal -f infra/compose.production.yml -p lensegua-rehearsal run --rm maintenance npm run db:seed
docker compose --env-file infra/production/.env.rehearsal -f infra/compose.production.yml -p lensegua-rehearsal run --rm maintenance node dist/import-materials.js --apply
docker compose --env-file infra/production/.env.rehearsal -f infra/compose.production.yml -p lensegua-rehearsal run --rm maintenance node /app/infra/smoke-rehearsal.mjs
```

El script de ensayo crea cuentas temporales, comprueba la web y las operaciones por HTTPS,
y elimina esas cuentas al terminar. Solo acepta el origen de ensayo indicado. Omite la
verificación del certificado únicamente dentro de esta prueba de Caddy local; no es una
configuración de la aplicación ni una prueba del certificado público definitivo.

Para verificar un dump, cópialo al contenedor PostgreSQL del entorno aislado, crea una
base **nueva** y restaura allí:

```sh
docker compose --env-file infra/production/.env.rehearsal -f infra/compose.production.yml -p lensegua-rehearsal cp backups/ensayo/database.dump postgres:/tmp/restore.dump
docker compose --env-file infra/production/.env.rehearsal -f infra/compose.production.yml -p lensegua-rehearsal exec -T postgres createdb -U lensegua lensegua_restore_check
docker compose --env-file infra/production/.env.rehearsal -f infra/compose.production.yml -p lensegua-rehearsal exec -T postgres pg_restore -U lensegua --exit-on-error --no-owner -d lensegua_restore_check /tmp/restore.dump
docker compose --env-file infra/production/.env.rehearsal -f infra/compose.production.yml -p lensegua-rehearsal exec -T postgres psql -U lensegua -d lensegua_restore_check -c "SELECT count(*) FROM educational_contents;"
```

Verifica las sumas del manifiesto antes de restaurar. Extrae `media.tar.gz` en una carpeta
o volumen nuevo del ensayo y compara sus archivos. No pruebes restauraciones encima de
la base o los archivos reales. La restauración definitiva requiere una ventana de trabajo
y comprobar conjuntamente PostgreSQL, multimedia, configuración y permisos del usuario `node`.

## Actualizaciones

Respalda antes de cada actualización. Conserva la versión anterior de las imágenes con un
`IMAGE_TAG` identificable y usa el mismo valor en todos los servicios. Construye y levanta
el montaje; el servicio de migración debe terminar correctamente antes de aceptar tráfico.
No vuelvas a ejecutar el seed sobre una base de uso diario.

Las migraciones no se revierten automáticamente al cambiar la imagen. Una recuperación
puede requerir restaurar el respaldo, por lo que debe ensayarse antes de usar datos reales.

## Referencias técnicas

- [Prisma 7: migrate deploy](https://docs.prisma.io/docs/cli/v7/migrate/deploy).
- [Caddy: patrón de aplicación SPA y proxy](https://caddyserver.com/docs/caddyfile/patterns).
- [Caddy: requisitos de HTTPS automático](https://caddyserver.com/docs/automatic-https).
- [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/).
