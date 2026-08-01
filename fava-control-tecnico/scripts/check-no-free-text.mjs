/**
 * Criterio 4 del roadmap, lado frontend: «concepto, rol y moneda solo se eligen de
 * listas cerradas — ninguno acepta texto libre en ninguna pantalla».
 *
 * Existe porque el frontend NO tiene runner de tests: la unica forma de que esta regla
 * se compruebe en cada build es un script de repo. El motor de la base ya cierra el
 * dominio (`test/no-free-text.e2e-spec.ts`); esto cierra la tercera capa, la UI.
 *
 * Node puro, cero dependencias: la regla es «no metas librerias por 60 lineas».
 *
 * Que NO comprueba: que las pantallas ya llamen al API. Eso lo hace el plan 02-06.
 * Este script comprueba lo que debe ser cierto ANTES y DESPUES del cutover — que
 * ninguno de esos tres datos salga de un `<input>` de texto y que no se lean de los
 * mocks. Un `<select>`, botones tipo chip o un `<datalist>` de opcion cerrada valen.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', 'frontend', 'src');

/** Las 7 pantallas del cutover de la Fase 2. */
const ARCHIVOS = [
  'screens/Projects.tsx',
  'screens/ProjectDetail.tsx',
  'screens/Techs.tsx',
  'screens/Users.tsx',
  'screens/Config.tsx',
  'components/NewProjectModal.tsx',
  'components/InviteUserModal.tsx',
  // Anadidas en 03-05/03-06: son las dos pantallas de la captura, donde el tecnico
  // elige proyecto, maquina y concepto. Si alguna vuelve a una lista cableada, el
  // «sin texto libre» del criterio 4 se rompe justo por donde entran los datos.
  'screens/Week.tsx',
  'components/LogDayDrawer.tsx',
];

/**
 * Los tres datos de eleccion cerrada, con sus grafias reales y sufijos habituales
 * (`roleTypeId`, `concept_code`, `currencyCode`). Los limites a los lados evitan los
 * falsos positivos que hay de verdad en estos archivos: `cursor`, `currentTarget` y
 * las etiquetas `t.proj_cur` (una etiqueta no es un binding).
 */
const CERRADO =
  /(?<![\w$])(concept|role_?type|currenc(?:y|ies)|cur)(?:s|es|_?(?:id|code|name)s?)?(?![\w$])/i;

/** Identificadores que no pueden entrar por `import` en estas 7 pantallas. */
const IMPORTS_VETADOS = [
  [
    /import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/i18n['"]/g,
    ['CONCEPTS'],
    'las etiquetas de concepto vienen del API, no de la constante CONCEPTS de i18n (el mapa codigo->color si puede seguir viniendo de i18n)',
  ],
  [
    /import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/data['"]/g,
    ['MACHINES', 'CURRENCIES'],
    'MACHINES/CURRENCIES son los mocks de data.ts que esta fase retira',
  ],
];

const linea = (src, i) => src.slice(0, i).split('\n').length;

/**
 * El bloque de la etiqueta `<input ... >`, que puede ocupar varias lineas.
 *
 * Corta en el primer `>` que no venga de un `=>` (los handlers JSX estan llenos de
 * flechas). ponytail: un `>` dentro de una cadena o una comparacion trunca la etiqueta
 * antes de tiempo, lo que solo puede producir un falso NEGATIVO, nunca una alarma
 * falsa. Si algun dia hace falta precision, la salida es un parser de verdad.
 */
function etiquetaInput(src, desde) {
  const resto = src.slice(desde);
  const fin = /(?<!=)>/.exec(resto);
  return resto.slice(0, fin ? fin.index + 1 : 400);
}

const hallazgos = [];

for (const rel of ARCHIVOS) {
  const src = readFileSync(join(RAIZ, rel), 'utf8');

  for (const m of src.matchAll(/<input\b/g)) {
    const etiqueta = etiquetaInput(src, m.index);
    const dato = CERRADO.exec(etiqueta);
    if (dato)
      hallazgos.push(
        `${rel}:${linea(src, m.index)}  <input> alimenta «${dato[0]}»: concepto, rol y moneda se ELIGEN (select, chips o datalist cerrado), no se escriben`,
      );
  }

  for (const [re, vetados, motivo] of IMPORTS_VETADOS) {
    for (const m of src.matchAll(re)) {
      const nombres = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]);
      for (const v of vetados)
        if (nombres.includes(v)) hallazgos.push(`${rel}:${linea(src, m.index)}  import ${v}: ${motivo}`);
    }
  }
}

for (const h of hallazgos) console.error(h);

const sucios = new Set(hallazgos.map((h) => h.split(':')[0])).size;
console.log(`${ARCHIVOS.length - sucios}/${ARCHIVOS.length} archivos limpios`);

if (hallazgos.length) {
  console.error(
    `\n${hallazgos.length} hallazgo(s). El script es el contrato: se adapta la pantalla, no la regla.`,
  );
  process.exit(1);
}
