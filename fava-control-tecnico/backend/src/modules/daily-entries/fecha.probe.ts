/**
 * Sonda de husos de `fecha.ts`. La ejecuta `fecha.spec.ts` en un proceso de NODE de
 * verdad y devuelve las medidas por stdout como JSON; las aserciones se quedan en jest.
 *
 * POR QUE existe este rodeo, medido en este repo y no supuesto:
 *
 *   1. `TZ=x jest` no llega al proceso: `process.env.TZ` sale `undefined`.
 *   2. `process.env.TZ = zona` en runtime SI funciona en Node a secas (los cuatro
 *      offsets de abajo salen de este motor), pero **NO dentro de jest**: jest sustituye
 *      `global.process` por una COPIA con su propio `env`, asi que la asignacion guarda
 *      el valor —`process.env.TZ` responde 'Europe/Rome'— y el huso NO cambia: Node
 *      resetea la cache de zona de V8 desde el setter del `env` REAL, y ese setter no
 *      se ejecuta. Medido: los 4 husos daban offset 300 (Bogota) dentro de jest.
 *
 * O sea que la receta «obvia» produce una suite de 4 husos que corre 4 veces en Bogota
 * y sale verde sin probar nada — que es justo el Pitfall 1 de la investigacion, una
 * capa mas abajo de donde se buscaba. La asercion de offset DENTRO de cada bloque es
 * lo que lo destapo.
 *
 * Un proceso hijo con `TZ` en su entorno no tiene ninguna de las dos pegas. Basta UNO:
 * en Node a secas el huso si se puede cambiar varias veces dentro del mismo proceso.
 *
 * No exporta nada que use la app: es codigo de prueba que vive junto a lo que prueba.
 * Pasa el guarda-rail `check:fecha-servidor` sin excepciones — usa `getTimezoneOffset`
 * (que lee el huso a proposito) e instantes fijos, nunca `new Date()` ni getters locales.
 */
import { aDate, aTexto, ventana } from './fecha';

/** Los 4 husos y su offset REAL en un instante fijo de julio (medido en este motor). */
export const HUSOS: [zona: string, offsetEsperado: number][] = [
  ['America/Bogota', 300],
  ['Europe/Rome', -120],
  ['America/Sao_Paulo', 180],
  ['Pacific/Kiritimati', -840],
];

/** Basura que un cliente puede mandar y que NO puede llegar a la columna. */
export const INVALIDAS: [entrada: unknown, porque: string][] = [
  ['2026-02-30', 'el 30 de febrero: pasa el regex y `new Date` lo convierte en MARZO en silencio'],
  ['2026-02-29', '2026 no es bisiesto'],
  ['14/07/2026', 'formato del usuario, no del contrato'],
  ['2026-7-4', 'sin ceros a la izquierda: el parser legacy se lo traga'],
  ['', 'cadena vacia'],
  ['2026-07-14T00:00:00Z', 'un instante no es un dia calendario'],
  [null, 'el cuerpo del PUT puede traer null'],
  [20260714, 'ni un numero'],
];

/** Dias que tienen que sobrevivir al round-trip en cualquier huso. */
export const ROUND_TRIP = ['2026-07-14', '2026-01-01', '2025-12-31', '2024-02-29'];

/** Offsets de los dos extremos del planeta, en horas, para la prueba de contencion. */
export const OFFSETS_REALES = [-12, -5, 0, 2, 14];

/** El instante peor: el dia 1, cuando conviven tecnicos en dos MESES distintos. */
const DIA_1 = '2026-09-01T06:00:00Z';

export interface Medida {
  offset: number;
  iso: string;
  roundTrip: string[];
  invalidas: string[];
  ventanaDia1: { min: string; max: string };
  minCruceAnho: string;
  maxUtcMas14: string;
  contencion: { offsetHoras: number; hoy: string; bajoElTecho: boolean; sobreElSuelo: boolean }[];
}

/** La regla del CLIENTE, reescrita aqui: min = dia 1 del mes ANTERIOR a SU hoy. */
const sueloCliente = (hoy: string): string => {
  const a = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7));
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
};

function medir(): Medida {
  const ahora = new Date(DIA_1);
  const { min, max } = ventana(ahora);

  return {
    // Instante FIJO, no `new Date()`: con «ahora» el caso de Roma cambiaria de -120 a
    // -60 entre julio y diciembre y la suite seria estacional.
    offset: new Date('2026-07-14T12:00:00Z').getTimezoneOffset(),
    iso: aDate('2026-07-14').toISOString(),
    roundTrip: ROUND_TRIP.map((s) => aTexto(aDate(s))),
    invalidas: INVALIDAS.map(([entrada]) => {
      try {
        aDate(entrada);
        return 'NO LANZO';
      } catch (e) {
        return (e as Error).message;
      }
    }),
    ventanaDia1: ventana(new Date('2026-09-01T00:00:00Z')),
    minCruceAnho: ventana(new Date('2026-01-05T00:00:00Z')).min,
    maxUtcMas14: ventana(new Date('2026-07-14T23:00:00Z')).max,
    contencion: OFFSETS_REALES.map((offsetHoras) => {
      const hoy = new Date(ahora.getTime() + offsetHoras * 3_600_000).toISOString().slice(0, 10);
      return {
        offsetHoras,
        hoy,
        bajoElTecho: hoy <= max,
        sobreElSuelo: min <= sueloCliente(hoy),
      };
    }),
  };
}

/**
 * Solo cuando la lanza el hijo. Bajo jest este fichero se IMPORTA (por `HUSOS` y
 * `INVALIDAS`, que asi no se duplican a los dos lados de la frontera de proceso) y
 * no puede tener efectos.
 */
if (process.env.HUSOS_PROBE === '1') {
  const medidas: Record<string, Medida> = {};
  for (const [zona] of HUSOS) {
    process.env.TZ = zona;
    medidas[zona] = medir();
  }
  process.stdout.write(JSON.stringify(medidas));
}
