/**
 * Caza `${'${algo}'}` dentro de una plantilla: una interpolacion que se escribio a si
 * misma como TEXTO en vez de evaluar la variable.
 *
 * POR QUE EXISTE. Paso dos veces el mismo dia, y la segunda llego a produccion:
 *
 *   AND (${'${year}'}::int IS NULL ...)     -> Postgres recibe la cadena "${year}"
 *                                              y responde 22P02. HTTP 500.
 *   const clave = (r, f) => `${'${r}'}|...` -> la clave es SIEMPRE el mismo literal,
 *                                              asi que todas las filas se funden en una.
 *
 * El primero se ve enseguida porque revienta. El SEGUNDO no: compila, no lanza, y
 * devuelve numeros agregados mal. Ese es el que justifica el guarda-rail — un fallo que
 * miente es peor que uno que falla.
 *
 * Sale de generar codigo con scripts: una plantilla de Python que escribe TypeScript no
 * distingue entre «pon aqui la variable» y «escribe estos caracteres». TypeScript
 * tampoco se queja: `${'${year}'}` es una expresion valida que produce una cadena.
 *
 * Node puro, cero dependencias, mismo trato que los otros tres checks del build.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', 'backend', 'src');

/** `src/generated` es del generador de Prisma y sus ejemplos usan esa forma a proposito. */
const IGNORAR = new Set(['generated', 'node_modules']);

/** `${'...'}` o `${"..."}`: una interpolacion cuyo unico contenido es una cadena. */
const SOSPECHA = /\$\{\s*(['"])[^'"]*\$\{[^}]*\}[^'"]*\1\s*\}/g;

function* fuentes(dir) {
  for (const entrada of readdirSync(dir)) {
    if (IGNORAR.has(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) yield* fuentes(ruta);
    else if (entrada.endsWith('.ts') && !entrada.endsWith('.spec.ts')) yield ruta;
  }
}

const hallazgos = [];
let archivos = 0;

for (const ruta of fuentes(RAIZ)) {
  archivos += 1;
  const src = readFileSync(ruta, 'utf8');
  for (const m of src.matchAll(SOSPECHA)) {
    const linea = src.slice(0, m.index).split('\n').length;
    const rel = ruta.slice(ruta.indexOf('backend'));
    hallazgos.push(
      `${rel}:${linea}  ${m[0]}  -> la variable no se evalua: llega el TEXTO. ` +
        'Quita las comillas de dentro.',
    );
  }
}

for (const h of hallazgos) console.error(h);
console.log(`${archivos - hallazgos.length}/${archivos} archivos limpios`);

if (hallazgos.length) {
  console.error(
    `\n${hallazgos.length} interpolacion(es) escritas como texto. En SQL es un 22P02; ` +
      'en una clave de mapa no falla y agrega mal, que es peor.',
  );
  process.exit(1);
}
