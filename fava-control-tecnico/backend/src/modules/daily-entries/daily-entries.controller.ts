import { BadRequestException, Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ConceptCode, Phase } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { DailyEntriesService, type Jornada } from './daily-entries.service';

type Cuerpo = Record<string, unknown>;

/** Los enums de Postgres, no listas copiadas a mano (patron del repo desde 02-03). */
const CONCEPTOS: string[] = Object.values(ConceptCode);
const FASES: string[] = Object.values(Phase);

/** `ParseUUIDPipe` solo cubre el path; en el body un uuid mal formado seria un 500 (22P02). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El cuerpo de la Nota Semanal imprime esto: 2000 caracteres son 25 lineas de PDF. */
const DESCRIPCION_MAX = 2000;

/**
 * Los campos que el SERVIDOR gobierna. Aceptarlos y descartarlos en silencio dejaria
 * creer al cliente que se guardaron (mismo criterio que `CAMPO_CALCULADO_NO_ADMITIDO`
 * en el PUT de dias vendidos):
 *  - `technicianId` sale de `req.user`, que es de donde sale la GUC `app.technician_id`.
 *  - `status` lo gobierna la Fase 4 (BIT-05).
 */
const DEL_SERVIDOR = ['technicianId', 'status'];

function uuid(valor: unknown, codigo: string): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'string' || !UUID.test(valor)) throw new BadRequestException(codigo);
  return valor;
}

function deLista(valor: unknown, lista: string[], codigo: string): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'string' || !lista.includes(valor)) throw new BadRequestException(codigo);
  return valor;
}

function descripcion(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string' || valor.length > DESCRIPCION_MAX)
    throw new BadRequestException('DESCRIPCION_INVALIDA');
  return valor.trim() || null;
}

/**
 * FORMA del cuerpo, aqui; SEMANTICA (ventana, concepto<->proyecto, maquina del
 * proyecto), en el servicio y siempre ANTES de escribir.
 *
 * La fecha viaja en la URL y NUNCA en el cuerpo: dos fuentes de verdad para el mismo
 * dato es un bug esperando. Mismo criterio que `RECURSO_APARTE` en 02-05.
 */
function jornada(body: Cuerpo): Jornada {
  if (body && 'date' in body) throw new BadRequestException('FECHA_EN_EL_CUERPO');
  if (body && DEL_SERVIDOR.some((campo) => campo in body))
    throw new BadRequestException('CAMPO_NO_ADMITIDO');

  return {
    projectId: uuid(body?.projectId, 'PROYECTO_INVALIDO'),
    // La maquina se elige por ORDEN, no por modelo: dos PL 6000 del mismo proyecto
    // son el mismo modelo y solo se distinguen por la commessa de su orden.
    orderId: uuid(body?.orderId, 'ORDEN_INVALIDA'),
    inFactory: body?.inFactory === true,
    conceptCode: deLista(body?.conceptCode, CONCEPTOS, 'CONCEPTO_INVALIDO') as Jornada['conceptCode'],
    phase: deLista(body?.phase, FASES, 'FASE_INVALIDA') as Jornada['phase'],
    description: descripcion(body?.description),
  };
}

/**
 * La bitacora es del TECNICO: `@Roles('T')` en la clase y ningun metodo lo relaja.
 *
 * DECISION: no existe `?technicianId=` para administradores. La lectura de la semana
 * ajena es la pantalla de aprobacion de la Fase 4, que llega con su propia
 * autorizacion y su propia pantalla; un parametro aqui seria una regla de permisos que
 * nadie usa y que nadie defiende con un test. RLS ya deja leer al admin
 * (`app.is_admin = 'on'`), asi que el dia que haga falta es una linea, no un rediseño.
 *
 * Ruta completa en el decorador: sin `setGlobalPrefix` (doctrina de 01-01).
 */
@Controller('api/daily-entries')
@Roles('T')
export class DailyEntriesController {
  constructor(private readonly service: DailyEntriesService) {}

  @Get()
  semana(
    @CurrentUser() actor: UserModel,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.semana(this.service.tecnicoDe(actor), from, to);
  }

  @Put(':date')
  guardar(
    @CurrentUser() actor: UserModel,
    @Param('date') date: string,
    @Body() body: Cuerpo,
  ) {
    // El 409 va primero: sin vinculo no hay nada que validar ni donde escribir.
    const technicianId = this.service.tecnicoDe(actor);
    return this.service.guardar(technicianId, date, jornada(body));
  }
}
