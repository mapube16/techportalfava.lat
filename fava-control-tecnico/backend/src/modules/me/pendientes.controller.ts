import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { UserModel } from '../../generated/prisma/models';
import { PendientesService } from './pendientes.service';

/**
 * Los pendientes del PROPIO tecnico. Bajo `/api/me` por lo mismo que sus KPIs: todo lo
 * que hay aqui es del que pregunta, y el `technicianId` nunca viaja por parametro.
 */
@Controller('api/me/pendientes')
@Roles('T')
export class PendientesController {
  constructor(private readonly service: PendientesService) {}

  @Get()
  mios(@CurrentUser() actor: UserModel) {
    return this.service.mios(this.service.tecnicoDe(actor));
  }
}
