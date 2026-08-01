/**
 * Genera el informe PDF para revisar el Excel con Andrea.
 *
 *     npm -w backend run informe
 *
 * Sale a la raíz del repositorio como `Informe-Control-Tecnico-FAVA.pdf`.
 *
 * Reutiliza el mismo `PdfPrinter` que la Nota Semanal (mismas trampas de pdfmake 0.3:
 * el printer del servidor está en `pdfmake/js/Printer.js`, `createPdfKitDocument` es
 * asíncrono y el tercer argumento del constructor NO es opcional).
 *
 * Los datos van EN EL CÓDIGO y no leídos del .xls a propósito: este informe se lee al
 * lado del libro abierto, y cada cifra lleva su celda para poder contrastarla a mano.
 * Si el libro cambia, se corrige aquí y se vuelve a generar.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

type CreatedPdf = NodeJS.ReadableStream & { end(): void };
interface Printer {
  createPdfKitDocument(def: TDocumentDefinitions): Promise<CreatedPdf>;
}
type Ctor = new (fuentes: unknown, vfs: unknown, urlResolver: unknown) => Printer;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = (require('pdfmake/js/Printer.js') as { default: Ctor }).default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URLResolver = (require('pdfmake/js/URLResolver.js') as { default: new () => unknown }).default;

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

const AZUL = '#104A78';
const GRIS = '#666666';
const ROJO = '#B3261E';
const AMBAR = '#8A5A00';
const VERDE = '#1F6F43';

// ── Ayudas de maquetación ──

const h1 = (t: string): Content => ({
  text: t,
  fontSize: 15,
  bold: true,
  color: AZUL,
  margin: [0, 18, 0, 6],
  pageBreak: 'before',
});

const h1Primera = (t: string): Content => ({
  text: t,
  fontSize: 15,
  bold: true,
  color: AZUL,
  margin: [0, 4, 0, 6],
});

const h2 = (t: string): Content => ({ text: t, fontSize: 11, bold: true, margin: [0, 10, 0, 4] });

const p = (t: string | Content[]): Content => ({ text: t, fontSize: 9, margin: [0, 0, 0, 4], lineHeight: 1.25 });

const cita = (t: string): Content => ({
  text: `«${t}»`,
  fontSize: 8.5,
  italics: true,
  color: GRIS,
  margin: [10, 2, 0, 6],
});

/** Recuadro de pregunta: es lo que hay que llevarle a Andrea. */
const pregunta = (t: string): Content => ({
  table: { widths: ['*'], body: [[{ text: t, fontSize: 9.5, bold: true, margin: [7, 6, 7, 6] }]] },
  layout: {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => AZUL,
    vLineColor: () => AZUL,
    fillColor: () => '#EEF4FA',
  },
  margin: [0, 4, 0, 8],
});

/** Tabla con cabecera azul. `anchos` en el formato de pdfmake. */
function tabla(cabecera: string[], filas: (string | number)[][], anchos: (string | number)[]): Content {
  return {
    table: {
      headerRows: 1,
      widths: anchos,
      body: [
        cabecera.map((c) => ({ text: c, bold: true, fontSize: 7.5, color: '#FFFFFF', fillColor: AZUL })),
        ...filas.map((f) => f.map((v) => ({ text: String(v), fontSize: 8 }))),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 8],
  };
}

const semaforo = (color: string, texto: string): Content => ({
  text: texto,
  fontSize: 8.5,
  bold: true,
  color,
  margin: [0, 0, 0, 3],
});

// ── Datos, cada uno con su celda ──

/** Las 6 órdenes: proyecto, hoja, celda del OA, OA, commessa, valor, etiqueta. */
const ORDENES: (string | number)[][] = [
  ['Lucchetti Chile ', 'H7 / J7 / L7', 'OA0159103', '343298', '160.000', '(no nombra máquina)'],
  ['Pasta Sole - Ex Molino Fenix', 'H6 / J6 / L6', 'OA0159104', '343498', '165.000', '(no nombra máquina)'],
  ['JAV Brasil', 'I1 / K1 / M1', 'OA0159105', '342898', '182.500', 'PL 6000 KG - 1-3428'],
  ['JAV Brasil', 'I36 / K36 / M36', 'OA0159107', '342998', '182.500', 'PL 6000 KG - 2-3429'],
  ['JAV Brasil', 'I19 / K19 / M19', 'OA0159108', '343098', '130.000', 'PC 4000 -3430 + 4 SILOS'],
  ['Cibao -Rep D', 'H2 / J2 / L2', 'OA0163864', '345598', '160.000', 'PL 4500 GLP 180'],
];

/** El vendido, orden por orden. Cada bloque: [rango de filas, rol, vendido, ejecutado, delta]. */
const VENDIDO: { titulo: string; hoja: string; filas: (string | number)[][] }[] = [
  {
    titulo: 'Lucchetti — OA0159103 / commessa 343298',
    hoja: 'Lucchetti Chile ',
    filas: [
      ['MONTAJE', 'H9', '', '', ''],
      ['Supervisore', 'H11', 'J11 = 10', 'K11 = 0', 'L11 = 10'],
      ['Meccanico', 'H12', 'J12 = 144', 'K12 = 62', 'L12 = 26'],
      ['Meccanico (2.ª plaza)', 'H13', '—', 'K13 = 56', '—'],
      ['Elettricista', 'H14', 'J14 = 104', 'K14 = 69', 'L14 = 6'],
      ['Elettricista (2.ª plaza)', 'H15', '—', 'K15 = 29', '—'],
      ['TOTALE', 'I16', 'J16 = 258', 'K16 = 216', ''],
      ['COLLAUDO', 'H20', '', '', ''],
      ['Test', 'H22', 'J22 = 21', 'K22 = 1', 'L22 = 20'],
      ['Sofware', 'H23', 'J23 = 35', 'K23 = 0', 'L23 = 35'],
      ['Meccanico', 'H24', 'J24 = 56', 'K24 = 0', 'L24 = 56'],
    ],
  },
  {
    titulo: 'JAV línea 1 — OA0159105 / commessa 342898 — PL 6000 KG - 1-3428',
    hoja: 'JAV Brasil',
    filas: [
      ['MONTAJE', 'I3', '', '', ''],
      ['Supervisore', 'I5', 'K5 = 15', 'L5 = 0', 'M5 = 15'],
      ['Meccanico', 'I6', 'K6 = 182', 'L6 = 120', 'M6 = 6'],
      ['Meccanico (2.ª plaza)', 'I7', '—', 'L7 = 56', '—'],
      ['Elettricista', 'I8', 'K8 = 130', 'L8 = 55', 'M8 = 32'],
      ['Elettricista (2.ª plaza)', 'I9', '—', 'L9 = 43', '—'],
      ['TOTALE', 'J10', 'K10 = 327', 'L10 = 274', ''],
      ['COLLAUDO', 'I12', '', '', ''],
      ['Test', 'I14', 'K14 = 23', 'L14 = 0', 'M14 = 23'],
      ['Sofware', 'I15', 'K15 = 35', 'L15 = 0', 'M15 = 35'],
      ['Meccanico', 'I16', 'K16 = 58', 'L16 = 0', 'M16 = 58'],
    ],
  },
  {
    titulo: 'JAV línea 2 — OA0159108 / commessa 343098 — PC 4000 -3430 + 4 SILOS',
    hoja: 'JAV Brasil',
    filas: [
      ['MONTAJE', 'I21', '', '', ''],
      ['Supervisore', 'I23', 'K23 = 10', 'L23 = 0', 'M23 = 10'],
      ['Meccanico', 'I24', 'K24 = 98', 'L24 = 31', 'M24 = 67'],
      ['Meccanico (2.ª plaza)', 'I25', '—', 'L25 = 0', '—'],
      ['Elettricista', 'I26', 'K26 = 92', 'L26 = 0', 'M26 = 92'],
      ['Elettricista (2.ª plaza)', 'I27', '—', 'L27 = 0', '—'],
      ['TOTALE', 'J28', 'K28 = 200', 'L28 = 31', ''],
      ['COLLAUDO', 'I30', '', '', ''],
      ['Test', 'I32', 'K32 = 21', 'L32 = 0', 'M32 = 21'],
      ['Sofware', 'I33', 'K33 = 35', 'L33 = 0', 'M33 = 35'],
      ['Meccanico', 'I34', 'K34 = 56', 'L34 = 0', 'M34 = 56'],
    ],
  },
  {
    titulo: 'JAV línea 3 — OA0159107 / commessa 342998 — PL 6000 KG - 2-3429',
    hoja: 'JAV Brasil',
    filas: [
      ['MONTAJE', 'I38', '', '', ''],
      ['Supervisore', 'I40', 'K40 = 10', 'L40 = 0', 'M40 = 10'],
      ['Meccanico', 'I41', 'K41 = 182', 'L41 = 87', 'M41 = 19'],
      ['Meccanico (2.ª plaza)', 'I42', '—', 'L42 = 76', '—'],
      ['Elettricista', 'I43', 'K43 = 130', 'L43 = 20', 'M43 = 62'],
      ['Elettricista (2.ª plaza)', 'I44', '—', 'L44 = 48', '—'],
      ['TOTALE', 'J45', 'K45 = 322', 'L45 = 231', ''],
      ['COLLAUDO', 'I47', '', '', ''],
      ['Test', 'I49', 'K49 = 23', 'L49 = 0', 'M49 = 23'],
      ['Sofware', 'I50', 'K50 = 35', 'L50 = 0', 'M50 = 35'],
      ['Meccanico', 'I51', 'K51 = 58', 'L51 = 0', 'M51 = 58'],
    ],
  },
  {
    titulo: 'Cibao — OA0163864 / commessa 345598 — PL 4500 GLP 180',
    hoja: 'Cibao -Rep D',
    filas: [
      ['MONTAJE', 'H4', '', '', ''],
      ['Supervisore', 'H6', 'J6 = 10', 'K6 = 0', 'L6 = 10'],
      ['Meccanico', 'H7', 'J7 = 156', 'K7 = 63', 'L7 = 93'],
      ['Meccanico (plaza «xxxxxx»)', 'H8 / I8', '—', 'K8 = 0', '—'],
      ['Elettricista', 'H9', 'J9 = 104', 'K9 = 28', 'L9 = 76'],
      ['Elettricista (plaza «xxxxxx»)', 'H10 / I10', '—', 'K10 = 0', '—'],
      ['TOTALE', 'I11', 'J11 = 270', 'K11 = 91', ''],
      ['COLLAUDO', 'H14', '', '', ''],
      ['Test', 'H16', 'J16 = 21', 'K16 = 0', 'L16 = 21'],
      ['Sofware', 'H17', 'J17 = 35', 'K17 = 0', 'L17 = 35'],
      ['Meccanico', 'H18', 'J18 = 56', 'K18 = 0', 'L18 = 56'],
    ],
  },
  {
    titulo: 'Pasta Sole — OA0159104 / commessa 343498',
    hoja: 'Pasta Sole - Ex Molino Fenix',
    filas: [
      ['MONTAJE', 'H8', '', '', ''],
      ['Supervisore', 'H10', 'J10 = 10', 'K10 = 0', 'L10 = 10'],
      ['Meccanico', 'H11', 'J11 = 156', 'K11 = 96', 'L11 = 60'],
      ['Meccanico (2.ª plaza)', 'H12', '—', 'K12 = 0', '—'],
      ['Elettricista', 'H13', 'J13 = 104', 'K13 = 33', 'L13 = 71'],
      ['Elettricista (2.ª plaza)', 'H14', '—', 'K14 = 0', '—'],
      ['TOTALE (desplazado, sin vendido)', 'J15', '— falta', 'K15 = 129', ''],
      ['COLLAUDO', 'H19', '', '', ''],
      ['Test', 'H21', 'J21 = 21', 'K21 = 0', 'L21 = 21'],
      ['Sofware', 'H22', 'J22 = 35', 'K22 = 0', 'L22 = 35'],
      ['Meccanico', 'H23', 'J23 = 56', 'K23 = 0', 'L23 = 56'],
    ],
  },
];

const HOJAS: (string | number)[][] = [
  ['1', 'Resoconto', '51 × 16', 'Cuadro de mando de J MACEDO. 20 celdas #REF! rotas'],
  ['2', '2025', '2.844 filas', 'Bitácora diaria 2025, 10 técnicos'],
  ['3', 'Dettaglio anno 2025', '—', 'Tabla dinámica de 2025'],
  ['4', 'Parametros', '—', 'Catálogo de conceptos (los 8 códigos)'],
  ['5', 'Calendar', '—', 'Calendario auxiliar'],
  ['6', '2026', '4.745 filas', 'Bitácora diaria 2026, 13 técnicos'],
  ['7', 'Dettaglio anno 2026', '—', 'Tabla dinámica de 2026 → es KPI-07'],
  ['8', 'Viaggi', '31 × 8', 'Gastos de viaje, con importes en euros'],
  ['9', 'Viaggi (2)', '31 × 8', 'La misma con el pivot colapsado'],
  ['10', 'Lucchetti Chile ', '27 × 12', 'Hoja de proyecto — 1 línea de máquina'],
  ['11', 'JAV Brasil', '51 × 16', 'Hoja de proyecto — 3 líneas de máquina'],
  ['12', 'Cibao -Rep D', '18 × 12', 'Hoja de proyecto — 1 línea. Plazas «xxxxxx»'],
  ['13', 'Pasta Sole - Ex Molino Fenix', '23 × 12', 'Hoja de proyecto — 1 línea. TOTALE desplazado'],
  ['14', 'J Macedo Brasil- final', '37 × 16', 'Hoja de proyecto SIN OA ni commessa. Lleva costos'],
];

const ROLES: (string | number)[][] = [
  ['Mecanico', '2.173', 'Camilo Cruz, Giuliano Lodi, Leomar Klein, Leomir Klein'],
  ['Tecnologo', '730', 'Marco Bosi'],
  ['Software', '480', 'Ivan Cortes'],
  ['Tecnico', '445', 'Vito Antonio Accini'],
  ['Meccatronico', '423', 'Fredy Sarmiento'],
  ['Técnico Eléctrico', '365', 'Diego Bautista'],
  ['Eletrico', '365', 'Andrea Scapin'],
  ['Eléctrico Senior', '365', 'Felice Ruocco'],
  ['Aiuto', '365', 'Felipe Sena'],
  ['Elettrico', '171', 'Andrea Scapin  ← misma persona que «Eletrico»'],
  ['ElectroMecanico', '159', 'Fredy Sarmiento  ← misma persona que «Meccatronico»'],
  ['Electtricista', '143', 'Felipe Sena'],
  ['Auto Meccanico', '124', 'Felipe Sena'],
  ['Electrico', '97', 'Felipe Sena  ← misma persona que «Electtricista»'],
  ['Manager Cantiere', '90', 'Luca Carraro'],
  ['Capo Elettricista', '78', 'Ivan Cortes  ← además de «Software»'],
];

const PROYECTOS: (string | number)[][] = [
  ['JMACEDO', '1.050', '0', '¿Brasil?'],
  ['JAV Marata - Brasil', '536', '3', '¿Brasil?'],
  ['LUCCHETTI CHILE SA', '217', '1', '¿Chile?'],
  ['MAIZAL FOOD GROUP CORP- Venezuela', '185', '0', '¿Venezuela?'],
  ['GRUPO BOCEL-RD', '179', '0', '¿Rep. Dominicana?'],
  ['Pasta Sole  - ARGENTINA', '129', '1', '¿Argentina?'],
  ['La Moderna- Messico', '114', '0', '¿México?'],
  ['MOLINO CIBAO BOCEL - RD', '91', '1', '¿Rep. Dominicana?'],
  ['MOLINOS TRES ARROYOS', '62', '0', '¿Argentina?'],
  ['MAIZAL GROUP - CUMANA', '39', '0', '¿Venezuela?'],
  ['GREECE - KILKIS EURIMAC', '27', '0', '¿Grecia?'],
  ['Winland_St louis USA', '23', '0', '¿Estados Unidos?'],
  ['DAKOTA GROWERS', '21', '0', '¿Estados Unidos?'],
  ['DOGA/ GOYMEN_Turkey', '20', '0', '¿Turquía?'],
  ['LUCCHETTI CHILE SA_Ch', '15', '0', '¿Chile?'],
  ['JMACEDO-Brasil- CAPACITACION', '14', '0', '¿Brasil?'],
  ['Sucesores Jacobo Paredes_ Ecuador', '13', '0', '¿Ecuador?'],
  ['Eurimac_ Grecia kilkis', '11', '0', '¿Grecia?'],
  ['MOLINO CIBAO BOCEL', '10', '0', '¿Rep. Dominicana?'],
  ['Precocidos del oriente_Barranquilla', '9', '0', '¿Colombia?'],
  ['Moderna de Alimentos_Ecuador', '7', '0', '¿Ecuador?'],
  ['MOLINOS 3 ARROYOS ARGENTINA', '7', '0', '¿Argentina?'],
];

const DUPLICADOS: (string | number)[][] = [
  ['JMACEDO', '1.050', 'JMACEDO-Brasil- CAPACITACION', '14', 'Capacitación puede ser contrato aparte'],
  ['LUCCHETTI CHILE SA', '217', 'LUCCHETTI CHILE SA_Ch', '15', 'Parece duplicado'],
  ['MOLINO CIBAO BOCEL - RD', '91', 'MOLINO CIBAO BOCEL', '10', 'Parece duplicado'],
  ['MOLINOS TRES ARROYOS', '62', 'MOLINOS 3 ARROYOS ARGENTINA', '7', 'Parece duplicado'],
  ['GREECE - KILKIS EURIMAC', '27', 'Eurimac_ Grecia kilkis', '11', 'Parece duplicado'],
  ['MAIZAL FOOD GROUP CORP- Venezuela', '185', 'MAIZAL GROUP - CUMANA', '39', 'Cumaná es otra ciudad: ¿dos plantas?'],
];

const MACEDO: (string | number)[][] = [
  ['MONTAGGIO', 'H9', '', '', '', ''],
  ['Manager Cantiere FLA', 'H11', 'J11 = 45', 'K11 = 45', 'L11 = 0', 'M11 = 550'],
  ['Meccatronico', 'H12', 'J12 = 363', 'K12 = 338', 'L12 = 25', 'M12 = 270'],
  ['Capo Elettricista', 'H13', 'J13 = 120', 'K13 = 154', 'L13 = −34', 'M13 = 368'],
  ['Electtricista', 'H14', 'J14 = 171', 'K14 = 132', 'L14 = 39', 'M14 = 227'],
  ['Auto Meccanico', 'H15', 'J15 = 0', 'K15 = 0', 'L15 = 0', 'M15 = 0'],
  ['COLLAUDO', 'H16', '', '', '', ''],
  ['Softwerista', 'H18', 'J18 = 187', 'K18 = 166', 'L18 = 21', 'M18 = 368'],
  ['Meccanico', 'H19', 'J19 = 187', 'K19 = 118', 'L19 = 69', 'M19 = 270'],
  ['TOTAL', 'fila 20', 'J20 = 1.073', 'K20 = 943', 'L20 = 130', 'N20 = 323.657'],
];

const MAQUINAS_BITACORA: (string | number)[][] = [
  ['JMACEDO', 'PL 6000 PC 4500', '290', 'dos máquinas, sin separador'],
  ['JMACEDO', 'PC 4500', '248', ''],
  ['JMACEDO', 'Pasta Lunga  PL 6000', '158', ''],
  ['LUCCHETTI CHILE SA', 'Pasta Lunga 4000 kg', '118', 'su hoja NO nombra máquina'],
  ['JMACEDO', 'CTA1000', '97', ''],
  ['JMACEDO', 'Pasta Corta 340300 / Pasta Larga 340200 / Nidos 340400', '56', '¿commesse de fabricación?'],
  ['JMACEDO', 'Auto Meccanico - PL 6000', '14', 'un ROL metido en la columna de máquina'],
  ['MOLINO CIBAO BOCEL', 'Reemplazo de tapetes', '10', 'un servicio, no una máquina'],
  ['JMACEDO', 'Sin Maquina', '9', ''],
  ['JMACEDO', 'CTA1000,PC4500', '7', 'dos máquinas con coma'],
  ['JMACEDO', 'CTA1000/PL6000', '6', 'dos máquinas con barra'],
];

function definicion(): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [38, 42, 38, 46],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    footer: (pagina: number, total: number) => ({
      columns: [
        { text: 'Control Técnico FAVA — informe para revisar el Excel', fontSize: 7.5, color: GRIS },
        { text: `${pagina} / ${total}`, fontSize: 7.5, color: GRIS, alignment: 'right' },
      ],
      margin: [38, 12, 38, 0],
    }),
    content: [
      // ── Portada ──
      { text: 'CONTROL TÉCNICO FAVA', fontSize: 20, bold: true, color: AZUL },
      { text: 'Informe para revisar el Excel con Andrea', fontSize: 12, color: GRIS, margin: [0, 2, 0, 2] },
      { text: `Generado el ${new Date().toLocaleDateString('es-CO')}`, fontSize: 8.5, color: GRIS },
      {
        canvas: [{ type: 'line', x1: 0, y1: 6, x2: 519, y2: 6, lineWidth: 2, lineColor: AZUL }],
        margin: [0, 4, 0, 12],
      },

      p([
        { text: 'Para qué sirve este documento. ', bold: true },
        'Reúne todo lo que falta por decidir para terminar el sistema, con la celda exacta del Excel de la que sale cada cifra. La idea es leerlo con el libro abierto al lado y poder contrastar cualquier número a mano.',
      ]),
      p([
        { text: 'Cómo leerlo. ', bold: true },
        'Las preguntas van en recuadro azul: son las que hay que hacerle a Andrea. Cada una explica qué bloquea y qué ya se verificó, para que la conversación empiece por lo que falta y no por lo que ya está resuelto.',
      ]),

      h2('Estado de los datos, hoy'),
      tabla(
        ['Concepto', 'Cantidad', 'Nota'],
        [
          ['Jornadas migradas', '6.573', '2025-01-01 → 2026-12-31'],
          ['  · con proyecto', '2.779', ''],
          ['  · sin proyecto', '3.794', 'todas LR/NR — es correcto, no es un hueco'],
          ['  · con máquina atribuida', '437', 'nuevo: proyectos con UNA sola orden'],
          ['Proyectos', '22', 'ninguno tiene localidad, país, suministro ni contrato'],
          ['Técnicos', '13', ''],
          ['Órdenes (máquinas contratadas)', '6', 'nuevo: cargadas de las hojas de proyecto'],
          ['Días vendidos (la matriz)', '0', 'bloqueado por la pregunta 1'],
          ['Notas semanales', '0', 'nadie ha usado la app todavía'],
        ],
        ['*', 60, 200],
      ),

      h2('Resumen de las 6 preguntas'),
      semaforo(ROJO, '● BLOQUEAN trabajo ya construido y esperando datos'),
      p('1.  ¿A qué rol se refiere «Elettricista» en la cotización? → bloquea el tablero vendido vs. ejecutado'),
      p('2.  Localidad, país, suministro y n.º de contrato de los 22 proyectos → bloquea el encabezado de la Nota firmada'),
      semaforo(AMBAR, '● IMPORTANTES pero no bloqueantes'),
      p('3.  Seis pares de proyectos que parecen duplicados'),
      p('4.  J MACEDO no tiene OA ni commessa, y es el proyecto más grande (1.050 jornadas)'),
      p('5.  ¿En qué moneda están los importes?'),
      semaforo(VERDE, '● YA RESUELTO en el código, solo confirmar'),
      p('6.  El Excel tiene 1.220 días con fecha futura'),

      // ── 1 ──
      h1('1. ¿A qué rol se refiere «Elettricista»?'),
      semaforo(ROJO, '● BLOQUEA: la matriz vendido vs. ejecutado (KPI-01 y KPI-08)'),
      p('Es el tablero que Andrea quiere que Luca mire cada semana. Sin resolver esto, el vendido no se puede cargar y el tablero mostraría solo la mitad de la historia.'),

      h2('Las 6 etiquetas del vendido, y cuáles ya se resolvieron'),
      p('Las hojas de proyecto usan un vocabulario propio. Cuatro de las seis se resuelven solas contra los datos; una no existe y una es ambigua:'),
      tabla(
        ['Etiqueta del Excel', 'Resuelve a', 'Cómo se sabe'],
        [
          ['Supervisore', 'Manager Cantiere', 'Luca Carraro es el único, y es el Supervisore en las 5 hojas'],
          ['Meccanico', 'Mecanico', 'Camilo, Giuliano, Leomar, Leomir'],
          ['Sofware', 'Software', 'Ivan Cortes, 480 jornadas'],
          ['Test', 'nadie', '0 días ejecutados en todo el libro salvo 1'],
          ['Elettricista', '???', 'seis candidatos posibles'],
        ],
        [110, 110, '*'],
      ),

      h2('El catálogo de roles completo, con quién lo usa'),
      p('Los 16 roles salen de la columna «Tipo» de las hojas diarias, con todas sus grafías:'),
      tabla(['Rol', 'Jornadas', 'Quién lo usa'], ROLES, [110, 45, '*']),

      h2('Parte de la discrepancia SÍ es idioma — y está comprobado'),
      p('Hay tres casos donde el MISMO técnico aparece con dos grafías. Eso es ortografía o idioma, y fusionarlas es seguro:'),
      p([
        { text: '·  Andrea Scapin: ', bold: true },
        '«Eletrico» (365) y «Elettrico» (171) — la misma palabra con una t o dos.',
      ]),
      p([
        { text: '·  Felipe Sena: ', bold: true },
        '«Electrico» (97) y «Electtricista» (143).',
      ]),
      p([
        { text: '·  Fredy Sarmiento: ', bold: true },
        '«Meccatronico» (423) y «ElectroMecanico» (159) — italiano y español de lo mismo.',
      ]),

      h2('Pero parte NO lo es, y por eso no se puede consolidar a ciegas'),
      p([
        { text: 'Iván Cortés tiene «Software» (480 días) Y «Capo Elettricista» (78). ', bold: true },
        'Eso es exactamente lo que Andrea dijo en la primera grabación:',
      ]),
      cita('este Iván puede ser electricista y softwareista'),
      p('Fusionar por idioma borraría justo el dato que ella pidió capturar. Y «Eléctrico Senior» frente a «Técnico Eléctrico» frente a «Capo Elettricista» parece jerarquía, no traducción.'),

      pregunta(
        'Cuando la cotización dice «Elettricista» y vende 104 días, ¿se refiere a una persona concreta, a cualquier eléctrico, o es una partida comercial que no apunta a nadie?',
      ),

      p([
        { text: 'Lectura propuesta, para contrastar: ', bold: true },
        'es una partida comercial. El catálogo de roles registra qué hizo alguien un día; el vendido registra cuánto se contrató. Si se confirma, el vendido debería colgar de un catálogo aparte de partidas por fase (montaje: Supervisore / Meccanico / Elettricista; collaudo: Test / Sofware / Meccanico) y la pregunta desaparece, porque no habría que mapear nada.',
      ]),

      pregunta(
        'Extra: «Test» se vende siempre (21 o 23 días en las 6 órdenes) y no se ejecuta NUNCA — 0 días en todo el libro salvo uno de Andrea Scapin en Lucchetti (celda K22), que además es un día de viaje. ¿Es una partida que se cotiza por costumbre y no se usa, o sí se ejecuta y no se registra?',
      ),

      // ── 2 ──
      h1('2. Los 22 proyectos no tienen localidad, país, suministro ni contrato'),
      semaforo(ROJO, '● BLOQUEA: el encabezado de la Nota Semanal firmada, y el KPI de días por país'),
      p('Esos cuatro campos son literalmente lo que imprime el PDF de la Nota. De los 22 proyectos, CERO tienen alguno de los cuatro. El Excel no los trae en ninguna hoja.'),
      p('El país parece deducible del nombre, pero no se rellena por cuenta propia porque sería inventar. La columna «¿País?» es una propuesta a confirmar:'),
      tabla(['Proyecto', 'Jornadas', 'Órdenes', '¿País?'], PROYECTOS, ['*', 45, 42, 105]),

      pregunta(
        '¿Confirmas el país de cada proyecto? ¿Y de dónde salen la LOCALIDAD, el SUMINISTRO y el N.º DE CONTRATO — de las cotizaciones, o hay que capturarlos a mano uno por uno?',
      ),
      p([
        { text: 'Ojo con el n.º de contrato. ', bold: true },
        'Para las 6 órdenes cargadas podría ser el OA (OA0159103…), pero el PDF de referencia (Reporte 02 — Ivan Cortés, Grupo Bocel) usa 345500 en esa casilla, que es OTRO número. Hace falta saber cuál de los dos va impreso.',
      ]),

      // ── 3 ──
      h1('3. Seis pares de proyectos que parecen duplicados'),
      semaforo(AMBAR, '● IMPORTANTE: hoy cada par cuenta por separado en todos los KPIs'),
      tabla(
        ['Proyecto A', 'Jorn.', 'Proyecto B', 'Jorn.', 'Observación'],
        DUPLICADOS,
        [120, 32, 120, 32, '*'],
      ),
      pregunta(
        '¿Cuáles de estos seis pares son el mismo proyecto y hay que fusionar, y cuáles son proyectos distintos del mismo cliente?',
      ),
      p('El primero merece cuidado: capacitación y montaje pueden ser contratos distintos, así que no se asume que sea duplicado.'),

      // ── 4 ──
      h1('4. J MACEDO no tiene OA ni commessa — y es el más grande'),
      semaforo(AMBAR, '● IMPORTANTE: es el proyecto con 1.050 jornadas, el mayor de todos'),
      p('Su hoja (J Macedo Brasil- final) es la única sin OA ni commessa. Su único importe es 425.600 en la celda N8, a nivel de PROYECTO y no de máquina. Además usa un vocabulario de roles distinto al de las otras hojas:'),
      tabla(
        ['Partida', 'Celda', 'Vendido', 'Ejecutado', 'Delta', 'Coste unit.'],
        MACEDO,
        [125, 42, 68, 68, 55, '*'],
      ),
      p('Esta hoja es además la única con dimensión económica: lleva coste unitario, coste total y una tarifa para el delta pendiente.'),

      h2('La pista: las máquinas que sí aparecen en la bitácora'),
      p('El texto de máquina que escribieron los técnicos, tal cual, con sus grafías:'),
      tabla(['Proyecto', 'Texto de máquina', 'Filas', 'Observación'], MAQUINAS_BITACORA, [95, 175, 32, '*']),

      pregunta(
        '¿J MACEDO tiene OA y commessa en algún lado, o de verdad se contrató en bloque por 425.600 sin desglose por máquina?',
      ),
      pregunta(
        'Los números 340300 / 340200 / 340400 que aparecen en su bitácora terminan en 00, mientras las 6 commesse conocidas terminan todas en 98. ¿El sufijo distingue fabricación (00) de asistencia (98)? Si es así, ¿son esas las commesse de las máquinas de JMACEDO?',
      ),

      // ── 5 ──
      h1('5. ¿En qué moneda están los importes?'),
      semaforo(AMBAR, '● IMPORTANTE: hoy el valor de contrato se guarda sin unidad'),
      p('El libro NO trae símbolo de moneda en ninguna celda — se revisaron las 14 hojas. El catálogo de monedas de la aplicación está vacío. Los importes cargados son: 160.000, 165.000, 182.500, 130.000 y 425.600.'),
      p('En la grabación del cotizador Andrea habla siempre en euros («me costó 100 euros», «cobramos 430 al día», «368 euros»), y menciona que convierte de pesos a euros con la TRM del 1 de enero.'),
      pregunta(
        '¿Los valores de contrato de las hojas de proyecto están en euros? ¿La aplicación debe manejar varias monedas, o todo se lleva a euros?',
      ),

      // ── 6 ──
      h1('6. El Excel tiene 1.220 días con fecha futura'),
      semaforo(VERDE, '● YA RESUELTO en el código — solo hace falta confirmarlo'),
      p('El Excel pre-rellena el año entero y marca como LR/NR los días que todavía no han ocurrido: 911 LR + 309 NR con fecha hasta el 31 de diciembre de 2026, de 8 técnicos, todos marcados como aprobados.'),
      p('Contarlos hundía la utilización global al 36,8 %. Sin ellos da 54,6 %, que además cuadra con los ~210 días al año con los que Andrea costea en la grabación del cotizador — dos fuentes que no se hablan entre sí y dan lo mismo.'),
      p('El tablero de utilización ya los excluye y lo dice en pantalla. La cuadrícula de días (KPI-07) SÍ los sigue mostrando, a propósito, porque reproduce la tabla dinámica de Andrea celda a celda.'),
      pregunta(
        '¿Los días futuros son solo relleno de calendario, o algunos son planificación real (un técnico ya asignado a un proyecto que aún no empieza)?',
      ),
      p('Si fueran planificación, valdría la pena distinguirlos en vez de ignorarlos.'),

      // ── Anexos ──
      h1('Anexo A — Las 14 hojas del libro'),
      p('Tamaño en filas × columnas, para ubicarse:'),
      tabla(['#', 'Hoja', 'Tamaño', 'Qué es'], HOJAS, [18, 130, 55, '*']),

      h1('Anexo B — Las 6 órdenes cargadas, con su celda'),
      p('Ya están en el sistema. Cada una sale de la celda indicada:'),
      tabla(
        ['Hoja', 'Celdas (OA/comm./valor)', 'OA', 'Commessa', 'Valor', 'Máquina'],
        ORDENES,
        [95, 85, 60, 48, 45, '*'],
      ),
      p([
        { text: 'Comprobación: ', bold: true },
        'JAV suma 182.500 + 182.500 + 130.000 = 495.000, igual que sus tres celdas. Y las commesse cortas (3428, 3429, 3430) coinciden con el serial de la máquina en cada etiqueta.',
      ]),

      h1('Anexo C — La matriz de días vendidos, celda por celda'),
      p('Esto es lo que NO se ha cargado todavía, a la espera de la pregunta 1. Se incluye completo para poder contrastarlo con el libro:'),
      ...VENDIDO.flatMap((bloque): Content[] => [
        { text: bloque.titulo, fontSize: 9.5, bold: true, color: AZUL, margin: [0, 8, 0, 1] },
        { text: `hoja «${bloque.hoja}»`, fontSize: 7.5, color: GRIS, margin: [0, 0, 0, 3] },
        tabla(['Partida', 'Celda', 'Vendido', 'Ejecutado', 'Delta'], bloque.filas, [140, 45, 75, 75, '*']),
      ]),
      p([
        { text: 'Dos anomalías del libro que conviene mirar: ', bold: true },
        'en Pasta Sole la fila TOTALE está desplazada una columna y le falta el total vendido (celda J15). Y en Cibao hay dos plazas escritas como «xxxxxx» (celdas I8 e I10), que significan plaza sin cubrir — al migrar eso es un vacío, no un técnico llamado así.',
      ]),
    ],
  };
}

async function main() {
  const printer = new PdfPrinter(FUENTES, undefined, new URLResolver());
  const doc = await printer.createPdfKitDocument(definicion());
  const trozos: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    doc.on('data', (c: Buffer) => trozos.push(c));
    doc.on('end', () => resolve());
    doc.on('error', reject);
    doc.end();
  });
  const bytes = Buffer.concat(trozos);
  const salida = join(__dirname, '..', '..', '..', 'Informe-Control-Tecnico-FAVA.pdf');
  writeFileSync(salida, bytes);
  console.log(`OK ${salida} — ${(bytes.length / 1024).toFixed(0)} KB`);
}

void main();
