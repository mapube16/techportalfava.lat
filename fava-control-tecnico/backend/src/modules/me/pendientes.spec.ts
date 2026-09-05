/**
 * `agruparSemanas()` es donde estan las trampas de los pendientes, y por eso es pura y
 * se prueba sin base. Si un caso se cae, al tecnico le sale una semana que no le falta
 * o le deja de salir una que si.
 */
import { type FilaJornada, agruparSemanas } from './pendientes.service';

const fila = (date: string, status = 'approved', conceptCode: string | null = 'DC'): FilaJornada => ({
  date,
  status,
  conceptCode,
});

describe('agruparSemanas', () => {
  // Ventana de tres semanas: lunes 17-ago .. domingo 6-sep de 2026.
  const MIN = '2026-08-17';
  const MAX = '2026-09-06';

  it('una semana por cada lunes de la ventana, aunque no tenga jornadas', () => {
    const s = agruparSemanas(MIN, MAX, []);
    expect(s.map((x) => x.lunes)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31']);
    expect(s.every((x) => x.registrados === 0 && x.borradores === 0)).toBe(true);
  });

  it('la ventana que no empieza en lunes arranca en el lunes de esa semana', () => {
    // El suelo de ventana() es el dia 1, que cae en cualquier dia de la semana.
    const s = agruparSemanas('2026-09-03', '2026-09-06', []);
    expect(s.map((x) => x.lunes)).toEqual(['2026-08-31']);
  });

  it('el domingo pertenece a SU lunes, no al siguiente', () => {
    const s = agruparSemanas(MIN, MAX, [fila('2026-08-23')]);
    expect(s[0]).toEqual({ lunes: '2026-08-17', registrados: 1, borradores: 0 });
    expect(s[1].registrados).toBe(0);
  });

  it('cuenta registrados y borradores por separado', () => {
    const s = agruparSemanas(MIN, MAX, [
      fila('2026-08-24', 'approved'),
      fila('2026-08-25', 'draft'),
      fila('2026-08-26', 'draft'),
    ]);
    expect(s[1]).toEqual({ lunes: '2026-08-24', registrados: 3, borradores: 2 });
  });

  it('una jornada vacia (gasto sin concepto) es borrador pero no registrado', () => {
    // GASTO-01 crea la jornada en blanco al anotar un gasto. No esta registrada — no
    // tiene concepto — pero si es un borrador que impide enviar la semana.
    const s = agruparSemanas(MIN, MAX, [fila('2026-09-01', 'draft', null)]);
    expect(s[2]).toEqual({ lunes: '2026-08-31', registrados: 0, borradores: 1 });
  });

  it('lo que cae fuera de la ventana se ignora sin romper', () => {
    const s = agruparSemanas(MIN, MAX, [fila('2026-08-10'), fila('2026-09-14')]);
    expect(s.reduce((n, x) => n + x.registrados, 0)).toBe(0);
  });
});
