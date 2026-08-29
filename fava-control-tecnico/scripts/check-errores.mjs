/**
 * Ningun codigo de error del servidor puede llegar crudo a una persona.
 *
 * POR QUE EXISTE. El 2026-08-29 un tecnico leyo en pantalla, literalmente:
 *
 *     No se pudo guardar: SEMANA_NO_EDITABLE
 *
 * El servidor tenia 87 codigos y NINGUNO estaba traducido: las 35 pantallas que
 * muestran fallos concatenaban el rotulo «No se pudo guardar» con el identificador
 * interno. Nadie lo noto en meses porque cada pantalla lo hacia por su cuenta y ninguna
 * estaba «mal» — faltaba la capa entera.
 *
 * DOS COMPROBACIONES:
 *
 *   1. Que ningun codigo NUEVO del backend se quede sin mensaje. Es la que importa: el
 *      dia que alguien anada un `throw new ConflictException('LO_QUE_SEA')` este script
 *      se pone rojo y le recuerda que hay que escribir la frase en los tres idiomas.
 *
 *   2. Que ninguna pantalla vuelva a pegar `t.err_save` con una variable. Es la FORMA
 *      exacta del bug, y reaparece sola en cuanto alguien copia una pantalla vieja.
 *
 * Las familias que el servidor arma al vuelo (`${campo}_INVALIDO`, `${campo}_REQUERIDO`,
 * `TRANSICION_INVALIDA_X_A_Y`) no se pueden enumerar —el campo sale de una variable— y
 * las cubren las reglas de sufijo de `errores.ts`. Aqui se dan por buenas.
 *
 * Node puro, cero dependencias, igual que los otros cuatro checks del build.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const BACK = join(RAIZ, 'backend', 'src');
const FRONT = join(RAIZ, 'frontend', 'src');

function* fuentes(dir, ext) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'generated') continue;
    const r = join(dir, e);
    if (statSync(r).isDirectory()) yield* fuentes(r, ext);
    else if (ext.some((x) => e.endsWith(x)) && !e.endsWith('.spec.ts')) yield r;
  }
}

// ── 1. Los codigos del servidor contra el diccionario ──

const LANZA = /new (?:BadRequest|Conflict|NotFound|Forbidden|Unauthorized|UnprocessableEntity|PayloadTooLarge)Exception\(\s*'([A-Z0-9_]+)'/g;

const codigos = new Set();
for (const ruta of fuentes(BACK, ['.ts'])) {
  const src = readFileSync(ruta, 'utf8');
  for (const m of src.matchAll(LANZA)) codigos.add(m[1]);
}

/** Las claves del mapa en espanol: es el que sirve de respaldo para los otros dos. */
const errores = readFileSync(join(FRONT, 'lib', 'errores.ts'), 'utf8');
const bloqueEs = errores.slice(errores.indexOf('const ES:'), errores.indexOf('const IT:'));
const traducidos = new Set([...bloqueEs.matchAll(/^\s{2}([A-Z0-9_]+):/gm)].map((m) => m[1]));

/** Lo que cubren las reglas de sufijo de `textoError`. */
const cubiertoPorRegla = (c) =>
  c.startsWith('TRANSICION_INVALIDA') || /_REQUERID[OA]$/.test(c) || /_INVALID[OA]S?$/.test(c);

const huerfanos = [...codigos].filter((c) => !traducidos.has(c) && !cubiertoPorRegla(c)).sort();

// ── 2. La forma del bug: un rotulo de error pegado a una variable ──
//
// Vigila err_save Y err_load. La primera version solo miraba err_save —la mitad que se
// arreglo pantalla por pantalla— y por eso dejo pasar `ApiState`, que hacia exactamente
// lo mismo con err_load en 13 pantallas de golpe. Un guarda-rail que solo cubre el caso
// que ya viste no es un guarda-rail, es un recordatorio.

const PEGADO = /\{\s*t\.err_(save|load)\s*\}\s*:\s*[{$]|\$\{\s*t\.err_(save|load)\s*\}\s*:/;
const pantallas = [];
for (const ruta of fuentes(FRONT, ['.tsx'])) {
  if (PEGADO.test(readFileSync(ruta, 'utf8'))) {
    pantallas.push(ruta.slice(ruta.indexOf('frontend')));
  }
}

// ── 3. El componente compartido de estado de carga TIENE que traducir ──
//
// `ApiState` sale en 13 pantallas. Si vuelve a pintar el error sin pasarlo por
// `errTexto` son 13 sitios a la vez, y ninguna pantalla se ve «mal» por separado — que
// es justo por lo que estuvo roto sin que nadie lo notara.
const ui = readFileSync(join(FRONT, 'ui.tsx'), 'utf8');
const desde = ui.indexOf('export function ApiState');
const sinTraducir = desde >= 0 && !ui.slice(desde, desde + 600).includes('errTexto(');

// ── El veredicto ──

/**
 * Codigos que NO vienen del backend: los pone `codigoDeError` en client.ts cuando la
 * respuesta no es JSON de la app (el 404 por defecto de Express, una pagina del proxy).
 * Tienen mensaje a proposito y no sobran.
 */
const DEL_CLIENTE = new Set(['RUTA_NO_ENCONTRADA', 'RESPUESTA_INESPERADA', 'ERROR_DE_RED']);

const sobran = [...traducidos].filter((c) => !codigos.has(c) && !DEL_CLIENTE.has(c)).sort();
console.log(
  `${codigos.size} codigos en el backend · ${traducidos.size} con mensaje · ` +
    `${codigos.size - huerfanos.length - [...codigos].filter((c) => traducidos.has(c)).length} por regla de sufijo`,
);

if (sobran.length) {
  // Aviso, no error: un codigo que ya no se lanza no rompe nada, solo estorba.
  console.log(`\nAviso: ${sobran.length} mensaje(s) sin codigo que los use: ${sobran.join(', ')}`);
}

if (huerfanos.length) {
  console.error(`\n${huerfanos.length} codigo(s) del servidor SIN mensaje para una persona:\n`);
  for (const c of huerfanos) console.error(`  ${c}`);
  console.error(
    '\nEscribe la frase en los tres mapas de frontend/src/lib/errores.ts. Sin eso el ' +
      'usuario lee el identificador interno y no sabe que hacer.',
  );
}

if (pantallas.length) {
  console.error(`\n${pantallas.length} pantalla(s) pegan t.err_save a una variable:\n`);
  for (const p of pantallas) console.error(`  ${p}`);
  console.error('\nUsa errTexto(codigo) de useApp(): traduce y nunca deja el codigo a secas.');
}

if (sinTraducir) {
  console.error(
    '\nApiState pinta el error SIN pasarlo por errTexto. Son 13 pantallas de golpe: ' +
      '«No se pudo cargar: TOKEN_INVALIDO» en vez de una frase.',
  );
}

if (huerfanos.length || pantallas.length || sinTraducir) process.exit(1);
