/**
 * El reloj del cron, medido contra instantes fijos.
 *
 * A diferencia de `fecha.spec.ts`, aqui NO hace falta cambiar el huso del proceso: la
 * zona se le pasa a `momento()` como argumento y `Intl` la respeta sea cual sea el TZ
 * del contenedor. Ese es justo el motivo de usar `Intl` y no getters locales.
 */
import { momento } from './reloj';

const BOGOTA = 'America/Bogota';
const ROMA = 'Europe/Rome';

describe('momento()', () => {
  it('lee la hora en la zona pedida, no en la del proceso', () => {
    // 2026-08-28T21:00:00Z = viernes 16:00 en Bogota (UTC-5).
    const m = momento(new Date('2026-08-28T21:00:00Z'), BOGOTA);
    expect(m).toEqual({ fechaLocal: '2026-08-28', dow: 5, hora: 16 });
  });

  it('el mismo instante es OTRO dia y otra hora en Italia', () => {
    // Y por eso el aviso del domingo se movio a las 12:00 de Bogota: a las 18:00 el
    // instante cae ya en lunes para los tecnicos italianos.
    const m = momento(new Date('2026-08-30T23:00:00Z'), ROMA);
    expect(m.fechaLocal).toBe('2026-08-31');
    expect(m.dow).toBe(1); // lunes
  });

  it('el domingo a las 12:00 de Bogota sigue siendo domingo por la tarde en Roma', () => {
    const utc = new Date('2026-08-30T17:00:00Z');
    expect(momento(utc, BOGOTA)).toEqual({ fechaLocal: '2026-08-30', dow: 7, hora: 12 });
    const it = momento(utc, ROMA);
    expect(it.dow).toBe(7);
    expect(it.hora).toBe(19);
  });

  it('domingo = 7 y lunes = 1, que es lo que espera el cron', () => {
    expect(momento(new Date('2026-08-24T12:00:00Z'), 'UTC').dow).toBe(1);
    expect(momento(new Date('2026-08-30T12:00:00Z'), 'UTC').dow).toBe(7);
  });

  /**
   * El cambio de hora es el unico dia en que un desfase fijo (-5, +2) manda el aviso a
   * la hora equivocada. Bogota no cambia y Roma si, asi que con dos zonas en juego el
   * desfase fijo se equivoca seguro una vez al ano. `Intl` lo sabe; una resta no.
   */
  describe('horario de verano', () => {
    it('Roma en verano va +2 y en invierno +1 sobre el mismo UTC', () => {
      // Ultimo domingo de octubre de 2026: el cambio es el 25.
      expect(momento(new Date('2026-10-24T12:00:00Z'), ROMA).hora).toBe(14);
      expect(momento(new Date('2026-10-26T12:00:00Z'), ROMA).hora).toBe(13);
    });

    it('Bogota no cambia nunca: la ventana del cron no se mueve', () => {
      expect(momento(new Date('2026-10-24T21:00:00Z'), BOGOTA).hora).toBe(16);
      expect(momento(new Date('2026-10-26T21:00:00Z'), BOGOTA).hora).toBe(16);
    });

    it('la ventana del viernes se abre UNA sola vez el fin de semana del cambio', () => {
      // Las 12 evaluaciones de esa hora, todas el mismo dia local y la misma hora: la
      // ventana no se duplica ni se salta.
      const horas = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(
        (min) => momento(new Date(`2026-10-23T21:${String(min).padStart(2, '0')}:00Z`), BOGOTA),
      );
      expect(new Set(horas.map((h) => `${h.fechaLocal} ${h.dow} ${h.hora}`)).size).toBe(1);
      expect(horas[0]).toEqual({ fechaLocal: '2026-10-23', dow: 5, hora: 16 });
    });
  });

  it('medianoche es 0 y no 24', () => {
    expect(momento(new Date('2026-08-28T05:00:00Z'), BOGOTA).hora).toBe(0);
  });
});
