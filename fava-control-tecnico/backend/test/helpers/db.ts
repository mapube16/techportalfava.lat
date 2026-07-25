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

/** Tecnicos de prueba con UUID fijo: 01-02 (RLS) y 01-03 (auth) siembran sobre estos. */
export const TEC_A = '11111111-1111-4111-8111-111111111111';
export const TEC_B = '22222222-2222-4222-8222-222222222222';

/** Owner: DDL, siembra de fixtures y limpieza. Salta RLS a proposito. */
export const ownerClient = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL }),
});

/** Runtime: el rol real de la app. Sujeto a las politicas RLS. */
export const appClient = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const TABLAS = ['daily_entries', 'weekly_notes', 'access_requests', 'users'] as const;

/**
 * Limpia las 4 tablas de la fase. Se ejecuta como owner porque TRUNCATE es DDL.
 * OJO: se lleva por delante al Super Admin del seed; tras correr la suite,
 * `npm -w backend run db:seed` lo repone.
 */
export async function truncateAll(): Promise<void> {
  const lista = TABLAS.map((t) => `"public"."${t}"`).join(', ');
  await ownerClient.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([ownerClient.$disconnect(), appClient.$disconnect()]);
}
