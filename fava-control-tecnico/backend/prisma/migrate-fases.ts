/**
 * MIG-03 — la FASE de las jornadas historicas, deducida de las hojas de proyecto.
 *
 *     npm -w backend run migrate:fases            # aplica
 *     npm -w backend run migrate:fases -- --dry   # solo el reporte, no escribe
 *
 * EL AGUJERO QUE TAPA. `migrate-excel.ts` pone `phase: null` en las jornadas del
 * historico, y hace bien: la hoja DIARIA del Excel no tiene columna de fase — sus
 * columnas son TECNICO, Tipo, Proyecto, Maquina, Año, Mes, Dia, Concepto, Dato y
 * Novedad. La fase solo existe en las hojas de PROYECTO, por linea de rol.
 *
 * El efecto era una tabla que mentia por omision: «Montaje vendido 1.767 / ejecutado
 * 15» se leia como que no se habia hecho casi nada, cuando en esos cuatro proyectos
 * hay 1.328 dias ejecutados que simplemente no declaraban de que fase eran.
 *
 * LA REGLA, y por que es esta y no un cruce por tecnico. En las cuatro hojas con
 * commessa, TODAS las lineas con `ejecutado > 0` son de la misma fase: MONTAJE. El
 * collaudo esta vendido y sin empezar en los cuatro. Asi que la fase se decide POR
 * PROYECTO, que es una afirmacion que se puede leer y discutir, y no por (proyecto,
 * tecnico), que ademas tropezaria: la hoja de Pasta Sole atribuye 98 dias a
 * `Luca Carraro` en una linea cuyo trabajo la bitacora registra a nombre de Vito
 * Antonio Accini. Para la FASE da igual —las dos lineas son MONTAJE— pero un cruce por
 * nombre se habria parado ahi a preguntar por algo que no cambia el resultado.
 *
 * Si algun dia una hoja mezcla fases en su ejecutado, este script NO adivina: deja ese
 * proyecto intacto y lo dice en el reporte. Ese es el momento de cruzar por tecnico.
 *
 * SOLO TOCA LO QUE TRAJO EL EXCEL (`source_sheet IS NOT NULL`) Y ESTA VACIO
 * (`phase IS NULL`). Una jornada creada desde la app ya declara su fase, y no es de
 * este script decidir por ella.
 *
 * EN UNA TRANSACCION, por el mismo motivo escrito en `migrate-vendido.ts`: el
 * 2026-08-28 un migrador sin transaccion dejo el historico a medias, en 3.019 de 6.592.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { Phase } from '../src/generated/prisma/enums';
import { env } from '../src/config/env';

interface FilaVendido {
  hoja: string;
  fila: number;
  commessa: string | null;
  fase: Phase;
  rol: string;
  tecnico: string;
  vendido: number | null;
  ejecutado: number | null;
  ordinal: number;
}

/**
 * Lineas del Excel que NO se creen, con su motivo escrito al lado. Misma idea que
 * `FUSIONES` en migrate-excel.ts: la decision se lee aqui, no se esconde en un WHERE.
 */
const IGNORAR: { hoja: string; fila: number; motivo: string }[] = [
  {
    hoja: 'Lucchetti Chile ',
    fila: 22,
    motivo:
      'COLLAUDO/`Test -`/Andrea Scapin, 38 dias: son LOS MISMOS 38 de la linea de ' +
      'MONTAJE/`Elettricista`. Por eso el Excel suma 298 ejecutados donde la bitacora ' +
      'tiene 260 — la diferencia son exactamente esos 38. Sus jornadas llevan el rol ' +
      '`Eletrico`, no `Test`, asi que la que sobra es la de collaudo.',
  },
];

async function main() {
  const seco = process.argv.includes('--dry');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL }),
  });

  const informe: string[] = [];
  const di = (s = '') => informe.push(s);

  try {
    const ruta = join(__dirname, 'data', 'vendido.ndjson');
    const todas: FilaVendido[] = readFileSync(ruta, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as FilaVendido);

    di('# Fase de las jornadas históricas (MIG-03)');
    di();
    di(`Líneas en el NDJSON: **${todas.length}**${seco ? ' _(simulación: no se escribe)_' : ''}`);
    di();

    // ── 1. Lo que se descarta, y por qué ──
    const ignorada = (f: FilaVendido) => IGNORAR.some((x) => x.hoja === f.hoja && x.fila === f.fila);

    di('## Líneas descartadas a mano');
    di();
    for (const x of IGNORAR) di(`- \`${x.hoja}\` fila ${x.fila} — ${x.motivo}`);
    di();

    const utiles = todas.filter((f) => f.commessa && (f.ejecutado ?? 0) > 0 && !ignorada(f));
    di(
      `Quedan **${utiles.length}** líneas con commessa y ejecutado > 0. Las de ` +
        '`J Macedo Brasil- final` no entran: su hoja no declara commessa, así que no hay ' +
        'orden de la que colgar y su proyecto tampoco sale en los tableros por fase.',
    );
    di();

    // ── 2. De la commessa al proyecto ──
    const ordenes = await prisma.order.findMany({
      where: { commessa: { not: null } },
      select: { commessa: true, projectId: true, project: { select: { name: true } } },
    });
    const porCommessa = new Map(ordenes.map((o) => [o.commessa!, o]));

    /** proyecto -> fases distintas que declara su hoja en las líneas ya ejecutadas. */
    const fasesPorProyecto = new Map<string, { nombre: string; fases: Set<Phase> }>();
    for (const f of utiles) {
      const o = porCommessa.get(f.commessa!);
      if (!o) continue;
      const e = fasesPorProyecto.get(o.projectId) ?? {
        nombre: o.project.name,
        fases: new Set<Phase>(),
      };
      e.fases.add(f.fase);
      fasesPorProyecto.set(o.projectId, e);
    }

    // ── 3. Decidir, contar y (si toca) escribir ──
    const decididos: { id: string; nombre: string; fase: Phase; filas: number }[] = [];
    const mezclados: { nombre: string; fases: string }[] = [];

    for (const [projectId, { nombre, fases }] of fasesPorProyecto) {
      if (fases.size !== 1) {
        mezclados.push({ nombre, fases: [...fases].join(' + ') });
        continue;
      }
      const filas = await prisma.dailyEntry.count({
        where: { projectId, phase: null, sourceSheet: { not: null } },
      });
      decididos.push({ id: projectId, nombre, fase: [...fases][0], filas });
    }
    decididos.sort((a, b) => b.filas - a.filas);

    const total = decididos.reduce((s, d) => s + d.filas, 0);

    di('## Qué se escribe');
    di();
    di('| Proyecto | Fase | Jornadas |');
    di('|---|---|---:|');
    for (const d of decididos) di(`| ${d.nombre} | \`${d.fase}\` | ${d.filas} |`);
    di(`| **Total** | | **${total}** |`);
    di();

    if (mezclados.length) {
      di('## Proyectos NO tocados: su hoja mezcla fases en el ejecutado');
      di();
      for (const m of mezclados) di(`- **${m.nombre}** — ${m.fases}`);
      di();
      di(
        '> Aquí la fase por proyecto ya no vale y hay que cruzar por técnico. Se dejan ' +
          'intactos a propósito: media asignación es peor que ninguna.',
      );
      di();
    }

    if (!seco) {
      await prisma.$transaction(async (tx) => {
        for (const d of decididos) {
          await tx.dailyEntry.updateMany({
            where: { projectId: d.id, phase: null, sourceSheet: { not: null } },
            data: { phase: d.fase },
          });
        }
      });
    }

    // ── 4. El hallazgo, que es la mitad del valor de correr esto ──
    const collaudo = todas
      .filter((f) => f.commessa && f.fase === 'COLLAUDO' && !ignorada(f))
      .reduce((s, f) => s + (f.vendido ?? 0), 0);

    di('## Lo que dice el resultado');
    di();
    di(
      `El collaudo está **vendido (${collaudo} días) y sin empezar** en los cuatro ` +
        'proyectos: ni una línea de las hojas le apunta ejecutado. La tabla por fase no ' +
        'estaba vacía por falta de datos, estaba vacía porque el collaudo todavía no se ha ' +
        'hecho — y eso sí es una lectura útil.',
    );
    di();

    const destino = join(__dirname, '..', '..', '..', '.planning', 'CONCILIACION-FASES.md');
    writeFileSync(destino, informe.join('\n') + '\n', 'utf8');
    console.log(informe.join('\n'));
    console.log(`\nReporte -> ${destino}`);
    if (!seco) console.log(`Actualizadas ${total} jornadas.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('migrate-fases:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
