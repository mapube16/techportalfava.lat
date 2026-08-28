/**
 * BIT-02, lado servidor: «la fecha es DATE local del sitio — nunca `new Date()` en el
 * servidor para la fecha de trabajo».
 *
 * Existe porque este bug concreto **no se ve en ninguno de los dos entornos donde
 * alguien lo miraria**. Medido contra el motor:
 *
 *   new Date('2026-07-14')  -> columna 2026-07-14 en Bogota, Roma, Sao Paulo, Kiritimati
 *   new Date(2026, 6, 14)   -> columna 2026-07-14 en BOGOTA (la maquina del dev)
 *                              columna 2026-07-14 en UTC    (Railway)
 *                              columna 2026-07-13 en ROMA y KIRITIMATI   <<< el bug
 *
 * O sea: el dia del tecnico italiano se guarda un dia atras, la Nota Semanal sale con
 * un dia menos, el KPI mensual mueve dias de mes, y no hay ningun sintoma hasta que un
 * italiano reclama. Si llega firmado a un cliente, PITFALLS lo clasifica HIGH: regenerar
 * una nota firmada exige reabrirla y re-firmarla.
 *
 * La suite de husos lo caza ejecutando; esto lo caza sin ejecutar nada, y va DENTRO de
 * `npm run build`, que es con lo que Railway despliega: reintroducir el bug tumba el
 * deploy en el primer paso en vez de llegar a produccion.
 *
 * Node puro, cero dependencias, mismo trato que `check-no-free-text.mjs`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los directorios vigilados. No es todo `backend/src` a proposito: hoy
 * `weekly-notes.service.ts` tiene un `new Date()` legitimo sin marcar, y ampliarlo
 * entero pondria el build en rojo por una limpieza que no toca aqui. Se anade el
 * directorio de cada modulo que calcule fechas de trabajo.
 *
 * `common/notifications` esta dentro porque el reloj del cron decide DE QUE SEMANA
 * habla cada aviso: un getter local ahi manda el recordatorio de la semana equivocada
 * al este de UTC, o sea en Italia, que es justo donde estan los tecnicos.
 */
const RAICES = ['modules/daily-entries', 'common/notifications'].map((r) =>
  join(import.meta.dirname, '..', 'backend', 'src', ...r.split('/')),
);

/**
 * Todos los `.ts` del modulo de bitacora MENOS los `*.spec.ts`: una suite de husos
 * necesita `getTimezoneOffset` y comparar instantes para demostrar que el huso cambio
 * de verdad, y los specs no se despliegan. Todo lo demas del modulo se escanea, incluida
 * la sonda `fecha.probe.ts` — que pasa limpia sin necesitar excepcion.
 */
const esFuente = (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts');

/**
 * Los getters locales. Leen un `@db.Date` (que Prisma devuelve a MEDIANOCHE UTC) en el
 * huso del proceso: `getDate()` sobre el 2026-07-14 da 13 en Bogota y 14 en Roma.
 */
const PROHIBIDOS = [
  [/\.getDate\s*\(/g, '.getDate() lee un @db.Date en el huso del proceso: da 13 o 14 segun donde corra. Usa aTexto()'],
  [/\.getMonth\s*\(/g, '.getMonth() lee un @db.Date en el huso del proceso: cambia de mes en los limites. Usa aTexto()'],
  [/\.getFullYear\s*\(/g, '.getFullYear() lee un @db.Date en el huso del proceso: cambia de anho el 31/12. Usa aTexto()'],
  [/\.toLocaleDateString\s*\(/g, '.toLocaleDateString() es lo mismo con formato encima. Usa aTexto()'],
];

const linea = (src, i) => src.slice(0, i).split('\n').length;

const textoDeLinea = (src, i) => src.split('\n')[linea(src, i) - 1] ?? '';

/**
 * Una linea se salta por dos motivos, y solo por esos dos:
 *
 *  - Es prosa. La cabecera de `fecha.ts` DOCUMENTA el bug escribiendo `new Date(2026,
 *    6, 14)` y `fila.date.getDate()`, que es exactamente lo que hay que escribir para
 *    que quien lo lea sepa que evitar. Un guarda-rail que se dispara con su propia
 *    documentacion se acaba desactivando.
 *  - Lleva `// fecha-ok: <motivo>`. Escape unico y explicito, con el motivo escrito al
 *    lado: es lo que permite el `new Date()` de `ventana()` y obliga a que cualquier
 *    excepcion futura se justifique en el diff, donde alguien la ve.
 */
const seSalta = (texto) => /^\s*(\*|\/\/|\/\*)/.test(texto) || texto.includes('// fecha-ok:');

for (const raiz of RAICES) {
  if (!existsSync(raiz)) {
    console.error(`No existe ${raiz}: el modulo se movio y este guarda-rail dejo de vigilar nada.`);
    process.exit(1);
  }
}

// `[directorio, archivo]` para que el mensaje de error diga cual de los dos modulos es.
const ARCHIVOS = RAICES.flatMap((raiz) =>
  readdirSync(raiz)
    .filter(esFuente)
    .sort()
    .map((f) => [raiz, f]),
);
const hallazgos = [];

for (const [raiz, nombre] of ARCHIVOS) {
  const rel = `${raiz.split(/[\\/]/).pop()}/${nombre}`;
  const src = readFileSync(join(raiz, nombre), 'utf8');

  /**
   * ponytail: `[^)]*` no es un parser — corta en el primer `)`, asi que
   * `new Date(f.getTime() + 1)` se lee como el argumento `f.getTime(` y cuenta como
   * UNO, que es la respuesta correcta. Los argumentos de este dominio son literales y
   * variables simples; el modo de fallo del naive es un falso NEGATIVO, nunca una
   * alarma falsa. El dia que haga falta precision, la salida es un parser de verdad.
   */
  for (const m of src.matchAll(/new\s+Date\s*\(([^)]*)\)/g)) {
    const texto = textoDeLinea(src, m.index);
    if (seSalta(texto)) continue;

    const args = m[1].trim();

    if (args === '')
      hallazgos.push(
        `${rel}:${linea(src, m.index)}  new Date() sin argumentos: el «hoy» del servidor no es el dia del tecnico. Si de verdad hace falta un instante, marca la linea con // fecha-ok: <motivo>`,
      );
    else if (args.split(',').length >= 2)
      hallazgos.push(
        `${rel}:${linea(src, m.index)}  new Date(a, b, ...) con componentes locales: ESCRIBE EL DIA ANTERIOR al este de UTC y es correcto en Bogota (dev) y en UTC (Railway). Usa aDate('YYYY-MM-DD')`,
      );
  }

  for (const [re, motivo] of PROHIBIDOS)
    for (const m of src.matchAll(re)) {
      const texto = textoDeLinea(src, m.index);
      if (seSalta(texto)) continue;
      hallazgos.push(`${rel}:${linea(src, m.index)}  ${motivo}`);
    }
}

for (const h of hallazgos) console.error(h);

const sucios = new Set(hallazgos.map((h) => h.split(':')[0])).size;
console.log(`${ARCHIVOS.length - sucios}/${ARCHIVOS.length} archivos limpios`);

if (hallazgos.length) {
  console.error(
    `\n${hallazgos.length} hallazgo(s). El script es el contrato: la fecha de trabajo sale de fecha.ts, no de un Date suelto.`,
  );
  process.exit(1);
}
