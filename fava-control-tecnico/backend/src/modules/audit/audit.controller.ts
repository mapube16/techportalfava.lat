import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Roles } from '../../common/auth/roles.decorator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AUD-02 — el visor, solo del Super Admin.
 *
 * La politica `al_read` de RLS deja leer a cualquier ADMIN, no solo al Super: la GUC
 * `app.is_admin` no distingue A de S y anadir una cuarta solo para esto tocaria
 * `rls.interceptor.ts`, que es compartido. El estrechamiento lo hace este @Roles('S'),
 * igual que en el resto del esquema.
 *
 * Sin POST, PATCH ni DELETE: el log lo escribe el servidor cuando ocurre algo, nunca un
 * cliente. Y aunque existiera la ruta, el motor no tiene politica de UPDATE ni DELETE
 * sobre la tabla.
 */
@Controller('api/audit')
@Roles('S')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  listar(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('take') take?: string,
  ) {
    if (entityId !== undefined && !UUID.test(entityId))
      throw new BadRequestException('ENTITY_ID_INVALIDO');
    const n = take === undefined ? undefined : Number(take);
    if (n !== undefined && !Number.isInteger(n)) throw new BadRequestException('TAKE_INVALIDO');
    return this.service.listar({ entity, entityId, take: n });
  }
}
