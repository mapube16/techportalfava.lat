import { BadRequestException } from '@nestjs/common';

/**
 * Las DOS unicas conversiones del backend entre 'YYYY-MM-DD' y el Date que Prisma
 * necesita para una columna @db.Date. Fuera de aqui, la fecha de trabajo es un string.
 *
 * VERIFICADO contra el motor con el proceso en Bogota | Midway | Kiritimati | Roma |
 * Sao Paulo:
 *   new Date('2026-07-14')   -> columna 2026-07-14 en los CINCO
 *   new Date(2026, 6, 14)    -> columna 2026-07-13 en Roma y Kiritimati   <<< el bug
 *   fila.date.toISOString()  -> 2026-07-14T00:00:00.000Z en los cinco
 *   fila.date.getDate()      -> 13 o 14 segun el huso del proceso         <<< el bug
 *
 * Lo que hace caro a ese bug es donde NO se ve: `new Date(y, m-1, d)` escribe el dia
 * correcto en Bogota (la maquina del dev) Y en UTC (Railway). Solo falla al este de
 * UTC, o sea en Italia, que es donde estan los tecnicos. Lo cazan la suite de husos
 * (fecha.spec.ts) y el guarda-rail del build (scripts/check-fecha-servidor.mjs).
 *
 * OJO: en el CLIENTE la regla es la CONTRARIA (frontend/src/lib/fecha.ts). Alli el dia
 * que importa es el del calendario del dispositivo y `toISOString()` es el bug.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const HORA_MS = 3_600_000;

/**
 * 'YYYY-MM-DD' -> Date a medianoche UTC. Es la UNICA entrada legitima a la columna.
 *
 * Acepta `unknown` porque lo que llega es el cuerpo de un PUT: un `null`, un numero o
 * un instante ISO completo tienen que morir aqui, no mas adentro.
 */
export function aDate(s: unknown): Date {
  if (typeof s !== 'string' || !ISO.test(s)) throw new BadRequestException('FECHA_INVALIDA');

  const d = new Date(s); // date-only ISO => UTC por especificacion

  if (Number.isNaN(d.getTime())) throw new BadRequestException('FECHA_INVALIDA');

  // El round-trip es lo unico que atrapa '2026-02-30'. MEDIDO en este runtime: no da
  // Invalid Date, da el 2 de marzo — Prisma lo escribiria en la columna sin rechistar
  // y el dia de trabajo de un tecnico acabaria en otro mes.
  if (d.toISOString().slice(0, 10) !== s) throw new BadRequestException('FECHA_INVALIDA');

  return d;
}

/** Date (medianoche UTC, tal y como lo devuelve un @db.Date) -> 'YYYY-MM-DD'. */
export const aTexto = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Ventana de registro, con TOLERANCIA DE HUSO en vez de una zona configurada.
 *
 *   max = dia de (ahora + 14 h)
 *   min = dia 1 del mes ANTERIOR al dia de (ahora - 12 h)
 *
 * Los offsets reales van de UTC-12 a UTC+14: con +14 h para el techo y -12 h para el
 * suelo la ventana del servidor CONTIENE siempre a la del cliente, sin tabla de husos
 * y sin projects.timezone. El coste es que un cliente malicioso puede escribir 1 dia
 * en el futuro; el beneficio es que ningun tecnico legitimo queda bloqueado.
 *
 * Las dos tolerancias importan de verdad el dia 1 de cada mes, que es el peor dia para
 * la adopcion: a las 00:00 UTC del 1 de septiembre conviven tecnicos que estan a 31 de
 * agosto (UTC-12) y a 1 de septiembre (UTC+14), y «el mes anterior» es JULIO para unos
 * y AGOSTO para otros. Por eso el suelo de ese instante es 2026-07-01 y no 2026-08-01:
 * la regla del cliente («mes en curso y anterior») es la estrecha, y la del servidor
 * tiene que envolverla.
 *
 * Todo es aritmetica sobre STRINGS: ni un getMonth() ni un setMonth(), que leerian el
 * huso del proceso. Este es el UNICO `new Date()` sin argumentos legitimo del modulo,
 * y su resultado NUNCA se escribe en daily_entries.date.
 */
export function ventana(
  ahora: Date = new Date(), // fecha-ok: el "ahora" de la ventana, nunca la fecha de trabajo
): { min: string; max: string } {
  const max = new Date(ahora.getTime() + 14 * HORA_MS).toISOString().slice(0, 10);
  const suelo = new Date(ahora.getTime() - 12 * HORA_MS).toISOString().slice(0, 10);

  const anho = Number(suelo.slice(0, 4));
  const mes = Number(suelo.slice(5, 7));
  const [a, m] = mes === 1 ? [anho - 1, 12] : [anho, mes - 1];

  return { min: `${a}-${String(m).padStart(2, '0')}-01`, max };
}
