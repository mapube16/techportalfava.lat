import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { claveBorrador, guardar, leer, borrar, enConflicto } from './draft';
import type { Borrador, FilaDia } from './draft';

/**
 * `Storage` falso sobre un Map. Es lo que hace que el borrador se pueda probar sin
 * DOM simulado: un test que no puede tocar `window` no puede mentir sobre `window`.
 * ponytail: `length`/`key`/`clear` no los usa el modulo, asi que no se implementan —
 * el cast evita arrastrar la interfaz entera de DOM por tres metodos.
 */
const memoria = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  } as unknown as Storage;
};

/** El modo de fallo real: Safari en privado y la cuota agotada LANZAN en `setItem`. */
const sinCuota = (): Storage =>
  ({
    getItem: () => null,
    setItem: () => {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    },
    removeItem: () => {},
  }) as unknown as Storage;

const fila = (date: string, description: string): FilaDia => ({
  date,
  projectId: 'p1',
  machineModelId: 'm1',
  conceptCode: 'DC',
  phase: 'MONTAJE',
  description,
});

const TEC_A = '11111111-1111-1111-1111-111111111111';
const TEC_B = '22222222-2222-2222-2222-222222222222';

describe('claveBorrador', () => {
  it('no se pisan dos semanas ni dos tecnicos', () => {
    assert.notEqual(claveBorrador(TEC_A, '2026-07-13'), claveBorrador(TEC_A, '2026-07-20'));
    assert.notEqual(claveBorrador(TEC_A, '2026-07-13'), claveBorrador(TEC_B, '2026-07-13'));
  });
});

describe('guardar / leer / borrar', () => {
  it('round-trip: lo guardado se vuelve a leer igual', () => {
    const st = memoria();
    const clave = claveBorrador(TEC_A, '2026-07-13');
    const b: Borrador = { entries: { '2026-07-13': fila('2026-07-13', 'Montaje linea 3') }, savedAt: 0 };

    assert.equal(guardar(st, clave, b), true);
    assert.deepEqual(leer(st, clave)?.entries, b.entries);
  });

  it('guardar sella savedAt con el reloj', () => {
    const st = memoria();
    const clave = claveBorrador(TEC_A, '2026-07-13');
    const antes = Date.now();

    guardar(st, clave, { entries: {}, savedAt: 0 });

    assert.ok((leer(st, clave)?.savedAt ?? 0) >= antes);
  });

  it('una clave que no existe es null, no un error', () => {
    assert.equal(leer(memoria(), 'fava_draft_nadie_2026-07-13'), null);
  });

  it('JSON corrupto de una version anterior es null, SIN lanzar', () => {
    const st = memoria();
    st.setItem('roto', '{no es json');
    // Sin esto, un borrador viejo tumbaria la pantalla de captura entera.
    assert.doesNotThrow(() => leer(st, 'roto'));
    assert.equal(leer(st, 'roto'), null);
  });

  it('con la cuota agotada devuelve false y NO propaga', () => {
    const st = sinCuota();
    // El modo de fallo que dejaria la pantalla en blanco en Safari privado.
    assert.doesNotThrow(() => guardar(st, 'k', { entries: {}, savedAt: 0 }));
    assert.equal(guardar(st, 'k', { entries: {}, savedAt: 0 }), false);
  });

  it('borrar deja leer en null', () => {
    const st = memoria();
    guardar(st, 'k', { entries: { '2026-07-13': fila('2026-07-13', 'algo') }, savedAt: 0 });
    borrar(st, 'k');
    assert.equal(leer(st, 'k'), null);
  });
});

describe('enConflicto', () => {
  const SAVED = Date.parse('2026-07-14T10:00:00Z');
  const b: Borrador = {
    entries: {
      '2026-07-13': fila('2026-07-13', 'lo mio del lunes'),
      '2026-07-14': fila('2026-07-14', 'lo mio del martes'),
      '2026-07-15': fila('2026-07-15', 'lo mio del miercoles'),
    },
    savedAt: SAVED,
  };

  it('devuelve las FECHAS que el servidor escribio despues, no un booleano', () => {
    const chocan = enConflicto(b, [
      { date: '2026-07-13', updatedAt: '2026-07-14T11:00:00Z' }, // despues -> conflicto
      { date: '2026-07-14', updatedAt: '2026-07-14T09:00:00Z' }, // antes -> no
      { date: '2026-07-15', updatedAt: '2026-07-14T23:59:00Z' }, // despues -> conflicto
    ]);
    assert.deepEqual(chocan, ['2026-07-13', '2026-07-15']);
  });

  it('un dia que el borrador no toca nunca es conflicto', () => {
    assert.deepEqual(enConflicto(b, [{ date: '2026-07-16', updatedAt: '2026-07-20T10:00:00Z' }]), []);
  });

  it('mismo instante NO es conflicto: la frontera es estricta', () => {
    // El caso que se mueve si alguien cambia `>` por `>=`.
    assert.deepEqual(enConflicto(b, [{ date: '2026-07-13', updatedAt: '2026-07-14T10:00:00.000Z' }]), []);
  });

  it('sin filas del servidor no hay conflicto', () => {
    assert.deepEqual(enConflicto(b, []), []);
  });
});
