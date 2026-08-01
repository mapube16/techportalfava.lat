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
   * AUD-02. Filtro opcional por entidad para «enséñame la historia de ESTA nota», que
   * es como se usa el visor cuando algo no cuadra.
   *
   * `take` con techo: sin él, un año de operación se trae entero al navegador.
   */
  async listar(filtro: { entity?: string; entityId?: string; take?: number }) {
    const take = Math.min(Math.max(filtro.take ?? 100, 1), 500);
    const filas = await this.prisma.client.auditLog.findMany({
      where: {
        ...(filtro.entity ? { entity: filtro.entity } : {}),
        ...(filtro.entityId ? { entityId: filtro.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return filas.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));
  }
}
