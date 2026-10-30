# Material educativo — revisión del 29 de octubre de 2026

**Actualización visual:** los cuatro módulos ya muestran imágenes de señas. Se incorporaron
52 imágenes y 14 videos de Kitsord/LENSEGUA y se publicaron 52 lecciones en el portal local.
Solo el número cero permanece pendiente. Consulta [Imágenes incorporadas](imagenes-importadas.md).
El resultado inicial sin multimedia que se describe más abajo es anterior a esta incorporación.

Se prepararon 53 fichas originales con descripción, objetivo, actividad guiada y comprobación
de aprendizaje. Son material introductorio de reconocimiento de letras, cantidades y colores
que acompaña las demostraciones de LENSEGUA; no constituye un curso completo de la lengua.

| Módulo     | Alcance                                                                       | Lecciones |
| ---------- | ----------------------------------------------------------------------------- | --------: |
| Vocales    | A, E, I, O, U                                                                 |         5 |
| Números    | 0 a 10                                                                        |        11 |
| Abecedario | 27 letras del español, incluida Ñ                                             |        27 |
| Colores    | Rojo, azul, amarillo, verde, anaranjado, morado, rosado, café, negro y blanco |        10 |

## Archivos de revisión

- [Catálogo con los textos completos](catalogo.md).
- [Fichas para producir y revisar las demostraciones](fichas-multimedia.md).
- [Fuentes de internet verificadas y alcance de la revisión](fuentes-internet.md): videos
  enlazados por CONADI y publicados por Multimedia Conadi; faltan comprobar cobertura y reproducción.

La fuente editable está en `apps/api/src/education/catalog.ts`. El catálogo se redactó para
este proyecto: no se copiaron imágenes, videos ni explicaciones de ejecución de señas.
Como referencia institucional sobre LENSEGUA se consultó
[la sección de CONADI](https://conadi.gob.gt/web/lensegua/). Ese enlace no implica aval
del contenido por CONADI ni certificación lingüística de estas fichas.

## Resultado en la base local

PostgreSQL estuvo disponible durante esta revisión. La carga creó 52 borradores y conservó
la ficha Vocal A existente. Esa ficha tenía únicamente «Aprendamos la vocal A.»; se completó
con el texto, descripción y objetivo del catálogo, guardando la versión anterior en auditoría.
La segunda carga creó cero registros y reconoció las 53 fichas existentes.

Las 53 lecciones continúan en borrador y no tienen multimedia. No se publicaron contenidos
ni se cambiaron los estados de los módulos. Las validaciones automatizadas no certifican
la corrección lingüística de una seña ni la adecuación del material a un grupo concreto.

Se contrastaron los textos, descripciones y objetivos guardados con el catálogo: cero
diferencias en las 53 fichas. Se revisó la concordancia singular/plural de las actividades
numéricas. Pasaron las 44 pruebas disponibles, incluidas las de integración con PostgreSQL,
además de tipos, compilación, lint y formato. Para compilar la web en esta sesión restringida
se usó `vite build --configLoader runner`, debido al acceso denegado del cargador predeterminado.

## Lo que falta para cerrar este paso

1. Revisar textos y nivel de dificultad con el docente responsable y ajustar el alcance
   a la edad, experiencia en lectoescritura y necesidades del grupo.
2. Obtener o grabar demostraciones reales de LENSEGUA. En el abecedario, confirmar el
   inventario y las variantes del alfabeto manual que se enseñará; las 27 letras escritas
   del español no establecen por sí solas ese inventario.
3. Completar las fichas con persona revisora, fecha, observaciones y autorización de uso.
4. Subir las demostraciones desde Multimedia. Añadir rótulos, descripciones y los apoyos
   de accesibilidad que correspondan. No invertir horizontalmente los videos.
5. Comprobar que cada demostración corresponde al título y objetivo. Probar las actividades
   con docentes y estudiantes antes de publicar.

Las comprobaciones pedagógicas de cada ficha son actividades guiadas, sin calificación
automática ni almacenamiento de progreso. No requieren respuesta oral. Las actividades
de colores también usan nombres y etiquetas; la respuesta no debe depender solo del color.

## Cargar y mantener el catálogo

Desde la raíz:

```powershell
# Vista previa de cantidades, sin escribir en PostgreSQL.
npm.cmd run materials:import -w @lensegua/api
# Crea solo los borradores que falten; no reemplaza lecciones existentes.
npm.cmd run materials:import -w @lensegua/api -- --apply
# Regenera los documentos de revisión a partir del catálogo.
npm.cmd run materials:export -w @lensegua/api
npm.cmd exec -- prettier docs/materiales --write
```

La importación usa los cuatro módulos existentes y una transacción. Conserva las lecciones
con la misma clave o título, sus archivos, estados y orden; añade las nuevas al final.
Solo completa la descripción del módulo si está vacía. Los contenidos ya existentes que
se conserven deben compararse con el catálogo y editarse desde el panel cuando corresponda.
La actualización puntual de Vocal A fue una operación de esta revisión, no una regla de
sobrescritura automática de la herramienta.

El campo Objetivo de aprendizaje también puede editarse en el formulario administrativo y
se muestra en la lección pública cuando se publica.
