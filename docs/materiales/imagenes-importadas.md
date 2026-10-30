# Imágenes y demostraciones del portal local

El portal muestra imágenes reales de las señas, correspondientes a los materiales públicos
de [Kitsord en LENSEGUA](https://lensegua.com/material-lensegua-kitsord).
No son ilustraciones de manos generadas por IA.

## Resultado en la instalación local

Se incorporaron **52 imágenes y 14 videos**, con **52 lecciones publicadas**:

| Módulo     | Lecciones con imagen visibles |
| ---------- | ----------------------------: |
| Vocales    |                             5 |
| Números    |              10 (del 1 al 10) |
| Abecedario |                            27 |
| Colores    |                            10 |

Los 66 archivos respondieron correctamente desde el almacenamiento local. Las imágenes
se comprobaron con HTTP 200 y los videos con rangos HTTP 206. Los cuatro módulos tienen
portada fotográfica y sus listas de lecciones muestran imágenes. Pasaron las 55 pruebas,
tipos, compilación, lint y formato. El número cero sigue en borrador; no tiene imagen de
otra seña asignada como sustituto.

Se inspeccionó la portada en Chrome de escritorio y se emuló una pantalla móvil de 390 px:
las cuatro portadas cargaron y el ancho del documento fue de 390 px, sin desbordamiento
horizontal. Una segunda importación añadió cero archivos y publicó cero fichas nuevas,
confirmando que los recursos existentes se reutilizan.

Antes de la importación se creó un respaldo. La importación registró cero fallos y la
procedencia de cada recurso quedó en la auditoría. Las muestras visuales A, P, 1 y el
fotograma del color rojo se inspeccionaron para comprobar legibilidad y correspondencia
con las etiquetas originales, sin afirmar una certificación lingüística independiente.

## Incorporación

Se consulta exclusivamente la colección que usa el buscador público de esa página, por
categoría y nombre de seña. No se accede a cuentas ni colecciones de usuarios. Los recursos
deben usar HTTPS y pertenecer al alojamiento de esa fuente; se rechazan otros servidores,
redirecciones y archivos cuya firma binaria no corresponda al tipo esperado.

Las imágenes originales se conservan sin recortar ni invertir. Para una seña con movimiento,
se conserva el video completo y se extrae un fotograma identificado como imagen de
referencia. Esa imagen no sustituye la demostración en movimiento.

Los archivos se guardan en `storage/media` para que el portal local no dependa de cargar
recursos externos durante cada lección. Las tarjetas de módulos y lecciones usan las
imágenes publicadas; los archivos conservan atribución visible y procedencia en auditoría.

La fuente declara acceso gratuito, pero no se identificó una licencia explícita de
redistribución. La incorporación corresponde al uso local solicitado; antes de distribuir
el catálogo o publicar copias en internet se deben aclarar los permisos correspondientes.
La coincidencia con las etiquetas de la fuente no equivale a una certificación lingüística
independiente; sigue siendo conveniente la revisión de un docente competente en LENSEGUA.

## Importación reproducible

La herramienta `apps/api/src/import-public-media.ts` no cambia la base sin `--apply`.
Reutiliza los recursos que ya importó; no borra los archivos existentes ni reactiva fichas
inactivas. `--publish` permite mostrar en el portal las fichas que tienen texto y una imagen
publicada. La operación queda registrada en la bitácora.

Con el montaje Windows iniciado:

```powershell
docker compose --env-file infra/windows/.env -f infra/docker-compose.yml -f infra/compose.windows.yml run --rm maintenance node dist/import-public-media.js --apply --publish
```

La herramienta FFmpeg se incluye en la imagen de mantenimiento, sin añadirla al proceso
que atiende la API. La extracción de fotogramas conserva la orientación del video original.
El número cero no apareció en la fuente consultada y debe permanecer pendiente hasta
incorporar una demostración verificable. No se sustituye por la letra O.
