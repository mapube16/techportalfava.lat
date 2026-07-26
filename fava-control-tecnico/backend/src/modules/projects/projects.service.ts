import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SoldDaysService } from './sold-days.service';

/**
 * Prisma representa `@db.Decimal` con el Decimal de decimal.js. VERIFICADO contra
 * el motor en este repo: `JSON.stringify(project)` emite `{"contractValue":"4150000.5"}`
 * — un STRING, y de paso pierde el decimal fijo. `money()` del frontend hace
 * `v.toLocaleString()` sobre eso.
 *
 * Los valores de contrato reales (~4,15 M con 2 decimales) estan muy por debajo de
 * 2^53, asi que `Number` es exacto. La conversion es EXPLICITA para que la respuesta
 * sea la misma independientemente de como serialice Nest.
 */
type Dinero = { toString(): string } | null;
const dinero = (v: Dinero): number | null => (v === null ? null : Number(v));

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
  // ── Comercial ──
  oaNumber: true,
  contractValue: true,
  currencyCode: true,
  normalHours: true,
  isActive: true,
} as const;

/** El listado no necesita el encabezado completo: `Projects.tsx` no lo muestra. */
const LISTA = {
  id: true,
  name: true,
  clientName: true,
  country: true,
  oaNumber: true,
  contractNumber: true,
  contractValue: true,
  currencyCode: true,
  normalHours: true,
  isActive: true,
  // Los codigos de los chips salen de un include, no de N+1 consultas.
  machines: { select: { machineModel: { select: { code: true } } } },
} as const;

export interface DatosProyecto {
  name?: string;
  clientName?: string;
  clientNit?: string | null;
  locality?: string;
  country?: string;
  supply?: string;
  contractNumber?: string;
  oaNumber?: string | null;
  contractValue?: number | null;
  currencyCode?: string | null;
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
  oaNumber: string | null;
  contractValue: Dinero;
  currencyCode: string | null;
  normalHours: number | null;
  isActive: boolean;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soldDays: SoldDaysService,
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
    return filas.map(({ machines, contractValue, ...resto }) => ({
      ...resto,
      contractValue: dinero(contractValue),
      machineCodes: machines.map((m) => m.machineModel.code).sort(),
    }));
  }

  async detalle(id: string) {
    const p = await this.prisma.client.project.findUnique({ where: { id }, select: DETALLE });
    if (!p) throw new NotFoundException('PROYECTO_NO_ENCONTRADO');
    // Las filas de la matriz salen del catalogo de roles, nunca de una lista cableada:
    // el delta lo calcula `sold-days.service.ts` y el cliente solo pinta.
    const [machines, matrix] = await Promise.all([this.maquinas(id), this.soldDays.matriz(id)]);
    return { ...this.plano(p), machines, matrix };
  }

  /**
   * Reemplaza la seleccion completa dentro de la MISMA transaccion de la peticion (la
   * abre el RlsInterceptor; una $transaction anidada aqui seria un P2028).
   *
   * `project_machines` es seleccion pura y NADA la referencia, asi que sus filas se
   * borran de verdad: no es un maestro y la regla «desactivar nunca borrar» no aplica.
   *
   * IMPORTANTE: `daily_entries.machine_model_id` apunta a `machine_models` — el
   * catalogo GLOBAL —, nunca a esta fila de seleccion. Si apuntara aqui, quitar una
   * maquina de un proyecto seria un FK roto o un borrado en cascada de bitacora, y la
   * decision bloqueada «se avisa y se permite» no se podria cumplir. El aviso lo da la
   * UI con el `entryCount`; el servidor permite.
   */
  async fijarMaquinas(projectId: string, machineModelIds: string[]) {
    const ids = [...new Set(machineModelIds)];
    const c = this.prisma.client;

    // Se comprueba ANTES de borrar: asi «todo o nada» no depende de deshacer una
    // transaccion que el error del motor ya habria dejado abortada (25P02).
    const [proyecto, existentes] = await Promise.all([
      c.project.findUnique({ where: { id: projectId }, select: { id: true } }),
      ids.length ? c.machineModel.count({ where: { id: { in: ids } } }) : Promise.resolve(0),
    ]);
    if (!proyecto) throw new NotFoundException('PROYECTO_NO_ENCONTRADO');
    if (existentes !== ids.length) throw new BadRequestException('MAQUINA_INEXISTENTE');

    await c.projectMachine.deleteMany({ where: { projectId } });
    if (ids.length)
      await c.projectMachine.createMany({
        data: ids.map((machineModelId) => ({ projectId, machineModelId })),
      });

    return this.maquinas(projectId);
  }

  /**
   * `entryCount` sale de UN groupBy sobre `daily_entries`, no de un count por maquina
   * en bucle. Es el dato que necesita la UI para avisar antes de quitar una maquina
   * que ya tiene bitacora.
   */
  private async maquinas(projectId: string) {
    const c = this.prisma.client;
    const [seleccion, jornadas] = await Promise.all([
      c.projectMachine.findMany({
        where: { projectId },
        select: { machineModelId: true, machineModel: { select: { code: true, description: true } } },
      }),
      c.dailyEntry.groupBy({ by: ['machineModelId'], where: { projectId }, _count: { _all: true } }),
    ]);

    const conteo = new Map(jornadas.map((j) => [j.machineModelId, j._count._all]));
    return seleccion
      .map((m) => ({
        machineModelId: m.machineModelId,
        code: m.machineModel.code,
        description: m.machineModel.description,
        entryCount: conteo.get(m.machineModelId) ?? 0,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
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

  private plano(p: FilaDetalle) {
    return { ...p, contractValue: dinero(p.contractValue) };
  }

  /**
   * Prisma -> HTTP. El unico FK de `projects` es `currency_code`, asi que un P2003
   * solo puede ser una moneda inexistente; sin traducir saldria como 500.
   */
  private async intentar<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'P2003') throw new BadRequestException('MONEDA_INEXISTENTE');
      if (code === 'P2025') throw new NotFoundException('PROYECTO_NO_ENCONTRADO');
      throw e;
    }
  }
}
