import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AllowUnprovisioned } from '../../common/auth/allow-unprovisioned.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Role } from '../../generated/prisma/enums';

/**
 * Contrato consumido literalmente por frontend/src/lib/api/client.ts.
 * Cambiar un nombre de campo aqui = pantalla en blanco tras el login.
 */
export type MeResponse =
  | {
      status: 'ok';
      user: {
        id: string;
        displayName: string;
        email: string;
        roles: Role[];
        technicianId: string | null;
      };
    }
  | { status: 'not_invited'; entra: { displayName: string; email: string }; requestPending: boolean }
  | { status: 'deactivated'; entra: { displayName: string; email: string } };

// Sin prefijo global en el proyecto: la ruta va completa (decision del Plan 01-01).
@Controller('api/me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El unico endpoint que responde algo util sin usuario aprovisionado: las tres
   * pantallas del CONTEXT (dentro / sin acceso / desactivado) tienen que
   * distinguirse, y un 403 pelado no las distingue.
   */
  @Get()
  @AllowUnprovisioned()
  async me(@Req() req: Request): Promise<MeResponse> {
    if (req.user) {
      const { id, displayName, email, roles, technicianId } = req.user;
      return { status: 'ok', user: { id, displayName, email, roles, technicianId } };
    }

    // biome-ignore lint: el guard garantiza req.entra en toda ruta con token.
    const entra = req.entra!;
    const identidad = { displayName: entra.name, email: req.dbUser?.email ?? entra.email };
    // dbUser existe y no esta activo: el guard ya lo resolvio, sin segunda consulta.
    if (req.dbUser) return { status: 'deactivated', entra: identidad };

    const solicitud = await this.prisma.base.accessRequest.findUnique({
      where: { entraOid: entra.oid },
      select: { status: true },
    });
    return {
      status: 'not_invited',
      entra: identidad,
      requestPending: solicitud?.status === 'pending',
    };
  }
}
