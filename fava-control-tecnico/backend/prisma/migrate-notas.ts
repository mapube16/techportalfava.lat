/**
 * Las notas semanales del HISTÓRICO — una por técnico, semana y proyecto.
 *
 *     npm -w backend run migrate:notas            # aplica
 *     npm -w backend run migrate:notas -- --dry   # solo el reporte, no escribe
 *
 * Corre como OWNER (MIGRATE_DATABASE_URL), igual que `migrate-excel.ts`: migrar es
 * mantenimiento, no runtime, y así RLS no estorba.
 *
 * NO LEE EL EXCEL. Las jornadas ya están en la base desde MIG-01 con su trazabilidad
 * (`source_sheet`, `source_row`), así que las notas se DERIVAN de ellas exactamente
 * igual que cuando un técnico envía su semana: agrupando por (técnico, lunes ISO,
 * proyecto). Volver al .xls sería una segunda fuente de verdad que puede discrepar.
 *
 * TRES DECISIONES, y conviene que estén escritas:
 *
 * 1. NACEN `approved`. Sus jornadas ya entraron aprobadas y el trabajo está hecho y
 *    cobrado; dejarlas en `submitted` metería 443 notas viejas en la bandeja del admin
 *    como si esperaran una decisión que nadie va a tomar.
 *
 * 2. SIN FIRMA Y SIN PDF. Estas notas se firmaron EN PAPEL. Generar aquí una firma o un
 *    PDF con aspecto de firmado sería fabricar un documento que el cliente nunca vio en
 *    la app. Quedan sin `signed_content_hash`, sin `note_pdfs` y sin `note_signatures`:
 *    la evidencia sigue siendo el papel. Si algún día se escanean los originales, se
 *    adjuntan entonces.
 *
 * 3. SOLO LAS JORNADAS CON PROYECTO. `weekly_notes.project_id` es NOT NULL porque una
 *    nota la firma el cliente de UN proyecto. Los días LR/NR (libre y no remunerado) no
 *    son de ningún cliente: siguen en la bitácora y en los KPIs, pero no producen papel.
 *
 * IDEMPOTENTE, y de la manera conservadora: `skipDuplicates` sobre
 * UNIQUE(technician_id, week_start, project_id). Si una nota YA existe —porque la creó
 * un técnico de verdad desde la app— no se toca. Volver a correrlo no duplica ni pisa.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/config/env';

/** Las hojas del histórico. Lo que no venga de ahí es una nota real y no se toca. */
const HOJAS = ['2025', '2026'];

/**
 * El lunes de la semana ISO, en UTC.
 *
 * En UTC y no en hora local a propósito: las fechas son `@db.Date` y llegan a
 * medianoche UTC. Con `getDay()` local, cualquier máquina al oeste de Greenwich lee el
 * día ANTERIOR y media semana se iría a la nota equivocada.
 */
function lunes(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

/** El valor que más se repite. Para el cargo de la semana y para la hoja de origen. */
function moda<T>(xs: T[]): T | null {
  const c = new Map<T, number>();
  for (const x of xs) if (x !== null && x !== undefined) c.set(x, (c.get(x) ?? 0) + 1);
  let mejor: T | null = null;
  let max = 0;
  for (const [k, n] of c) if (n > max) { mejor = k; max = n; }
  return mejor;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const seco = process.argv.includes('--dry');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL }),
  });

  console.log(seco ? '— SIMULACRO (--dry): no se escribe nada —\n' : '— aplicando —\n');

  try {
    const jornadas = await prisma.dailyEntry.findMany({
      where: { sourceSheet: { in: HOJAS }, projectId: { not: null } },
      select: { technicianId: true, date: true, projectId: true, roleTypeId: true, sourceSheet: true },
    });
    console.log(`jornadas del histórico con proyecto: ${jornadas.length}`);

    interface Grupo {
      technicianId: string;
      weekStart: Date;
      projectId: string;
      roles: (string | null)[];
      hojas: (string | null)[];
      dias: number;
    }
    const grupos = new Map<string, Grupo>();
    for (const j of jornadas) {
      const semana = lunes(j.date);
      const clave = `${j.technicianId}|${iso(semana)}|${j.projectId!}`;
      const g = grupos.get(clave) ?? {
        technicianId: j.technicianId, weekStart: semana, projectId: j.projectId!,
        roles: [], hojas: [], dias: 0,
      };
      g.roles.push(j.roleTypeId);
      g.hojas.push(j.sourceSheet);
      g.dias++;
      grupos.set(clave, g);
    }

    const notas = [...grupos.values()].map((g) => ({
      technicianId: g.technicianId,
      weekStart: g.weekStart,
      projectId: g.projectId,
      status: 'approved',
      // NOTA-09: el cargo de ESA semana. 5 de los 13 técnicos tienen más de uno, así
      // que se toma el que más días trabajó, no el del maestro.
      roleTypeId: moda(g.roles),
      sourceYear: g.weekStart.getUTCFullYear(),
      sourceSheet: moda(g.hojas),
      // NULL a propósito: una nota no sale de UNA fila del Excel, sale de hasta siete.
      sourceRow: null,
    }));

    const yaHay = await prisma.weeklyNote.count();
    console.log(`notas derivadas: ${notas.length}  (notas ya en la base: ${yaHay})`);

    // Reparto por técnico y año, que es lo que se mira para saber si tiene sentido.
    const porTecnico = new Map<string, number>();
    for (const g of grupos.values()) porTecnico.set(g.technicianId, (porTecnico.get(g.technicianId) ?? 0) + 1);
    const tecnicos = await prisma.technician.findMany({
      where: { id: { in: [...porTecnico.keys()] } },
      select: { id: true, fullName: true },
    });
    console.log('\npor técnico:');
    for (const t of tecnicos.sort((a, b) => (porTecnico.get(b.id) ?? 0) - (porTecnico.get(a.id) ?? 0)))
      console.log(`  ${t.fullName.padEnd(22)} ${String(porTecnico.get(t.id)).padStart(4)}`);

    const porAnio = new Map<number, number>();
    for (const n of notas) porAnio.set(n.sourceYear, (porAnio.get(n.sourceYear) ?? 0) + 1);
    console.log('\npor año:', [...porAnio].sort().map(([a, n]) => `${a}: ${n}`).join('  ·  '));

    if (seco) {
      console.log('\nSimulacro: no se escribió nada.');
      return;
    }

    let creadas = 0;
    for (let i = 0; i < notas.length; i += 500) {
      const r = await prisma.weeklyNote.createMany({ data: notas.slice(i, i + 500), skipDuplicates: true });
      creadas += r.count;
    }
    console.log(`\ncreadas: ${creadas}  ·  ya existían y no se tocaron: ${notas.length - creadas}`);
    console.log('Sin firma y sin PDF, a propósito: el papel firmado sigue siendo la evidencia.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
