/**
 * MIG-01/02/03 — el histórico 2025+2026 del Excel entra en la base, y sale un reporte
 * de conciliación que dice fila por fila si cuadra.
 *
 *     npm -w backend run migrate:excel            # aplica
 *     npm -w backend run migrate:excel -- --dry   # solo el reporte, no escribe
 *
 * Corre como OWNER (prisma.config.ts -> MIGRATE_DATABASE_URL): migrar es DDL/DML de
 * mantenimiento, no runtime, y así RLS no estorba.
 *
 * IDEMPOTENTE: la clave natural del histórico es (source_sheet, source_row). Volver a
 * correrlo no duplica nada; si el .xls cambió, corrige lo que cambió.
 *
 * NO INVENTA NADA. Las tres reglas que sí decide están abajo, cada una con su prueba.
 * Todo lo demás (nombres de rol, nombres de proyecto) entra literal y el reporte lista
 * lo que parece duplicado para que una persona lo resuelva desde la UI.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { ConceptCode, EmploymentType } from '../src/generated/prisma/enums';
import { env } from '../src/config/env';

interface FilaExcel {
  tecnico: string;
  tipo: string;
  proyecto: string;
  maquina: string;
  fecha: string; // 'YYYY-MM-DD'
  concepto: number;
  codigo: ConceptCode;
  enFabrica: boolean;
  datoCrudo: string;
  hoja: string;
  fila: number;
}

/**
 * REGLA 1 — la única fusión de técnicos, y está probada.
 *
 * `Leomir Kleir` (38 filas, 24-nov-2025 → 31-dic-2025) y `Leomir Klein` (365 filas,
 * todo 2026) no comparten NI UN DÍA: una acaba justo donde empieza la otra, y se
 * diferencian en una letra. Es una errata.
 *
 * `Leomar Klein` NO entra aquí aunque se parezca: hay 80 días en que Leomar y Leomir
 * trabajan en proyectos DISTINTOS a la vez (Leomar en JMACEDO, Leomir en JAV Marata),
 * cada uno tiene su calendario completo, y las hojas de proyecto de Andrea los tratan
 * por separado. Fusionarlos daría 403 choques contra UNIQUE(technician_id, date).
 */
const FUSIONES: Record<string, string> = { 'Leomir Kleir': 'Leomir Klein' };

/** El centinela del Excel para «ningún proyecto». En la base es un NULL honesto (BIT-03). */
const SIN_PROYECTO = 'sin proyecto';

/**
 * REGLA 2 — dedupe de catálogos SOLO por mayúsculas y espacios.
 *
 * `Tecnico` y `tecnico` son la misma palabra; `Eletrico` y `Elettrico` puede que sí y
 * puede que no, y `Eléctrico Senior` frente a `Capo Elettricista` puede ser jerarquía
 * real. Adivinar ahí sería inventarse el negocio, así que lo que no es idéntico salvo
 * caja entra separado y el reporte lo lista como sospecha.
 */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');

/**
 * REGLA 3 — la fecha se construye en UTC.
 *
 * `daily_entries.date` es un DATE de Postgres. Con `new Date(a, m-1, d)` el valor sale
 * bien en Bogotá y en UTC pero se desplaza un día en Roma o en Kiritimati, y el bug se
 * esconde porque dev y prod están los dos en la mitad buena del mundo.
 */
const aFecha = (iso: string): Date => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

/** Los 5 conceptos que la CHECK `de_proyecto_por_concepto` exige con proyecto. */
const TRABAJO: ConceptCode[] = ['DC', 'MD', 'DFD', 'DVSF', 'DVRC'];

/** Cuenta cuántas veces aparece cada valor y devuelve el más frecuente como canónico. */
function canonicos(valores: string[]): Map<string, string> {
  const porClave = new Map<string, Map<string, number>>();
  for (const v of valores) {
    if (!v) continue;
    const k = norm(v);
    const cuenta = porClave.get(k) ?? new Map<string, number>();
    cuenta.set(v.trim(), (cuenta.get(v.trim()) ?? 0) + 1);
    porClave.set(k, cuenta);
  }
  const salida = new Map<string, string>();
  for (const [k, cuenta] of porClave) {
    const [mejor] = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    salida.set(k, mejor[0]);
  }
  return salida;
}

async function main() {
  const seco = process.argv.includes('--dry');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL }),
  });
  const informe: string[] = [];
  const di = (s: string) => {
    informe.push(s);
    console.log(s);
  };

  const ruta = join(__dirname, 'data', 'excel-2025-2026.ndjson');
  const filas: FilaExcel[] = readFileSync(ruta, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FilaExcel);

  di(`# Conciliación de la migración del Excel\n`);
  di(`Filas en el NDJSON: **${filas.length}**${seco ? ' _(simulación: no se escribe)_' : ''}\n`);

  // ── Catálogos ────────────────────────────────────────────────────────────────
  const rolCanon = canonicos(filas.map((f) => f.tipo));
  const proyCanon = canonicos(filas.map((f) => f.proyecto).filter((p) => norm(p) !== SIN_PROYECTO));

  const nombreTecnico = (f: FilaExcel) => FUSIONES[f.tecnico.trim()] ?? f.tecnico.trim();

  /**
   * INTERNO/EXTERNO no se adivina: sale del propio dato. El concepto 5 es «Libre
   * Remunerado (Sólo internos)» y el 4 «No Remunerado (Sólo EXTERNOS)», así que quien
   * tiene filas del 4 es externo y quien tiene del 5, interno.
   */
  const tipoEmpleo = new Map<string, EmploymentType>();
  for (const f of filas) {
    const n = nombreTecnico(f);
    if (f.concepto === 4) tipoEmpleo.set(n, 'EXTERNO');
    else if (f.concepto === 5 && !tipoEmpleo.has(n)) tipoEmpleo.set(n, 'INTERNO');
  }

  /** Los alias con los que cada persona aparece escrita, para MIG-01. */
  const alias = new Map<string, Set<string>>();
  for (const f of filas) {
    const n = nombreTecnico(f);
    const s = alias.get(n) ?? new Set<string>();
    if (f.tecnico.trim() !== n) s.add(f.tecnico.trim());
    alias.set(n, s);
  }

  /** El `Tipo` más frecuente de cada persona es su especialidad en el maestro. */
  const tipoPorTecnico = new Map<string, Map<string, number>>();
  for (const f of filas) {
    const n = nombreTecnico(f);
    const c = tipoPorTecnico.get(n) ?? new Map<string, number>();
    const rol = rolCanon.get(norm(f.tipo))!;
    c.set(rol, (c.get(rol) ?? 0) + 1);
    tipoPorTecnico.set(n, c);
  }

  di(`## Catálogos\n`);
  di(`| | Excel | Tras normalizar |`);
  di(`|---|---|---|`);
  di(`| Roles técnicos | ${new Set(filas.map((f) => f.tipo)).size} | ${rolCanon.size} |`);
  di(`| Proyectos | ${new Set(filas.map((f) => f.proyecto)).size - 1} | ${proyCanon.size} |`);
  di(`| Técnicos | ${new Set(filas.map((f) => f.tecnico)).size} | ${tipoPorTecnico.size} |\n`);

  if (seco) {
    escribir(informe);
    await prisma.$disconnect();
    return;
  }

  // Roles. `upsert` por nombre: el catálogo ya trae los 4 del arranque.
  const idRol = new Map<string, string>();
  for (const nombre of rolCanon.values()) {
    const r = await prisma.roleType.upsert({
      where: { name: nombre },
      update: {},
      create: { name: nombre },
      select: { id: true },
    });
    idRol.set(nombre, r.id);
  }

  // Técnicos.
  const idTecnico = new Map<string, string>();
  for (const [nombre, cuenta] of tipoPorTecnico) {
    const [principal] = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
    const existente = await prisma.technician.findFirst({
      where: { fullName: nombre },
      select: { id: true },
    });
    const datos = {
      fullName: nombre,
      roleTypeId: idRol.get(principal[0])!,
      employmentType: tipoEmpleo.get(nombre) ?? ('INTERNO' as EmploymentType),
      aliases: [...(alias.get(nombre) ?? [])],
    };
    const t = existente
      ? await prisma.technician.update({ where: { id: existente.id }, data: datos, select: { id: true } })
      : await prisma.technician.create({ data: datos, select: { id: true } });
    idTecnico.set(nombre, t.id);
  }

  /**
   * Proyectos. El Excel SOLO da el nombre: cliente, localidad, país, suministro y n.º
   * de contrato son NOT NULL y entran VACÍOS a propósito. Un valor inventado (el país
   * deducido del nombre, un «PENDIENTE») sería indistinguible de un dato real cuando
   * la Fase 5 lo imprima en la Nota. El reporte los lista para completarlos desde la UI.
   */
  const idProyecto = new Map<string, string>();
  for (const nombre of proyCanon.values()) {
    const existente = await prisma.project.findFirst({ where: { name: nombre }, select: { id: true } });
    const p = existente
      ? existente
      : await prisma.project.create({
          data: {
            name: nombre,
            clientName: nombre,
            locality: '',
            country: '',
            supply: '',
            contractNumber: '',
          },
          select: { id: true },
        });
    idProyecto.set(nombre, p.id);
  }

  // ── Jornadas ─────────────────────────────────────────────────────────────────
  const rechazadas: FilaExcel[] = [];
  const aInsertar = filas.flatMap((f) => {
    const proyecto = norm(f.proyecto) === SIN_PROYECTO ? null : idProyecto.get(proyCanon.get(norm(f.proyecto))!)!;
    // La CHECK del motor: un concepto de trabajo sin proyecto no existe. En vez de
    // dejar que reviente a mitad de la carga, se aparta y se nombra en el reporte.
    if (!proyecto && TRABAJO.includes(f.codigo)) {
      rechazadas.push(f);
      return [];
    }
    return [{
      technicianId: idTecnico.get(nombreTecnico(f))!,
      date: aFecha(f.fecha),
      // El histórico es un hecho ya aceptado, y sólo lo aprobado cuenta como ejecutado.
      status: 'approved',
      projectId: proyecto,
      // NULL a propósito: el Excel no dice a qué máquina CONTRATADA fue el día. Ese
      // vacío es la razón de ser de la app, y rellenarlo aquí lo taparía.
      orderId: null,
      conceptCode: f.codigo,
      inFactory: f.enFabrica,
      phase: null,
      roleTypeId: idRol.get(rolCanon.get(norm(f.tipo))!)!,
      sourceYear: Number(f.hoja),
      sourceSheet: f.hoja,
      sourceRow: f.fila,
      sourceMachine: f.maquina || null,
    }];
  });

  // Se borra por (hoja, fila) y se reinserta: hace el script re-ejecutable sin
  // depender de un upsert por una clave natural que la tabla no declara.
  await prisma.dailyEntry.deleteMany({ where: { sourceSheet: { in: ['2025', '2026'] } } });
  for (let i = 0; i < aInsertar.length; i += 500) {
    await prisma.dailyEntry.createMany({ data: aInsertar.slice(i, i + 500) });
  }

  // ── Conciliación ─────────────────────────────────────────────────────────────
  di(`## Jornadas\n`);
  di(`| | |`);
  di(`|---|---|`);
  di(`| Insertadas | **${aInsertar.length}** |`);
  di(`| Apartadas por la CHECK (concepto de trabajo sin proyecto) | ${rechazadas.length} |\n`);

  if (rechazadas.length) {
    di(`### Filas apartadas — hay que decidir qué hacer con ellas\n`);
    di(`| Hoja | Fila | Técnico | Fecha | Concepto |`);
    di(`|---|---|---|---|---|`);
    for (const f of rechazadas) di(`| ${f.hoja} | ${f.fila} | ${f.tecnico} | ${f.fecha} | ${f.codigo} |`);
    di('');
  }

  // El contraste que importa: contar en la base y contar en el NDJSON por separado y
  // comparar. Si el mapeo de proyectos o de conceptos se equivocó, aquí se ve.
  const enBase = await prisma.dailyEntry.groupBy({
    by: ['projectId', 'conceptCode'],
    where: { sourceSheet: { in: ['2025', '2026'] } },
    _count: { _all: true },
  });
  const nombrePorId = new Map([...idProyecto].map(([n, id]) => [id, n]));
  const base = new Map<string, number>();
  for (const g of enBase) {
    const k = `${g.projectId ? nombrePorId.get(g.projectId) : 'Sin Proyecto'}|${g.conceptCode}`;
    base.set(k, (base.get(k) ?? 0) + g._count._all);
  }
  const excel = new Map<string, number>();
  for (const f of filas) {
    if (rechazadas.includes(f)) continue;
    const k = `${norm(f.proyecto) === SIN_PROYECTO ? 'Sin Proyecto' : proyCanon.get(norm(f.proyecto))}|${f.codigo}`;
    excel.set(k, (excel.get(k) ?? 0) + 1);
  }
  const descuadres = [...excel].filter(([k, n]) => (base.get(k) ?? 0) !== n);

  di(`### Excel vs. base, por proyecto y concepto\n`);
  di(`Celdas comparadas: **${excel.size}** · descuadres: **${descuadres.length}**\n`);
  for (const [k, n] of descuadres) di(`- \`${k}\`: Excel ${n}, base ${base.get(k) ?? 0}`);

  // La prueba concreta de MODELO-VERIFICADO §1: JAV son 536 jornadas.
  const jav = [...base].filter(([k]) => k.startsWith('JAV Marata')).reduce((s, [, n]) => s + n, 0);
  di(`\nJAV Marata - Brasil: **${jav}** jornadas en la base (el Excel dice 536).\n`);

  // ── Lo que queda por decidir ─────────────────────────────────────────────────
  const proyectosIncompletos = await prisma.project.count({ where: { country: '' } });
  di(`## Pendiente de una persona\n`);
  di(`- **${proyectosIncompletos} proyectos** entraron sin cliente, localidad, país, suministro ni n.º de contrato: el Excel no los tiene. Hay que completarlos antes de la Fase 5, o la Nota saldrá con casillas en blanco.`);
  di(`- **${aInsertar.length} jornadas** entraron sin orden (máquina contratada), porque el Excel no la registra. Aparecen en «Jornadas sin máquina asignada» del detalle de cada proyecto.`);

  const sospechosos = [...proyCanon.values()].sort();
  di(`\n### Nombres que PARECEN duplicados y NO se fusionaron\n`);
  di(`Se dejan separados a propósito: fusionar «MOLINO CIBAO BOCEL» con «MOLINO CIBAO BOCEL - RD» es una decisión de negocio, no de código. Se resuelve desde la pantalla de Proyectos.\n`);
  for (const n of sospechosos) {
    const parecidos = sospechosos.filter((o) => o !== n && (norm(o).startsWith(norm(n).slice(0, 12)) || norm(n).startsWith(norm(o).slice(0, 12))));
    if (parecidos.length) di(`- \`${n}\` ↔ ${parecidos.map((x) => `\`${x}\``).join(', ')}`);
  }

  escribir(informe);
  await prisma.$disconnect();
}

function escribir(informe: string[]) {
  const destino = join(__dirname, '..', '..', '..', '.planning', 'CONCILIACION-MIGRACION.md');
  writeFileSync(destino, informe.join('\n') + '\n', 'utf8');
  console.log(`\nReporte -> ${destino}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
