import { describe, it, before, after } from 'node:test';
// `import assert from 'node:assert/strict'` exigiria esModuleInterop y este tsconfig
// no lo tiene. El named import del namespace `assert` type-checa tal cual y da el
// mismo objeto (equal === strictEqual).
import { strict as assert } from 'node:assert';
import {
  hoyLocal, sumarDias, lunesDe, diasDeSemana, primerDiaMesAnterior, rejillaDelMes, sumarMeses,
} from './fecha';

/**
 * Los 4 husos del DISPOSITIVO.
 *
 * `TZ=x node` NO cambia el huso en este entorno — verificado en 03-RESEARCH: deja
 * `process.env.TZ` en `undefined` y el offset en 300 (Bogota), o sea que una suite
 * «de 4 husos» correria cuatro veces en Bogota y saldria verde sin probar nada.
 * Asignar `process.env.TZ` en runtime SI funciona y admite varios cambios dentro del
 * mismo proceso.
 *
 * Los tres instantes estan elegidos para que mutar `hoyLocal` a
 * `toISOString().slice(0, 10)` tumbe LOS CUATRO husos:
 *   02:30Z -> cae Bogota (-5) y Sao Paulo (-3), que ya estan en el dia anterior
 *   03:30Z -> cae Bogota; Sao Paulo ya coincide con UTC (es la frontera)
 *   22:30Z -> cae Roma (+2) y Kiritimati (+14), que ya estan en el dia siguiente
 */
const HUSOS: [zona: string, offset: number, d0230: string, d0330: string, d2230: string][] = [
  ['America/Bogota', 300, '2026-07-13', '2026-07-13', '2026-07-14'],
  ['Europe/Rome', -120, '2026-07-14', '2026-07-14', '2026-07-15'],
  ['America/Sao_Paulo', 180, '2026-07-13', '2026-07-14', '2026-07-14'],
  ['Pacific/Kiritimati', -840, '2026-07-14', '2026-07-14', '2026-07-15'],
];

for (const [zona, offset, d0230, d0330, d2230] of HUSOS) {
  describe(`dispositivo en ${zona}`, () => {
    before(() => {
      process.env.TZ = zona;
    });
    after(() => {
      process.env.TZ = 'America/Bogota';
    });

    it('el huso cambio de verdad', () => {
      // Instante FIJO, no `new Date()`: con «ahora», Roma pasaria de -120 a -60 entre
      // julio y diciembre y la suite seria estacional (verde en invierno, roja en
      // verano). Sin esta asercion, los 4 bloques podrian estar corriendo en Bogota.
      assert.equal(new Date('2026-07-14T12:00:00Z').getTimezoneOffset(), offset);
    });

    it('hoyLocal da el dia del CALENDARIO DEL DISPOSITIVO, no el de UTC', () => {
      assert.equal(hoyLocal(new Date('2026-07-14T02:30:00Z')), d0230);
      assert.equal(hoyLocal(new Date('2026-07-14T03:30:00Z')), d0330);
      assert.equal(hoyLocal(new Date('2026-07-14T22:30:00Z')), d2230);
    });

    it('sumarDias cruza fin de mes, bisiesto y fin de ano', () => {
      assert.equal(sumarDias('2026-02-28', 1), '2026-03-01'); // 2026 no es bisiesto
      assert.equal(sumarDias('2024-02-28', 1), '2024-02-29'); // 2024 si
      assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
      assert.equal(sumarDias('2026-07-13', -1), '2026-07-12');
      assert.equal(sumarDias('2026-07-13', 0), '2026-07-13');
    });

    it('lunesDe cae en el lunes ISO, tambien el domingo del cambio de hora', () => {
      assert.equal(lunesDe('2026-07-14'), '2026-07-13'); // martes
      assert.equal(lunesDe('2026-07-19'), '2026-07-13'); // domingo
      assert.equal(lunesDe('2026-07-13'), '2026-07-13'); // el propio lunes
      // 2026-03-29 es el domingo en que Roma pasa a CEST. La aritmetica es sobre UTC,
      // asi que el dia de 23 h locales no la mueve.
      assert.equal(lunesDe('2026-03-29'), '2026-03-23');
    });

    it('diasDeSemana da los 7 dias en orden', () => {
      assert.deepEqual(diasDeSemana('2026-07-13'), [
        '2026-07-13',
        '2026-07-14',
        '2026-07-15',
        '2026-07-16',
        '2026-07-17',
        '2026-07-18',
        '2026-07-19',
      ]);
      // La semana del cambio de hora tambien tiene 7 dias y acaba donde debe.
      assert.deepEqual(diasDeSemana('2026-03-23').at(-1), '2026-03-29');
    });

    it('primerDiaMesAnterior retrocede un mes, incluso cruzando el ano', () => {
      assert.equal(primerDiaMesAnterior('2026-01-05'), '2025-12-01');
      assert.equal(primerDiaMesAnterior('2026-07-14'), '2026-06-01');
      assert.equal(primerDiaMesAnterior('2026-03-31'), '2026-02-01');
      assert.equal(primerDiaMesAnterior('2026-11-01'), '2026-10-01');
    });

    // BIT-11: la rejilla de la bitacora mensual.
    it('rejillaDelMes son 42 celdas que empiezan en lunes y cubren el mes', () => {
      const sep = rejillaDelMes('2026-09-15');
      assert.equal(sep.length, 42, '42 celdas: 6 semanas, alto estable entre meses');
      assert.equal(sep[0], '2026-08-31', 'arranca en el lunes de la semana del dia 1');
      assert.equal(sep.at(-1), '2026-10-11');
      // Cubrir el mes ENTERO es la razon de ser de la rejilla: si el 30 se saliera,
      // habria un dia del mes que no se puede pintar.
      assert.ok(sep.includes('2026-09-01') && sep.includes('2026-09-30'));
      // El dia 1 en lunes es el borde que rompe una rejilla mal centrada.
      const jun = rejillaDelMes('2026-06-10');
      assert.equal(jun[0], '2026-06-01');
      assert.ok(jun.includes('2026-06-30'));
      // Febrero de un bisiesto entra entero.
      const feb = rejillaDelMes('2028-02-01');
      assert.ok(feb.includes('2028-02-29'));
      // 42 celdas = el tope exacto del GET y del PUT: from..to son 41 dias de
      // diferencia, dentro de RANGO_MAX_DIAS (42). Si esto crece, el mes deja de
      // caber en una peticion.
      const dif = (Date.parse(`${sep.at(-1)}T00:00:00Z`) - Date.parse(`${sep[0]}T00:00:00Z`)) / 86_400_000;
      assert.equal(dif, 41);
    });

    it('sumarMeses cae siempre en el dia 1 y cruza el ano', () => {
      assert.equal(sumarMeses('2026-09-15', 1), '2026-10-01');
      assert.equal(sumarMeses('2026-12-31', 1), '2027-01-01');
      assert.equal(sumarMeses('2026-01-10', -1), '2025-12-01');
      // El 31 de marzo menos un mes NO es el 31 de febrero: por eso se ancla al dia 1.
      assert.equal(sumarMeses('2026-03-31', -1), '2026-02-01');
    });
  });
}
