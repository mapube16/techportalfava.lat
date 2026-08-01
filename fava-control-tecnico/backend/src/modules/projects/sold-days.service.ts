import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Phase } from '../../generated/prisma/enums';

/** Las dos fases con nombre. El bucket `null` NO se genera: sale de la agregacion. */
const FASES: Phase[] = ['MONTAJE', 'COLLAUDO'];

/**
 * EL UNICO SITIO DONDE SE RESTA. `delta = sold − executed`, la convencion del Excel
 * (`Resoconto` fila 39: `20 | 332 | -312`): pasarse de lo vendido sale NEGATIVO.
 *
 * VERIFICADO contra las hojas reales (MODELO-VERIFICADO.md §2): en Lucchetti,
 * `144 − 62 − 56 = 26` y `104 − 69 − 29 = 6`. O sea que el delta se calcula contra la
 * SUMA del grupo de rol, no contra un tecnico: el numero que aparece en la fila del
 * primer tecnico de la hoja es maquetacion, no su cuota. Por eso aqui la fila de la
 * matriz es (rol, fase) y nunca (tecnico, rol, fase).
 */
const delta = (sold: number, executed: number): number => sold - executed;

export interface FilaMatriz {
  roleTypeId: string;
  roleTypeName: string;
  roleTypeActive: boolean;
  /** `null` = bucket «sin fase»: todo el historico del Excel entra asi. */
  phase: Phase | null;
  sold: number;
  executed: number;
  delta: number;
}

/**
 * Jornadas aprobadas de un proyecto que NO dicen a que orden fueron. No es una
 * curiosidad: es el estado en el que entra TODO el historico del Excel (de las 536
 * filas de JAV, cero traen maquina) y es justo lo que hoy obliga a Andrea a repartir a
 * mano. Se devuelve aparte para que la pantalla lo pida, en vez de repartirlo sola.
 */
export interface FilaSinOrden {
  roleTypeId: string;
  roleTypeName: string;
  phase: Phase | null;
  executed: number;
}

interface Rol {
  id: string;
  name: string;
  isActive: boolean;
}

/** Clave de los mapas: la celda es (orden, rol, fase) y orden y fase pueden ser NULL. */
const clave = (orderId: string | null, roleTypeId: string, phase: Phase | null) =>
  `${orderId ?? ''}|${roleTypeId}|${phase ?? ''}`;

/**
 * La matriz vendido/ejecutado/delta y la escritura por celda del autoguardado.
 *
 * Vive aparte de `projects.service.ts` porque es UN concepto (el delta y de donde
 * salen sus dos sumandos) y porque asi la resta existe en un solo archivo: la
 * agregacion SQL, la composicion de filas y el upsert se leen seguidos.
 *
 * Desde la Fase 2.1 la matriz cuelga de la ORDEN, no del proyecto: cada maquina
 * contratada se cotiza y se controla por separado (JAV tiene tres bloques distintos).
 */
@Injectable()
export class SoldDaysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Escritura por celda. `PUT` con el valor ABSOLUTO sobre la clave natural
   * `(order, role_type, phase, ordinal)`: reintentar es seguro y dos admins
   * concurrentes convergen al ultimo.
   *
   * `ordinal` es siempre 0 desde la pantalla. Existe porque una cotizacion real trae
   * DOS lineas del mismo rol en el mismo bloque (`MECCATRONICO 265` y `MECCATRONICO 98`),
   * y las crea la migracion de la Fase 6.
   *
   * ponytail: ultimo que escribe gana — correcto para 2 administradores; si algun dia
   * hay contencion real, bloqueo optimista por updated_at, no una capa de bloqueo.
   */
  async fijar(
    actorId: string,
    orderId: string,
    roleTypeId: string,
    phase: Phase,
    soldDays: number,
  ): Promise<Pick<FilaMatriz, 'roleTypeId' | 'phase' | 'sold' | 'executed' | 'delta'>> {
    const where = {
      orderId_roleTypeId_phase_ordinal: { orderId, roleTypeId, phase, ordinal: 0 },
    };

    // NO escribir cuando el valor no cambia. Cada blur sin edicion seria una fila en
    // el `audit_log` append-only de la Fase 4 (AUD-01, que no se puede resumir al
    // escribir) y un `updated_at` movido sin motivo.
    const actual = await this.prisma.client.orderSoldDays.findUnique({
      where,
      select: { soldDays: true },
    });
    if (actual?.soldDays !== soldDays) {
      await this.intentar(() =>
        this.prisma.client.orderSoldDays.upsert({
          where,
          create: { orderId, roleTypeId, phase, ordinal: 0, soldDays, updatedById: actorId },
          update: { soldDays, updatedById: actorId },
          select: { id: true },
        }),
      );
    }

    // El delta viaja calculado tambien en la respuesta de la escritura: asi la celda
    // que acaba de guardar refresca su fila sin que el cliente reste nada.
    const orden = await this.prisma.client.order.findUnique({
      where: { id: orderId },
      select: { projectId: true },
    });
    if (!orden) throw new BadRequestException('ORDEN_INEXISTENTE');

    const ejecutados = await this.ejecutados(orden.projectId);
    const executed = ejecutados.get(clave(orderId, roleTypeId, phase)) ?? 0;
    return { roleTypeId, phase, sold: soldDays, executed, delta: delta(soldDays, executed) };
  }

  /**
   * Una matriz POR ORDEN, mas el bucket de lo no atribuido.
   *
   * Se resuelve con DOS consultas para todo el proyecto (vendidos y ejecutados) y no
   * con una por orden: JAV tiene tres y la pantalla las pinta juntas.
   */
  async porProyecto(
    projectId: string,
  ): Promise<{ porOrden: Map<string, FilaMatriz[]>; sinOrden: FilaSinOrden[] }> {
    const c = this.prisma.client;
    const [ordenes, vendidos, ejecutados, roles] = await Promise.all([
      c.order.findMany({ where: { projectId }, select: { id: true } }),
      c.orderSoldDays.findMany({
        where: { order: { projectId } },
        select: { orderId: true, roleTypeId: true, phase: true, soldDays: true },
      }),
      this.ejecutados(projectId),
      // Sin filtro: hacen falta tambien los inactivos para resolver el nombre de un
      // rol que ya tiene datos. Ordenados por el ORDER BY del motor (collation de la BD).
      c.roleType.findMany({
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Se SUMAN los ordinales: dos lineas del mismo rol son la misma celda de control.
    const soldPor = new Map<string, number>();
    for (const v of vendidos) {
      const k = clave(v.orderId, v.roleTypeId, v.phase);
      soldPor.set(k, (soldPor.get(k) ?? 0) + v.soldDays);
    }

    const porOrden = new Map<string, FilaMatriz[]>();
    for (const { id: orderId } of ordenes) {
      // Un rol desactivado que tiene vendido o ejecutado SIGUE apareciendo: si
      // desapareciera, el total de la orden cambiaria solo y el KPI se descuadraria
      // en silencio.
      const conDato = new Set<string>();
      for (const v of vendidos) if (v.orderId === orderId && v.soldDays > 0) conDato.add(v.roleTypeId);
      for (const [k, dias] of ejecutados) {
        const [o, rol] = k.split('|');
        if (o === orderId && dias > 0) conDato.add(rol);
      }

      const fila = (rol: Rol, phase: Phase | null): FilaMatriz => {
        const sold = soldPor.get(clave(orderId, rol.id, phase)) ?? 0;
        const executed = ejecutados.get(clave(orderId, rol.id, phase)) ?? 0;
        return {
          roleTypeId: rol.id,
          roleTypeName: rol.name,
          roleTypeActive: rol.isActive,
          phase,
          sold,
          executed,
          delta: delta(sold, executed),
        };
      };

      const matriz: FilaMatriz[] = [];
      for (const rol of roles) {
        if (!rol.isActive && !conDato.has(rol.id)) continue;
        for (const phase of FASES) matriz.push(fila(rol, phase));
        // El bucket «sin fase» solo existe si hay historico sin fase: una fila vacia
        // «sin fase» en todas las ordenes seria ruido en la pantalla.
        if ((ejecutados.get(clave(orderId, rol.id, null)) ?? 0) > 0) matriz.push(fila(rol, null));
      }
      porOrden.set(orderId, matriz);
    }

    const nombre = new Map(roles.map((r) => [r.id, r.name]));
    const sinOrden: FilaSinOrden[] = [];
    for (const [k, executed] of ejecutados) {
      const [orderId, roleTypeId, phase] = k.split('|');
      if (orderId || executed <= 0) continue;
      sinOrden.push({
        roleTypeId,
        roleTypeName: nombre.get(roleTypeId) ?? '—',
        phase: (phase || null) as Phase | null,
        executed,
      });
    }
    return { porOrden, sinOrden };
  }

  /**
   * Agregacion de ejecutados: UNA sola expresion SQL, reutilizable en la Fase 7.
   * Las decisiones que lleva dentro son preguntas abiertas con FAVA, asi que se
   * cambian AQUI y en ningun otro sitio:
   *
   *  1. `COALESCE(de.role_type_id, t.role_type_id)`: el rol de la JORNADA manda y el
   *     del maestro es el respaldo. Es lo que hace que Ivan Cortes cuente como
   *     `Software` unos dias y como `Capo Elettricista` otros — y Andrea lo pidio
   *     explicitamente: «es importante que puedan anunciar que rol esta haciendo».
   *  2. `COUNT(*)` cuenta `MD` (medio dia) como dia completo: es lo que hace el Excel
   *     (`Cuenta de Concepto`), asi cuadra la conciliacion de MIG-03. Si FAVA pide
   *     medio dia, se cambia en esta linea.
   *  3. Ni `de.phase` ni `de.order_id` se descartan cuando son NULL: todo el historico
   *     del Excel entra sin fase y sin orden, y descartarlo seria una mentira
   *     silenciosa en el tablero. Van a sus buckets.
   *
   * `status = 'approved'` es coherente con KPI-01: un borrador no es un dia ejecutado.
   */
  private async ejecutados(projectId: string): Promise<Map<string, number>> {
    const filas = await this.prisma.client.$queryRaw<
      { order_id: string | null; role_type_id: string; phase: Phase | null; days: number }[]
    >`
      SELECT de.order_id,
             COALESCE(de.role_type_id, t.role_type_id) AS role_type_id,
             de.phase,
             COUNT(*)::int AS days
        FROM daily_entries de
        JOIN technicians  t ON t.id = de.technician_id
       WHERE de.project_id = ${projectId}::uuid
         AND de.status = 'approved'
       GROUP BY 1, 2, 3
    `;
    return new Map(filas.map((f) => [clave(f.order_id, f.role_type_id, f.phase), f.days]));
  }

  /** El unico FK que el cliente puede errar aqui es el rol: la orden viene de la ruta. */
  private async intentar<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2003')
        throw new BadRequestException('ROL_O_ORDEN_INEXISTENTE');
      throw e;
    }
  }
}
