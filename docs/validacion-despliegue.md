# Validación de base de datos y despliegue — 29 de octubre de 2026

## Resultado

El montaje para Linux con Docker fue construido y probado en un proyecto Compose aislado,
`lensegua-rehearsal`, con puertos de web enlazados únicamente a `127.0.0.1`. No se publicó
un dominio ni se configuró un servidor externo. La base local de desarrollo se conservó.

| Comprobación                     | Resultado                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Estado de PostgreSQL local       | Tres migraciones aplicadas, esquema Prisma válido                                   |
| Pruebas automatizadas            | 53 aprobadas, incluidas integraciones con la base real                              |
| Tipos, ESLint y formato          | Aprobados                                                                           |
| Imágenes API, web y herramientas | Construidas con Node 22, Prisma 7 y Vite 7                                          |
| Instalación desde base vacía     | Tres migraciones aplicadas por `migrate deploy`                                     |
| Seed e importación en ensayo     | Roles, permisos, administrador temporal y 53 borradores                             |
| Arranque                         | API y PostgreSQL saludables; migrador terminó con código 0                          |
| Web y rutas internas por HTTPS   | HTTP 200 a través de Caddy dentro del ensayo                                        |
| Cookies de acceso                | Secure, HttpOnly y SameSite=Strict verificados                                      |
| Gestión de cuentas               | Creación, búsqueda, roles, estados, cambio y recuperación de contraseña verificados |
| Separación de permisos           | Cuenta docente sin acceso a gestión de usuarios                                     |
| Retirada del contenido público   | Base real: ocultar módulo o volver lección a borrador impide acceder al archivo     |
| Persistencia multimedia          | Escritura por el usuario de la API verificada                                       |
| Respaldo PostgreSQL              | Dump creado y restaurado en una base nueva con 53 lecciones                         |
| Respaldo multimedia              | Archivo de prueba recuperado y su contenido comprobado                              |
| Integridad del respaldo          | SHA-256 de dump y archivo multimedia coinciden con el manifiesto                    |
| Auditoría de dependencias npm    | Cero vulnerabilidades reportadas después de actualizar                              |

La prueba de multimedia usa un archivo de comprobación, no 53 demostraciones de señas.
La prueba HTTPS usa el certificado local de Caddy y omite su validación solo en el cliente
del ensayo. No certifica el dominio futuro ni sustituye la revisión visual en navegador.
`npm audit` revisa dependencias npm; no constituye un análisis completo del servidor o de
los paquetes del sistema operativo de las imágenes.

## Archivos entregados

- `Dockerfile` y `.dockerignore`: construcción separada de API, web y herramientas,
  excluyendo secretos, archivos locales y respaldos del contexto.
- `infra/compose.production.yml`: migraciones antes de la API, persistencia y límites de logs.
- `infra/Caddyfile`: web SPA, caché de assets y proxy a `/api` con HTTPS.
- `infra/production/.env.example`: plantilla de producción sin credenciales reales.
- `infra/backup.mjs`: respaldo conjunto de base y multimedia con manifiesto de integridad.
- `infra/smoke-rehearsal.mjs`: prueba de instalación aislada con cuentas temporales.
- [Guía de despliegue, respaldo y restauración](despliegue.md).

Se corrigió el empaquetado de dependencias instaladas dentro del workspace de la API.
Se actualizaron dependencias vulnerables dentro de sus versiones compatibles y se unificó
Vite 7 para que el plugin de React y las herramientas de pruebas compartan tipos compatibles.
La API valida secretos distintos, configuración HTTPS y número explícito de proxies confiables.

El respaldo del ensayo se conserva en `backups/ensayo-20261029/`, excluido de Git y de las
imágenes Docker. Contiene exclusivamente los datos del ensayo. Su archivo de configuración
local también está ignorado y no se copiaron sus secretos al informe.

## Pendientes para publicar

1. Elegir el servidor Linux y el dominio.
2. Configurar DNS, puertos y secretos reales siguiendo la guía.
3. Probar el certificado público sin omitir validación y recorrer las pantallas en navegador.
4. Completar e integrar las demostraciones de LENSEGUA y revisar su uso antes de publicar lecciones.
5. Establecer respaldos externos y probar la restauración con el operador del servidor.

Este resultado valida la preparación técnica; el material educativo sigue en borrador.
