import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { EDITABLES } from '../../common/estados';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { aDate, aTexto } from '../daily-entries/fecha';
import { renderizarNota } from './nota-pdf';
import type { DatosNota, FilaNota as FilaPdfDia, Gasto } from './nota-pdf';

/** Lo que trae cada firma del cuerpo del `POST :id/sign`. Validado en el controlador. */
export interface FirmaEntrada {
  signerName: string;
  signerDocument?: string;
  signerRole?: string;
  /** Siempre `true` al llegar aquí: el controlador rechaza lo demás. */
  declarationAccepted: true;
  /** PNG en base64, sin el prefijo `data:`. */
  imagePng: string;
}

/**
 * Los estados de la nota y las transiciones LEGÍTIMAS desde cada uno. Es una tabla y no
 * una cadena de `if`: leerla de un vistazo es lo que hace evidente que no se puede
 * aprobar un borrador ni reenviar algo ya aprobado.
 *
 * NOTA-02: cada transición tiene su endpoint. No existe un `PATCH status` genérico —
 * con uno, esta tabla sería decorativa.
 */
const TRANSICIONES: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'returned'],
  returned: ['submitted'],
  // Una nota aprobada solo se mueve con `reopen`, que exige motivo y es de Super Admin.
  approved: ['draft'],
};

/** La vista de una nota. `select` explícito: el contrato no crece solo. */
const NOTA = {
  id: true,
  technicianId: true,
  projectId: true,
  weekStart: true,
  status: true,
  roleTypeId: true,
  returnComment: true,
  updatedAt: true,
  version: true,
  signedContentHash: true,
  gastosTecnico: true,
  anticiposCliente: true,
  technician: { select: { fullName: true } },
  project: { select: { name: true, clientName: true } },
  roleType: { select: { name: true } },
} as const;

interface FilaNota {
  id: string;
  technicianId: string;
  projectId: string;
  weekStart: Date;
  status: string;
  roleTypeId: string | null;
  returnComment: string | null;
  updatedAt: Date;
  version: number;
  signedContentHash: string | null;
  gastosTecnico: unknown;
  anticiposCliente: unknown;
  technician: { fullName: string };
  project: { name: string; clientName: string };
  roleType: { name: string } | null;
}

const plana = (n: FilaNota) => ({
  id: n.id,
  technicianId: n.technicianId,
  technicianName: n.technician.fullName,
  projectId: n.projectId,
  projectName: n.project.name,
  clientName: n.project.clientName,
  weekStart: aTexto(n.weekStart),
  status: n.status,
  roleTypeId: n.roleTypeId,
  roleTypeName: n.roleType?.name ?? null,
  returnComment: n.returnComment,
  /** Lo que el cliente devuelve en la siguiente transición para detectar conflicto. */
  updatedAt: n.updatedAt.toISOString(),
  version: n.version,
  /** El hash NO se expone: al cliente solo le importa si hay firma o no, y publicarlo
      invitaría a compararlo desde el navegador contra un PDF que él mismo generó. */
  signed: n.signedContentHash !== null,
  gastosTecnico: (n.gastosTecnico as Gasto[] | null) ?? [],
  anticiposCliente: (n.anticiposCliente as Gasto[] | null) ?? [],
});

/**
 * NOTA-01/02/03, BIT-05 y CAT-06.
 *
 * La regla que gobierna el archivo: **el técnico nunca gestiona notas**. Envía su
 * semana y el servidor deriva una nota por proyecto. Todo lo demás (aprobar, devolver,
 * reabrir) es del admin y pasa por un endpoint propio con su rastro en `audit_log`.
 */
@Injectable()
export class WeeklyNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notif: NotificationsService,
  ) {}

  /**
   * NOTA-01 — enviar la semana.
   *
   * Agrupa las jornadas de la semana POR PROYECTO y crea (o reutiliza) una nota por
   * cada uno. Trabajar en dos proyectos produce dos notas y el técnico no elige nada.
   *
   * Las jornadas SIN proyecto no generan nota: nadie las firma. Se aprueban con el
   * envío, porque exigir que un admin apruebe un día libre es ceremonia sin valor y las
   * dejaría fuera de los tableros para siempre (que solo cuentan `approved`).
   */
  async enviarSemana(
    actor: { id: string; name: string },
    technicianId: string,
    lunesIso: string,
  ) {
    const c = this.prisma.client;
    const weekStart = aDate(lunesIso);
    const fin = new Date(weekStart.getTime() + 6 * 86_400_000);

    const jornadas = await c.dailyEntry.findMany({
      where: { technicianId, date: { gte: weekStart, lte: fin } },
      select: { id: true, projectId: true, status: true },
    });
    if (!jornadas.length) throw new BadRequestException('SEMANA_VACIA');

    // Reenviar lo ya aprobado sería reabrirlo por la puerta de atrás.
    const bloqueadas = jornadas.filter((j) => !EDITABLES.includes(j.status));
    if (bloqueadas.length) throw new ConflictException('SEMANA_NO_EDITABLE');

    const tecnico = await c.technician.findUnique({
      where: { id: technicianId },
      select: { roleTypeId: true },
    });

    const proyectos = [...new Set(jornadas.map((j) => j.projectId).filter(Boolean))] as string[];
    const notas: ReturnType<typeof plana>[] = [];

    for (const projectId of proyectos) {
      const nota = await c.weeklyNote.upsert({
        where: { technicianId_weekStart_projectId: { technicianId, weekStart, projectId } },
        // NOTA-09: nace con el cargo del maestro y después se puede cambiar en la nota.
        create: { technicianId, weekStart, projectId, status: 'submitted', roleTypeId: tecnico?.roleTypeId },
        // Reenviar tras una devolución limpia el comentario: ya no aplica a lo nuevo.
        update: { status: 'submitted', returnComment: null },
        select: NOTA,
      });
      await c.dailyEntry.updateMany({
        where: { technicianId, projectId, date: { gte: weekStart, lte: fin } },
        data: { status: 'submitted' },
      });
      await this.audit.registrar({
        actorId: actor.id,
        actorName: actor.name,
        entity: 'weekly_note',
        entityId: nota.id,
        action: 'submit',
        after: { status: 'submitted', weekStart: lunesIso, projectId },
      });
      notas.push(plana(nota));
    }

    // Los días sin proyecto cierran con la semana: ver el comentario del método.
    await c.dailyEntry.updateMany({
      where: { technicianId, projectId: null, date: { gte: weekStart, lte: fin } },
      data: { status: 'approved' },
    });

    return notas;
  }

  /**
   * La bandeja del admin y la lista del técnico son la MISMA consulta: RLS filtra.
   * Salvo cuando quien pregunta es admin Y técnico a la vez — ahí RLS no acota y el
   * `technicianId` explícito es lo que hace que «mis notas» sean las suyas.
   */
  async listar(status?: string, technicianId?: string) {
    const filas = await this.prisma.client.weeklyNote.findMany({
      where: { ...(status ? { status } : {}), ...(technicianId ? { technicianId } : {}) },
      select: NOTA,
      orderBy: [{ weekStart: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return filas.map(plana);
  }

  async detalle(id: string) {
    const n = await this.prisma.client.weeklyNote.findUnique({ where: { id }, select: NOTA });
    if (!n) throw new NotFoundException('NOTA_NO_ENCONTRADA');
    return plana(n);
  }

  /**
   * Los SIETE días de esta nota, para pintarlos en pantalla.
   *
   * Existe porque el admin no podía verlos. La bandeja los pedía a
   * `GET /api/daily-entries`, y ese endpoint empieza por `tecnicoDe(actor)`: un admin no
   * tiene técnico vinculado, así que recibía 409 USUARIO_SIN_TECNICO y los siete días
   * salían en blanco. Con las 443 notas del histórico dentro eso dejaba el archivo
   * entero mudo.
   *
   * Y de paso es MÁS correcto que la ruta de la bitácora: acota por técnico, proyecto Y
   * semana de la nota, así que un técnico con dos proyectos en la misma semana ya no ve
   * los mismos siete días repetidos en sus dos notas.
   *
   * La autorización la da RLS sobre `weekly_notes`: si el actor no puede leer la nota,
   * `findUnique` no la encuentra y esto es un 404 — no hace falta un guard aparte.
   */
  async dias(noteId: string) {
    const c = this.prisma.client;
    const nota = await c.weeklyNote.findUnique({
      where: { id: noteId },
      select: { weekStart: true, projectId: true, technicianId: true },
    });
    if (!nota) throw new NotFoundException('NOTA_NO_ENCONTRADA');

    const fin = new Date(nota.weekStart.getTime() + 6 * 86_400_000);
    const entradas = await c.dailyEntry.findMany({
      where: { technicianId: nota.technicianId, projectId: nota.projectId, date: { gte: nota.weekStart, lte: fin } },
      select: {
        date: true,
        description: true,
        conceptCode: true,
        inFactory: true,
        sourceMachine: true,
        order: { select: { label: true, commessaShort: true } },
      },
      orderBy: { date: 'asc' },
    });

    return entradas.map((e) => ({
      date: aTexto(e.date),
      conceptCode: e.conceptCode,
      description: e.description,
      inFactory: e.inFactory,
      commessaShort: e.order?.commessaShort ?? null,
      /**
       * La máquina contratada si la hay y, si no, el texto CRUDO de la columna
       * «Maquina» del Excel. En el histórico solo 437 de 6.573 jornadas tienen orden,
       * pero 1.013 traen ese texto: enseñarlo es la diferencia entre una fila que dice
       * algo y una fila vacía. Va aparte de `commessaShort` porque no es lo mismo — uno
       * es un dato del sistema y el otro es lo que alguien escribió a mano.
       */
      machine: e.order?.label ?? e.sourceMachine,
    }));
  }

  /**
   * Fase 5 — arma el `DatosNota` que pide `nota-pdf.ts` a partir de la nota: técnico,
   * proyecto, los 7 días de SU semana y SU proyecto (no toda la semana del técnico, que
   * puede tener días de otro) y la máquina, tomada de las órdenes que esos días usaron.
   *
   * `firmas` es opcional a propósito: la vista previa (antes de firmar) llama esto sin
   * firmas y `nota-pdf.ts` ya sabe pintar la casilla vacía.
   */
  private async datosParaPdf(
    noteId: string,
    firmas?: { tecnico?: string; cliente?: string; fecha?: string },
  ): Promise<DatosNota> {
    const c = this.prisma.client;
    const nota = await c.weeklyNote.findUnique({
      where: { id: noteId },
      select: {
        weekStart: true,
        projectId: true,
        technicianId: true,
        roleType: { select: { name: true } },
        technician: { select: { fullName: true } },
        project: { select: { clientName: true, locality: true, country: true, supply: true, contractNumber: true } },
        gastosTecnico: true,
        anticiposCliente: true,
      },
    });
    if (!nota) throw new NotFoundException('NOTA_NO_ENCONTRADA');

    const semana = Array.from({ length: 7 }, (_, i) => aTexto(new Date(nota.weekStart.getTime() + i * 86_400_000)));
    const fin = new Date(nota.weekStart.getTime() + 6 * 86_400_000);

    const [entradas, conceptos] = await Promise.all([
      c.dailyEntry.findMany({
        where: { technicianId: nota.technicianId, projectId: nota.projectId, date: { gte: nota.weekStart, lte: fin } },
        select: { date: true, description: true, conceptCode: true, order: { select: { label: true } } },
      }),
      c.concept.findMany({ select: { code: true, labelEs: true } }),
    ]);

    const porFecha = new Map(entradas.map((e) => [aTexto(e.date), e]));
    const etiquetaDe = new Map(conceptos.map((x) => [x.code as string, x.labelEs]));

    // Siempre SIETE filas — un día de otro proyecto o sin registrar va en blanco, no se
    // omite (ver el comentario de `definicionNota` sobre por qué).
    const filas: FilaPdfDia[] = semana.map((fecha) => {
      const e = porFecha.get(fecha);
      return {
        date: fecha,
        description: e?.description ?? null,
        categoria: e?.conceptCode ? (etiquetaDe.get(e.conceptCode) ?? null) : null,
      };
    });

    const maquinaria = [...new Set(entradas.map((e) => e.order?.label).filter((x): x is string => Boolean(x)))].join(', ');

    return {
      clientName: nota.project.clientName,
      locality: nota.project.locality,
      country: nota.project.country,
      supply: nota.project.supply,
      contractNumber: nota.project.contractNumber,
      maquinaria,
      cargoSemana: nota.roleType?.name ?? '',
      technicianName: nota.technician.fullName,
      filas,
      // NOTA-08: informativos, sin flujo de reembolso. Lo que haya escrito `gastos()`.
      gastosTecnico: (nota.gastosTecnico as Gasto[] | null) ?? [],
      anticiposCliente: (nota.anticiposCliente as Gasto[] | null) ?? [],
      firmaTecnico: firmas?.tecnico,
      firmaCliente: firmas?.cliente,
      fechaFirma: firmas?.fecha,
    };
  }

  /**
   * La vista previa de antes de firmar: renderiza al vuelo y no toca `note_pdfs`. Cada
   * llamada es un PDF nuevo en memoria — es lo correcto para un borrador que todavía
   * puede cambiar en el próximo tecleo.
   */
  async previsualizarPdf(id: string): Promise<Buffer> {
    return renderizarNota(await this.datosParaPdf(id));
  }

  /**
   * NOTA-08. Editables solo hasta firmar: después, cambiarlos dejaría el PDF firmado
   * diciendo algo distinto de lo que hay en la base — el mismo motivo que bloquea el
   * cargo de una nota aprobada. La forma (máximo 4, textos no vacíos) ya la validó el
   * controlador; aquí solo la regla de negocio.
   */
  async gastos(actor: { id: string; name: string }, id: string, gastosTecnico: Gasto[], anticiposCliente: Gasto[]) {
    const antes = await this.prisma.client.weeklyNote.findUnique({
      where: { id },
      select: { signedContentHash: true, gastosTecnico: true, anticiposCliente: true },
    });
    if (!antes) throw new NotFoundException('NOTA_NO_ENCONTRADA');
    if (antes.signedContentHash) throw new ConflictException('NOTA_FIRMADA');

    const nota = await this.prisma.client.weeklyNote.update({
      where: { id },
      data: { gastosTecnico: gastosTecnico as never, anticiposCliente: anticiposCliente as never },
      select: NOTA,
    });
    await this.audit.registrar({
      actorId: actor.id,
      actorName: actor.name,
      entity: 'weekly_note',
      entityId: id,
      action: 'update',
      before: { gastosTecnico: antes.gastosTecnico, anticiposCliente: antes.anticiposCliente },
      after: { gastosTecnico, anticiposCliente },
    });
    return plana(nota);
  }

  /**
   * NOTA-04/05/06 — el técnico firma y, presente, el cliente. El PDF se congela UNA
   * vez con las dos firmas ya estampadas: `nota-pdf.ts` pinta ambas casillas en el
   * mismo render, así que firmar es atómico o no es — no hay firma "a medias".
   *
   * Exige `status === 'submitted'`: firmar un borrador sería firmar algo que el
   * servidor todavía no considera terminado, y una devuelta se firma tras corregir y
   * reenviar, no antes.
   */
  async firmar(
    actor: { id: string; name: string },
    id: string,
    datos: {
      technician: FirmaEntrada;
      client: FirmaEntrada;
      expectedUpdatedAt?: string;
      ip: string | null;
      userAgent: string | null;
    },
  ) {
    const c = this.prisma.client;
    const nota = await c.weeklyNote.findUnique({
      where: { id },
      select: { status: true, updatedAt: true, version: true, signedContentHash: true },
    });
    if (!nota) throw new NotFoundException('NOTA_NO_ENCONTRADA');
    if (datos.expectedUpdatedAt && nota.updatedAt.toISOString() !== datos.expectedUpdatedAt)
      throw new ConflictException('NOTA_MODIFICADA');
    if (nota.status !== 'submitted') throw new ConflictException('NOTA_NO_ENVIADA');
    if (nota.signedContentHash) throw new ConflictException('NOTA_YA_FIRMADA');

    const fecha = aTexto(new Date());
    const bytes = await renderizarNota(
      await this.datosParaPdf(id, { tecnico: datos.technician.imagePng, cliente: datos.client.imagePng, fecha }),
    );
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    // `Buffer` es `Uint8Array<ArrayBufferLike>`; Prisma 7 tipa `Bytes` como
    // `Uint8Array<ArrayBuffer>` a secas. `new Uint8Array(bytes)` copia a un buffer
    // plano y cierra la diferencia — no hay forma más corta que siga tipando bien.
    await c.notePdf.create({ data: { noteId: id, version: nota.version, bytes: new Uint8Array(bytes), sha256 } });
    for (const [kind, f] of [
      ['technician', datos.technician],
      ['client', datos.client],
    ] as const) {
      await c.noteSignature.create({
        data: {
          noteId: id,
          version: nota.version,
          kind,
          signerName: f.signerName,
          signerDocument: f.signerDocument ?? null,
          signerRole: f.signerRole ?? null,
          declarationAccepted: true,
          imagePng: Buffer.from(f.imagePng, 'base64'),
          pdfSha256: sha256,
          ip: datos.ip,
          userAgent: datos.userAgent,
        },
      });
    }

    const actualizada = await c.weeklyNote.update({
      where: { id },
      data: { signedContentHash: sha256 },
      select: NOTA,
    });

    await this.audit.registrar({
      actorId: actor.id,
      actorName: actor.name,
      entity: 'weekly_note',
      entityId: id,
      action: 'sign',
      after: { version: nota.version, pdfSha256: sha256 },
    });

    return plana(actualizada);
  }

  /**
   * Los bytes ya firmados. `version` por defecto es la ACTUAL; una versión vieja solo
   * existe tras un `reopen`, y es la evidencia de lo que se firmó antes de esa
   * reapertura — para eso se conserva.
   */
  async descargarPdf(id: string, version?: number): Promise<{ bytes: Buffer; version: number }> {
    const nota = await this.prisma.client.weeklyNote.findUnique({ where: { id }, select: { version: true } });
    if (!nota) throw new NotFoundException('NOTA_NO_ENCONTRADA');
    const v = version ?? nota.version;
    const pdf = await this.prisma.client.notePdf.findUnique({
      where: { noteId_version: { noteId: id, version: v } },
      select: { bytes: true },
    });
    if (!pdf) throw new NotFoundException('PDF_NO_DISPONIBLE');
    return { bytes: Buffer.from(pdf.bytes), version: v };
  }

  /**
   * El único sitio que cambia el estado de una nota.
   *
   * `expectedUpdatedAt` es bloqueo optimista: dos admins que aprueban a la vez leen el
   * mismo `updated_at`, el primero lo mueve y el segundo se lleva un 409 en vez de
   * pisar la decisión ajena en silencio. Es el criterio 4 de la fase, y no se puede
   * cumplir con «el último que escribe gana».
   */
  private async transicionar(
    actor: { id: string; name: string },
    id: string,
    destino: string,
    action: 'submit' | 'approve' | 'return' | 'reopen',
    opciones: { reason?: string | null; expectedUpdatedAt?: string; onBehalfOfId?: string | null } = {},
  ) {
    const c = this.prisma.client;
    const actual = await c.weeklyNote.findUnique({
      where: { id },
      select: { status: true, updatedAt: true, technicianId: true, weekStart: true, projectId: true, signedContentHash: true },
    });
    if (!actual) throw new NotFoundException('NOTA_NO_ENCONTRADA');

    if (opciones.expectedUpdatedAt && actual.updatedAt.toISOString() !== opciones.expectedUpdatedAt)
      throw new ConflictException('NOTA_MODIFICADA');

    if (!(TRANSICIONES[actual.status] ?? []).includes(destino))
      throw new ConflictException(`TRANSICION_INVALIDA_${actual.status.toUpperCase()}_A_${destino.toUpperCase()}`);

    // El cliente ya firmó lo que el papel dice: devolverla desharía esa firma sin
    // dejar rastro de que existió. Deshacer una nota firmada es lo mismo que deshacer
    // una aprobación (reopen) — Super Admin, con motivo, y sube la versión.
    if (destino === 'returned' && actual.signedContentHash) throw new ConflictException('NOTA_FIRMADA_USAR_REOPEN');

    const nota = await c.weeklyNote.update({
      where: { id },
      data: {
        status: destino,
        // El comentario se guarda al devolver y se limpia en cualquier otra transición:
        // dejarlo pegado haría creer al técnico que la nota sigue devuelta.
        returnComment: destino === 'returned' ? (opciones.reason ?? null) : null,
        // NOTA-07: reabrir sube la versión Y limpia el hash firmado — la versión nueva
        // empieza sin firmar, y sin esto `gastos()` se quedaría bloqueada para siempre
        // creyendo que la nota (la nueva version) ya tiene firma. El PDF y las firmas
        // de la versión anterior no se tocan (viven en filas propias por versión).
        ...(action === 'reopen' ? { version: { increment: 1 }, signedContentHash: null } : {}),
      },
      select: NOTA,
    });

    // BIT-05: la jornada hereda la editabilidad de su nota. Se propaga aquí y en ningún
    // otro sitio, para que no haya dos verdades sobre si un día se puede tocar.
    const fin = new Date(actual.weekStart.getTime() + 6 * 86_400_000);
    await c.dailyEntry.updateMany({
      where: {
        technicianId: actual.technicianId,
        projectId: actual.projectId,
        date: { gte: actual.weekStart, lte: fin },
      },
      // El estado de la jornada ES el de su nota, incluido `draft` al reabrir: así
      // «¿puedo editar este día?» se responde mirando una sola columna.
      data: { status: destino },
    });

    await this.audit.registrar({
      actorId: actor.id,
      actorName: actor.name,
      onBehalfOfId: opciones.onBehalfOfId ?? null,
      entity: 'weekly_note',
      entityId: id,
      action,
      before: { status: actual.status },
      after: { status: destino },
      reason: opciones.reason ?? null,
    });

    // Fase 9. Solo estas dos: `submit` y `reopen` no le dicen nada nuevo al técnico
    // (una la hizo él, la otra le devuelve la nota a editable y ya la verá).
    //
    // Esto ENCOLA, no envía: el POST a Graph no puede ocurrir aquí dentro. La
    // transacción de la petición retiene una conexión del pool de 10 con timeout de
    // 10 s, y una llamada de red lenta lo agota antes que la CPU (ver `rls.interceptor`).
    if (action === 'approve' || action === 'return')
      await this.notif.avisarTransicion(nota, action, opciones.reason);

    return plana(nota);
  }

  approve(actor: { id: string; name: string }, id: string, expectedUpdatedAt?: string, onBehalfOfId?: string | null) {
    return this.transicionar(actor, id, 'approved', 'approve', { expectedUpdatedAt, onBehalfOfId });
  }

  /** NOTA-03: sin comentario no se devuelve. Lo exige el servicio Y el motor. */
  return_(actor: { id: string; name: string }, id: string, reason: string, expectedUpdatedAt?: string) {
    if (!reason.trim()) throw new BadRequestException('COMENTARIO_REQUERIDO');
    return this.transicionar(actor, id, 'returned', 'return', { reason: reason.trim(), expectedUpdatedAt });
  }

  /** Reabrir una nota aprobada. Exige motivo: deshacer una aprobación no es rutina. */
  reopen(actor: { id: string; name: string }, id: string, reason: string, expectedUpdatedAt?: string) {
    if (!reason.trim()) throw new BadRequestException('MOTIVO_REQUERIDO');
    return this.transicionar(actor, id, 'draft', 'reopen', { reason: reason.trim(), expectedUpdatedAt });
  }

  /** NOTA-09: el cargo de ESA semana, que puede no ser el del maestro. */
  async fijarCargo(actor: { id: string; name: string }, id: string, roleTypeId: string | null) {
    const antes = await this.prisma.client.weeklyNote.findUnique({
      where: { id },
      select: { roleTypeId: true, status: true },
    });
    if (!antes) throw new NotFoundException('NOTA_NO_ENCONTRADA');
    // Una nota aprobada ya se imprimió y quizá se firmó: cambiarle el cargo por detrás
    // dejaría el PDF firmado diciendo algo distinto de la base.
    if (antes.status === 'approved') throw new ConflictException('NOTA_APROBADA');

    const nota = await this.prisma.client.weeklyNote.update({
      where: { id },
      data: { roleTypeId },
      select: NOTA,
    });
    await this.audit.registrar({
      actorId: actor.id,
      actorName: actor.name,
      entity: 'weekly_note',
      entityId: id,
      action: 'update',
      before: { roleTypeId: antes.roleTypeId },
      after: { roleTypeId },
    });
    return plana(nota);
  }

  /** CAT-06: lo que el diálogo de baja necesita saber antes de desactivar a nadie. */
  pendientesDe(technicianId: string) {
    return this.prisma.client.weeklyNote.count({
      where: { technicianId, status: { in: ['draft', 'submitted', 'returned'] } },
    });
  }
}
