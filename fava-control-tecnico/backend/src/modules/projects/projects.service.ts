import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';
import { SoldDaysService } from './sold-days.service';

/**
 * Un total de contrato solo tiene moneda si TODAS las ordenes coinciden. Un proyecto
 * con lineas en EUR y en USD devuelve `null` y la pantalla muestra el importe sin
 * simbolo: sumar dos monedas y ponerle una etiqueta seria una cifra falsa.
 */
const monedaUnica = (codigos: (string | null)[]): string | null => {
  const unicos = new Set(codigos.filter((c): c is string => c !== null));
  return unicos.size === 1 ? [...unicos][0] : null;
};

/**
 * El `select` ES el contrato del detalle (lo consume frontend/src/lib/api/projects.ts):
 * una columna nueva en el esquema no debe filtrarse a la respuesta sin que nadie lo
 * decida. Ni `createdById` ni las fechas viajan: son metadatos, no pantalla.
 */
const DETALLE = {
  id: true,
  name: true,
  // ── Encabezado literal de la Nota Semanal ──
  clientName: true,
  clientNit: true,
  locality: true,
  country: true,
  supply: true,
  contractNumber: true,
  // `oaNumber`, `contractValue` y `currencyCode` NO estan: viven en la orden desde la
  // Fase 2.1. El valor del proyecto es la suma de sus ordenes y se calcula al leer.
  normalHours: true,
  isActive: true,
} as const;

/** El listado no necesita el encabezado completo: `Projects.tsx` no lo muestra. */
const LISTA = {
  id: true,
  name: true,
  clientName: true,
  country: true,
  contractNumber: true,
  normalHours: true,
  isActive: true,
  // Las etiquetas de los chips y el importe salen de un include, no de N+1 consultas.
  orders: { select: { label: true, contractValue: true, currencyCode: true } },
} as const;

/**
 * Lo que ve un TECNICO. Es un `select` PROPIO y no un subconjunto calculado de LISTA:
 * asi una columna nueva del esquema (o de LISTA) NO puede aparecer aqui sin que alguien
 * la escriba a mano. contractValue / oaNumber / normalHours / currencyCode / clientName
 * son informacion comercial y la decision bloqueada dice «solo nombre y maquinas».
 *
 * Nada de `delete p.contractValue` ni de `omit`: lo que no se pide no se puede filtrar
 * por error.
 */
const LISTA_TECNICO = {
  id: true,
  name: true,
  // Lo que el tecnico elige al registrar el dia. `commessaShort` viaja porque es como
  // la maquina se nombra en obra («3428») y es lo que hace distinguibles dos PL 6000
  // del mismo proyecto — el motivo entero de la Fase 2.1.
  orders: {
    where: { isActive: true },
    select: { id: true, label: true, commessaShort: true, machineModelId: true },
  },
} as const;

export interface DatosProyecto {
  name?: string;
  clientName?: string;
  clientNit?: string | null;
  locality?: string;
  country?: string;
  supply?: string;
  contractNumber?: string;
  normalHours?: number | null;
  isActive?: boolean;
}

interface FilaDetalle {
  id: string;
  name: string;
  clientName: string;
  clientNit: string | null;
  locality: string;
  country: string;
  supply: string;
  contractNumber: string;
  normalHours: number | null;
  isActive: boolean;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soldDays: SoldDaysService,
    private readonly orders: OrdersService,
  ) {}

  /**
   * Sin filtro por `isActive`: igual que el maestro de tecnicos, la lista muestra
   * los inactivos y son los SELECTORES del cliente los que filtran.
   */
  async listar() {
    const filas = await this.prisma.client.project.findMany({
      select: LISTA,
      orderBy: { name: 'asc' },
    });
    return filas.map(({ orders, ...resto }) => ({
      ...resto,
      machineCodes: orders.map((o) => o.label).sort(),
      // Suma de las ordenes, no una columna: J Macedo tiene dos lineas de maquina y
      // CERO importe a nivel de proyecto, asi que persistirlo aqui seria inventarlo.
      contractValue: orders.reduce((t, o) => t + (o.contractValue ? Number(o.contractValue) : 0), 0),
      // Solo si TODAS coinciden: mezclar EUR y USD en un total seria una mentira.
      currencyCode: monedaUnica(orders.map((o) => o.currencyCode)),
    }));
  }

  /**
   * Solo ACTIVOS: «los proyectos cerrados no aparecen en la lista» (decision bloqueada).
   * Los dias YA registrados contra un proyecto cerrado se siguen viendo — eso lo resuelve
   * el `projectName` denormalizado de GET /api/daily-entries (03-04), no este filtro.
   *
   * Se desestructura en vez de hacer `...p`: dos puertas (el `select` y esta lista) en vez
   * de una para que una columna nueva no llegue sola a la respuesta del tecnico.
   */
  async listarParaTecnico() {
    const filas = await this.prisma.client.project.findMany({
      where: { isActive: true },
      select: LISTA_TECNICO,
      orderBy: { name: 'asc' },
    });
    return filas.map(({ id, name, orders }) => ({
      id,
      name,
      orders: [...orders].sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }

  async detalle(id: string) {
    const p = await this.prisma.client.project.findUnique({ where: { id }, select: DETALLE });
    if (!p) throw new NotFoundException('PROYECTO_NO_ENCONTRADO');
    // Las filas de la matriz salen del catalogo de roles, nunca de una lista cableada:
    // el delta lo calcula `sold-days.service.ts` y el cliente solo pinta.
    const [ordenes, { porOrden, sinOrden }] = await Promise.all([
      this.orders.listar(id),
      this.soldDays.porProyecto(id),
    ]);
    // Una matriz POR ORDEN, como las hojas del Excel: JAV pinta tres bloques
    // vendido/ejecutado/delta, uno por maquina contratada.
    return {
      ...this.plano(p),
      orders: ordenes.map((o) => ({ ...o, matrix: porOrden.get(o.id) ?? [] })),
      // Jornadas aprobadas sin orden. Se muestra, no se reparte: repartir a ojo es
      // exactamente el trabajo manual que esta app existe para eliminar.
      unassigned: sinOrden,
    };
  }

  /** `createdById` es rastro de autoria y no tiene FK declarada (decision de 02-01). */
  async crear(actorId: string, data: Required<Omit<DatosProyecto, 'isActive'>>) {
    return this.plano(
      await this.intentar(() =>
        this.prisma.client.project.create({
          data: { ...data, createdById: actorId },
          select: DETALLE,
        }),
      ),
    );
  }

  /** Sirve al PATCH de datos y al de baja: desactivar es un campo, no otra operacion. */
  async editar(id: string, data: DatosProyecto) {
    return this.plano(
      await this.intentar(() =>
        this.prisma.client.project.update({ where: { id }, data, select: DETALLE }),
      ),
    );
  }

  /**
   * Punto unico de salida del proyecto. Ya no convierte importes —se fueron a la
   * orden— pero se queda: es la puerta por la que pasa TODA respuesta de proyecto, y
   * quitarla obligaria a recordar el `select` en cuatro sitios.
   */
  private plano(p: FilaDetalle) {
    return { ...p };
  }

  /**
   * Prisma -> HTTP. `projects` ya no tiene FK propias (la moneda se fue a la orden en
   * la Fase 2.1), pero el P2003 se sigue traduciendo: sin traducir saldria como 500 si
   * alguna fase futura anade una.
   */
  private async intentar<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'P2003') throw new BadRequestException('REFERENCIA_INEXISTENTE');
      if (code === 'P2025') throw new NotFoundException('PROYECTO_NO_ENCONTRADO');
      throw e;
    }
  }
}
