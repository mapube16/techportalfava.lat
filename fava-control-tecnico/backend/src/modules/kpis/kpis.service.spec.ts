import { FUERA_DEL_DENOMINADOR, KpisService, NO_PRODUCTIVOS, PRODUCTIVOS } from './kpis.service';

/**
 * KPI-02. Lo que se prueba aquí es la CLASIFICACIÓN y el denominador, que es la parte
 * discutible del indicador: qué cuenta como productivo, qué cuenta como disponible y no
 * producido, y qué no cuenta en absoluto.
 *
 * El filtro de fechas futuras vive en el SQL y un mock no lo ejercita — se verificó
 * contra producción, donde 1.220 filas futuras movían el global de 54,6 % a 36,8 %.
 * Lo que sí queda blindado aquí es que la regla no se pueda cambiar sin querer.
 */

/**
 * El `$queryRaw` del servicio se llama TRES veces y en este orden: las filas, los días
 * que esperan aprobación, y los futuros que quedan fuera. El orden importa: si alguien
 * añade una consulta en medio, estos casos se caen en vez de mentir.
 */
function servicioCon(filas: unknown[], futuras = 0, pendientes = 0) {
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce(filas)
    .mockResolvedValueOnce([{ n: pendientes }])
    .mockResolvedValueOnce([{ n: futuras }]);
  return new KpisService({ client: { $queryRaw: queryRaw } } as never);
}

const fila = (nombre: string, concepto: string, dias: number) => ({
  technician_id: `t-${nombre}`,
  technician_name: nombre,
  technician_active: true,
  concept_code: concepto,
  days: dias,
});

describe('KpisService.utilizacion', () => {
  it('la regla del denominador es la declarada y viaja en la respuesta', async () => {
    // Si alguien mueve un concepto de lista, este caso lo dice con nombre y apellido:
    // el indicador cambia de significado y no puede pasar en silencio.
    expect(PRODUCTIVOS).toEqual(['DC', 'MD', 'DFD', 'DVSF', 'DVRC']);
    expect(NO_PRODUCTIVOS).toEqual(['LR', 'NR', 'OTRO']);
    expect(FUERA_DEL_DENOMINADOR).toEqual(['IL']);

    const u = await servicioCon([fila('Ana', 'DC', 1)]).utilizacion(2026);
    expect(u.rule).toEqual({
      productive: PRODUCTIVOS,
      nonProductive: NO_PRODUCTIVOS,
      excluded: FUERA_DEL_DENOMINADOR,
    });
  });

  it('LR, NR y OTRO entran en el denominador; IL queda FUERA', async () => {
    const u = await servicioCon([
      fila('Ana', 'DC', 60),
      fila('Ana', 'LR', 20),
      fila('Ana', 'NR', 10),
      fila('Ana', 'OTRO', 10), // un «Otro» es un día disponible que no produjo: cuenta
      fila('Ana', 'IL', 100), // 100 días de incapacidad: no deben tocar el porcentaje
    ]).utilizacion(2026);

    const [ana] = u.technicians;
    expect(ana.productive).toBe(60);
    expect(ana.nonProductive).toBe(40);
    expect(ana.excluded).toBe(100);
    expect(ana.denominator).toBe(100); // 60 + 40, sin los 100 de IL
    expect(ana.utilizationPct).toBe(60);
  });

  it('el medio día cuenta 1, igual que en el Excel', async () => {
    // Ponderar 0,5 aquí y 1 en la cuadrícula daría dos utilizaciones para los mismos días.
    const u = await servicioCon([fila('Ana', 'MD', 10), fila('Ana', 'LR', 10)]).utilizacion(2026);
    expect(u.technicians[0].productive).toBe(10);
    expect(u.technicians[0].utilizationPct).toBe(50);
  });

  it('sin días disponibles la utilización es null, no 0 %', async () => {
    // Un técnico cuyos días son TODOS incapacidad no tiene una utilización del 0 %:
    // no tiene utilización. Pintar 0 % lo acusaría de algo que el dato no dice.
    const u = await servicioCon([fila('Ana', 'IL', 30)]).utilizacion(2026);
    expect(u.technicians[0].denominator).toBe(0);
    expect(u.technicians[0].utilizationPct).toBeNull();
    expect(u.utilizationPct).toBeNull();
  });

  it('ordena de mayor a menor y deja los sin-porcentaje al final', async () => {
    const u = await servicioCon([
      fila('Baja', 'DC', 1),
      fila('Baja', 'LR', 9),
      fila('Alta', 'DC', 9),
      fila('Alta', 'LR', 1),
      fila('SinDato', 'IL', 5),
    ]).utilizacion(2026);
    expect(u.technicians.map((t) => t.technicianName)).toEqual(['Alta', 'Baja', 'SinDato']);
  });

  it('informa cuántos días futuros dejó fuera', async () => {
    const u = await servicioCon([fila('Ana', 'DC', 10)], 1220).utilizacion(2026);
    expect(u.futureExcluded).toBe(1220);
  });

  /**
   * Un día ENVIADO es un día trabajado: lo que falta es que un admin lo valide, no que
   * ocurra. Contar solo los aprobados dejaba el tablero por detrás de la realidad en
   * cuanto los técnicos empiezan a usar la app — y vacío durante la adopción.
   */
  it('los días enviados cuentan como ejecutados, y se dice cuántos esperan aprobación', async () => {
    const u = await servicioCon([fila('Ana', 'DC', 10)], 0, 4).utilizacion(2026);
    expect(u.productive).toBe(10);
    expect(u.pendingApproval).toBe(4);
    // El pendiente es un SUBCONJUNTO de lo contado, no algo que se sume aparte.
    expect(u.pendingApproval).toBeLessThanOrEqual(u.denominator);
  });
});
