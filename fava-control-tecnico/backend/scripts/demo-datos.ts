/**
 * Datos de DEMOSTRACION, aislados en su propio proyecto.
 *
 *   npm -w backend run demo:datos              crea
 *   npm -w backend run demo:datos -- --dry     dice que haria, sin escribir
 *   npm -w backend run demo:datos -- --borrar  lo quita todo
 *
 * POR QUE UN PROYECTO APARTE Y NO RELLENAR LOS REALES. La base de produccion tiene 22
 * proyectos, 6 ordenes y 443 notas que vienen del Excel: son datos de verdad.
 * Inventarles localidad y numero de contrato haria que la pantalla de Proyectos
 * pareciera terminada cuando esos campos siguen sin rellenar, y quedarian
 * indistinguibles de los buenos para siempre. Aqui todo cuelga de UN proyecto con
 * nombre marcado, y `--borrar` devuelve la base al estado anterior.
 *
 * QUE HABILITA, pantalla por pantalla:
 *   Proyectos / KPIs  dias VENDIDOS (hoy la tabla tiene 0 filas, y sin ellas el cruce
 *                     vendido-contra-ejecutado no puede dibujar nada)
 *   Bandeja           2 notas esperando aprobacion y 1 devuelta con comentario
 *   Mi semana         la semana en curso en borrador, con descripciones de verdad
 *   Mis notas         una nota devuelta, que es el caso que el tecnico tiene que ver
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/config/env';
import { lunesDe, sumarDias } from '../src/modules/daily-entries/fecha';

const PROYECTO = 'ZZ DEMO - Pasta Nova';
const COMMESSAS = ['DEMO-A', 'DEMO-B'];
const TECNICOS = ['Camilo Cruz', 'Ivan Cortes', 'Leomar Klein'];

/** El historico del Excel viene sin descripcion en 6.573 de 6.574 filas, asi que la
    Nota sale en blanco. Estas son las que hacen que el PDF se vea como el papel real. */
const TRABAJOS = [
  'Montaje de bancada y alineacion de la linea de extrusion.',
  'Cableado de potencia del tablero principal y pruebas de continuidad.',
  'Ajuste de trefilas y calibracion de temperatura en la prensa.',
  'Puesta en marcha de la cinta de secado, revision de rodillos.',
  'Pruebas con producto y ajuste de parametros junto al cliente.',
];

const aDia = (s: string) => new Date(`${s}T00:00:00Z`);

async function main() {
  const dry = process.argv.includes('--dry');
  const borrar = process.argv.includes('--borrar');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL }),
  });

  try {
    const proyecto = await prisma.project.findFirst({ where: { name: PROYECTO } });

    if (borrar) {
      if (!proyecto) {
        console.log('no hay nada que borrar');
        return;
      }
      // En este orden: las FK del esquema son onDelete Restrict a proposito.
      const n = await prisma.weeklyNote.deleteMany({ where: { projectId: proyecto.id } });
      const d = await prisma.dailyEntry.deleteMany({ where: { projectId: proyecto.id } });
      const ords = await prisma.order.findMany({ where: { projectId: proyecto.id } });
      const v = await prisma.orderSoldDays.deleteMany({
        where: { orderId: { in: ords.map((o) => o.id) } },
      });
      await prisma.order.deleteMany({ where: { projectId: proyecto.id } });
      await prisma.project.delete({ where: { id: proyecto.id } });
      console.log(
        `borrado: ${n.count} notas, ${d.count} jornadas, ${v.count} dias vendidos, ` +
          `${ords.length} ordenes, 1 proyecto`,
      );
      return;
    }

    // Solo elige DE QUE SEMANA hablamos; no acaba en ninguna columna de fecha.
    const hoy = new Date().toISOString().slice(0, 10); // fecha-ok: elige la semana de la demo
    const actual = lunesDe(hoy);
    const pasada = sumarDias(actual, -7);
    console.log(`semana en curso ${actual}, semana anterior ${pasada}`);

    const maquina = await prisma.machineModel.findFirst({ where: { code: 'CTA1000' } });
    const moneda = await prisma.currency.findFirst({ where: { code: 'EUR' } });
    if (!maquina || !moneda)
      throw new Error('faltan catalogos: corre antes `npm -w backend run db:seed`');

    const tecnicos = await prisma.technician.findMany({ where: { fullName: { in: TECNICOS } } });
    if (!tecnicos.length) throw new Error('no encuentro los tecnicos de la demo');

    if (dry) {
      console.log(`crearia "${PROYECTO}", 2 ordenes, 12 lineas de dias vendidos,`);
      console.log(`${tecnicos.length * 9} jornadas y ${tecnicos.length} notas para:`);
      for (const t of tecnicos) console.log(`  ${t.fullName}`);
      return;
    }

    const pr =
      proyecto ??
      (await prisma.project.create({
        data: {
          name: PROYECTO,
          clientName: 'Cliente Demo S.p.A.',
          locality: 'Parma',
          country: 'Italia',
          supply: 'Linea completa de pasta corta',
          contractNumber: 'DEMO-2026-001',
          normalHours: 8,
        },
      }));

    const ordenes: { id: string }[] = [];
    for (const [i, commessa] of COMMESSAS.entries()) {
      const existe = await prisma.order.findFirst({ where: { commessa } });
      ordenes.push(
        existe ??
          (await prisma.order.create({
            data: {
              projectId: pr.id,
              label: i === 0 ? 'DEMO Linea A - CTA1000' : 'DEMO Linea B - PC4500',
              machineModelId: maquina.id,
              commessa,
              contractValue: i === 0 ? 200000 : 150000,
              currencyCode: moneda.code,
            },
          })),
      );
    }

    // El lado VENDIDO del contrato. Es lo que hoy falta para que el KPI compare algo.
    const roles = await prisma.roleType.findMany({ take: 3, orderBy: { name: 'asc' } });
    let ordinal = 0;
    const vendidos: {
      orderId: string; roleTypeId: string; phase: 'MONTAJE' | 'COLLAUDO';
      ordinal: number; lineLabel: string; soldDays: number;
    }[] = [];
    for (const o of ordenes)
      for (const phase of ['MONTAJE', 'COLLAUDO'] as const)
        for (const r of roles)
          vendidos.push({
            orderId: o.id,
            roleTypeId: r.id,
            phase,
            ordinal: (ordinal += 1),
            lineLabel: `${phase} - ${r.name}`,
            soldDays: phase === 'MONTAJE' ? 20 : 8,
          });
    const v = await prisma.orderSoldDays.createMany({ data: vendidos, skipDuplicates: true });

    let jornadas = 0;
    let notas = 0;
    for (const [i, t] of tecnicos.entries()) {
      const filas: {
        technicianId: string; date: Date; status: string; projectId: string; orderId: string;
        machineModelId: string; conceptCode: 'DC'; phase: 'MONTAJE' | 'COLLAUDO';
        description: string; roleTypeId: string;
      }[] = [];
      // Semana anterior: enviada, para que la bandeja del admin tenga que aprobar algo.
      for (let d = 0; d < 5; d++)
        filas.push({
          technicianId: t.id,
          date: aDia(sumarDias(pasada, d)),
          status: 'submitted',
          projectId: pr.id,
          orderId: ordenes[i % 2].id,
          machineModelId: maquina.id,
          conceptCode: 'DC' as const,
          phase: 'MONTAJE' as const,
          description: TRABAJOS[d],
          roleTypeId: t.roleTypeId,
        });
      // Semana en curso: en borrador. Sale en «Mi semana» y cuenta como «sin enviar»,
      // que es justo lo que dispara el recordatorio del viernes.
      for (let d = 0; d < 4; d++)
        filas.push({
          technicianId: t.id,
          date: aDia(sumarDias(actual, d)),
          status: 'draft',
          projectId: pr.id,
          orderId: ordenes[i % 2].id,
          machineModelId: maquina.id,
          conceptCode: 'DC' as const,
          phase: 'COLLAUDO' as const,
          description: TRABAJOS[d],
          roleTypeId: t.roleTypeId,
        });
      // skipDuplicates por la unique (technician_id, date): si el tecnico YA tiene una
      // jornada REAL ese dia, gana la real y esta se descarta en silencio.
      jornadas += (await prisma.dailyEntry.createMany({ data: filas, skipDuplicates: true })).count;

      // La primera va DEVUELTA: sin eso solo se ve el camino feliz, que es el que nunca
      // da problemas en una demo y el unico que no hay que enseñar.
      const devuelta = i === 0;
      notas += (
        await prisma.weeklyNote.createMany({
          skipDuplicates: true,
          data: [
            {
              technicianId: t.id,
              weekStart: aDia(pasada),
              projectId: pr.id,
              status: devuelta ? 'returned' : 'submitted',
              roleTypeId: t.roleTypeId,
              returnComment: devuelta
                ? 'Falta la maquina en el martes, y el jueves no dice que se hizo.'
                : null,
            },
          ],
        })
      ).count;
    }

    console.log(`proyecto ${pr.name}`);
    console.log(`  ordenes: ${ordenes.length}, dias vendidos: ${v.count}`);
    console.log(`  jornadas: ${jornadas} (las que chocaban con datos reales se saltaron)`);
    console.log(`  notas: ${notas}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('demo-datos:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
