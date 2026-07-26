/**
 * Semilla dia 1: la cuenta del dev entra como Super Admin con los tres roles,
 * para conservar el switcher T/A/S completo.
 *
 * entraOid queda null a proposito: el primer login real cuyo email coincida se
 * vincula y fija el OID como identidad definitiva.
 *
 * Corre como OWNER (prisma.config.ts -> MIGRATE_DATABASE_URL): sembrar es tarea
 * de migracion, no de runtime.
 *
 * Ademas siembra los catalogos de ARRANQUE que son ABM del usuario (roles tecnicos,
 * monedas, modelos de maquina), tomados de los mocks que la Fase 2 retira, para que
 * la app no arranque con listas vacias. Los 8 CONCEPTOS no estan aqui a proposito:
 * son estructura y los siembra la migracion 20260726123024_rls_maestros.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/config/env';

/** Las 4 especialidades del prototipo. El ABM del Super Admin anade el resto. */
const ROLES_TECNICOS = ['Mecánico', 'Meccatronico', 'Eléctrico', 'Software'];

/** Codigo ISO-4217 + simbolo, de frontend/src/data.ts (CURRENCIES). */
const MONEDAS: [string, string][] = [
  ['USD', '$'],
  ['EUR', '€'],
  ['CLP', '$'],
  ['ARS', '$'],
  ['DOP', 'RD$'],
];

/** Los 3 modelos del mock. La descripcion (la que imprime «Maquinaria:») la pone FAVA. */
const MAQUINAS = ['CTA1000', 'PC4500', 'PL6000'];

async function main() {
  const email = env.SEED_SUPERADMIN_EMAIL.trim().toLowerCase();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL }),
  });

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { roles: ['T', 'A', 'S'], isActive: true },
      create: {
        email,
        displayName: email.split('@')[0],
        roles: ['T', 'A', 'S'],
        isActive: true,
      },
    });
    console.log(`seed OK — ${user.email} es Super Admin (roles ${user.roles.join('+')})`);

    // Upsert por la clave NATURAL de cada catalogo (name / code): re-sembrar no duplica
    // y tampoco pisa lo que el Super Admin haya editado o desactivado despues.
    for (const name of ROLES_TECNICOS) {
      await prisma.roleType.upsert({ where: { name }, update: {}, create: { name } });
    }
    for (const [code, symbol] of MONEDAS) {
      await prisma.currency.upsert({ where: { code }, update: {}, create: { code, symbol } });
    }
    for (const code of MAQUINAS) {
      await prisma.machineModel.upsert({ where: { code }, update: {}, create: { code } });
    }
    console.log(
      `seed OK — catalogos de arranque: ${ROLES_TECNICOS.length} roles, ` +
        `${MONEDAS.length} monedas, ${MAQUINAS.length} modelos de maquina ` +
        `(los 8 conceptos los siembra la migracion)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed FALLO:', e instanceof Error ? e.message : e);
  process.exit(1);
});
