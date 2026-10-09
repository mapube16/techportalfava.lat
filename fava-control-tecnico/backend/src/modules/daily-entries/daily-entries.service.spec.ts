import { errorMedia, estadoAdmin } from './daily-entries.service';

/** Con que estado queda un dia que guarda la admin. Sin base de datos. */
describe('estadoAdmin: con que estado queda un dia que guarda la admin', () => {
  it('sin nota → aprobado directo (agregar a mano)', () => {
    expect(estadoAdmin(null)).toBe('approved');
  });

  it('con nota → el dia conserva el estado de su nota, sea cual sea', () => {
    for (const st of ['draft', 'submitted', 'approved', 'returned'])
      expect(estadoAdmin({ status: st })).toBe(st);
  });
});

/** La otra mitad de un medio dia: solo con MD y solo un viaje. Mismo contrato que el CHECK. */
describe('errorMedia: medio dia + medio viaje', () => {
  it('sin otra mitad nunca falla, sea cual sea el concepto', () => {
    expect(errorMedia('DC', null)).toBeNull();
    expect(errorMedia(null, null)).toBeNull();
  });

  it('MD + viaje (salida o retorno) es valido', () => {
    expect(errorMedia('MD', 'DVSF')).toBeNull();
    expect(errorMedia('MD', 'DVRC')).toBeNull();
  });

  it('la otra mitad solo cabe junto a MD', () => {
    expect(errorMedia('DC', 'DVRC')).toBe('MEDIA_JORNADA_SOLO_MD');
    expect(errorMedia(null, 'DVSF')).toBe('MEDIA_JORNADA_SOLO_MD');
  });

  it('la otra mitad solo puede ser un viaje', () => {
    expect(errorMedia('MD', 'DC')).toBe('MEDIA_JORNADA_INVALIDA');
    expect(errorMedia('MD', 'MD')).toBe('MEDIA_JORNADA_INVALIDA');
  });
});
