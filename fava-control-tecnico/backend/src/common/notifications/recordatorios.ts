import type { PrismaClient } from '../../generated/prisma/client';
import { aDate, sumarDias } from '../../modules/daily-entries/fecha';
import { type Aviso, alcanzable, enlaceApp } from './notifications.service';

/**
 * Los dos recordatorios programados: «tu semana esta sin enviar» al tecnico, y el
 * resumen de los lunes a los admins.
 *
 * Las consultas viven aqui y el cableado en `scripts/notificar.ts` para que el guarda-rail
 * `check-fecha-servidor.mjs` las vigile: el script es solo cableado y no calcula fechas.
 */

/** Lo que la consulta trae de cada tecnico. Estructural para poder testear sin base. */
export interface TecnicoConUsuario {
  id: string;
  fullName: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    lang: string;
    isActive: boolean;
  } | null;
}

/** Una fila del `groupBy` de jornadas: cuantas hay de cada estado por tecnico. */
export interface GrupoDias {
  technicianId: string;
  status: string;
  _count: { _all: number };
}

export interface Faltantes {
  /** No enviaron Y se les puede escribir. */
  avisables: TecnicoConUsuario[];
  /** No enviaron y NO se les puede escribir: sin usuario, inactivo o `@pendiente.invalid`. */
  inalcanzables: TecnicoConUsuario[];
}

/**
 * Quien no envio la semana. Funcion pura: es donde estan todas las trampas y por eso
 * se prueba sin base de datos.
 *
 * EL CRITERIO, derivado de lo que hacen `enviarSemana` y `transicionar`:
 *
 *     sin enviar  <=>  dias en 'draft' > 0   O   no hay ningun dia
 *
 * `enviarSemana` saca TODAS las jornadas de la semana de 'draft' (a 'submitted', o a
 * 'approved' las que no tienen proyecto), y `reopen` las devuelve a 'draft'. Ese unico
 * criterio resuelve de golpe los tres casos que se escapan al mirar `weekly_notes`:
 *
 *   - Semana entera de dias sin proyecto: nunca genera nota, pero al enviarla queda en
 *     'approved'. Mirando notas pareceria «sin enviar» para siempre; aqui no falta.
 *   - Semana reabierta: tiene nota, pero sus dias volvieron a 'draft' y hay que
 *     reenviarla. Mirando notas pareceria enviada; aqui SI falta, que es lo correcto.
 *   - Semana con cero jornadas: no puede enviarse (`enviarSemana` lanza SEMANA_VACIA),
 *     asi que es el caso mas urgente y cae en el mismo cubo.
 *
 * Por eso no se consulta `weekly_notes` en ningun sitio de este archivo — y de paso se
 * esquiva que `updatedAt` no signifique «cuando se envio».
 */
export function faltantes(tecnicos: TecnicoConUsuario[], grupos: GrupoDias[]): Faltantes {
  const porTecnico = new Map<string, { draft: number; total: number }>();
  for (const g of grupos) {
    const acc = porTecnico.get(g.technicianId) ?? { draft: 0, total: 0 };
    acc.total += g._count._all;
    if (g.status === 'draft') acc.draft += g._count._all;
    porTecnico.set(g.technicianId, acc);
  }

  const sin = tecnicos.filter((t) => {
    const c = porTecnico.get(t.id) ?? { draft: 0, total: 0 };
    return c.draft > 0 || c.total === 0;
  });

  return {
    avisables: sin.filter((t) => alcanzable(t.user)),
    // No se descartan: se cuentan y se NOMBRAN en el resumen del lunes. Hoy casi todos
    // los tecnicos historicos tienen un `@pendiente.invalid` inactivo, asi que sin esto
    // el sistema mandaria dos correos y pareceria que va bien.
    inalcanzables: sin.filter((t) => !alcanzable(t.user)),
  };
}

/**
 * Lo que el cron necesita de Prisma: las tres delegaciones y nada mas.
 *
 * `Pick` del cliente generado y NO una interfaz escrita a mano. Lo intente al reves y
 * no compila: las firmas de Prisma son genericas (`findMany<T extends Args>`) y una
 * version simplificada con `args: unknown` no es asignable desde el cliente real. Con
 * `Pick` valen los dos llamadores — el `PrismaClient` del script y el `tx` de una
 * transaccion, que conserva esas mismas delegaciones.
 */
export type ClienteLectura = Pick<PrismaClient, 'technician' | 'dailyEntry' | 'user'>;

/**
 * Lee quien no envio la semana que empieza en `lunes`.
 *
 * OJO — quien llame a esto TIENE que haber fijado `app.is_admin = 'on'` en la
 * transaccion. `daily_entries` tiene politica `de_self` con ENABLE + FORCE, y el cron
 * conecta como `fava_app` (NOBYPASSRLS) sin peticion, asi que sin la GUC
 * `current_setting('app.is_admin', TRUE)` sale NULL, la politica no casa y el groupBy
 * devuelve CERO FILAS SIN ERROR. El recordatorio «funcionaria» sin mandar nada, y como
 * `technicians` y `users` si se leen (sus politicas no dependen de la GUC), el fallo
 * ademas parece verosimil. Lo cubre `notifications.e2e-spec.ts`.
 */
export async function leerFaltantes(c: ClienteLectura, lunes: string): Promise<Faltantes> {
  const domingo = sumarDias(lunes, 6);

  const tecnicos = await c.technician.findMany({
    where: { isActive: true },
    select: {
      id: true,
      fullName: true,
      // Relacion opcional: un tecnico SIN usuario tiene que seguir apareciendo para
      // poder contarlo como inalcanzable, no desaparecer del resultado.
      user: { select: { id: true, email: true, displayName: true, lang: true, isActive: true } },
    },
    orderBy: { fullName: 'asc' },
  });

  const grupos = await c.dailyEntry.groupBy({
    by: ['technicianId', 'status'],
    where: { date: { gte: aDate(lunes), lte: aDate(domingo) } },
    _count: { _all: true },
  });

  return faltantes(tecnicos, grupos);
}

/** Los avisos a los tecnicos que no enviaron. `ronda` distingue el del viernes del del domingo. */
export function avisosSemanaSinEnviar(f: Faltantes, lunes: string, ronda: 'vie' | 'dom'): Aviso[] {
  return f.avisables.map((t) => ({
    kind: 'week_missing' as const,
    dedupeKey: `week_missing:${t.id}:${lunes}:${ronda}`,
    para: {
      userId: t.user!.id,
      email: t.user!.email,
      displayName: t.user!.displayName,
      lang: t.user!.lang,
    },
    datos: { semana: lunes, enlace: enlaceApp('/') },
    entity: 'technician',
    entityId: t.id,
  }));
}

/**
 * UN correo por admin, no uno por tecnico que falto: el admin quiere el panorama.
 *
 * Los destinatarios salen de `users`, no de una variable de entorno: una lista de
 * correos en el entorno se desincroniza el dia que se nombre a otro admin.
 */
export async function avisosResumenAdmins(
  c: ClienteLectura,
  f: Faltantes,
  lunes: string,
): Promise<Aviso[]> {
  if (!f.avisables.length && !f.inalcanzables.length) return [];

  const admins = await c.user.findMany({
    where: { isActive: true, roles: { hasSome: ['A', 'S'] } },
    select: { id: true, email: true, displayName: true, lang: true, isActive: true },
  });

  const lista = f.avisables.map((t) => t.fullName);
  const inalcanzables = f.inalcanzables.map((t) => t.fullName);

  return admins.filter((a) => alcanzable(a)).map((a) => ({
    kind: 'admin_digest' as const,
    dedupeKey: `admin_digest:${lunes}:${a.id}`,
    para: { userId: a.id, email: a.email, displayName: a.displayName, lang: a.lang },
    datos: { semana: lunes, lista, inalcanzables, enlace: enlaceApp('/') },
  }));
}
