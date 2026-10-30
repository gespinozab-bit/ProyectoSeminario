# Revisión de LENSEGUA — 28 de octubre de 2026

Actualización: la modalidad elegida es Windows local. El arranque en Docker se preparó y
comprobó en http://localhost:8080/, conservando la base y los 53 borradores. Consulta
[Windows local](windows-local.md). El montaje Linux documentado queda como alternativa futura.

## Estado observado

El proyecto contiene React/Vite, API Express y PostgreSQL con Prisma. Existe panel para
módulos, contenidos y multimedia; autenticación con cookies HttpOnly, roles, permisos,
bloqueo por intentos y auditoría. La API también contiene administración de usuarios.
Esto describe lo implementado en código; las operaciones con datos no se pudieron validar.

## Orden de trabajo para terminar

1. Restaurar el entorno local: iniciar Docker Desktop y PostgreSQL, comprobar migraciones,
   recuperar el administrador y ejecutar las pruebas de integración.
2. Pantallas de usuarios implementadas: creación y edición de cuentas, filtros, paginación,
   roles, estados y contraseñas temporales. Falta validación visual y con PostgreSQL real.
   Consultar [Usuarios y docentes](usuarios-docentes.md).
3. Portal educativo público implementado: inicio, módulos, lecciones, imágenes, videos y
   endpoints públicos que filtran material publicado. Falta validación visual y con la base
   real. Consultar [Portal educativo](portal-educativo.md).
4. Textos y objetivos cargados: 53 lecciones. Se incorporaron 52 imágenes y 14 videos
   de Kitsord/LENSEGUA; 52 lecciones están publicadas y el número cero sigue pendiente.
   Se recomienda revisión lingüística y validación con docentes. Consultar
   [Material educativo](materiales/README.md).
5. Validar accesibilidad y uso con estudiantes/docentes: teclado, contraste, textos
   alternativos, claridad visual y adecuación del material de lengua de señas.
6. Entrega técnica preparada y ensayada con Docker: migraciones desde cero, API/web por
   HTTPS local, respaldo de PostgreSQL y multimedia y restauración comprobada. Faltan servidor,
   dominio y certificado público. Consultar [Validación del despliegue](validacion-despliegue.md).

Evaluaciones, progreso estudiantil y PWA no existen. La arquitectura documentada plantea
estudiantes sin cuentas; confirmar si estas funciones forman parte del alcance antes de
añadirlas. No se encontraron requisitos de aceptación completos en la documentación.

## Verificaciones

- Compilación, comprobación de tipos, ESLint y formato originales: correctos.
- PostgreSQL configurado en localhost:5434: conexión rechazada.
- Docker Compose no pudo iniciarse: motor Docker no disponible y acceso restringido a su configuración.
- Pruebas: no llegaron a ejecutarse por restricciones de lectura al cargar Vitest con esbuild.
- No se confirmó el estado de migraciones ni el acceso administrativo.
- Esta carpeta no contiene repositorio Git; falta control de versiones para la entrega.

## Recuperar administrador

El correo inicial configurado es `admin@lensegua.local`; su existencia en la base no se
pudo confirmar. Las contraseñas se almacenan como hashes y no se pueden leer.
El seed no cambia la contraseña de una cuenta existente.

Después de abrir Docker Desktop, ejecutar desde la raíz:

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
npm.cmd run db:status
npm.cmd run admin:reset -w @lensegua/api -- admin@lensegua.local
npm.cmd run dev
```

La herramienta local añadida genera una contraseña temporal, obliga a cambiarla,
desbloquea los intentos fallidos, revoca sesiones y registra la recuperación en auditoría
dentro de una transacción. Solo acepta cuentas administrativas activas ya existentes.
No se ejecutó contra la base local porque PostgreSQL no estaba disponible.
Entrar en http://localhost:5173/admin/login y cambiar la contraseña temporal.
