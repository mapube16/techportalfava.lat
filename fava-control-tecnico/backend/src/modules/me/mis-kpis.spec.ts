/**
 * `utilizacionDe()` tiene que dar lo MISMO que la fila del técnico en el tablero del
 * admin: si un día se desvían, la misma persona tiene dos utilizaciones.
 */
import { type MiConcepto, utilizacionDe } from './mis-kpis.service';

const c = (code: MiConcepto['code'], days: number): MiConcepto => ({
  code,
  labelEs: code,
  labelIt: code,
  days,
});

describe('utilizacionDe', () => {
  it('productivos sobre disponibles, con el medio día valiendo 1', () => {
    // 10 DC + 2 MD = 12 productivos; 3 LR no productivos pero disponibles.
    const u = utilizacionDe([c('DC', 10), c('MD', 2), c('LR', 3)]);
    expect(u).toEqual({ productive: 12, denominator: 15, pct: 80 });
  });

  it('la incapacidad queda FUERA del denominador entero', () => {
    const u = utilizacionDe([c('DC', 9), c('IL', 5)]);
    expect(u).toEqual({ productive: 9, denominator: 9, pct: 100 });
  });

  it('sin días disponibles no hay porcentaje: null, no 0', () => {
    expect(utilizacionDe([])).toEqual({ productive: 0, denominator: 0, pct: null });
    expect(utilizacionDe([c('IL', 4)]).pct).toBeNull();
  });
});
