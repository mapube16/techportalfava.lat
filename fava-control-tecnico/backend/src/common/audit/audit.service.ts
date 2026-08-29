import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Lo que se registra. `before`/`after` llevan SOLO los campos que cambiaron. */
export interface Rastro {
  actorId: string;
  actorName: string;
  entity: 'weekly_note' | 'daily_entry' | 'technician' | 'project' | 'order';
  entityId: string;
  action: 'submit' | 'approve' | 'return' | 'reopen' | 'sign' | 'update' | 'deactivate';
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  /** CAT-06: aprobar en nombre de un técnico dado de baja. */
  onBehalfOfId?: string | null;
}

/**
 * AUD-01 — el registro append-only.
 *
 * Vive en `common/` y no en un módulo de dominio porque lo escriben varios: notas,
 * bitácora y la baja de un técnico. Es el único sitio del repo que inserta en
 * `audit_log`.
 *
 * La garantía de append-only NO está aquí: está en la migración, que le da política de
 * SELECT e INSERT y ninguna de UPDATE ni DELETE. Este servicio podría estar comprometido
 * y aun así no podría reescribir la historia — el motor no se lo permitiría.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Escribe DENTRO de la transacción de la petición (la abre el `RlsInterceptor`), no
   * en una propia. Es deliberado: si la transición se deshace, su rastro se deshace con
   * ella. Un log que sobrevive a un cambio que no ocurrió es peor que no tener log.
   */
  async registrar(r: Rastro): Promise<void> {
    // `createMany` y NO `create`, y no es estilo: `create` emite `INSERT ... RETURNING`,
    // y el RETURNING exige permiso de SELECT sobre lo insertado. La política `al_read`
    // solo deja leer a un admin, así que un TÉCNICO dejando su rastro al enviar la
    // semana chocaba contra su propia política de lectura y el envío moría con un 500.
    // `createMany` no devuelve filas, así que escribir no exige poder leer — que es
    // exactamente la garantía que se quería: cualquiera escribe, solo el admin lee.
    await this.prisma.client.auditLog.createMany({
      data: [{
        actorId: r.actorId,
        actorName: r.actorName,
        onBehalfOfId: r.onBehalfOfId ?? null,
        entity: r.entity,
        entityId: r.entityId,
        action: r.action,
        before: (r.before ?? null) as never,
        after: (r.after ?? null) as never,
        reason: r.reason ?? null,
      }],
    });
  }

  /**
   * AUD-02. Filtros opcionales: por entidad para «enséñame la historia de ESTA nota»,
   * por acción y por rango de fechas para «enséñame las devoluciones de julio».
   *
   * Se filtra AQUÍ y no en el navegador porque el visor solo se trae las últimas 200
   * filas: filtrar sobre esas 200 respondería «no hay devoluciones en julio» cuando la
   * verdad es «julio no cabía en la página». Un log que miente por recorte no sirve.
   *
   * `take` con techo: sin él, un año de operación se trae entero al navegador.
   */
  async listar(filtro: {
    entity?: string;
    entityId?: string;
    action?: string;
    desde?: string;
    hasta?: string;
    take?: number;
  }) {
    const take = Math.min(Math.max(filtro.take ?? 100, 1), 500);
    // El rango llega como dos INSTANTES ISO, no como dos fechas: el log guarda UTC y el
    // que filtra piensa en su reloj, asi que quien sabe en que huso esta —el navegador—
    // es quien convierte. Aqui no hay aritmetica de calendario que equivocar.
    const rango = {
      ...(filtro.desde ? { gte: new Date(filtro.desde) } : {}),
      ...(filtro.hasta ? { lte: new Date(filtro.hasta) } : {}),
    };
    const filas = await this.prisma.client.auditLog.findMany({
      where: {
        ...(filtro.entity ? { entity: filtro.entity } : {}),
        ...(filtro.entityId ? { entityId: filtro.entityId } : {}),
        ...(filtro.action ? { action: filtro.action } : {}),
        ...(Object.keys(rango).length ? { createdAt: rango } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return this.conEtiqueta(filas.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })));
  }

  /**
   * De QUE nota habla cada fila, en cristiano.
   *
   * La tabla decia `weekly_note` y un UUID: nadie puede saber si eso es la nota de
   * Cibao de agosto o la de Lucchetti de marzo. El log guarda el id porque es lo unico
   * que NO cambia —el nombre de un proyecto se puede editar y el rastro debe seguir
   * apuntando a la misma fila— asi que el nombre se resuelve AL LEER, no al escribir.
   *
   * Una consulta para todas las filas, no una por fila. Y si la nota ya no existe se
   * queda sin etiqueta: un rastro apunta a lo que hubo, y eso a veces ya no esta.
   */
  private async conEtiqueta<T extends { entity: string; entityId: string }>(filas: T[]) {
    const idsDe = (e: string) => [
      ...new Set(filas.filter((f) => f.entity === e).map((f) => f.entityId)),
    ];
    const etiqueta = new Map<string, string>();

    const notas = idsDe('weekly_note');
    if (notas.length) {
      const filasNota = await this.prisma.client.weeklyNote.findMany({
        where: { id: { in: notas } },
        select: { id: true, weekStart: true, project: { select: { name: true } } },
      });
      for (const n of filasNota)
        etiqueta.set(n.id, `${n.project.name} · ${n.weekStart.toISOString().slice(0, 10)}`);
    }

    // CAT-06: «dio de baja al tecnico» sin decir a CUAL no responde la unica pregunta
    // con la que se abre esta pantalla. Una consulta mas, no una por fila.
    const tecnicos = idsDe('technician');
    if (tecnicos.length) {
      const filasTec = await this.prisma.client.technician.findMany({
        where: { id: { in: tecnicos } },
        select: { id: true, fullName: true },
      });
      for (const t of filasTec) etiqueta.set(t.id, t.fullName);
    }

    return filas.map((f) => ({ ...f, entityLabel: etiqueta.get(f.entityId) ?? null }));
  }
}
