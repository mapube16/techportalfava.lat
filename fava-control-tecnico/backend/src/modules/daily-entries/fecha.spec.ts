/**
 * BIT-02: «la fecha es DATE local del sitio — el mismo día debe verse igual con el
 * dispositivo en Bogotá, Roma o São Paulo».
 *
 * `TZ=x jest` NO funciona en este repo: VERIFICADO que deja `process.env.TZ` en
 * `undefined` y el offset en 300 (Bogotá), así que una suite «de 4 husos» correría
 * cuatro veces en Bogotá y saldría verde sin probar nada. Se asigna `process.env.TZ`
 * en RUNTIME, que sí funciona y además admite varios cambios dentro del mismo proceso
 * (medido: los cuatro offsets de abajo salen del propio motor de este repo).
 *
 * Verificación en rojo registrada en 03-01-SUMMARY: sustituir el cuerpo de `aDate`
 * por `new Date(+y, +m - 1, +d)` tumba el round-trip a día calendario en EXACTAMENTE
 * Roma y Kiritimati, y lo deja verde en Bogotá y São Paulo — que es el hallazgo 3 de
 * la investigación: el bug es invisible en la máquina del dev (Bogotá) y en Railway
 * (UTC), los dos únicos sitios donde alguien lo miraría.
 */
import { aDate, aTexto, ventana } from './fecha';

const HUSOS: [zona: string, offsetEsperado: number][] = [
  ['America/Bogota', 300],
  ['Europe/Rome', -120],
  ['America/Sao_Paulo', 180],
  ['Pacific/Kiritimati', -840],
];

/** Basura que un cliente puede mandar y que NO puede llegar a la columna. */
const INVALIDAS: [entrada: unknown, porque: string][] = [
  ['2026-02-30', 'el 30 de febrero: pasa el regex y `new Date` lo convierte en marzo EN SILENCIO'],
  ['2026-02-29', '2026 no es bisiesto'],
  ['14/07/2026', 'formato del usuario, no del contrato'],
  ['2026-7-4', 'sin ceros a la izquierda: el parser legacy se lo traga'],
  ['', 'cadena vacía'],
  ['2026-07-14T00:00:00Z', 'un instante no es un día calendario'],
  [null, 'el cuerpo del PUT puede traer null'],
  [20260714, 'ni un número'],
];

describe.each(HUSOS)('proceso en %s', (zona, offsetEsperado) => {
  beforeAll(() => {
    process.env.TZ = zona;
  });
  afterAll(() => {
    process.env.TZ = 'America/Bogota';
  });

  it('el huso del proceso cambió de verdad', () => {
    // Instante FIJO, no `new Date()`: con «ahora» el caso de Roma cambiaría de -120 a
    // -60 entre julio y diciembre y la suite sería estacional (verde en invierno, roja
    // en verano, y nadie sabría cuál de las dos era la verdad).
    expect(new Date('2026-07-14T12:00:00Z').getTimezoneOffset()).toBe(offsetEsperado);
  });

  it('aDate deja el Date en MEDIANOCHE UTC, que es lo que Prisma escribe en un @db.Date', () => {
    expect(aDate('2026-07-14').toISOString()).toBe('2026-07-14T00:00:00.000Z');
  });

  it('aDate/aTexto son round-trip: el día calendario no se mueve', () => {
    expect(aTexto(aDate('2026-07-14'))).toBe('2026-07-14');
  });

  it('el round-trip aguanta el cambio de año y el 29 de febrero de un bisiesto', () => {
    expect(aTexto(aDate('2026-01-01'))).toBe('2026-01-01');
    expect(aTexto(aDate('2025-12-31'))).toBe('2025-12-31');
    expect(aTexto(aDate('2024-02-29'))).toBe('2024-02-29');
  });

  it.each(INVALIDAS)('aDate(%p) es FECHA_INVALIDA — %s', (entrada) => {
    expect(() => aDate(entrada)).toThrow('FECHA_INVALIDA');
  });

  it('ventana: el 1 de septiembre a medianoche UTC', () => {
    // El techo es el día 1 (+14 h sigue siendo el 1). El suelo NO es 2026-08-01: a las
    // 00:00 UTC del 1 de septiembre un técnico en UTC-12 todavía está a 31 de agosto,
    // y para él «el mes anterior» es JULIO. La ventana del servidor tiene que contener
    // también la suya. Ver el contrato de `ventana` en fecha.ts.
    expect(ventana(new Date('2026-09-01T00:00:00Z'))).toEqual({
      min: '2026-07-01',
      max: '2026-09-01',
    });
  });

  it('ventana: el cruce de año no se descubre en producción', () => {
    expect(ventana(new Date('2026-01-05T00:00:00Z')).min).toBe('2025-12-01');
  });

  it('ventana: el techo cubre a un técnico en UTC+14 que ya está en el día siguiente', () => {
    // 23:00 UTC del 14 => en Kiritimati (UTC+14) son las 13:00 del 15. Manda '2026-07-15'
    // y tiene razón; el servidor no puede llamarlo FECHA_FUTURA.
    expect(ventana(new Date('2026-07-14T23:00:00Z')).max).toBe('2026-07-15');
  });

  it('ventana: la del servidor CONTIENE a la del cliente en los dos extremos del planeta', () => {
    // La propiedad entera, no un caso suelto. Se elige el peor instante posible: las
    // 06:00 UTC del día 1, cuando conviven técnicos en dos MESES distintos.
    const ahora = new Date('2026-09-01T06:00:00Z');
    const { min, max } = ventana(ahora);

    /** La regla del CLIENTE, reescrita aquí a propósito: max = su hoy, min = el día 1 del mes ANTERIOR a su hoy. */
    const sueloCliente = (hoy: string) => {
      const y = Number(hoy.slice(0, 4));
      const m = Number(hoy.slice(5, 7));
      return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
    };

    for (const offsetHoras of [-12, -5, 0, 2, 14]) {
      const hoy = new Date(ahora.getTime() + offsetHoras * 3_600_000).toISOString().slice(0, 10);
      // El offset viaja en la aserción: si cae, el mensaje dice en qué extremo del planeta.
      expect([offsetHoras, hoy, hoy <= max]).toEqual([offsetHoras, hoy, true]);
      expect([offsetHoras, hoy, min <= sueloCliente(hoy)]).toEqual([offsetHoras, hoy, true]);
    }
  });
});
