/**
 * Las ÓRDENES (máquinas contratadas) del Excel entran en la base.
 *
 *     npm -w backend run migrate:ordenes            # aplica
 *     npm -w backend run migrate:ordenes -- --dry   # solo el reporte, no escribe
 *
 * Corre como OWNER (prisma.config.ts -> MIGRATE_DATABASE_URL), igual que
 * `migrate-excel.ts`: migrar es DML de mantenimiento, no runtime.
 *
 * IDEMPOTENTE por `commessa`, que es @unique en el esquema. Volver a correrlo no
 * duplica; si un valor cambió en el .xls, lo corrige.
 *
 * ── DE DÓNDE SALE ESTO ──
 *
 * De las CINCO hojas de proyecto del libro, no de la bitácora. La bitácora tiene el
 * texto de máquina que escribió el técnico (11 grafías, dos y tres máquinas en una
 * celda); las hojas de proyecto tienen el CONTRATO, que es lo que aquí se carga.
 *
 * Son 6 órdenes en 5 proyectos. Los otros 17 proyectos de la base NO tienen ninguna
 * hoja de proyecto en el Excel: no es que falten datos por buscar, es que no existen
 * en la fuente. Se quedan sin orden hasta que alguien los capture desde la UI.
 *
 * ── LO QUE ESTE SCRIPT NO HACE ──
 *
 * NO carga la matriz de días vendidos, y no es un olvido. El vendido del Excel usa un
 * vocabulario comercial propio de las hojas de proyecto ({Supervisore, Meccanico,
 * Elettricista} en montaje; {Test, Sofware, Meccanico} en collaudo) que NO son valores
 * de la columna `Tipo` de las hojas diarias:
 *
 *   - `Supervisore` aparece 0 veces en `Tipo` (su equivalente diario es `Manager Cantiere`)
 *   - `Test` aparece 0 veces en `Tipo` — no es la especialidad de nadie
 *   - `Elettricista` tiene SEIS candidatos en `role_types` (Eletrico, Elettrico,
 *     Electrico, Electtricista, Técnico Eléctrico, Eléctrico Senior), todos nacidos de
 *     las grafías del Excel
 *
 * Elegir uno es una decisión de negocio, y elegir mal descuadra el delta en silencio —
 * que es justo el número con el que Andrea se sienta a hablar con Luca. Se carga cuando
 * el catálogo de roles esté consolidado (MIG-01) y alguien decida el mapeo.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/config/env';

interface OrdenExcel {
  /** Nombre EXACTO del proyecto en la base (verificado contra `projects.name`). */
  proyecto: string;
  /** La hoja del libro de la que sale, para poder volver a comprobarlo. */
  hoja: string;
  /** Celda del OA en esa hoja. El rastro es parte del dato. */
  celda: string;
  oaNumber: string;
  commessa: string;
  contractValue: number;
  /**
   * La etiqueta que verá el técnico al elegir. Cuando la hoja NO nombra máquina
   * (Lucchetti y Pasta Sole no la nombran en toda la hoja) va la commessa, que es
   * exactamente lo que Andrea dijo que el técnico tiene que seleccionar. Inventarle
   * un nombre de máquina desde la bitácora sería atribuir un contrato a una máquina
   * que el contrato no menciona.
   */
  label: string;
}

/**
 * Las 6 órdenes, literales del libro. Verificado celda a celda:
 * las commesse terminan todas en 98 y en JAV el prefijo ES el serial de la máquina
 * (`PL 6000 KG - 1-3428` -> 3428·100+98 = 342898).
 *
 * Los OA forman una serie correlativa que CRUZA clientes y países
 * (0159103 Chile, 0159104 Argentina, 0159105/07/08 Brasil, 0163864 RD): es un
 * contador de FAVA, no un número que pertenezca a la máquina. Falta el 0159106.
 */
const ORDENES: OrdenExcel[] = [
  {
    proyecto: 'LUCCHETTI CHILE SA',
    hoja: 'Lucchetti Chile ',
    celda: 'H7',
    oaNumber: 'OA0159103',
    commessa: '343298',
    contractValue: 160_000,
    label: 'Commessa 343298',
  },
  {
    proyecto: 'Pasta Sole  - ARGENTINA',
    hoja: 'Pasta Sole - Ex Molino Fenix',
    celda: 'H6',
    oaNumber: 'OA0159104',
    commessa: '343498',
    contractValue: 165_000,
    label: 'Commessa 343498',
  },
  {
    proyecto: 'JAV Marata - Brasil',
    hoja: 'JAV Brasil',
    celda: 'I1',
    oaNumber: 'OA0159105',
    commessa: '342898',
    contractValue: 182_500,
    label: 'PL 6000 KG - 1-3428',
  },
  {
    proyecto: 'JAV Marata - Brasil',
    hoja: 'JAV Brasil',
    celda: 'I36',
    oaNumber: 'OA0159107',
    commessa: '342998',
    contractValue: 182_500,
    label: 'PL 6000 KG - 2-3429',
  },
  {
    proyecto: 'JAV Marata - Brasil',
    hoja: 'JAV Brasil',
    celda: 'I19',
    oaNumber: 'OA0159108',
    commessa: '343098',
    contractValue: 130_000,
    label: 'PC 4000 -3430 + 4 SILOS',
  },
  {
    proyecto: 'MOLINO CIBAO BOCEL - RD',
    hoja: 'Cibao -Rep D',
    celda: 'H2',
    oaNumber: 'OA0163864',
    commessa: '345598',
    contractValue: 160_000,
    label: 'PL 4500 GLP 180',
  },
];

/**
 * J MACEDO queda FUERA a propósito y hay que decirlo, no callarlo: su hoja
 * (`J Macedo Brasil- final`) no tiene ni OA ni commessa. Su único importe es
 * N8=425.600 a nivel de proyecto, y el modelo dice que el contrato vive en la orden.
 * Cargarlo como una orden sin OA ni commessa sería inventar una máquina contratada
 * que la fuente no declara — y es el proyecto con MÁS jornadas (1.050).
 */
const SIN_ORDEN = [
  { proyecto: 'JMACEDO', motivo: 'la hoja no tiene OA ni commessa; importe 425.600 a nivel de proyecto' },
];

async function main() {
  const dry = process.argv.includes('--dry');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL }),
  });

  const informe: string[] = [];
  const log = (s: string) => {
    informe.push(s);
    console.log(s);
  };

  log(dry ? '— SIMULACRO (--dry): no se escribe nada —\n' : '— aplicando —\n');

  try {
    // Los nombres de proyecto se resuelven ANTES de escribir nada: si uno no existe,
    // el fallo tiene que ser ruidoso y completo, no a mitad de la carga.
    const nombres = [...new Set(ORDENES.map((o) => o.proyecto))];
    const proyectos = await prisma.project.findMany({
      where: { name: { in: nombres } },
      select: { id: true, name: true },
    });
    const idPorNombre = new Map(proyectos.map((p) => [p.name, p.id]));

    const faltan = nombres.filter((n) => !idPorNombre.has(n));
    if (faltan.length) {
      log(`FALLA: estos proyectos no existen en la base:\n  ${faltan.join('\n  ')}`);
      log('\nNo se escribió nada. Corregir los nombres en ORDENES y volver a correr.');
      process.exitCode = 1;
      return;
    }

    let creadas = 0;
    let actualizadas = 0;

    for (const o of ORDENES) {
      const projectId = idPorNombre.get(o.proyecto)!;
      // La commessa es unica DENTRO del proyecto desde 20260901090000 (se repite entre
      // proyectos: los dos ultimos digitos son el sector). La clave lleva las dos partes.
      const existente = await prisma.order.findUnique({
        where: { projectId_commessa: { projectId, commessa: o.commessa } },
        select: { id: true },
      });

      const datos = {
        projectId,
        label: o.label,
        commessa: o.commessa,
        // Los 4 primeros dígitos: es como se nombra la máquina en obra y en las notas.
        commessaShort: o.commessa.slice(0, 4),
        oaNumber: o.oaNumber,
        contractValue: o.contractValue,
        // El libro no trae símbolo de moneda en ninguna celda y el catálogo de monedas
        // está vacío: NULL es el dato honesto, no un EUR supuesto.
        currencyCode: null,
      };

      if (!dry) {
        if (existente) await prisma.order.update({ where: { id: existente.id }, data: datos });
        else await prisma.order.create({ data: datos });
      }
      if (existente) actualizadas++;
      else creadas++;

      const marca = existente ? 'actualiza' : 'crea     ';
      log(`  ${marca} ${o.commessa}  ${o.oaNumber}  ${String(o.contractValue).padStart(7)}  ${o.label}`);
      log(`            ${o.proyecto}  (${o.hoja}!${o.celda})`);
    }

    log(`\n${creadas} creadas, ${actualizadas} actualizadas.`);

    log('\n— proyectos con jornadas y SIN orden —');
    for (const s of SIN_ORDEN) log(`  ${s.proyecto}: ${s.motivo}`);
    const sinHoja = await prisma.project.count({ where: { orders: { none: {} } } });
    log(`  y ${sinHoja - (dry ? nombres.length : 0)} proyectos más sin hoja de proyecto en el Excel.`);

    // ── Atribuir las jornadas que NO admiten discusión ──
    //
    // Si un proyecto tiene UNA sola orden, todas sus jornadas son de esa orden: no hay
    // nada que decidir, es la única máquina contratada. Donde hay varias (JAV tiene 3)
    // NO se toca: repartir esos días es exactamente la decisión manual que Andrea hace
    // hoy («yo decido agotar mis horas en la 3428 o en la 3429»), y adivinarla sería
    // inventar a qué máquina fue cada día.
    log('\n— atribuyendo jornadas de proyectos con UNA sola orden —');

    const conUna = await prisma.project.findMany({
      where: { orders: { some: {} } },
      select: { id: true, name: true, orders: { select: { id: true, label: true } } },
    });

    let atribuidas = 0;
    for (const p of conUna) {
      if (p.orders.length !== 1) {
        const jornadas = await prisma.dailyEntry.count({ where: { projectId: p.id } });
        log(`  omite    ${p.name}: ${p.orders.length} órdenes, ${jornadas} jornadas — reparto manual`);
        continue;
      }
      const orden = p.orders[0];
      const r = dry
        ? { count: await prisma.dailyEntry.count({ where: { projectId: p.id, orderId: null } }) }
        : await prisma.dailyEntry.updateMany({
            where: { projectId: p.id, orderId: null },
            data: { orderId: orden.id },
          });
      atribuidas += r.count;
      log(`  atribuye ${p.name}: ${r.count} jornadas -> ${orden.label}`);
    }
    log(`\n${atribuidas} jornadas atribuidas.`);

    log('\n— lo que sigue faltando —');
    log('  · la matriz de días VENDIDOS: exige decidir el mapeo del vocabulario');
    log('    comercial (Supervisore/Test/Elettricista) contra role_types. Ver la');
    log('    cabecera de este archivo.');
    log('  · las jornadas de JAV (3 órdenes) y las de los proyectos sin orden');
    log('    siguen con order_id NULL, que es el dato honesto mientras nadie');
    log('    decida a qué máquina fue cada día.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
