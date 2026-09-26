import { ConflictException } from '@nestjs/common';
import { estadoAdmin } from './daily-entries.service';

/**
 * La tabla del plan, fila por fila. Sin base de datos: la funcion recibe las notas ya
 * consultadas (la del proyecto nuevo primero, la del anterior despues).
 */
describe('estadoAdmin: con que estado queda un dia que guarda la admin', () => {
  const con = (status: string) => ({ status });

  it('sin nota → aprobado directo (agregar a mano)', () => {
    expect(estadoAdmin([null, null])).toBe('approved');
    expect(estadoAdmin([null])).toBe('approved');
  });

  it('nota en borrador o devuelta → el dia hereda el estado', () => {
    expect(estadoAdmin([con('draft'), null])).toBe('draft');
    expect(estadoAdmin([con('returned'), null])).toBe('returned');
  });

  it('nota aprobada → 409 NOTA_APROBADA_DESAPRUEBA', () => {
    expect(() => estadoAdmin([con('approved'), null])).toThrow(ConflictException);
    expect(() => estadoAdmin([con('approved')])).toThrow('NOTA_APROBADA_DESAPRUEBA');
  });

  it('nota enviada → 409 NOTA_EN_REVISION', () => {
    expect(() => estadoAdmin([con('submitted'), null])).toThrow('NOTA_EN_REVISION');
  });

  it('la nota del proyecto ANTERIOR tambien manda: sacar un dia de una aprobada es 409', () => {
    expect(() => estadoAdmin([null, con('approved')])).toThrow('NOTA_APROBADA_DESAPRUEBA');
    expect(() => estadoAdmin([con('draft'), con('submitted')])).toThrow('NOTA_EN_REVISION');
  });
});
