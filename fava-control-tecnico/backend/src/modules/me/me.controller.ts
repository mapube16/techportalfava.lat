import { BadRequestException, Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AllowUnprovisioned } from '../../common/auth/allow-unprovisioned.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { LANGS } from '../../common/notifications/plantillas';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Role } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';

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
        /**
         * INTERNO | EXTERNO | null (sin ficha de tecnico). La pantalla lo usa para no
         * ofrecer el libre remunerado a un externo — la regla dura vive en el servidor.
         */
        employmentType: string | null;
        /** Idioma de sus correos (Fase 9). 'es' | 'it' | 'pt'. */
        lang: string;
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
      const { id, displayName, email, roles, technicianId, lang } = req.user;
      const tec = technicianId
        ? await this.prisma.base.technician.findUnique({
            where: { id: technicianId },
            select: { employmentType: true },
          })
        : null;
      return {
        status: 'ok',
        user: { id, displayName, email, roles, technicianId, employmentType: tec?.employmentType ?? null, lang },
      };
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

  /**
   * Fase 9 — persistir el idioma que el usuario ya elige con el boton del encabezado.
   *
   * Existe porque los correos se escriben desde el SERVIDOR y hasta ahora el idioma
   * vivia solo en el estado de React: la app sabia hablar italiano y el correo no.
   * Se rellena SOLO, con el uso, en vez de pedirle a nadie que rellene una columna.
   *
   * Sin `@Roles`: cambiar el idioma de UNO MISMO no es una capacidad de admin, y el id
   * sale del token, nunca del cuerpo.
   */
  @Put('lang')
  async fijarIdioma(@CurrentUser() actor: UserModel, @Body() body: { lang?: unknown }) {
    const lang = String(body?.lang ?? '');
    // Se valida aqui ADEMAS del CHECK del motor: un 400 dice cual es el problema y un
    // 23514 de Postgres sale como 500 sin explicar nada.
    if (!(LANGS as readonly string[]).includes(lang))
      throw new BadRequestException('IDIOMA_INVALIDO');

    await this.prisma.client.user.update({ where: { id: actor.id }, data: { lang } });
    return { lang };
  }
}
