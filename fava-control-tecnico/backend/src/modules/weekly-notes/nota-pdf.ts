import { dirname, join } from 'node:path';
import type { Column, ContentText, TableCell, TableCellProperties, TDocumentDefinitions } from 'pdfmake/interfaces';
import { LOGO_SVG } from './fava-logo';

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
  /** La nota del dia que escribe el tecnico: horario, o algo que Andrea deba saber. */
  dayNote: string | null;
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

/**
 * La paleta del papel. El original está hecho en Excel: rejilla con bordes finos, las
 * casillas de DATO con relleno azul claro y el valor en azul oscuro y negrita, y las
 * de ETIQUETA en blanco. Reproducirlo importa — es el documento que el cliente firma y
 * lo compara con el que ya conoce.
 */
const BORDE = '#3f3f3f';
const AZUL_FONDO = '#dce9f6';
const AZUL_TEXTO = '#1f4e79';

/** Rejilla completa: todas las líneas, del mismo grosor. Como la hoja de cálculo. */
const REJILLA = {
  hLineWidth: () => 0.7,
  vLineWidth: () => 0.7,
  hLineColor: () => BORDE,
  vLineColor: () => BORDE,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

/**
 * Una celda de texto. `TableCell` incluye `string` en la union, y de un string no se
 * puede hacer spread: sin este alias, cada `{ ...eti(...), colSpan: 2 }` no compila.
 */
type Celda = ContentText & TableCellProperties;

/** Casilla de etiqueta: fondo blanco, texto pequeño y normal. */
const eti = (texto: string, opts: Record<string, unknown> = {}): Celda => ({
  text: texto,
  fontSize: 7.5,
  margin: [1, 1, 1, 1] as [number, number, number, number],
  ...opts,
});

/** Casilla de dato: relleno azul y el valor en azul oscuro, como el papel. */
const dato = (texto: string, opts: Record<string, unknown> = {}): Celda => ({
  text: texto || ' ',
  fontSize: 9,
  bold: true,
  color: AZUL_TEXTO,
  fillColor: AZUL_FONDO,
  margin: [2, 1, 2, 1] as [number, number, number, number],
  ...opts,
});

/**
 * Un bloque de gastos: cuatro filas numeradas y un TOTAL, como el papel. El area
 * rellenable va en azul; los numeros y los rotulos, en blanco.
 */
function bloqueGastos(titulo: string, items: Gasto[], conFecha: boolean, width: string): Column {
  const cols = conFecha ? ['auto', '*', 'auto', 'auto'] : ['auto', '*', 'auto'];
  const n = cols.length;
  const fila = (i: number) => {
    const g = items[i];
    const celdas: Celda[] = [
      eti(`${i + 1}.`, { alignment: 'right' }),
      dato(g?.descripcion ?? ''),
      dato(g?.valor ?? '', { alignment: 'right' }),
    ];
    // La columna «Fecha» solo existe en el bloque del técnico, igual que en el papel.
    if (conFecha) celdas.splice(2, 0, dato(''));
    return celdas;
  };
  const cabecera: Celda[] = conFecha
    ? [eti(''), eti('Descripción', { alignment: 'center' }), eti('Fecha', { alignment: 'center' }), eti('Valor', { alignment: 'center' })]
    : [eti(''), eti('Descripción', { alignment: 'center' }), eti('Valor', { alignment: 'center' })];

  return {
    width,
    table: {
      widths: cols,
      body: [
        [{ ...eti(titulo, { bold: true, alignment: 'center' }), colSpan: n }, ...Array<TableCell>(n - 1).fill({})],
        cabecera,
        ...[0, 1, 2, 3].map(fila),
        [
          { ...eti('TOTAL:', { bold: true, alignment: 'right' }), colSpan: n - 1 },
          ...Array<TableCell>(n - 2).fill({}),
          dato('', { alignment: 'right' }),
        ],
      ],
    },
    layout: REJILLA,
  };
}

/** La casilla donde va el trazo. Vacía y azul mientras nadie haya firmado. */
const casillaFirma = (png?: string): TableCell =>
  png
    ? { image: `data:image/png;base64,${png}`, width: 120, height: 40, fillColor: AZUL_FONDO, margin: [2, 2, 2, 2] }
    : { text: ' ', fillColor: AZUL_FONDO, margin: [2, 20, 2, 20] };

/**
 * La Nota, campo por campo y CELDA POR CELDA como el original.
 *
 * El papel de FAVA es una hoja de cálculo: rejilla continua de bordes finos, membrete y
 * título en la misma banda de arriba, y los valores sobre relleno azul. La primera
 * versión de este generador ponía el mismo contenido como texto suelto con líneas
 * horizontales: decía lo mismo pero no se parecía, y este documento lo firma un cliente
 * que ya conoce el suyo.
 */
export function definicionNota(d: DatosNota): TDocumentDefinitions {
  const localidad = [d.locality, d.country].filter(Boolean).join(', ');

  return {
    pageSize: 'A4',
    pageMargins: [28, 24, 28, 24],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    content: [
      // Banda superior: membrete a la izquierda, título y datos del cliente a la derecha.
      {
        table: {
          widths: ['30%', 'auto', '*', 'auto'],
          body: [
            [
              {
                rowSpan: 3,
                margin: [4, 4, 4, 4],
                stack: [
                  { svg: LOGO_SVG, width: 105, alignment: 'center' },
                  { text: FAVA.razonSocial, bold: true, fontSize: 8.5, alignment: 'center', margin: [0, 3, 0, 0] },
                  // El NIT del membrete es el de FAVA, NO el del cliente. Ver la constante.
                  { text: `NIT: ${FAVA.nit}`, fontSize: 7, alignment: 'center' },
                  { text: FAVA.direccion, fontSize: 6.5, alignment: 'center' },
                  { text: FAVA.web, fontSize: 6.5, alignment: 'center' },
                ],
              },
              {
                colSpan: 3,
                text: 'NOTA PRESTACIÓN SEMANAL',
                bold: true,
                fontSize: 13,
                alignment: 'center',
                margin: [0, 12, 0, 12],
              },
              {},
              {},
            ],
            [{}, eti('Cliente:'), { ...dato(d.clientName), colSpan: 2 }, {}],
            [{}, eti('Localidad:'), { ...dato(localidad), colSpan: 2 }, {}],
            [eti('Suministro:'), dato(d.supply), eti('Contrato:'), dato(d.contractNumber)],
            [eti('Maquinaria:'), { ...dato(d.maquinaria), colSpan: 3 }, {}, {}],
            [eti('Cargo durante esta semana:'), { ...dato(d.cargoSemana), colSpan: 3 }, {}, {}],
            [eti('Técnico:'), { ...dato(d.technicianName.toUpperCase(), { alignment: 'center' }), colSpan: 3 }, {}, {}],
          ],
        },
        layout: REJILLA,
      },

      // Los siete días. DIA y NOTA son COLUMNAS de esta misma tabla y no un bloque
      // aparte: en el original todo vive dentro de la misma rejilla.
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto', 'auto'],
          body: [
            [
              eti('FECHA\n(dd/mm)', { bold: true, alignment: 'center' }),
              eti('DIA', { bold: true, alignment: 'center' }),
              eti('DESCRIPCIÓN TRABAJOS', { bold: true, alignment: 'center' }),
              eti('CATEGORÍA', { bold: true, alignment: 'center' }),
              eti('NOTA', { bold: true, alignment: 'center' }),
            ],
            // Siempre SIETE filas. Un día de otro proyecto va en blanco y no se omite:
            // la Nota es de una semana entera y una fila que falta parece un olvido, no
            // «ese día estuvo en otra obra».
            ...d.filas.map((f, i) => [
              eti(ddmmyyyy(f.date), { alignment: 'center', fontSize: 8 }),
              eti(DIAS[i] ?? '', { alignment: 'center', fontSize: 8 }),
              eti(f.description ?? ' ', { alignment: 'center', fontSize: 8 }),
              eti(f.categoria ?? ' ', { alignment: 'center', fontSize: 8 }),
              // La nota DEL DIA si el tecnico escribio una («HORARIO 7 AM - 5 PM»);
              // si no, el n.º de contrato, que es lo que el papel repetia en las
              // siete filas. Pedido por Andrea (2026-08-30): esa columna existia y no
              // habia forma de escribir en ella.
              eti(f.dayNote || d.contractNumber || ' ', { alignment: 'center', fontSize: 8 }),
            ]),
          ],
        },
        layout: REJILLA,
      },

      // Solo los gastos del tecnico (NOTA-08). El bloque «Anticipo efectuado por el
      // cliente» salio del PDF a peticion de Andrea (2026-08-30): en la practica nadie
      // lo rellenaba y ocupaba media banda. El dato se sigue capturando y Andrea lo ve
      // en la bandeja; si algun dia vuelve al papel, `bloqueGastos` sigue aqui.
      {
        columns: [bloqueGastos('Gastos sostenidos por el técnico', d.gastosTecnico, true, '100%')],
        columnGap: 0,
      },

      // Declaración, el hueco libre del papel y las tres casillas de firma.
      {
        table: {
          widths: ['*', '*', '*'],
          body: [
            [{ ...eti(DECLARACION, { bold: true, alignment: 'center' }), colSpan: 3 }, {}, {}],
            [{ text: ' ', margin: [0, 20, 0, 20], colSpan: 3 }, {}, {}],
            [
              eti('FIRMA DEL TÉCNICO', { bold: true, alignment: 'center' }),
              eti('FECHA', { bold: true, alignment: 'center' }),
              eti('TIMBRE Y FIRMA DEL CLIENTE', { bold: true, alignment: 'center' }),
            ],
            [
              casillaFirma(d.firmaTecnico),
              dato(d.fechaFirma ?? '', { alignment: 'center', margin: [2, 20, 2, 20] }),
              casillaFirma(d.firmaCliente),
            ],
          ],
        },
        layout: REJILLA,
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
