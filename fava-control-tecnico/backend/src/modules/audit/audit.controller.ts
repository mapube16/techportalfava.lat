import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Roles } from '../../common/auth/roles.decorator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las mismas de `Rastro.action`. Se valida en vez de pasar la cadena tal cual: es un
    parametro de consulta, y lo que entra de fuera se comprueba en la frontera. */
const ACCIONES = new Set([
  'submit',
  'approve',
  'return',
  'reopen',
  'sign',
  'update',
  'deactivate',
]);

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
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
  ) {
    if (entityId !== undefined && !UUID.test(entityId))
      throw new BadRequestException('ENTITY_ID_INVALIDO');
    // Un filtro vacio (`?action=`) es no filtrar, no un filtro invalido: el navegador
    // manda la clave con la cadena vacia en cuanto el desplegable vuelve a «Todas».
    const accion = action || undefined;
    if (accion !== undefined && !ACCIONES.has(accion))
      throw new BadRequestException('ACTION_INVALIDA');
    const desde = from || undefined;
    const hasta = to || undefined;
    for (const [v, e] of [
      [desde, 'FROM_INVALIDO'],
      [hasta, 'TO_INVALIDO'],
    ] as const)
      if (v !== undefined && Number.isNaN(Date.parse(v))) throw new BadRequestException(e);
    const n = take === undefined ? undefined : Number(take);
    if (n !== undefined && !Number.isInteger(n)) throw new BadRequestException('TAKE_INVALIDO');
    return this.service.listar({ entity, entityId, action: accion, desde, hasta, take: n });
  }
}
