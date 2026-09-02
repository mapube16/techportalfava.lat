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

    // Se envía SOLO lo editable. Una semana puede tener un proyecto ya aprobado y otro
    // que el técnico registró después —dos proyectos distintos no se estorban—, y
    // bloquearla entera por el primero dejaba esos días nuevos sin ninguna forma de
    // salir. Si no queda nada editable es que la semana ya se envió: ahí sí es un 409.
    const enviables = jornadas.filter((j) => EDITABLES.includes(j.status));
    // DOS CODIGOS y no uno: `SEMANA_NO_EDITABLE` tapaba estas dos causas, que piden
    // cosas distintas de quien las lee. Esta es «ya la mandaste»; la de abajo es «ese
    // proyecto esta aprobado». Con un solo codigo no habia forma de escribir un mensaje
    // util, y al usuario le llegaba el identificador crudo.
    if (!enviables.length) throw new ConflictException('SEMANA_YA_ENVIADA');

    const tecnico = await c.technician.findUnique({
      where: { id: technicianId },
      select: { roleTypeId: true },
    });

    const proyectos = [...new Set(enviables.map((j) => j.projectId).filter(Boolean))] as string[];

    // Lo que sigue prohibido: colgar un día nuevo de un proyecto cuya nota YA está
    // aprobada. El upsert de abajo la devolvería a 'submitted', y eso es reabrir por la
    // puerta de atrás. Reabrir es del admin, con su motivo y su rastro en audit_log.
    const yaAprobadas = await c.weeklyNote.count({
      where: { technicianId, weekStart, projectId: { in: proyectos }, status: 'approved' },
    });
    if (yaAprobadas) throw new ConflictException('PROYECTO_YA_APROBADO');
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
        // El filtro de estado no sobra: sin él, un día ya cerrado del mismo proyecto
        // volvería a 'submitted' de rebote.
        where: {
          technicianId,
          projectId,
          date: { gte: weekStart, lte: fin },
          status: { in: EDITABLES },
        },
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
      where: {
        technicianId,
        projectId: null,
        date: { gte: weekStart, lte: fin },
        status: { in: EDITABLES },
      },
      data: { status: 'approved' },
    });

    return notas;
  }

  // ── NOTA-08b: los comprobantes de gasto ──

  /**
   * Los recibos de una nota, SIN los bytes. Listar no es descargar: traerse cuatro
   * fotos para pintar cuatro nombres multiplicaria por mil el peso de la pantalla.
   */
  recibos(noteId: string) {
    return this.prisma.client.expenseReceipt.findMany({
      where: { noteId },
      select: { id: true, label: true, mimeType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Sube un comprobante. Se bloquea en cuanto la nota tiene firma, igual que los
   * importes (`gastos`): lo que el cliente firmo ya no se toca.
   */
  async subirRecibo(
    actorId: string,
    noteId: string,
    datos: { label: string; mimeType: string; bytes: Buffer },
  ) {
    const nota = await this.prisma.client.weeklyNote.findUnique({
      where: { id: noteId },
      select: { signedContentHash: true },
    });
    if (!nota) throw new NotFoundException('NOTA_NO_ENCONTRADA');
    if (nota.signedContentHash) throw new ConflictException('NOTA_FIRMADA');

    // `createMany` y no `create`, por lo mismo que `audit.service.ts:39`: el RETURNING
    // exige SELECT sobre lo insertado, y no quiero que subir dependa de poder leer.
    await this.prisma.client.expenseReceipt.createMany({
      data: [{
        noteId,
        label: datos.label,
        mimeType: datos.mimeType,
        // Mismo motivo que en `firmar`: `Buffer` es Uint8Array<ArrayBufferLike> y
        // Prisma 7 tipa `Bytes` como Uint8Array<ArrayBuffer> a secas.
        bytes: new Uint8Array(datos.bytes),
        // Medido aqui, no lo que diga el cliente: es lo que compara el CHECK del motor.
        sizeBytes: datos.bytes.length,
        uploadedById: actorId,
      }],
    });
    return this.recibos(noteId);
  }

  /** Los bytes de UNO, para pintarlo en pantalla. */
  async recibo(noteId: string, receiptId: string) {
    const r = await this.prisma.client.expenseReceipt.findFirst({
      where: { id: receiptId, noteId },
      select: { bytes: true, mimeType: true, label: true },
    });
    if (!r) throw new NotFoundException('RECIBO_NO_ENCONTRADO');
    return r;
  }

  /** Un comprobante no se corrige: se borra y se sube otro. Por eso no hay UPDATE ni
      privilegio de UPDATE ni politica que lo permita. */
  async borrarRecibo(noteId: string, receiptId: string) {
    const nota = await this.prisma.client.weeklyNote.findUnique({
      where: { id: noteId },
      select: { signedContentHash: true },
    });
    if (!nota) throw new NotFoundException('NOTA_NO_ENCONTRADA');
    if (nota.signedContentHash) throw new ConflictException('NOTA_FIRMADA');
    await this.prisma.client.expenseReceipt.deleteMany({ where: { id: receiptId, noteId } });
    return this.recibos(noteId);
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
        dayNote: true,
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
      dayNote: e.dayNote,
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
        select: {
          date: true, description: true, conceptCode: true, dayNote: true,
          order: { select: { label: true } },
          // GASTO-01: los gastos escritos el DIA que ocurrieron. Se suman a los de la
          // nota mas abajo — los dos origenes conviven a proposito.
          expenses: { select: { descripcion: true, valor: true }, orderBy: { createdAt: 'asc' } },
        },
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
        dayNote: e?.dayNote ?? null,
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
      /**
       * NOTA-08 + GASTO-01: los gastos del DIA primero, y detras los que se escribieran
       * al enviar la nota.
       *
       * Son dos origenes a proposito. Desde la capacitacion del 31-ago el gasto se
       * captura el dia que ocurre —con su foto, mientras el ticket existe— pero el JSON
       * de la nota sigue guardando las 496 notas historicas y lo que alguien anada al
       * enviar. Sumarlos aqui es lo que permite que el papel no cambie mientras la
       * captura si lo hace.
       *
       * Se DEDUPLICA por descripcion+valor: quien registro el gasto el martes y volvio a
       * escribirlo el viernes al enviar veria la misma linea dos veces en el PDF, y esa
       * es exactamente la semana en la que se empieza a desconfiar del documento.
       */
      gastosTecnico: (() => {
        const delDia: Gasto[] = entradas.flatMap((e) =>
          e.expenses.map((g) => ({ descripcion: g.descripcion, valor: g.valor })),
        );
        const deLaNota = (nota.gastosTecnico as Gasto[] | null) ?? [];
        const vistos = new Set(delDia.map((g) => `${g.descripcion}|${g.valor}`));
        return [...delDia, ...deLaNota.filter((g) => !vistos.has(`${g.descripcion}|${g.valor}`))];
      })(),
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
      /**
       * OPCIONAL desde 2026-08-29. El cliente ya no firma en el móvil del técnico: la
       * casilla del PDF se llama «TIMBRE Y FIRMA DEL CLIENTE» y un timbre es de tinta,
       * así que se imprime vacía y se firma en el papel. `casillaFirma(undefined)` ya
       * dibujaba ese hueco — no hizo falta tocar el generador.
       */
      client: FirmaEntrada | null;
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
      await this.datosParaPdf(id, {
        tecnico: datos.technician.imagePng,
        cliente: datos.client?.imagePng,
        fecha,
      }),
    );
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    // `Buffer` es `Uint8Array<ArrayBufferLike>`; Prisma 7 tipa `Bytes` como
    // `Uint8Array<ArrayBuffer>` a secas. `new Uint8Array(bytes)` copia a un buffer
    // plano y cierra la diferencia — no hay forma más corta que siga tipando bien.
    await c.notePdf.create({ data: { noteId: id, version: nota.version, bytes: new Uint8Array(bytes), sha256 } });
    // Se guarda la firma que HAYA. Sin cliente digital solo hay una fila, y eso es lo
    // correcto: `note_signatures` es el registro de quien firmo de verdad, no un
    // formulario con dos huecos que rellenar.
    const firmas = (
      [
        ['technician', datos.technician],
        ['client', datos.client],
      ] as const
    ).filter((x): x is readonly ['technician' | 'client', FirmaEntrada] => x[1] != null);
    for (const [kind, f] of firmas) {
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
      select: {
        status: true,
        updatedAt: true,
        technicianId: true,
        weekStart: true,
        projectId: true,
        signedContentHash: true,
        sourceSheet: true,
      },
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

    /**
     * NO SE APRUEBA UNA NOTA SIN FIRMAR. La firma es el consentimiento del técnico
     * sobre lo que declaró: aprobarla sin ella es dar por bueno un documento que nadie
     * asumió, y ademas deja la nota sin PDF congelado que descargar — el documento que
     * vale no llega a existir.
     *
     * SALVO LAS HISTÓRICAS. Las 498 notas que trajo `migrate-notas.ts` del Excel
     * llevan `source_sheet` y jamás tuvieron firma digital: se firmaron en papel, si
     * es que se firmaron. Exigírsela ahora las congelaría para siempre en un estado
     * que nadie puede resolver. El discriminador es estructural y no una fecha a ojo:
     * si vino del Excel, no se le pide; si la creó la app, sí.
     */
    if (destino === 'approved' && !actual.sourceSheet && !actual.signedContentHash)
      throw new ConflictException('NOTA_SIN_FIRMA');

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
