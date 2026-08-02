/**
 * Guard: ningún icono pedido por nombre puede faltar.
 *
 *     node scripts/check-iconos.mjs
 *
 * `hi('x')` y `ICON['x']` se indexan con una CADENA, así que TypeScript no ve nada raro
 * en un nombre que no existe. Un `hi('doc')` —que vive en ICON, no en HERO— se coló a
 * producción y tumbaba la pantalla entera al pintar el botón. `svg()` ya devuelve null
 * en vez de reventar, pero un icono que no se dibuja sigue siendo un fallo silencioso.
 * Esto lo convierte en un fallo de build.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'frontend', 'src');
const iconos = readFileSync(join(SRC, 'icons.tsx'), 'utf8');

/** Las claves de un mapa `const NOMBRE: Record<...> = { clave: [...], ... }`. */
const clavesDe = (mapa) => {
  const cuerpo = iconos.split(new RegExp(`(?:const|export const) ${mapa}\\b[^{]*{`))[1].split('\n};')[0];
  return new Set([...cuerpo.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]));
};
const HERO = clavesDe('HERO');
const ICON = clavesDe('ICON');

const archivos = [];
(function recorrer(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (/\.tsx?$/.test(p)) archivos.push(p);
  }
})(SRC);

const fallos = [];
for (const f of archivos) {
  const src = readFileSync(f, 'utf8');
  const linea = (i) => src.slice(0, i).split('\n').length;

  for (const m of src.matchAll(/\bhi\(\s*'([^']+)'/g))
    if (!HERO.has(m[1])) fallos.push(`${f}:${linea(m.index)}  hi('${m[1]}') no está en HERO`);

  for (const m of src.matchAll(/\bICON(?:\.([A-Za-z0-9]+)|\[\s*'([^']+)'\s*\])/g)) {
    const n = m[1] ?? m[2];
    if (!ICON.has(n)) fallos.push(`${f}:${linea(m.index)}  ICON.${n} no existe`);
  }

  // El menú lateral: `mk(clave, ruta, 'icono')` termina en `ICON[icono]`.
  for (const m of src.matchAll(/\bmk\(\s*'[^']+',\s*'[^']+',\s*'([^']+)'/g))
    if (!ICON.has(m[1])) fallos.push(`${f}:${linea(m.index)}  mk(..., '${m[1]}') no está en ICON`);
}

if (fallos.length) {
  console.error('Iconos que no existen:\n' + fallos.map((x) => '  ' + x).join('\n'));
  process.exit(1);
}
console.log(`${archivos.length} archivos limpios · ${HERO.size} iconos HERO, ${ICON.size} ICON`);
