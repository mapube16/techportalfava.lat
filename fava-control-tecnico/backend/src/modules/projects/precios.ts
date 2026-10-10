import { BadRequestException } from '@nestjs/common';
import type { UserModel } from '../../generated/prisma/models';

/**
 * EL PRECIO ES SOLO DEL ROL A (decision del usuario, 2026-10-09: «lo importante es que
 * solo Andrea pueda verlos»).
 *
 * El importe y la moneda de la orden (`contract_value`, `currency_code`) son lo unico
 * del sistema que es un precio. S administra el sistema —catalogos, usuarios,
 * auditoria— y ademas puede todo lo de A, salvo esto. Los roles son acumulativos: quien
 * tenga A los ve aunque tambien tenga S; quien no tenga A, no. Para que solo Andrea los
 * vea basta con que solo Andrea tenga A.
 *
 * No va por RLS: las politicas filtran FILAS, no columnas, y A y S comparten el rol de
 * base de datos (`app.is_admin`). Va por proyeccion, igual que `LISTA_TECNICO`: un
 * `select` sin esas columnas, no un `omit` que una columna nueva pueda esquivar.
 */
export const vePrecios = (u: UserModel): boolean => u.roles.includes('A');

/**
 * Quien no ve el precio tampoco lo escribe. Rechaza con nombre en vez de descartar en
 * silencio: aceptar `contractValue` y tirarlo dejaria creer al cliente que se guardo
 * (mismo criterio que `CAMPO_CALCULADO_NO_ADMITIDO`). Pura, para probarla sin BD.
 */
export function soloConPrecio<T extends object>(datos: T, conPrecio: boolean): T {
  if (!conPrecio && ('contractValue' in datos || 'currencyCode' in datos))
    throw new BadRequestException('PRECIO_SOLO_ADMIN');
  return datos;
}
