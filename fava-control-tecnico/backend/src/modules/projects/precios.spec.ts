import { BadRequestException } from '@nestjs/common';
import type { UserModel } from '../../generated/prisma/models';
import { soloConPrecio, vePrecios } from './precios';

const con = (roles: UserModel['roles']) => ({ roles }) as UserModel;

/** El precio es solo del rol A. Los roles se acumulan: A + S sigue viendo. */
describe('vePrecios', () => {
  it('A lo ve, con o sin otros roles', () => {
    expect(vePrecios(con(['A']))).toBe(true);
    expect(vePrecios(con(['T', 'A', 'S']))).toBe(true);
  });

  it('sin A no lo ve, aunque sea super admin', () => {
    expect(vePrecios(con(['S']))).toBe(false);
    expect(vePrecios(con(['T']))).toBe(false);
  });
});

describe('soloConPrecio: quien no ve el precio tampoco lo escribe', () => {
  it('con permiso, pasa todo', () => {
    const d = { label: 'PL 6000', contractValue: 1, currencyCode: 'EUR' };
    expect(soloConPrecio(d, true)).toBe(d);
  });

  it('sin permiso, pasa lo que no es precio', () => {
    const d = { label: 'PL 6000', oaNumber: '0159103' };
    expect(soloConPrecio(d, false)).toBe(d);
  });

  it('sin permiso, el importe o la moneda se rechazan con nombre (incluso a null)', () => {
    expect(() => soloConPrecio({ contractValue: 100 }, false)).toThrow(BadRequestException);
    expect(() => soloConPrecio({ currencyCode: null }, false)).toThrow('PRECIO_SOLO_ADMIN');
  });
});
