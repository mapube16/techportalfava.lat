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

/** Una semana. Mas dias no es «rellenar la semana», es otra cosa que nadie ha pedido. */
const DIAS_MAX = 7;

/**
 * Los dias del guardado MASIVO: cada uno con SU descripcion, y el resto de la jornada
 * (proyecto, orden, concepto) compartido.
 *
 * La descripcion va por dia y no compartida porque es justo lo unico que cambia entre
 * el lunes y el martes de un mismo montaje. Compartirla obligaria a reabrir el cajon
 * dia por dia para corregirla, que es exactamente la friccion que esto viene a quitar.
 *
 * `days` y no `date`: el validador de la jornada rechaza `date` en el cuerpo a
 * proposito, y esto no debe saltarselo.
 */
function dias(valor: unknown): { date: string; description: string | null }[] {
  if (!Array.isArray(valor) || !valor.length) throw new BadRequestException('DIAS_INVALIDOS');
  if (valor.length > DIAS_MAX) throw new BadRequestException('DEMASIADOS_DIAS');

  const lista = valor.map((v) => {
    const d = v as Record<string, unknown>;
    if (!d || typeof d.date !== 'string') throw new BadRequestException('FECHA_INVALIDA');
    return { date: d.date, description: descripcion(d.description) };
  });
  // Repetido seria escribir dos veces el mismo dia en la misma peticion: el ultimo
  // ganaria en silencio y el tecnico no sabria cual quedo.
  if (new Set(lista.map((d) => d.date)).size !== lista.length)
    throw new BadRequestException('DIAS_REPETIDOS');
  return lista;
}

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
    dayNote: notaDia(body?.dayNote),
    extraOrderIds: ordenesExtra(body?.extraOrderIds),
  };
}

/**
 * BIT-10 — las maquinas ADICIONALES del dia.
 *
 * `undefined` se conserva como `undefined` a proposito: significa «no toques lo que hay».
 * Una lista, aunque venga vacia, reemplaza la seleccion entera. Sin esa distincion no
 * habria forma de dejar un dia con una sola maquina despues de haber marcado tres.
 *
 * El techo son 10: un dia con mas maquinas que eso no es un dia de trabajo, es un error
 * de captura o alguien probando el limite.
 */
function ordenesExtra(valor: unknown): string[] | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return [];
  if (!Array.isArray(valor) || valor.length > 10)
    throw new BadRequestException('ORDENES_EXTRA_INVALIDAS');
  return valor.map((v) => {
    const id = uuid(v, 'ORDEN_INVALIDA');
    if (!id) throw new BadRequestException('ORDEN_INVALIDA');
    return id;
  });
}

/**
 * La nota del dia: corta y opcional. 120 caracteres porque es UNA celda de la fila del
 * PDF — «HORARIO 7 AM - 5 PM», no un segundo parrafo de descripcion; para eso ya esta
 * la descripcion.
 */
function notaDia(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || valor.length > 120)
    throw new BadRequestException('NOTA_DIA_INVALIDA');
  return valor.trim() || null;
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

  /**
   * BIT-06 — la MISMA jornada en varios dias de una vez.
   *
   * Un montaje es cinco dias seguidos en el mismo proyecto, la misma orden y el mismo
   * concepto; lo unico que cambia es la descripcion. Obligar a abrir el cajon cinco
   * veces y reelegir todo cada vez es la razon por la que 6.573 de las 6.574 jornadas
   * del historico del Excel vienen SIN descripcion: rellenar salia caro.
   *
   * TODO O NADA, y sin escribir una linea para conseguirlo: `RlsInterceptor` ya envuelve
   * la peticion entera en UNA transaccion, asi que si el cuarto dia esta bloqueado
   * (BIT-05) los tres anteriores se deshacen solos. Media semana escrita seria peor que
   * ninguna, porque el tecnico no sabria por donde iba.
   */
  @Put()
  guardarVarios(@CurrentUser() actor: UserModel, @Body() body: Cuerpo) {
    const technicianId = this.service.tecnicoDe(actor);
    // `jornada` valida y descarta lo compartido; la descripcion de cada dia viaja en
    // `days` y pisa la del cuerpo, que aqui no significa nada.
    return this.service.guardarVarios(technicianId, dias(body?.days), jornada(body));
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
