/**
 * `faltantes()` es donde estan TODAS las trampas del recordatorio, y por eso es pura y
 * se prueba sin base de datos. Un caso por trampa; si alguno se cae, el aviso del
 * viernes le llega a quien no debe o no le llega a quien si.
 */
import { type GrupoDias, type TecnicoConUsuario, faltantes } from './recordatorios';

const usuario = (over: Partial<NonNullable<TecnicoConUsuario['user']>> = {}) => ({
  id: 'u1',
  email: 'tecnico@fava-la.com',
  displayName: 'Tecnico',
  lang: 'es',
  isActive: true,
  ...over,
});

const tec = (id: string, user: TecnicoConUsuario['user']): TecnicoConUsuario => ({
  id,
  fullName: `Tecnico ${id}`,
  user,
});

const dias = (technicianId: string, status: string, n: number): GrupoDias => ({
  technicianId,
  status,
  _count: { _all: n },
});

describe('faltantes()', () => {
  it('cero jornadas = no envio, y es el caso mas urgente', () => {
    // `enviarSemana` lanza SEMANA_VACIA si no hay ninguna jornada: sin registrar, este
    // tecnico ni siquiera PUEDE enviar.
    const f = faltantes([tec('a', usuario())], []);
    expect(f.avisables.map((t) => t.id)).toEqual(['a']);
  });

  it('todo en draft = no envio', () => {
    const f = faltantes([tec('a', usuario())], [dias('a', 'draft', 5)]);
    expect(f.avisables).toHaveLength(1);
  });

  it('todo en submitted = SI envio, no se le molesta', () => {
    const f = faltantes([tec('a', usuario())], [dias('a', 'submitted', 7)]);
    expect(f.avisables).toHaveLength(0);
    expect(f.inalcanzables).toHaveLength(0);
  });

  it('la semana entera sin proyecto NO es un falso positivo', () => {
    // Los dias con project_id null nunca generan nota y al enviar pasan directos a
    // 'approved'. Mirando `weekly_notes` este tecnico pareceria «sin enviar» para
    // siempre y recibiria el recordatorio cada viernes hasta que lo desactivara.
    const f = faltantes([tec('a', usuario())], [dias('a', 'approved', 7)]);
    expect(f.avisables).toHaveLength(0);
  });

  it('la semana REABIERTA si cuenta como sin enviar', () => {
    // `reopen` devuelve la nota Y sus jornadas a 'draft': hay que reenviarla. Mirando
    // `weekly_notes` pareceria enviada, porque la nota existe.
    const f = faltantes([tec('a', usuario())], [dias('a', 'draft', 7)]);
    expect(f.avisables).toHaveLength(1);
  });

  it('una semana a medias cuenta: basta UN dia en draft', () => {
    const f = faltantes(
      [tec('a', usuario())],
      [dias('a', 'submitted', 6), dias('a', 'draft', 1)],
    );
    expect(f.avisables).toHaveLength(1);
  });

  describe('a quien se le puede escribir de verdad', () => {
    it('@pendiente.invalid falta Y es inalcanzable', () => {
      // Es el estado de casi todos los tecnicos historicos: `crear-usuarios-tecnicos.ts`
      // los creo asi. Sin este caso, el sistema mandaria dos correos y pareceria sano.
      const f = faltantes([tec('a', usuario({ email: 'tecnico-a@pendiente.invalid' }))], []);
      expect(f.avisables).toHaveLength(0);
      expect(f.inalcanzables.map((t) => t.id)).toEqual(['a']);
    });

    it('usuario desactivado es inalcanzable', () => {
      const f = faltantes([tec('a', usuario({ isActive: false }))], []);
      expect(f.avisables).toHaveLength(0);
      expect(f.inalcanzables).toHaveLength(1);
    });

    it('tecnico SIN usuario es inalcanzable, no desaparece', () => {
      // Si la consulta lo perdiera, el resumen del lunes diria «0 sin correo» y el
      // agujero seguiria sin verse.
      const f = faltantes([tec('a', null)], []);
      expect(f.inalcanzables.map((t) => t.id)).toEqual(['a']);
    });
  });

  it('separa a varios tecnicos sin mezclar sus cuentas', () => {
    const f = faltantes(
      [
        tec('a', usuario({ id: 'ua' })),
        tec('b', usuario({ id: 'ub' })),
        tec('c', usuario({ id: 'uc', email: 'c@pendiente.invalid' })),
      ],
      [dias('a', 'submitted', 7), dias('b', 'draft', 3)],
    );
    expect(f.avisables.map((t) => t.id)).toEqual(['b']);
    expect(f.inalcanzables.map((t) => t.id)).toEqual(['c']);
  });
});
