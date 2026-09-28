import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConceptCode, Phase } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { EDITABLES } from '../../common/estados';
import { aDate, aTexto, lunesDe, ventana } from './fecha';

/**
 * El `select` ES el contrato (doctrina de 02-05). Lo devuelven IGUAL el `GET` de la
 * semana y el `PUT` del dia: la grilla sustituye la fila que acaba de guardar sin un
 * refetch, igual que el `PUT` de sold-days devuelve el `delta` recalculado.
 *
 * `project.name` y `machineModel.code` viajan denormalizados y no por comodidad: un
 * proyecto cerrado no sale del selector (`listarParaTecnico` filtra activos) pero sus
 * dias SI se ven, y sin el nombre en la fila se pintarian en blanco.
 *
 * `updatedAt` es lo unico contra lo que `enConflicto()` del borrador local (03-02)
 * puede comparar su `savedAt`: sin el, la deteccion de conflicto no existe.
 */
const FILA = {
  date: true,
  projectId: true,
  orderId: true,
  machineModelId: true,
  conceptCode: true,
  inFactory: true,
  dayNote: true,
  phase: true,
  description: true,
  status: true,
  updatedAt: true,
  project: { select: { name: true } },
  order: { select: { label: true, commessaShort: true } },
  // BIT-10: las maquinas ADICIONALES del dia. La principal sigue siendo `order`.
  extraOrders: { select: { order: { select: { id: true, label: true } } } },
  machineModel: { select: { code: true } },
} as const;

/**
 * Rango maximo del `GET`: sin techo, un `from=2020-01-01` se trae la tabla entera.
 *
 * 42 = la rejilla de la bitacora mensual (6 semanas de 7 dias). Con 30 no cabia: un
 * mes con sus dias de relleno se pedia en dos llamadas y la pantalla parpadeaba al
 * pintarse por mitades. Es el mismo numero que `DIAS_MAX` del controlador —lo que se
 * puede leer de una vez es lo que se puede escribir de una vez— y sigue acotando la
 * consulta a un mes largo.
 */
const RANGO_MAX_DIAS = 42;

const DIA_MS = 86_400_000;

/**
 * Lo que BIT-01 captura. El servidor calcula todo lo demas.
 *
 * `orderId` es EL campo que la Fase 2.1 anadio y el que justifica el proyecto: dice a
 * que maquina contratada fue el dia. Sin el, alguien tiene que repartir a mano los 151
 * dias de un tecnico entre dos maquinas, que es lo que pasa hoy en el Excel.
 *
 * `machineModelId` sigue existiendo pero NO lo escribe la captura: es solo para el
 * historico de la Fase 6, que trae la maquina como texto y sin orden.
 */
export interface Jornada {
  projectId: string | null;
  orderId: string | null;
  conceptCode: ConceptCode | null;
  phase: Phase | null;
  inFactory: boolean;
  description: string | null;
  /** La columna NOTA del papel: horario, o algo que Andrea deba saber de ese dia. */
  dayNote: string | null;
  /**
   * BIT-10 — las maquinas ADICIONALES del dia, ademas de `orderId`.
   *
   * `undefined` significa «no toques lo que hay» (un PATCH parcial); una lista, aunque
   * sea vacia, REEMPLAZA la seleccion entera. Sin esa distincion no habria forma de
   * dejar un dia con una sola maquina despues de haber marcado tres.
   */
  extraOrderIds?: string[];
}

interface Cruda {
  date: Date;
  projectId: string | null;
  orderId: string | null;
  machineModelId: string | null;
  conceptCode: ConceptCode | null;
  phase: Phase | null;
  inFactory: boolean;
  description: string | null;
  dayNote: string | null;
  status: string;
  updatedAt: Date;
  project: { name: string } | null;
  order: { label: string; commessaShort: string | null } | null;
  extraOrders: { order: { id: string; label: string } }[];
  machineModel: { code: string } | null;
}

const plana = (f: Cruda) => ({
  date: aTexto(f.date),
  projectId: f.projectId,
  projectName: f.project?.name ?? null,
  orderId: f.orderId,
  orderLabel: f.order?.label ?? null,
  commessaShort: f.order?.commessaShort ?? null,
  // BIT-10: solo ids y etiquetas — es lo que la pantalla pinta y lo que devuelve.
  extraOrders: f.extraOrders.map((x) => x.order),
  // Respaldo del historico: las jornadas migradas del Excel traen modelo pero no orden.
  machineCode: f.order?.label ?? f.machineModel?.code ?? null,
  conceptCode: f.conceptCode,
  phase: f.phase,
  inFactory: f.inFactory,
  description: f.description,
  dayNote: f.dayNote,
  status: f.status,
  updatedAt: f.updatedAt.toISOString(),
});

/** Quien guarda en nombre del tecnico. Solo lo pasa la ruta de admin. */
export interface Admin {
  id: string;
  name: string;
}

/**
 * El estado con el que queda un dia que guarda LA ADMIN, segun la nota de esa semana y
 * ese proyecto. Pura, para probarla sin base de datos.
 *
 * - Aprobada o enviada: no se toca. Lo aprobado se desaprueba primero (`reopen`); lo
 *   enviado lo firmo el tecnico y se devuelve o se aprueba, no se reescribe por detras.
 * - Borrador o devuelta: el dia hereda el estado; la cierra el tecnico o la admin (`close`).
 * - Sin nota: aprobado directo. Es «agregar a mano» — la decision de Andrea.
 *
 * Se aplica a la nota del proyecto NUEVO y a la del ANTERIOR si el dia cambia de
 * proyecto: sacar un dia de una nota aprobada es tan grave como meterlo.
 */
export function estadoAdmin(notas: ({ status: string } | null)[]): string {
  for (const n of notas) {
    if (n?.status === 'approved') throw new ConflictException('NOTA_APROBADA_DESAPRUEBA');
    if (n?.status === 'submitted') throw new ConflictException('NOTA_EN_REVISION');
  }
  return notas[0]?.status ?? 'approved';
}

@Injectable()
export class DailyEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * PRIMERA puerta de los tres endpoints, antes que la forma de la fecha y que la del
   * cuerpo: sin vinculo no hay nada que hacer.
   *
   * El `technicianId` sale SIEMPRE de `req.user`, que es de donde sale la GUC
   * `app.technician_id`, y JAMAS del cliente. Con el vinculo a null la GUC vale `''`,
   * `NULLIF(…,'')::uuid` es NULL y la politica `de_self` filtra en SILENCIO: el `GET`
   * devolveria `[]` y el `INSERT` un 42501 crudo. Las dos cosas le dicen al tecnico que
   * la app le borro el trabajo.
   */
  tecnicoDe(actor: UserModel): string {
    if (!actor.technicianId) throw new ConflictException('USUARIO_SIN_TECNICO');
    return actor.technicianId;
  }

  /**
   * La semana (o cualquier rango de hasta 31 dias) del PROPIO tecnico. La ventana
   * viaja con los datos para que cliente y servidor no deriven: el cliente pinta
   * bloqueado lo que caiga fuera en vez de calcularlo por su cuenta.
   */
  async semana(technicianId: string, from: unknown, to: unknown) {
    if (typeof from !== 'string' || typeof to !== 'string')
      throw new BadRequestException('RANGO_INVALIDO');

    const desde = aDate(from);
    const hasta = aDate(to);
    const dias = (hasta.getTime() - desde.getTime()) / DIA_MS;
    if (dias < 0 || dias > RANGO_MAX_DIAS) throw new BadRequestException('RANGO_INVALIDO');

    const filas = await this.prisma.client.dailyEntry.findMany({
      where: { technicianId, date: { gte: desde, lte: hasta } },
      select: FILA,
      orderBy: { date: 'asc' },
    });

    const { min, max } = ventana();
    return { minDate: min, maxDate: max, entries: filas.map(plana) };
  }

  /**
   * PUT del dia. Idempotente por CLAVE NATURAL, no por cabecera:
   *  - `UNIQUE(technician_id, date)` existe desde `20260725220221_init`
   *  - VERIFICADO: 8 upserts concurrentes sobre esta clave con la fila inexistente ->
   *    8 respuestas OK, 1 fila, cero P2002 (Prisma emite INSERT ... ON CONFLICT).
   *
   * OJO: la ruta rapida se pierde EN SILENCIO si `create`/`update` llevan escrituras
   * ANIDADAS. Por eso van IDs escalares planos y NO `{ project: { connect: ... } }`.
   * Y no hay salida: un P2002 dentro de la $transaction del RlsInterceptor la deja
   * abortada (verificado: P2039 al cerrar), asi que no se puede capturar y reintentar.
   */
  /**
   * La misma jornada en VARIOS dias. Se apoya en `guardar` una vez por fecha en vez de
   * componer un upsert masivo: asi la validacion de ventana, la de orden-pertenece-al-
   * proyecto y el bloqueo BIT-05 son EXACTAMENTE los mismos que en el guardado de uno.
   * Dos caminos con reglas parecidas es como se acaba pudiendo escribir por la puerta
   * de atras lo que la principal prohibe.
   */
  async guardarVarios(
    technicianId: string,
    dias: { date: string; description: string | null }[],
    comun: Jornada,
    admin?: Admin,
  ) {
    // UN rastro por peticion, no 42: lo que se audita es «la admin pinto estos dias
    // asi», y la lista de fechas lo dice entero. El `before` por dia solo lo deja el
    // PUT de un dia, que es cuando se corrige uno concreto.
    const varios = dias.length > 1;
    const escritas: Awaited<ReturnType<DailyEntriesService['guardar']>>[] = [];
    let primera: string | null = null;
    for (const d of dias) {
      const { id, fila } = await this.escribir(technicianId, d.date, { ...comun, description: d.description }, admin, !varios);
      primera ??= id;
      escritas.push(fila);
    }
    if (admin && varios)
      await this.audit.registrar({
        actorId: admin.id,
        actorName: admin.name,
        entity: 'daily_entry',
        entityId: primera!,
        action: 'update',
        after: { technicianId, dates: dias.map((d) => d.date), ...comun, status: escritas[0].status },
      });
    return escritas;
  }

  async guardar(technicianId: string, fecha: string, datos: Jornada, admin?: Admin) {
    return (await this.escribir(technicianId, fecha, datos, admin, true)).fila;
  }

  /** El PUT de verdad. Devuelve el `id` aparte porque la fila publica (`plana`) no lo lleva. */
  private async escribir(technicianId: string, fecha: string, datos: Jornada, admin: Admin | undefined, auditar: boolean) {
    const date = aDate(fecha);

    // BIT-05: enviado = solo lectura. Se comprueba el estado ACTUAL de la fila, no el
    // de su nota: son el mismo dato (`weekly-notes.service.ts` propaga uno al otro) y
    // preguntarle a la nota exigiria derivar su semana aqui, que es donde empiezan las
    // dos verdades sobre si un dia se puede tocar.
    //
    // LA ADMIN NO PASA POR AQUI: a ella la gobierna la nota (`estadoAdmin`), que es la
    // que dice si lo que hay debajo esta firmado o no. `FILA` entera y no `{status}`
    // porque el suyo deja `before` en el audit_log.
    const actual = await this.prisma.client.dailyEntry.findUnique({
      where: { technicianId_date: { technicianId, date } },
      select: FILA,
    });
    if (!admin && actual && !EDITABLES.includes(actual.status))
      throw new ConflictException('JORNADA_BLOQUEADA');

    /**
     * La ficha del tecnico, para dos cosas a la vez (una sola consulta):
     *
     * 1. EL LIBRE REMUNERADO ES SOLO DE INTERNOS. Regla dictada por Andrea
     *    (2026-08-30): al externo no se le pagan los libres — su dia libre es NR, no LR.
     *    Va en el servidor y no solo en la pantalla: la pantalla esconde el boton, pero
     *    el dato que factura dias pagados no puede depender de un boton escondido.
     *
     * 2. EL ROL CON EL QUE TRABAJO ESE DIA. `role_type_id` existe en la tabla desde el
     *    principio —el historico del Excel lo trae, y 5 de los 14 tecnicos tienen mas
     *    de un cargo— pero la captura NUNCA lo escribia: las jornadas nuevas entraban
     *    con NULL. Como la consulta de vendido/ejecutado hace INNER JOIN con
     *    `role_types` (las filas de la matriz salen del catalogo de roles), esas
     *    jornadas quedaban FUERA del ejecutado sin que nada fallara: el tecnico
     *    registraba su dia, la app se lo mostraba, y el KPI seguia en cero.
     */
    const tec = await this.prisma.client.technician.findUnique({
      where: { id: technicianId },
      select: { employmentType: true, roleTypeId: true },
    });

    /**
     * LA FASE. La captura no la pregunta (manda `phase: null`), y sin fase el dia no
     * entraba en la tabla «Por fase» de los KPIs: lo unico que se veia ejecutado era el
     * historico del Excel. Regla, en este orden:
     *  1. la que mande el cliente, si manda una;
     *  2. la que el dia YA tenia — AUNQUE sea ninguna — si sigue en el mismo proyecto:
     *     editar la descripcion de un dia de montaje no lo pasa a collaudo porque el
     *     proyecto haya avanzado, y corregir un dia viejo sin fase no le inventa la de hoy;
     *  3. si el dia es NUEVO o cambia de proyecto, la fase EN CURSO del proyecto
     *     (`projects.current_phase`, la mueve Andrea).
     * Sin proyecto no hay fase: un libre no es montaje ni collaudo.
     */
    let phase: Phase | null = datos.phase;
    if (!phase && datos.projectId) {
      if (actual?.projectId === datos.projectId) phase = actual.phase;
      else
        phase =
          (await this.prisma.client.project.findUnique({
            where: { id: datos.projectId },
            select: { currentPhase: true },
          }))?.currentPhase ?? null;
    }
    if (datos.conceptCode === 'LR' && tec?.employmentType === 'EXTERNO')
      throw new BadRequestException('LIBRE_REMUNERADO_SOLO_INTERNOS');

    // «Otro» sin decir QUE fue es la celda que nadie sabe leer seis meses despues.
    // El cajon ya obliga a la descripcion en pantalla, pero un comodin del catalogo
    // no puede depender de eso: la regla vive aqui, como la del LR de arriba.
    if (datos.conceptCode === 'OTRO' && !datos.description)
      throw new BadRequestException('OTRO_SIN_DESCRIPCION');

    // La orden tiene que ser DEL proyecto que se declara. El FK solo garantiza que
    // existe, no que sea de este proyecto: sin esta comprobacion un dia de JAV podria
    // apuntar a una maquina de Lucchetti y el vendido/ejecutado saldria descuadrado
    // sin que nada fallase.
    // BIT-10: las extra pasan por la MISMA comprobacion que la principal, en una sola
    // consulta. La principal no cuenta como extra: se descarta antes para que marcarla
    // dos veces no sea un error que el tecnico no entiende.
    const { extraOrderIds, ...resto } = datos;
    const campos = { ...resto, phase: datos.projectId ? phase : null };
    const extras = [...new Set(extraOrderIds ?? [])].filter((id) => id !== datos.orderId);
    if (extras.length) {
      const ordenes = await this.prisma.client.order.findMany({
        where: { id: { in: extras } },
        select: { id: true, projectId: true },
      });
      if (ordenes.length !== extras.length) throw new BadRequestException('ORDEN_INEXISTENTE');
      if (ordenes.some((o) => o.projectId !== datos.projectId))
        throw new BadRequestException('ORDEN_DE_OTRO_PROYECTO');
    }

    if (datos.orderId) {
      const orden = await this.prisma.client.order.findUnique({
        where: { id: datos.orderId },
        select: { projectId: true },
      });
      if (!orden) throw new BadRequestException('ORDEN_INEXISTENTE');
      if (orden.projectId !== datos.projectId) throw new BadRequestException('ORDEN_DE_OTRO_PROYECTO');
    }

    /**
     * El estado lo pone la NOTA cuando guarda la admin. Se miran la del proyecto nuevo
     * y la del anterior (si cambia): ver `estadoAdmin`. Sin nota y con proyecto, la
     * nota se crea aprobada aqui mismo — es lo que deja documento (PDF sin firmas,
     * como las historicas) de un dia que el tecnico nunca envio.
     */
    let status: string | undefined;
    if (admin) {
      const c = this.prisma.client;
      const weekStart = aDate(lunesDe(fecha));
      const proyectos = [...new Set([datos.projectId, actual?.projectId].filter((x): x is string => Boolean(x)))];
      const notas = proyectos.length
        ? await c.weeklyNote.findMany({
            where: { technicianId, weekStart, projectId: { in: proyectos } },
            select: { projectId: true, status: true },
          })
        : [];
      const notaDe = (p: string | null) => (p ? (notas.find((n) => n.projectId === p) ?? null) : null);
      status = estadoAdmin([notaDe(datos.projectId), notaDe(actual?.projectId ?? null)]);

      if (datos.projectId && !notaDe(datos.projectId)) {
        const nota = await c.weeklyNote.create({
          data: { technicianId, weekStart, projectId: datos.projectId, status: 'approved', roleTypeId: tec?.roleTypeId },
          select: { id: true },
        });
        await this.audit.registrar({
          actorId: admin.id,
          actorName: admin.name,
          entity: 'weekly_note',
          entityId: nota.id,
          action: 'approve',
          after: { status: 'approved', weekStart: lunesDe(fecha), projectId: datos.projectId },
          reason: 'CARGA_ADMIN',
        });
      }
    }

    // El rol se sella al CREAR y no se toca al editar: es el cargo con el que se
    // trabajo ese dia, no el que el tecnico tenga hoy en su ficha. Si mañana le cambian
    // el cargo, la historia no se reescribe — que es justo para lo que existe la columna.
    const fila = await this.prisma.client.dailyEntry.upsert({
      where: { technicianId_date: { technicianId, date } },
      create: { technicianId, date, status: status ?? 'draft', roleTypeId: tec?.roleTypeId ?? null, ...campos },
      update: { ...campos, ...(status ? { status } : {}) },
      select: { id: true },
    });

    if (admin && auditar)
      await this.audit.registrar({
        actorId: admin.id,
        actorName: admin.name,
        entity: 'daily_entry',
        entityId: fila.id,
        action: 'update',
        before: actual ? plana(actual) : null,
        after: { technicianId, date: fecha, ...campos, status },
      });

    /**
     * La seleccion se REEMPLAZA entera (borrar + insertar), no se reconcilia fila a fila.
     * Son como mucho tres maquinas: calcular el diferencial seria mas codigo para el
     * mismo resultado. `undefined` no toca nada — es la diferencia entre «no me lo
     * mandaste» y «quitalas todas».
     *
     * Va DESPUES del upsert porque necesita el id de la fila, y dentro de la misma
     * transaccion de la peticion (la abre `RlsInterceptor`): si esto falla, el dia no
     * queda escrito a medias con las maquinas de antes.
     */
    if (extraOrderIds !== undefined) {
      await this.prisma.client.dailyEntryOrder.deleteMany({ where: { dailyEntryId: fila.id } });
      if (extras.length)
        await this.prisma.client.dailyEntryOrder.createMany({
          data: extras.map((orderId) => ({ dailyEntryId: fila.id, orderId })),
        });
    }

    const completa = await this.prisma.client.dailyEntry.findUniqueOrThrow({
      where: { id: fila.id },
      select: FILA,
    });
    return { id: fila.id, fila: plana(completa) };
  }
}
