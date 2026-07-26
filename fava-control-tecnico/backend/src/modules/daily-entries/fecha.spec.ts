/**
 * BIT-02: «la fecha es DATE local del sitio — el mismo día debe verse igual con el
 * dispositivo en Bogotá, Roma o São Paulo».
 *
 * Las medidas se toman en un proceso de Node de verdad (`fecha.probe.ts`) porque
 * DENTRO de jest el huso NO se puede cambiar: jest sustituye `global.process` por una
 * copia con su propio `env`, así que `process.env.TZ = 'Europe/Rome'` guarda el valor
 * pero no resetea la caché de zona de V8 —eso lo hace el setter del `env` real— y los
 * cuatro husos siguen midiendo 300 (Bogotá). Está medido, no supuesto: el motivo largo
 * y los dos experimentos están escritos en la cabecera de `fecha.probe.ts`.
 *
 * Ese es el Pitfall 1 de la investigación una capa más abajo de donde se buscaba: la
 * suite habría corrido cuatro veces en Bogotá y habría salido verde sin probar nada.
 * Lo destapó la aserción de offset, que por eso va PRIMERO y dentro de cada bloque.
 *
 * Verificación en rojo registrada en 03-01-SUMMARY: sustituir el cuerpo de `aDate` por
 * `new Date(+a, +m - 1, +d)` tumba el round-trip a día calendario en EXACTAMENTE Roma
 * y Kiritimati, y lo deja verde en Bogotá y São Paulo — que es el hallazgo 3 de la
 * investigación: el bug es invisible en la máquina del dev (Bogotá) y en Railway (UTC),
 * los dos únicos sitios donde alguien lo miraría.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { HUSOS, INVALIDAS, ROUND_TRIP, type Medida } from './fecha.probe';

/**
 * Un solo hijo para los cuatro husos: en Node a secas `process.env.TZ` sí se puede
 * cambiar varias veces dentro del mismo proceso (verificado). `tsx` ya está instalado
 * como devDependency del workspace — cero dependencias nuevas.
 */
const MEDIDAS: Record<string, Medida> = JSON.parse(
  execFileSync(process.execPath, ['--import', 'tsx', join(__dirname, 'fecha.probe.ts')], {
    env: { ...process.env, HUSOS_PROBE: '1' },
    encoding: 'utf8',
  }),
);

describe.each(HUSOS)('proceso en %s', (zona, offsetEsperado) => {
  const m = MEDIDAS[zona];

  it('el huso del proceso cambió de verdad', () => {
    // Sin esto, los 4 bloques medirían Bogotá y pasarían sin probar nada.
    expect(m.offset).toBe(offsetEsperado);
  });

  it('aDate deja el Date en MEDIANOCHE UTC, que es lo que Prisma escribe en un @db.Date', () => {
    expect(m.iso).toBe('2026-07-14T00:00:00.000Z');
  });

  it('aDate/aTexto son round-trip: el día calendario no se mueve', () => {
    expect(m.roundTrip).toEqual(ROUND_TRIP);
  });

  it.each(INVALIDAS.map((par, i) => [...par, i] as const))(
    'aDate(%p) es FECHA_INVALIDA — %s',
    (_entrada, _porque, i) => {
      expect(m.invalidas[i]).toBe('FECHA_INVALIDA');
    },
  );

  it('ventana: el 1 de septiembre a medianoche UTC', () => {
    // El techo es el día 1 (+14 h sigue siendo el 1). El suelo NO es 2026-08-01: a las
    // 00:00 UTC del 1 de septiembre un técnico en UTC-12 todavía está a 31 de agosto,
    // y para él «el mes anterior» es JULIO. La ventana del servidor tiene que contener
    // también la suya. El contrato completo está en fecha.ts.
    expect(m.ventanaDia1).toEqual({ min: '2026-07-01', max: '2026-09-01' });
  });

  it('ventana: el cruce de año no se descubre en producción', () => {
    expect(m.minCruceAnho).toBe('2025-12-01');
  });

  it('ventana: el techo cubre a un técnico en UTC+14 que ya está en el día siguiente', () => {
    // 23:00 UTC del 14 => en Kiritimati (UTC+14) son las 13:00 del 15. Manda
    // '2026-07-15' y tiene razón; el servidor no puede llamarlo FECHA_FUTURA.
    expect(m.maxUtcMas14).toBe('2026-07-15');
  });

  it('ventana: la del servidor CONTIENE a la del cliente en los dos extremos del planeta', () => {
    // La propiedad entera, no un caso suelto, en el peor instante posible: las 06:00
    // UTC del día 1, cuando conviven técnicos en dos MESES distintos. El offset viaja
    // en la aserción: si cae, el mensaje dice en qué extremo del planeta.
    const fuera = m.contencion.filter((c) => !c.bajoElTecho || !c.sobreElSuelo);
    expect(fuera).toEqual([]);
  });
});
