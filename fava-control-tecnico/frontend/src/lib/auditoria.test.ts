import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { describir } from './auditoria';
import type { Voz } from './auditoria';

/** Palabras cortas y distintas entre sí: el test comprueba la frase, no el idioma. */
const t: Voz = {
  aud_submit: 'envió', aud_approve: 'aprobó', aud_return: 'devolvió', aud_reopen: 'reabrió',
  aud_sign: 'firmó', aud_update: 'editó', aud_deactivate: 'baja', aud_reactivate: 'alta',
  aud_role: 'rol', aud_added: 'añadió', aud_removed: 'quitó', aud_changed: 'cambió',
  expenses: 'Gastos', advances: 'Anticipo',
};

const nota = (action: string, before?: unknown, after?: unknown) =>
  ({ entity: 'weekly_note', action, before, after });
const g = (descripcion: string, valor: string) => ({ descripcion, valor });

describe('describir', () => {
  it('no repite la transición de estado: el verbo ya la cuenta', () => {
    const a = nota('approve', { status: 'submitted' }, { status: 'approved' });
    assert.equal(describir(a, t), 'aprobó');
  });

  it('la firma lleva versión, no el sha256', () => {
    const a = nota('sign', null, { version: 1, pdfSha256: 'd96253'.repeat(10) });
    assert.equal(describir(a, t), 'firmó · v1');
  });

  it('un gasto borrado se dice, con su valor', () => {
    const a = nota(
      'update',
      { gastosTecnico: [g('Transporte', '50.000'), g('Hotel', '80.000')], anticiposCliente: [] },
      { gastosTecnico: [g('Hotel', '80.000')], anticiposCliente: [] },
    );
    assert.equal(describir(a, t), 'Gastos: quitó «Transporte» 50.000 (2 → 1)');
  });

  it('corregir un valor es UN cambio, no una baja y un alta', () => {
    const a = nota(
      'update',
      { gastosTecnico: [g('Transporte', '50.000')] },
      { gastosTecnico: [g('Transporte', '60.000')] },
    );
    assert.equal(describir(a, t), 'Gastos: cambió «Transporte» 50.000 → 60.000');
  });

  it('los dos bloques cambian: los dos se cuentan', () => {
    const a = nota(
      'update',
      { gastosTecnico: [], anticiposCliente: [g('Anticipo', '100')] },
      { gastosTecnico: [g('Peaje', '20')], anticiposCliente: [] },
    );
    assert.equal(
      describir(a, t),
      'Gastos: añadió «Peaje» 20 (0 → 1) · Anticipo: quitó «Anticipo» 100 (1 → 0)',
    );
  });

  it('reordenar no es un cambio: no se inventa un movimiento que no hubo', () => {
    const dos = [g('Hotel', '80.000'), g('Peaje', '20')];
    const a = nota('update', { gastosTecnico: dos }, { gastosTecnico: [dos[1], dos[0]] });
    assert.equal(describir(a, t), 'editó');
  });

  it('el rol técnico se nombra, y no por su UUID', () => {
    const a = nota('update', { roleTypeId: 'a1b2c3d4-0000-4000-8000-000000000001' }, { roleTypeId: null });
    assert.equal(describir(a, t), 'rol');
  });

  it('CAT-06: la baja de un técnico se lee como una baja', () => {
    const a = { entity: 'technician', action: 'deactivate', before: undefined, after: { isActive: false } };
    assert.equal(describir(a, t), 'baja');
    assert.equal(describir({ ...a, action: 'update', after: { isActive: true } }, t), 'alta');
  });

  it('un payload sin la forma esperada no rompe la pantalla', () => {
    assert.equal(describir(nota('update', 'basura', 42), t), 'editó');
    assert.equal(describir(nota('inventada'), t), 'inventada');
  });
});
