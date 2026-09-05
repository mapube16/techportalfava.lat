/**
 * Las tres reglas puras de la liquidación, sin base: el corte 26 → 25, la prioridad
 * del estado, y qué concepto no aplica a qué tipo de técnico. Si alguna se cae,
 * Andrea paga un día en el mes equivocado, o cierra un mes que no está cerrado.
 */
import { aplica, celda, estadoDe, rangoDe } from './liquidacion.service';

describe('rangoDe', () => {
  it('corte: del 26 del mes anterior al 25 de este', () => {
    expect(rangoDe('2026-08', 'cut')).toEqual({ from: '2026-07-26', to: '2026-08-25' });
  });

  it('corte: enero arranca en diciembre del año anterior', () => {
    expect(rangoDe('2027-01', 'cut')).toEqual({ from: '2026-12-26', to: '2027-01-25' });
  });

  it('corte: marzo arranca el 26 de febrero aunque febrero sea corto', () => {
    expect(rangoDe('2026-03', 'cut')).toEqual({ from: '2026-02-26', to: '2026-03-25' });
  });

  it('calendario: del 1 al último día, incluido febrero bisiesto', () => {
    expect(rangoDe('2026-08', 'calendar')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(rangoDe('2028-02', 'calendar')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(rangoDe('2026-12', 'calendar')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('un periodo que no es YYYY-MM se rechaza', () => {
    expect(() => rangoDe('2026-13', 'cut')).toThrow();
    expect(() => rangoDe('agosto', 'cut')).toThrow();
  });
});

describe('estadoDe', () => {
  it('lo que impide cerrar va primero: sin enviar > sin aprobar > listo > sin días', () => {
    expect(estadoDe({ approved: 10, submitted: 2, draftWeeks: 1 })).toEqual({ kind: 'unsent', n: 1 });
    expect(estadoDe({ approved: 10, submitted: 2, draftWeeks: 0 })).toEqual({ kind: 'unapproved', n: 2 });
    expect(estadoDe({ approved: 10, submitted: 0, draftWeeks: 0 })).toEqual({ kind: 'ready' });
    expect(estadoDe({ approved: 0, submitted: 0, draftWeeks: 0 })).toEqual({ kind: 'none' });
  });
});

describe('celda', () => {
  it('«—» solo cuando el concepto no aplica Y no hay días; un día que existe se pinta', () => {
    expect(celda(false, undefined)).toEqual({ approved: null, pending: 0 });
    expect(celda(false, { approved: 0, pending: 0 })).toEqual({ approved: null, pending: 0 });
    // NR de un interno: el servidor lo permite y no puede desaparecer de la nómina.
    expect(celda(false, { approved: 2, pending: 0 })).toEqual({ approved: 2, pending: 0 });
    expect(celda(false, { approved: 0, pending: 1 })).toEqual({ approved: 0, pending: 1 });
    expect(celda(true, undefined)).toEqual({ approved: 0, pending: 0 });
  });
});

describe('aplica', () => {
  it('LR solo a internos, NR solo a externos, el resto a todos', () => {
    expect(aplica('LR', 'EXTERNO')).toBe(false);
    expect(aplica('NR', 'INTERNO')).toBe(false);
    expect(aplica('LR', 'INTERNO')).toBe(true);
    expect(aplica('NR', 'EXTERNO')).toBe(true);
    expect(aplica('DC', 'EXTERNO')).toBe(true);
  });
});
