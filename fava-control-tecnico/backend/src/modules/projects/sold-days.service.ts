import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Phase } from '../../generated/prisma/enums';

/** Las dos fases con nombre. El bucket `null` NO se genera: sale de la agregacion. */
const FASES: Phase[] = ['MONTAJE', 'COLLAUDO'];

/**
 * EL UNICO SITIO DONDE SE RESTA. `delta = sold − executed`, la convencion del Excel
 * (`Resoconto` fila 39: `20 | 332 | -312`): pasarse de lo vendido sale NEGATIVO.
 *
 * El prototipo (`ProjectDetail.tsx:35`) hace `dn - s`, o sea al reves, y con eso una
 * sobreejecucion saldria positiva y en verde. Se corrige en el cliente (02-06); la
 * fuente de verdad es esta linea y el cliente solo pinta lo que llega.
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

interface Rol {
  id: string;
  name: string;
  isActive: boolean;
}

/** Clave de los mapas: la celda es (rol, fase) y la fase puede ser NULL. */
const clave = (roleTypeId: string, phase: Phase | null) => `${roleTypeId}|${phase ?? ''}`;

/**
 * La matriz vendido/ejecutado/delta y la escritura por celda del autoguardado.
 *
 * Vive aparte de `projects.service.ts` porque es UN concepto (el delta y de donde
 * salen sus dos sumandos) y porque asi la resta existe en un solo archivo: la
 * agregacion SQL, la composicion de filas y el upsert se leen seguidos.
 */
@Injectable()
export class SoldDaysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Escritura por celda. `PUT` con el valor ABSOLUTO sobre la clave natural
   * `(project, role_type, phase)`: reintentar es seguro y dos admins concurrentes
   * convergen al ultimo.
   *
   * ponytail: ultimo que escribe gana — correcto para 2 administradores; si algun dia
   * hay contencion real, bloqueo optimista por updated_at, no una capa de bloqueo.
   */
  async fijar(
    actorId: string,
    projectId: string,
    roleTypeId: string,
    phase: Phase,
    soldDays: number,
  ): Promise<Pick<FilaMatriz, 'roleTypeId' | 'phase' | 'sold' | 'executed' | 'delta'>> {
    const where = { projectId_roleTypeId_phase: { projectId, roleTypeId, phase } };

    // NO escribir cuando el valor no cambia. Cada blur sin edicion seria una fila en
    // el `audit_log` append-only de la Fase 4 (AUD-01, que no se puede resumir al
    // escribir) y un `updated_at` movido sin motivo.
    const actual = await this.prisma.client.projectSoldDays.findUnique({
      where,
      select: { soldDays: true },
    });
    if (actual?.soldDays !== soldDays) {
      await this.intentar(() =>
        this.prisma.client.projectSoldDays.upsert({
          where,
          create: { projectId, roleTypeId, phase, soldDays, updatedById: actorId },
          update: { soldDays, updatedById: actorId },
          select: { id: true },
        }),
      );
    }

    // El delta viaja calculado tambien en la respuesta de la escritura: asi la celda
    // que acaba de guardar refresca su fila sin que el cliente reste nada.
    const ejecutados = await this.ejecutados(projectId);
    const executed = ejecutados.get(clave(roleTypeId, phase)) ?? 0;
    return { roleTypeId, phase, sold: soldDays, executed, delta: delta(soldDays, executed) };
  }

  /**
   * Filas = (roles ACTIVOS ∪ roles con dato en este proyecto) x (MONTAJE, COLLAUDO),
   * mas los buckets `phase: null` que devuelva la agregacion.
   *
   * Un rol desactivado que tiene vendido o ejecutado SIGUE apareciendo: si desapareciera,
   * el total del proyecto cambiaria solo y el KPI se descuadraria en silencio.
   */
  async matriz(projectId: string): Promise<FilaMatriz[]> {
    const c = this.prisma.client;
    const [vendidos, ejecutados, roles] = await Promise.all([
      c.projectSoldDays.findMany({
        where: { projectId },
        select: { roleTypeId: true, phase: true, soldDays: true },
      }),
      this.ejecutados(projectId),
      // Sin filtro: hacen falta tambien los inactivos para resolver el nombre de un
      // rol que ya tiene datos. Ordenados por el ORDER BY del motor (collation de la BD).
      c.roleType.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
    ]);

    const soldPor = new Map(vendidos.map((v) => [clave(v.roleTypeId, v.phase), v.soldDays]));
    const conDato = new Set<string>();
    for (const v of vendidos) if (v.soldDays > 0) conDato.add(v.roleTypeId);
    for (const [k, dias] of ejecutados) if (dias > 0) conDato.add(k.split('|')[0]);

    const fila = (rol: Rol, phase: Phase | null): FilaMatriz => {
      const sold = soldPor.get(clave(rol.id, phase)) ?? 0;
      const executed = ejecutados.get(clave(rol.id, phase)) ?? 0;
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
      // «sin fase» en todos los proyectos seria ruido en la pantalla.
      if ((ejecutados.get(clave(rol.id, null)) ?? 0) > 0) matriz.push(fila(rol, null));
    }
    return matriz;
  }

  /**
   * Agregacion de ejecutados: UNA sola expresion SQL, reutilizable en la Fase 7.
   * Las tres decisiones que lleva dentro son preguntas abiertas con FAVA, asi que se
   * cambian AQUI y en ningun otro sitio:
   *
   *  1. `COALESCE(de.role_type_id, t.role_type_id)`: el rol de la JORNADA manda y el
   *     del maestro es el respaldo. Es lo que hace que Ivan Cortes cuente como
   *     `Software` unos dias y como `Capo Elettricista` otros, como esta en el Excel.
   *  2. `COUNT(*)` cuenta `MD` (medio dia) como dia completo: es lo que hace el Excel
   *     (`Cuenta de Concepto`), asi cuadra la conciliacion de MIG-03. Si FAVA pide
   *     medio dia, se cambia en esta linea.
   *  3. `de.phase` puede ser NULL y NO se descarta: todo el historico del Excel entra
   *     sin fase y descartarlo seria una mentira silenciosa en el tablero.
   *
   * `status = 'approved'` es coherente con KPI-01: un borrador no es un dia ejecutado.
   */
  private async ejecutados(projectId: string): Promise<Map<string, number>> {
    const filas = await this.prisma.client.$queryRaw<
      { role_type_id: string; phase: Phase | null; days: number }[]
    >`
      SELECT COALESCE(de.role_type_id, t.role_type_id) AS role_type_id,
             de.phase,
             COUNT(*)::int AS days
        FROM daily_entries de
        JOIN technicians  t ON t.id = de.technician_id
       WHERE de.project_id = ${projectId}::uuid
         AND de.status = 'approved'
       GROUP BY 1, 2
    `;
    return new Map(filas.map((f) => [clave(f.role_type_id, f.phase), f.days]));
  }

  /** El unico FK que el cliente puede errar aqui es el rol: el proyecto viene de la ruta. */
  private async intentar<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2003')
        throw new BadRequestException('ROL_O_PROYECTO_INEXISTENTE');
      throw e;
    }
  }
}
