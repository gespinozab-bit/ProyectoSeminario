export interface LessonMaterial {
  slug: string;
  title: string;
  summary: string;
  learningObjective: string;
  content: string;
  mediaBrief: string;
}

export interface ModuleMaterial {
  code: string;
  description: string;
  lessons: LessonMaterial[];
}

// Original introductory literacy activities. These do not describe or certify signs.
// Every lesson remains a draft until its LENSEGUA demonstration is provided and reviewed.
const letters = [
  ['A', 'árbol', 'avión'],
  ['B', 'barco', 'bicicleta'],
  ['C', 'casa', 'conejo'],
  ['D', 'dado', 'delfín'],
  ['E', 'estrella', 'elefante'],
  ['F', 'flor', 'foca'],
  ['G', 'gato', 'gorra'],
  ['H', 'hoja', 'helado'],
  ['I', 'isla', 'iguana'],
  ['J', 'jirafa', 'jabón'],
  ['K', 'kiwi', 'koala'],
  ['L', 'luna', 'lápiz'],
  ['M', 'mesa', 'mariposa'],
  ['N', 'nube', 'nido'],
  ['Ñ', 'ñandú', 'ñame'],
  ['O', 'oso', 'oreja'],
  ['P', 'pelota', 'pato'],
  ['Q', 'queso', 'quetzal'],
  ['R', 'rana', 'rueda'],
  ['S', 'sol', 'silla'],
  ['T', 'taza', 'tortuga'],
  ['U', 'uva', 'uno'],
  ['V', 'vaso', 'vaca'],
  ['W', 'web', 'wifi'],
  ['X', 'xilófono', 'taxi'],
  ['Y', 'yoyo', 'yuca'],
  ['Z', 'zapato', 'zorro'],
] as const;
const slugLetter = (letter: string) => (letter === 'Ñ' ? 'enie' : letter.toLowerCase());
const observation =
  'Mira la demostración de LENSEGUA de esta lección. Observa las manos, su orientación y el movimiento, si lo hay. Pausa y repite el video cuando lo necesites. Practica con tu docente y compara tu realización con el modelo.';
const filming = (topic: string) =>
  `Grabar una demostración de ${topic} en LENSEGUA con una persona competente en esta lengua. Mantener visibles rostro, torso y manos, sin recortes ni inversión horizontal. Incluir una realización a ritmo natural y una repetición pausada. Añadir rótulo legible y descripción textual. Revisar la seña, orientación y movimiento antes de publicarla. No usar una imagen tipográfica como sustituto de la demostración.`;

const vowels = ['A', 'E', 'I', 'O', 'U'];
const vowelLessons: LessonMaterial[] = letters
  .filter(([letter]) => vowels.includes(letter))
  .map(([letter, first, second]) => ({
    slug: `vocal-${slugLetter(letter)}`,
    title: `Vocal ${letter}`,
    summary: `Reconoce ${letter} y ${letter.toLowerCase()} y relaciona la letra con su representación en LENSEGUA.`,
    learningObjective: `Identificar la vocal ${letter} en palabras escritas y practicar su representación con apoyo de un modelo de LENSEGUA revisado.`,
    content: `CONOCE LA VOCAL\nEsta es la vocal ${letter}. En minúscula se escribe ${letter.toLowerCase()}. Observa la letra al inicio de ${first} y ${second}.\n\nOBSERVA Y PRACTICA\n${observation}\n\nBUSCA Y RELACIONA\nEscribe o señala ${first}. Encuentra la vocal ${letter.toLowerCase()} en esa palabra. Elige otra palabra que la contenga y compártela con tu docente. Los ejemplos escritos no son demostraciones de las señas de esos objetos.\n\nCOMPRUEBA LO APRENDIDO\nEntre las tarjetas A, E, I, O y U, elige ${letter}. Después busca su tarjeta minúscula. Mira de nuevo el modelo y practica una vez más.`,
    mediaBrief: filming(`la vocal ${letter}`),
  }));

const numberNames = [
  'cero',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
];
const numberLessons: LessonMaterial[] = numberNames.map((name, number) => ({
  slug: `numero-${number}`,
  title: `Número ${number}: ${name}`,
  summary: `Relaciona el símbolo ${number}, la palabra ${name} y una cantidad.`,
  learningObjective: `Reconocer el número ${number}, representar su cantidad con objetos y practicar su representación con un modelo de LENSEGUA revisado.`,
  content: `CONOCE EL NÚMERO\nEste es el número ${number}. Su nombre escrito es ${name}. ${number === 0 ? 'Una caja sin objetos tiene cero objetos.' : number === 1 ? 'Una sola ficha representa esta cantidad.' : `Una colección de ${number} fichas representa esta cantidad.`}\n\nEXPLORA LA CANTIDAD\n${number === 0 ? 'Coloca tres fichas en una caja. Retíralas todas y comprueba que no quede ninguna. Elige la tarjeta 0 para representar la caja vacía.' : number === 1 ? 'Toma una ficha y colócala sobre la mesa. Señálala y elige la tarjeta 1. Mueve la ficha a otro lugar: sigue siendo una sola ficha.' : `Toma ${number} fichas y colócalas en una fila. Señala cada ficha una sola vez mientras las cuentas. Cambia su distribución y comprueba que la cantidad sigue siendo ${number}.`}\n\nOBSERVA Y PRACTICA\n${observation}\n\nCOMPRUEBA LO APRENDIDO\n${number === 0 ? 'Compara una caja vacía con otra que tenga dos fichas. ¿Cuál corresponde a la tarjeta 0?' : number === 1 ? 'Entre las tarjetas 0 a 10, elige 1. Colócala junto a una sola ficha.' : `Entre las tarjetas 0 a 10, elige ${number}. Colócala junto a la colección de ${number} fichas.`} Pide a tu docente que revise tu elección y tu práctica de la representación en LENSEGUA.`,
  mediaBrief: `${filming(`el número ${number} (${name})`)} Preparar además una imagen con el numeral, su nombre y ${number === 0 ? 'una caja vacía' : number === 1 ? 'un solo elemento' : `exactamente ${number} elementos claramente separados`}.`,
}));

const alphabetLessons: LessonMaterial[] = letters.map(([letter, first, second]) => ({
  slug: `letra-${slugLetter(letter)}`,
  title: `Letra ${letter}`,
  summary: `Explora la letra ${letter}, su forma minúscula y ejemplos escritos.`,
  learningObjective: `Relacionar ${letter} con ${letter.toLowerCase()}, localizarla en palabras escritas y practicar su representación con un modelo de LENSEGUA revisado.`,
  content: `CONOCE LA LETRA\nEsta es la letra ${letter}. Su forma minúscula es ${letter.toLowerCase()}. ${letter === 'X' ? 'Aparece al inicio de xilófono y dentro de taxi.' : `Aparece al inicio de ${first} y ${second}.`}\n\nEXPLORA LAS PALABRAS\nObserva las palabras ${first} y ${second}. Señala la letra ${letter.toLowerCase()} en cada una. ${letter === 'Ñ' ? 'Compara N y Ñ: son letras diferentes. Observa la marca sobre la Ñ.' : `Compara una tarjeta con ${letter} y otra con ${letter.toLowerCase()}. Las dos representan la misma letra escrita.`}\n\nOBSERVA Y PRACTICA\n${observation}\n\nCOMPRUEBA LO APRENDIDO\nBusca ${letter} entre varias tarjetas de letras. Empareja la mayúscula con la minúscula. Después practica su representación mirando el modelo. Los nombres de los objetos sirven para reconocer letras escritas; para aprender las señas de esas palabras necesitas sus demostraciones específicas.`,
  mediaBrief: filming(`la letra ${letter} del alfabeto manual utilizado en el curso`),
}));

const colors = [
  ['rojo', 'roja', 'una tarjeta roja'],
  ['azul', 'azul', 'una tarjeta azul'],
  ['amarillo', 'amarilla', 'una tarjeta amarilla'],
  ['verde', 'verde', 'una tarjeta verde'],
  ['anaranjado', 'anaranjada', 'una tarjeta anaranjada'],
  ['morado', 'morada', 'una tarjeta morada'],
  ['rosado', 'rosada', 'una tarjeta rosada'],
  ['cafe', 'café', 'una tarjeta café'],
  ['negro', 'negra', 'una tarjeta negra'],
  ['blanco', 'blanca', 'una tarjeta blanca'],
] as const;
const colorLessons: LessonMaterial[] = colors.map(([slug, adjective, example]) => {
  const name = slug === 'cafe' ? 'café' : slug;
  return {
    slug: `color-${slug}`,
    title: `Color ${name}`,
    summary: `Identifica el color ${name} con objetos y tarjetas rotuladas.`,
    learningObjective: `Relacionar el nombre escrito ${name} con una muestra de color y practicar su seña con un modelo de LENSEGUA revisado.`,
    content: `CONOCE EL COLOR\nEste color se llama ${name}. Observa ${example}. La palabra escrita ${name} nos ayuda a identificarlo.\n\nBUSCA Y COMPARA\nColoca una tarjeta ${adjective} junto a dos tarjetas de otros colores. Lee sus rótulos y encuentra la que corresponde a ${name}. Si necesitas apoyo para distinguir las muestras, usa las etiquetas y trabaja con tu docente.\n\nOBSERVA Y PRACTICA\n${observation}\n\nCOMPRUEBA LO APRENDIDO\nBusca un objeto de color ${name} en tu entorno y compáralo con la tarjeta. Si no hay uno cerca, usa una muestra preparada. Une el rótulo ${name} con su muestra y practica la seña mirando el modelo. No necesitas responder en voz alta.`,
    mediaBrief: `${filming(`el color ${name}`)} Preparar una muestra de color rotulada «${name}», con borde contrastante; no transmitir la respuesta solo mediante el color.`,
  };
});

export const educationalCatalog: ModuleMaterial[] = [
  {
    code: 'VOCALES',
    description: 'Reconoce las cinco vocales y practica con demostraciones de LENSEGUA.',
    lessons: vowelLessons,
  },
  {
    code: 'NUMEROS',
    description:
      'Explora los números del 0 al 10, sus cantidades y sus representaciones en LENSEGUA.',
    lessons: numberLessons,
  },
  {
    code: 'ABECEDARIO',
    description:
      'Descubre las 27 letras del español y practica con modelos del alfabeto manual del curso.',
    lessons: alphabetLessons,
  },
  {
    code: 'COLORES',
    description: 'Relaciona diez colores con sus nombres escritos y sus señas en LENSEGUA.',
    lessons: colorLessons,
  },
];
