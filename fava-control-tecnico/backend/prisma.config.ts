import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Hogar de la configuracion del CLI en Prisma 7.
 *
 * La URL que usan `migrate` / `db seed` / `db pull` es la del OWNER: crear tablas
 * y politicas es DDL, y el rol de runtime (fava_app) no puede ni debe hacerlo.
 * El cliente de la app no lee de aqui: su conexion la fija el adapter PrismaPg.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('MIGRATE_DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
