import { estadoAdmin } from './daily-entries.service';

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
