/**
 * Dos clientes contra la misma base, uno por cada rol de Postgres.
 *
 * `appClient` es el que importa: conecta como fava_app (NOBYPASSRLS, no dueno),
 * que es el unico rol con el que un test de RLS demuestra algo. Con el owner las
 * politicas quedan escritas y sin efecto, y el test pasa por el motivo equivocado.
 *
 * Requiere `docker compose up -d db` (o el cluster local) y `db:bootstrap` corrido.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { env } from '../../src/config/env';

/**
 * Tecnicos de prueba con UUID fijo. Desde la Fase 2 `daily_entries.technician_id`
 * y `weekly_notes.technician_id` tienen FK real a `technicians`, asi que estos dos
 * UUID YA NO pueden ser literales sueltos: `truncateAll()` los repone como filas.
 */
export const TEC_A = '11111111-1111-4111-8111-111111111111';
export const TEC_B = '22222222-2222-4222-8222-222222222222';

/** Catalogo minimo que necesita cualquier suite. Nunca se truncan (ver TABLAS_TX). */
export const ROL_TEST = '33333333-3333-4333-8333-333333333333';
export const CUR_TEST = 'TST';
export const MAQ_TEST = '44444444-4444-4444-8444-444444444444';

/**
 * EL SEGURO. `truncateAll()` hace TRUNCATE de projects, technicians, users y las
 * jornadas: contra la base equivocada no es un test que falla, es la produccion
 * borrada. Y la base equivocada es facil de tener — un `.env` apuntado al proxy
 * publico de Railway para revisar algo en local deja la trampa armada y en silencio.
 *
 * Solo se admite un host local. No hay variable para saltarselo a proposito: si algun
 * dia hace falta correr los e2e contra un servidor remoto, que quien lo necesite venga
 * a borrar estas lineas y vea lo que esta desactivando.
 */
for (const [nombre, url] of [
  ['MIGRATE_DATABASE_URL', env.MIGRATE_DATABASE_URL],
  ['DATABASE_URL', env.DATABASE_URL],
]) {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', 'db', 'postgres'].includes(host)) {
    throw new Error(
      `Los e2e TRUNCAN la base y ${nombre} apunta a ${host}, que no es local. ` +
        'Levanta el Postgres de docker-compose y apunta el .env ahi antes de correrlos.',
    );
  }
}

/** Owner: DDL, siembra de fixtures y limpieza. Salta RLS a proposito. */
export const ownerClient = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL }),
});

/** Runtime: el rol real de la app. Sujeto a las politicas RLS. */
export const appClient = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/**
 * Transaccionales: se truncan entre tests. El orden no importa (CASCADE), pero la
 * lista si: una tabla nueva que falte aqui filtra estado de una suite a la siguiente
 * y produce fallos que dependen del orden de ejecucion.
 */
const TABLAS_TX = [
  // Cae por CASCADE de daily_entries, pero va nombrada: esta lista se lee para saber
  // que se limpia, y una tabla que solo desaparece por efecto colateral no se ve.
  'daily_entry_orders',
  'daily_entries',
  'weekly_notes',
  'audit_log',
  'notifications',
  'order_sold_days',
  'orders',
  'projects',
  'technicians',
  'access_requests',
  'users',
] as const;

/**
 * Catalogos: NUNCA se truncan. Los conceptos los siembran las migraciones (son
 * estructura, no datos de ejemplo) y un `TRUNCATE ... CASCADE` sobre `concepts`
 * se los llevaria por delante dejando la base en un estado que ninguna migracion
 * repone. Listados aqui para que quede escrito por que NO estan en TABLAS_TX.
 */
export const CATALOGOS = ['concepts', 'role_types', 'currencies', 'machine_models'] as const;

/**
 * Catalogo minimo e idempotente: un rol, una moneda y un modelo de maquina con
 * identificadores fijos. Se puede llamar cuantas veces se quiera.
 */
export async function seedCatalogos(): Promise<void> {
  await ownerClient.roleType.upsert({
    where: { id: ROL_TEST },
    update: {},
    create: { id: ROL_TEST, name: 'Rol de prueba' },
  });
  await ownerClient.currency.upsert({
    where: { code: CUR_TEST },
    update: {},
    create: { code: CUR_TEST, symbol: '¤' },
  });
  await ownerClient.machineModel.upsert({
    where: { id: MAQ_TEST },
    update: {},
    create: { id: MAQ_TEST, code: 'TEST-MAQ', description: 'Modelo de prueba' },
  });
}

/**
 * Deja la base en un BASELINE conocido: tablas transaccionales vacias, catalogos
 * garantizados y TEC_A/TEC_B existiendo como filas reales de `technicians`.
 *
 * ponytail: conserva el nombre y la firma de la Fase 1 a proposito. Las suites
 * `bootstrap`, `rls-isolation` y `rls-transaction` la llaman en beforeEach para
 * decir «parte de cero»; su intencion no cambia porque ahora existan FKs, asi que
 * cambia el helper y no las tres suites.
 *
 * Se ejecuta como owner porque TRUNCATE es DDL. OJO: se lleva por delante al Super
 * Admin del seed; tras correr la suite, `npm -w backend run db:seed` lo repone.
 */
export async function truncateAll(): Promise<void> {
  const lista = TABLAS_TX.map((t) => `"public"."${t}"`).join(', ');
  await ownerClient.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);

  await seedCatalogos();
  await ownerClient.technician.createMany({
    data: [
      { id: TEC_A, fullName: 'Tecnico A', roleTypeId: ROL_TEST, employmentType: 'INTERNO' },
      { id: TEC_B, fullName: 'Tecnico B', roleTypeId: ROL_TEST, employmentType: 'EXTERNO' },
    ],
  });
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([ownerClient.$disconnect(), appClient.$disconnect()]);
}
