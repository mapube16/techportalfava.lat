/**
 * Crea y reconfigura el rol de runtime `fava_app`. Idempotente: correrlo N veces
 * deja el mismo estado.
 *
 * CORRER ANTES DEL PRIMER `prisma migrate dev`. Los roles son del cluster, no de
 * la base: con el bootstrap hecho una vez, la shadow database que crea `migrate dev`
 * ya ve `fava_app` y los GRANT de las migraciones no fallan.
 *
 * Aqui vive el ROL. Las politicas RLS y el FORCE viven en migraciones SQL
 * versionadas (Plan 01-02): un CREATE ROLE dentro de una migracion revienta la
 * segunda vez que corre.
 *
 *   npm -w backend run db:bootstrap
 */
import { Client } from 'pg';
import { env } from '../src/config/env';

const CREAR_ROL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fava_app') THEN
    CREATE ROLE fava_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;`;

// El password llega como bind parameter y se lee desde una GUC de sesion:
// ALTER ROLE no admite parametros, y formatear el literal en JS lo dejaria en
// el texto de la query visible en pg_stat_activity.
const FIJAR_PASSWORD = `
DO $$ BEGIN
  EXECUTE format('ALTER ROLE fava_app WITH PASSWORD %L', current_setting('fava.app_pw'));
END $$;`;

const CONCEDER = `
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO fava_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO fava_app;

-- Cubre solo las tablas que existen ahora mismo.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO fava_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO fava_app;

-- La linea que salva el deploy siguiente: sin esto, cada tabla que cree una
-- migracion futura es invisible para fava_app y la app falla con
-- "permission denied for table X" justo despues de un migrate deploy exitoso.
-- Aplica a lo que cree el rol que ejecuta este script, que es el mismo que migra.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fava_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fava_app;`;

async function main() {
  const client = new Client({ connectionString: env.MIGRATE_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(CREAR_ROL);
    await client.query('SELECT set_config($1, $2, false)', ['fava.app_pw', env.APP_DB_PASSWORD]);
    await client.query(FIJAR_PASSWORD);
    await client.query(CONCEDER);
    await client.query('COMMIT');

    const { rows } = await client.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'fava_app'`,
    );
    if (rows.length !== 1) throw new Error('fava_app no existe despues del bootstrap');
    if (rows[0].rolbypassrls || rows[0].rolsuper) {
      throw new Error(
        `fava_app puede saltarse RLS (rolbypassrls=${rows[0].rolbypassrls}, rolsuper=${rows[0].rolsuper}). ` +
          'Con este rol las politicas quedarian escritas y sin efecto.',
      );
    }
    console.log('db-bootstrap OK — fava_app listo (NOBYPASSRLS, NOSUPERUSER)');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('db-bootstrap FALLO:', e instanceof Error ? e.message : e);
  process.exit(1);
});
