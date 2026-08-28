/**
 * MIG-02 — la matriz de dias VENDIDOS del Excel entra en `order_sold_days`.
 *
 *     npm -w backend run migrate:vendido            # aplica
 *     npm -w backend run migrate:vendido -- --dry   # solo el reporte, no escribe
 *
 * Es la mitad que faltaba. `migrate-excel.ts` trajo el EJECUTADO (la bitacora); sin el
 * VENDIDO no hay delta, y el delta es el numero con el que Andrea se sienta a hablar
 * con Luca. Tambien es lo que desbloquea KPI-01 y KPI-08, hoy en mock.
 *
 * EN UNA TRANSACCION, y no es adorno. `migrate-excel.ts` borra y reinserta SIN
 * transaccion: un fallo a mitad deja el historico a medio borrar, y paso de verdad
 * (2026-08-28, quedo en 3.019 jornadas de 6.592). Aqui el borrado y la insercion van
 * juntos o no van.
 *
 * POR QUE (orden, rol, fase, ordinal) Y NO (orden, rol, fase). Un bloque de montaje
 * trae DOS renglones `Meccanico` y DOS `Elettricista`: son PLAZAS distintas del mismo
 * rol, y el vendido va solo en el primero. Con la clave sin `ordinal` la segunda plaza
 * no seria representable. Documentado en HALLAZGOS-EXCEL-COMPLETO § 4.4.
 *
 * NO INVENTA ROLES. Los nombres entran literales del Excel — `Sofware` con su errata
 * incluida — y el reporte lista los que se parecen a uno que ya existe, para que una
 * persona los fusione desde la pantalla de Configuracion. Es la misma REGLA 2 de
 * `migrate-excel.ts`: `Elettricista` y `Electtricista` puede que sean lo mismo y puede
 * que no, y eso no lo decide un script.
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
  /** `null` = esta linea no vende; es la segunda plaza de un rol ya vendido. */
  vendido: number | null;
  ejecutado: number | null;
  ordinal: number;
}

/** Dedupe de catalogos SOLO por mayusculas y espacios, igual que en migrate-excel. */
const clave = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Dos nombres se «parecen» si comparten el prefijo largo o difieren en una letra. */
function pareceA(a: string, b: string): boolean {
  const [x, y] = [clave(a), clave(b)];
  if (x === y) return false;
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
    const filas: FilaVendido[] = readFileSync(ruta, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    di('# Conciliación del vendido (MIG-02)');
    di();
    di(`Líneas en el NDJSON: **${filas.length}**${seco ? ' _(simulación: no se escribe)_' : ''}`);
    di();

    // ── 1. Lo que no se puede cargar, y por qué ──
    const sinCommessa = filas.filter((f) => !f.commessa);
    const sinVendido = filas.filter((f) => f.commessa && f.vendido === null);
    const cargables = filas.filter((f) => f.commessa && f.vendido !== null);

    di('## Qué entra y qué no');
    di();
    di('| | Líneas | Por qué |');
    di('|---|---:|---|');
    di(`| Entran | ${cargables.length} | tienen commessa y cifra de vendido |`);
    di(
      `| Sin cifra de vendido | ${sinVendido.length} | son la segunda plaza de un rol ya vendido: ejecutan, no venden |`,
    );
    di(
      `| Sin commessa | ${sinCommessa.length} | la hoja \`J Macedo Brasil- final\` no declara ninguna, y \`order_sold_days\` cuelga de una ORDEN |`,
    );
    di();
    if (sinCommessa.length) {
      di(
        '> **JMACEDO se queda fuera y es una decisión pendiente.** El proyecto existe en la ' +
          'base con 1.050 jornadas, pero no tiene ninguna orden porque su hoja no trae ' +
          '`COMMESSA`. Sus ' +
          `${sinCommessa.length} líneas de vendido (${sinCommessa.reduce((s, f) => s + (f.vendido ?? 0), 0)} días) ` +
          'no se pueden colgar de nada hasta que alguien cree la orden. No se inventa aquí.',
      );
      di();
    }

    // ── 2. Los roles: se crean literales y se avisa de los parecidos ──
    const existentes = await prisma.roleType.findMany({ select: { id: true, name: true } });
    const porClave = new Map(existentes.map((r) => [clave(r.name), r]));
    const nuevos = [...new Set(cargables.map((f) => f.rol))].filter((n) => !porClave.has(clave(n)));

    di('## Roles del bloque de vendido');
    di();
    if (nuevos.length) {
      di(`Se crean **${nuevos.length}** que no estaban en el catálogo, con el nombre literal:`);
      di();
      for (const n of nuevos) di(`- \`${n}\``);
      di();
    } else {
      di('Todos existían ya en el catálogo.');
      di();
    }

    const parecidos = nuevos
      .map((n) => [n, existentes.filter((e) => pareceA(n, e.name)).map((e) => e.name)] as const)
      .filter(([, p]) => p.length);
    if (parecidos.length) {
      di('### Parecidos que NO se fusionan');
      di();
      di(
        'Se dejan separados a propósito: que `Elettricista` y `Electtricista` sean el mismo ' +
          'cargo es una decisión de negocio, no de código. Se resuelve desde Configuración.',
      );
      di();
      for (const [n, p] of parecidos) di(`- \`${n}\` ↔ ${p.map((x) => `\`${x}\``).join(', ')}`);
      di();
    }

    if (!seco && nuevos.length) {
      await prisma.roleType.createMany({ data: nuevos.map((name) => ({ name })) });
      for (const r of await prisma.roleType.findMany({ select: { id: true, name: true } }))
        porClave.set(clave(r.name), r);
    }

    // ── 3. Las órdenes ──
    const ordenes = await prisma.order.findMany({ select: { id: true, commessa: true } });
    const porCommessa = new Map(ordenes.filter((o) => o.commessa).map((o) => [o.commessa!, o]));
    const huerfanas = [...new Set(cargables.map((f) => f.commessa!))].filter(
      (c) => !porCommessa.has(c),
    );
    if (huerfanas.length) {
      di('### Commesse del Excel que no tienen orden en la base');
      di();
      for (const c of huerfanas) di(`- \`${c}\``);
      di();
    }

    const aCargar = cargables.filter((f) => porCommessa.has(f.commessa!));

    // ── 4. Escribir, todo o nada ──
    if (!seco) {
      const ids = [...new Set(aCargar.map((f) => porCommessa.get(f.commessa!)!.id))];
      await prisma.$transaction(async (tx) => {
        // Borrado ACOTADO a las órdenes que se recargan: lo de otras órdenes (y lo del
        // proyecto de demostración) no se toca.
        await tx.orderSoldDays.deleteMany({ where: { orderId: { in: ids } } });
        await tx.orderSoldDays.createMany({
          data: aCargar.map((f) => ({
            orderId: porCommessa.get(f.commessa!)!.id,
            roleTypeId: porClave.get(clave(f.rol))!.id,
            phase: f.fase,
            ordinal: f.ordinal,
            // El literal del Excel, que es lo que Andrea reconoce al mirarlo. Incluye
            // el nombre del técnico cuando la línea lo trae.
            lineLabel: f.tecnico ? `${f.rol} — ${f.tecnico}` : f.rol,
            soldDays: f.vendido!,
          })),
        });
      });
    }

    // ── 5. El número que justifica todo esto: vendido contra ejecutado ──
    di('## Vendido contra ejecutado, por orden');
    di();
    di('| Orden | Vendido | Ejecutado | Delta |');
    di('|---|---:|---:|---:|');
    for (const commessa of [...new Set(aCargar.map((f) => f.commessa!))].sort()) {
      const orden = porCommessa.get(commessa)!;
      const vendido = aCargar
        .filter((f) => f.commessa === commessa)
        .reduce((s, f) => s + (f.vendido ?? 0), 0);
      const ejecutado = await prisma.dailyEntry.count({ where: { orderId: orden.id } });
      di(`| \`${commessa}\` | ${vendido} | ${ejecutado} | ${vendido - ejecutado} |`);
    }
    di();
    di(
      '> El **ejecutado** de esta tabla sale de `daily_entries.order_id`, y hoy casi ninguna ' +
        'jornada lo tiene: el Excel no registra la máquina en la hoja diaria. Hasta que se ' +
        'capture, el ejecutado por orden va a salir muy por debajo del real. El ejecutado ' +
        'por PROYECTO sí es correcto y es el que muestra la cuadrícula.',
    );
    di();

    const destino = join(__dirname, '..', '..', '..', '.planning', 'CONCILIACION-VENDIDO.md');
    writeFileSync(destino, informe.join('\n') + '\n', 'utf8');
    console.log(informe.join('\n'));
    console.log(`\nReporte -> ${destino}`);
    if (!seco) console.log(`Cargadas ${aCargar.length} líneas de días vendidos.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('migrate-vendido:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
