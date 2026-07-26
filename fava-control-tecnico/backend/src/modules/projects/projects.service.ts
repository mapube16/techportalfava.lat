import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
    return this.plano(p);
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
