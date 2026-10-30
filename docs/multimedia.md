# Gestión multimedia

## Arquitectura

La lógica de negocio depende de la interfaz `StorageProvider`, no del sistema de archivos. La
implementación actual, `LocalStorageProvider`, guarda los binarios en `MEDIA_STORAGE_PATH` con
nombres UUID y valida que toda ruta resuelta permanezca dentro de esa raíz. Una futura
implementación en nube puede sustituir el proveedor sin modificar rutas, Prisma ni el panel.

Los binarios no se guardan en PostgreSQL ni dentro de `src`. `media_assets` almacena tipo, MIME,
tamaño, clave privada, URL administrativa, orden, estado, metadatos accesibles y la marca de
recurso principal. `storageKey` nunca se devuelve al cliente.

## Seguridad y validación

Multer escribe primero en el directorio temporal del sistema y limita cada solicitud a un
archivo de 100 MB. Después se verifican extensión, MIME, tamaño específico y firma binaria:

- JPG/JPEG: `FF D8 FF`; máximo 5 MB.
- PNG: firma PNG de ocho bytes; máximo 5 MB.
- WEBP: contenedor RIFF con marca WEBP; máximo 5 MB.
- MP4: caja `ftyp`; máximo 100 MB.
- WEBM: cabecera EBML; máximo 100 MB.

Los nombres originales nunca forman parte de la ruta final. Las rutas exigen autenticación,
cambio inicial de contraseña completado y permisos `media.read`, `media.create`, `media.update`
o `media.deactivate`. Cada mutación se registra en `audit_logs`.

## Streaming

`GET /api/media/:id/file` responde el archivo completo o interpreta un rango simple
`bytes=inicio-fin`. Para rangos válidos devuelve `206`, `Content-Range`, `Content-Length` y
`Accept-Ranges: bytes`; para rangos inválidos devuelve `416`.

## Persistencia

En desarrollo local se usa `storage/media`, ignorado por Git. Docker Compose declara el volumen
`lensegua_media_data`, listo para montarse en `/app/storage/media` al contenerizar la API. Deben
respaldarse conjuntamente el volumen multimedia y PostgreSQL para conservar consistencia.
