import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { UserModel } from '../../generated/prisma/models';
import { ESTADOS } from '../../common/estados';
import type { Gasto } from './nota-pdf';
import type { FirmaEntrada } from './weekly-notes.service';
import { WeeklyNotesService } from './weekly-notes.service';
import { RECIBO_MAX_BYTES } from '../../config/limites';

type Cuerpo = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que el visor de la app sabe pintar. Mismo dominio que el CHECK `er_tipo_admitido`. */
const TIPOS_RECIBO = ['image/jpeg', 'image/png', 'application/pdf'];

// El tope vive en config/limites.ts junto al del cuerpo JSON, que se calcula de el:
// separados se desincronizaron y NOTA-08b quedo rota.



/** El `updated_at` que el cliente leyo. Opcional, pero si viene tiene que ser un ISO. */
function esperado(body: Cuerpo): string | undefined {
  const v = body?.expectedUpdatedAt;
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v)))
    throw new BadRequestException('EXPECTED_UPDATED_AT_INVALIDO');
  return v;
}

function texto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new BadRequestException(`${campo}_REQUERIDO`);
  return valor;
}

/** NOTA-08: como mucho 4, igual que las filas fijas de `bloqueGastos` en nota-pdf.ts. */
function gastos(v: unknown, campo: string): Gasto[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new BadRequestException(`${campo}_INVALIDO`);
  if (v.length > 4) throw new BadRequestException(`${campo}_MAXIMO_4`);
  return v.map((item, i) => {
    if (!item || typeof item !== 'object') throw new BadRequestException(`${campo}_INVALIDO`);
    const o = item as Record<string, unknown>;
    return { descripcion: texto(o.descripcion, `${campo}_${i}_DESCRIPCION`), valor: texto(o.valor, `${campo}_${i}_VALOR`) };
  });
}

/** Una firma del `POST :id/sign`: nombre, la declaracion aceptada EXPLICITAMENTE (no
    basta con omitirla) y el trazo del canvas en base64. */
function firma(v: unknown, campo: string): FirmaEntrada {
  if (!v || typeof v !== 'object') throw new BadRequestException(`${campo}_REQUERIDA`);
  const o = v as Record<string, unknown>;
  const signerName = texto(o.signerName, `${campo}_NOMBRE`);
  if (o.declarationAccepted !== true) throw new BadRequestException(`${campo}_SIN_DECLARACION`);
  if (typeof o.imagePng !== 'string' || o.imagePng.length < 100) throw new BadRequestException(`${campo}_TRAZO`);
  return {
    signerName,
    signerDocument: typeof o.signerDocument === 'string' && o.signerDocument.trim() ? o.signerDocument.trim() : undefined,
    signerRole: typeof o.signerRole === 'string' && o.signerRole.trim() ? o.signerRole.trim() : undefined,
    declarationAccepted: true,
    imagePng: o.imagePng,
  };
}

const quien = (u: UserModel) => ({ id: u.id, name: u.displayName });

/**
 * NOTA-02: una ruta POR TRANSICION. No hay `PATCH /:id { status }` a proposito — con
 * uno, la tabla de transiciones del servicio seria decorativa y cualquier cliente
 * podria saltar de `draft` a `approved`.
 *
 * Los roles se reparten POR METODO porque el flujo los mezcla: enviar es del tecnico,
 * aprobar y devolver del admin, reabrir del Super Admin. La clase se queda en el
 * conjunto mas amplio y cada metodo estrecha.
 */
@Controller('api/weekly-notes')
@Roles('T', 'A', 'S')
export class WeeklyNotesController {
  constructor(private readonly service: WeeklyNotesService) {}

  /**
   * La MISMA consulta sirve a la bandeja del admin y a la lista del tecnico: la
   * politica `wn_read` de RLS filtra por `app.technician_id` cuando no es admin, asi
   * que no hacen falta dos endpoints ni un filtro en el servicio.
   *
   * `technicianId` existe para el caso en que el que pregunta es LAS DOS COSAS: la
   * cuenta del seed es T+A+S, y al entrar en «Mis notas» RLS no le acota nada
   * (is_admin = 'on'), asi que veria las notas de toda la empresa como si fueran suyas
   * —y solo las 200 mas recientes, con lo que las suyas ni siquiera saldrian—. No
   * concede nada: quien no es admin ya estaba acotado por el motor.
   */
  @Get()
  listar(@Query('status') status?: string, @Query('technicianId') technicianId?: string) {
    if (status !== undefined && !(ESTADOS as readonly string[]).includes(status))
      throw new BadRequestException('ESTADO_INVALIDO');
    if (technicianId !== undefined && !UUID.test(technicianId))
      throw new BadRequestException('TECNICO_INVALIDO');
    return this.service.listar(status, technicianId);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detalle(id);
  }

  /**
   * Los siete dias de la nota. Va ANTES que `:id/pdf/...` no por orden de rutas —no
   * colisionan— sino porque es lo que pinta la pantalla antes de ofrecer el PDF.
   *
   * Sirve al admin Y al tecnico: RLS ya decide quien puede leer esa nota.
   */
  @Get(':id/dias')
  dias(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.dias(id);
  }

  /**
   * Fase 5 — la vista previa de antes de firmar. Se sirve inline (no como adjunto):
   * es para pintarla en la app, no para descargarla. `@Res()` porque Nest no sabe mandar
   * un `Buffer` como cuerpo por su cuenta.
   */
  @Get(':id/pdf/preview')
  async previsualizarPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const bytes = await this.service.previsualizarPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="nota-preview.pdf"');
    res.send(bytes);
  }

  /** NOTA-06 — el PDF YA firmado, de la versión actual. 404 hasta que exista `/sign`. */
  @Get(':id/pdf')
  async descargarPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { bytes, version } = await this.service.descargarPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="nota-v${version}.pdf"`);
    res.send(bytes);
  }

  /** Una versión anterior, solo alcanzable tras un `reopen` — es la evidencia de lo que
      el cliente firmó antes de esa reapertura (NOTA-06). Va DESPUÉS de `/pdf` y de
      `/pdf/preview` en el archivo: si fuera antes, `:version` capturaría "preview". */
  @Get(':id/pdf/:version')
  async descargarPdfVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version') version: string,
    @Res() res: Response,
  ) {
    const v = Number(version);
    if (!Number.isInteger(v) || v < 1) throw new BadRequestException('VERSION_INVALIDA');
    const { bytes } = await this.service.descargarPdf(id, v);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="nota-v${v}.pdf"`);
    res.send(bytes);
  }

  /**
   * NOTA-01. El tecnico manda SU semana (el `technician_id` sale del token, nunca del
   * cuerpo) y recibe las notas ya derivadas, una por proyecto.
   */
  @Post('submit')
  @Roles('T')
  enviar(@CurrentUser() actor: UserModel, @Body() body: Cuerpo) {
    if (!actor.technicianId) throw new BadRequestException('USUARIO_SIN_TECNICO');
    return this.service.enviarSemana(quien(actor), actor.technicianId, texto(body?.weekStart, 'SEMANA'));
  }

  @Post(':id/approve')
  @Roles('A', 'S')
  aprobar(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    // CAT-06: aprobar en nombre de un tecnico dado de baja deja rastro de en nombre
    // de QUIEN, que es justo lo que el requisito pide poder auditar.
    const onBehalfOfId = body?.onBehalfOfId;
    if (onBehalfOfId !== undefined && onBehalfOfId !== null && (typeof onBehalfOfId !== 'string' || !UUID.test(onBehalfOfId)))
      throw new BadRequestException('ON_BEHALF_OF_INVALIDO');
    return this.service.approve(quien(actor), id, esperado(body), (onBehalfOfId as string) ?? null);
  }

  /** NOTA-03: sin comentario no se devuelve. Tambien lo impide un CHECK del motor. */
  @Post(':id/return')
  @Roles('A', 'S')
  devolver(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    return this.service.return_(quien(actor), id, texto(body?.reason, 'COMENTARIO'), esperado(body));
  }

  /** Deshacer una aprobacion no es rutina: Super Admin y con motivo. */
  @Post(':id/reopen')
  @Roles('S')
  reabrir(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    return this.service.reopen(quien(actor), id, texto(body?.reason, 'MOTIVO'), esperado(body));
  }

  /** NOTA-09: el cargo de ESA semana. Recurso aparte, como los dias vendidos. */
  @Put(':id/role')
  @Roles('A', 'S')
  fijarCargo(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    const v = body?.roleTypeId;
    if (v !== null && (typeof v !== 'string' || !UUID.test(v)))
      throw new BadRequestException('ROL_TECNICO_INVALIDO');
    return this.service.fijarCargo(quien(actor), id, v as string | null);
  }

  // ── NOTA-08b: comprobantes de gasto ──

  /** La lista, SIN bytes. Admin y técnico: RLS ya decide de quién es la nota. */
  @Get(':id/receipts')
  recibos(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.recibos(id);
  }

  /**
   * Sube un comprobante. Base64 en JSON y no multipart, siguiendo a las firmas
   * (`imagePng`): un parser de formularios seria una dependencia mas para el unico
   * otro sitio del repo que sube bytes.
   *
   * EL TAMANO SE MIDE AQUI, sobre los bytes ya decodificados, no sobre la cadena que
   * llega: base64 infla un 33 % y un tope sobre el texto dejaria pasar ficheros mas
   * grandes de lo previsto. El motor lo vuelve a comprobar con `er_tamano_razonable`.
   */
  @Post(':id/receipts')
  @Roles('T')
  subirRecibo(
    @CurrentUser() actor: UserModel,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Cuerpo,
  ) {
    const label = texto(body?.label, 'ETIQUETA');
    const mimeType = String(body?.mimeType ?? '');
    if (!TIPOS_RECIBO.includes(mimeType)) throw new BadRequestException('TIPO_NO_ADMITIDO');

    const b64 = typeof body?.dataBase64 === 'string' ? body.dataBase64 : '';
    if (!b64) throw new BadRequestException('ARCHIVO_VACIO');
    const bytes = Buffer.from(b64, 'base64');
    if (!bytes.length) throw new BadRequestException('ARCHIVO_VACIO');
    if (bytes.length > RECIBO_MAX_BYTES) throw new BadRequestException('ARCHIVO_DEMASIADO_GRANDE');

    return this.service.subirRecibo(actor.id, id, { label, mimeType, bytes });
  }

  /** Los bytes de uno. Inline: es para verlo en la pantalla, no para bajarlo. */
  @Get(':id/receipts/:receiptId')
  async verRecibo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Res() res: Response,
  ) {
    const r = await this.service.recibo(id, receiptId);
    res.setHeader('Content-Type', r.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.send(r.bytes);
  }

  /** Se borra y se sube otro: no hay UPDATE, ni privilegio ni politica. */
  @Delete(':id/receipts/:receiptId')
  @Roles('T')
  borrarRecibo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
  ) {
    return this.service.borrarRecibo(id, receiptId);
  }

  /** NOTA-08: recurso aparte, como el cargo — y con el mismo candado (se bloquea al firmar). */
  @Put(':id/expenses')
  @Roles('T')
  fijarGastos(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    return this.service.gastos(
      quien(actor),
      id,
      gastos(body?.gastosTecnico, 'GASTOS_TECNICO'),
      gastos(body?.anticiposCliente, 'ANTICIPOS_CLIENTE'),
    );
  }

  /**
   * Fase 5 — el técnico firma y, presente en el sitio, el cliente. Las dos firmas
   * llegan JUNTAS: ver el comentario de `WeeklyNotesService.firmar`.
   */
  @Post(':id/sign')
  @Roles('T')
  firmar(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo, @Req() req: Request) {
    return this.service.firmar(quien(actor), id, {
      technician: firma(body?.technician, 'FIRMA_TECNICO'),
      // Si viene, se valida igual de duro; si no viene, no pasa nada. El cliente firma
      // el papel impreso, no el movil del tecnico.
      client: body?.client == null ? null : firma(body.client, 'FIRMA_CLIENTE'),
      expectedUpdatedAt: esperado(body),
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
