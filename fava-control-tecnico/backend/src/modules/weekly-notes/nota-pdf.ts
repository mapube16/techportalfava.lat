import { dirname, join } from 'node:path';
import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * El `PdfPrinter` del SERVIDOR. `require('pdfmake')` a secas devuelve el bundle del
 * navegador (`createPdf`, que necesita un DOM) y `@types/pdfmake` tipa ese, no éste:
 * de ahí que la clase se cargue por su ruta y se tipe a mano. Es lo mínimo para no
 * mentirle al compilador y lo único que hace falta — la definición del documento sí
 * está tipada, que es donde se cometen los errores.
 */
type CreatedPdf = NodeJS.ReadableStream & { end(): void };
interface Printer {
  /** En 0.3 es ASINCRONO (resuelve URLs de imagenes antes de maquetar). */
  createPdfKitDocument(def: TDocumentDefinitions): Promise<CreatedPdf>;
}
type Ctor = new (fuentes: unknown, vfs: unknown, urlResolver: unknown) => Printer;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = (require('pdfmake/js/Printer.js') as { default: Ctor }).default;
/**
 * El tercer argumento del constructor no es opcional aunque lo parezca: sin el,
 * `createPdfKitDocument` muere con «Cannot read properties of undefined (reading
 * 'resolve')» en cuanto el documento lleva una imagen — y la Nota firmada SIEMPRE
 * lleva dos. Verificado contra el motor.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URLResolver = (require('pdfmake/js/URLResolver.js') as { default: new () => unknown }).default;

/**
 * NOTA-05 — la Nota de Prestación Semanal, campo por campo como el papel.
 *
 * La referencia es `docs/Reporte 02 - Ivan Cortés - Grupo Bocel …pdf`, y de ahí salen
 * los literales en mayúsculas, el orden de los bloques y hasta la columna NOTA que
 * repite el número de contrato en los siete días.
 *
 * POR QUÉ pdfmake Y NO Puppeteer, que es lo que recomendaba la investigación:
 * Puppeteer exige Chromium, y la propia investigación avisa de que Railpack no instala
 * de forma fiable sus ~30 librerías de sistema — haría falta cambiar el builder a un
 * Dockerfile. Ese cambio reescribe el pipeline de despliegue que hoy funciona, y en
 * este mismo proyecto un ajuste de build ya tumbó producción dos veces. La contrapartida
 * real es que el maquetado se afina con anchos en vez de con CSS; la Nota es una tabla,
 * que es justo donde pdfmake es fuerte. La investigación lo nombra como la opción
 * correcta «si el tamaño o la memoria de la imagen se vuelven un problema»; aquí el
 * problema es el riesgo de cambiar de builder, y la conclusión es la misma.
 */

/** Membrete. Constantes de la empresa, no datos del proyecto. */
const FAVA = {
  razonSocial: 'FAVA LATINO AMERICA S.A.S.',
  direccion: 'Av. 15 # 93 A – 84 Oficina 809 - Bogotá, Colombia',
  web: 'www.favalatinoamerica.com',
  /**
   * OJO: el «NIT:» que imprime la Nota es el de FAVA, NO el del cliente. La columna
   * `projects.client_nit` existe porque CAT-03 la pide, pero NUNCA va en esta casilla —
   * está verificado contra el PDF de referencia y es el error más fácil de cometer aquí.
   */
  nit: '901137532-4',
};

const DECLARACION =
  'EL CLIENTE DECLARA QUE EL TRABAJO EFECTUADO ES SATISFACTORIO Y CONFORME A CUANTO DESCRITO';

/** Los siete días, en el idioma del papel (español). */
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export interface FilaNota {
  /** 'YYYY-MM-DD'. Se imprime dd/mm/yyyy. */
  date: string;
  description: string | null;
  /** La etiqueta del concepto, ya resuelta al idioma («Día completo»). */
  categoria: string | null;
}

export interface Gasto {
  descripcion: string;
  valor: string;
}

export interface DatosNota {
  clientName: string;
  locality: string;
  country: string;
  supply: string;
  contractNumber: string;
  /** «Maquinaria:» — la descripción larga, no el código. */
  maquinaria: string;
  /** NOTA-09: el cargo de ESA semana. */
  cargoSemana: string;
  technicianName: string;
  filas: FilaNota[];
  gastosTecnico: Gasto[];
  anticiposCliente: Gasto[];
  /** PNG en base64 (sin el prefijo `data:`), si ya se firmó. */
  firmaTecnico?: string;
  firmaCliente?: string;
  fechaFirma?: string;
}

/** dd/mm/yyyy, sobre el string. Ni un `Date`: aquí no hay husos que valgan. */
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Roboto viene con pdfmake y cubre los acentos de ES e IT sin fuentes externas.
 *
 * La ruta se resuelve DESDE EL PAQUETE, no relativa al directorio de trabajo: en
 * producción el proceso arranca en `/app/backend` y un `node_modules/...` relativo
 * apuntaría a un sitio que no existe. El PDF fallaría solo en producción y solo al
 * firmar, que es el peor momento para enterarse.
 */
const RAIZ_PDFMAKE = dirname(require.resolve('pdfmake/package.json'));
const roboto = (v: string) => join(RAIZ_PDFMAKE, 'fonts', 'Roboto', `Roboto-${v}.ttf`);

const FUENTES = {
  Roboto: {
    normal: roboto('Regular'),
    bold: roboto('Medium'),
    italics: roboto('Italic'),
    bolditalics: roboto('MediumItalic'),
  },
};

const etiqueta = (k: string, v: string): Content => ({
  text: [{ text: `${k} `, bold: true }, v],
  fontSize: 8,
  margin: [0, 0, 0, 1],
});

/** Un bloque de gastos: 4 filas numeradas y un TOTAL, como el papel. */
function bloqueGastos(titulo: string, items: Gasto[], width: string): Column {
  // Devuelve un `Column`, que es `Content & ColumnProperties`: el ancho solo existe
  // dentro de `columns`, no en una tabla suelta.
  const filas = Array.from({ length: 4 }, (_, i) => [
    { text: `${i + 1}.`, fontSize: 8 },
    { text: items[i]?.descripcion ?? '', fontSize: 8 },
    { text: items[i]?.valor ?? '', fontSize: 8, alignment: 'right' as const },
  ]);
  const tabla: Content = {
    table: {
      widths: ['auto', '*', 'auto'],
      body: [
        [{ text: titulo, bold: true, fontSize: 8, colSpan: 3, alignment: 'center' as const }, {}, {}],
        [
          { text: '', fontSize: 7 },
          { text: 'Descripción', bold: true, fontSize: 7 },
          { text: 'Valor', bold: true, fontSize: 7, alignment: 'right' as const },
        ],
        ...filas,
        [
          { text: 'TOTAL:', bold: true, fontSize: 8, colSpan: 2 },
          {},
          { text: '', fontSize: 8, alignment: 'right' as const },
        ],
      ],
    },
    layout: 'lightHorizontalLines',
  };
  return { width, stack: [tabla] };
}

/** Una casilla de firma: el trazo si existe, y siempre la línea con su rótulo. */
const casillaFirma = (rotulo: string, png?: string): Content => ({
  stack: [
    png
      ? { image: `data:image/png;base64,${png}`, width: 130, height: 42, margin: [0, 2, 0, 2] }
      : { text: ' ', margin: [0, 22, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.7 }] },
    { text: rotulo, fontSize: 7, bold: true, margin: [0, 3, 0, 0] },
  ],
});

export function definicionNota(d: DatosNota): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [30, 26, 30, 26],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    content: [
      // ── Membrete + encabezado del cliente, en dos columnas como el original ──
      {
        columns: [
          {
            width: '52%',
            stack: [
              { text: FAVA.razonSocial, bold: true, fontSize: 10 },
              { text: FAVA.direccion, fontSize: 7.5, color: '#444' },
              { text: FAVA.web, fontSize: 7.5, color: '#444' },
            ],
          },
          {
            width: '48%',
            stack: [
              etiqueta('Cliente:', d.clientName),
              // El NIT del membrete, el de FAVA. Ver la constante.
              etiqueta('NIT:', FAVA.nit),
              etiqueta('Localidad:', [d.locality, d.country].filter(Boolean).join(', ')),
              etiqueta('Suministro:', d.supply),
              etiqueta('Contrato:', d.contractNumber),
              etiqueta('Maquinaria:', d.maquinaria),
              etiqueta('Cargo durante esta semana:', d.cargoSemana),
              etiqueta('Técnico:', d.technicianName.toUpperCase()),
            ],
          },
        ],
        margin: [0, 0, 0, 10],
      },

      { text: 'NOTA PRESTACIÓN SEMANAL', bold: true, fontSize: 13, alignment: 'center', margin: [0, 0, 0, 8] },

      // ── El cuerpo: los 7 días, y a su derecha la columna DIA/NOTA ──
      {
        columns: [
          {
            width: '74%',
            table: {
              headerRows: 1,
              widths: ['auto', '*', 'auto'],
              body: [
                [
                  { text: 'FECHA\n(dd/mm)', bold: true, fontSize: 7.5, alignment: 'center' },
                  { text: 'DESCRIPCIÓN TRABAJOS', bold: true, fontSize: 7.5, alignment: 'center' },
                  { text: 'CATEGORÍA', bold: true, fontSize: 7.5, alignment: 'center' },
                ],
                // Siempre SIETE filas. Un día de otro proyecto va en blanco y no se
                // omite: la Nota es de una semana entera y una fila que falta parece
                // un olvido, no «ese día estuvo en otra obra».
                ...d.filas.map((f) => [
                  { text: ddmmyyyy(f.date), fontSize: 8, alignment: 'center' as const },
                  { text: f.description ?? '', fontSize: 8 },
                  { text: f.categoria ?? '', fontSize: 8, alignment: 'center' as const },
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
          {
            width: '26%',
            table: {
              headerRows: 1,
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'DIA', bold: true, fontSize: 7.5, alignment: 'center' },
                  { text: 'NOTA', bold: true, fontSize: 7.5, alignment: 'center' },
                ],
                // La columna NOTA repite el n.º de contrato en los siete días. No es un
                // campo aparte: en el PDF de referencia es literalmente el mismo valor.
                ...DIAS.map((dia) => [
                  { text: dia, fontSize: 8 },
                  { text: d.contractNumber, fontSize: 8, alignment: 'center' as const },
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [6, 0, 0, 0],
          },
        ],
        margin: [0, 0, 0, 10],
      },

      // ── Gastos y anticipos: informativos (NOTA-08), sin flujo de reembolso ──
      {
        columns: [
          bloqueGastos('Gastos sostenidos por el técnico', d.gastosTecnico, '49%'),
          { width: '2%', text: '' },
          bloqueGastos('Anticipo efectuado por el cliente', d.anticiposCliente, '49%'),
        ],
        margin: [0, 0, 0, 14],
      },

      { text: DECLARACION, bold: true, fontSize: 8, alignment: 'center', margin: [0, 0, 0, 16] },

      {
        columns: [
          casillaFirma('FIRMA DEL TÉCNICO', d.firmaTecnico),
          {
            stack: [
              { text: ' ', margin: [0, 22, 0, 0] },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 110, y2: 0, lineWidth: 0.7 }] },
              { text: 'FECHA', fontSize: 7, bold: true, margin: [0, 3, 0, 0] },
              { text: d.fechaFirma ?? '', fontSize: 8, margin: [0, 1, 0, 0] },
            ],
          },
          casillaFirma('TIMBRE Y FIRMA DEL CLIENTE', d.firmaCliente),
        ],
      },
    ],
  };
}

/**
 * Renderiza y devuelve los bytes. Una instancia de `PdfPrinter` por llamada: no hay
 * estado que reutilizar y esto se ejecuta un puñado de veces por semana.
 */
export async function renderizarNota(d: DatosNota): Promise<Buffer> {
  const printer = new PdfPrinter(FUENTES, undefined, new URLResolver());
  const doc = await printer.createPdfKitDocument(definicionNota(d));
  return new Promise((resolve, reject) => {
    const trozos: Buffer[] = [];
    doc.on('data', (c: Buffer) => trozos.push(c));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
    doc.end();
  });
}
