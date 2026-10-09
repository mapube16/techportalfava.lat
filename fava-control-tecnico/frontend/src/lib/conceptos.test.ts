import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { jornadaConMitad, opcionesMitad } from './conceptos';

/** Medio dia + medio viaje: por los dos lados se llega a la MISMA jornada (MD + viaje). */
describe('jornadaConMitad: la forma canonica es MD + viaje', () => {
  it('desde medio dia, la otra mitad es el viaje', () => {
    assert.deepEqual(jornadaConMitad('MD', 'DVSF'), { conceptCode: 'MD', halfConceptCode: 'DVSF' });
  });

  it('desde el viaje, «medio dia de trabajo» se da la vuelta a MD + viaje', () => {
    assert.deepEqual(jornadaConMitad('DVRC', 'MD'), { conceptCode: 'MD', halfConceptCode: 'DVRC' });
  });

  it('sin otra mitad, o con una que no cabe, se manda sin mitad', () => {
    assert.deepEqual(jornadaConMitad('MD', null), { conceptCode: 'MD', halfConceptCode: null });
    assert.deepEqual(jornadaConMitad('DVSF', null), { conceptCode: 'DVSF', halfConceptCode: null });
    assert.deepEqual(jornadaConMitad('DC', 'DVSF'), { conceptCode: 'DC', halfConceptCode: null });
    assert.deepEqual(jornadaConMitad('MD', 'MD'), { conceptCode: 'MD', halfConceptCode: null });
  });
});

describe('opcionesMitad: que se pregunta y cuando', () => {
  it('MD ofrece los viajes; un viaje ofrece medio dia; el resto no pregunta', () => {
    assert.deepEqual(opcionesMitad('MD'), [null, 'DVSF', 'DVRC']);
    assert.deepEqual(opcionesMitad('DVSF'), [null, 'MD']);
    assert.equal(opcionesMitad('DC'), null);
  });
});
