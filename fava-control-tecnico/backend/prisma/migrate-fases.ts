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

/**
 * Donde la hoja de proyecto pierde contra la bitacora, con la evidencia al lado.
 *
 * La hoja es una CONCILIACION que alguien cuadra a mano; la bitacora es el registro
 * dia a dia. Cuando se contradicen gana el registro, pero solo con la contradiccion
 * escrita aqui y verificable — nunca por regla automatica.
 */
const CORRECCIONES: { proyecto: string; rol: string; fase: Phase; motivo: string }[] = [
  {
    proyecto: 'MOLINO CIBAO BOCEL - RD',
    rol: 'Software',
    fase: 'COLLAUDO',
    motivo:
      'La hoja apunta los 77 dias de Ivan Cortes en MONTAJE/`Elettricista`, pero la ' +
      'bitacora los registra con `Tipo = Software` los 77, del 2026-06-15 al 2026-08-30, ' +
      'sin una sola excepcion. `sofware` y `softwerista` solo existen bajo COLLAUDO en ' +
      'todo el libro, y la hoja TIENE su fila `COLLAUDO/Sofware/Ivan Cortes` vacia con ' +
      '35 dias vendidos. La otra plaza de `Elettricista` si cuadra: Andrea Scapin, 16 ' +
      'dias, y la bitacora lo confirma. En contra: 77 sobre 35 vendidos es pasarse el ' +
      'doble, y eso explica por que alguien cuadrando la hoja los parco donde caben ' +
      '(montaje vende 104) — pero explica el cuadre, no lo que se hizo. Pasarse es un ' +
      'dato que el tablero debe ENSEÑAR, no absorber.',
  },
];

const clave = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Dos nombres se «parecen» si comparten prefijo largo o difieren en una letra.
 *
 * COPIADA de `migrate-vendido.ts` en vez de importada, y no por pereza: aquel modulo
 * llama a su `main()` en el ultimo renglon, asi que un `import` desde aqui CORRERIA la
 * migracion del vendido como efecto de leer una funcion. Doce lineas duplicadas salen
 * mas baratas que ese fuego.
 */
function pareceA(a: string, b: string): boolean {
  const [x, y] = [clave(a), clave(b)];
  if (x === y) return true;
  const corto = Math.min(x.length, y.length);
  if (corto >= 5 && (x.startsWith(y.slice(0, 5)) || y.startsWith(x.slice(0, 5)))) return true;
  if (Math.abs(x.length - y.length) > 1) return false;
  let dif = 0;
  for (let i = 0, j = 0; i < x.length || j < y.length; i++, j++) {
    if (x[i] === y[j]) continue;
    if (++dif > 1) return false;
    if (x.length > y.length) j--;
    else if (y.length > x.length) i--;
  }
  return dif === 1;
}

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
    const decididos: {
      id: string;
      nombre: string;
      fase: Phase;
      /** Jornadas del Excel en ese proyecto. No cambia entre pasadas. */
      delExcel: number;
      /** Las que esta pasada escribe. En la segunda ejecucion es 0, y debe serlo. */
      pendientes: number;
    }[] = [];
    const mezclados: { nombre: string; fases: string }[] = [];

    for (const [projectId, { nombre, fases }] of fasesPorProyecto) {
      if (fases.size !== 1) {
        mezclados.push({ nombre, fases: [...fases].join(' + ') });
        continue;
      }
      const donde = { projectId, sourceSheet: { not: null } };
      const [delExcel, pendientes] = await Promise.all([
        prisma.dailyEntry.count({ where: donde }),
        prisma.dailyEntry.count({ where: { ...donde, phase: null } }),
      ]);
      decididos.push({ id: projectId, nombre, fase: [...fases][0], delExcel, pendientes });
    }
    decididos.sort((a, b) => b.delExcel - a.delExcel);

    const total = decididos.reduce((s, d) => s + d.pendientes, 0);

    di('## Qué se escribe');
    di();
    di('| Proyecto | Fase | Jornadas del Excel | Sin fase (se escriben) |');
    di('|---|---|---:|---:|');
    for (const d of decididos) {
      di(`| ${d.nombre} | \`${d.fase}\` | ${d.delExcel} | ${d.pendientes} |`);
    }
    di(`| **Total** | | | **${total}** |`);
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

    // ── 3b. Donde el rol de la bitácora contradice a la hoja ──
    //
    // Esta seccion existe porque la regla por proyecto YA se equivoco una vez y en
    // silencio: en Cibao, Andrea apunto los 77 dias de Ivan Cortes en la linea de
    // MONTAJE/`Elettricista`, pero la bitacora registra esos mismos dias con el `Tipo`
    // = `Software`, y `Sofware` solo aparece bajo COLLAUDO en todo el libro. La hoja
    // dice montaje y el registro diario dice software: es una contradiccion real, no la
    // resuelve un script, y enterrarla habria dejado un tablero que miente con
    // seguridad. Aqui sale nombrada para que una persona la decida.
    const fasesDeRol = new Map<string, Set<Phase>>();
    for (const f of todas) {
      if (!f.rol?.trim() || ignorada(f)) continue;
      const s = fasesDeRol.get(clave(f.rol)) ?? new Set<Phase>();
      s.add(f.fase);
      fasesDeRol.set(clave(f.rol), s);
    }

    /**
     * Agrupado por (proyecto, rol de la bitácora): un mismo rol puede parecerse a
     * VARIOS de la hoja —`Software` casa con `sofware` y con `softwerista`, y las dos
     * son de collaudo— y repetir la fila tres veces no añade nada. Se listan juntos.
     */
    const dudosos = new Map<
      string,
      { proyecto: string; rol: string; hojas: Set<string>; fases: Set<Phase>; puesta: Phase; dias: number }
    >();
    for (const d of decididos) {
      const roles = await prisma.$queryRaw<{ rol: string; n: bigint }[]>`
        SELECT rt.name AS rol, COUNT(*) AS n
          FROM daily_entries de
          JOIN role_types rt ON rt.id = de.role_type_id
         WHERE de.project_id = ${d.id}::uuid AND de.source_sheet IS NOT NULL
         GROUP BY rt.name`;
      for (const r of roles) {
        for (const [rolHoja, fases] of fasesDeRol) {
          // Solo canta si el rol se parece a uno de la hoja Y ese rol NUNCA aparece en
          // la fase que le acabamos de poner. `Meccanico` vive en las dos fases, asi
          // que no dice nada y no ensucia el informe.
          // Lo que ya arregla una CORRECCION no es una duda abierta: no se repite aquí.
          const corregido = CORRECCIONES.some(
            (x) => x.proyecto === d.nombre && clave(x.rol) === clave(r.rol),
          );
          if (corregido || !pareceA(r.rol, rolHoja) || fases.has(d.fase)) continue;
          const k = `${d.id}|${r.rol}`;
          const e = dudosos.get(k) ?? {
            proyecto: d.nombre,
            rol: r.rol,
            hojas: new Set<string>(),
            fases: new Set<Phase>(),
            puesta: d.fase,
            dias: Number(r.n),
          };
          e.hojas.add(rolHoja);
          for (const f of fases) e.fases.add(f);
          dudosos.set(k, e);
        }
      }
    }

    if (dudosos.size) {
      di('## Revisar: el rol de la bitácora no cuadra con la fase asignada');
      di();
      di('| Proyecto | Rol en la bitácora | Rol(es) en la hoja | Solo aparecen en | Se le puso | Días |');
      di('|---|---|---|---|---|---:|');
      for (const x of dudosos.values()) {
        const hojas = [...x.hojas].map((h) => `\`${h}\``).join(', ');
        di(
          `| ${x.proyecto} | \`${x.rol}\` | ${hojas} | ${[...x.fases].join(', ')} | \`${x.puesta}\` | ${x.dias} |`,
        );
      }
      di();
      di(
        '> No se cambia nada por esto: la hoja de proyecto es hoy el registro de FAVA y ' +
          'es la que manda. Pero la contradicción es real y quien lea el tablero tiene ' +
          'derecho a saber que esos días penden de un hilo.',
      );
      di();
    }

    // ── 3c. Las correcciones, que PISAN la fase del proyecto ──
    const porNombre = new Map([...fasesPorProyecto].map(([id, v]) => [v.nombre, id]));
    const correcciones: { texto: string; projectId: string; rol: string; fase: Phase; dias: number }[] =
      [];
    for (const x of CORRECCIONES) {
      const projectId = porNombre.get(x.proyecto);
      if (!projectId) {
        di(`> ⚠️ La corrección de **${x.proyecto}** no encuentra el proyecto. Revísala.`);
        di();
        continue;
      }
      const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n
          FROM daily_entries de
          JOIN role_types rt ON rt.id = de.role_type_id
         WHERE de.project_id = ${projectId}::uuid
           AND de.source_sheet IS NOT NULL
           AND lower(rt.name) = ${clave(x.rol)}`;
      correcciones.push({
        texto: `**${x.proyecto}** · \`${x.rol}\` → \`${x.fase}\` — ${x.motivo}`,
        projectId,
        rol: clave(x.rol),
        fase: x.fase,
        dias: Number(n),
      });
    }

    if (correcciones.length) {
      di('## Correcciones: la bitácora gana a la hoja');
      di();
      for (const c of correcciones) di(`- ${c.texto} _(${c.dias} jornadas)_`);
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
        // DESPUES y sin filtrar por `phase: null`: una corrección pisa a propósito lo
        // que la regla del proyecto acaba de poner, y tiene que valer también en una
        // segunda pasada, cuando ya no queda nada nulo que escribir.
        for (const c of correcciones) {
          await tx.$executeRaw`
            UPDATE daily_entries de
               SET phase = ${c.fase}::phase
              FROM role_types rt
             WHERE rt.id = de.role_type_id
               AND de.project_id = ${c.projectId}::uuid
               AND de.source_sheet IS NOT NULL
               AND lower(rt.name) = ${c.rol}`;
        }
      });
    }

    // ── 4. El hallazgo, que es la mitad del valor de correr esto ──
    //
    // Se cuenta contra la BASE y no contra el NDJSON. Con la cuenta sacada de las hojas
    // este párrafo afirmaba «el collaudo está sin empezar» inmediatamente después de
    // haber movido 77 jornadas a COLLAUDO: un informe que se contradice a sí mismo tres
    // renglones más abajo no lo lee nadie dos veces.
    const vendido = todas
      .filter((f) => f.commessa && f.fase === 'COLLAUDO' && !ignorada(f))
      .reduce((s, f) => s + (f.vendido ?? 0), 0);
    const ejecutado = await prisma.dailyEntry.count({
      where: {
        phase: 'COLLAUDO',
        sourceSheet: { not: null },
        projectId: { in: decididos.map((d) => d.id) },
      },
    });

    di('## Lo que dice el resultado');
    di();
    di(
      `Collaudo: **${vendido} días vendidos, ${ejecutado} ejecutados**. La tabla por fase ` +
        'no estaba vacía por falta de datos — estaba vacía porque la fase no se registraba ' +
        'en ningún sitio, y una vez puesta lo que enseña es que el collaudo apenas ha ' +
        'empezado. Eso sí es una lectura útil.',
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
