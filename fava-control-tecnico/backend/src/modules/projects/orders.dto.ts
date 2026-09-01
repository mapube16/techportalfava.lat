import { BadRequestException } from '@nestjs/common';
import type { DatosOrden } from './orders.service';

type Cuerpo = Record<string, unknown>;

/** `ParseUUIDPipe` solo cubre el path; en el body un uuid mal formado seria un 500 (22P02). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ISO-4217: exactamente 3 letras (mismo criterio que el catalogo de monedas). */
const ISO_4217 = /^[A-Za-z]{3}$/;

export function texto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new BadRequestException(`${campo}_INVALIDO`);
  return valor.trim();
}

/** Opcional de verdad: ausente, `null` y cadena vacia son lo mismo (null). */
export function opcional(valor: unknown, campo: string): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') throw new BadRequestException(`${campo}_INVALIDO`);
  return valor.trim() || null;
}

/**
 * `@db.Decimal(14, 2)`: 12 digitos enteros. Sin el techo, un valor mayor es un
 * `numeric field overflow` del motor (22003) convertido en 500.
 */
export function valorContrato(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 1e12)
    throw new BadRequestException('VALOR_CONTRATO_INVALIDO');
  return valor;
}

export function moneda(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string' || !ISO_4217.test(valor.trim()))
    throw new BadRequestException('CODIGO_MONEDA_INVALIDO');
  return valor.trim().toUpperCase();
}

/**
 * Los campos opcionales de una orden. Vive aparte porque lo comparten el POST (bajo el
 * proyecto) y el PATCH (bajo la orden), que estan en controladores distintos.
 */
export function camposOrden(body: Cuerpo): DatosOrden {
  const data: DatosOrden = {};
  if (body?.machineModelId !== undefined) {
    const v = body.machineModelId;
    if (v !== null && (typeof v !== 'string' || !UUID.test(v)))
      throw new BadRequestException('MAQUINA_INVALIDA');
    data.machineModelId = (v as string | null) ?? null;
  }
  /**
   * El modelo por CODIGO, escrito a mano («PC 2000»), no por id de un desplegable.
   * En la capacitacion del 31-ago la maquina del proyecto nuevo no estaba en el
   * catalogo y crear el proyecto obligaba a irse a Configuracion, darla de alta y
   * volver. El servicio lo busca y lo crea si no existe (ver `resolverModelo`).
   * Convive con `machineModelId`: el PATCH por id sigue valiendo.
   */
  if (body?.machineModel !== undefined)
    data.machineModel = opcional(body.machineModel, 'MODELO');
  if (body?.commessa !== undefined) data.commessa = opcional(body.commessa, 'COMMESSA');
  if (body?.commessaShort !== undefined)
    data.commessaShort = opcional(body.commessaShort, 'COMMESSA_CORTA');
  if (body?.oaNumber !== undefined) data.oaNumber = opcional(body.oaNumber, 'OA');
  if (body?.contractValue !== undefined) data.contractValue = valorContrato(body.contractValue);
  if (body?.currencyCode !== undefined) data.currencyCode = moneda(body.currencyCode);
  return data;
}
