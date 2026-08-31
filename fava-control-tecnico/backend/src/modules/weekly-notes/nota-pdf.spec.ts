import { renderizarNota } from './nota-pdf';
import type { DatosNota } from './nota-pdf';

/**
 * El camino que el spec del servicio NO cubre: allí `nota-pdf` está mockeado, así que
 * nada probaba que pdfmake realmente produzca un PDF — y menos con las firmas dentro.
 *
 * Es justo donde estaba el fallo más caro de esta fase: el tercer argumento del
 * constructor de `PdfPrinter` (el URLResolver) parece opcional y no lo es, y sin él
 * CUALQUIER documento con una imagen muere al renderizar. La Nota firmada siempre lleva
 * dos. Un test que solo renderizara el borrador (sin firmas) pasaría igual y no serviría
 * de nada, por eso aquí se comparan los dos.
 */

/** PNG 1x1 válido de verdad: basta para ejercitar el camino de la imagen. */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const datos: DatosNota = {
  clientName: 'Molino Cibao Bocel',
  locality: 'Santo Domingo',
  country: 'RD',
  supply: 'Línea de pasta corta',
  contractNumber: '345500',
  maquinaria: 'PL 6000 KG - 1-3428',
  cargoSemana: 'Capo Elettricista',
  technicianName: 'Iván Cortés',
  filas: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-07-${String(20 + i).padStart(2, '0')}`,
    // El día 3 en blanco a propósito: es el caso «ese día estuvo en otra obra», que
    // imprime la fila vacía en vez de omitirla.
    description: i === 3 ? null : `Montaje y revisión del día ${i + 1}`,
    categoria: i === 3 ? null : 'Día completo',
    // BIT-08: un dia con nota y el resto sin ella — el respaldo al n.º de contrato.
    dayNote: i === 0 ? 'HORARIO 7 AM - 5 PM' : null,
  })),
  gastosTecnico: [{ descripcion: 'Transporte', valor: '50.000' }],
  anticiposCliente: [{ descripcion: 'Anticipo', valor: '100.000' }],
};

const conFirmas: DatosNota = {
  ...datos,
  firmaTecnico: PNG_1X1,
  firmaCliente: PNG_1X1,
  fechaFirma: '2026-08-01',
};

/** Un PDF de verdad empieza por `%PDF-` y termina en `%%EOF`. */
const esPdf = (b: Buffer) =>
  b.subarray(0, 5).toString('latin1') === '%PDF-' && b.subarray(-32).toString('latin1').includes('%%EOF');

describe('renderizarNota', () => {
  // pdfmake carga las 4 fuentes Roboto del disco en cada render.
  jest.setTimeout(30_000);

  it('produce un PDF válido sin firmas (la vista previa)', async () => {
    const b = await renderizarNota(datos);
    expect(esPdf(b)).toBe(true);
    expect(b.length).toBeGreaterThan(1000);
  });

  it('produce un PDF válido CON las dos firmas embebidas', async () => {
    const [borrador, firmado] = await Promise.all([renderizarNota(datos), renderizarNota(conFirmas)]);
    expect(esPdf(firmado)).toBe(true);
    // Si midieran lo mismo, las imágenes no se habrían embebido y el PDF que firma el
    // cliente saldría con las casillas vacías — sin que nada fallara.
    expect(firmado.length).toBeGreaterThan(borrador.length);
  });

  it('es determinista: el mismo contenido produce el mismo tamaño', async () => {
    // NOTA-06 congela los bytes y guarda su SHA-256. Si el render variara con cada
    // llamada, ese hash no probaría nada sobre lo que el cliente vio.
    const [a, b] = await Promise.all([renderizarNota(conFirmas), renderizarNota(conFirmas)]);
    expect(a.length).toBe(b.length);
  });
});
