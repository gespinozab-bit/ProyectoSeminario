# LENSEGUA en Windows local

Esta es la modalidad de uso elegida para el proyecto. No requiere servidor externo,
dominio ni certificados. La web funciona en **http://localhost:8080/** y está enlazada
solo a este equipo. Docker contiene PostgreSQL, la API y la web ya compilada.

El arranque se comprobó en este equipo: se conservaron los 53 borradores existentes,
pasaron las 53 pruebas y respondieron con HTTP 200 el portal, el acceso administrativo,
la ruta de usuarios, la salud de PostgreSQL y la consulta de módulos públicos. También se
generó un respaldo conjunto de base y multimedia y se comprobó el reinicio posterior.

## Requisitos

- Windows con Docker Desktop configurado para contenedores Linux y WSL 2.
- Node.js 22 para ejecutar los iniciadores.
- Internet durante la primera construcción para descargar imágenes y dependencias.

Conserva esta carpeta completa. No necesitas instalar PostgreSQL ni ejecutar Vite o la API
manualmente. Los archivos `.cmd` no requieren cambiar la política de ejecución de PowerShell.

## Iniciar

Haz doble clic en **Iniciar LENSEGUA.cmd** desde la raíz del proyecto. El iniciador:

1. Abre Docker Desktop si está cerrado y espera a que esté disponible.
2. Prepara `infra/windows/.env` con la configuración existente, sin mostrar secretos.
3. Reutiliza el proyecto Compose del PostgreSQL `lensegua-postgres`, conservando su volumen.
4. Construye las imágenes y aplica las migraciones pendientes.
5. Conserva cuentas, contraseñas, módulos y estados existentes; inicializa el seed solo si
   la base está completamente vacía. Añade únicamente los borradores del catálogo que falten.
6. Comprueba la conexión a PostgreSQL y abre el navegador.

La primera vez puede tardar varios minutos. Espera a que indique «LENSEGUA listo».
Después puedes cerrar la ventana del iniciador: los contenedores siguen funcionando.

- Portal: http://localhost:8080/
- Administración: http://localhost:8080/admin/login
- Comprobación de base: http://localhost:8080/api/health

También puedes iniciar desde PowerShell:

```powershell
node infra/windows-local.mjs start
```

El inicio habitual reutiliza las imágenes ya construidas. Después de modificar el código,
puedes reconstruirlas con `node infra/windows-local.mjs start --rebuild`.

## Administrador

El correo se toma de la configuración anterior y se muestra al terminar el inicio.
Si olvidaste la contraseña, abre **Recuperar administrador.cmd**. Se genera una contraseña
temporal, se revocan las sesiones anteriores y se obliga a cambiarla al ingresar.
No compartas una captura de esa ventana ni el archivo de configuración.

La primera instalación en una base vacía crea la cuenta con el correo configurado; usa el
mismo acceso de recuperación para obtener una contraseña temporal si no conoces la inicial.

## Detener y respaldar

- **Detener LENSEGUA.cmd** detiene los servicios y conserva los datos.
- **Respaldar LENSEGUA.cmd** crea un dump PostgreSQL, un archivo de multimedia y un manifiesto
  SHA-256 en una carpeta nueva de `backups/`. Ejecútalo con LENSEGUA iniciado. Pausa brevemente
  la web/API y vuelve a iniciar los servicios que estaban funcionando.

La multimedia se conserva en `storage/media` y PostgreSQL en su volumen Docker existente.
No borres esa carpeta, el volumen ni uses `docker compose down -v`. Conserva copias de los
respaldos en otra unidad. La guía de restauración aislada está en `despliegue.md`.

## Configuración y diagnóstico

```powershell
node infra/windows-local.mjs status
```

La configuración de Windows está en `infra/windows/.env`, ignorada por Git y excluida de
las imágenes. No cambies la contraseña PostgreSQL o el nombre del proyecto Compose sobre
una base existente. Si necesitas otro puerto web, detén LENSEGUA, cambia `LOCAL_WEB_PORT`
y vuelve a iniciar.

Si Docker no arranca, abre Docker Desktop, comprueba WSL 2 y vuelve a ejecutar el iniciador.
Si un puerto está ocupado, revisa los servicios que ya lo utilizan. Si falta `node`, instala
Node.js 22 y abre una nueva terminal antes de repetir.

Esta modalidad usa HTTP de loopback y cookies para desarrollo local. Las protecciones de
producción con HTTPS siguen disponibles en el montaje de Linux; no se modificaron para
permitir HTTP público. Para acceder desde otros equipos será necesaria una configuración
específica de red y seguridad, que no forma parte de este inicio local.
